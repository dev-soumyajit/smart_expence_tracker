# Morrowmint implementation checklist

Repository inspected: empty workspace; no existing source, configuration, migrations, or tests to preserve.

- [x] Foundation: FastAPI, configuration, SQLAlchemy, PostgreSQL migration, authentication, Docker.
- [x] Financial engine: accounts, categories, ledger, transfers, refunds, revisions, idempotency, ownership.
- [x] Budgets: explicit date ranges, salary-cycle boundaries, summaries, safe-to-spend.
- [x] Web: real authenticated API, dashboard, accounts, ledger, budgets, settings.
- [x] Recurring expense bills with confirmation and savings allocations/goals.
- [x] Reviewed, idempotent CSV import with stale-preview duplicate checks.
- [x] Server-side Groq intent/guidance integration with deterministic fallback (live credentials not verified).
- [x] Mobile: Expo application with secure token storage and core workflows; TypeScript and Android bundle verified.
- [x] Morrowmint rebrand and mobile redesign: original visual system, reviewed entry, browser phone-size interaction checks, final TypeScript and Android bundle verification.
- [x] SMS: opt-in Android inbox module, local parser, clarification and editable review, duplicate linking, optional learned choices, retry-safe audited corrections and schema migration.
- [x] Mobile Profile: editable details/preferences, version/build, SMS controls, privacy/help, native JSON export, guarded deletion/sign-out, session refresh and browser/native integration checks.
- [x] Verification: 42 PostgreSQL tests, SQLite suite, type checks, production web build.
- [x] Deployment documentation and known limitations.
- [ ] External deployment: Neon, Render, Vercel; requires user service configuration.
- [x] Local backend Docker build, PostgreSQL migrations and readiness checks.
- [x] Final browser end-to-end verification: two Playwright tests passed, desktop and 390px screenshots captured.
- [ ] Native APK/device verification and upstream mobile dependency advisory resolution.
- [x] Resend verification, email-code sign-in, password recovery, welcome/changed-password mail, durable outbox, abuse limits and web/mobile screens; provider delivery requires operator configuration.
- [ ] Scheduled push/bill email, richer forecasting, goal reallocation, full mobile parity.

This checklist is updated with actual verification results; unexecuted work stays unchecked.
