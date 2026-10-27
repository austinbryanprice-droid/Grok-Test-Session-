import { spawn } from 'node:child_process';
import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'screenshots', 'compare');
const refDir = path.join(root, 'references');

const only = new Set((process.env.SHOTS || '').split(',').map((name) => name.trim()).filter(Boolean));
const shots = [
  ['village', 'ref-village-golden-hour.jpg'],
  ['forest', 'ref-forest-haze.jpg'],
  ['lake', 'ref-lake-reflections.jpg'],
  ['wood', 'ref-wood-detail.jpg'],
  ['cottage', 'ref-stone-wood-module.jpg'],
  ['roof', 'ref-roof-gables.jpg'],
  ['hud', 'ref-fantasy-hud.jpg'],
  ['vista', 'ref-vista-grade.jpg'],
].filter(([name]) => only.size === 0 || only.has(name));

const chromeCandidates = [
  '/usr/local/bin/google-chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
];

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function findChrome() {
  for (const candidate of chromeCandidates) {
    if (await exists(candidate)) return candidate;
  }
  throw new Error('System Chrome was not found');
}

function waitForHttp(url, child) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(async () => {
      if (child.exitCode !== null) {
        clearInterval(timer);
        reject(new Error(`preview server exited ${child.exitCode}`));
        return;
      }
      try {
        const response = await fetch(url);
        if (response.ok || response.status === 404) {
          clearInterval(timer);
          resolve();
        }
      } catch {
        if (Date.now() - started > 30000) {
          clearInterval(timer);
          reject(new Error(`timed out waiting for ${url}`));
        }
      }
    }, 300);
  });
}

async function ensureServer() {
  if (process.env.LOOK_URL) return { url: process.env.LOOK_URL, stop() {} };
  const url = 'http://127.0.0.1:4173/';
  const child = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], {
    cwd: root,
    stdio: 'inherit',
  });
  await waitForHttp(url, child);
  return {
    url,
    stop() {
      child.kill('SIGTERM');
    },
  };
}

async function measure(page) {
  return page.evaluate(() => new Promise((resolve) => {
    const start = performance.now();
    const samples = [];
    let last = start;
    const tick = (now) => {
      samples.push(now - last);
      last = now;
      if (now - start < 2000) requestAnimationFrame(tick);
      else {
        const avg = samples.reduce((sum, value) => sum + value, 0) / samples.length;
        resolve({ frameMs: avg, fps: 1000 / avg, reported: window.__fps ?? null });
      }
    };
    requestAnimationFrame(tick);
  }));
}

const server = await ensureServer();
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: await findChrome(),
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--disable-gpu', '--no-sandbox'],
});

const timings = {};
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('page error:', msg.text());
  });
  page.on('pageerror', (error) => console.log('page exception:', error.message));

  for (const [name] of shots) {
    const url = new URL(server.url);
    url.searchParams.set('shot', name);
    url.searchParams.set('quality', 'ultra');
    console.log('capture', url.toString());
    await page.goto(url.toString(), { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__ready === true || Boolean(window.__error), null, { timeout: 120000 });
    const failed = await page.evaluate(() => window.__error || null);
    if (failed) throw new Error(`${name}: ${failed}`);
    await page.waitForTimeout(600);
    const ours = path.join(outDir, `${name}-ours.png`);
    await page.screenshot({ path: ours });
    if (name === 'village') timings.ultra = await measure(page);
    console.log('wrote', ours);
  }

  const low = new URL(server.url);
  low.searchParams.set('shot', 'village');
  low.searchParams.set('quality', 'low');
  await page.goto(low.toString(), { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await page.waitForTimeout(400);
  timings.low = await measure(page);
  await writeFile(path.join(outDir, 'timings.json'), JSON.stringify(timings, null, 2));
} finally {
  await browser.close();
  server.stop();
}

const py = `
from PIL import Image, ImageDraw, ImageFont
import os
root = ${JSON.stringify(root)}
out = os.path.join(root, "screenshots", "compare")
pairs = ${JSON.stringify(shots)}
for name, ref_name in pairs:
    ours = Image.open(os.path.join(out, f"{name}-ours.png")).convert("RGB")
    ref = Image.open(os.path.join(root, "references", ref_name)).convert("RGB")
    h = 420
    def fit(im):
        w = int(im.width * h / im.height)
        return im.resize((w, h), Image.Resampling.LANCZOS)
    a, b = fit(ref), fit(ours)
    canvas = Image.new("RGB", (a.width + b.width + 16, h + 28), (28, 22, 16))
    canvas.paste(a, (0, 28))
    canvas.paste(b, (a.width + 16, 28))
    draw = ImageDraw.Draw(canvas)
    draw.text((8, 6), f"{name} reference", fill=(230, 211, 174))
    draw.text((a.width + 24, 6), f"{name} render", fill=(230, 211, 174))
    canvas.save(os.path.join(out, f"{name}-side.png"))
    print("side", name, canvas.size)
`;
const child = spawn('python3', ['-c', py], { stdio: 'inherit' });
await new Promise((resolve, reject) => {
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`pillow exit ${code}`))));
});
