# Kegel Trainer

A pelvic-floor (Kegel) training app in the style of Dr. Kegel, built on **Laravel 13 + Livewire 4 + NativePHP Mobile v3**, with a fully backend-driven configuration: levels, exercise timings, unlocks, subscriptions, branding, the workout-circle UI, SEO and code injection are all editable from a custom admin panel - no code changes needed.

## Stack

- **Laravel 13** (PHP 8.5)
- **Livewire 4** for the entire UI (mobile screens + admin), no JS framework build step beyond Vite
- **Tailwind CSS v4** with runtime CSS variables so the whole theme re-skins from admin settings
- **NativePHP Mobile v3** for packaging to iOS / Android
- **SQLite** by default (swap `DB_CONNECTION` for MySQL/Postgres in production)

## Quick start

```bash
composer install
npm install
php artisan key:generate
php artisan migrate:fresh --seed
php artisan storage:link
npm run build                 # or: npm run dev
php artisan serve
```

Open `http://localhost:8000`.

### Accounts (seeded)

| Role  | Email             | Password   | Notes |
|-------|-------------------|------------|-------|
| User  | demo@kegel.test   | `password` | Pre-loaded with 18 completed training days at Level 5 |
| Admin | admin@kegel.test  | `password` | Admin panel at `/admin` |

The mobile screens run as a single device user (resolved by `ResolveAppUser` middleware, which auto-logs-in the device account) - the way a packaged NativePHP app behaves. Swap that middleware for a real auth flow for a multi-account web build.

## App screens (`/`)

- **Onboarding** - a story explaining the pelvic floor and how Kegels work (`/welcome`, backend-editable slides)
- **Home / Kegel tab** - daily ring, "Month X Day Y", Start session, exercise rail, progress preview
- **Workout player** (`/session`, `/workout/{exercise}`) - the countdown circle with the red "contract & hold" glow, relax phases, breadcrumb of exercises, pause/resume; records the session on finish
- **Day complete** - night-sky celebration, month calendar strip, exercise-unlock progress
- **Exercises** (`/exercises`) - available vs. locked with "complete N training days" progress bars; locked exercises can still be previewed ("Try it now")
- **Levels** (`/levels`) - difficulty picker (Level 1-6)
- **Progress Tracker** (`/progress`) - press-and-hold endurance measurement + days/weeks/months chart
- **Schedule** (`/schedule`) - month calendar of completed days, reminders, difficulty
- **Paywall** (`/upgrade`) - plans, discount codes, subscribe

## Admin panel (`/admin`)

Custom Livewire (no Filament). Everything below is editable here:

- **Dashboard** - users, exercises, active subscriptions, 14-day session chart
- **Exercises** - CRUD, icon + training-video upload, unlock-after-days, premium flag, the exercise's **universal contract / relax seconds** (the rhythm the circle follows), and a **per-level duration table** (how long it runs each appearance at each difficulty) with live reps + fit validation.
- **Levels** - number, name, days-per-plan, sessions-per-day override, and the difficulty knobs: **total session time** (seconds, shown in minutes) + **rest between exercises** (seconds), validated so every exercise's per-level duration fits the session
- **Onboarding** - story slides (title, body, media, order)
- **Plans / Discounts / Subscriptions** - billing catalogue, codes, member management
- **Users** - search, set level, grant admin
- **Settings** - branding (name, logo, favicon), theme colours, **workout-circle UI** (size, track width, glow colour/toggle, haptics, sound), progression rules (**sessions per day that count as a completed day**, plan length, allow extra optional sessions), SEO meta, and **raw code injection** (head / body-start / body-end / custom CSS)

### How the progression engine works

`App\Services\ProgressionService` owns the rules:

- A **completed day** is reached when the day's session count hits *sessions-per-day* (from the level, falling back to the global setting). Extra sessions beyond that are recorded as optional.
- **Exercises unlock** when the user's total completed days reach the exercise's `unlock_after_days`.
- Each **exercise** has a universal contract/relax beat; its **run duration is set per level** (pivot). Each **level** sets the **total session time** and the rest between exercises. `App\Services\TimingValidator` guarantees a cycle fits its per-level duration and every per-level duration fits the session.

`App\Services\SettingsService` is a cached key/value store powering all the admin-tunable values; `App\Services\SessionBuilder` builds each session by **packing the available (unlocked) exercises in a randomised, repeating rotation - each running its per-level duration with rest between - to fill the level's total session time** (so the player timer equals the level's session length). In the player the ring follows each contract/relax beat while the centre shows the current exercise's full duration counting down.

## Building the mobile app (NativePHP)

```bash
# .env already sets NATIVEPHP_APP_ID=com.kegeltrainer.app
php artisan native:install      # one-time; downloads native runtimes
php artisan native:run          # build & boot on a connected device / simulator
```

Requirements: run on native Windows/macOS (not WSL); Android needs USB debugging, iOS needs an Apple developer team in `NATIVEPHP_DEVELOPMENT_TEAM`. See https://nativephp.com/docs/mobile/3.

## Conventions

- Hyphens are used throughout copy and slugs (no em dashes).
- Theme colours are emitted as CSS variables in the layout from settings, so admin colour changes re-skin the app instantly with no rebuild.
