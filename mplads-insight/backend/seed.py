import os
import random
import secrets
from datetime import date, timedelta

from .security import DEMO_MODE, now, password_hash

REGIONS = [
    ("Uttar Pradesh", "Varanasi", "Varanasi", 25.32, 82.97),
    ("Maharashtra", "Pune", "Pune", 18.52, 73.86),
    ("Rajasthan", "Jaipur", "Jaipur", 26.91, 75.79),
    ("Karnataka", "Mysuru", "Mysuru", 12.30, 76.65),
    ("Bihar", "Patna", "Patna Sahib", 25.61, 85.14),
    ("West Bengal", "Howrah", "Howrah", 22.59, 88.26),
    ("Tamil Nadu", "Madurai", "Madurai", 9.93, 78.12),
    ("Madhya Pradesh", "Indore", "Indore", 22.72, 75.85),
]
WORKS = [
    ("Education", "Government school classroom extension"),
    ("Drinking water", "Community drinking water facility"),
    ("Roads & bridges", "Village approach road improvement"),
    ("Healthcare", "Primary health centre renovation"),
    ("Community assets", "Community resource centre"),
    ("Sanitation", "Public sanitation block"),
    ("Education", "School library and digital learning room"),
    ("Roads & bridges", "Stormwater drain and footpath"),
    ("Drinking water", "Solar water pumping station"),
    ("Community assets", "Public park and recreation area"),
    ("Healthcare", "Diagnostic equipment installation"),
    ("Sanitation", "Solid waste collection facility"),
]


def seed(c):
    if (
        not DEMO_MODE
        and c.execute("SELECT 1 FROM users WHERE id LIKE 'demo-%' LIMIT 1").fetchone()
    ):
        raise RuntimeError(
            "Private mode requires a separate DATA_DIR from the demonstration workspace."
        )
    if DEMO_MODE and c.execute("SELECT 1 FROM users WHERE id='admin'").fetchone():
        raise RuntimeError(
            "Use a separate demo DATA_DIR to keep the private administrator workspace isolated."
        )
    if DEMO_MODE:
        for role, name, scope in [
            ("ministry", "Bhoomi Roy", ""),
            ("state", "State oversight", "Uttar Pradesh"),
            ("district", "District authority", "Varanasi"),
            ("mp", "MP office", "Varanasi"),
        ]:
            c.execute(
                "INSERT OR IGNORE INTO users VALUES(?,?,?,?,?,?,?)",
                (
                    "demo-" + role,
                    name,
                    role + "@demo.insight.local",
                    password_hash(secrets.token_urlsafe(32)),
                    role,
                    scope,
                    now(),
                ),
            )
    admin_email, admin_password = os.getenv("ADMIN_EMAIL"), os.getenv("ADMIN_PASSWORD")
    if not DEMO_MODE and admin_email and admin_password:
        if len(admin_password) < 12:
            raise RuntimeError("ADMIN_PASSWORD must contain at least 12 characters.")
        c.execute(
            "INSERT OR IGNORE INTO users VALUES(?,?,?,?,?,?,?)",
            (
                "admin",
                os.getenv("ADMIN_NAME", "Administrator"),
                admin_email.lower(),
                password_hash(admin_password),
                "ministry",
                "",
                now(),
            ),
        )
    if not DEMO_MODE or c.execute("SELECT COUNT(*) FROM projects").fetchone()[0]:
        return
    rng = random.Random(42)
    today = date.today()
    for region_index, (state, district, constituency, lat, lon) in enumerate(REGIONS):
        for j, (sector, title) in enumerate(WORKS):
            number = region_index * 12 + j + 1
            pid = f"MPL-{number:04d}"
            start = today - timedelta(days=rng.randint(90, 480))
            due = start + timedelta(days=rng.randint(160, 400))
            budget = rng.randint(18, 95) * 100000
            progress = rng.choice([24, 38, 52, 67, 78, 89, 100, 100])
            spent = round(budget * (progress / 100) * rng.uniform(0.75, 1.04), 2)
            location = f"Ward {j + 1}, {district}"
            if j == 0 and region_index in (0, 2, 4):
                progress, spent, due = (
                    38,
                    round(budget * 1.28, 2),
                    today - timedelta(days=112),
                )
            if j == 4 and region_index in (0, 1, 5):
                progress, spent, due = (
                    22,
                    round(budget * 0.91, 2),
                    today - timedelta(days=84),
                )
            if j == 10 and region_index == 0:
                title, sector, location = WORKS[4][1], WORKS[4][0], "Ward 5, Varanasi"
                budget, spent, progress = 6500000, 5200000, 20
            status = (
                "Completed"
                if progress == 100
                else ("Delayed" if due < today else "In progress")
            )
            fy = start.year if start.month >= 4 else start.year - 1
            c.execute(
                """INSERT INTO projects(id,name,state,district,constituency,sector,agency,location,
                sanctioned,expenditure,progress,start_date,due_date,fiscal_year,status,latitude,longitude,source,updated_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    pid,
                    title,
                    state,
                    district,
                    constituency,
                    sector,
                    f"{district} Works Agency (demo)",
                    location,
                    budget,
                    spent,
                    progress,
                    start.isoformat(),
                    due.isoformat(),
                    f"{fy}-{str(fy + 1)[2:]}",
                    status,
                    lat + rng.uniform(-0.08, 0.08),
                    lon + rng.uniform(-0.08, 0.08),
                    "Demonstration",
                    now(),
                ),
            )
            first = round(spent * 0.4, 2)
            for k, amount in enumerate([first, round(spent - first, 2)]):
                paid = start + timedelta(days=(today - start).days * (k + 1) // 3)
                c.execute(
                    "INSERT INTO payments VALUES(?,?,?,?,?,?,?)",
                    (
                        f"pay-{number}-{k}",
                        pid,
                        f"DEMO-{number:04d}-{k}",
                        amount,
                        paid.isoformat(),
                        f"{district} Works Agency (demo)",
                        "Synthetic demonstration payment",
                    ),
                )
