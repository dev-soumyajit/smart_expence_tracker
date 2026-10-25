# Morrowmint icon and launch screen

The launcher extends the app's existing M-and-leaf mark: a lime monogram, ivory leaf and solid forest background. Editable SVG originals and their PNG exports live in `apps/mobile/assets/brand/`. The icon is a vector design rendered to PNG; it does not depend on a generated illustration or a remote image service.

- `app-icon.png`: opaque 1024px square for iOS and legacy launchers. The operating system applies its mask.
- `adaptive-foreground.png`: transparent Android foreground with the mark inside the adaptive safe area.
- `adaptive-monochrome.png`: alpha mask for Android themed icons.
- `splash-mark.png`: transparent, rounded logo plate for the native launch screen.
- `favicon.png`: mobile browser preview icon.

The PNGs are committed and require no generation step during an ordinary mobile build. To edit the vector artwork and regenerate them, install the web app's dependencies (which include Sharp), then run from the repository root:

```powershell
node apps/mobile/scripts/generate-brand-assets.cjs
```

## Launch behavior

The native splash uses the same ivory background and logo placement as the React welcome screen. It remains visible until fonts (or their fallback) and the first logo frame are ready. The welcome screen waits for saved-session restoration and a brief 750ms brand presentation, then fades into the actual route. No financial record is loaded from fixture data.

The loading rail is indeterminate. Reduced-motion preferences stop its movement. After six seconds of account restoration, the copy changes to a connection message. The existing 70-second timeout allows for Render cold starts, and transient connection errors preserve the saved refresh credential. A storage failure exits startup rather than leaving an unhandled rejection. Small screens omit the secondary signature to preserve space for loading feedback.

## Native rebuild

Icon and native splash changes require a new binary. An Expo reload cannot change an already installed launcher icon. From `apps/mobile/`, sync the native resources and build:

```powershell
npx expo prebuild --platform android --no-install
npx expo run:android
```

The source uses Expo SDK 55's `expo-splash-screen` plugin and includes the adaptive/themed icon fields in `app.json`. The compatible `expo-system-ui` module enables the configured light appearance and root background. See [Expo's splash-screen module](https://docs.expo.dev/versions/v55.0.0/sdk/splash-screen/) and [icon/splash requirements](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/). Verify the actual native splash in a preview or production binary; Expo Go and development clients can substitute their own launch screen.

The browser gallery exposes the shared welcome screen at `/design-preview?screen=welcome`. This does not contact the API. It is excluded from native production gallery code through the existing platform-specific preview modules. Screenshots are saved in `.artifacts/morrowmint-launch/`.
