import csv
import io
from datetime import date

import pytest
from fastapi.testclient import TestClient

from backend import db, main, seed


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DATA_DIR", tmp_path)
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "isolated.sqlite")
    monkeypatch.setattr(seed, "DEMO_MODE", True)
    monkeypatch.setattr(main, "DEMO_MODE", True)
    monkeypatch.delenv("ADMIN_PASSWORD", raising=False)
    with TestClient(main.app) as client:
        yield client


def sign_in(client, role="ministry"):
    session = client.post("/api/auth/demo", json={"role": role})
    assert session.status_code == 200
    client.headers["X-CSRF-Token"] = session.json()["csrf"]


def test_regional_permissions(app):
    assert app.get("/api/projects").status_code == 401
    sign_in(app, "state")
    assert {p["state"] for p in app.get("/api/projects").json()} == {"Uttar Pradesh"}
    assert app.get("/api/projects/MPL-0025").status_code == 404
    assert app.post("/api/analysis/run").status_code == 403
    sign_in(app, "mp")
    assert (
        app.patch(
            "/api/projects/MPL-0001/progress",
            json={"progress": 50, "note": "Verified schedule"},
        ).status_code
        == 403
    )
    assert app.get("/api/users").status_code == 403
    sign_in(app)
    app.headers.pop("X-CSRF-Token")
    assert app.post("/api/analysis/run").status_code == 403


def test_payment_progress_and_asset(app):
    sign_in(app)
    url = "/api/projects/MPL-0001"
    before = app.get(url).json()
    payment = dict(
        reference="TEST-PAY-001",
        amount=10000.25,
        payee="Test works agency",
        paid_on=date.today().isoformat(),
    )
    assert app.post(url + "/payments", json=payment).status_code == 201
    assert app.post(url + "/payments", json=payment).status_code == 409
    after = app.get(url).json()
    assert after["expenditure"] == pytest.approx(
        before["expenditure"] + payment["amount"]
    )
    assert sum(p["amount"] for p in after["payments"]) == pytest.approx(
        after["expenditure"]
    )
    asset = dict(
        asset_ref="ASSET-T001",
        description="New school classrooms",
        custodian="School office",
        handover_date=date.today().isoformat(),
    )
    assert app.post(url + "/asset", json=asset).status_code == 422
    assert app.patch(
        url + "/progress", json={"progress": 100, "note": "Completion report verified."}
    ).is_success
    assert app.post(url + "/asset", json=asset).status_code == 201
    assert app.get(url).json()["asset"]["asset_ref"] == "ASSET-T001"
    assert (
        app.patch(
            url + "/progress", json={"progress": 40, "note": "Different progress"}
        ).status_code
        == 409
    )
    assert app.post(url + "/asset", json=asset).status_code == 409


def test_import_is_atomic_and_reports_errors(app):
    sign_in(app)
    initial = app.get("/api/overview").json()["projects"]
    example = list(csv.reader(io.StringIO(app.get("/api/import/template").text)))
    header, valid = example

    def upload(rows):
        stream = io.StringIO()
        csv.writer(stream).writerows([header] + rows)
        return app.post(
            "/api/import", files={"file": ("test.csv", stream.getvalue(), "text/csv")}
        )

    invalid = list(valid)
    invalid[header.index("due_date")] = "2000-01-01"
    bad = upload([valid, invalid])
    assert bad.status_code == 422
    assert bad.json()["detail"]["errors"][0]["row"] == 3
    assert app.get("/api/overview").json()["projects"] == initial
    assert upload([valid]).status_code == 200
    assert upload([valid]).status_code == 409
    assert app.get("/api/overview").json()["projects"] == initial + 1


def test_review_and_export_survive_reanalysis(app):
    sign_in(app)
    a = app.get("/api/alerts").json()[0]
    assert a["risk_score"] >= 65 and a["reasons"]
    assert app.post(
        "/api/alerts/" + a["id"] + "/review",
        json={"status": "In review", "note": "Records requested from the district."},
    ).is_success
    assert app.post("/api/analysis/run").json()["project_count"] == 96
    updated = next(x for x in app.get("/api/alerts").json() if x["id"] == a["id"])
    assert updated["status"] == "In review" and updated["reviews"][0][
        "note"
    ].startswith("Records")
    rows = list(
        csv.DictReader(
            io.StringIO(
                app.get("/api/export?risk=High&state=Bihar").text.lstrip("\ufeff")
            )
        )
    )
    assert rows and all(
        p["state"] == "Bihar" and p["risk_level"] == "High" for p in rows
    )


def test_private_workspace_authentication(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DATA_DIR", tmp_path)
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "private.sqlite")
    monkeypatch.setattr(seed, "DEMO_MODE", False)
    monkeypatch.setattr(main, "DEMO_MODE", False)
    monkeypatch.setenv("ADMIN_EMAIL", "test@example.test")
    monkeypatch.setenv("ADMIN_PASSWORD", "local-test-password-only")
    with TestClient(main.app) as client:
        assert client.post("/api/auth/demo", json={}).status_code == 404
        assert (
            client.post(
                "/api/auth/login",
                json={"email": "test@example.test", "password": "wrong"},
            ).status_code
            == 401
        )
        result = client.post(
            "/api/auth/login",
            json={"email": "test@example.test", "password": "local-test-password-only"},
        )
        assert result.is_success
        client.headers["X-CSRF-Token"] = result.json()["csrf"]
        assert client.get("/api/overview").json()["projects"] == 0
        assert client.post("/api/auth/logout").is_success
        assert client.get("/api/projects").status_code == 401
