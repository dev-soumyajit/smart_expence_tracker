from datetime import datetime, timezone, date
from uuid import uuid4
from sqlalchemy import String, Integer, BigInteger, Boolean, DateTime, Date, ForeignKey, ForeignKeyConstraint, UniqueConstraint, CheckConstraint, Index, Text, false
from sqlalchemy.orm import Mapped, mapped_column
from .core.db import Base


def uid():
    return str(uuid4())


def utcnow():
    return datetime.now(timezone.utc)


class Row:
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class User(Row, Base):
    __tablename__ = "users"
    email: Mapped[str] = mapped_column(String(254), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    password_hash: Mapped[str] = mapped_column(String(255))
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    signup_pending: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    salary_day: Mapped[int] = mapped_column(Integer, default=1)
    minimum_balance: Mapped[int] = mapped_column(BigInteger, default=0)
    __table_args__ = (CheckConstraint("salary_day BETWEEN 1 AND 31"), CheckConstraint("minimum_balance >= 0"))


class EmailThrottle(Base):
    __tablename__ = "email_throttles"
    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    count: Mapped[int] = mapped_column(Integer, default=0)
    last_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class EmailChallenge(Row, Base):
    __tablename__ = "email_challenges"
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    email_key: Mapped[str] = mapped_column(String(64), index=True)
    purpose: Mapped[str] = mapped_column(String(24))
    code_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    superseded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    registration_password_hash: Mapped[str | None] = mapped_column(String(255))
    registration_name: Mapped[str | None] = mapped_column(String(80))
    __table_args__ = (CheckConstraint("purpose IN ('verify_email','email_login','password_reset')"), CheckConstraint("attempts >= 0"))


class MailJob(Row, Base):
    __tablename__ = "mail_jobs"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    challenge_id: Mapped[str | None] = mapped_column(ForeignKey("email_challenges.id", ondelete="CASCADE"))
    event_key: Mapped[str] = mapped_column(String(120), unique=True)
    kind: Mapped[str] = mapped_column(String(24))
    payload: Mapped[str] = mapped_column(Text)  # OTP placeholder only; never a code or password.
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    provider_id: Mapped[str | None] = mapped_column(String(100))
    last_error: Mapped[str | None] = mapped_column(String(50))
    __table_args__ = (CheckConstraint("status IN ('pending','sending','retry','sent','failed','expired')"), CheckConstraint("attempts >= 0"))


class Session(Row, Base):
    __tablename__ = "sessions"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    refresh_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)


class Account(Row, Base):
    __tablename__ = "financial_accounts"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    type: Mapped[str] = mapped_column(String(16))
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    opening_balance: Mapped[int] = mapped_column(BigInteger, default=0)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    __table_args__ = (UniqueConstraint("user_id", "id"), CheckConstraint("type IN ('bank','cash','credit','other')"), CheckConstraint("currency = 'INR'"))


class Category(Row, Base):
    __tablename__ = "categories"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(60))
    color: Mapped[str] = mapped_column(String(7), default="#35D39A")
    __table_args__ = (UniqueConstraint("user_id", "id"), UniqueConstraint("user_id", "name"))


class Transaction(Row, Base):
    __tablename__ = "transactions"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    account_id: Mapped[str] = mapped_column(String(36))
    destination_id: Mapped[str | None] = mapped_column(String(36))
    category_id: Mapped[str | None] = mapped_column(String(36))
    original_id: Mapped[str | None] = mapped_column(String(36))
    kind: Mapped[str] = mapped_column(String(16))
    amount: Mapped[int] = mapped_column(BigInteger)
    description: Mapped[str] = mapped_column(String(200))
    notes: Mapped[str] = mapped_column(String(1000), default="")
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    source: Mapped[str] = mapped_column(String(16), default="manual")
    idempotency_key: Mapped[str | None] = mapped_column(String(120))
    payload_hash: Mapped[str] = mapped_column(String(64))
    voided: Mapped[bool] = mapped_column(Boolean, default=False)
    __table_args__ = (
        UniqueConstraint("user_id", "id"), UniqueConstraint("user_id", "idempotency_key"),
        ForeignKeyConstraint(["user_id", "account_id"], ["financial_accounts.user_id", "financial_accounts.id"]),
        ForeignKeyConstraint(["user_id", "destination_id"], ["financial_accounts.user_id", "financial_accounts.id"]),
        ForeignKeyConstraint(["user_id", "category_id"], ["categories.user_id", "categories.id"]),
        ForeignKeyConstraint(["user_id", "original_id"], ["transactions.user_id", "transactions.id"]),
        CheckConstraint("amount > 0 AND amount <= 900000000000000"),
        CheckConstraint("kind IN ('income','expense','transfer','refund')"),
        CheckConstraint("(kind = 'transfer' AND destination_id IS NOT NULL AND destination_id <> account_id) OR (kind <> 'transfer' AND destination_id IS NULL)"),
        CheckConstraint("(kind = 'refund' AND original_id IS NOT NULL) OR (kind <> 'refund' AND original_id IS NULL)"),
        Index("ix_transactions_owner_time", "user_id", "occurred_at"),
    )


class SmsReceipt(Row, Base):
    """Only a device-generated digest and reviewed ledger links; never message bodies."""
    __tablename__ = "sms_receipts"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    fingerprint: Mapped[str] = mapped_column(String(64))
    transaction_id: Mapped[str] = mapped_column(String(36))
    confirmed_hash: Mapped[str] = mapped_column(String(64))
    last_edit_key: Mapped[str | None] = mapped_column(String(80))
    last_edit_hash: Mapped[str | None] = mapped_column(String(64))
    __table_args__ = (
        UniqueConstraint("user_id", "fingerprint"),
        ForeignKeyConstraint(["user_id", "transaction_id"], ["transactions.user_id", "transactions.id"]),
    )


class Budget(Row, Base):
    __tablename__ = "budgets"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    category_id: Mapped[str | None] = mapped_column(String(36))
    amount: Mapped[int] = mapped_column(BigInteger)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    __table_args__ = (ForeignKeyConstraint(["user_id", "category_id"], ["categories.user_id", "categories.id"]), CheckConstraint("amount > 0"), CheckConstraint("end_date >= start_date"))


class Recurring(Row, Base):
    __tablename__ = "recurring_rules"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    account_id: Mapped[str] = mapped_column(String(36))
    amount: Mapped[int] = mapped_column(BigInteger)
    next_due: Mapped[date] = mapped_column(Date)
    anchor_day: Mapped[int] = mapped_column(Integer)
    frequency: Mapped[str] = mapped_column(String(16), default="monthly")
    essential: Mapped[bool] = mapped_column(Boolean, default=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    __table_args__ = (ForeignKeyConstraint(["user_id", "account_id"], ["financial_accounts.user_id", "financial_accounts.id"]), CheckConstraint("amount > 0"), CheckConstraint("anchor_day BETWEEN 1 AND 31"), CheckConstraint("frequency IN ('weekly','monthly','yearly')"))


class Goal(Row, Base):
    __tablename__ = "savings_goals"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    target: Mapped[int] = mapped_column(BigInteger)
    target_date: Mapped[date] = mapped_column(Date)
    __table_args__ = (UniqueConstraint("user_id", "id"), CheckConstraint("target > 0"))


class Contribution(Row, Base):
    __tablename__ = "savings_contributions"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    goal_id: Mapped[str] = mapped_column(String(36))
    amount: Mapped[int] = mapped_column(BigInteger)
    __table_args__ = (ForeignKeyConstraint(["user_id", "goal_id"], ["savings_goals.user_id", "savings_goals.id"]), CheckConstraint("amount > 0"))


class ImportJob(Row, Base):
    __tablename__ = "import_jobs"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    account_id: Mapped[str] = mapped_column(String(36))
    content_hash: Mapped[str] = mapped_column(String(64))
    committed: Mapped[bool] = mapped_column(Boolean, default=False)
    __table_args__ = (ForeignKeyConstraint(["user_id", "account_id"], ["financial_accounts.user_id", "financial_accounts.id"]), UniqueConstraint("user_id", "account_id", "content_hash"))


class ImportRecord(Row, Base):
    __tablename__ = "import_records"
    job_id: Mapped[str] = mapped_column(ForeignKey("import_jobs.id", ondelete="CASCADE"), index=True)
    row_number: Mapped[int] = mapped_column(Integer)
    data: Mapped[str] = mapped_column(Text)
    error: Mapped[str | None] = mapped_column(String(200))
    __table_args__ = (UniqueConstraint("job_id", "row_number"),)


class Audit(Row, Base):
    __tablename__ = "audit_events"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    entity_id: Mapped[str] = mapped_column(String(36))
    action: Mapped[str] = mapped_column(String(40))
    detail: Mapped[str] = mapped_column(Text, default="")
