"""Email-only authentication. Expected failures return values so attempt counters commit."""
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
import hmac
import math
from secrets import token_urlsafe
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from .. import models as m
from ..core.config import settings
from ..core.security import passwords, dummy_hash, issue
from .ledger import aware
from . import mail


@dataclass
class Result:
    body: dict
    status: int = 200
    headers: dict = field(default_factory=dict)
    jobs: list[str] = field(default_factory=list)


def unavailable():
    if not settings().email_auth_enabled:
        return Result({"detail": "Email authentication is not configured. Please use password sign-in."}, 503)


def public_user(user):
    return {**{key: getattr(user, key) for key in ("id", "name", "email", "salary_day", "minimum_balance")}, "email_verified": user.email_verified_at is not None}


def bucket(db, key, now):
    insert = pg_insert if db.get_bind().dialect.name == "postgresql" else sqlite_insert
    db.execute(insert(m.EmailThrottle).values(key=key, window_start=now, count=0).on_conflict_do_nothing(index_elements=["key"]))
    row = db.scalar(select(m.EmailThrottle).where(m.EmailThrottle.key == key).with_for_update().execution_options(populate_existing=True))
    if now - aware(row.window_start) >= timedelta(hours=1):
        row.window_start, row.count = now, 0
    return row


def limited(seconds):
    seconds = max(1, math.ceil(seconds))
    return Result({"detail": f"Please wait {seconds} seconds before requesting another code."}, 429, {"Retry-After": str(seconds)})


def reserve_send(db, email_key, ip, now):
    config = settings()
    keys = {"email:" + email_key: config.email_hourly_limit,
            "ip:" + mail.keyed("mail-ip:" + ip): config.email_ip_hourly_limit,
            "global:mail": config.email_global_hourly_limit}
    rows = {key: bucket(db, key, now) for key in sorted(keys)}
    email_row = rows["email:" + email_key]
    if email_row.last_sent_at and (now - aware(email_row.last_sent_at)).total_seconds() < config.email_resend_cooldown_seconds:
        return limited(config.email_resend_cooldown_seconds - (now - aware(email_row.last_sent_at)).total_seconds())
    for key, row in rows.items():
        if row.count >= keys[key]:
            return limited((aware(row.window_start) + timedelta(hours=1) - now).total_seconds())
    for row in rows.values():
        row.count += 1
    email_row.last_sent_at = now


def create_challenge(db, email_key, purpose, user, now, password_hash=None, name=None):
    # Serialize the sender state before this call; invalidate earlier codes for this purpose.
    for previous in db.scalars(select(m.EmailChallenge).where(m.EmailChallenge.email_key == email_key, m.EmailChallenge.purpose == purpose, m.EmailChallenge.consumed_at.is_(None), m.EmailChallenge.superseded_at.is_(None))):
        previous.superseded_at = now
    challenge = m.EmailChallenge(id=m.uid(), user_id=user.id if user else None, email_key=email_key, purpose=purpose,
        code_hash="", expires_at=now + timedelta(seconds=settings().email_otp_expiry_seconds),
        registration_password_hash=password_hash, registration_name=name)
    challenge.code_hash = mail.code_hash(challenge, mail.challenge_code(challenge))
    db.add(challenge)
    db.flush()
    jobs = [mail.enqueue(db, user, purpose, "otp:" + challenge.id, challenge, name)] if user else []
    return Result({"status": "code_required", "challenge_id": challenge.id, "purpose": purpose,
        "expires_in": settings().email_otp_expiry_seconds, "resend_after": settings().email_resend_cooldown_seconds,
        "message": "If this address is eligible, an email code will arrive shortly. Check your inbox and spam folder. Use only the latest code."}, 202, jobs=jobs)


def seed_categories(db, user):
    for name, color in [("Food & dining", "#35D39A"), ("Shopping", "#7C8CFF"), ("Transport", "#E6B76A"), ("Bills & utilities", "#73B8E8"), ("Health", "#E48FA3"), ("Entertainment", "#B796EA"), ("Other", "#90A3B5")]:
        db.add(m.Category(user_id=user.id, name=name, color=color))


def register(db, data, ip):
    email, now = str(data.email).lower(), datetime.now(timezone.utc)
    email_key = mail.keyed("mail-email:" + email)
    blocked = reserve_send(db, email_key, ip, now)
    if blocked:
        return blocked
    proposed_hash = passwords.hash(data.password)
    user = db.scalar(select(m.User).where(m.User.email == email).with_for_update().execution_options(populate_existing=True))
    if user and not user.signup_pending:
        return create_challenge(db, email_key, "verify_email", None, now)
    if not user:
        # The proposed password is bound to its emailed challenge, not an unverified mailbox.
        user = m.User(email=email, name=data.name, password_hash=dummy_hash, signup_pending=True)
        db.add(user)
        db.flush()
        seed_categories(db, user)
    return create_challenge(db, email_key, "verify_email", user, now, proposed_hash, data.name)


def request_code(db, email, purpose, ip):
    email_key, now = mail.keyed("mail-email:" + str(email).lower()), datetime.now(timezone.utc)
    blocked = reserve_send(db, email_key, ip, now)
    if blocked:
        return blocked
    user = db.scalar(select(m.User).where(m.User.email == str(email).lower()).with_for_update())
    return create_challenge(db, email_key, purpose, user, now)


def password_verification(db, user, ip):
    now, email_key = datetime.now(timezone.utc), mail.keyed("mail-email:" + user.email)
    blocked = reserve_send(db, email_key, ip, now)
    if blocked:
        return blocked
    user = db.scalar(select(m.User).where(m.User.id == user.id).with_for_update().execution_options(populate_existing=True))
    return create_challenge(db, email_key, "verify_email", user, now)


def password_login(db, data, ip):
    now, email = datetime.now(timezone.utc), str(data.email).lower()
    email_key = mail.keyed("mail-email:" + email)
    bucket(db, "email:" + email_key, now)
    user = db.scalar(select(m.User).where(m.User.email == email).with_for_update().execution_options(populate_existing=True))
    valid = passwords.verify(data.password, user.password_hash if user else dummy_hash)
    if not user or not valid or user.signup_pending:
        return Result({"detail": "Incorrect email or password"}, 401)
    if not user.email_verified_at:
        blocked = reserve_send(db, email_key, ip, now)
        if blocked:
            return blocked
        return create_challenge(db, email_key, "verify_email", user, now)
    return Result({**issue(db, user), "user": public_user(user)})


def resend(db, challenge_id, ip):
    previous = db.get(m.EmailChallenge, challenge_id)
    if not previous:
        return Result({"detail": "This request has expired. Start again with your email address."}, 400)
    now = datetime.now(timezone.utc)
    blocked = reserve_send(db, previous.email_key, ip, now)
    if blocked:
        return blocked
    previous = db.scalar(select(m.EmailChallenge).where(m.EmailChallenge.id == challenge_id).with_for_update().execution_options(populate_existing=True))
    if previous.consumed_at or aware(previous.created_at) < now - timedelta(hours=24):
        return Result({"detail": "This request has expired. Start again with your email address."}, 400)
    user = db.scalar(select(m.User).where(m.User.id == previous.user_id).with_for_update()) if previous.user_id else None
    if previous.purpose == "verify_email" and user and user.email_verified_at:
        user = None
    return create_challenge(db, previous.email_key, previous.purpose, user, now, previous.registration_password_hash, previous.registration_name)


def verify(db, data, purpose, ip):
    now = datetime.now(timezone.utc)
    ip_bucket = bucket(db, "check-ip:" + mail.keyed(ip), now)
    if ip_bucket.count >= 100:
        return limited((aware(ip_bucket.window_start) + timedelta(hours=1) - now).total_seconds())
    ip_bucket.count += 1
    initial = db.get(m.EmailChallenge, data.challenge_id)
    invalid = Result({"detail": "That code is invalid or expired. Request a new code and try again."}, 400)
    if not initial:
        hmac.compare_digest(mail.keyed("missing-code"), mail.keyed(data.code))
        return invalid
    # Same mailbox lock order as code requests; concurrent verifications consume once.
    bucket(db, "email:" + initial.email_key, now)
    challenge = db.scalar(select(m.EmailChallenge).where(m.EmailChallenge.id == initial.id).with_for_update().execution_options(populate_existing=True))
    if challenge.purpose != purpose or challenge.consumed_at or challenge.superseded_at or aware(challenge.expires_at) <= now or challenge.attempts >= settings().email_otp_max_attempts:
        return invalid
    challenge.attempts += 1
    matches = hmac.compare_digest(challenge.code_hash, mail.code_hash(challenge, data.code))
    if not matches or not challenge.user_id:
        return invalid
    user = db.scalar(select(m.User).where(m.User.id == challenge.user_id).with_for_update().execution_options(populate_existing=True))
    if not user:
        return invalid
    first_verification = user.email_verified_at is None
    if challenge.registration_password_hash:
        if user.email_verified_at or not user.signup_pending:
            return invalid
        user.password_hash, user.name = challenge.registration_password_hash, challenge.registration_name
    elif purpose == "email_login" and first_verification:
        # A pre-registered, unverified password must not survive proof by a different mailbox owner.
        user.password_hash = passwords.hash(token_urlsafe(48))
    user.email_verified_at, user.signup_pending, challenge.consumed_at = now, False, now
    for other in db.scalars(select(m.EmailChallenge).where(m.EmailChallenge.user_id == user.id, m.EmailChallenge.id != challenge.id, m.EmailChallenge.consumed_at.is_(None), m.EmailChallenge.superseded_at.is_(None))):
        other.superseded_at = now
    # Erase stale pending password hashes after proof of mailbox ownership.
    for item in db.scalars(select(m.EmailChallenge).where(m.EmailChallenge.user_id == user.id)):
        item.registration_password_hash = None
    jobs = [mail.enqueue(db, user, "welcome", "welcome:" + user.id)]
    if first_verification or purpose == "password_reset":
        for session in db.scalars(select(m.Session).where(m.Session.user_id == user.id)):
            session.revoked = True
    if purpose == "password_reset":
        user.password_hash = passwords.hash(data.new_password)
        jobs.append(mail.enqueue(db, user, "password_changed", "password-changed:" + challenge.id))
        db.add(m.Audit(user_id=user.id, entity_id=user.id, action="auth.password_reset"))
        return Result({"status": "password_reset", "message": "Password updated. All earlier sessions were signed out. Sign in with your new password."}, jobs=jobs)
    db.add(m.Audit(user_id=user.id, entity_id=user.id, action="auth.email_verified"))
    return Result({**issue(db, user), "user": public_user(user)}, jobs=jobs)
