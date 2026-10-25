"""Transactional Resend outbox. No raw codes or passwords in storage or logs."""
from datetime import datetime, timedelta, timezone
from html import escape
from hashlib import sha256
import hmac
import json
import logging
import httpx
from sqlalchemy import select, or_, and_
from sqlalchemy.orm import Session
from .. import models as m
from ..core.config import settings
from .ledger import aware

log = logging.getLogger("morrowmint.mail")
OTP_SLOT = "__MORROWMINT_OTP_CODE__"


def keyed(value: str):
    return hmac.new(settings().secret_key.encode(), value.encode(), sha256).hexdigest()


def challenge_code(challenge):
    # A CSPRNG UUID plus a server-secret PRF permits retries without storing recoverable plaintext codes.
    value = keyed("otp-generation:v1:" + challenge.purpose + ":" + challenge.id)
    return f"{int(value, 16) % 1_000_000:06d}"


def code_hash(challenge, code):
    return keyed("otp-verification:v1:" + challenge.id + ":" + code)


def payload(kind, recipient, name):
    safe_name = escape(name or "friend")
    subjects = {"verify_email": "Verify your Morrowmint email", "email_login": "Your Morrowmint sign-in code", "password_reset": "Reset your Morrowmint password", "welcome": "Welcome to Morrowmint", "password_changed": "Your Morrowmint password was changed"}
    if kind in {"verify_email", "email_login", "password_reset"}:
        minutes = settings().email_otp_expiry_seconds // 60
        lead = {"verify_email": "Confirm your email to finish setting up your account.", "email_login": "Use this code to sign in to your account.", "password_reset": "Use this code to set a new password."}[kind]
        text = f"Hi {name or 'friend'},\n\n{lead}\n\nYour code: {OTP_SLOT}\n\nIt expires in {minutes} minutes. Use only the latest code and never share it. If you did not request this, you can ignore this email.\n\nMorrowmint"
        body = f"<p>Hi {safe_name},</p><p>{lead}</p><div style='background:#edf5d9;border-radius:16px;padding:24px;text-align:center;font-size:36px;font-weight:700;letter-spacing:8px;color:#163d30'>{OTP_SLOT}</div><p>This code expires in {minutes} minutes. Use only the latest code and never share it.</p><p>If you did not request this, you can ignore this email.</p>"
    elif kind == "welcome":
        text = f"Hi {name or 'friend'},\n\nWelcome to Morrowmint! Your email is verified. Add your wallets, record an entry and make a little more room for tomorrow.\n\nSMS suggestions are reviewed by you before they become records.\n\nMorrowmint"
        body = f"<h1 style='color:#163d30'>A little more tomorrow.</h1><p>Welcome, {safe_name}. Your email is verified.</p><p>Add your wallets, record your first entry and start building a clearer picture of your money.</p><p>You stay in control: review SMS suggestions before confirming financial entries.</p>"
    else:
        text = f"Hi {name or 'friend'},\n\nYour Morrowmint password was changed and all existing sessions were signed out. If this was not you, request another password reset immediately.\n\nMorrowmint"
        body = f"<p>Hi {safe_name},</p><p>Your password was changed and all existing sessions were signed out.</p><p>If this was not you, request another password reset immediately.</p>"
    html = "<!doctype html><html><body style='margin:0;background:#f6f7f2;font-family:Arial,sans-serif;color:#18392f'><div style='max-width:520px;margin:32px auto;padding:32px;background:#fff;border-radius:24px'><p style='font-size:24px;font-weight:700;color:#163d30'>morrowmint.</p>" + body + "<hr style='border:0;border-top:1px solid #e3e8df;margin-top:28px'><p style='font-size:12px;color:#677568'>Small habits. Brighter tomorrows.</p></div></body></html>"
    return {"from": settings().resend_from_email, "to": [recipient], "subject": subjects[kind], "html": html, "text": text}


def enqueue(db, user, kind, event_key, challenge=None, name=None):
    existing = db.scalar(select(m.MailJob).where(m.MailJob.event_key == event_key))
    if existing:
        return existing.id
    job = m.MailJob(user_id=user.id, challenge_id=challenge.id if challenge else None, event_key=event_key, kind=kind, payload=json.dumps(payload(kind, user.email, name or user.name)))
    db.add(job)
    db.flush()
    return job.id


def send_resend(body, idempotency_key):
    """One bounded HTTP attempt; durable outbox owns backoff/retries."""
    try:
        with httpx.Client(timeout=settings().email_timeout_seconds) as client:
            response = client.post("https://api.resend.com/emails", headers={"Authorization": "Bearer " + settings().resend_api_key.get_secret_value(), "Idempotency-Key": idempotency_key}, json=body)
        if 200 <= response.status_code < 300:
            result = response.json()
            if isinstance(result, dict) and isinstance(result.get("id"), str) and 0 < len(result["id"]) <= 100:
                return result["id"], None, False
            return None, "INVALID_PROVIDER_RESPONSE", True
        # The provider's body may include recipients; never persist/log it.
        return None, "HTTP_" + str(response.status_code), response.status_code in {408, 409, 429} or response.status_code >= 500
    except (httpx.HTTPError, ValueError, TypeError):
        return None, "PROVIDER_UNAVAILABLE", True


def dispatch_one(engine, job_id=None):
    if not settings().email_auth_enabled:
        return False
    now = datetime.now(timezone.utc)
    with Session(engine, expire_on_commit=False) as db:
        due = or_(and_(m.MailJob.status.in_(["pending", "retry"]), m.MailJob.next_attempt_at <= now), and_(m.MailJob.status == "sending", m.MailJob.lease_until < now))
        query = select(m.MailJob).where(due)
        if job_id:
            query = query.where(m.MailJob.id == job_id)
        job = db.scalar(query.order_by(m.MailJob.created_at).with_for_update(skip_locked=True).limit(1))
        if not job:
            return False
        if aware(job.created_at) < now - timedelta(hours=23) or job.attempts >= 5:
            job.status, job.last_error = "failed", "RETRY_WINDOW_EXPIRED"
            db.commit()
            return True
        body = json.loads(job.payload)
        if job.challenge_id:
            challenge = db.get(m.EmailChallenge, job.challenge_id)
            if not challenge or challenge.consumed_at or challenge.superseded_at or aware(challenge.expires_at) <= now or challenge.attempts >= settings().email_otp_max_attempts:
                job.status = "expired"
                db.commit()
                return True
            code = challenge_code(challenge)
            if not hmac.compare_digest(code_hash(challenge, code), challenge.code_hash):
                job.status, job.last_error = "failed", "KEY_ROTATED"
                db.commit()
                return True
            body["html"], body["text"] = body["html"].replace(OTP_SLOT, code), body["text"].replace(OTP_SLOT, code)
        job.status, job.lease_until = "sending", now + timedelta(seconds=settings().email_timeout_seconds + 60)
        job.attempts += 1
        attempt, selected_id = job.attempts, job.id
        db.commit()  # Never hold database locks during provider I/O.
    provider_id, error, retry = send_resend(body, "morrowmint/" + selected_id)
    with Session(engine) as db:
        job = db.scalar(select(m.MailJob).where(m.MailJob.id == selected_id).with_for_update())
        if not job or job.status != "sending" or job.attempts != attempt:
            return True
        job.lease_until = None
        if provider_id:
            job.status, job.provider_id, job.last_error = "sent", provider_id, None
        else:
            job.status = "retry" if retry and attempt < 5 else "failed"
            job.last_error = error
            job.next_attempt_at = datetime.now(timezone.utc) + timedelta(seconds=min(60 * 2 ** (attempt - 1), 900))
            log.warning("Mail deferred: job=%s reason=%s", selected_id, error)
        db.commit()
    return True


def dispatch_ids(engine, job_ids):
    for job_id in job_ids:
        try:
            dispatch_one(engine, job_id)
        except Exception as error:
            log.warning("Mail worker deferred: type=%s", type(error).__name__)
