import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = path.join(root, 'dist', 'battlefield-bundle.js');
const built = spawnSync('npx', ['esbuild', 'src/main.ts', '--bundle', '--format=iife', '--minify', `--outfile=${bundle}`], {
  cwd: root,
  stdio: 'inherit',
});
if (built.status !== 0) process.exit(built.status ?? 1);

const js = readFileSync(bundle, 'utf8');
const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Field</title>
  <style>
    html, body { margin: 0; height: 100%; overflow: hidden; background: #6d7c8c; }
    #view { display: block; width: 100vw; height: 100vh; }
  </style>
</head>
<body>
  <canvas id="view"></canvas>
  <script>${js}</script>
</body>
</html>
`;
writeFileSync(path.join(root, 'battlefield.html'), html);
console.log('wrote battlefield.html', html.length);
