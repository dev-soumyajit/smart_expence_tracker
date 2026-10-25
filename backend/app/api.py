from datetime import datetime, date, timedelta, time, timezone
from typing import Annotated
import csv
import io
import json
from hashlib import sha256
from decimal import Decimal, InvalidOperation
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Header, Query, Request
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from sqlalchemy import select, func, or_, delete
from sqlalchemy.orm import Session as DB
from .core.db import get_db
from .core.security import current_user, auth_limit, passwords, dummy_hash, issue, token_hash, limit
from . import models as m, schemas as s
from .services.ledger import owned, pack, write, void, balances
from .services.finance import summary, budget_summary, goals, today, shift_month, IST
from .services.assistant import answer
from .services import sms, email_auth, mail
from .core.config import settings

router = APIRouter(prefix="/api/v1")
Database = Annotated[DB, Depends(get_db, scope="function")]
AuthUser = Annotated[m.User, Depends(current_user)]


def public_user(user):
    return email_auth.public_user(user)


def email_result(result, db, background):
    if result.jobs:
        # Function-scoped DB dependency commits before the response/background task is sent.
        background.add_task(mail.dispatch_ids, db.get_bind(), result.jobs)
    return JSONResponse(jsonable_encoder(result.body), status_code=result.status, headers=result.headers)


@router.post("/auth/register", status_code=201, dependencies=[Depends(auth_limit)])
def register(data: s.Register, db: Database, request: Request, background_tasks: BackgroundTasks):
    if settings().email_auth_enabled:
        return email_result(email_auth.register(db, data, request.client.host if request.client else "unknown"), db, background_tasks)
    email = str(data.email).lower()
    if db.scalar(select(m.User.id).where(m.User.email == email)):
        raise HTTPException(409, "Unable to register this email. Try signing in.")
    user = m.User(email=email, name=data.name, password_hash=passwords.hash(data.password))
    db.add(user)
    db.flush()
    for name, color in [("Food & dining", "#35D39A"), ("Shopping", "#7C8CFF"), ("Transport", "#E6B76A"), ("Bills & utilities", "#73B8E8"), ("Health", "#E48FA3"), ("Entertainment", "#B796EA"), ("Other", "#90A3B5")]:
        db.add(m.Category(user_id=user.id, name=name, color=color))
    return {**issue(db, user), "user": public_user(user)}


@router.post("/auth/login", dependencies=[Depends(auth_limit)])
def login(data: s.Login, db: Database, request: Request, background_tasks: BackgroundTasks):
    if settings().email_auth_enabled:
        return email_result(email_auth.password_login(db, data, request.client.host if request.client else "unknown"), db, background_tasks)
    user = db.scalar(select(m.User).where(m.User.email == str(data.email).lower()).with_for_update())
    valid = passwords.verify(data.password, user.password_hash if user else dummy_hash)
    if not user or not valid or user.signup_pending:
        raise HTTPException(401, "Incorrect email or password")
    return {**issue(db, user), "user": public_user(user)}


@router.post("/auth/refresh", dependencies=[Depends(auth_limit)])
def refresh(data: s.Refresh, db: Database):
    session = db.scalar(select(m.Session).where(m.Session.refresh_hash == token_hash(data.refresh_token), m.Session.revoked.is_(False), m.Session.expires_at > datetime.now(timezone.utc)).with_for_update())
    if not session:
        raise HTTPException(401, "Session expired")
    user = db.get(m.User, session.user_id)
    if not user or user.signup_pending or (settings().email_auth_enabled and not user.email_verified_at):
        raise HTTPException(401, "Verify your email by signing in again")
    return issue(db, user, session)


@router.post("/auth/email/request", dependencies=[Depends(auth_limit)])
def request_email_code(data: s.EmailCodeRequest, db: Database, request: Request, background_tasks: BackgroundTasks):
    result = email_auth.unavailable() or email_auth.request_code(db, data.email, data.purpose, request.client.host if request.client else "unknown")
    return email_result(result, db, background_tasks)


@router.post("/auth/email/resend", dependencies=[Depends(auth_limit)])
def resend_email_code(data: s.EmailCodeResend, db: Database, request: Request, background_tasks: BackgroundTasks):
    result = email_auth.unavailable() or email_auth.resend(db, data.challenge_id, request.client.host if request.client else "unknown")
    return email_result(result, db, background_tasks)


@router.post("/auth/email/verify", dependencies=[Depends(auth_limit)])
def verify_email_code(data: s.EmailCodeVerify, db: Database, request: Request, background_tasks: BackgroundTasks):
    result = email_auth.unavailable() or email_auth.verify(db, data, data.purpose, request.client.host if request.client else "unknown")
    return email_result(result, db, background_tasks)


@router.post("/auth/password/reset", dependencies=[Depends(auth_limit)])
def reset_password(data: s.EmailPasswordReset, db: Database, request: Request, background_tasks: BackgroundTasks):
    result = email_auth.unavailable() or email_auth.verify(db, data, "password_reset", request.client.host if request.client else "unknown")
    return email_result(result, db, background_tasks)


@router.post("/auth/logout")
def logout(user: AuthUser, db: Database):
    for session in db.scalars(select(m.Session).where(m.Session.user_id == user.id)):
        session.revoked = True
    return {"message": "All sessions signed out"}


@router.get("/auth/me")
def me(user: AuthUser):
    return public_user(user)


@router.get("/accounts")
def accounts(user: AuthUser, db: Database):
    return balances(db, user.id)


@router.post("/accounts", status_code=201)
def create_account(data: s.AccountIn, user: AuthUser, db: Database):
    account = m.Account(user_id=user.id, **data.model_dump())
    db.add(account)
    db.flush()
    return {**pack(account), "balance": account.opening_balance}


@router.patch("/accounts/{row_id}")
def update_account(row_id: str, data: s.AccountUpdate, user: AuthUser, db: Database):
    account = owned(db, m.Account, user.id, row_id, lock=True)
    account.name, account.archived = data.name, data.archived
    return pack(account)


@router.get("/categories")
def categories(user: AuthUser, db: Database):
    return [pack(c) for c in db.scalars(select(m.Category).where(m.Category.user_id == user.id).order_by(m.Category.name))]


@router.post("/categories", status_code=201)
def create_category(data: s.CategoryIn, user: AuthUser, db: Database):
    row = m.Category(user_id=user.id, **data.model_dump())
    db.add(row)
    db.flush()
    return pack(row)


@router.get("/transactions")
def transactions(user: AuthUser, db: Database, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), search: str = Query("", max_length=100), kind: str | None = None, account_id: str | None = None, category_id: str | None = None, source: str | None = None, start: date | None = None, end: date | None = None):
    conditions = [m.Transaction.user_id == user.id, m.Transaction.voided.is_(False)]
    if search:
        conditions.append(m.Transaction.description.ilike("%" + search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%", escape="\\"))
    if kind:
        conditions.append(m.Transaction.kind == kind)
    if account_id:
        conditions.append(or_(m.Transaction.account_id == account_id, m.Transaction.destination_id == account_id))
    if category_id:
        conditions.append(m.Transaction.category_id == category_id)
    if source:
        conditions.append(m.Transaction.source == source)
    if start:
        conditions.append(m.Transaction.occurred_at >= datetime.combine(start, time.min, IST).astimezone(timezone.utc))
    if end:
        conditions.append(m.Transaction.occurred_at < datetime.combine(end + timedelta(days=1), time.min, IST).astimezone(timezone.utc))
    total = db.scalar(select(func.count()).select_from(m.Transaction).where(*conditions))
    rows = db.scalars(select(m.Transaction).where(*conditions).order_by(m.Transaction.occurred_at.desc(), m.Transaction.id).offset((page - 1) * page_size).limit(page_size))
    return {"items": [pack(t) for t in rows], "total": total, "page": page, "page_size": page_size}


@router.post("/transactions", status_code=201)
def create_transaction(data: s.TransactionIn, user: AuthUser, db: Database, idempotency_key: str | None = Header(None, min_length=8, max_length=120)):
    return pack(write(db, user.id, data, idempotency_key))


@router.get("/transactions/{row_id}")
def transaction_detail(row_id: str, user: AuthUser, db: Database):
    return pack(owned(db, m.Transaction, user.id, row_id))


@router.delete("/transactions/{row_id}")
def reverse_transaction(row_id: str, user: AuthUser, db: Database):
    return pack(void(db, user.id, row_id))


@router.put("/transactions/{row_id}")
def revise_transaction(row_id: str, data: s.TransactionIn, user: AuthUser, db: Database):
    # Lock old and new accounts before correction, avoiding lock-order inversions.
    original = owned(db, m.Transaction, user.id, row_id)
    for account_id in sorted(set(filter(None, [original.account_id, original.destination_id, data.account_id, data.destination_id]))):
        owned(db, m.Account, user.id, account_id, lock=True)
    original = owned(db, m.Transaction, user.id, row_id, lock=True)
    if original.voided:
        raise HTTPException(409, "This transaction has already been reversed")
    void(db, user.id, row_id)
    replacement = write(db, user.id, data)
    db.add(m.Audit(user_id=user.id, entity_id=row_id, action="transaction.replaced", detail=replacement.id))
    return pack(replacement)


@router.get("/budgets")
def budgets(user: AuthUser, db: Database):
    return [budget_summary(db, b) for b in db.scalars(select(m.Budget).where(m.Budget.user_id == user.id).order_by(m.Budget.start_date.desc()))]


@router.post("/budgets", status_code=201)
def create_budget(data: s.BudgetIn, user: AuthUser, db: Database):
    if data.category_id:
        owned(db, m.Category, user.id, data.category_id)
    budget = m.Budget(user_id=user.id, **data.model_dump())
    db.add(budget)
    db.flush()
    return budget_summary(db, budget)


@router.put("/budgets/{row_id}")
def update_budget(row_id: str, data: s.BudgetIn, user: AuthUser, db: Database):
    budget = owned(db, m.Budget, user.id, row_id)
    if data.category_id:
        owned(db, m.Category, user.id, data.category_id)
    for key, value in data.model_dump().items():
        setattr(budget, key, value)
    db.flush()
    return budget_summary(db, budget)


@router.get("/dashboard")
def dashboard(user: AuthUser, db: Database, start: date | None = None, end: date | None = None):
    if (start is None) != (end is None) or (start and (end < start or (end - start).days > 366)):
        raise HTTPException(422, "Provide both dates spanning at most 367 days")
    return summary(db, user, start, end)


@router.get("/recurring")
def recurring(user: AuthUser, db: Database):
    return [pack(r) for r in db.scalars(select(m.Recurring).where(m.Recurring.user_id == user.id, m.Recurring.active.is_(True)).order_by(m.Recurring.next_due))]


@router.post("/recurring", status_code=201)
def create_recurring(data: s.RecurringIn, user: AuthUser, db: Database):
    account = owned(db, m.Account, user.id, data.account_id)
    if account.archived:
        raise HTTPException(409, "This account is archived")
    rule = m.Recurring(user_id=user.id, **data.model_dump(), anchor_day=data.next_due.day)
    db.add(rule)
    db.flush()
    return pack(rule)


@router.post("/recurring/{row_id}/confirm")
def confirm_recurring(row_id: str, user: AuthUser, db: Database, due_date: date = Query(...)):
    rule = owned(db, m.Recurring, user.id, row_id, lock=True)
    key = f"recurring:{row_id}:{due_date}"
    previous = db.scalar(select(m.Transaction).where(m.Transaction.user_id == user.id, m.Transaction.idempotency_key == key))
    if previous:
        return pack(previous)
    if not rule.active or rule.next_due != due_date:
        raise HTTPException(409, "This scheduled occurrence is no longer current")
    if due_date > today():
        raise HTTPException(422, "Confirm on or after the due date")
    row = write(db, user.id, s.TransactionIn(account_id=rule.account_id, kind="expense", amount=rule.amount, description=rule.name, occurred_at=datetime.combine(due_date, time(12), IST), source="recurring"), key)
    rule.next_due = rule.next_due + timedelta(days=7) if rule.frequency == "weekly" else shift_month(rule.next_due, 12 if rule.frequency == "yearly" else 1, rule.anchor_day)
    return pack(row)


@router.delete("/recurring/{row_id}")
def cancel_recurring(row_id: str, user: AuthUser, db: Database):
    owned(db, m.Recurring, user.id, row_id).active = False
    return {"message": "Reminder cancelled"}


@router.get("/goals")
def list_goals(user: AuthUser, db: Database):
    return goals(db, user.id)


@router.post("/goals", status_code=201)
def create_goal(data: s.GoalIn, user: AuthUser, db: Database):
    row = m.Goal(user_id=user.id, **data.model_dump())
    db.add(row)
    db.flush()
    return pack(row)


@router.post("/goals/{row_id}/contributions", status_code=201)
def contribute(row_id: str, data: s.ContributionIn, user: AuthUser, db: Database):
    owned(db, m.Goal, user.id, row_id, lock=True)
    row = m.Contribution(user_id=user.id, goal_id=row_id, amount=data.amount)
    db.add(row)
    db.flush()
    return pack(row)


@router.get("/goals/{row_id}/contributions")
def contributions(row_id: str, user: AuthUser, db: Database):
    owned(db, m.Goal, user.id, row_id)
    return [pack(c) for c in db.scalars(select(m.Contribution).where(m.Contribution.user_id == user.id, m.Contribution.goal_id == row_id).order_by(m.Contribution.created_at.desc()))]


@router.patch("/settings")
def preferences(data: s.Preferences, user: AuthUser):
    for key, value in data.model_dump().items():
        setattr(user, key, value)
    return public_user(user)


@router.get("/settings/export")
def export(user: AuthUser, db: Database):
    limit("export:" + user.id, 2, 3600)
    # Explicit export is bounded to avoid loading unlimited history on a modest server.
    count = db.scalar(select(func.count()).select_from(m.Transaction).where(m.Transaction.user_id == user.id))
    if count > 50000:
        raise HTTPException(413, "Large export requires an operator-assisted encrypted database export")
    result = {"profile": public_user(user)}
    for model in [m.Account, m.Category, m.Transaction, m.SmsReceipt, m.Budget, m.Recurring, m.Goal, m.Contribution, m.Audit]:
        result[model.__tablename__] = [pack(row) for row in db.scalars(select(model).where(model.user_id == user.id))]
    return result


@router.delete("/settings/account")
def delete_user(data: s.Login, user: AuthUser, db: Database):
    if str(data.email).lower() != user.email or not passwords.verify(data.password, user.password_hash):
        raise HTTPException(403, "Verify your email and password")
    # Remove dependent rows explicitly; self-referencing refunds precede original transactions.
    for model in [m.Audit, m.Contribution, m.Goal, m.Budget, m.Recurring, m.ImportJob, m.SmsReceipt, m.MailJob, m.EmailChallenge]:
        db.execute(delete(model).where(model.user_id == user.id))
    db.execute(delete(m.Transaction).where(m.Transaction.user_id == user.id, m.Transaction.kind == "refund"))
    db.execute(delete(m.Transaction).where(m.Transaction.user_id == user.id))
    for model in [m.Category, m.Account, m.Session]:
        db.execute(delete(model).where(model.user_id == user.id))
    db.delete(user)
    return {"message": "Account and financial records deleted"}


@router.post("/imports/preview", status_code=201)
def preview_import(data: s.ImportIn, user: AuthUser, db: Database):
    limit("import:" + user.id, 10)
    owned(db, m.Account, user.id, data.account_id)
    digest = sha256((json.dumps(data.mapping, sort_keys=True) + data.csv_text).encode()).hexdigest()
    existing = db.scalar(select(m.ImportJob).where(m.ImportJob.user_id == user.id, m.ImportJob.account_id == data.account_id, m.ImportJob.content_hash == digest))
    if existing:
        return import_status(existing.id, user, db)
    reader = csv.DictReader(io.StringIO(data.csv_text.lstrip("\ufeff")))
    required = {"date", "amount", "kind", "description"}
    if not required.issubset(data.mapping) or not reader.fieldnames or not set(data.mapping.values()).issubset(reader.fieldnames):
        raise HTTPException(422, "Map date, amount, kind and description to existing CSV columns")
    job = m.ImportJob(user_id=user.id, account_id=data.account_id, content_hash=digest)
    db.add(job)
    db.flush()
    seen = set()
    for index, raw in enumerate(reader, 1):
        if index > 1000:
            raise HTTPException(413, "Maximum 1,000 rows per import")
        error, normalized = None, {}
        try:
            values = {key: raw[column] for key, column in data.mapping.items()}
            amount = Decimal(values["amount"].replace(",", "").replace("₹", "").strip()) * 100
            if not amount.is_finite() or amount != amount.to_integral_value():
                raise ValueError()
            timestamp = datetime.fromisoformat(values["date"])
            if timestamp.tzinfo is None:
                timestamp = timestamp.replace(tzinfo=IST)
            kind = values["kind"].lower().strip()
            if kind not in ("income", "expense"):
                raise ValueError()
            transaction = s.TransactionIn(account_id=data.account_id, kind=kind, amount=int(amount), description=values["description"], occurred_at=timestamp, source="csv")
            normalized = transaction.model_dump(mode="json")
            normalized_key = json.dumps(normalized, sort_keys=True)
            possible = db.scalar(select(m.Transaction.id).where(m.Transaction.user_id == user.id, m.Transaction.account_id == data.account_id, m.Transaction.amount == transaction.amount, m.Transaction.kind == kind, m.Transaction.occurred_at == transaction.occurred_at, m.Transaction.voided.is_(False)).limit(1))
            if possible or normalized_key in seen:
                error = "Possible duplicate: matching account, amount, type and timestamp; skipped"
            seen.add(normalized_key)
        except (ValueError, TypeError, KeyError, InvalidOperation):
            error = "Invalid row: use ISO date, positive INR amount and income/expense type"
        db.add(m.ImportRecord(job_id=job.id, row_number=index, data=json.dumps(normalized), error=error))
    db.flush()
    return import_status(job.id, user, db)


@router.get("/imports/{row_id}")
def import_status(row_id: str, user: AuthUser, db: Database):
    job = owned(db, m.ImportJob, user.id, row_id)
    records = [{**pack(r), "data": json.loads(r.data)} for r in db.scalars(select(m.ImportRecord).where(m.ImportRecord.job_id == row_id).order_by(m.ImportRecord.row_number))]
    return {**pack(job), "records": records}


@router.post("/imports/{row_id}/commit")
def commit_import(row_id: str, user: AuthUser, db: Database):
    job = owned(db, m.ImportJob, user.id, row_id, lock=True)
    count = 0
    if not job.committed:
        owned(db, m.Account, user.id, job.account_id, lock=True)
        for record in db.scalars(select(m.ImportRecord).where(m.ImportRecord.job_id == row_id, m.ImportRecord.error.is_(None)).order_by(m.ImportRecord.row_number)):
            data = s.TransactionIn.model_validate_json(record.data)
            duplicate = db.scalar(select(m.Transaction.id).where(m.Transaction.user_id == user.id, m.Transaction.account_id == job.account_id, m.Transaction.amount == data.amount, m.Transaction.kind == data.kind, m.Transaction.occurred_at == data.occurred_at, m.Transaction.voided.is_(False)).limit(1))
            if duplicate:
                record.error = "Duplicate found during commit; skipped"
                continue
            write(db, user.id, data, f"csv:{job.id}:{record.row_number}")
            count += 1
        job.committed = True
    return {"id": job.id, "committed": True, "imported": count}


@router.post("/ai/ask")
async def ask(data: s.Question, user: AuthUser, db: Database):
    limit("ai:" + user.id, 10)
    return await answer(db, user, data.question, data.share_with_ai)


@router.get("/sms/receipts")
def sms_receipts(user: AuthUser, db: Database, page: int = Query(1, ge=1), page_size: int = Query(30, ge=1, le=100)):
    conditions = [m.SmsReceipt.user_id == user.id]
    total = db.scalar(select(func.count()).select_from(m.SmsReceipt).where(*conditions))
    rows = db.scalars(select(m.SmsReceipt).where(*conditions).order_by(m.SmsReceipt.created_at.desc(), m.SmsReceipt.id).offset((page - 1) * page_size).limit(page_size))
    return {"items": [sms.response(db, row) for row in rows], "total": total, "page": page, "page_size": page_size}


@router.get("/sms/receipts/{row_id}")
def sms_receipt(row_id: str, user: AuthUser, db: Database):
    return sms.response(db, owned(db, m.SmsReceipt, user.id, row_id))


@router.get("/sms/lookup/{fingerprint}")
def sms_lookup(fingerprint: str, user: AuthUser, db: Database):
    row = db.scalar(select(m.SmsReceipt).where(m.SmsReceipt.user_id == user.id, m.SmsReceipt.fingerprint == fingerprint))
    return sms.response(db, row) if row else None


@router.post("/sms/lookup")
def sms_lookup_batch(data: s.SmsLookup, user: AuthUser, db: Database):
    return [row.fingerprint for row in db.scalars(select(m.SmsReceipt).where(m.SmsReceipt.user_id == user.id, m.SmsReceipt.fingerprint.in_(data.fingerprints)))]


@router.post("/sms/duplicates")
def sms_duplicates(data: s.TransactionIn, user: AuthUser, db: Database):
    owned(db, m.Account, user.id, data.account_id)
    return [pack(row) for row in sms.matches(db, user.id, data)]


@router.post("/sms/confirm", status_code=201)
def sms_confirm(data: s.SmsConfirm, user: AuthUser, db: Database):
    limit("sms:" + user.id, 60)
    return sms.confirm(db, user.id, data)


@router.put("/sms/receipts/{row_id}")
def sms_correct(row_id: str, data: s.SmsCorrection, user: AuthUser, db: Database):
    return sms.correct(db, user.id, row_id, data)
