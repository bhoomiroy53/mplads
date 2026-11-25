import json
import uuid
from collections import defaultdict
from datetime import date
from difflib import SequenceMatcher

import numpy as np
from sklearn.cluster import KMeans
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import RobustScaler
from threadpoolctl import threadpool_limits

from .security import now

MODEL_VERSION = "IF-KM-Rules 1.0"


def analyze(c, actor="System"):
    rows = [dict(r) for r in c.execute("SELECT * FROM projects ORDER BY id")]
    if not rows:
        return {"project_count": 0, "flagged_count": 0, "model_version": MODEL_VERSION}
    today = date.today()
    features, delays = [], []
    for p in rows:
        days = (
            max(0, (today - date.fromisoformat(p["due_date"])).days)
            if p["progress"] < 100
            else 0
        )
        delays.append(days)
        features.append(
            [
                np.log1p(p["sanctioned"]),
                p["expenditure"] / p["sanctioned"],
                p["progress"] / 100,
                min(days, 730) / 365,
                p["expenditure"] / p["sanctioned"] - p["progress"] / 100,
            ]
        )
    x = RobustScaler().fit_transform(features)
    raw, outliers, distances = (
        np.zeros(len(rows)),
        np.zeros(len(rows), dtype=bool),
        np.zeros(len(rows)),
    )
    if len(rows) >= 10:
        with threadpool_limits(limits=1):
            model = IsolationForest(
                n_estimators=150, contamination=0.12, random_state=42, n_jobs=1
            )
            model.fit(x)
            raw = -model.decision_function(x)
            outliers = model.predict(x) == -1
            cluster = KMeans(
                n_clusters=min(4, max(2, len(rows) // 15)), random_state=42, n_init=10
            ).fit(x)
            distances = np.linalg.norm(
                x - cluster.cluster_centers_[cluster.labels_], axis=1
            )
    distance_cutoff = max(float(np.quantile(distances, 0.95)), 0.01)
    works_by_location = defaultdict(list)
    costs_by_sector = defaultdict(list)
    for project in rows:
        location_key = (
            project["state"].casefold(),
            project["district"].casefold(),
            project["location"].casefold(),
        )
        works_by_location[location_key].append(project)
        costs_by_sector[project["sector"]].append(project["sanctioned"])
    sector_baselines = {}
    for sector, costs in costs_by_sector.items():
        if len(costs) >= 6:
            median = float(np.median(costs))
            deviation = float(np.median(np.abs(np.asarray(costs) - median)))
            sector_baselines[sector] = (median, deviation)
    flagged = 0
    for i, p in enumerate(rows):
        reasons = []

        def reason(kind, title, detail, points, reasons=reasons):
            reasons.append(
                {"kind": kind, "title": title, "detail": detail, "points": int(points)}
            )

        ratio = p["expenditure"] / p["sanctioned"]
        estimate = p.get("estimated_cost")
        if estimate and p["sanctioned"] > estimate * 1.2:
            difference = 100 * (p["sanctioned"] / estimate - 1)
            reason(
                "estimate",
                "Sanction exceeds estimate",
                f"Sanctioned cost is {difference:.1f}% above the original estimate.",
                12,
            )
        if ratio > 1.05:
            reason(
                "overrun",
                "Cost overrun",
                f"Expenditure is {(ratio - 1) * 100:.1f}% above the sanctioned amount.",
                min(35, 20 + (ratio - 1) * 50),
            )
        if delays[i] > 30:
            reason(
                "delay",
                "Completion delay",
                f"{delays[i]} days past the planned completion date at {p['progress']:g}% progress.",
                min(25, 10 + delays[i] / 10),
            )
        gap = ratio - p["progress"] / 100
        if gap > 0.25:
            reason(
                "mismatch",
                "Spend–progress mismatch",
                f"{ratio * 100:.1f}% of funds spent against {p['progress']:g}% physical completion.",
                min(30, gap * 45),
            )
        duplicates = []
        key = (
            p["state"].casefold(),
            p["district"].casefold(),
            p["location"].casefold(),
        )
        for other in works_by_location[key]:
            if other["id"] == p["id"]:
                continue
            similarity = SequenceMatcher(
                None, p["name"].casefold(), other["name"].casefold()
            ).ratio()
            if similarity > 0.82:
                duplicates.append(other["id"])
        if duplicates:
            reason(
                "duplicate",
                "Potential duplicate work",
                "Similar work at the same location: "
                + ", ".join(duplicates)
                + ". Verify distinct sanctions and assets.",
                30,
            )
        if p["sector"] in sector_baselines:
            median, mad = sector_baselines[p["sector"]]
            if mad > 0 and (p["sanctioned"] - median) / (1.4826 * mad) > 3:
                reason(
                    "cost",
                    "Unusual sanctioned cost",
                    "Sanctioned cost exceeds the sector median by more than 3 robust deviations; project sizes may differ.",
                    15,
                )
        if outliers[i]:
            reason(
                "model",
                "Isolation Forest outlier",
                "Unusual combination of budget, spending, progress and delay relative to this dataset.",
                min(20, 10 + float(raw[i]) * 100),
            )
        if distances[i] > distance_cutoff and len(rows) >= 10:
            reason(
                "cluster",
                "Unusual project profile",
                "Distance from the nearest project cluster is above the dataset's 95th percentile.",
                8,
            )
        score = min(99, sum(r["points"] for r in reasons))
        level = "High" if score >= 65 else "Medium" if score >= 35 else "Low"
        status = (
            "Completed"
            if p["progress"] == 100
            else ("Delayed" if delays[i] > 0 else "In progress")
        )
        c.execute(
            "UPDATE projects SET risk_score=?,risk_level=?,reasons=?,model_score=?,status=? WHERE id=?",
            (score, level, json.dumps(reasons), float(raw[i]), status, p["id"]),
        )
        if score >= 35:
            flagged += 1
            title = max(reasons, key=lambda r: r["points"])["title"]
            c.execute(
                """INSERT INTO alerts(id,project_id,title,severity,created_at,updated_at)
                VALUES(?,?,?,?,?,?) ON CONFLICT(project_id) DO UPDATE SET
                status=CASE WHEN alerts.active=0 OR (alerts.severity='Medium' AND excluded.severity='High')
                    THEN 'Open' ELSE alerts.status END,
                title=excluded.title,severity=excluded.severity,active=1,updated_at=excluded.updated_at""",
                ("ALT-" + p["id"], p["id"], title, level, now(), now()),
            )
        else:
            c.execute(
                "UPDATE alerts SET active=0,updated_at=? WHERE project_id=?",
                (now(), p["id"]),
            )
    result = {
        "id": str(uuid.uuid4()),
        "actor": actor,
        "project_count": len(rows),
        "flagged_count": flagged,
        "model_version": MODEL_VERSION,
        "created_at": now(),
    }
    c.execute(
        "INSERT INTO analysis_runs VALUES(:id,:actor,:project_count,:flagged_count,:model_version,:created_at)",
        result,
    )
    return result
