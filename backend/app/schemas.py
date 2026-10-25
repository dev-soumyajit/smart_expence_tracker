from datetime import datetime, date, timezone
from typing import Literal, Annotated
from pydantic import BaseModel, Field, EmailStr, ConfigDict, field_validator, model_validator
from zoneinfo import ZoneInfo

Money = Annotated[int, Field(strict=True, ge=0, le=900_000_000_000_000)]
PositiveMoney = Annotated[int, Field(strict=True, gt=0, le=900_000_000_000_000)]
Name = Annotated[str, Field(min_length=1, max_length=80)]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Register(Input):
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)
    name: Name


class Login(Input):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class Refresh(Input):
    refresh_token: str = Field(min_length=20, max_length=200)


class EmailCodeRequest(Input):
    email: EmailStr
    purpose: Literal["email_login", "password_reset"]


class EmailCodeResend(Input):
    challenge_id: str = Field(min_length=36, max_length=36, pattern=r"^[a-fA-F0-9-]{36}$")


class EmailCodeVerify(EmailCodeResend):
    code: str = Field(pattern=r"^[0-9]{6}$")
    purpose: Literal["verify_email", "email_login"]


class EmailPasswordReset(EmailCodeResend):
    code: str = Field(pattern=r"^[0-9]{6}$")
    new_password: str = Field(min_length=12, max_length=128)


class AccountIn(Input):
    name: Name
    type: Literal["bank", "cash", "credit", "other"]
    opening_balance: Annotated[int, Field(strict=True, ge=-900_000_000_000_000, le=900_000_000_000_000)] = 0


class AccountUpdate(Input):
    name: Name
    archived: bool = False


class CategoryIn(Input):
    name: Annotated[str, Field(min_length=1, max_length=60)]
    color: str = Field(default="#35D39A", pattern=r"^#[0-9a-fA-F]{6}$")


class TransactionIn(Input):
    account_id: str = Field(min_length=36, max_length=36)
    destination_id: str | None = None
    category_id: str | None = None
    original_id: str | None = None
    kind: Literal["income", "expense", "transfer", "refund"]
    amount: PositiveMoney
    description: str = Field(min_length=1, max_length=200)
    notes: str = Field(default="", max_length=1000)
    occurred_at: datetime
    source: Literal["manual", "csv", "voice", "recurring", "sms"] = "manual"

    @field_validator("occurred_at")
    @classmethod
    def aware_time(cls, value):
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Include a timezone offset")
        if value.astimezone(ZoneInfo("Asia/Kolkata")).date() > datetime.now(ZoneInfo("Asia/Kolkata")).date():
            raise ValueError("Use recurring reminders for future dates; ledger entries represent completed activity")
        return value.astimezone(timezone.utc)

    @model_validator(mode="after")
    def relationships(self):
        if (self.kind == "transfer") != bool(self.destination_id):
            raise ValueError("Only transfers require a destination")
        if self.destination_id == self.account_id:
            raise ValueError("Choose two different accounts")
        if (self.kind == "refund") != bool(self.original_id):
            raise ValueError("A refund must reference its original expense")
        return self


class BudgetIn(Input):
    name: Name
    category_id: str | None = None
    amount: PositiveMoney
    start_date: date
    end_date: date

    @model_validator(mode="after")
    def dates(self):
        if self.end_date < self.start_date or (self.end_date - self.start_date).days > 366:
            raise ValueError("Budget must span between 1 and 367 days")
        return self


class SmsConfirm(Input):
    fingerprint: str = Field(pattern=r"^[a-f0-9]{64}$")
    transaction: TransactionIn
    duplicate_acknowledged: bool = False
    existing_transaction_id: str | None = Field(default=None, min_length=36, max_length=36)


class SmsLookup(Input):
    fingerprints: list[Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]] = Field(min_length=1, max_length=150)


class SmsCorrection(Input):
    transaction: TransactionIn
    expected_transaction_id: str = Field(min_length=36, max_length=36)
    edit_key: str = Field(min_length=8, max_length=80, pattern=r"^[a-zA-Z0-9:_-]+$")
    duplicate_acknowledged: bool = False


class RecurringIn(Input):
    name: Name
    account_id: str
    amount: PositiveMoney
    next_due: date
    frequency: Literal["weekly", "monthly", "yearly"] = "monthly"
    essential: bool = True


class GoalIn(Input):
    name: Name
    target: PositiveMoney
    target_date: date


class ContributionIn(Input):
    amount: PositiveMoney


class Preferences(Input):
    name: Name
    salary_day: int = Field(ge=1, le=31)
    minimum_balance: Money


class Question(Input):
    question: str = Field(min_length=2, max_length=1000)
    share_with_ai: bool = False


class ImportIn(Input):
    account_id: str
    csv_text: str = Field(min_length=1, max_length=500_000)
    mapping: dict[str, str] = Field(default_factory=lambda: {"date": "date", "amount": "amount", "kind": "type", "description": "description"})
