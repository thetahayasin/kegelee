/**
 * Put each captured screen into its Play store frame: the punch line from
 * ../headlines.json above the real screen in a phone (web/frame.html).
 *
 * Reads raw/ (run capture.js first) and dist/ (build.js), renders every frame
 * at 1080 x 1920 - the 9:16 portrait size Play asks for - and writes it where
 * scripts/play-screenshots.js uploads from.
 *
 *   node frames.js                  # every language
 *   node frames.js --lang de,ar     # just these app languages
 *
 * Output: ../screenshots/<Play language code>/<nn>-<screen>.png
 */
const fs = require('fs');
const path = require('path');

const { HERE, APP, chromium, PLAY_LANGUAGE, isRtl, languagesFromArgs, serve } = require('./common');

const RAW = path.join(HERE, 'raw');
const OUT = path.join(HERE, '..', 'screenshots');
const HEADLINES = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'headlines.json'), 'utf8'));

(async () => {
  if (!fs.existsSync(path.join(HERE, 'dist', 'frame.html'))) {
    throw new Error('dist/ is missing - run `node build.js` first');
  }
  const langs = languagesFromArgs();
  const missing = langs.filter((l) => !HEADLINES[l]);
  if (missing.length) throw new Error(`no headlines for: ${missing.join(', ')}`);

  // The capture directory, so the page can reach both dist/ and raw/.
  const server = await serve(HERE);
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, (route) => route.abort());
  const page = await context.newPage();

  try {
    for (const lang of langs) {
      const play = PLAY_LANGUAGE[lang];
      const shots = fs.existsSync(path.join(RAW, play))
        ? fs.readdirSync(path.join(RAW, play)).filter((f) => f.endsWith('.png')).sort()
        : [];
      if (!shots.length) throw new Error(`${lang}: nothing in raw/${play} - run capture.js first`);

      const dir = path.join(OUT, play);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      const sizes = [];
      for (const file of shots) {
        const scene = file.replace(/^\d+-|\.png$/g, '');
        const copy = HEADLINES[lang][scene];
        if (!copy) throw new Error(`${lang}: no headline for ${scene}`);

        await page.goto(`${base}/dist/frame.html`);
        const layout = await page.evaluate((args) => window.renderFrame(args), {
          lang,
          dir: isRtl(lang) ? 'rtl' : 'ltr',
          headline: copy.headline,
          sub: copy.sub,
          shot: `/raw/${play}/${file}`,
        });
        sizes.push(`${layout.fontSize}/${layout.phoneWidth}`);
        await page.screenshot({ path: path.join(dir, file) });
      }
      console.log(`${lang.padEnd(8)} -> ${path.relative(APP, dir)}  (headline px / phone px: ${sizes.join(' ')})`);
    }
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
