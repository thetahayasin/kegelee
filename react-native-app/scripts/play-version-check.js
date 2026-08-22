/**
 * Ask Google Play which versionCodes it already has.
 *
 * Exists because of a real failure: EAS keeps its own remote versionCode
 * counter (appVersionSource: remote), and it only knows about builds EAS made.
 * A versionCode uploaded to Play by a LOCAL Gradle build is invisible to it, so
 * the counters drift and eas submit dies with "Version code N has already been
 * used" - after the 30-minute build has already run.
 *
 * Prints JSON so the release script can compare against `eas build:version:get`
 * before spending that half hour.
 *
 * Usage: node scripts/play-version-check.js [serviceAccount.json] [package]
 * Output: {"highest":69,"nextFree":70,"used":[...]}   (or {"error":"..."} )
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const keyPath = process.argv[2] || path.join(__dirname, '..', 'play-service-account.json');
const pkg = process.argv[3] || 'com.kegelee.app';

const b64url = (input) =>
  Buffer.from(typeof input === 'string' ? input : JSON.stringify(input))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

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

(async () => {
  const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  const token = await accessToken(key);
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}`;

  const edit = await (await fetch(`${base}/edits`, { method: 'POST', headers })).json();
  if (!edit.id) throw new Error(`could not open a Play edit: ${JSON.stringify(edit)}`);

  const used = [];
  for (const kind of ['bundles', 'apks']) {
    const res = await (await fetch(`${base}/edits/${edit.id}/${kind}`, { headers })).json();
    for (const item of res[kind] || []) used.push(item.versionCode);
  }

  // Read-only: discard the edit rather than leaving it open on the account.
  await fetch(`${base}/edits/${edit.id}`, { method: 'DELETE', headers }).catch(() => {});

  const highest = used.length ? Math.max(...used) : 0;
  console.log(JSON.stringify({ highest, nextFree: highest + 1, used: used.sort((a, b) => a - b) }));
})().catch((err) => {
  console.log(JSON.stringify({ error: err.message }));
  process.exit(1);
});
