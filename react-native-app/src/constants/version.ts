/**
 * The version string this build reports about itself.
 *
 * Kept in step with `versionName` in android/app/build.gradle by hand, and
 * mirrored here because there is no way to read the manifest from JS without
 * adding a native module for it. app.json carries no `version` key - the
 * Android build file is the single source, so that is what this copies.
 *
 * versionName only. `versionCode` is owned by EAS remote versioning
 * (eas.json sets appVersionSource: "remote" and the production profile
 * autoIncrements), so the number in build.gradle is not the number that ships
 * and mirroring it here would publish a figure that is wrong on every store
 * build.
 *
 * Sent once per sync in the push envelope's device block, which is what lets
 * "share of installs on the newest version" be answered - and, when a crash
 * report or a support message arrives, what version it came from.
 */
export const APP_VERSION = '1.0.109';
