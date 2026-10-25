from uuid import uuid4
from concurrent.futures import ThreadPoolExecutor
import os
import pytest


def payload(accounts, **changes):
    return {"account_id": accounts["bank"], "kind": "expense", "amount": 12550,
            "description": "Reviewed bank alert", "occurred_at": "2026-01-10T10:15:30+05:30", "source": "sms", **changes}


def confirm(client, accounts, fingerprint="a" * 64, **changes):
    return client.post("/api/v1/sms/confirm", json={"fingerprint": fingerprint, "transaction": payload(accounts), **changes})


def test_confirm_retries_and_rescans_never_double_count(client, accounts):
    first = confirm(client, accounts)
    assert first.status_code == 201, first.text
    second = confirm(client, accounts)
    assert second.json() == first.json()
    assert client.get("/api/v1/transactions").json()["total"] == 1
    changed = confirm(client, accounts, transaction=payload(accounts, amount=50000))
    assert changed.status_code == 409
    assert client.get("/api/v1/sms/lookup/" + "a" * 64).json()["id"] == first.json()["id"]
    assert client.post("/api/v1/sms/lookup", json={"fingerprints": ["a" * 64, "b" * 64]}).json() == ["a" * 64]


def test_similar_manual_entry_requires_explicit_duplicate_decision(client, accounts):
    manual = client.post("/api/v1/transactions", json=payload(accounts, source="manual")).json()
    matches = client.post("/api/v1/sms/duplicates", json=payload(accounts)).json()
    assert [row["id"] for row in matches] == [manual["id"]]
    assert confirm(client, accounts).status_code == 409
    linked = confirm(client, accounts, existing_transaction_id=manual["id"])
    assert linked.status_code == 201, linked.text
    assert linked.json()["transaction"]["id"] == manual["id"]
    assert client.get("/api/v1/transactions").json()["total"] == 1
    separate = confirm(client, accounts, fingerprint="b" * 64, duplicate_acknowledged=True)
    assert separate.status_code == 201
    assert client.get("/api/v1/transactions").json()["total"] == 2


def test_link_rejects_unrelated_or_reversed_record(client, accounts):
    other = client.post("/api/v1/transactions", json=payload(accounts, amount=60000)).json()
    assert confirm(client, accounts, existing_transaction_id=other["id"]).status_code == 422
    client.delete("/api/v1/transactions/" + other["id"])
    assert confirm(client, accounts, transaction=payload(accounts, amount=60000), existing_transaction_id=other["id"]).status_code == 422
    assert client.get("/api/v1/sms/receipts").json()["total"] == 0


def test_corrections_are_atomic_audited_retry_safe_and_detect_stale_edits(client, accounts):
    saved = confirm(client, accounts).json()
    original = saved["transaction"]["id"]
    data = {"transaction": payload(accounts, amount=50000, description="Corrected amount"), "expected_transaction_id": original, "edit_key": "correction-unique-1"}
    url = "/api/v1/sms/receipts/" + saved["id"]
    corrected = client.put(url, json=data)
    assert corrected.status_code == 200, corrected.text
    assert client.put(url, json=data).json() == corrected.json()
    assert corrected.json()["transaction"]["id"] != original
    assert client.get("/api/v1/transactions/" + original).json()["voided"] is True
    assert client.get("/api/v1/transactions").json()["total"] == 1
    bank = next(row for row in client.get("/api/v1/accounts").json() if row["name"] == "bank")
    assert bank["balance"] == 950000
    assert client.put(url, json={**data, "transaction": payload(accounts, amount=40000)}).status_code == 409
    assert client.put(url, json={**data, "edit_key": "another-edit-key"}).status_code == 409
    # Repeated original confirmation after a correction returns the current saved version.
    assert confirm(client, accounts).json()["transaction"]["id"] == corrected.json()["transaction"]["id"]
    audits = client.get("/api/v1/settings/export").json()["audit_events"]
    assert any(row["action"] == "transaction.replaced" and row["entity_id"] == original for row in audits)


def test_failed_correction_rolls_back_reversal(client, accounts):
    saved = confirm(client, accounts).json()
    original = saved["transaction"]["id"]
    category_from_nowhere = str(uuid4())
    response = client.put("/api/v1/sms/receipts/" + saved["id"], json={"transaction": payload(accounts, category_id=category_from_nowhere), "expected_transaction_id": original, "edit_key": "fails-safely-123"})
    assert response.status_code == 404
    assert client.get("/api/v1/transactions/" + original).json()["voided"] is False
    assert client.get("/api/v1/sms/receipts/" + saved["id"]).json()["transaction"]["id"] == original


def test_failed_commit_has_no_partial_receipt_or_ledger_write(client, accounts, monkeypatch):
    from sqlalchemy.orm import Session
    def fail(*args):
        raise RuntimeError("Simulated unavailable database commit")
    with monkeypatch.context() as patch:
        patch.setattr(Session, "commit", fail)
        assert confirm(client, accounts).status_code == 500
    assert client.get("/api/v1/sms/receipts").json()["total"] == 0
    assert client.get("/api/v1/transactions").json()["total"] == 0
    assert confirm(client, accounts).status_code == 201


def test_reused_old_correction_key_cannot_reactivate_a_voided_entry(client, accounts):
    saved = confirm(client, accounts).json()
    url = "/api/v1/sms/receipts/" + saved["id"]
    first = {"transaction": payload(accounts, amount=50000), "expected_transaction_id": saved["transaction"]["id"], "edit_key": "first-correction"}
    second_id = client.put(url, json=first).json()["transaction"]["id"]
    second = {"transaction": payload(accounts, amount=60000), "expected_transaction_id": second_id, "edit_key": "second-correction"}
    third_id = client.put(url, json=second).json()["transaction"]["id"]
    assert client.put(url, json={**first, "expected_transaction_id": third_id}).status_code == 409
    assert client.get(url).json()["transaction"]["id"] == third_id
    assert client.get("/api/v1/transactions/" + third_id).json()["voided"] is False


def test_two_messages_linked_to_one_payment_follow_its_correction(client, accounts):
    saved = confirm(client, accounts).json()
    linked = confirm(client, accounts, fingerprint="b" * 64, existing_transaction_id=saved["transaction"]["id"]).json()
    corrected = client.put("/api/v1/sms/receipts/" + saved["id"], json={"transaction": payload(accounts, amount=60000), "expected_transaction_id": saved["transaction"]["id"], "edit_key": "linked-entry-edit"})
    assert corrected.status_code == 200, corrected.text
    assert client.get("/api/v1/sms/receipts/" + linked["id"]).json()["transaction"]["id"] == corrected.json()["transaction"]["id"]
    assert client.get("/api/v1/transactions").json()["total"] == 1


def test_refunds_and_transfers_keep_accounting_rules(client, accounts):
    expense = confirm(client, accounts).json()["transaction"]
    refund = confirm(client, accounts, fingerprint="b" * 64, transaction=payload(accounts, kind="refund", original_id=expense["id"], amount=5000))
    assert refund.status_code == 201
    assert confirm(client, accounts, fingerprint="c" * 64, transaction=payload(accounts, kind="refund", original_id=expense["id"], amount=7551)).status_code == 422
    transfer = confirm(client, accounts, fingerprint="d" * 64, transaction=payload(accounts, kind="transfer", destination_id=accounts["cash"], amount=20000))
    assert transfer.status_code == 201
    bank = next(row for row in client.get("/api/v1/accounts").json() if row["name"] == "bank")
    assert bank["balance"] == 1000000 - 12550 + 5000 - 20000
    # A refunded original cannot be silently replaced.
    receipt = client.get("/api/v1/sms/lookup/" + "a" * 64).json()
    result = client.put("/api/v1/sms/receipts/" + receipt["id"], json={"transaction": payload(accounts, amount=1000), "expected_transaction_id": expense["id"], "edit_key": "blocked-edit-1"})
    assert result.status_code == 409


def test_ownership_and_message_privacy(client, accounts):
    saved = confirm(client, accounts).json()
    assert confirm(client, accounts, fingerprint="c" * 64, raw_message="private SMS").status_code == 422
    assert confirm(client, accounts, fingerprint="c" * 64, transaction=payload(accounts, source="manual")).status_code == 422
    export = client.get("/api/v1/settings/export").json()
    assert len(export["sms_receipts"]) == 1
    assert "raw_message" not in str(export["sms_receipts"])
    second = client.post("/api/v1/auth/register", json={"email": "other@example.com", "password": "different-password-123", "name": "Other"}).json()
    client.headers["Authorization"] = "Bearer " + second["access_token"]
    assert client.get("/api/v1/sms/receipts/" + saved["id"]).status_code == 404
    assert client.get("/api/v1/sms/lookup/" + "a" * 64).json() is None
    assert client.post("/api/v1/sms/lookup", json={"fingerprints": ["a" * 64]}).json() == []
    assert client.post("/api/v1/sms/duplicates", json=payload(accounts)).status_code == 404


def test_sms_receipts_are_removed_before_account_deletion(client, accounts):
    assert confirm(client, accounts).status_code == 201
    deleted = client.request("DELETE", "/api/v1/settings/account", json={"email": "test@example.com", "password": "secure-passphrase-123"})
    assert deleted.status_code == 200, deleted.text


@pytest.mark.skipif(not os.environ.get("TEST_DATABASE_URL"), reason="Requires PostgreSQL row locks")
def test_concurrent_sms_confirmation_is_one_ledger_event(client, accounts):
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: confirm(client, accounts), range(4)))
    assert all(result.status_code == 201 for result in results), [result.text for result in results]
    assert len({result.json()["id"] for result in results}) == 1
    assert client.get("/api/v1/transactions").json()["total"] == 1


@pytest.mark.skipif(not os.environ.get("TEST_DATABASE_URL"), reason="Requires PostgreSQL row locks")
def test_concurrent_sms_correction_does_not_apply_twice(client, accounts):
    saved = confirm(client, accounts).json()
    data = {"transaction": payload(accounts, amount=50000), "expected_transaction_id": saved["transaction"]["id"], "edit_key": "simultaneous-edit-1"}
    with ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(lambda _: client.put("/api/v1/sms/receipts/" + saved["id"], json=data), range(3)))
    assert all(result.status_code == 200 for result in results), [result.text for result in results]
    assert len({result.json()["transaction"]["id"] for result in results}) == 1
    assert client.get("/api/v1/transactions").json()["total"] == 1
