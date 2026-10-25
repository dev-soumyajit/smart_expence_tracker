from datetime import datetime, timezone
from hashlib import sha256
import json
from fastapi import HTTPException
from sqlalchemy import select, func, case, or_
from sqlalchemy.orm import Session
from ..models import Account, Category, Transaction, Audit
from ..schemas import TransactionIn


def owned(db: Session, model, user_id: str, row_id: str, lock=False):
    query = select(model).where(model.id == row_id, model.user_id == user_id)
    if lock:
        query = query.with_for_update().execution_options(populate_existing=True)
    result = db.scalar(query)
    if result is None:
        raise HTTPException(404, "Record not found")
    return result


def pack(row):
    return {c.name: aware(value) if isinstance(value := getattr(row, c.name), datetime) else value for c in row.__table__.columns}


def write(db: Session, user_id: str, data: TransactionIn, key: str | None = None):
    fingerprint = sha256(data.model_dump_json().encode()).hexdigest()
    # Lock involved accounts in a stable order; PostgreSQL serializes competing writes.
    for account_id in sorted(set(filter(None, [data.account_id, data.destination_id]))):
        account = owned(db, Account, user_id, account_id, lock=True)
        if account.archived:
            raise HTTPException(409, "This account is archived")
    if key:
        previous = db.scalar(select(Transaction).where(Transaction.user_id == user_id, Transaction.idempotency_key == key))
        if previous:
            if previous.payload_hash != fingerprint:
                raise HTTPException(409, "Idempotency key already used for different transaction data")
            return previous
    if data.category_id:
        owned(db, Category, user_id, data.category_id)
    if data.kind == "refund":
        original = owned(db, Transaction, user_id, data.original_id, lock=True)
        if original.voided or original.kind != "expense" or original.account_id != data.account_id:
            raise HTTPException(422, "Refund must return to the original expense account")
        if data.occurred_at < aware(original.occurred_at):
            raise HTTPException(422, "A refund cannot precede its expense")
        refunded = db.scalar(select(func.coalesce(func.sum(Transaction.amount), 0)).where(Transaction.original_id == original.id, Transaction.user_id == user_id, Transaction.voided.is_(False)))
        if refunded + data.amount > original.amount:
            raise HTTPException(422, "Refund exceeds the remaining original expense")
        data = data.model_copy(update={"category_id": original.category_id})
    row = Transaction(user_id=user_id, **data.model_dump(), idempotency_key=key, payload_hash=fingerprint)
    db.add(row)
    db.flush()
    db.add(Audit(user_id=user_id, entity_id=row.id, action="transaction.created"))
    return row


def aware(dt):
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def balances(db: Session, user_id: str):
    # Two indexed grouped aggregates, rather than loading history or storing mutable totals.
    outgoing = dict(db.execute(select(Transaction.account_id, func.sum(case((Transaction.kind.in_(["income", "refund"]), Transaction.amount), else_=-Transaction.amount))).where(Transaction.user_id == user_id, Transaction.voided.is_(False)).group_by(Transaction.account_id)).all())
    incoming = dict(db.execute(select(Transaction.destination_id, func.sum(Transaction.amount)).where(Transaction.user_id == user_id, Transaction.kind == "transfer", Transaction.voided.is_(False)).group_by(Transaction.destination_id)).all())
    return [{**pack(a), "balance": a.opening_balance + int(outgoing.get(a.id, 0)) + int(incoming.get(a.id, 0))} for a in db.scalars(select(Account).where(Account.user_id == user_id).order_by(Account.created_at))]


def void(db: Session, user_id: str, row_id: str):
    initial = owned(db, Transaction, user_id, row_id)
    for account_id in sorted(set(filter(None, [initial.account_id, initial.destination_id]))):
        owned(db, Account, user_id, account_id, lock=True)
    row = owned(db, Transaction, user_id, row_id, lock=True)
    if db.scalar(select(Transaction.id).where(Transaction.user_id == user_id, Transaction.original_id == row_id, Transaction.voided.is_(False)).limit(1)):
        raise HTTPException(409, "Reverse associated refunds before correcting the original expense")
    if not row.voided:
        row.voided = True
        db.add(Audit(user_id=user_id, entity_id=row.id, action="transaction.reversed", detail=json.dumps(pack(row), default=str)))
    db.flush()
    return row
