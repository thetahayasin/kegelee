// Renders the ads in ads.html to MP4.
//
//   node marketing/ads/source/render.mjs              all ads
//   node marketing/ads/source/render.mjs trythis      one ad
//
// Needs Playwright (with a Chromium), ffmpeg and python3 with numpy. If
// Playwright is not resolvable from here, point PLAYWRIGHT_MODULE at it.
//
// Each ad comes out three ways in ../videos:
//   NN-name-9x16.mp4   Reels, Stories, and the default upload
//   NN-name-4x5.mp4    Instagram and Facebook feed (a centre crop of the same frames)
//   NN-name-cover.jpg  a cover/thumbnail frame

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const OUT = path.resolve(HERE, '../videos');
const TMP = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'kegelee-ads-'));
const FPS = 30;

const ORDER = ['invisible', 'trythis', 'legday', 'screentime', 'stamina', 'muscle'];
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : ORDER;

// Chromium will not load fonts into a file:// page, so serve the repo over HTTP.
const TYPES = { '.html': 'text/html', '.ttf': 'font/ttf', '.png': 'image/png', '.jpg': 'image/jpeg', '.js': 'text/javascript' };
const server = createServer((req, res) => {
  const file = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(REPO) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/marketing/ads/source/ads.html`;

const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'ignore', 'inherit'] });

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });

for (const name of wanted) {
  const n = String(ORDER.indexOf(name) + 1).padStart(2, '0');
  const stem = path.join(OUT, `${n}-${name}`);
  await page.goto(`${BASE}?ad=${name}`);
  await page.evaluate(() => window.ready);
  const meta = await page.evaluate(() => window.AD_META);
  const frames = Math.round(meta.duration * FPS);
  console.log(`${name}: ${meta.duration}s, ${frames} frames, ${meta.cues.length} sound cues`);

  // Numbered files, not a pipe: ffmpeg's JPEG pipe parser sometimes merges two
  // frames into one, which shortens the video and pulls it out of sync with the voice.
  const dir = path.join(TMP, name);
  fs.mkdirSync(dir);
  for (let i = 0; i < frames; i++) {
    await page.evaluate(t => window.renderAt(t), i / FPS);
    await page.screenshot({ path: path.join(dir, `${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 94 });
  }
  const silent = path.join(TMP, `${name}.mp4`);
  run('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, '%05d.jpg'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', silent]);
  fs.rmSync(dir, { recursive: true, force: true });

  await page.evaluate(t => window.renderAt(t), meta.thumb);
  await page.screenshot({ path: `${stem}-cover.jpg`, type: 'jpeg', quality: 92 });

  const cues = path.join(TMP, `${name}.json`), wav = path.join(TMP, `${name}.wav`);
  fs.writeFileSync(cues, JSON.stringify({ duration: frames / FPS, cues: meta.cues, vo: meta.vo }));
  run('python3', [path.join(HERE, 'sfx.py'), cues, wav]);

  run('ffmpeg', ['-y', '-loglevel', 'error', '-i', silent, '-i', wav, '-map', '0:v', '-map', '1:a',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', `${stem}-9x16.mp4`]);
  run('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${stem}-9x16.mp4`, '-vf', 'crop=1080:1350:0:285',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', `${stem}-4x5.mp4`]);
}

await browser.close();
server.close();
fs.rmSync(TMP, { recursive: true, force: true });
