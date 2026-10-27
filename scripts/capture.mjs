import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
    '--window-size=1600,900',
  ],
});

const page = await browser.newPage();
page.setDefaultTimeout(120000);
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (msg) => logs.push(`${msg.type()}: ${msg.text()}`));
page.on('pageerror', (error) => logs.push(`pageerror: ${error.message}`));

const port = process.env.PORT || '5173';
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle0', timeout: 120000 });
await page.waitForFunction(() => window.__ready === true, { timeout: 120000 });
await new Promise((resolve) => setTimeout(resolve, 700));
await page.screenshot({ path: '/opt/cursor/artifacts/topdown.png' });
const hero = await page.evaluate(() => window.__debug());

await page.evaluate(() => window.__frame('inside'));
await new Promise((resolve) => setTimeout(resolve, 700));
await page.screenshot({ path: '/opt/cursor/artifacts/topdown-inside.png' });
const inside = await page.evaluate(() => window.__debug());

console.log(JSON.stringify({ hero, inside, logs: logs.slice(-50) }, null, 2));
await browser.close();
