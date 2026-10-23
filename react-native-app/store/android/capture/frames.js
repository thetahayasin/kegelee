/**
 * Put each captured screen into its Play store frame, and make each
 * language's feature graphic.
 *
 * Reads raw/ (run capture.js first), dist/ (build.js) and ../headlines.json.
 * Every phone screenshot is the punch line above the real screen in a phone
 * (web/frame.html), at 1080 x 1920 - the 9:16 portrait size Play asks for.
 * The feature graphic (web/feature.html) is 1024 x 500: the app's mark and
 * name with the first screenshot's punch line, beside the guided circle.
 * Both are written where scripts/play-screenshots.js uploads from.
 *
 *   node frames.js                  # every language
 *   node frames.js --lang de,ar     # just these app languages
 *
 * Output: ../screenshots/<Play language code>/<nn>-<screen>.png
 *         ../feature-graphic/<Play language code>.png
 */
const fs = require('fs');
const path = require('path');

const { HERE, APP, chromium, PLAY_LANGUAGE, isRtl, languagesFromArgs, serve } = require('./common');

const RAW = path.join(HERE, 'raw');
const OUT = path.join(HERE, '..', 'screenshots');
const FEATURE_OUT = path.join(HERE, '..', 'feature-graphic');
const HEADLINES = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'headlines.json'), 'utf8'));

/** The feature graphic's words and screen: the first frame's line, the guided circle. */
const FEATURE = { copy: 'training', shot: 'workout' };

(async () => {
  if (!fs.existsSync(path.join(HERE, 'dist', 'feature.html'))) {
    throw new Error('dist/ is missing - run `node build.js` first');
  }
  const langs = languagesFromArgs();
  const missing = langs.filter((l) => !HEADLINES[l]);
  if (missing.length) throw new Error(`no headlines for: ${missing.join(', ')}`);

  // The capture directory, so the page can reach both dist/ and raw/.
  const server = await serve(HERE);
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const context = await browser.newContext({ deviceScaleFactor: 1 });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, (route) => route.abort());
  const page = await context.newPage();
  fs.mkdirSync(FEATURE_OUT, { recursive: true });

  try {
    for (const lang of langs) {
      const play = PLAY_LANGUAGE[lang];
      const dir = isRtl(lang) ? 'rtl' : 'ltr';
      const shots = fs.existsSync(path.join(RAW, play))
        ? fs.readdirSync(path.join(RAW, play)).filter((f) => f.endsWith('.png')).sort()
        : [];
      if (!shots.length) throw new Error(`${lang}: nothing in raw/${play} - run capture.js first`);
      const sceneOf = (file) => file.replace(/^\d+-|\.png$/g, '');

      const out = path.join(OUT, play);
      fs.rmSync(out, { recursive: true, force: true });
      fs.mkdirSync(out, { recursive: true });
      const sizes = [];
      await page.setViewportSize({ width: 1080, height: 1920 });
      for (const file of shots) {
        const copy = HEADLINES[lang][sceneOf(file)];
        if (!copy) throw new Error(`${lang}: no headline for ${sceneOf(file)}`);
        await page.goto(`${base}/dist/frame.html`);
        const layout = await page.evaluate((args) => window.renderFrame(args), {
          lang,
          dir,
          headline: copy.headline,
          sub: copy.sub,
          shot: `/raw/${play}/${file}`,
        });
        sizes.push(`${layout.fontSize}/${layout.phoneWidth}`);
        await page.screenshot({ path: path.join(out, file) });
      }

      const featureShot = shots.find((f) => sceneOf(f) === FEATURE.shot);
      if (!featureShot) throw new Error(`${lang}: no ${FEATURE.shot} capture for the feature graphic`);
      await page.setViewportSize({ width: 1024, height: 500 });
      await page.goto(`${base}/dist/feature.html`);
      const feature = await page.evaluate((args) => window.renderFeature(args), {
        lang,
        dir,
        headline: HEADLINES[lang][FEATURE.copy].headline,
        sub: HEADLINES[lang][FEATURE.copy].sub,
        shot: `/raw/${play}/${featureShot}`,
      });
      await page.screenshot({ path: path.join(FEATURE_OUT, `${play}.png`) });

      console.log(
        `${lang.padEnd(8)} -> ${path.relative(APP, out)}  (headline px / phone px: ${sizes.join(' ')}; feature ${feature.fontSize})`,
      );
    }
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
