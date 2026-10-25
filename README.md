# Morrowmint

A personal finance application for Indian users. The repository contains a FastAPI financial service, a Next.js web application, and an Expo Android-focused mobile application. Financial amounts are integer paise and the database is authoritative.

This is a working first implementation, not a claim that every item in the full product specification is complete. See [the implementation checklist](docs/CHECKLIST.md), [accounting policy](docs/ACCOUNTING.md), [deployment guide](docs/DEPLOYMENT.md), and [known limitations](docs/LIMITATIONS.md).

## Repository

```text
apps/web/            Next.js App Router, TypeScript, Tailwind, React Query
apps/mobile/         Expo Router, React Native, SecureStore, React Query
backend/app/         FastAPI, SQLAlchemy 2, Pydantic, accounting and AI services
backend/alembic/     Versioned database migrations
packages/contracts/ Shared amount parsing and input constraints
infrastructure/     Local PostgreSQL and backend Docker Compose
docs/               Architecture, deployment, verification and remaining work
```

## Local development

Install Docker Desktop, Python 3.12+, and Node 22 LTS. The workspace's ignored `.tools/` directory may contain a locally downloaded Node runtime; it is not required on another machine.

Start the local database and API from the repository root:

```sh
docker compose -f infrastructure/docker-compose.yml up --build -d
```

Compose uses a **local PostgreSQL database**, a named data volume, and a separate one-shot migration service. It does not load `backend/.env` or connect to Neon. PostgreSQL is published on `127.0.0.1:5432`; the API listens on port 8000. Stop with `docker compose -f infrastructure/docker-compose.yml down`; do not add `-v` unless you deliberately want to erase local financial data.

Start the web app:

```sh
cd apps/web
npm ci
# Copy .env.example to .env.local
npm run dev
```

Visit http://localhost:3000 and register. New users get categories, but **no fictional accounts or financial transactions**. Add accounts with opening balances, then record income, expenses or transfers. The web app proxies the API through its own server and stores tokens only in HTTP-only cookies.

On this Windows workspace, `powershell -ExecutionPolicy Bypass -File scripts/start-web.ps1` also starts the web app and locates the downloaded workspace Node runtime when Node is absent from PATH. Run it from the repository root.

### Run Python directly, including with Neon

The backend's settings file is **`backend/.env`**. Start Python and Alembic from the `backend` directory so that file is loaded. A safe template is [backend/.env.example](backend/.env.example). Local `.env` files are ignored by Git and excluded from Docker builds.

```dotenv
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST/DATABASE?sslmode=require
```

Copy the Neon connection string, retain SSL options, and select the psycopg driver as above. Percent-encode special characters in credentials. A plain `postgresql://` prefix is also normalized by the backend.

```sh
# From repository root:
python -m venv .venv
.venv/Scripts/python -m pip install -r backend/requirements.txt
cd backend
# Copy .env.example to .env and edit DATABASE_URL and SECRET_KEY.
../.venv/Scripts/alembic upgrade head
../.venv/Scripts/python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

On macOS/Linux replace `Scripts` with `bin`. For a disposable Python-only local trial, explicitly set `DATABASE_URL=sqlite:///./paisa.db`; production mode refuses SQLite. SQLite does not provide the PostgreSQL row-lock semantics used for concurrent financial writes.

Windows shortcut after configuring `backend/.env`: `powershell -ExecutionPolicy Bypass -File scripts/start-api.ps1`. Add `-Migrate` only when you intend to apply migrations to that configured database. Stop the Docker API first if it is occupying port 8000. The standalone API reads `backend/.env`; the Compose API always uses its separate local database configuration.

The API has `/health`, `/ready`, and interactive OpenAPI documentation at http://localhost:8000/docs. It never creates or migrates tables during startup; apply Alembic explicitly before serving requests.

### Mobile

```sh
cd apps/mobile
npm ci
# Copy .env.example to .env. Choose the API host for your device.
npx expo start
```

Android emulator: `http://10.0.2.2:8000`. Physical device: your computer's LAN IP with port 8000, on the same network. Production builds require an HTTPS API URL. Mobile refresh credentials use Expo SecureStore; access tokens remain in memory. Use the Next.js application for browser authentication.

**Smart message review:** opt-in Android inbox scanning and local parsing propose editable transactions, ask about uncertain fields, check duplicates and remember confirmed wallet/category choices. Saved message entries support audited corrections. Raw SMS is never sent to the server or AI. Inbox access needs a custom Android build; Expo Go/iOS can use pasted alerts. See [SMS setup, migration and behavior](docs/SMS-REVIEW.md). On Windows, `scripts/start-mobile.ps1 -BuildAndroid` builds and launches the native app with the installed Android SDK.

The mobile core covers registration/sign-in, dashboard, paginated/searchable ledger, accounts/cash, current-cycle budgets, preferences, and reviewed income/expense/transfer entry. The [Profile page](docs/MOBILE-PROFILE.md) includes editing, SMS controls, data export, account deletion, help/privacy, sign-out and version/build details. Full manual-ledger refunds/corrections, goals, bill management, CSV and AI chat are currently available in the web app. No APK or iOS archive is included.

The Morrowmint mobile design uses ivory surfaces, forest-green balance cards, lime accents and bundled Manrope fonts. See [the design notes and references](docs/MOBILE-DESIGN.md).

Windows shortcuts from the repository root:

```powershell
# Start Expo for the real mobile app:
powershell -ExecutionPolicy Bypass -File scripts/start-mobile.ps1
# Open the read-only browser design gallery with example data:
powershell -ExecutionPolicy Bypass -File scripts/start-mobile.ps1 -Preview
```

The gallery is at http://localhost:8091/design-preview. It uses the mobile presentation components without writing financial records. Actual mobile sign-in uses SecureStore on a device or emulator.

## Build checks

```sh
cd apps/web
npm run build
cd ../mobile
npm run typecheck
npx expo export --platform android --output-dir ../../.artifacts/mobile
```

Automated test suites, QA scripts and their configuration were removed at the user's request. Earlier verification results remain documented in [the verification record](docs/VERIFICATION.md).

## Email configuration

Add your key to `RESEND_API_KEY` in `backend/.env`. The sender is `Morrowmint <noreply@devsoumyajit.in>`. Verify the domain in Resend, configure a strong `SECRET_KEY`, apply the latest migration, then set `EMAIL_AUTH_ENABLED=true` and restart the API. Mobile and web support verification, email-code sign-in and password recovery; welcome emails follow successful verification. See [email setup and retry worker](docs/EMAIL.md).

## AI configuration

Set `GROQ_API_KEY` and `GROQ_MODEL` in the backend environment. The example model is `openai/gpt-oss-120b`; availability must be checked for your account before deployment. The model is configurable and no model ID is hardcoded in business logic.

AI sharing is off by default. When enabled, only the question and a small set of aggregate values are sent to Groq. The model selects a validated intent and vetted guidance IDs. The financial service constructs every factual amount and response; the model has no SQL tools or write access. Provider failures fall back to the deterministic service. Groq rate limits and charges depend on your account; consult [Groq's supported models](https://console.groq.com/docs/models) and [rate limits](https://console.groq.com/docs/rate-limits).

See [deployment and operations](docs/DEPLOYMENT.md) before handling real financial information.
