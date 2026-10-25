# Mobile profile

Tap the avatar on Home to open **Profile**. The dedicated page loads the signed-in user's profile independently of the financial dashboard, so a dashboard error does not block account settings.

The page includes:

- Name, account email and initials, with an editable display name.
- Salary-cycle start day and minimum reserve, saved through the existing settings API.
- Wallets/accounts and budget navigation.
- Smart message review, current SMS access status, device settings and a confirmed reset of remembered SMS wallet/category choices.
- In-app privacy explanations and help/FAQs.
- JSON data export through the native share sheet.
- Account deletion guarded by the current password and an exact `DELETE` confirmation.
- Confirmed sign-out of all sessions.
- About, app version, build number, currency, language and timezone.
- A compact developer credit for Soumyajit Khan, also shown in About.

Version and build values come from `apps/mobile/app.json` via Expo configuration. They currently display **0.1.0 · Build 1**. Change the release configuration to update the displayed values. Email is read-only. Password recovery is available through Forgot password on sign-in when [Resend email authentication](EMAIL.md) is enabled. Push notification delivery remains incomplete.

Profile edits preserve the other money preferences. Saving cancels an older in-flight profile refresh before updating the query cache, then refreshes the dashboard. Profile loading and sign-out use token refresh for authenticated `/auth/me` and `/auth/logout` requests; invalid login credentials do not trigger refresh. Logout/deletion clear the local session and cached profile data only after the corresponding backend operation succeeds.

## Exports

The existing authenticated `/settings/export` endpoint returns account data without session credentials. Amounts are integer paise. The backend's existing 50,000-transaction bound and export rate limit still apply.

Files are created in a private cache directory scoped to the current user's UUID. Filenames contain no name or email. Recent copies remain available after the Android chooser closes because the receiving app may read them asynchronously. Copies older than 24 hours are cleaned on the next export; logout/deletion attempt to clear this user's export cache. Failed writes/shares remove the newly created copy. Copies deliberately saved to another destination are managed by the user.

Rebuild the native Android app once to include the added sharing module:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-mobile.ps1 -BuildAndroid
```

Older installed builds can open Profile; selecting export shows a rebuild message if the sharing module is absent. Browser authentication and downloads use the Next.js application. Native sharing uses the Expo SDK 55 [Sharing API](https://docs.expo.dev/versions/v55.0.0/sdk/sharing/) and [FileSystem API](https://docs.expo.dev/versions/v55.0.0/sdk/filesystem/).

## Verification

On 25 October 2026, mobile TypeScript and the Android Hermes export passed. Android manifest processing passed with the SDK's prebuilt native libraries; the sharing provider is private and supports temporary URI grants. No APK or physical-device share operation was executed.

The browser profile check passed at 390px and 360px: editing and validation, paise conversion, version/build display, permission controls, forgotten suggestions, export confirmation, privacy/help, deletion guards, password clearing, failed saves, sign-out confirmation/failure and navigation. The existing mobile design and SMS review browser checks also passed. These use browser-only fixtures with no API requests or account changes.

Thirteen focused Node tests passed: eight for export availability, old builds, JSON/paise, cache scoping, receiver readability and failure cleanup; five for profile/logout token refresh, revoked sessions, login errors and simultaneous requests. Browser fixture markers were absent from the native release bundle.

These results were recorded before the test files and QA scripts were removed at the user's request.

Screenshots are in `.artifacts/mobile-profile/`. Verification did not export or delete a real account or modify the backend database. Physical-device share-sheet, SMS permission status and iOS behavior remain unverified.
