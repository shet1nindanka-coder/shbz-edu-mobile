// Phone-sized screenshots of the web export, for visual verification without a device.
// Usage: node scripts/shot.mjs <steps.json> — steps file:
// { "baseUrl": "http://localhost:4173", "outDir": "/abs/dir", "colorScheme": "light"|"dark",
//   "steps": [ { "goto": "/path" } | { "click": "text or css" } | { "fill": ["css", "value"] } |
//              { "press": "Enter" } | { "wait": 500 } | { "waitFor": "text or css" } |
//              { "shot": "name" } | { "eval": "js expression" } ] }
// Selectors starting with "text=" / "role=" / css are passed to Playwright as is; a bare string is tried as
// visible text first.
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const config = JSON.parse(await readFile(process.argv[2], 'utf8'));
await mkdir(config.outDir, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: config.width ?? 390, height: config.height ?? 844 },
  deviceScaleFactor: config.scale ?? 1,
  colorScheme: config.colorScheme ?? 'light',
  locale: config.locale ?? 'ru-RU',
  timezoneId: config.timezoneId ?? 'Europe/Moscow',
  hasTouch: true,
  isMobile: true,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});
const sel = (s) => (/^(text=|role=|css=|xpath=|[#.\[]|\w+\[)/.test(s) ? s : `text=${s}`);

for (const step of config.steps) {
  try {
    if (step.goto) await page.goto(config.baseUrl + step.goto, { waitUntil: 'networkidle' });
    else if (step.click) await page.locator(sel(step.click)).first().click({ timeout: step.timeout ?? 8000 });
    else if (step.fill) await page.locator(sel(step.fill[0])).first().fill(step.fill[1]);
    else if (step.press) await page.keyboard.press(step.press);
    else if (step.wait) await page.waitForTimeout(step.wait);
    else if (step.waitFor) await page.locator(sel(step.waitFor)).first().waitFor({ timeout: step.timeout ?? 8000 });
    else if (step.eval) console.log('eval:', JSON.stringify(await page.evaluate(step.eval)));
    else if (step.shot) {
      await page.waitForTimeout(step.settle ?? 400);
      await page.screenshot({ path: `${config.outDir}/${step.shot}.png`, fullPage: Boolean(step.fullPage) });
      console.log(`shot ${step.shot}.png`);
    }
  } catch (e) {
    console.log(`STEP FAILED ${JSON.stringify(step)}: ${e.message.split('\n')[0]}`);
    await page.screenshot({ path: `${config.outDir}/FAILED-${Date.now()}.png` }).catch(() => {});
  }
}
if (errors.length) console.log(`PAGE ERRORS (${errors.length}):\n` + [...new Set(errors)].slice(0, 30).join('\n'));
await browser.close();
