from datetime import datetime, timezone
import pytest
from app.services.ingestion import parse_sms


@pytest.mark.parametrize("text,kind,amount", [
    ("Your A/c XX1234 debited INR 1,250.50. UPI Ref 123456789012", "expense", 125050),
    ("ATM cash withdrawal Rs. 2,000.00 debited", "transfer", 200000),
    ("INR 5,000 credited for credit card payment", "transfer", 500000),
    ("Rs 300 refunded to account", "refund", 30000),
    ("INR 75,000 credited as salary", "income", 7500000),
])
def test_normalized_sms_requires_review(text, kind, amount):
    result = parse_sms(text, datetime.now(timezone.utc))
    assert result["status"] == "review_required"
    assert result["kind"] == kind and result["amount"] == amount
    assert "XX1234" not in str(result)  # Masked account text is never copied into normalized fields.


def test_ambiguous_sms_is_not_an_expense():
    assert parse_sms("Balance INR 5,000", datetime.now(timezone.utc))["status"] == "unsupported"


@pytest.mark.parametrize("message", ["OTP 123456 for INR 50 paid", "INR -5 debited", "INR 1.999 paid", "INR 12,34 debited", "INR 100 debited and credited", "INR 50 paid, fee INR 5", "INR 100 will be credited", "INR 100 payment failed", "INR 1e3 debited", "INR 1.2.3 debited"])
def test_unsafe_sms_never_proposes_a_ledger_entry(message):
    assert parse_sms(message, datetime.now(timezone.utc))["status"] == "unsupported"


def test_transaction_amount_wins_over_available_balance():
    result = parse_sms("Avl balance INR 5000. A/c XX1234 debited INR 150", datetime.now(timezone.utc))
    assert result["amount"] == 15000


def test_credit_card_purchase_is_not_repayment():
    result = parse_sms("Paid INR 150 to Cafe using credit card XX1234", datetime.now(timezone.utc))
    assert result["kind"] == "expense"
    assert parse_sms("Your account debited INR 23.60 for ATM withdrawal fees", datetime.now(timezone.utc))["status"] == "unsupported"
