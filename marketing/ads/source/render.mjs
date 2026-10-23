// Renders the ads in ads.html to MP4.
//
//   node marketing/ads/source/render.mjs              all ads
//   node marketing/ads/source/render.mjs impress      one ad
//
// Needs Playwright (with a Chromium), ffmpeg and python3 with numpy. If
// Playwright is not resolvable from here, point PLAYWRIGHT_MODULE at it.
//
// Each ad comes out five ways in ../videos:
//   NN-name-9x16.mp4   Reels, Stories, and the default upload
//   NN-name-4x5.mp4    Instagram and Facebook feed (a centre crop of the same frames)
//   NN-name-1x1.mp4    YouTube in-feed (a square crop)
//   NN-name-16x9.mp4   YouTube in-stream (the vertical ad over a blurred copy of itself)
//   NN-name-cover.jpg  a cover/thumbnail frame
//
// Stock footage goes in ./stock, named after the clip an ad asks for
// (stock/gym.mp4, stock/bed.mov, a .jpg works too). It is cropped to 9:16 and
// graded black and white here. A clip that is missing leaves its scene on the
// plain dark background, and the run says which ones were missing.

import { spawn, execFileSync } from 'node:child_process';
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

const ORDER = ['muscle', 'impress', 'howlong'];
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : ORDER;

// Chromium will not load fonts into a file:// page, so serve the repo over HTTP.
const TYPES = { '.html': 'text/html', '.ttf': 'font/ttf', '.png': 'image/png', '.jpg': 'image/jpeg', '.js': 'text/javascript' };
// Prepared stock frames are served from the temp folder under /__stock/.
const server = createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const root = url.startsWith('/__stock/') ? path.join(TMP, 'stock') : REPO;
  const file = path.join(root, url.replace(/^\/__stock\//, '/'));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/marketing/ads/source/ads.html`;

const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'ignore', 'inherit'] });

// aq-mode 3 spends more bits on dark, flat areas, which is most of these ads.
const X264 = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-x264-params', 'aq-mode=3', '-pix_fmt', 'yuv420p'];

const STOCK_DIR = path.join(HERE, 'stock');
const prepared = {};
function prepareStock(clip) {
  if (clip in prepared) return prepared[clip];
  const src = fs.existsSync(STOCK_DIR) && fs.readdirSync(STOCK_DIR).find(f => path.parse(f).name === clip && !f.endsWith('.md'));
  if (!src) {
    console.log(`  no stock/${clip}.*, so that scene stays on the plain background`);
    return (prepared[clip] = null);
  }
  const dir = path.join(TMP, 'stock', clip);
  fs.mkdirSync(dir, { recursive: true });
  // Ten seconds is more than any scene holds a clip for.
  run('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(STOCK_DIR, src), '-t', '10', '-vf',
    'fps=30,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,hue=s=0,eq=contrast=1.15:brightness=-0.02',
    '-q:v', '3', path.join(dir, '%05d.jpg')]);
  return (prepared[clip] = { frames: fs.readdirSync(dir).length, base: `/__stock/${clip}/` });
}

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
  const clips = Object.fromEntries(meta.clips.map(c => [c, prepareStock(c)]).filter(([, v]) => v));
  await page.evaluate(c => window.setStock(c), clips);

  const silent = path.join(TMP, `${name}.mp4`);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', '-',
    ...X264, '-movflags', '+faststart', silent], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((resolve, reject) => ff.on('close', c => c === 0 ? resolve() : reject(new Error(`ffmpeg exited ${c}`))));
  for (let i = 0; i < frames; i++) {
    await page.evaluate(t => window.renderAt(t), i / FPS);
    const jpg = await page.screenshot({ type: 'jpeg', quality: 94 });
    if (!ff.stdin.write(jpg)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await done;

  await page.evaluate(t => window.renderAt(t), meta.thumb);
  await page.screenshot({ path: `${stem}-cover.jpg`, type: 'jpeg', quality: 92 });

  const cues = path.join(TMP, `${name}.json`), wav = path.join(TMP, `${name}.wav`);
  fs.writeFileSync(cues, JSON.stringify({ duration: frames / FPS, cues: meta.cues, vo: meta.vo }));
  run('python3', [path.join(HERE, 'sfx.py'), cues, wav]);

  run('ffmpeg', ['-y', '-loglevel', 'error', '-i', silent, '-i', wav, '-map', '0:v', '-map', '1:a',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', `${stem}-9x16.mp4`]);
  run('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${stem}-9x16.mp4`, '-vf', 'crop=1080:1350:0:285',
    ...X264, '-c:a', 'copy', '-movflags', '+faststart', `${stem}-4x5.mp4`]);
  // Square, for YouTube in-feed: the text zone (y 300-1270) fits inside this crop.
  run('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${stem}-9x16.mp4`, '-vf', 'crop=1080:1080:0:245',
    ...X264, '-c:a', 'copy', '-movflags', '+faststart', `${stem}-1x1.mp4`]);
  // Landscape, for YouTube in-stream: the vertical ad in the middle, over a blurred, darkened copy of itself.
  run('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${stem}-9x16.mp4`, '-filter_complex',
    '[0:v]split[a][b];[a]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,boxblur=40:4,eq=brightness=-0.3[bg];[b]scale=-2:1080[fg];[bg][fg]overlay=(W-w)/2:0',
    ...X264, '-c:a', 'copy', '-movflags', '+faststart', `${stem}-16x9.mp4`]);
}

await browser.close();
server.close();
fs.rmSync(TMP, { recursive: true, force: true });
