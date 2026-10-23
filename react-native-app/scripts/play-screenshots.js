/**
 * Read or replace the phone screenshots and feature graphic on the Google
 * Play listing.
 *
 * The counterpart to store/android/capture: that produces one folder of
 * 1080 x 1920 PNGs per Play language under store/android/screenshots, and one
 * 1024 x 500 PNG per language under store/android/feature-graphic, and this
 * puts them on the listing. Only `phoneScreenshots` and `featureGraphic` are
 * touched - the icon, the tablet and Wear images and every word of the
 * listing text are left exactly as they are.
 *
 * Usage:
 *   node scripts/play-screenshots.js --list [--download dir]
 *       What every listing language currently shows. Read-only; the edit is
 *       discarded. --download saves the images so they can be looked at.
 *
 *   node scripts/play-screenshots.js --upload [--languages de-DE,fr-FR]
 *                                    [--only screenshots|feature] [--dry-run]
 *       Replace each listing's images with the matching ones on disk. An
 *       image set that is already byte-for-byte the new one is skipped, so
 *       re-running after a partial failure only redoes the rest.
 *
 * Languages are Play's own codes (iw-IL, zh-CN, no-NO...). A listing with no
 * images of its own takes the closest language's, the way the app picks a language:
 * en-GB uses en-US, any Latin American Spanish uses es-419, pt-PT uses pt-BR,
 * zh-TW uses zh-CN. Images for a language with no listing are reported and
 * left alone: creating a listing needs a title and descriptions, which are not
 * this script's to invent.
 *
 * Credentials: the same service account as play-upload.js
 * (play-service-account.json, or --key path). Where no key file exists, the
 * GOOGLE_PLAY_SERVICE_ACCOUNT_JSON environment variable - the backend's name
 * for the same account - is read instead, as the JSON itself or a path to it.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

const KEY_PATH = arg('key', path.join(ROOT, 'play-service-account.json'));
const PACKAGE = arg('package', 'com.kegelee.app');
const SHOTS = arg('dir', path.join(ROOT, 'store', 'android', 'screenshots'));
const FEATURES = arg('feature-dir', path.join(ROOT, 'store', 'android', 'feature-graphic'));
const ONLY = arg('languages', null);
const ONLY_KIND = arg('only', null);
const DOWNLOAD = arg('download', null);
const LIST = flag('list');
const UPLOAD = flag('upload');
const DRY_RUN = flag('dry-run');


const b64url = (input) =>
  Buffer.from(typeof input === 'string' ? input : JSON.stringify(input))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

/** Same service-account exchange as play-upload.js. */
async function accessToken(key) {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })}`;

  const signature = crypto
    .createSign('RSA-SHA256')
    .update(unsigned)
    .sign(key.private_key)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
  });

  const json = await res.json();
  if (!json.access_token) throw new Error(`auth failed: ${JSON.stringify(json)}`);
  return json.access_token;
}

/** Fetch that turns a non-2xx into an error carrying the body Google sent. */
async function call(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${options?.method || 'GET'} ${url} -> ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

const IMAGE = /\.(png|jpe?g)$/i;

/** The screenshot folders on disk, by Play language, each in file-name order. */
function screenshotSets() {
  if (!fs.existsSync(SHOTS)) return {};
  const sets = {};
  for (const lang of fs.readdirSync(SHOTS).sort()) {
    const dir = path.join(SHOTS, lang);
    if (!fs.statSync(dir).isDirectory()) continue;
    const files = fs.readdirSync(dir).filter((f) => IMAGE.test(f)).sort();
    if (files.length) sets[lang] = files.map((f) => path.join(dir, f));
  }
  return sets;
}

/** The feature graphics on disk, one <Play language>.png each. */
function featureSets() {
  if (!fs.existsSync(FEATURES)) return {};
  const sets = {};
  for (const file of fs.readdirSync(FEATURES).filter((f) => IMAGE.test(f)).sort()) {
    sets[file.replace(IMAGE, '')] = [path.join(FEATURES, file)];
  }
  return sets;
}

/**
 * What this script manages on a listing, and how much of each Play takes:
 * up to eight phone screenshots, exactly one feature graphic.
 */
const KINDS = [
  { key: 'screenshots', type: 'phoneScreenshots', label: 'screenshots', max: 8, sets: screenshotSets },
  { key: 'feature', type: 'featureGraphic', label: 'feature graphic', max: 1, sets: featureSets },
];

/** The images a Play listing language should take: its own, else the closest language's. */
function folderFor(language, sets) {
  if (sets[language]) return language;
  const [base, region] = language.split('-');
  if (base === 'es' && region !== 'ES' && sets['es-419']) return 'es-419';
  if (base === 'pt' && sets['pt-BR']) return 'pt-BR';
  if ((base === 'nb' || base === 'nn') && sets['no-NO']) return 'no-NO';
  if (base === 'zh' && sets['zh-CN']) return 'zh-CN';
  if (base === 'en' && sets['en-US']) return 'en-US';
  return Object.keys(sets).find((l) => l.split('-')[0] === base) || null;
}

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function serviceAccount() {
  if (fs.existsSync(KEY_PATH)) return JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));
  const env = (process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || '').trim();
  if (env.startsWith('{')) return JSON.parse(env);
  if (env && fs.existsSync(env)) return JSON.parse(fs.readFileSync(env, 'utf8'));
  throw new Error(`no service account key: ${KEY_PATH} is missing and GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not set`);
}

(async () => {
  if (LIST === UPLOAD) throw new Error('pass exactly one of --list or --upload');

  const token = await accessToken(serviceAccount());
  const headers = { Authorization: `Bearer ${token}` };
  const jsonHeaders = { ...headers, 'Content-Type': 'application/json' };
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}`;
  const uploadBase = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PACKAGE}`;

  const edit = await call(`${base}/edits`, { method: 'POST', headers: jsonHeaders });
  console.log(`package: ${PACKAGE}`);
  console.log(`edit:    ${edit.id}`);

  /** Same commit as play-upload.js: Play decides per app whether review is implied. */
  const commitEdit = async () => {
    const commit = (notSentForReview) =>
      call(
        `${base}/edits/${edit.id}:commit${notSentForReview ? '?changesNotSentForReview=true' : ''}`,
        { method: 'POST', headers: jsonHeaders },
      );
    try {
      return await commit(false);
    } catch (err) {
      if (!/cannot be sent for review|changesNotSentForReview must be set/i.test(err.message)) {
        throw err;
      }
      console.log('commit: this app will not auto-submit for review, retrying');
      return commit(true);
    }
  };

  const images = (language, type) =>
    call(`${base}/edits/${edit.id}/listings/${language}/${type}`, { headers })
      .then((r) => r.images || []);
  const kinds = KINDS.filter((k) => !ONLY_KIND || k.key === ONLY_KIND);
  if (!kinds.length) throw new Error(`--only takes ${KINDS.map((k) => k.key).join(' or ')}`);

  let committed = false;
  try {
    const listings = (await call(`${base}/edits/${edit.id}/listings`, { headers })).listings || [];
    const languages = listings.map((l) => l.language).sort();
    const wanted = ONLY ? ONLY.split(',') : languages;
    const missing = wanted.filter((l) => !languages.includes(l));
    if (missing.length) throw new Error(`no Play listing for: ${missing.join(', ')} (has: ${languages.join(', ')})`);

    if (LIST) {
      for (const language of wanted) {
        for (const kind of kinds) {
          const current = await images(language, kind.type);
          console.log(`\n${language}: ${current.length} ${kind.label}`);
          for (const [i, img] of current.entries()) {
            console.log(`  ${i + 1}. ${img.url}`);
            if (DOWNLOAD) {
              const dir = path.join(DOWNLOAD, language);
              fs.mkdirSync(dir, { recursive: true });
              const res = await fetch(`${img.url}=s0`);
              if (!res.ok) throw new Error(`download ${img.url} -> ${res.status}`);
              const ext = (res.headers.get('content-type') || 'image/png').split('/')[1].split(';')[0];
              const name = `${kind.key}-${String(i + 1).padStart(2, '0')}.${ext}`;
              fs.writeFileSync(path.join(dir, name), Buffer.from(await res.arrayBuffer()));
            }
          }
        }
      }
      if (DOWNLOAD) console.log(`\nsaved to ${DOWNLOAD}`);
      return;
    }

    let changed = 0;
    for (const kind of kinds) {
      const sets = kind.sets();
      const used = new Set();
      console.log(`\n${kind.label}:`);
      for (const language of wanted) {
        const from = folderFor(language, sets);
        if (!from) {
          console.log(`  ${language.padEnd(7)} skip: none for this language`);
          continue;
        }
        used.add(from);
        const files = sets[from];
        if (files.length > kind.max) throw new Error(`${from} has ${files.length} ${kind.label}; Play allows ${kind.max}`);

        const current = await images(language, kind.type);
        const same =
          current.length === files.length && current.every((img, i) => img.sha256 === sha256(files[i]));
        const via = from === language ? '' : ` (from ${from})`;
        if (same) {
          console.log(`  ${language.padEnd(7)} unchanged${via}`);
          continue;
        }
        console.log(`  ${language.padEnd(7)} ${current.length} -> ${files.length}${via}`);
        if (DRY_RUN) continue;

        await call(`${base}/edits/${edit.id}/listings/${language}/${kind.type}`, { method: 'DELETE', headers });
        // One at a time: Play shows them in upload order.
        for (const file of files) {
          await call(`${uploadBase}/edits/${edit.id}/listings/${language}/${kind.type}?uploadType=media`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': /\.png$/i.test(file) ? 'image/png' : 'image/jpeg' },
            body: fs.readFileSync(file),
          });
        }
        changed += 1;
      }
      const unused = Object.keys(sets).filter((l) => !used.has(l));
      if (unused.length && !ONLY) console.log(`  no Play listing (left alone): ${unused.join(', ')}`);
    }

    if (DRY_RUN || changed === 0) {
      console.log(DRY_RUN ? '\ndry run: nothing uploaded, edit discarded' : '\nnothing to change');
      return;
    }
    const result = await commitEdit();
    committed = true;
    console.log(`\ncommitted: edit ${result.id}, ${changed} image set(s) updated`);
  } finally {
    if (!committed) {
      await fetch(`${base}/edits/${edit.id}`, { method: 'DELETE', headers }).catch(() => {});
    }
  }
})().catch((err) => {
  console.error(`\nFAILED: ${err.message}`);
  process.exit(1);
});
