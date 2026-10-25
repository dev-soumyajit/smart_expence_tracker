"""Legacy pure normalizer. Mobile parsing runs locally in packages/contracts/sms.ts.

This helper never requests permissions, stores message text or writes ledger entries.
"""
from datetime import datetime
from decimal import Decimal
import re


def parse_sms(message: str, received_at: datetime):
    if len(message) > 2000 or received_at.tzinfo is None:
        return {"status": "unsupported", "reason": "Invalid input"}
    if re.search(r"\b(?:otp|one[ -]time|password|pin|cvv|failed|declined|pending|initiated|processing|scheduled|due|statement|reminder|offer|requested)\b|\b(?:will be|collect request|not debited|not credited)\b", message, re.I):
        return {"status": "unsupported", "reason": "Not a confirmed transaction alert"}
    matches = []
    for candidate in re.finditer(r"(?:INR|Rs\.?|₹)\s*([-+]?\d[\d,]*(?:\.\d+)?)(?![\w,]|\.\d)", message, re.I):
        before = message[max(0, candidate.start() - 48):candidate.start()]
        if re.search(r"(?:bal(?:ance)?|limit|outstanding)\s*(?:is|of|:|=)?\s*$", before, re.I):
            continue
        if not re.fullmatch(r"(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d{1,2})?", candidate[1]):
            return {"status": "unsupported", "reason": "Invalid amount; enter manually"}
        matches.append(candidate[1])
    if not matches:
        return {"status": "unsupported", "reason": "Amount not found"}
    values = {Decimal(value.replace(",", "")) * 100 for value in matches}
    if len(values) != 1:
        return {"status": "unsupported", "reason": "Multiple amounts require clarification"}
    amount = values.pop()
    if amount <= 0 or amount > 900_000_000_000_000:
        return {"status": "unsupported", "reason": "Amount outside supported range"}
    text = message.lower()
    if "atm" in text and re.search(r"\b(?:fees?|charges)\b", text):
        return {"status": "unsupported", "reason": "Confirm whether this is an ATM bank charge or cash withdrawal"}
    debit = bool(re.search(r"\b(debited|spent|paid|withdrawal|withdrawn|sent)\b", text))
    credit = bool(re.search(r"\b(credited|received|deposited)\b", text))
    kind = ("expense" if debit else "income") if debit != credit else None
    atm_withdrawal = "atm" in text and (bool(re.search(r"\b(?:withdrawal|withdrawn|wdl)\b", text)) or (debit and not re.search(r"\b(?:fees?|charges)\b", text)))
    if atm_withdrawal or re.search(r"credit.?card.*(?:repayment|payment (?:of|received))|(?:payment|paid).*\b(?:for|towards|to)\s+(?:your\s+)?credit.?card|credited for credit card payment", text):
        kind = "transfer"
    elif re.search(r"\b(refund|refunded|reversed)\b", text):
        kind = "refund"
    if not kind:
        return {"status": "unsupported", "reason": "Transaction direction is uncertain"}
    reference = re.search(r"(?:UPI\s*(?:ref(?:erence)?|txn)?|ref(?:erence)?)\s*[:#.-]?\s*(\d{8,24})", message, re.I)
    return {"status": "review_required", "amount": int(amount), "kind": kind, "occurred_at": received_at.isoformat(), "source": "sms", "external_reference": reference[1] if reference else None, "assumptions": "Message receipt time is a proposal, not the bank transaction time. Choose account, category and description. Transfers require a destination; refunds require the original expense. Never auto-create a record."}
