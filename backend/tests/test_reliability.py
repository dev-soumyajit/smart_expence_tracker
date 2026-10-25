from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import os
import pytest
from sqlalchemy.orm import Session
from test_finance import transaction, balance


def test_commit_failure_returns_error_and_rolls_back(client, accounts, monkeypatch):
    def failed_commit(*args):
        raise RuntimeError("Simulated database commit failure")
    with monkeypatch.context() as patch:
        patch.setattr(Session, "commit", failed_commit)
        assert transaction(client, accounts).status_code == 500
    assert balance(client, "bank") == 1000000
    assert client.get("/api/v1/transactions").json()["total"] == 0


def test_import_duplicate_in_file_and_stale_preview(client, accounts):
    content = "date,amount,type,description\n2026-10-01,50,expense,Lunch\n2026-10-01,50,expense,Lunch\n"
    first = client.post("/api/v1/imports/preview", json={"account_id": accounts["bank"], "csv_text": content}).json()
    assert first["records"][1]["error"]
    second = client.post("/api/v1/imports/preview", json={"account_id": accounts["bank"], "csv_text": content + "\n"}).json()
    assert client.post(f"/api/v1/imports/{first['id']}/commit").json()["imported"] == 1
    assert client.post(f"/api/v1/imports/{second['id']}/commit").json()["imported"] == 0
    assert balance(client, "bank") == 995000


@pytest.mark.skipif(not os.environ.get("TEST_DATABASE_URL"), reason="Requires PostgreSQL row locks")
def test_concurrent_refunds_cannot_exceed_original(client, accounts):
    original = transaction(client, accounts).json()
    now = datetime.now(timezone.utc).isoformat()
    def refund(amount):
        return transaction(client, accounts, kind="refund", original_id=original["id"], amount=amount, occurred_at=now).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = sorted(pool.map(refund, [6000, 6000]))
    assert statuses == [201, 422]
    assert balance(client, "bank") == 996000


@pytest.mark.skipif(not os.environ.get("TEST_DATABASE_URL"), reason="Requires PostgreSQL row locks")
def test_concurrent_idempotent_requests(client, accounts):
    now = datetime.now(timezone.utc).isoformat()
    def create(_):
        response = transaction(client, accounts, occurred_at=now, headers={"Idempotency-Key": "concurrent-write-key"})
        assert response.status_code == 201, response.text
        return response.json()["id"]
    with ThreadPoolExecutor(max_workers=4) as pool:
        ids = list(pool.map(create, range(4)))
    assert len(set(ids)) == 1
    assert balance(client, "bank") == 990000
