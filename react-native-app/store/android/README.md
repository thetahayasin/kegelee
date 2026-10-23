# Kegelee Google Play listing

## Phone screenshots

`screenshots/<Play language>/` holds five phone screenshots for each of the
29 languages the app ships, in the black-and-white theme with Archivo type:

1. Training home: Month 1 · Day 24, a 23-day streak and the next unlock.
2. A guided session on the "Contract & hold" beat of Holding.
3. Progress, with the longest-hold chart.
4. The reminder schedule and month calendar.
5. The basics lesson's guided circle.

Every image is a 1080 × 1920 RGB PNG (9:16 portrait), the size Play
asks for when screenshots are to be eligible for promotion. Folders use Play's
language codes (`iw-IL` for Hebrew, `zh-CN` for Simplified Chinese, `no-NO`,
regional codes for most European languages), so each one maps to a listing
directly.

### How they are made

`capture/` renders the app's real `App.tsx`, navigator and screens in
Chromium through React Native Web. The app's own code is told it is on
Android, so it takes its Android paths, including Archivo. Only the native
modules underneath are replaced: SQLite runs on sql.js, while notifications,
billing and sign-in are inert stand-ins. The data is a local demo account
seeded into the app's own tables and storage keys. Requests to kegelee.com are
blocked, and the account is premium so no padlocks or offers cover the screens.

Typography follows Android: Archivo comes from `android/.../res/font`.
Arabic, Hebrew, Devanagari, Thai and CJK fall back to Noto, and Cyrillic to
Roboto, as they do on a phone. Arabic and Hebrew are laid out right to left.

Two browser layout differences are corrected to match Android. `Text` keeps
Yoga's `flexShrink: 0`, so tab labels are not clipped. `adjustsFontSizeToFit`
shrinks long labels such as "Entrenamiento" to fit, using Android's 4dp
floor, instead of ellipsizing them. The old iOS browser captures had both
problems.
The daily session is shuffled, so `Math.random` is seeded to give every
language the same session. The two animated screens are captured when the
circle shows a given count and phase label.

These are browser renderings rather than device captures. There is no system
status bar, and native-only effects such as elevation shadows are absent.

### Regenerating

Needs Node 22, Playwright's Chromium, and fonts-noto-core, fonts-noto-cjk and
fonts-roboto (Ubuntu package names) for the fallback scripts.

```sh
cd store/android/capture
npm install
node build.js                 # bundle the app into dist/
node capture.js               # all 29 languages, ~10 minutes
node capture.js --lang de,ar  # or just some
```

## Uploading

`scripts/play-screenshots.js` replaces only the phone screenshots on each
listing language. It does not change the icon, feature graphic, tablet/Wear
images or listing text. It uses the same service account as
`scripts/play-upload.js`:

```sh
node scripts/play-screenshots.js --list --download play-current   # what Play shows now
node scripts/play-screenshots.js --upload --dry-run               # what would change
node scripts/play-screenshots.js --upload                         # replace and commit
```

A listing language without a folder of its own takes the closest one
(en-GB → en-US, other Latin American Spanish → es-419, pt-PT → pt-BR,
zh-TW → zh-CN). A folder whose language has no Play listing is reported and
skipped, because creating a listing needs its title and descriptions.
