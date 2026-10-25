"""Review-only SMS ingestion. The API never accepts raw SMS or sender information."""
from datetime import timedelta
from hashlib import sha256
from fastapi import HTTPException
from sqlalchemy import select
from .. import models as m, schemas as s
from .ledger import owned, pack, write, void, aware


def digest(data):
    return sha256(data.model_dump_json().encode()).hexdigest()


def checked(data):
    if data.source != "sms":
        raise HTTPException(422, "Reviewed SMS entries must use source sms")


def lock_user(db, user_id):
    db.scalar(select(m.User).where(m.User.id == user_id).with_for_update())


def response(db, receipt):
    return {"id": receipt.id, "fingerprint": receipt.fingerprint,
            "transaction": pack(owned(db, m.Transaction, receipt.user_id, receipt.transaction_id))}


def matches(db, user_id, data, exclude=None):
    # A warning, not an automatic merge: identical small purchases can be legitimate.
    query = select(m.Transaction).where(
        m.Transaction.user_id == user_id, m.Transaction.voided.is_(False),
        m.Transaction.account_id == data.account_id, m.Transaction.kind == data.kind,
        m.Transaction.amount == data.amount,
        m.Transaction.occurred_at >= data.occurred_at - timedelta(hours=24),
        m.Transaction.occurred_at <= data.occurred_at + timedelta(hours=24),
    )
    if exclude:
        query = query.where(m.Transaction.id != exclude)
    if data.kind == "transfer":
        query = query.where(m.Transaction.destination_id == data.destination_id)
    if data.kind == "refund":
        query = query.where(m.Transaction.original_id == data.original_id)
    return list(db.scalars(query.order_by(m.Transaction.occurred_at.desc()).limit(10)))


def duplicate_guard(db, user_id, data, acknowledged, exclude=None):
    possible = matches(db, user_id, data, exclude)
    if possible and not acknowledged:
        raise HTTPException(409, "A similar entry already exists. Review possible duplicates before saving separately.")


def confirm(db, user_id, data: s.SmsConfirm):
    checked(data.transaction)
    # Serializes simultaneous rescans/confirmations for this user, including different wallets.
    lock_user(db, user_id)
    receipt = db.scalar(select(m.SmsReceipt).where(m.SmsReceipt.user_id == user_id, m.SmsReceipt.fingerprint == data.fingerprint))
    if receipt:
        if receipt.confirmed_hash != digest(data.transaction):
            raise HTTPException(409, "This message is already saved. Open its saved entry to correct it.")
        return response(db, receipt)
    if data.existing_transaction_id:
        row = owned(db, m.Transaction, user_id, data.existing_transaction_id)
        # Linking must not silently bless an unrelated entry or write a second ledger row.
        if row.voided or any(getattr(row, key) != getattr(data.transaction, key) for key in ("account_id", "kind", "amount", "destination_id", "original_id")) or abs(aware(row.occurred_at) - data.transaction.occurred_at) > timedelta(hours=24):
            raise HTTPException(422, "Choose a matching active entry with the same wallet, type and amount within one day")
    else:
        for account_id in sorted(set(filter(None, [data.transaction.account_id, data.transaction.destination_id]))):
            owned(db, m.Account, user_id, account_id, lock=True)
        duplicate_guard(db, user_id, data.transaction, data.duplicate_acknowledged)
        row = write(db, user_id, data.transaction, "sms:" + data.fingerprint)
    receipt = m.SmsReceipt(user_id=user_id, fingerprint=data.fingerprint, transaction_id=row.id, confirmed_hash=digest(data.transaction))
    db.add(receipt)
    db.flush()
    db.add(m.Audit(user_id=user_id, entity_id=receipt.id, action="sms.confirmed", detail=row.id))
    return response(db, receipt)


def correct(db, user_id, row_id, data: s.SmsCorrection):
    checked(data.transaction)
    lock_user(db, user_id)
    receipt = owned(db, m.SmsReceipt, user_id, row_id, lock=True)
    payload_hash = digest(data.transaction)
    if receipt.last_edit_key == data.edit_key:
        if receipt.last_edit_hash != payload_hash:
            raise HTTPException(409, "Correction retry has different data. Reopen the entry.")
        return response(db, receipt)
    if receipt.transaction_id != data.expected_transaction_id:
        raise HTTPException(409, "This entry changed. Reopen it before making another correction.")
    edit_idempotency_key = "sms-edit:" + receipt.id + ":" + sha256(data.edit_key.encode()).hexdigest()[:32]
    if db.scalar(select(m.Transaction.id).where(m.Transaction.user_id == user_id, m.Transaction.idempotency_key == edit_idempotency_key)):
        raise HTTPException(409, "That correction key was already used. Reopen the latest entry.")
    original = owned(db, m.Transaction, user_id, receipt.transaction_id)
    # Keep the same lock order as every other ledger write/correction.
    for account_id in sorted(set(filter(None, [original.account_id, original.destination_id, data.transaction.account_id, data.transaction.destination_id]))):
        owned(db, m.Account, user_id, account_id, lock=True)
    original = owned(db, m.Transaction, user_id, original.id, lock=True)
    if original.voided:
        raise HTTPException(409, "This entry was reversed elsewhere. Review Activity before continuing.")
    duplicate_guard(db, user_id, data.transaction, data.duplicate_acknowledged, original.id)
    void(db, user_id, original.id)
    replacement = write(db, user_id, data.transaction, edit_idempotency_key)
    for linked in db.scalars(select(m.SmsReceipt).where(m.SmsReceipt.user_id == user_id, m.SmsReceipt.transaction_id == original.id)):
        linked.transaction_id = replacement.id
    receipt.transaction_id, receipt.last_edit_key, receipt.last_edit_hash = replacement.id, data.edit_key, payload_hash
    db.add(m.Audit(user_id=user_id, entity_id=original.id, action="transaction.replaced", detail=replacement.id))
    db.flush()
    return response(db, receipt)
