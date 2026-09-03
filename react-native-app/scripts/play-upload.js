/**
 * Upload a locally built .aab to Google Play and roll it out on a track.
 *
 * The counterpart to play-version-check.js, and it exists for the same reason:
 * versionCode is bumped by hand in android/app/build.gradle and the bundle is
 * assembled by local Gradle, so EAS - which keeps its own remote counter and
 * only knows about builds it made - is not in this loop at all. `eas submit`
 * would either refuse the artifact or submit a version code that has drifted
 * from the one in the bundle.
 *
 * Two details the Publisher API is unforgiving about:
 *
 *   1. A bundle goes up through the RESUMABLE upload endpoint. The simple
 *      `uploadType=media` path silently truncates large bodies, and an .aab is
 *      tens of megabytes.
 *   2. `changesNotSentForReview` must be sent on commit. Without it an app
 *      that is already published comes back with "Changes cannot be sent for
 *      review automatically", the edit is rejected, and the upload is wasted.
 *
 * The release notes are read from the track's existing listing when none are
 * given, so a release never silently drops the notes the last one carried.
 *
 * Usage:
 *   node scripts/play-upload.js [--track production] [--aab path] [--notes "..."]
 *                               [--status completed|draft|inProgress]
 *                               [--fraction 0.1] [--dry-run]
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
const TRACK = arg('track', 'production');
const AAB = arg('aab', path.join(ROOT, 'android', 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab'));
const STATUS = arg('status', 'completed');
const FRACTION = arg('fraction', null);
const NOTES = arg('notes', null);
const DRY_RUN = flag('dry-run');

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

/** Fetch that turns a non-2xx into an error carrying the body Google sent. */
async function call(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${options?.method || 'GET'} ${url} -> ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

/** The versionCode Gradle stamped into the bundle we are about to send. */
function versionCodeFromGradle() {
  const gradle = fs.readFileSync(path.join(ROOT, 'android', 'app', 'build.gradle'), 'utf8');
  const match = gradle.match(/versionCode\s+(\d+)/);
  return match ? Number(match[1]) : null;
}

(async () => {
  if (!fs.existsSync(AAB)) throw new Error(`no bundle at ${AAB} - build it first`);
  const bundle = fs.readFileSync(AAB);
  const expected = versionCodeFromGradle();

  console.log(`bundle:  ${AAB} (${(bundle.length / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`package: ${PACKAGE}`);
  console.log(`track:   ${TRACK} (${STATUS}${FRACTION ? `, ${FRACTION}` : ''})`);
  if (expected) console.log(`version: ${expected} per build.gradle`);

  const key = JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));
  const token = await accessToken(key);
  const headers = { Authorization: `Bearer ${token}` };
  const jsonHeaders = { ...headers, 'Content-Type': 'application/json' };
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}`;

  const edit = await call(`${base}/edits`, { method: 'POST', headers: jsonHeaders });
  console.log(`edit:    ${edit.id}`);

  let committed = false;
  try {
    // Refuse a version code Play already holds BEFORE spending the upload: the
    // API's own error for this arrives after the whole bundle has gone up.
    const existing = await call(`${base}/edits/${edit.id}/bundles`, { headers });
    const used = (existing.bundles || []).map((b) => b.versionCode);
    if (expected && used.includes(expected)) {
      throw new Error(
        `versionCode ${expected} is already on Play (has: ${used.sort((a, b) => a - b).join(', ')})`,
      );
    }

    // Release notes: whatever was passed, else whatever this track already
    // says, so a release never silently loses the notes the last one carried.
    let releaseNotes = NOTES ? [{ language: 'en-US', text: NOTES }] : null;
    if (!releaseNotes) {
      const current = await call(`${base}/edits/${edit.id}/tracks/${TRACK}`, { headers }).catch(() => null);
      releaseNotes = current?.releases?.[0]?.releaseNotes || null;
      if (releaseNotes) console.log('notes:   carried over from the current release');
    }

    if (DRY_RUN) {
      console.log('\ndry run: nothing uploaded, edit discarded');
      return;
    }

    // 1. Open a resumable session. The simple media path truncates a body this
    //    size without saying so.
    const startRes = await fetch(
      `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PACKAGE}/edits/${edit.id}/bundles?uploadType=resumable`,
      {
        method: 'POST',
        headers: {
          ...headers,
          'X-Upload-Content-Type': 'application/octet-stream',
          'X-Upload-Content-Length': String(bundle.length),
          'Content-Length': '0',
        },
      },
    );
    if (!startRes.ok) {
      throw new Error(`could not start the upload: ${startRes.status} ${await startRes.text()}`);
    }
    const session = startRes.headers.get('location');
    if (!session) throw new Error('the upload session came back with no location header');

    // 2. Send the bundle.
    console.log('uploading...');
    const uploaded = await call(session, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(bundle.length) },
      body: bundle,
    });
    console.log(`uploaded: versionCode ${uploaded.versionCode}, sha1 ${uploaded.sha1}`);
    if (expected && uploaded.versionCode !== expected) {
      throw new Error(
        `the bundle reports versionCode ${uploaded.versionCode} but build.gradle says ${expected} - the artifact is stale`,
      );
    }

    // 3. Point the track at it.
    const release = {
      versionCodes: [String(uploaded.versionCode)],
      status: STATUS,
      ...(releaseNotes ? { releaseNotes } : {}),
      ...(FRACTION ? { userFraction: Number(FRACTION) } : {}),
    };
    await call(`${base}/edits/${edit.id}/tracks/${TRACK}`, {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ track: TRACK, releases: [release] }),
    });

    // 4. Commit. `changesNotSentForReview` is not optional for an app that is
    //    already published: without it Play rejects the whole edit.
    const result = await call(
      `${base}/edits/${edit.id}:commit?changesNotSentForReview=true`,
      { method: 'POST', headers: jsonHeaders },
    );
    committed = true;
    console.log(`committed: edit ${result.id} -> ${TRACK}`);
  } finally {
    if (!committed) {
      await fetch(`${base}/edits/${edit.id}`, { method: 'DELETE', headers }).catch(() => {});
      console.log('edit discarded');
    }
  }
})().catch((err) => {
  console.error(`\nFAILED: ${err.message}`);
  process.exit(1);
});
