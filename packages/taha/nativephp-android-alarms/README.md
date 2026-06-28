# taha/nativephp-android-alarms

A NativePHP Mobile **v3** plugin that creates **real alarms in the device's
system Clock app** using Android's `AlarmClock.ACTION_SET_ALARM` intent API.

The OS Clock app owns and fires the alarms. This plugin deliberately runs **no
alarm engine of its own** — no `AlarmManager`, no `BroadcastReceiver`, no boot
re-arming, no in-app notifications, no `AlarmFired` callback. It simply hands
each alarm to the Clock app, which is responsible for ringing it.

## Why this is simpler than an in-app `AlarmManager`

Because the Clock app owns the alarms:

- **No exact-alarm permission dance.** No `SCHEDULE_EXACT_ALARM` /
  `USE_EXACT_ALARM` — the Clock app handles exactness.
- **No boot receiver / re-arming.** Alarms survive reboot natively in the Clock
  app.
- **No notification channel or in-app firing.** Your app isn't involved when
  alarms go off.

The only permission is `com.android.alarm.permission.SET_ALARM` — a **normal,
install-time** permission. There is no runtime system dialog for it, so "ask the
user for permission" means: **show your own one-time in-app consent screen**
explaining that the app will add alarms to the user's Clock app, and only fire
the intents after they accept. Persist that consent so you don't re-ask.

## Install (local path package)

```jsonc
// app composer.json
"repositories": [{ "type": "path", "url": "packages/taha/nativephp-android-alarms" }],
"require": { "taha/nativephp-android-alarms": "^1.0" }
```

```bash
composer require taha/nativephp-android-alarms
```

NativePHP discovers the plugin via its `nativephp.json` and auto-generates the
Kotlin bridge registration at build time. **Do not** hand-write a
`BridgeRegistration.kt` / `PluginBridgeFunctionRegistration.kt` — the build tool
scans `resources/android/*.kt` and generates it; a manual one causes
duplicate-registration compile failures.

## API (PHP facade)

```php
use Taha\AndroidAlarms\Facades\Alarm;

// One-time consent handled in your own UI before this point.

if (! Alarm::isClockAppAvailable()) {
    // show "no compatible Clock app" message
    return;
}

Alarm::setWeeklySchedule($scheduleRows->map(fn ($r) => [
    'id'          => $r->uuid,
    'dayOfWeek'   => $r->day_of_week,   // 0..6 (0=Mon) or MON..SUN
    'hour'        => $r->hour,
    'minute'      => $r->minute,
    'label'       => $r->label,
    'sessionUuid' => $r->session_uuid,
])->all(), appName: 'Kegel');
```

| Method | Bridge fn | What it does |
|---|---|---|
| `isClockAppAvailable()` | `Alarm.IsClockAppAvailable` | `resolveActivity` against `ACTION_SET_ALARM` |
| `setWeeklySchedule($slots, $appName, $vibrate)` | `Alarm.SetWeeklySchedule` | the primary call (see grouping) |
| `setSingleAlarm($hour, $minute, $days, $label, $vibrate)` | `Alarm.SetSingleAlarm` | one alarm |
| `openAlarmsList()` | `Alarm.OpenAlarmsList` | opens the Clock app's alarms list (`ACTION_SHOW_ALARMS`) |

Off-device every method returns `null` (or `false` for `isClockAppAvailable`),
so guard your UX accordingly.

## Scheduling logic — fewest intents

One `ACTION_SET_ALARM` intent creates one alarm, but a single alarm can recur on
multiple weekdays via `EXTRA_DAYS`. So the bridge **groups slots by identical
`hour:minute`** and fires one intent per distinct time, with `EXTRA_DAYS` listing
every weekday that shares that time:

> 7:00 on Mon/Wed/Fri + 21:00 daily = **2 intents**, not 8.

Distinct times on the same day each produce their own alarm. Each intent sets
`EXTRA_HOUR`, `EXTRA_MINUTES`, `EXTRA_DAYS`, `EXTRA_MESSAGE`
(`"<App> · <label> [slot:<HHmm>]"` so the user can recognise and find them),
`EXTRA_SKIP_UI = true` (create silently) and `EXTRA_VIBRATE`. Every send is
fired with `FLAG_ACTIVITY_NEW_TASK` and wrapped in `try/catch`.

> **Android 11+ package visibility:** `resolveActivity()` is filtered by package
> visibility (it returns `null` for the Clock app unless you ship a `<queries>`
> element), which makes a naive availability check false-negative as "no Clock
> app". `startActivity()` is **not** visibility-filtered, so the plugin assumes
> the system Clock handler is present on API 30+ and detects a genuine absence via
> `ActivityNotFoundException` when firing — alarms work without a `<queries>`
> declaration.

## The one real limitation — deletion

The `AlarmClock` API can **create** alarms but **cannot programmatically delete
or cancel** a previously-created alarm (`ACTION_DISMISS_ALARM` only dismisses an
alarm that is *currently ringing*). So when the user edits their weekly schedule,
this plugin **cannot silently remove the old alarms**.

Handle it honestly — don't pretend to "replace". On reschedule:

1. create the new alarms, then
2. call `Alarm::openAlarmsList()` and prompt the user to delete the previous
   ones (findable by the app-name / `[slot:…]` prefix in the label).

This is the deliberate trade for not running an in-app alarm engine.

## `// DECISION` notes

- **`EXTRA_SKIP_UI` is a request, not a guarantee.** Some OEM Clock apps still
  flash a toast/UI or ignore it. The bridge never depends on silent creation.
- **Identical alarms may be re-used by the Clock app** rather than duplicated —
  which is fine and avoids clutter on re-schedule of an unchanged time.
- **Weekday encoding.** Slots accept `0..6` where **0 = Monday** (matching the
  app's reminder model) or `MON..SUN`; both map to `Calendar.MONDAY…SUNDAY`.
- **Merged-time label.** When several slots share a time they become one alarm;
  the first slot's `label` is used and the slot tag is the time (`HHmm`).
- **Activity context.** Functions take a `FragmentActivity`, but every intent
  also sets `FLAG_ACTIVITY_NEW_TASK` so a non-Activity caller would still work.

## Play Store policy notes

- `SET_ALARM` is a **normal** permission. It is **not** in the
  `SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM` sensitive-permission family, so it
  needs no Play Console declaration form and no exact-alarm justification.
- Because alarms are created in the user's own Clock app (handing off via a
  documented public intent), there is no foreground-service or
  full-screen-intent review surface to clear.
- Always gate creation behind the in-app consent screen so the behaviour is not
  surprising — the user is explicitly told the app adds alarms to their Clock app.

## Bridge contract (verified against the installed NativePHP Mobile v3.3)

Each Kotlin bridge function is an inner class implementing
`com.nativephp.mobile.bridge.BridgeFunction`
(`execute(parameters: Map<String, Any>): Map<String, Any>`) and returns
`BridgeResponse.success(...)`. Files declare a vendor-namespaced package
(`com.taha.androidalarms`). Array params arrive as `org.json.JSONArray`.
