import hashlib
import hmac
import os
import secrets
import time
from datetime import datetime, timezone

from fastapi import HTTPException, Request

from .db import db

DEMO_MODE = os.getenv("DEMO_MODE", "false").lower() == "true"
SECURE_COOKIES = os.getenv("SECURE_COOKIES", "false").lower() == "true"
SESSION_SECONDS = 8 * 60 * 60


def now():
    return datetime.now(timezone.utc).isoformat()


def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), bytes.fromhex(salt), 310000
    ).hex()
    return salt + ":" + digest


def verify_password(password, encoded):
    try:
        return hmac.compare_digest(
            password_hash(password, encoded.split(":")[0]), encoded
        )
    except (ValueError, IndexError):
        return False


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def current_user(request: Request):
    token = request.cookies.get("insight_session", "")
    with db() as c:
        row = c.execute(
            """SELECT u.id,u.name,u.email,u.role,u.scope,s.csrf
            FROM sessions s JOIN users u ON s.user_id=u.id
            WHERE s.token_hash=? AND s.expires_at>?""",
            (token_hash(token), time.time()),
        ).fetchone()
    if not row:
        raise HTTPException(401, "Please sign in to continue.")
    user = dict(row)
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        if not hmac.compare_digest(
            request.headers.get("x-csrf-token", ""), user["csrf"]
        ):
            raise HTTPException(
                403, "Your session could not be verified. Refresh and try again."
            )
    return user


def require_editor(user):
    if user["role"] == "mp":
        raise HTTPException(403, "MP accounts have read-only oversight access.")


def require_ministry(user):
    if user["role"] != "ministry":
        raise HTTPException(403, "This action requires Ministry access.")


def scope_sql(user, alias=""):
    col = {"state": "state", "district": "district", "mp": "constituency"}.get(
        user["role"]
    )
    return (f"{alias}{col} = ?", [user["scope"]]) if col else ("1=1", [])


def check_scope(user, project):
    col = {"state": "state", "district": "district", "mp": "constituency"}.get(
        user["role"]
    )
    if col and project[col] != user["scope"]:
        raise HTTPException(404, "Project not found.")


def create_session(c, user_id, response):
    token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    c.execute("DELETE FROM sessions WHERE expires_at<?", (time.time(),))
    c.execute(
        "INSERT INTO sessions VALUES(?,?,?,?)",
        (token_hash(token), user_id, csrf, time.time() + SESSION_SECONDS),
    )
    response.set_cookie(
        "insight_session",
        token,
        httponly=True,
        secure=SECURE_COOKIES,
        samesite="strict",
        max_age=SESSION_SECONDS,
        path="/",
    )
    return csrf
