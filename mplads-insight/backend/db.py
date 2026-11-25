import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

_base = Path(__file__).resolve().parents[1] / "data"
_default_dir = (
    _base if os.getenv("DEMO_MODE", "false").lower() == "true" else _base / "private"
)
DATA_DIR = Path(os.getenv("DATA_DIR", str(_default_dir)))
DB_PATH = DATA_DIR / "insight.sqlite3"


@contextmanager
def db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=30000")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with db() as c:
        c.execute("PRAGMA journal_mode=WAL")
        c.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL, role TEXT NOT NULL, scope TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
            csrf TEXT NOT NULL, expires_at REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, state TEXT NOT NULL, district TEXT NOT NULL,
            constituency TEXT NOT NULL, sector TEXT NOT NULL, agency TEXT NOT NULL,
            location TEXT NOT NULL, sanctioned REAL NOT NULL CHECK(sanctioned>0),
            expenditure REAL NOT NULL DEFAULT 0 CHECK(expenditure>=0),
            progress REAL NOT NULL DEFAULT 0 CHECK(progress>=0 AND progress<=100),
            start_date TEXT NOT NULL, due_date TEXT NOT NULL, fiscal_year TEXT NOT NULL,
            status TEXT NOT NULL, latitude REAL, longitude REAL,
            risk_score INTEGER NOT NULL DEFAULT 0, risk_level TEXT NOT NULL DEFAULT 'Low',
            reasons TEXT NOT NULL DEFAULT '[]', model_score REAL NOT NULL DEFAULT 0,
            source TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS payments (
            id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
            reference TEXT UNIQUE NOT NULL, amount REAL NOT NULL CHECK(amount>0),
            paid_on TEXT NOT NULL, payee TEXT NOT NULL, note TEXT NOT NULL DEFAULT '');
        CREATE TABLE IF NOT EXISTS assets (
            project_id TEXT PRIMARY KEY REFERENCES projects(id), asset_ref TEXT NOT NULL UNIQUE,
            description TEXT NOT NULL, custodian TEXT NOT NULL, handover_date TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS alerts (
            id TEXT PRIMARY KEY, project_id TEXT UNIQUE NOT NULL REFERENCES projects(id),
            title TEXT NOT NULL, severity TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Open',
            active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS reviews (
            id TEXT PRIMARY KEY, alert_id TEXT NOT NULL REFERENCES alerts(id),
            author TEXT NOT NULL, status TEXT NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS audit (
            id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, action TEXT NOT NULL,
            entity TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS analysis_runs (
            id TEXT PRIMARY KEY, actor TEXT NOT NULL, project_count INTEGER NOT NULL,
            flagged_count INTEGER NOT NULL, model_version TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS idx_projects_scope ON projects(state,district,constituency);
        CREATE INDEX IF NOT EXISTS idx_payments_project ON payments(project_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

        """)

        if "estimated_cost" not in {
            row[1] for row in c.execute("PRAGMA table_info(projects)")
        }:
            c.execute(
                "ALTER TABLE projects ADD COLUMN estimated_cost REAL CHECK(estimated_cost>0)"
            )
        c.execute("PRAGMA user_version=2")


def audit(c, actor, action, entity, detail=""):
    from .security import now

    c.execute(
        "INSERT INTO audit(actor,action,entity,detail,created_at) VALUES(?,?,?,?,?)",
        (actor, action, entity, detail, now()),
    )
