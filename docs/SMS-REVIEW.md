# Smart SMS review

Open **Review bank messages** on Home or **Smart message review** in Profile. The Android feature reads recent inbox messages after a disclosure, checkbox and Android runtime permission. The default range is seven days; thirty days is available. Scans run while this screen is open and explicitly requested. There is no background SMS receiver or automatic financial posting.

Users can also paste an alert without granting inbox access. iOS, Expo Go and browsers use this fallback because the Android reader requires a build containing the local native module.

## Review and corrections

1. Parse locally and discard security/authentication messages, failed/pending payments, requests, statements, reminders and promotions. Only INR is supported.
2. Propose a transaction amount separately from available balances. Invalid grouping, excessive precision, negative/zero amounts and multiple amounts require clarification. Conflicting debit/credit language requires a type choice.
3. Show **Does this look right?** with a masked message preview. The user can change amount, type, wallet, category, description and IST date/time. An unrecognized wallet is never assigned to the first account automatically.
4. ATM withdrawals and explicit card repayments are transfers with two wallets. Purchases made with a card remain expenses. Refunds require an original expense and retain the backend's ownership, date, account and remaining-refund limits.
5. Review possible duplicates and either link an existing entry or explicitly confirm a separate transaction. Confirm every detail before saving.
6. Reopen a saved message entry to correct it. The original ledger row is reversed and the replacement is written atomically with audit history. Retries, stale edits, old reused edit keys, associated refunds and failed commits are guarded. Multiple messages linked to one entry follow its correction.

**Remember my wallet and merchant category choices** is optional. Confirmed mappings stay in SecureStore, scoped to the signed-in user on this device. Later corrections can update those mappings. They only suggest active wallets and existing categories; amounts, dates and transaction types always require review. Profile's message screen can forget learned choices. The most recent ignored message can be restored with **Undo last ignore**.

## Data boundaries

- Raw SMS text is processed on-device and held only in screen memory. The app does not send it to the API; SMS schemas have no raw-message field. Descriptions/notes deliberately entered and confirmed by the user are normal financial record data. No SMS is sent to Groq or another AI service.
- The Android module rejects security messages before bridging to JavaScript. It reads the inbox only; it has no SMS send, delete, interception or background service functionality.
- The server stores a SHA-256 message/event digest, reviewed ledger links and correction metadata. Confirmed descriptions and financial details are normal account data.
- SecureStore holds optional wallet/category mappings, minimal mapping keys for later corrections, and ignored-message digests. It does not hold message bodies.
- Scan pagination uses timestamp plus inbox ID, a fixed upper boundary and bounded pages. Permission denial/revocation and unavailable providers/modules leave paste/manual entry available. Network failures preserve on-screen suggestions and edits; loading account data and saving entries require reconnecting to the API. Unsaved suggestions can be recovered by rescanning; raw pending messages are not persisted.
- A reference-based identity includes bank sender, account tail and debit/credit side. Without a reference, distinct phone receipt times stay distinct. Pasted identical messages without a reference on the same IST day share a digest; use manual entry for genuinely separate identical purchases. Similar amounts/time are warnings, never automatic financial merges.

Bank templates and sender identities are not proof of a real payment. Unsupported dates and explicit timezones ask for confirmation rather than making a hidden timezone conversion. Receipt time is explicitly labeled when a reliable bank time is unavailable. This parser does not claim perfect recognition of every bank/language/template.

## Run it

Apply the committed migration to your configured development backend before using SMS endpoints:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-api.ps1 -Migrate
```

This command uses `backend/.env`; check its database target first. Verification used disposable local databases and did not migrate Neon.

With Android Studio's SDK/JDK installed and an emulator/device available:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-mobile.ps1 -BuildAndroid
```

Or run `npm ci` then `npm run android` inside `apps/mobile`. Configure the device-reachable API URL in `apps/mobile/.env`. Expo Go can show the paste/review path but does not contain the custom inbox reader. `npm ci` also applies a narrowly scoped [React Native/Foojay compatibility fix](https://github.com/facebook/react-native/issues/56287) required by the generated Gradle 9 project; no generated Android source is committed.

Android inbox access uses [`Telephony.Sms.Inbox`](https://developer.android.com/reference/android/provider/Telephony.Sms.Inbox) and `READ_SMS`. Android treats this as a restricted permission; installation/runtime grants and distribution requirements still apply. Google Play lists SMS-based money management as an exception subject to its permission declaration and review. No Play approval is claimed. See the [official SMS permission policy](https://support.google.com/googleplay/android-developer/answer/10208820?hl=en) and [Expo native module guide](https://docs.expo.dev/modules/get-started/).

## Verification commands

The backend test fixture uses isolated SQLite by default, or an explicitly configured `paisa_test` PostgreSQL database. Concurrent confirm/correction checks require PostgreSQL.

```powershell
cd backend
..\.venv\Scripts\python.exe -m pytest -q
cd ../apps/mobile
npm run typecheck
node node_modules/typescript/bin/tsc ../../packages/contracts/sms.ts --outDir ../../.artifacts/sms-tests --target ES2022 --module commonjs --skipLibCheck
node --test ../../scripts/test-sms.cjs
```

For browser UI checks, start the development gallery with `scripts/start-mobile.ps1 -Preview`, install Chromium through the web app's Playwright setup, then run `node scripts/qa-sms-review.cjs`. This tests the actual shared React Native review component using browser-only example data, without API calls or financial writes. Example screenshots are in `.artifacts/sms-review/`. Browser checks do not establish phone permission/provider behavior; device verification is a separate check.

Recorded results: 67 PostgreSQL tests passed; SQLite passed 63 with four PostgreSQL concurrency checks skipped; 50 local parser/learning cases passed; mobile TypeScript, browser SMS/design flows, Android Hermes export and the native SMS module's Kotlin compilation passed. Migration round trips and schema comparison passed on both databases. No physical device was connected. See [the full verification record](VERIFICATION.md).
