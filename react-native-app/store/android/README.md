# Kegelee Google Play listing

## Phone screenshots

`screenshots/<Play language>/` holds the five store screenshots for each of
the 29 languages the app ships. Each one has a centred punch line, with a
short supporting line, above the real app screen in an upright Android phone.
They use the app's black-and-white theme and Archivo type:

| # | Screen | English punch line |
| --- | --- | --- |
| 1 | Training home | **Stronger** in minutes a day |
| 2 | Guided session | Just **follow** the circle |
| 3 | Progress | **See** your strength grow |
| 4 | Reminder schedule | **Never** miss a day |
| 5 | Basics lesson | New to Kegels? **Start here.** |

Each image is a 1080 × 1920 RGB PNG (9:16 portrait), the size Play asks for
when screenshots are to be eligible for promotion. Folders use Play's language
codes (`iw-IL` for Hebrew, `zh-CN` for Simplified Chinese, `no-NO`, regional
codes for most European languages), so each one maps to a listing directly.

## Feature graphic

`feature-graphic/<Play language>.png` is the 1024 × 500 cover for each
language. It shows the app's icon and name over the first screenshot's punch
line and supporting line, beside the guided circle in the same upright phone.
For Arabic and Hebrew the two halves swap sides. Before this, Play had a
feature graphic for en-US only, which every other language showed.

### The words

`headlines.json` holds every headline and supporting line (the feature graphic
reuses `training`), keyed by the app's
language tags. `*Stars*` mark the phrase drawn as a white block; it is the
headline's emphasis, kept to one line. `\n` forces a line break where a
language needs one, such as Thai words that automatic breaking would split.
The copy uses each locale's own terminology from `src/i18n/locales`. For
example, Swedish, Danish and Norwegian say knip/knibe/knipe rather than
Kegel. It also keeps each locale's form of address (du, vous, вы).

Headlines are sized to the largest that fits on two lines, or on three when
two cannot fit. Naskh and Thai start larger because they draw small. The
phone shrinks slightly under a tall headline rather than overlapping it.
Arabic and Hebrew are laid out right to left.

### How they are made

1. `capture/capture.js` renders the app's real `App.tsx`, navigator and
   screens in Chromium through React Native Web. It uses a Pixel-sized
   window (412 × 915 dp at 2×) with the status-bar and gesture-bar insets a
   phone reports. Output goes to `capture/raw/` (not committed).
2. `capture/frames.js` places each screen in `web/frame.html` with its
   headline. It draws the phone, its status bar and its camera, and captures
   the result at 1080 × 1920 into `screenshots/`. It also renders
   `web/feature.html` at 1024 × 500 into `feature-graphic/`. Both pages share
   the headline and phone from `web/shared.css` and `web/shared.js`.

The app's own code is told it is on Android, so it takes its Android paths,
including Archivo. Only the native modules underneath are replaced: SQLite
runs on sql.js, while notifications, billing and sign-in are inert
stand-ins. The data is a local demo account seeded into the app's own tables
and storage keys. Requests to kegelee.com are blocked, and the account is
premium so no padlocks or offers cover the screens.

Typography follows Android: Archivo comes from `android/.../res/font`.
Arabic, Hebrew, Devanagari, Thai and CJK fall back to Noto, and Cyrillic to
Roboto, as they do on a phone. The daily session is shuffled, so
`Math.random` is seeded to give every language the same session. The two
animated screens are captured when the circle shows a given count and phase
label.

Two browser layout differences are corrected to match Android. `Text` keeps
Yoga's `flexShrink: 0`, so tab labels are not clipped. `adjustsFontSizeToFit`
shrinks long labels such as "Entrenamiento" to fit, using Android's 4dp
floor, instead of ellipsizing them.

These are browser renderings of the app rather than device captures.
Native-only effects such as elevation shadows are absent.

### Regenerating

Needs Node 22, Playwright's Chromium, and fonts-noto-core, fonts-noto-cjk and
fonts-roboto (Ubuntu package names) for the fallback scripts.

```sh
cd store/android/capture
npm install
node build.js                 # bundle the app and the frame page into dist/
node capture.js               # every language's screens into raw/, ~10 minutes
node frames.js                # frames and feature graphics, ~1 minute
node capture.js --lang de,ar  # or just some languages (frames.js takes --lang too)
```

After changing only `headlines.json` or the pages in `web/`, `node build.js &&
node frames.js` is enough.

## Uploading

`scripts/play-screenshots.js` replaces only the phone screenshots and the
feature graphic on each listing language (`--only screenshots` or
`--only feature` for one of them). It does not change the icon, tablet/Wear
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
