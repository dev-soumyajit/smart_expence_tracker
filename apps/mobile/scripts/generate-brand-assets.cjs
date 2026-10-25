// Render the editable vector originals. Requires the web app's installed Sharp dependency.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const sharp = createRequire(path.resolve(__dirname, '../../web/package.json'))('sharp');
const directory = path.resolve(__dirname, '../assets/brand');

(async () => {
  for (const [source, output, opaque] of [
    ['icon.svg', 'app-icon.png', true],
    ['adaptive-foreground.svg', 'adaptive-foreground.png', false],
    ['adaptive-monochrome.svg', 'adaptive-monochrome.png', false],
    ['splash.svg', 'splash-mark.png', false],
  ]) {
    let render = sharp(await fs.readFile(path.join(directory, source))).resize(1024, 1024);
    if (opaque) render = render.removeAlpha();
    await render.png().toFile(path.join(directory, output));
    console.log('Rendered ' + output);
  }
  await sharp(path.join(directory, 'app-icon.png')).resize(128, 128).png().toFile(path.join(directory, 'favicon.png'));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
