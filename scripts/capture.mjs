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
page.setDefaultTimeout(90000);
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (msg) => logs.push(`${msg.type()}: ${msg.text()}`));
page.on('pageerror', (error) => logs.push(`pageerror: ${error.message}`));

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0', timeout: 90000 });
await page.waitForFunction(() => window.__ready === true, { timeout: 90000 });
await page.evaluate(() => window.__frame('far'));
await new Promise((resolve) => setTimeout(resolve, 600));
await page.screenshot({ path: '/opt/cursor/artifacts/far.png' });
await page.evaluate(() => window.__frame('near'));
await new Promise((resolve) => setTimeout(resolve, 600));
await page.screenshot({ path: '/opt/cursor/artifacts/near.png' });

const debug = await page.evaluate(() => window.__debug());
console.log(JSON.stringify({ debug, logs: logs.slice(-40) }, null, 2));
await browser.close();
