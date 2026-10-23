/**
 * Shared by capture.js and frames.js: the language map, the static server for
 * dist/ and Playwright's Chromium.
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { execSync } = require('child_process');

const HERE = __dirname;
const APP = path.resolve(HERE, '../../..');
const DIST = path.join(HERE, 'dist');

const { chromium } = require(require.resolve('playwright', {
  paths: [HERE, execSync('npm root -g').toString().trim()],
}));

/**
 * App language -> Google Play listing language.
 *
 * Play names a few of these differently from the app: Hebrew is still the old
 * `iw-IL`, Simplified Chinese is `zh-CN`, and most European languages carry a
 * region. Keys are the app's own tags (src/i18n), in its list order.
 */
const PLAY_LANGUAGE = {
  en: 'en-US',
  ar: 'ar',
  cs: 'cs-CZ',
  da: 'da-DK',
  de: 'de-DE',
  es: 'es-ES',
  'es-419': 'es-419',
  fi: 'fi-FI',
  fr: 'fr-FR',
  he: 'iw-IL',
  hi: 'hi-IN',
  hu: 'hu-HU',
  id: 'id',
  it: 'it-IT',
  ja: 'ja-JP',
  ko: 'ko-KR',
  nl: 'nl-NL',
  no: 'no-NO',
  pl: 'pl-PL',
  'pt-BR': 'pt-BR',
  ro: 'ro',
  ru: 'ru-RU',
  sk: 'sk',
  sv: 'sv-SE',
  th: 'th',
  tr: 'tr-TR',
  uk: 'uk',
  vi: 'vi',
  'zh-Hans': 'zh-CN',
};

const isRtl = (lang) => ['ar', 'he'].includes(lang.split('-')[0]);

/** `--name value` from the command line, or null. */
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : null;
};

/** The app languages named by --lang (comma separated), or all of them. */
const languagesFromArgs = () => {
  const all = Object.keys(PLAY_LANGUAGE);
  const langs = arg('lang') ? arg('lang').split(',') : all;
  const unknown = langs.filter((l) => !all.includes(l));
  if (unknown.length) throw new Error(`unknown app language(s): ${unknown.join(', ')}`);
  return langs;
};

/** Serve a directory (dist/ by default) on a free local port. */
const serve = (root = DIST) =>
  new Promise((resolve) => {
    const types = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.wasm': 'application/wasm',
      '.ttf': 'font/ttf',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
    };
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(new URL(req.url, 'http://local').pathname);
      const file = path.join(root, rel === '/' ? 'index.html' : rel);
      if (!file.startsWith(root)) {
        res.writeHead(403);
        return res.end();
      }
      fs.readFile(file, (err, data) => {
        if (err) {
          res.writeHead(404);
          return res.end();
        }
        res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });

module.exports = { HERE, APP, DIST, chromium, PLAY_LANGUAGE, isRtl, arg, languagesFromArgs, serve };
