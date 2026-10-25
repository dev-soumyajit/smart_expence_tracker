# Deploy and operate Morrowmint

Target: Vercel web frontend, Render Docker backend, Neon PostgreSQL, optional Groq. No cloud deployment is claimed by this repository. Configure your own external accounts and verify their current service limits before deploying.

## 1. Prepare accounts and source

Create GitHub, Neon, Render and Vercel accounts; create a Groq account if you want optional AI interpretation. Put this repository in a private GitHub repository. Ensure `.env` files are ignored; only templates may be committed. Run the checks in README before deployment.

Use separate development, staging and production databases and keys. Do not run the automated table-dropping test fixture against your application database. The application is a modular monolith and does not require Redis. Enable a mail retry worker or schedule repeated drains for reliable email retries; see [email setup](EMAIL.md).

## 2. Neon database

Create a PostgreSQL project in a region close to the Render service. Copy the connection string including SSL, preferably the pooled endpoint for the API. Set the SQLAlchemy driver prefix:

```dotenv
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST/DATABASE?sslmode=require
```

Use a direct connection for migrations where appropriate. Percent-encode reserved characters in credentials. The API's pool is deliberately small: three persistent connections and at most two overflow connections per process. Keep one API process initially; multiply pool limits by the number of processes/instances before scaling.

At the documentation check on 24 October 2026, the [Neon pricing page](https://neon.com/pricing) listed a Free plan with 100 CU-hours/month/project and 1 GB storage/project. Limits and plan details can change and older FAQs may disagree. Check storage, compute, network transfer, connection limits, scale-to-zero and restore/history retention in your actual console before using financial data. Free hosting is not a backup guarantee.

## 3. Backend environment

Render environment variables, not a file baked into the image:

```dotenv
ENVIRONMENT=production
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST/DATABASE?sslmode=require
SECRET_KEY=<random secret of at least 40 characters>
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=14
FRONTEND_ORIGINS=https://YOUR-WEB-DOMAIN
GROQ_API_KEY=<optional>
GROQ_MODEL=openai/gpt-oss-120b
AI_TIMEOUT_SECONDS=15
RESEND_API_KEY=<your sending API key>
RESEND_FROM_EMAIL="Morrowmint <noreply@devsoumyajit.in>"
EMAIL_AUTH_ENABLED=true
EMAIL_OTP_EXPIRY_SECONDS=600
EMAIL_RESEND_COOLDOWN_SECONDS=60
```

Generate the secret using a password manager or `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Do not copy development secrets. Production mode rejects SQLite, weak default secrets and non-HTTPS origins. Never put private credentials in `NEXT_PUBLIC_*` or `EXPO_PUBLIC_*` variables.

## 4. Build and migrate safely

```sh
docker build -t paisasense-api backend
```

Apply migrations once in a controlled release step using a trusted machine/CI with the deployment database URL configured. Back up first, inspect the migration, stop incompatible writes when necessary, and run from `backend/`:

```sh
alembic upgrade head
alembic current
alembic check
```

Do not run competing migrations inside every API worker. Render Free does not provide every paid deployment hook or one-off job feature; a controlled local/CI migration is the initial alternative. Avoid destructive downgrade operations on real financial records. Prefer a forward repair migration or a validated database restore.

## 5. Render backend

Create a Docker web service from the GitHub repository. Build context: `backend`; Dockerfile: `backend/Dockerfile` when the repository root is selected, or `Dockerfile` when using `backend` as root. Configure the environment above. Use `/health` for lightweight process health and `/ready` to diagnose database connectivity. The image runs as a non-root user and listens on `0.0.0.0` using Render's supplied `PORT` (default 8000 locally). Do not override the startup command with a fixed cloud port.

Database records must stay in Neon. The container filesystem is ephemeral. [Render's Free documentation](https://render.com/docs/free) states that free web services sleep after 15 minutes without inbound traffic and may take about a minute to start again; it recommends Free instances for experiments/previews rather than production applications. Review included instance hours, bandwidth, build minutes and possible charges. Do not add artificial keep-alive traffic.

## 6. Vercel web frontend

Import the repository, select Next.js, and set root directory `apps/web`. Enable access to source outside the root directory because the shared `packages/contracts` module is imported. Install with `npm ci`, build with `npm run build`, and use a compatible Node 22 runtime.

Set server-side variables:

```dotenv
API_URL=https://YOUR-API.onrender.com
APP_ORIGIN=https://YOUR-WEB-DOMAIN
```

`APP_ORIGIN` must exactly match the public web origin for CSRF checks, including custom domains. Configure separate values for preview deployments; do not permit arbitrary origins. Tokens stay in the Next.js server's HTTP-only, Secure, SameSite=Lax cookies. Browser traffic uses `/api/...` on the frontend origin, then the server adds the bearer token to the backend request.

Match `FRONTEND_ORIGINS` to the frontend origin as well. CORS is an allowlist, not a substitute for authentication. The web proxy sets a 70-second upstream timeout to accommodate cold starts. Hosting plans may impose a shorter function execution limit; configure the currently supported duration or upgrade the plan if a sleeping backend exceeds it. The UI offers a retryable error rather than claiming availability. See [Vercel limits](https://vercel.com/docs/limits) and your project console before choosing a plan.

The API proxy refreshes expired access tokens through the HTTP-only refresh cookie. Browser requests share a single refresh promise within a tab. Simultaneous refreshes across separate tabs can race with strict single-use refresh rotation and require a fresh sign-in; do not weaken rotation without a reviewed session design.

## 7. Groq

Verify model access in [Groq's supported models](https://console.groq.com/docs/models), then set the key and model server-side. `openai/gpt-oss-120b` is the example configuration; model IDs are not assumed permanent. In particular, older Llama model pages can remain online after deprecation—consult [the deprecation list](https://console.groq.com/docs/deprecations).

The adapter uses JSON object output, validates a strict intent/tip schema, limits output tokens, times out requests, and retries a temporary network/5xx error at most once. Rate-limited or invalid responses fall back immediately. The local AI endpoint also has a per-user rate limit. Current provider rate limits depend on model/account; review [Groq rate limits](https://console.groq.com/docs/rate-limits), usage and spending controls. Keys and raw messages are never logged or sent as financial context.

AI is optional. Confirm expense entry, budgets and reports with the key unset and while the provider is unavailable. Sharing requires opting in in the assistant UI.

## 8. Deployment smoke test

Verify `/health` and `/ready`; register a staging user; create bank/cash/card accounts; record income; make an ATM transfer; record cash and card purchases; repay the card with a transfer; record a partial refund. Verify transfers do not change expense totals. Sign out and sign back in. Confirm records survive a backend restart. Test another user cannot access the first user's resource IDs. Verify the frontend handles backend downtime and optional AI failure. Export the staging data and delete the staging account.

Check application logs for status codes without logging secrets, full financial records or raw SMS. Review HTTPS, cookie attributes, allowed origins, database SSL, and usage limits. Never claim a deployment works until these checks actually pass on the deployed URLs.

## 9. Backups and recovery

Schedule encrypted PostgreSQL exports using an operator-controlled secret store and `pg_dump --format=custom`. Store backups outside the service/container and restrict access. Define backup frequency, retention and deletion policy for your users. Restore into an isolated database with `pg_restore`, run migrations and reconciliation checks, then switch the API connection only after validating account balances, transaction counts and ownership isolation. Test this recovery process periodically; a backup file alone does not prove recovery works.

User JSON export is a portability feature, not a complete relational backup/restore mechanism. Deleting an account removes active application rows; copies can remain in encrypted backups until their retention period expires. Document that period before launch.

## Troubleshooting and scaling

- A JSON `Not Found` at the bare API domain can mean the deployed version has no `/` route. Check `/health`, `/ready` and `/docs` separately. The current source includes a root API-information route; push and redeploy it to expose that route. The mobile API base is `https://morrowmintapi.devsoumyajit.in` and its client adds `/api/v1` automatically.
- Registration returning `403` with `Invalid request origin` comes from the frontend proxy. For the custom web domain, set Vercel `APP_ORIGIN=https://morrowmint.devsoumyajit.in` and `API_URL=https://morrowmintapi.devsoumyajit.in`, then redeploy the frontend. Set Render `FRONTEND_ORIGINS=https://morrowmint.devsoumyajit.in`. Keep the origin guard enabled; it protects cookie-authenticated writes.
- Migration errors: confirm the correct database, SSL, driver prefix, schema permissions and Alembic revision. Never delete tables to bypass a migration error.
- Cold-start failures: verify backend readiness and frontend function timeout limits; retry after waking. Use paid always-on compute for predictable latency.
- Sign-in/403 errors: check `APP_ORIGIN`, domain, HTTPS and cookie settings. A changed `SECRET_KEY` invalidates access tokens.
- Database saturation: keep the pool conservative, inspect active connections and slow queries, then choose the right Neon compute/pooling plan.
- AI failures: verify model access and key, rate limits and timeout; the deterministic answer remains available.
- Email: verify the sender domain, key and stable server secret; inspect sanitized outbox error codes and Resend's dashboard. Run the retry worker for interrupted or transiently failed sends. Provider acceptance does not confirm inbox delivery.
- Growth: move to paid Render/Neon/Vercel plans, enable real backups and monitoring, and replace remaining in-process password/AI rate limits before horizontal scaling. Email request/verification counters are already stored in the database.
