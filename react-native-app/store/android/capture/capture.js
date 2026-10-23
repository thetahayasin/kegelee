/**
 * Capture the app's real screens, in every language it ships, for the Play
 * screenshot frames.
 *
 * Serves dist/ (run build.js first) and opens it in Chromium shaped like an
 * Android phone: 412 x 915 CSS px at a device scale of 2, with the status bar
 * and gesture bar insets a phone reports, so the screens sit where they do on
 * a device. Walks the same five screens in each language. Every request that
 * leaves the page is failed, so the demo account never reaches the backend.
 *
 *   node capture.js                      # every language, every screen
 *   node capture.js --lang de,ar         # just these app languages
 *   node capture.js --scenes workout     # just these screens
 *
 * Output: raw/<Play language code>/<nn>-<screen>.png (gitignored), which
 * frames.js then puts into the store frames.
 */
const fs = require('fs');
const path = require('path');

const { HERE, APP, DIST, chromium, PLAY_LANGUAGE, isRtl, arg, languagesFromArgs, serve } = require('./common');

const OUT = path.join(HERE, 'raw');

/** A Pixel-sized phone: 20:9, with its status bar and gesture bar insets. */
const VIEWPORT = { width: 412, height: 915 };
const SCALE = 2;
const INSETS = { top: 32, bottom: 20 };

/**
 * What the main stack holds under each screenshot, opened by route name.
 *
 * The two animated screens are captured on a particular beat rather than
 * after a fixed sleep: `beat` waits until the circle shows that count under
 * that phase label (in the language being captured), then `settle` lets the
 * ring move into the middle of the phase.
 */
const SCENES = [
  { name: 'training', routes: [{ name: 'MainTabs', params: { screen: 'Training' } }], settle: 1500 },
  {
    name: 'workout',
    routes: [{ name: 'MainTabs' }, { name: 'Workout' }],
    beat: { count: 14, labelKey: 'catalogue.steps.contractAndHold' },
    settle: 450,
  },
  { name: 'progress', routes: [{ name: 'MainTabs', params: { screen: 'Progress' } }], settle: 1500 },
  { name: 'schedule', routes: [{ name: 'MainTabs', params: { screen: 'Schedule' } }], settle: 1500 },
  {
    name: 'basics',
    routes: [{ name: 'MainTabs' }, { name: 'KnowledgeLesson', params: { slug: 'first', index: 2 } }],
    // The guided circle is the lesson's second card.
    next: 1,
    beat: { count: 8, labelKey: 'catalogue.steps.contract' },
    settle: 300,
  },
];

/**
 * The seed for the page's Math.random.
 *
 * The daily session is shuffled, so an unseeded capture opens on a different
 * exercise in every language. This seed opens on Holding, whose long
 * "Contract & hold" is the clearest picture of the guided circle.
 */
const RANDOM_SEED = 2;

/** A translated string the way i18next resolves it: the language, then English. */
const translate = (lang, key) => {
  const read = (tag) => {
    try {
      const json = JSON.parse(fs.readFileSync(path.join(APP, 'src', 'i18n', 'locales', `${tag}.json`), 'utf8'));
      return key.split('.').reduce((node, part) => (node == null ? node : node[part]), json);
    } catch {
      return undefined;
    }
  };
  const text = read(lang) ?? read('en');
  if (typeof text !== 'string') throw new Error(`no string for ${key}`);
  return text;
};

/** Wait for the circle to read `count` under `label`. */
const waitForBeat = (page, count, label) =>
  page.waitForFunction(
    ([n, text]) => {
      const leaves = [...document.querySelectorAll('div')].filter(
        (d) => d.childElementCount === 0 && d.getBoundingClientRect().top < window.innerHeight * 0.6,
      );
      const words = leaves.map((d) => d.textContent.trim());
      return words.includes(text) && words.includes(String(n));
    },
    [count, label],
    { polling: 25, timeout: 30000 },
  );

/**
 * Shrink every overflowing adjustsFontSizeToFit text, as Android does.
 *
 * shims/react-native.js marks those texts with Android's floor in px. Each one
 * is reset to its own size, then stepped down 1% at a time until it fits its
 * box or reaches the floor - where Android, too, stops and ellipsizes.
 */
const fitText = (page) =>
  page.evaluate(() => {
    for (const el of document.querySelectorAll('[data-fit]')) {
      if (!el.dataset.fitBase) el.dataset.fitBase = window.getComputedStyle(el).fontSize;
      const base = parseFloat(el.dataset.fitBase);
      const floor = parseFloat(el.dataset.fit);
      // Sub-pixel widths: scrollWidth and clientWidth are rounded, and a line
      // half a pixel too long for its box still ends in an ellipsis.
      const range = document.createRange();
      range.selectNodeContents(el);
      const overflows = () =>
        range.getBoundingClientRect().width > el.getBoundingClientRect().width + 0.01 ||
        el.scrollHeight > el.clientHeight;
      let size = base;
      el.style.fontSize = `${size}px`;
      while (overflows() && size > floor) {
        size = Math.max(floor, size - base * 0.01);
        el.style.fontSize = `${size}px`;
      }
    }
  });

/**
 * Press the lesson's "next" arrow: the button furthest towards the END of
 * the bottom row, which is the right in English and the left in Arabic.
 */
const pressNext = (page, rtl) =>
  page.evaluate((endIsLeft) => {
    const vh = window.innerHeight;
    const buttons = [...document.querySelectorAll('[role="button"]')]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.top > vh * 0.75);
    buttons.sort((a, b) => (endIsLeft ? a.r.left - b.r.left : b.r.right - a.r.right));
    if (!buttons.length) throw new Error('no lesson navigation button found');
    buttons[0].el.click();
  }, rtl);

async function captureLanguage(browser, base, lang, scenes) {
  const dir = path.join(OUT, PLAY_LANGUAGE[lang]);
  fs.mkdirSync(dir, { recursive: true });
  const rtl = isRtl(lang);

  for (const [i, scene] of SCENES.entries()) {
    if (!scenes.includes(scene.name)) continue;
    // A fresh context per screen: clean storage, a fresh seed, and a session
    // or lesson that starts from its first frame every time.
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: SCALE,
      timezoneId: 'UTC',
      locale: lang,
      colorScheme: 'dark',
    });
    await context.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, (route) => route.abort());
    // mulberry32: small, and the same sequence in every language.
    /* eslint-disable no-bitwise */
    await context.addInitScript((seed) => {
      let s = seed;
      Math.random = () => {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }, RANDOM_SEED);
    /* eslint-enable no-bitwise */
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto(
      `${base}/?lang=${encodeURIComponent(lang)}&insetTop=${INSETS.top}&insetBottom=${INSETS.bottom}`,
    );
    await page.waitForFunction(() => window.__navReady || window.__seedError, null, { timeout: 30000 });
    const seedError = await page.evaluate(() => window.__seedError || null);
    if (seedError) throw new Error(`${lang}: seeding failed\n${seedError}`);
    await page.evaluate(() => document.fonts.ready);

    await page.evaluate((routes) => {
      window.__nav.resetRoot({ index: routes.length - 1, routes });
    }, scene.routes);
    for (let n = 0; n < (scene.next || 0); n++) {
      await page.waitForTimeout(700);
      await pressNext(page, rtl);
    }
    if (scene.beat) {
      await waitForBeat(page, scene.beat.count, translate(lang, scene.beat.labelKey));
    }
    await page.waitForTimeout(scene.settle);
    await fitText(page);

    const file = path.join(dir, `${String(i + 1).padStart(2, '0')}-${scene.name}.png`);
    await page.screenshot({ path: file });
    if (errors.length) console.warn(`  ${lang}/${scene.name}: page errors:\n    ${errors.join('\n    ')}`);
    await context.close();
  }
  console.log(`${lang.padEnd(8)} -> ${path.relative(APP, dir)}`);
}

(async () => {
  if (!fs.existsSync(path.join(DIST, 'app.js'))) throw new Error('dist/ is missing - run `node build.js` first');
  const langs = languagesFromArgs();
  const scenes = arg('scenes') ? arg('scenes').split(',') : SCENES.map((s) => s.name);

  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    for (const lang of langs) await captureLanguage(browser, base, lang, scenes);
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
