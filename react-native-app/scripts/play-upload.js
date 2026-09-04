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
 *   2. `changesNotSentForReview` is required on commit for some apps and
 *      rejected outright for others, Play will not say which in advance, and
 *      it has flipped for this app between releases. Either mistake fails the
 *      commit and wastes the upload that came before it, so the commit here
 *      tries one and reads the other out of the rejection rather than
 *      guessing.
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
/**
 * Promote a build that is already on Play to another track, without uploading.
 *
 * A promotion is the same artifact moving from one track to another, and Play
 * will not accept a version code twice - so re-running the upload path to
 * promote fails with "already on Play" and would need a pointless rebuild at a
 * new code just to ship bytes it already has.
 */
const PROMOTE = arg('promote', null);
/**
 * Remove draft releases a track is holding, leaving the live one alone.
 *
 * A track can hold a draft ALONGSIDE the release that is actually rolled out.
 * The Console shows the draft, so a track that is serving a build perfectly
 * well reads as a broken release that "does not add or remove any app bundles"
 * and that no existing user can upgrade to - both of which are true of a draft
 * duplicating what is already live, and neither of which can be fixed from the
 * release page the errors appear on.
 */
const DROP_DRAFTS = flag('drop-drafts');

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

/**
 * The versionCode we expect the bundle to carry.
 *
 * `--expect` exists because this script is no longer only for the phone: the
 * Wear app is a separate Gradle project, so reading THIS project's build.gradle
 * while uploading that project's bundle reported the phone's number and refused
 * the upload as a duplicate. Given explicitly, it stays a real check.
 */
function versionCodeFromGradle() {
  const explicit = arg('expect', null);
  if (explicit) return Number(explicit);
  const gradle = fs.readFileSync(path.join(ROOT, 'android', 'app', 'build.gradle'), 'utf8');
  const match = gradle.match(/versionCode\s+(\d+)/);
  return match ? Number(match[1]) : null;
}

(async () => {
  const promoting = PROMOTE !== null;
  const uploads = !promoting && !DROP_DRAFTS;
  if (uploads && !fs.existsSync(AAB)) throw new Error(`no bundle at ${AAB} - build it first`);
  const bundle = uploads ? fs.readFileSync(AAB) : null;
  const expected = promoting ? Number(PROMOTE) : uploads ? versionCodeFromGradle() : null;

  if (DROP_DRAFTS) console.log('mode:    drop-drafts (no upload)');
  else if (promoting) console.log(`promote: versionCode ${expected} (no upload)`);
  else console.log(`bundle:  ${AAB} (${(bundle.length / 1024 / 1024).toFixed(1)} MB)`);
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

  /**
   * Commit, either way round.
   *
   * Play insists on `changesNotSentForReview` for some apps and forbids it for
   * others, will not say which beforehand, and has changed its mind about this
   * one between releases. It names the answer in the rejection both times, so
   * try the plain commit and take the other route when the error asks for it.
   * Anything else is a real failure and is re-thrown.
   */
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

  let committed = false;
  try {
    if (DROP_DRAFTS) {
      const track = await call(`${base}/edits/${edit.id}/tracks/${TRACK}`, { headers });
      const all = track.releases || [];
      const drafts = all.filter((r) => r.status === 'draft');
      const keep = all.filter((r) => r.status !== 'draft');
      for (const r of all) {
        console.log(`${r.status === 'draft' ? 'drop:   ' : 'keep:   '} ${r.status} ${(r.versionCodes || []).join(', ')}`);
      }
      if (drafts.length === 0) {
        console.log(`track:   ${TRACK} holds no drafts, nothing to do`);
        return;
      }
      // Refuse to empty a track: a draft-only track is a release that was never
      // rolled out, and silently deleting it loses work rather than unblocking it.
      if (keep.length === 0) {
        throw new Error(`every release on ${TRACK} is a draft - dropping them would empty the track`);
      }
      if (DRY_RUN) {
        console.log('dry run: nothing changed, edit discarded');
        return;
      }
      await call(`${base}/edits/${edit.id}/tracks/${TRACK}`, {
        method: 'PUT',
        headers: jsonHeaders,
        body: JSON.stringify({ track: TRACK, releases: keep }),
      });
      await commitEdit();
      committed = true;
      console.log(`committed: ${TRACK} now holds only its live release`);
      return;
    }

    // Refuse a version code Play already holds BEFORE spending the upload: the
    // API's own error for this arrives after the whole bundle has gone up.
    const existing = await call(`${base}/edits/${edit.id}/bundles`, { headers });
    const used = (existing.bundles || []).map((b) => b.versionCode);
    if (promoting && !used.includes(expected)) {
      throw new Error(
        `versionCode ${expected} is not on Play, so there is nothing to promote ` +
        `(has: ${used.sort((a, b) => a - b).join(', ')})`,
      );
    }
    if (!promoting && expected && used.includes(expected)) {
      throw new Error(
        `versionCode ${expected} is already on Play (has: ${used.sort((a, b) => a - b).join(', ')})`,
      );
    }
    if (expected) {
      // Same rule as the band split below, stated where it is easiest to act on.
      const band = expected >= 1000 ? 'wear' : 'phone';
      console.log(`band:    ${band} (codes ${band === 'wear' ? '>=1000' : '<1000'})`);
    }

    // Release notes: whatever was passed, else whatever this track already
    // says, so a release never silently loses the notes the last one carried.
    const currentTrack = await call(`${base}/edits/${edit.id}/tracks/${TRACK}`, { headers })
      .catch(() => null);
    /**
     * The release that is actually being served, which is NOT necessarily the
     * first one: a track can hold a draft alongside it, and a draft carries no
     * notes and no meaning for what is live. Reading index 0 blindly would
     * carry the DRAFT's version codes into the assignment below and drop the
     * live release - the same "replaces what was there" trap as the band split.
     */
    const liveRelease = (currentTrack?.releases || []).find((r) => r.status !== 'draft')
      || currentTrack?.releases?.[0]
      || null;
    if ((currentTrack?.releases || []).length > 1) {
      console.log(`track:   ${currentTrack.releases.length} releases present, using the ${liveRelease?.status} one`);
    }
    let releaseNotes = NOTES ? [{ language: 'en-US', text: NOTES }] : null;
    if (!releaseNotes) {
      releaseNotes = liveRelease?.releaseNotes || null;
      if (releaseNotes) console.log('notes:   carried over from the current release');
    }

    if (DRY_RUN) {
      console.log('\ndry run: nothing uploaded, edit discarded');
      return;
    }

    // Promotion skips straight to the track assignment: the artifact is
    // already there, only which track serves it changes.
    const uploaded = promoting ? { versionCode: expected } : await (async () => {
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
    const sent = await call(session, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(bundle.length) },
      body: bundle,
    });
      console.log(`uploaded: versionCode ${sent.versionCode}, sha1 ${sent.sha1}`);
      if (expected && sent.versionCode !== expected) {
        throw new Error(
          `the bundle reports versionCode ${sent.versionCode} but ${expected} was expected - the artifact is stale`,
        );
      }
      return sent;
    })();

    /**
     * 3. Point the track at it, WITHOUT dropping the other form factor.
     *
     * Assigning a track's releases replaces what was there. The listing serves
     * a phone build and a Wear build from the same track, so writing only the
     * code just uploaded would have stopped serving the other one - publishing
     * a watch update by removing the phone app.
     *
     * Version codes are banded to make this decidable: under 1000 is the phone,
     * 1000 and up is the watch. The upload replaces the code in ITS OWN band
     * and carries every other band through untouched, so each form factor
     * advances on its own without either being able to delete the other.
     */
    const BAND = (code) => (Number(code) >= 1000 ? 'wear' : 'phone');
    const liveCodes = (liveRelease?.versionCodes || []).map(String);
    const kept = liveCodes.filter((c) => BAND(c) !== BAND(uploaded.versionCode));
    const versionCodes = [...kept, String(uploaded.versionCode)]
      .sort((a, b) => Number(a) - Number(b));
    if (kept.length > 0) {
      console.log(`track:   keeping ${kept.join(', ')} alongside ${uploaded.versionCode}`);
    }

    const release = {
      versionCodes,
      status: STATUS,
      ...(releaseNotes ? { releaseNotes } : {}),
      ...(FRACTION ? { userFraction: Number(FRACTION) } : {}),
    };
    await call(`${base}/edits/${edit.id}/tracks/${TRACK}`, {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ track: TRACK, releases: [release] }),
    });

    // 4. Commit.
    const result = await commitEdit();
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
