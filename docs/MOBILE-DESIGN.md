# Morrowmint mobile redesign

Morrowmint combines “morrow” and “mint”: everyday habits with a little more room for tomorrow. It is the new display name; existing database names, authentication issuer/audience and application identifiers remain compatible. This is a product naming choice, not a claim about trademark or domain availability.

The native Expo interface uses an original warm ivory / forest-green / lime design with bundled Manrope typography. Priorities are a glanceable available balance, immediate expense/income/transfer entry, a transparent safe-to-spend estimate, legible categories, and a persistent floating navigation bar. All financial values in normal app screens come from the existing authenticated API.

Research references:

- [Fintrack by GCCDigital](https://dribbble.com/shots/26195054-Fintrack-Budget-app-UI-with-light-dark-mode): card hierarchy, restrained surfaces, and clear budget progress.
- [Budget case study by Divya Paul](https://divyapaul.com/budget): a glanceable balance, visible budget guardrails, quick capture, and goal progress.

The implementation uses original React Native components and vector artwork. No third-party screen assets, logos or source code were copied.

The redesign includes Home, Activity, Wallets, Plan, Profile, sign-in/registration, transaction entry/review, and reusable sheets. Activity search and filters, account creation/renaming/archiving, budget creation, period selection, preferences and financial entry remain connected to actual backend operations. Financial calculations remain server-side.

Visual QA uses a development-only `/design-preview` route with clearly marked example data and the same presentation components used by the app. It never changes financial records and redirects away in release builds. It is not a separate production demo dashboard or a native APK verification.

## Preview locally

From the repository root on Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-mobile.ps1 -Preview
```

Open http://localhost:8091/design-preview. The helper finds the workspace Node runtime when needed. Without `-Preview`, it starts Expo for the actual app; `-Android` also opens an available emulator. The real app uses `apps/mobile/.env` for its API URL.

## Verification

Mobile TypeScript and the Android JavaScript/Hermes export passed. The native production bundle contains neither the browser gallery nor its example-data markers. The web production build also passed after the display-name change.

The Playwright design check in `scripts/qa-mobile-design.cjs` passed against the local Expo browser gallery at 390px and 360px phone widths. It exercises navigation, balance visibility, category/trend charts, expense review and exact paise conversion, transfers, invalid amounts, authentication validation, password visibility, registration, empty states and horizontal overflow. The gallery made no API requests and produced no browser page errors. Screenshots are saved under the ignored `.artifacts/mobile-redesign/` directory.

These checks validate the shared presentation and form behavior in a browser plus native bundle compilation. Physical-device rendering, SecureStore sign-in and APK/iOS builds remain unverified.
