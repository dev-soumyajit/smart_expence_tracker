from datetime import date, datetime, timezone
import pytest
from app.services.finance import cycle, shift_month


def transaction(client, accounts, kind="expense", amount=10000, account="bank", **kwargs):
    headers = kwargs.pop("headers", {})
    data = {"account_id": accounts[account], "kind": kind, "amount": amount, "description": "Test purchase", "occurred_at": datetime.now(timezone.utc).isoformat(), **kwargs}
    return client.post("/api/v1/transactions", json=data, headers=headers)


def dashboard(client):
    response = client.get("/api/v1/dashboard")
    assert response.status_code == 200, response.text
    return response.json()


def balance(client, name):
    return next(a["balance"] for a in client.get("/api/v1/accounts").json() if a["name"] == name)


def test_income_and_expense(client, accounts):
    assert transaction(client, accounts).status_code == 201
    assert balance(client, "bank") == 990000
    assert transaction(client, accounts, kind="income", amount=20000).status_code == 201
    assert balance(client, "bank") == 1010000
    assert dashboard(client)["expenses"] == 10000
    assert dashboard(client)["income"] == 20000
    data = dashboard(client)
    for key in ["available", "credit_debt", "income", "expenses", "savings", "safe_to_spend", "daily_safe", "reserved_goals"]:
        assert type(data[key]) is int, key
    assert all(type(a["balance"]) is int for a in data["accounts"])


def test_atm_and_cash(client, accounts):
    assert transaction(client, accounts, kind="transfer", amount=200000, destination_id=accounts["cash"]).status_code == 201
    assert balance(client, "bank") == 800000
    assert balance(client, "cash") == 200000
    assert dashboard(client)["expenses"] == 0
    assert dashboard(client)["income"] == 0
    transaction(client, accounts, account="cash", amount=30000)
    assert balance(client, "cash") == 170000
    assert dashboard(client)["expenses"] == 30000
    assert dashboard(client)["available"] == 970000


def test_credit_purchase_and_repayment(client, accounts):
    transaction(client, accounts, account="credit", amount=100000)
    assert balance(client, "credit") == -100000
    assert dashboard(client)["credit_debt"] == 100000
    transaction(client, accounts, kind="transfer", destination_id=accounts["credit"], amount=100000)
    assert balance(client, "credit") == 0
    assert balance(client, "bank") == 900000
    assert dashboard(client)["expenses"] == 100000


def test_partial_and_full_refunds(client, accounts):
    original = transaction(client, accounts, amount=10000).json()
    assert transaction(client, accounts, kind="refund", original_id=original["id"], amount=4000).status_code == 201
    assert dashboard(client)["expenses"] == 6000
    assert transaction(client, accounts, kind="refund", original_id=original["id"], amount=6001).status_code == 422
    assert transaction(client, accounts, kind="refund", original_id=original["id"], amount=6000).status_code == 201
    assert dashboard(client)["expenses"] == 0
    assert balance(client, "bank") == 1000000
    assert client.delete("/api/v1/transactions/" + original["id"]).status_code == 409


def test_idempotency_and_mismatch(client, accounts):
    now = datetime.now(timezone.utc).isoformat()
    first = transaction(client, accounts, occurred_at=now, headers={"Idempotency-Key": "stable-key-123"})
    second = transaction(client, accounts, occurred_at=now, headers={"Idempotency-Key": "stable-key-123"})
    assert first.json()["id"] == second.json()["id"]
    assert client.get("/api/v1/transactions").json()["total"] == 1
    assert transaction(client, accounts, amount=20000, occurred_at=now, headers={"Idempotency-Key": "stable-key-123"}).status_code == 409
    assert balance(client, "bank") == 990000


def test_revision_and_reversal(client, accounts):
    original = transaction(client, accounts).json()
    payload = {k: original[k] for k in ["account_id", "kind", "amount", "description", "occurred_at"]}
    payload["amount"] = 20000
    # SQLite serialization omits timezone; clients must always send an explicit offset.
    payload["occurred_at"] = datetime.now(timezone.utc).isoformat()
    changed = client.put("/api/v1/transactions/" + original["id"], json=payload)
    assert changed.status_code == 200, changed.text
    assert balance(client, "bank") == 980000
    assert dashboard(client)["expenses"] == 20000
    assert client.delete("/api/v1/transactions/" + changed.json()["id"]).status_code == 200
    assert balance(client, "bank") == 1000000


def test_failed_revision_rolls_back(client, accounts):
    original = transaction(client, accounts).json()
    payload = {"account_id": accounts["bank"], "kind": "refund", "original_id": original["id"], "amount": 100, "description": "Invalid correction", "occurred_at": datetime.now(timezone.utc).isoformat()}
    assert client.put("/api/v1/transactions/" + original["id"], json=payload).status_code == 422
    assert client.get("/api/v1/transactions/" + original["id"]).json()["voided"] is False
    assert balance(client, "bank") == 990000


def test_user_isolation(client, accounts):
    original = transaction(client, accounts).json()
    other = client.post("/api/v1/auth/register", json={"email": "other@example.com", "password": "another-password-123", "name": "Other"}).json()
    client.headers["Authorization"] = "Bearer " + other["access_token"]
    assert client.get("/api/v1/accounts").json() == []
    assert client.get("/api/v1/transactions/" + original["id"]).status_code == 404
    assert client.delete("/api/v1/transactions/" + original["id"]).status_code == 404
    assert transaction(client, accounts).status_code == 404
    assert dashboard(client)["expenses"] == 0


def test_budget_threshold_and_safe_spend(client, accounts):
    data = dashboard(client)
    response = client.post("/api/v1/budgets", json={"name": "Monthly", "amount": 50000, "start_date": data["cycle_start"], "end_date": data["cycle_end"]})
    assert response.status_code == 201, response.text
    transaction(client, accounts, amount=40000)
    budget = client.get("/api/v1/budgets").json()[0]
    assert budget["remaining"] == 10000
    assert budget["utilization_bps"] == 8000
    assert dashboard(client)["safe_to_spend"] == 10000
    assert dashboard(client)["insights"][0]["type"] == "budget"


@pytest.mark.parametrize("on,day,start,end", [(date(2024, 2, 29),31,date(2024,2,29),date(2024,3,30)), (date(2025,2,28),31,date(2025,2,28),date(2025,3,30)), (date(2026,1,1),25,date(2025,12,25),date(2026,1,24)), (date(2026,10,24),25,date(2026,9,25),date(2026,10,24))])
def test_salary_boundaries(on, day, start, end):
    assert cycle(on, day) == (start, end)


def test_timezone_boundary(client, accounts):
    transaction(client, accounts, amount=100, occurred_at="2026-09-30T18:29:59+00:00")
    transaction(client, accounts, amount=200, occurred_at="2026-09-30T18:30:00+00:00")
    assert client.get("/api/v1/dashboard?start=2026-10-01&end=2026-10-01").json()["expenses"] == 200


@pytest.mark.parametrize("amount", [-1, 0, 1.1, "100", 900000000000001])
def test_invalid_amounts(client, accounts, amount):
    assert transaction(client, accounts, amount=amount).status_code == 422
    assert balance(client, "bank") == 1000000


def test_invalid_transfer_and_timestamp(client, accounts):
    assert transaction(client, accounts, kind="transfer", destination_id=accounts["bank"]).status_code == 422
    assert transaction(client, accounts, occurred_at="2026-01-01T10:00:00").status_code == 422


def test_csv_preview_commit_and_retry(client, accounts):
    text = "date,amount,type,description\n2026-10-01,125.50,expense,Lunch\n2026-10-02,invalid,expense,Broken\n"
    preview = client.post("/api/v1/imports/preview", json={"account_id": accounts["bank"], "csv_text": text})
    assert preview.status_code == 201, preview.text
    data = preview.json()
    assert data["records"][1]["error"]
    url = "/api/v1/imports/" + data["id"] + "/commit"
    assert client.post(url).json()["imported"] == 1
    assert client.post(url).json()["imported"] == 0
    assert client.post("/api/v1/imports/preview", json={"account_id": accounts["bank"], "csv_text": text}).json()["id"] == data["id"]
    assert balance(client, "bank") == 987450


def test_recurring_confirmation_is_idempotent(client, accounts):
    due = datetime.now().date().isoformat()
    rule = client.post("/api/v1/recurring", json={"name": "Internet", "account_id": accounts["bank"], "amount": 10000, "next_due": due}).json()
    assert dashboard(client)["expenses"] == 0
    url = f"/api/v1/recurring/{rule['id']}/confirm?due_date={due}"
    one, two = client.post(url), client.post(url)
    assert one.status_code == 200, one.text
    assert one.json()["id"] == two.json()["id"]
    assert dashboard(client)["expenses"] == 10000


def test_auth_refresh_logout(client, auth):
    refreshed = client.post("/api/v1/auth/refresh", json={"refresh_token": auth["refresh_token"]})
    assert refreshed.status_code == 200
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": auth["refresh_token"]}).status_code == 401
    assert client.post("/api/v1/auth/logout").status_code == 200
    assert client.get("/api/v1/auth/me").status_code == 401


def test_pagination_search_health(client, accounts):
    for index in range(3):
        transaction(client, accounts, description=f"Lunch {index}")
    data = client.get("/api/v1/transactions?page=2&page_size=2&search=Lunch").json()
    assert data["total"] == 3 and len(data["items"]) == 1
    assert client.get("/health").json()["status"] == "ok"
    assert client.get("/api/v1/transactions?page=0").status_code == 422


def test_export_deletion(client, accounts):
    original = transaction(client, accounts).json()
    transaction(client, accounts, kind="refund", original_id=original["id"], amount=100)
    assert len(client.get("/api/v1/settings/export").json()["transactions"]) == 2
    response = client.request("DELETE", "/api/v1/settings/account", json={"email": "test@example.com", "password": "secure-passphrase-123"})
    assert response.status_code == 200, response.text
    assert client.get("/api/v1/auth/me").status_code == 401
