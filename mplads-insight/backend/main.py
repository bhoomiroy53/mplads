import csv
import io
import json
import os
import secrets
import sqlite3
import threading
import time
import uuid
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, File, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from .analysis import MODEL_VERSION, analyze
from .db import audit, db, init_db
from .security import (
    DEMO_MODE,
    check_scope,
    create_session,
    current_user,
    now,
    password_hash,
    require_editor,
    require_ministry,
    scope_sql,
    token_hash,
    verify_password,
)
from .seed import seed

ROOT = Path(__file__).resolve().parents[1]
write_lock = threading.RLock()
login_attempts = defaultdict(list)


@asynccontextmanager
async def lifespan(app):
    init_db()
    with db() as c:
        seed(c)
        last = c.execute(
            "SELECT created_at FROM analysis_runs ORDER BY created_at DESC LIMIT 1"
        ).fetchone()
        if not last or last["created_at"][:10] != date.today().isoformat():
            analyze(c)
    yield


app = FastAPI(
    title="MPLADS Insight API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
)


@app.middleware("http")
async def security_headers(request, call_next):
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        origin = request.headers.get("origin")
        if origin and origin.rstrip("/") != str(request.base_url).rstrip("/"):
            # Vite's local proxy retains its origin during development.
            allowed = os.getenv("DEV_ORIGIN", "")
            if origin != allowed:
                return Response("Cross-origin request rejected", status_code=403)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    )
    if request.url.path.startswith("/api"):
        response.headers["Cache-Control"] = "no-store"
    return response


class Login(BaseModel):
    email: str = Field(max_length=200)
    password: str = Field(max_length=200)


class DemoLogin(BaseModel):
    role: Literal["ministry", "state", "district", "mp"] = "ministry"


class ProjectIn(BaseModel):
    model_config = ConfigDict(
        extra="forbid", str_strip_whitespace=True, allow_inf_nan=False
    )
    name: str = Field(min_length=5, max_length=180)
    state: str = Field(min_length=2, max_length=80)
    district: str = Field(min_length=2, max_length=80)
    constituency: str = Field(min_length=2, max_length=80)
    sector: Literal[
        "Education",
        "Drinking water",
        "Roads & bridges",
        "Healthcare",
        "Community assets",
        "Sanitation",
    ]
    agency: str = Field(min_length=2, max_length=160)
    location: str = Field(min_length=2, max_length=180)
    sanctioned: float = Field(gt=0, le=1e11)
    expenditure: float = Field(default=0, ge=0, le=1e11)
    progress: float = Field(default=0, ge=0, le=100)
    start_date: date
    due_date: date
    fiscal_year: str = Field(pattern=r"^20\d{2}-\d{2}$")
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    estimated_cost: float | None = Field(default=None, gt=0, le=1e11)

    @model_validator(mode="after")
    def dates(self):
        if self.due_date < self.start_date:
            raise ValueError("Completion date must be on or after the start date.")
        if self.start_date > date.today():
            raise ValueError("Start date cannot be in the future.")
        if int(self.fiscal_year[-2:]) != (int(self.fiscal_year[:4]) + 1) % 100:
            raise ValueError("Financial year must span consecutive years.")
        return self


class ProgressUpdate(BaseModel):
    progress: float = Field(ge=0, le=100, allow_inf_nan=False)
    note: str = Field(min_length=5, max_length=1000)


class PaymentIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    reference: str = Field(min_length=3, max_length=100)
    amount: float = Field(gt=0, le=1e10, allow_inf_nan=False)
    paid_on: date
    payee: str = Field(min_length=2, max_length=160)
    note: str = Field(default="", max_length=500)


class AssetIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    asset_ref: str = Field(min_length=3, max_length=80)
    description: str = Field(min_length=5, max_length=200)
    custodian: str = Field(min_length=2, max_length=160)
    handover_date: date


class ReviewIn(BaseModel):
    status: Literal["Open", "In review", "Resolved", "Dismissed"]
    note: str = Field(min_length=10, max_length=2000)


class UserIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: str = Field(pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$", max_length=200)
    password: str = Field(min_length=12, max_length=200)
    role: Literal["ministry", "state", "district", "mp"]
    scope: str = Field(default="", max_length=100)

    @model_validator(mode="after")
    def scoped(self):
        if self.role != "ministry" and not self.scope.strip():
            raise ValueError("A state, district or constituency scope is required.")
        return self


def serial_project(row):
    p = dict(row)
    p["reasons"] = json.loads(p["reasons"])
    return p


def filters(user, state="", year="", q="", risk="", sector="", alias=""):
    sql, args = scope_sql(user, alias)
    for col, value in [
        ("state", state),
        ("fiscal_year", year),
        ("risk_level", risk),
        ("sector", sector),
    ]:
        if value:
            sql += f" AND {alias}{col}=?"
            args.append(value)
    if q:
        sql += (
            f" AND ({alias}name LIKE ? OR {alias}id LIKE ? OR {alias}district LIKE ?)"
        )
        args += ["%" + q[:150] + "%"] * 3
    return sql, args


def get_project(c, pid, user):
    p = c.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()
    if not p:
        raise HTTPException(404, "Project not found.")
    check_scope(user, p)
    return p


def insert_project(c, data, pid, source):
    d = data.model_dump(mode="json")
    d.update(
        id=pid,
        status="Completed" if d["progress"] == 100 else "In progress",
        source=source,
        updated_at=now(),
    )
    c.execute(
        "INSERT INTO projects("
        + ",".join(d)
        + ") VALUES("
        + ",".join(":" + k for k in d)
        + ")",
        d,
    )
    if data.expenditure > 0:
        c.execute(
            "INSERT INTO payments VALUES(?,?,?,?,?,?,?)",
            (
                str(uuid.uuid4()),
                pid,
                "OPEN-" + pid,
                data.expenditure,
                data.start_date.isoformat(),
                data.agency,
                "Imported opening expenditure; not an individual verified invoice.",
            ),
        )


@app.get("/api/health")
def health():
    with db() as c:
        c.execute("SELECT 1")
    return {"status": "ok", "version": "1.0.0"}


@app.get("/api/config")
def config():
    return {"demo_mode": DEMO_MODE, "model_version": MODEL_VERSION}


@app.post("/api/auth/login")
def login(body: Login, request: Request, response: Response):
    key = request.client.host if request.client else "unknown"
    current = time.time()
    with write_lock:
        login_attempts[key] = [t for t in login_attempts[key] if t > current - 300]
        if len(login_attempts[key]) >= 10:
            raise HTTPException(429, "Too many attempts. Try again in 5 minutes.")
        login_attempts[key].append(current)
    with db() as c:
        user = c.execute(
            "SELECT * FROM users WHERE email=?", (body.email.strip().lower(),)
        ).fetchone()
        if not user or not verify_password(body.password, user["password_hash"]):
            raise HTTPException(401, "The email or password is incorrect.")
        response_data = {k: user[k] for k in ["id", "name", "email", "role", "scope"]}
        response_data["csrf"] = create_session(c, user["id"], response)
        audit(c, user["name"], "Signed in", "Session")
        return response_data


@app.post("/api/auth/demo")
def demo_login(body: DemoLogin, response: Response):
    if not DEMO_MODE:
        raise HTTPException(404, "Not found.")
    with db() as c:
        user = dict(
            c.execute(
                "SELECT id,name,email,role,scope FROM users WHERE id=?",
                ("demo-" + body.role,),
            ).fetchone()
        )
        user["csrf"] = create_session(c, user["id"], response)
        return user


@app.get("/api/auth/me")
def me(user=Depends(current_user)):
    return user


@app.post("/api/auth/logout")
def logout(request: Request, response: Response, user=Depends(current_user)):
    with db() as c:
        c.execute(
            "DELETE FROM sessions WHERE token_hash=?",
            (token_hash(request.cookies.get("insight_session", "")),),
        )
    response.delete_cookie("insight_session")
    return {"ok": True}


@app.get("/api/options")
def options(user=Depends(current_user)):
    sql, args = scope_sql(user)
    with db() as c:
        rows = c.execute(
            "SELECT state,district,constituency,fiscal_year,sector FROM projects WHERE "
            + sql,
            args,
        ).fetchall()
    return {
        key: sorted({r[key] for r in rows}, reverse=key == "fiscal_year")
        for key in ["state", "district", "constituency", "fiscal_year", "sector"]
    }


@app.get("/api/projects")
def projects(state="", year="", q="", risk="", sector="", user=Depends(current_user)):
    sql, args = filters(user, state, year, q, risk, sector)
    with db() as c:
        rows = c.execute(
            "SELECT * FROM projects WHERE " + sql + " ORDER BY risk_score DESC,id", args
        ).fetchall()
    return [serial_project(r) for r in rows]


@app.get("/api/projects/{pid}")
def project_detail(pid: str, user=Depends(current_user)):
    with db() as c:
        p = serial_project(get_project(c, pid, user))
        asset = c.execute("SELECT * FROM assets WHERE project_id=?", (pid,)).fetchone()
        p["asset"] = dict(asset) if asset else None
        p["payments"] = [
            dict(r)
            for r in c.execute(
                "SELECT * FROM payments WHERE project_id=? ORDER BY paid_on DESC",
                (pid,),
            )
        ]
        p["history"] = [
            dict(r)
            for r in c.execute(
                "SELECT * FROM audit WHERE entity=? ORDER BY id DESC LIMIT 30", (pid,)
            )
        ]
        p["alert"] = (
            dict(a)
            if (
                a := c.execute(
                    "SELECT * FROM alerts WHERE project_id=? AND active=1", (pid,)
                ).fetchone()
            )
            else None
        )
    return p


@app.post("/api/projects", status_code=201)
def add_project(body: ProjectIn, user=Depends(current_user)):
    require_editor(user)
    check_scope(user, body.model_dump())
    with write_lock, db() as c:
        pid = "MPL-" + secrets.token_hex(4).upper()
        insert_project(c, body, pid, "Manual entry")
        audit(c, user["name"], "Created project", pid, body.name)
        analyze(c, user["name"])
    return {"id": pid}


@app.patch("/api/projects/{pid}/progress")
def progress_update(pid: str, body: ProgressUpdate, user=Depends(current_user)):
    require_editor(user)
    with write_lock, db() as c:
        get_project(c, pid, user)
        if (
            body.progress < 100
            and c.execute("SELECT 1 FROM assets WHERE project_id=?", (pid,)).fetchone()
        ):
            raise HTTPException(409, "This work has a completed asset handover.")
        c.execute(
            "UPDATE projects SET progress=?,updated_at=? WHERE id=?",
            (body.progress, now(), pid),
        )
        audit(
            c,
            user["name"],
            "Updated physical progress",
            pid,
            f"{body.progress:g}% — {body.note}",
        )
        analyze(c, user["name"])
    return {"ok": True}


@app.post("/api/projects/{pid}/payments", status_code=201)
def add_payment(pid: str, body: PaymentIn, user=Depends(current_user)):
    require_editor(user)
    with write_lock, db() as c:
        p = get_project(c, pid, user)
        if body.paid_on > date.today() or body.paid_on < date.fromisoformat(
            p["start_date"]
        ):
            raise HTTPException(
                422, "Payment date must be between project start and today."
            )
        try:
            c.execute(
                "INSERT INTO payments VALUES(?,?,?,?,?,?,?)",
                (
                    str(uuid.uuid4()),
                    pid,
                    body.reference.upper(),
                    body.amount,
                    body.paid_on.isoformat(),
                    body.payee,
                    body.note,
                ),
            )
        except sqlite3.IntegrityError:
            raise HTTPException(
                409, "That payment reference already exists. No funds were added."
            ) from None
        c.execute(
            "UPDATE projects SET expenditure=ROUND(expenditure+?,2),updated_at=? WHERE id=?",
            (body.amount, now(), pid),
        )
        audit(
            c,
            user["name"],
            "Recorded payment",
            pid,
            f"{body.reference.upper()} · INR {body.amount:,.2f}",
        )
        analyze(c, user["name"])
    return {"ok": True}


@app.post("/api/projects/{pid}/asset", status_code=201)
def record_asset(pid: str, body: AssetIn, user=Depends(current_user)):
    require_editor(user)
    with write_lock, db() as c:
        project = get_project(c, pid, user)
        if project["progress"] != 100:
            raise HTTPException(
                422, "Complete the work before recording an asset handover."
            )
        if (
            not date.fromisoformat(project["start_date"])
            <= body.handover_date
            <= date.today()
        ):
            raise HTTPException(
                422, "Handover date must fall between project start and today."
            )
        try:
            c.execute(
                "INSERT INTO assets VALUES(?,?,?,?,?)",
                (
                    pid,
                    body.asset_ref.upper(),
                    body.description,
                    body.custodian,
                    body.handover_date.isoformat(),
                ),
            )
        except sqlite3.IntegrityError:
            raise HTTPException(
                409, "This work or reference already has a registered asset."
            ) from None
        audit(c, user["name"], "Registered completed asset", pid, body.asset_ref)
    return {"ok": True}


@app.get("/api/overview")
def overview(state="", year="", user=Depends(current_user)):
    sql, args = filters(user, state, year)
    with db() as c:
        rows = [dict(r) for r in c.execute("SELECT * FROM projects WHERE " + sql, args)]
        psql, pargs = filters(user, state, year, alias="p.")
        payments = [
            dict(r)
            for r in c.execute(
                "SELECT t.* FROM payments t JOIN projects p ON p.id=t.project_id WHERE "
                + psql,
                pargs,
            )
        ]
        alerts = [
            dict(r)
            for r in c.execute(
                """SELECT a.*,p.name,p.state,p.district,p.risk_score FROM alerts a
             JOIN projects p ON p.id=a.project_id WHERE a.active=1 AND """
                + psql
                + " ORDER BY p.risk_score DESC",
                pargs,
            )
        ]
        last = c.execute(
            "SELECT * FROM analysis_runs ORDER BY created_at DESC LIMIT 1"
        ).fetchone()
    total = sum(r["sanctioned"] for r in rows)
    spent = sum(r["expenditure"] for r in rows)
    regions = []
    for s in sorted({r["state"] for r in rows}):
        group = [r for r in rows if r["state"] == s]
        regions.append(
            {
                "name": s,
                "projects": len(group),
                "high": sum(r["risk_level"] == "High" for r in group),
                "risk": round(sum(r["risk_score"] for r in group) / len(group)),
                "spent": sum(r["expenditure"] for r in group),
            }
        )
    sectors = [
        {
            "name": s,
            "value": sum(r["sanctioned"] for r in rows if r["sector"] == s),
            "spent": sum(r["expenditure"] for r in rows if r["sector"] == s),
        }
        for s in sorted({r["sector"] for r in rows})
    ]
    today = date.today()
    months = []
    for offset in range(5, -1, -1):
        number = today.year * 12 + today.month - 1 - offset
        d = date(number // 12, number % 12 + 1, 1)
        key = d.strftime("%Y-%m")
        cumulative = sum(p["amount"] for p in payments if p["paid_on"][:7] <= key)
        allocated = sum(r["sanctioned"] for r in rows if r["start_date"][:7] <= key)
        months.append(
            {
                "month": d.strftime("%b"),
                "sanctioned": round(allocated / 1e7, 2),
                "expenditure": round(cumulative / 1e7, 2),
            }
        )
    return {
        "projects": len(rows),
        "sanctioned": total,
        "expenditure": spent,
        "utilization": round(spent / total * 100, 1) if total else 0,
        "completed": sum(r["progress"] == 100 for r in rows),
        "delayed": sum(r["status"] == "Delayed" for r in rows),
        "high_risk": sum(r["risk_level"] == "High" for r in rows),
        "medium_risk": sum(r["risk_level"] == "Medium" for r in rows),
        "low_risk": sum(r["risk_level"] == "Low" for r in rows),
        "open_alerts": sum(a["status"] in ("Open", "In review") for a in alerts),
        "alerts": alerts[:5],
        "regions": sorted(regions, key=lambda r: r["risk"], reverse=True),
        "sectors": sectors,
        "trend": months,
        "last_analysis": {"created_at": last["created_at"]} if last else None,
        "as_of": today.isoformat(),
        "demo_projects": sum(r["source"] == "Demonstration" for r in rows),
    }


@app.get("/api/alerts")
def alerts(state="", year="", status="", user=Depends(current_user)):
    sql, args = filters(user, state, year, alias="p.")
    if status:
        sql += " AND a.status=?"
        args.append(status)
    with db() as c:
        result = []
        for r in c.execute(
            """SELECT a.*,p.name,p.state,p.district,p.risk_score,p.reasons,p.expenditure,
            p.sanctioned FROM alerts a JOIN projects p ON p.id=a.project_id WHERE a.active=1 AND """
            + sql
            + " ORDER BY p.risk_score DESC",
            args,
        ):
            a = dict(r)
            a["reasons"] = json.loads(a["reasons"])
            a["reviews"] = [
                dict(x)
                for x in c.execute(
                    "SELECT * FROM reviews WHERE alert_id=? ORDER BY created_at DESC",
                    (a["id"],),
                )
            ]
            result.append(a)
    return result


@app.post("/api/alerts/{aid}/review")
def review_alert(aid: str, body: ReviewIn, user=Depends(current_user)):
    require_editor(user)
    with write_lock, db() as c:
        a = c.execute("SELECT * FROM alerts WHERE id=? AND active=1", (aid,)).fetchone()
        if not a:
            raise HTTPException(404, "Alert not found.")
        get_project(c, a["project_id"], user)
        c.execute(
            "UPDATE alerts SET status=?,updated_at=? WHERE id=?",
            (body.status, now(), aid),
        )
        c.execute(
            "INSERT INTO reviews VALUES(?,?,?,?,?,?)",
            (str(uuid.uuid4()), aid, user["name"], body.status, body.note, now()),
        )
        audit(
            c,
            user["name"],
            "Reviewed alert",
            a["project_id"],
            f"{body.status} — {body.note}",
        )
    return {"ok": True}


@app.post("/api/analysis/run")
def run_analysis(user=Depends(current_user)):
    require_ministry(user)
    with write_lock, db() as c:
        result = analyze(c, user["name"])
        audit(
            c,
            user["name"],
            "Ran anomaly analysis",
            "All projects",
            f"{result['project_count']} projects analyzed",
        )
    return result


@app.get("/api/analysis")
def analysis_info(user=Depends(current_user)):
    with db() as c:
        runs = [
            dict(r)
            for r in c.execute(
                "SELECT * FROM analysis_runs ORDER BY created_at DESC LIMIT 10"
            )
        ]
    # Cross-scope dataset counts are available only to the Ministry.
    return {
        "version": MODEL_VERSION,
        "runs": runs if user["role"] == "ministry" else [],
        "features": [
            "Log sanctioned cost",
            "Expenditure / sanction",
            "Physical completion",
            "Days overdue",
            "Spending–progress gap",
        ],
        "thresholds": {"high": 65, "medium": 35},
        "minimum_ml_rows": 10,
    }


CSV_FIELDS = list(ProjectIn.model_fields)


@app.get("/api/import/template")
def template(user=Depends(current_user)):
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(CSV_FIELDS)
    w.writerow(
        [
            "Primary school classroom extension",
            "Uttar Pradesh",
            "Varanasi",
            "Varanasi",
            "Education",
            "District Works Agency",
            "Ward 12, Varanasi",
            3500000,
            0,
            0,
            "2026-04-01",
            "2027-03-31",
            "2026-27",
            25.32,
            82.97,
            3400000,
        ]
    )
    return Response(
        out.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": 'attachment; filename="mplads-import-template.csv"'
        },
    )


@app.post("/api/import")
def import_csv(file: UploadFile = File(...), user=Depends(current_user)):
    require_editor(user)
    raw = file.file.read(5 * 1024 * 1024 + 1)
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(413, "CSV files must be smaller than 5 MB.")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(422, "Use a UTF-8 encoded CSV file.") from None
    reader = csv.DictReader(io.StringIO(text))
    required = {k for k, v in ProjectIn.model_fields.items() if v.is_required()}
    if not reader.fieldnames or not required.issubset(reader.fieldnames):
        raise HTTPException(
            422,
            "Missing required columns: "
            + ", ".join(sorted(required - set(reader.fieldnames or []))),
        )
    if set(reader.fieldnames) - set(CSV_FIELDS):
        raise HTTPException(
            422, "Unexpected columns. Please use the supplied template."
        )
    if len(reader.fieldnames) != len(set(reader.fieldnames)):
        raise HTTPException(422, "Duplicate column names are not supported.")
    records = []
    errors = []
    fingerprints = set()
    for line, row in enumerate(reader, start=2):
        if line > 1001:
            raise HTTPException(422, "Import at most 1,000 projects at a time.")
        try:
            cleaned = {k: v for k, v in row.items() if v not in ("", None)}
            item = ProjectIn.model_validate(cleaned)
            check_scope(user, item.model_dump())
            fingerprint = (
                item.name.casefold(),
                item.location.casefold(),
                item.start_date.isoformat(),
            )
            if fingerprint in fingerprints:
                raise ValueError("Duplicate project in this file.")
            fingerprints.add(fingerprint)
            records.append(item)
        except (ValidationError, ValueError) as e:
            message = (
                "; ".join(
                    (".".join(map(str, x["loc"])) or "project") + ": " + x["msg"]
                    for x in e.errors()
                )
                if isinstance(e, ValidationError)
                else str(e)
            )
            errors.append({"row": line, "message": message})
    if errors:
        raise HTTPException(
            422,
            {
                "message": "No rows imported. Correct these rows and try again.",
                "errors": errors[:25],
            },
        )
    if not records:
        raise HTTPException(422, "The file has no project rows.")
    with write_lock, db() as c:
        existing = {
            (r[0].casefold(), r[1].casefold(), r[2])
            for r in c.execute("SELECT name,location,start_date FROM projects")
        }
        if existing & fingerprints:
            raise HTTPException(
                409,
                "This upload includes a project already imported. No rows were added.",
            )
        for item in records:
            pid = "MPL-" + secrets.token_hex(4).upper()
            insert_project(c, item, pid, "CSV import")
            audit(c, user["name"], "Imported project", pid, item.name)
        analyze(c, user["name"])
    return {
        "imported": len(records),
        "message": f"{len(records)} projects imported and analyzed.",
    }


def csv_safe(value):
    text = str(value) if value is not None else ""
    return "'" + text if text.startswith(("=", "+", "-", "@", "\t", "\r")) else text


@app.get("/api/export")
def export(state="", year="", q="", risk="", sector="", user=Depends(current_user)):
    sql, args = filters(user, state, year, q, risk, sector)
    with db() as c:
        rows = c.execute(
            "SELECT * FROM projects WHERE " + sql + " ORDER BY risk_score DESC,id", args
        ).fetchall()
    out = io.StringIO()
    fields = ["id"] + CSV_FIELDS + ["status", "risk_score", "risk_level", "source"]
    writer = csv.writer(out)
    writer.writerow(fields)
    for r in rows:
        writer.writerow([csv_safe(r[f]) for f in fields])
    return Response(
        "\ufeff" + out.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": 'attachment; filename="mplads-project-report.csv"'
        },
    )


@app.get("/api/audit")
def audit_log(user=Depends(current_user)):
    with db() as c:
        if user["role"] == "ministry":
            rows = c.execute(
                "SELECT * FROM audit ORDER BY id DESC LIMIT 100"
            ).fetchall()
        else:
            sql, args = scope_sql(user, "p.")
            rows = c.execute(
                "SELECT a.* FROM audit a JOIN projects p ON p.id=a.entity WHERE "
                + sql
                + " ORDER BY a.id DESC LIMIT 100",
                args,
            ).fetchall()
    return [dict(r) for r in rows]


@app.get("/api/users")
def users(user=Depends(current_user)):
    require_ministry(user)
    with db() as c:
        return [
            dict(r)
            for r in c.execute(
                "SELECT id,name,email,role,scope,created_at FROM users ORDER BY name"
            )
        ]


@app.post("/api/users", status_code=201)
def add_user(body: UserIn, user=Depends(current_user)):
    require_ministry(user)
    with write_lock, db() as c:
        try:
            c.execute(
                "INSERT INTO users VALUES(?,?,?,?,?,?,?)",
                (
                    str(uuid.uuid4()),
                    body.name,
                    body.email.lower(),
                    password_hash(body.password),
                    body.role,
                    body.scope.strip() if body.role != "ministry" else "",
                    now(),
                ),
            )
        except sqlite3.IntegrityError:
            raise HTTPException(409, "This email already has an account.") from None
        audit(
            c,
            user["name"],
            "Created user",
            "Access management",
            body.email + " · " + body.role,
        )
    return {"ok": True}


if (ROOT / "dist" / "assets").exists():
    app.mount("/assets", StaticFiles(directory=ROOT / "dist" / "assets"), name="assets")


@app.get("/{path:path}")
def frontend(path: str):
    if path.startswith("api/"):
        raise HTTPException(404, "Endpoint not found.")
    file = ROOT / "dist" / "index.html"
    if file.exists():
        return FileResponse(file)
    return Response(
        "Frontend is not built. Run npm install and npm run build.", status_code=503
    )
