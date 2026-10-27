import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'screenshots', 'rts');
const shots = ['wide', 'bunker', 'tower'];
const base = process.env.LOOK_URL || 'http://127.0.0.1:5173/';

const browser = await chromium.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--disable-gpu', '--no-sandbox'],
});
await mkdir(outDir, { recursive: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('pageerror', (error) => console.log('page exception:', error.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('page error:', msg.text());
});
try {
  for (const name of shots) {
    const url = new URL(base);
    url.searchParams.set('shot', name);
    console.log('capture', url.toString());
    await page.goto(url.toString(), { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__ready === true || Boolean(window.__error), null, { timeout: 120000 });
    const failed = await page.evaluate(() => window.__error || null);
    if (failed) throw new Error(failed);
    await page.waitForTimeout(500);
    const file = path.join(outDir, `${name}.png`);
    await page.screenshot({ path: file });
    console.log('wrote', file);
  }
} finally {
  await browser.close();
}
