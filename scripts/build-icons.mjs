// Rasterises the brand images of the app into assets/images. Usage: node scripts/build-icons.mjs
//
// The drawing is the site's own (web repo: app/icon.tsx, app/apple-icon.tsx, components/logo.tsx,
// lib/logo-font.ts; see docs/spec/08-design-system.md §7): the app icon is the single letter «Ш» of the
// lockup, white, Montserrat Black (900), on a plate of the flat brand colour #16C79F with the glyph at
// 60 % of the plate; the splash is the text lockup «ШБЗШкола» (ink + brand, letter-spacing −0.015em).
// There is no logo image anywhere on the site, so everything is drawn here from the font.
//
// Glyphs are centered by their ink box (measured), not by the line box, so the letter sits optically in
// the middle. Playwright is only used as a canvas with real font shaping; `require('playwright')`
// resolves from the global install, it is not a dependency of this project.
import { Buffer } from 'node:buffer';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'assets', 'images');
const fontPath = join(root, 'node_modules', '@expo-google-fonts', 'montserrat', '900Black', 'Montserrat_900Black.ttf');

const BRAND = '#16C79F'; // LOGO_BRAND
const INK = '#0A0A0A'; // LOGO_INK
const WHITE = '#FFFFFF';
const LETTER = 'Ш';
const LOCKUP_INK = 'ШБЗ';
const LOCKUP_BRAND = 'Школа';
const LOCKUP_SPACING_EM = -0.015;

/**
 * Every image the app config points at.
 * - `plate`: fill of the canvas (null = transparent); `radius`: corner radius as a share of the side.
 * - `letter`: font size of «Ш» as a share of the side.
 * - `lockup`: width of the wordmark as a share of the side, and the colour of its «ШБЗ» part.
 */
const IMAGES = [
  // iOS / store icon: full bleed, no transparency, no pre-rounded corners (the OS rounds it).
  { file: 'icon.png', size: 1024, plate: BRAND, radius: 0, letter: 0.6 },
  // Android adaptive icon: only the central 66 % of the 108dp canvas is always visible, so the glyph is
  // scaled by the same factor to look like the iOS icon (0.6 × 0.667 ≈ 0.4).
  { file: 'android-icon-foreground.png', size: 1024, plate: null, radius: 0, letter: 0.4 },
  { file: 'android-icon-background.png', size: 1024, plate: BRAND, radius: 0 },
  // Themed icons: Android tints the alpha channel of the same glyph.
  { file: 'android-icon-monochrome.png', size: 1024, plate: null, radius: 0, letter: 0.4 },
  // Web favicon: the site's favicon composition (radius ≈ 22 %, glyph ≈ 60 %).
  { file: 'favicon.png', size: 196, plate: BRAND, radius: 7 / 32, letter: 19 / 32 },
  // Splash: the lockup on a transparent square (the config supplies the background colour). It spans
  // 90 % of the square so `imageWidth` in app.json maps directly to the visible wordmark width.
  { file: 'splash-icon.png', size: 1024, plate: null, radius: 0, lockup: 0.9, lockupInk: INK },
  { file: 'splash-icon-dark.png', size: 1024, plate: null, radius: 0, lockup: 0.9, lockupInk: WHITE },
];

const fontBase64 = (await readFile(fontPath)).toString('base64');
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
await page.setContent(`<!doctype html><html><head><style>
  @font-face { font-family: "Logo"; font-weight: 900; src: url(data:font/ttf;base64,${fontBase64}) format("truetype"); }
  body { margin: 0; font-family: "Logo"; font-weight: 900; }
</style></head><body>Ш</body></html>`);
await page.evaluate(() => document.fonts.load('900 100px "Logo"', 'ШБЗШкола'));

for (const image of IMAGES) {
  const dataUrl = await page.evaluate(
    ({ image, colors, text }) => {
      const { size } = image;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, size, size);
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';

      if (image.plate) {
        ctx.fillStyle = image.plate;
        ctx.beginPath();
        ctx.roundRect(0, 0, size, size, image.radius * size);
        ctx.fill();
      }

      // Left/top of the pen position that centers the ink box of `string` on the canvas.
      const centered = (string) => {
        const m = ctx.measureText(string);
        const inkWidth = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
        const inkHeight = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
        return {
          x: (size - inkWidth) / 2 + m.actualBoundingBoxLeft,
          y: (size - inkHeight) / 2 + m.actualBoundingBoxAscent,
          inkWidth,
        };
      };

      if (image.letter) {
        ctx.font = `900 ${image.letter * size}px "Logo"`;
        ctx.fillStyle = colors.white;
        const at = centered(text.letter);
        ctx.fillText(text.letter, at.x, at.y);
      }

      if (image.lockup) {
        const whole = text.lockupInk + text.lockupBrand;
        const setFont = (fontSize) => {
          ctx.font = `900 ${fontSize}px "Logo"`;
          ctx.letterSpacing = `${text.spacingEm * fontSize}px`;
        };
        // Fit the wordmark to the requested width: measure at a probe size and scale.
        setFont(100);
        const probe = centered(whole).inkWidth;
        const fontSize = (100 * image.lockup * size) / probe;
        setFont(fontSize);
        const at = centered(whole);
        // One shaped run keeps the kerning of the whole word; the two colours are two clipped passes
        // split at the pen position after «ШБЗ», which lies in the gap between «З» and «Ш».
        const split = at.x + ctx.measureText(text.lockupInk).width;
        const pass = (from, to, color) => {
          ctx.save();
          ctx.beginPath();
          ctx.rect(from, 0, to - from, size);
          ctx.clip();
          ctx.fillStyle = color;
          ctx.fillText(whole, at.x, at.y);
          ctx.restore();
        };
        pass(0, split, image.lockupInk);
        pass(split, size, colors.brand);
      }

      // Left in the document so an opaque image can be captured as a screenshot (see below).
      canvas.style.display = 'block';
      document.body.replaceChildren(canvas);
      return canvas.toDataURL('image/png');
    },
    {
      image,
      colors: { white: WHITE, brand: BRAND },
      text: { letter: LETTER, lockupInk: LOCKUP_INK, lockupBrand: LOCKUP_BRAND, spacingEm: LOCKUP_SPACING_EM },
    },
  );
  // A canvas always encodes RGBA. Full-bleed opaque images (the store icon must have no alpha channel)
  // are captured as a page screenshot instead, which Chromium encodes as plain RGB.
  const opaque = Boolean(image.plate) && image.radius === 0;
  let png;
  if (opaque) {
    await page.setViewportSize({ width: image.size, height: image.size });
    png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: image.size, height: image.size } });
  } else {
    png = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  }
  await writeFile(join(outDir, image.file), png);
  console.log(`wrote assets/images/${image.file} (${image.size}×${image.size})`);
}

await browser.close();
