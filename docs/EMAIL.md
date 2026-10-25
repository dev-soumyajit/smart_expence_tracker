# Resend email setup

Morrowmint supports email verification, email-code sign-in, password recovery, a welcome email after the first successful verification, and a password-changed notice. Phone OTP delivery is not used. Mobile and web expose the email flows.

## Configure the backend

The private `backend/.env` and its example contain:

```dotenv
RESEND_API_KEY=
RESEND_FROM_EMAIL="Morrowmint <noreply@devsoumyajit.in>"
EMAIL_AUTH_ENABLED=false
EMAIL_OTP_EXPIRY_SECONDS=600
EMAIL_RESEND_COOLDOWN_SECONDS=60
```

1. Add and verify `devsoumyajit.in` in the [Resend domains dashboard](https://resend.com/docs/dashboard/domains/introduction), including the required DNS records.
2. Paste a sending API key into `RESEND_API_KEY` in `backend/.env`. Keep it out of mobile/web public variables, commits and chat.
3. Set `SECRET_KEY` to a stable random secret of at least 40 characters. Generate one with `python -c "import secrets; print(secrets.token_urlsafe(48))"`. The development/example secret is rejected when email authentication is enabled.
4. Apply the migration to the intended database, from `backend/`: `..\.venv\Scripts\python.exe -m alembic upgrade head`. The new revision is `b6d8a41f302e`. Back up a live database before migrating it.
5. Set `EMAIL_AUTH_ENABLED=true` and restart the API. On Render, set these values in the service environment instead of uploading `.env` into the image.

With the flag false, password registration/sign-in remains available and email endpoints return an unavailable response. With it true, registration returns an email challenge rather than tokens. Legacy accounts must prove their email on their next sign-in; unverified refresh sessions also require sign-in. Old addresses are not automatically verified.

If an unverified account is first claimed through email-code sign-in, its old password is invalidated to prevent someone else's pre-registration password from surviving. The owner can use email-code sign-in or Forgot password to set a password. Password reset signs out every earlier session. Email address changes and MFA are not implemented.

## Delivery and retries

The API uses [Resend's HTTPS send endpoint](https://resend.com/docs/api-reference/emails/send-email), requiring outbound HTTPS rather than SMTP ports. Messages are committed to a database outbox with the auth change, then attempted in a background task after commit. A provider outage does not undo account state or expose whether an address exists.

Run a worker with the same database, `SECRET_KEY` and Resend environment to recover interrupted or transiently failed sends:

```sh
cd backend
python -m app.workers.mail
# Alternatively, drain currently due jobs once:
python -m app.workers.mail --once --limit 20
```

Use a separately managed worker or scheduled invocations for reliable retries. A sleeping web service cannot promise timely background processing. `--once` processes currently due jobs only; invoke it again for later retries. The worker does not apply migrations. Multiple PostgreSQL workers claim jobs using row locks; provider requests run outside the claim transaction.

Retries keep the same payload and provider idempotency key. They are capped at five attempts within 23 hours, inside [Resend's 24-hour idempotency window](https://resend.com/docs/dashboard/emails/idempotency-keys). Expired, superseded or consumed OTP jobs are skipped. Permanent provider errors stop retries. Inspect sanitized `Mail deferred` logs and Resend's dashboard when no message arrives. Outbox status `sent` means Resend accepted the message; delivery/bounce webhooks and inbox confirmation are not implemented.

## Authentication rules

- Six-digit codes expire after 10 minutes by default, permit five verification attempts and work once for their specific purpose. Resending invalidates earlier codes. The backend enforces expiry and limits independently of the screen countdown.
- The default resend delay is 60 seconds. Database counters limit sends to five per address, 60 per client IP and 200 globally each hour. Verification also has an IP limit. Review trusted proxy configuration and these limits before scaling; a shared proxy IP can share a bucket.
- The database stores a keyed code hash and an outbox placeholder rather than plaintext OTPs. A code is derived from a random challenge identifier and the server secret when sending. Pending registration passwords are Argon2 hashes bound to that challenge, erased on successful proof.
- Keep `SECRET_KEY` stable across API and worker instances. Rotation invalidates old codes and tokens; queued codes for an old secret are not sent.
- Unknown-address code requests use decoy challenges with the same public response shape. Provider failures stay out of public auth responses; logs omit message bodies, codes and API keys.
- Financial exports exclude email challenges, password hashes and mail jobs. Account deletion removes associated challenges and queued messages. The provider may retain already submitted mail under its own policy.

## Staging check

After configuring the domain and key, use an address you control to verify signup, latest-code-only resend, email-code sign-in, password recovery and welcome/password-change emails. Check spam and the Resend dashboard. Automated tests mock the provider: no real email delivery, DNS verification or production database migration was performed during implementation.
