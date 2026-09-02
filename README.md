# Kegelee

A pelvic-floor (Kegel) training app. Two halves live in this repository:

- **`react-native-app/`** - the product. A React Native app (Android first) that
  runs the training, stores progress locally and syncs it to the backend.
- **the Laravel app at the repository root** - the backend it talks to: a JSON
  API, an admin panel, the public marketing homepage and the legal pages the
  Google Play listing links to.

There is no longer a web version of the training app. The Livewire screens that
used to mirror it (and the NativePHP packaging that shipped them as an APK) are
gone; anything the app needs, it asks the API for.

## Stack

- **Laravel 13** (PHP 8.3+)
- **Livewire 4** for the admin panel and the legal pages
- **Tailwind CSS v4**, built with Vite
- **SQLite** by default (set `DB_CONNECTION` for MySQL/Postgres in production)
- **Socialite** for Google sign-in
- **RevenueCat** (with a Google Play fallback) for subscriptions

## Quick start

```bash
composer install
npm install
cp .env.example .env
php artisan key:generate
php artisan migrate --seed        # development data, see "Seeding" below
php artisan storage:link
npm run build                     # or: npm run dev
php artisan serve
```

The mobile app lives in `react-native-app/` and has its own README and
`package.json`.

## What the web serves

| Route | What it is |
|-------|------------|
| `/` | Marketing homepage. Content is editable in the admin panel; switch it off there and visitors land on `/legal`. |
| `/legal`, `/p/{slug}` | Legal and policy pages. Public, translated, and the URLs the Play listing points at - so they stay reachable no matter what else is disabled. |
| `/mystic/*` | The admin panel (see below). |
| `/api/v1/*` | The app's API (`routes/api.php`). |
| `/auth/google/*` | Google sign-in for the app: the app opens these in the system browser, and the callback hands a one-time token back over a deeplink. |
| `/.well-known/assetlinks.json` | Android App Links verification, built from `ANDROID_APP_LINK_SHA256`. |
| `/webhooks/revenuecat`, `/webhooks/google-play` | Store events. |
| `/deploy` | Migrations + cache warm for hosts with no shell. `POST` with `Authorization: Bearer $DEPLOY_KEY`. |

## Admin panel (`/mystic`)

Custom Livewire, no Filament. Sign in at `/mystic/login`; password recovery is
at `/mystic/forgot-password` and only ever emails an admin account.

- **Dashboard** - users, sessions, active subscriptions, a 14-day chart and the
  signup-to-subscribed funnel.
- **Reports** (`/mystic/reports`) - overview, funnel, retention, training,
  money and engagement, each with its own window and a spreadsheet export.
- **Users** - search, inspect a member's progress, grant admin.
- **Subscriptions** - who is subscribed, through which store, and grants.
- **Pages** - the legal pages, with one tab per language and a
  reviewed/draft/missing state per translation.
- **Settings** - branding, SMTP (with a test send), Google sign-in, RevenueCat,
  the homepage copy, SEO and code injection.

Two things about Settings are deliberate. Secrets (SMTP password, Google client
secret, RevenueCat keys) render blank and are only written when something is
typed - they are never sent to the browser. And the injected head/body/CSS
settings are applied to the public pages only, never to the admin panel.

Exercises, levels, onboarding and the basics lessons are **not** editable: they
are hardcoded catalogues in `app/Support` and shipped inside the app.

## The API

`routes/api.php`, all under `/api/v1`. Authentication is a per-user token
(`X-User-Token`) issued at sign-in and resolved by `ResolveApiUser` - there is
no shared API key to leak, and the old `ResolveAppUser` device auto-login is
gone.

- `POST /auth/login|register|verify|resend|reset-code|reset` - account flows.
- `POST /auth/google/token` - fully native Google sign-in (ID token).
- `POST /auth/google/redeem` - redeems the one-time token from the browser flow.
- `GET /content`, `GET /pages/{slug}` - legal pages.
- `POST /user/push`, `GET /user/pull` - progress sync. Every pushed session and
  measurement carries a `client_id` the device stamps when it writes the row;
  the server de-duplicates on it, so a retried push cannot double-count. Rows
  without one are dropped, and arrays are capped at 500 per request.
- `POST /auth/change-password` - authenticated (`X-User-Token`), returns a fresh
  `api_token` because changing the password revokes the old one.
- `POST /user/reset`, `POST /user/delete-code`, `POST /user/delete`.

## Google sign-in

The app opens `/auth/google/native?state=<nonce>` in the system browser (Google
blocks OAuth in embedded WebViews). We keep that nonce against our own OAuth
`state` for five minutes, and the callback echoes it back with a one-time token
on the way to `/auth/google/finish`. The app refuses a redirect that does not
carry its own nonce, which is what stops any web page from handing it a session.

`/auth/google/finish` is an https App Link: Android opens it in the app once
`/.well-known/assetlinks.json` verifies, and the page itself is the fallback
that bounces to `kegelee://` when it has not.

Reaching an existing account by email additionally requires Google to report the
address as verified.

## Seeding

- `DatabaseSeeder` - local development only. It mints accounts with known
  passwords and overwrites content, so it refuses to run in production.
- `ProductionSeeder` - content plus a single admin account, from `ADMIN_EMAIL` /
  `ADMIN_PASSWORD` (a strong password is generated and printed once if that is
  blank).

```bash
php artisan db:seed --class=ProductionSeeder --force
```

## Scheduled work

`routes/console.php`, so the host needs `schedule:run` every minute:

- `subscriptions:reconcile` daily at 04:00 - re-checks subscriptions against the
  store, because a cancellation whose webhook never arrived otherwise keeps
  granting access.
- `queue:prune-failed` daily, and spent email codes pruned hourly.

## Environment

Beyond the usual Laravel keys (`.env.example` has the full set):

| Key | What it does |
|-----|--------------|
| `DEPLOY_KEY` | Bearer secret for `POST /deploy`. Server-only. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Initial admin for `ProductionSeeder`. |
| `APP_DEEPLINK_SCHEME` | The app's custom scheme (`kegelee`), used as the sign-in fallback. |
| `ANDROID_APP_LINK_SHA256` | Signing certificate fingerprint(s) published in `assetlinks.json`. Usually two: the upload key and the key Play re-signs with. |
| `GOOGLE_PLAY_PACKAGE_NAME`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Play Developer API access, used to verify purchases. |
| `GOOGLE_PLAY_RTDN_AUDIENCE`, `GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT` | Pub/Sub push authentication for Real-Time Developer Notifications. Unset, the RTDN endpoint refuses everything rather than acting on an unauthenticated body. |
| `REVENUECAT_API_KEY`, `REVENUECAT_WEBHOOK_SECRET` | Fallbacks for the values the admin panel stores. |

## Deploying

With shell access:

```bash
cd ~/kegelee && git pull && bash scripts/deploy-web.sh --seed
```

Without it, upload the files and hit the deploy endpoint once:

```bash
curl -X POST -H "Authorization: Bearer $DEPLOY_KEY" https://kegelee.com/deploy
```

Point the domain at `public/`. The public disk writes into `public/storage`, so
no symlink is needed.

## Tests

```bash
php artisan test
```

## Conventions

- Hyphens throughout copy and slugs, no em dashes.
- Comments say why, not what.
