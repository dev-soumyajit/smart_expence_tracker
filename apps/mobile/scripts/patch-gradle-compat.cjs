// RN 0.83's Foojay 0.5 resolver references IBM_SEMERU, removed by Gradle 9.
// Upstream: https://github.com/facebook/react-native/issues/56287
// Keep this narrow and reproducible across npm ci, rather than editing generated Android files.
const fs = require('node:fs');
const path = require('node:path');
const root = path.dirname(require.resolve('@react-native/gradle-plugin/package.json'));
const file = path.join(root, 'settings.gradle.kts');
const before = fs.readFileSync(file, 'utf8');
const old = 'id("org.gradle.toolchains.foojay-resolver-convention").version("0.5.0")';
const fixed = 'id("org.gradle.toolchains.foojay-resolver-convention").version("1.0.0")';
if (before.includes(old)) { fs.writeFileSync(file, before.replace(old, fixed)); process.stdout.write('Applied RN 0.83 / Gradle 9 Foojay resolver compatibility fix.\n'); }
else if (!before.includes(fixed)) process.stdout.write('Foojay resolver workaround not needed for this React Native version.\n');
