# Verification record

The automated test suites, QA scripts and their configuration were subsequently removed at the user's request. Results below record checks performed before removal; referenced test commands and scripts are no longer available.

Work was performed locally on Windows with Python 3.12, Node 22, Docker Desktop, PostgreSQL 17 and Expo SDK 55. Dates refer to Asia/Kolkata, 24 October 2026.

Executed checks:

| Check | Result |
| --- | --- |
| Backend test suite, isolated PostgreSQL `paisa_test` | 42 passed, including two real concurrent-write tests and production configuration validation |
| Backend test suite, in-memory SQLite | 40 passed, two PostgreSQL-specific tests intentionally skipped |
| Alembic initial migration | Applied successfully to local PostgreSQL and local SQLite |
| Alembic schema comparison | No new migration operations detected |
| Backend Docker build | Built and started as non-root using locked Linux dependencies |
| `/health` and `/ready` | Both returned success locally |
| Container runtime user | UID 1000, non-root |
| Persistence restart smoke | Account balance and authenticated session survived a backend container restart |
| Render-compatible port selection | Alternate container started successfully with `PORT=8123` |
| Next.js production build | Final source build passed, including TypeScript and all routes |
| Playwright browser suite | Two tests passed against the local production build and PostgreSQL API |
| Responsive screenshots | Desktop 1440px and mobile 390px captured; mobile page width checked for overflow |
| Mobile TypeScript | Passed |
| Windows startup helper runtime checks | Located workspace Node 22.23.4 and Python 3.12.12 successfully |
| Android JavaScript/Hermes export | Passed, 1,563 modules; this is not an APK/native build |
| Web dependency audit at installation | No reported vulnerabilities |
| Mobile dependency audit after compatible fixes | Seven reported transitive/direct advisories: four high, three moderate |

The backend suite covers bank expenses/income, ATM/cash, card purchases/repayment, partial/full refunds, over-refunds, idempotency and payload mismatches, reversal/correction, atomic rollback on failed writes and commit failure, ownership isolation, budget thresholds, salary boundaries/leap years, IST midnight ranges, integer money responses, invalid amounts/timestamps, pagination/search, CSV previews/commit/retries/duplicate rows/stale previews, recurring confirmation retries, refresh rotation/logout, export/deletion, health and optional AI failure/validation. The pure SMS normalizer is tested without permissions, uploads or automatic financial writes.

The Starlette test adapter currently emits a deprecation warning about its httpx integration; it does not cause test failures. SQLite tests intentionally do not stand in for PostgreSQL concurrency tests.

Browser checks cover form-based registration, server-side token stripping, HTTP-only cookie attributes, account creation, real expense entry, bank-to-cash transfer accounting, dashboard API totals, access-token refresh, mobile menu/navigation, transaction search, cross-origin mutation rejection and a retryable unavailable-backend state. Screenshots are in the ignored `.artifacts/dashboard-desktop.png` and `.artifacts/dashboard-mobile.png` files. Test users are deleted after successful browser checks.

The browser finance flow was repeated successfully after disabling animations during screenshot capture. Temporary web and Docker verification services were stopped after the checks; local database volumes were preserved. Start the application using README commands or the Windows helper scripts. The standalone API reads `backend/.env`; verification used the separate local Docker database and did not apply migrations to Neon.

## Morrowmint redesign verification

After the mobile redesign and display-name update on the same date:

| Check | Result |
| --- | --- |
| Mobile TypeScript | Passed with the final design components |
| Android JavaScript/Hermes export | Passed, 1,361 modules; no native APK generated |
| Native production preview isolation | Browser gallery and example-data markers absent from the exported Hermes bundle |
| Expo browser design QA | Passed navigation, balance hiding, chart modes, expense review/paise conversion, transfers, invalid amounts, authentication validation, password toggle, registration and empty states |
| Phone layout QA | Screenshots at 390px and 360px; no horizontal page overflow or browser page errors |
| Preview financial isolation | No API requests during the design QA flow |
| Rebranded Next.js production build | Passed |
| Mobile Windows startup helper | `-Check` located Node 22.23.4 successfully |

Design screenshots are in `.artifacts/mobile-redesign/`. The browser QA script is `scripts/qa-mobile-design.cjs`; it requires the Expo preview server, the web application's Playwright dependency and an installed Chromium browser. The shared presentation components use clearly labeled fixtures only in the development browser gallery. Normal mobile screens retain authenticated API queries and mutations. See [mobile design notes](MOBILE-DESIGN.md) for preview commands and research references.

The earlier financial/backend results above were not rerun for this visual update. The new browser design checks do not establish physical-device behavior or native SecureStore authentication.

## SMS review verification

The SMS feature was verified using disposable local databases, without reading a connected phone or migrating Neon:

| Check | Result |
| --- | --- |
| Full backend suite on PostgreSQL 17 | 67 passed, including concurrent SMS confirmation/correction, commit rollback, old retry keys, duplicate linking, linked-message corrections, refunds and ownership |
| Full backend suite on SQLite | 63 passed; four PostgreSQL concurrency tests intentionally skipped |
| On-device TypeScript parser/learning cases | 50 passed: financial directions, balances, multiple/invalid amounts, failed/pending/request/OTP exclusion, card purchase vs repayment, dates/timezones, identity and corrected mappings |
| SMS migration | Upgrade, downgrade, re-upgrade and Alembic schema comparison passed on isolated PostgreSQL and SQLite |
| Mobile TypeScript | Passed |
| SMS review browser QA | Passed clarification, editable amount, required wallet, explicit confirmation, exact timestamp preservation, duplicate linking, correction notes, refunds and failed-save retry |
| Mobile design regression QA | Passed existing navigation, charts, amounts, entry, authentication validation, empty states and phone layouts |
| Browser fixture isolation | No API requests or browser page errors in SMS review QA |
| Android JavaScript/Hermes export | Passed, 1,372 modules |
| Native Android SMS module | Expo autolinking found `morrowmint-sms`; `:morrowmint-sms:compileDebugKotlin` passed against Android SDK 36 with JDK 21 |

The review screenshots are in `.artifacts/sms-review/`. Browser-only fixtures are excluded through platform-specific preview modules; the exported Hermes bundle contains none of the browser gallery's example markers. A local Android project was generated for native autolinking/compilation; generated projects and build outputs are ignored. Android permission/provider behavior has not been tested on a physical device; `adb devices` showed no connected device. No APK, iOS archive or Play permission approval is claimed. Native compilation emitted upstream Expo/Worklets deprecation warnings without failing.

The temporary Expo preview server and disposable PostgreSQL verification container were stopped after checks. The user's Neon database and financial records were not changed.

The React Native Gradle plugin shipped with a Foojay resolver incompatible with generated Gradle 9. The committed mobile postinstall script narrowly updates its resolver declaration to 1.0.0, as described in [the upstream React Native issue](https://github.com/facebook/react-native/issues/56287).

## Mobile profile verification — 25 October 2026

| Check | Result |
| --- | --- |
| Mobile TypeScript | Passed |
| Profile browser QA | Passed edit/preferences validation, version/build display, permissions, forgotten choices, export confirmation, privacy/help, deletion guards, password clearing, failed saves, sign-out and navigation at 390px/360px |
| Mobile and SMS browser regressions | Both existing scripts passed; no financial API requests or browser page errors |
| Export helper checks | Eight passed, including missing native module, unavailable sharing, integer paise, private/scoped cache, delayed receiver access, API/write/share failures and cleanup |
| Mobile session checks | Five passed: profile/logout refresh and retry, expired refresh credentials, incorrect sign-in credentials, and one refresh shared by simultaneous requests |
| Android Hermes export | Passed, 1,391 modules; browser profile/SMS fixtures excluded |
| Android native integration | `:app:processDebugMainManifest` passed; SDK prebuilt sharing/filesystem libraries linked; private sharing provider and temporary URI grants verified |

An initial attempt to compile the SDK modules as source Gradle subprojects was replaced by app manifest verification because Expo supplies them as prebuilt libraries. Native checks emitted existing upstream manifest/deprecation warnings. No new backend schema or financial-service changes were required, so backend suites were not repeated for this UI/client update. No live data was exported/deleted and no production database was changed.

Screenshots and setup notes are in [mobile profile documentation](MOBILE-PROFILE.md). The temporary Expo preview server was stopped after verification. OS share-sheet behavior, physical-device permissions and iOS runtime behavior remain unverified. The existing mobile dependency advisory limitations below remain unchanged.

## Mobile advisories

`npm audit` identifies `node-forge` through Expo CLI/code-signing tooling (high) and `decode-uri-component` through query-string/Expo Router (moderate), with inherited package advisories. Compatible `npm audit fix` was attempted. The suggested remaining changes cross Expo compatibility boundaries (including an obsolete Expo downgrade); they were not forced. A proposed URI-decoder patch version was not available from the registry, and no invalid override remains in the manifest.

These need reassessment and a coherent supported SDK/dependency upgrade before native production release. See the recorded advisories: [node-forge signature verification](https://github.com/advisories/GHSA-86w9-cpqp-85rv), [URI decoder denial of service](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr). The web dependency audit is separate and did not report these Expo dependencies.

After adding the compatible Expo crypto module, the current mobile audit reports eight advisories: five high and three moderate. The additional report is [Zod constrained-collection memory exhaustion](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) in Expo CLI's nested Zod 3.25.76. Both applications directly use Zod 4.6.7. The audit's proposed Expo/Router changes cross SDK compatibility boundaries and were not forced; the upstream mobile dependency work remains a release limitation.

## Resend email verification — 26 October 2026

| Check | Result |
| --- | --- |
| Full backend suite, disposable PostgreSQL 17 | 103 passed, including concurrent code consumption, resend and outbox worker claims |
| Full backend suite, isolated SQLite | 95 passed; eight PostgreSQL-specific tests skipped |
| Email migration | Upgrade, schema comparison, downgrade and re-upgrade passed on separate SQLite and PostgreSQL databases |
| Session, export and auth proxy checks | 18 Node tests passed; challenge responses do not set cookies, successful verification strips tokens into HTTP-only cookies, reset clears cookies and cross-origin requests are rejected |
| Web production build | Passed |
| Web email browser QA | Passed registration verification, invalid code, resend, successful sign-in, password recovery validation/success, email-code sign-in and responsive layout with mocked APIs |
| Mobile email browser QA | Passed verification, email request validation, reset validation/success, resend, expiry, failed-request input retention and 390px/360px layouts; no API calls or browser errors |
| Mobile TypeScript | Passed |
| Android JavaScript/Hermes export | Passed, 1,393 modules; browser email/example fixtures excluded from the native bundle |
| Mobile design, Profile and SMS review regressions | All three browser scripts passed with example data; no financial API writes |

Backend coverage includes expiry, purpose isolation, single use, persisted failed attempts, latest-code-only resends, mailbox/IP/global limits, welcome deduplication, pre-registration password binding, legacy verification, password reset revocation, secret rotation, provider outages/permanent failures, idempotent retries, expired mail, rollback isolation, HTML escaping and exclusion from financial exports. Configuration tests reject unsafe enabled settings and check that error strings do not echo secrets.

The provider was mocked throughout. No Resend messages were sent, no real recipients were used, and no Neon migration was applied. Screenshots and fictional email template previews are under `.artifacts/email-auth/`; setup and worker instructions are in [EMAIL.md](EMAIL.md). An initial Metro file-map issue was resolved by restarting the Expo preview with a cleared cache; both mobile and web QA subsequently passed. PostgreSQL emitted the existing Starlette test-adapter deprecation warning and a nonfatal pytest cache permission warning.

## Production authentication initialization — 26 October 2026

The user confirmed that `backend/.env` names the database used by the deployed Render backend. A read-only metadata check found no `users` table or Alembic revision. The committed migrations were then applied to initialize the missing application schema. Alembic reported `b6d8a41f302e (head)` and no pending schema operations.

A deliberately invalid login through `https://morrowmint.devsoumyajit.in/api/auth/login` returned 500 before initialization and the expected 401 credential error afterward. No test account or outbound email was created by this check. An empty registration request returned the expected 422 validation response after the frontend's origin configuration was corrected. The proxy also passed local mocked checks for the configured origin, whitespace/trailing slash normalization, and rejection of foreign or absent origins.

After the user reported successful signup without mail, the deployed email endpoint returned 503 (email disabled), and an aggregate database check found no mail jobs. Local settings had a Resend key but `EMAIL_AUTH_ENABLED=false`. The local flag was enabled after configuration validation. After the deployment environment was updated, the live endpoint returned 202. A subsequent read-only aggregate check showed a welcome and verification job marked sent without provider errors, indicating Resend acceptance. Inbox delivery was not independently confirmed; no email was manually sent by Codex. Account emails, OTPs, passwords and private environment values were not printed.

## Launcher and welcome screen — 26 October 2026

The existing vector M-and-leaf mark was exported to opaque and transparent 1024px PNG assets. The opaque icon has no alpha channel; adaptive foreground and monochrome masks retain transparency. Pixel bounds fit within Android's circular adaptive safe area (302.6px maximum radius inside 312.9px). Expo config resolved the icon assets and splash plugin.

Mobile and web TypeScript checks passed. Browser checks passed the welcome view, delayed connection copy, 320px/390px layouts, reduced-motion behavior and sign-in handoff without API calls or page errors. Screenshots and an icon-mask preview are under `.artifacts/morrowmint-launch/`. The SVGs, PNGs, regeneration command and native rebuild instructions are documented in [MOBILE-BRANDING.md](MOBILE-BRANDING.md).

Android native prebuild and `:app:processDebugResources` passed with the generated splash theme, launcher foreground/monochrome layers, Expo splash-screen and system-UI modules. The final Android Hermes export passed (1,396 modules) with the branded asset included and browser fixture markers excluded. The mobile package manifest and lockfile agree. A final reduced-motion screenshot at 320x568 also passed without text overlap, API calls or page errors. These verify configuration/resources and JavaScript bundling; an installed native splash, APK, iOS archive and physical-device behavior were not verified. The existing mobile dependency advisories remain unchanged (five high, three moderate).

## Not claimed

No cloud services were provisioned or deployed by Codex. The user's deployed service and confirmed database were inspected and initialized as recorded above; provider acceptance of user-triggered mail was observed. No live Groq model response, independent inbox delivery/domain verification, APK/iOS build, physical-device test, push delivery, independent security audit or production backup recovery drill has been executed. Historical automated tests used isolated databases; production checks above used metadata, invalid credentials and aggregate mail status rather than test accounts or financial records.
