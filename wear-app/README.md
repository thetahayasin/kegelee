# Kegelee for Wear OS

A standalone Wear OS app: it signs in on its own, syncs with the same API the
phone uses, and runs a full guided session on the wrist. A paired handset is not
required and is never asked for.

Deliberately a **separate Gradle build** from `../react-native-app`. The two
share a package name and a signing key and nothing else, so neither toolchain
can break the other and the React Native build never has to know this exists.

## Why native Kotlin

React Native has no Wear OS renderer. A watch needs rotary input, round-screen
layout, ambient behaviour and a tiny memory budget, all of which Compose for
Wear OS provides and none of which RN does. This is the only viable route, not a
preference.

## How it works

| | |
|---|---|
| **Sign in** | Google Sign-In (one tap, the watch's own account) via `/auth/google/token`, falling back to email + password via `/auth/login`. Both return the same payload, so nothing downstream cares which was used. |
| **Sync** | `/user/pull` on every app open: level, plan position, today's counts, entitlement. `/user/push` for finished sessions. **No backend change was needed** - these are the endpoints the phone already calls. |
| **Offline** | Sessions are written to an outbox before any attempt to send, keyed by `client_id` so a retry can never record the same workout twice. The cached profile means the app opens on real figures with no signal. |
| **Reminders** | Not set here. They belong to the phone, and Android mirrors its notifications to a paired watch already. |

## The training circle

`TrainingCircle.kt` is the piece that matters. The catalogue gives every segment
a `from` and a `to` (0..1), and the ring travels between them across the step -
so it **swells as the pelvic floor should tighten** and settles as it releases,
lit by a halo that brightens with it. That shape is the instruction; people
follow it rather than reading the word. A plain countdown would have been a
different exercise wearing the same name.

Haptics carry the same information for anyone not looking: a firm double pulse
to squeeze, one soft pulse to release.

## The catalogue is generated, not written

`app/src/main/assets/catalogue.json` is produced from the phone app's own
`src/constants/catalogues.ts` - 17 exercises, 5 levels, every pattern segment,
plus the English `catalogue.*` strings merged in as `LABELS`.

Transcribing that by hand would be a hundred lines of numbers that silently stop
matching the phone the first time anybody tunes a hold, and "the watch counts
differently from the app" is a bug nobody would think to look for here.

To regenerate after changing the phone's catalogue, from `react-native-app/`,
dump `EXERCISES` / `LEVELS` / `FREE_EXERCISE_SLUGS` through the existing jest
toolchain and merge the English catalogue strings in as `LABELS`.

`SessionBuilder.kt` is a line-for-line port of `services/sessionBuilder.ts`,
down to the rounding and the two while-loops that keep a set inside its
catalogue bounds. The phone remains the place to **change** any of it; this is a
mirror.

## Building

```bash
./gradlew assembleDebug
```

`local.properties` needs `sdk.dir`. A release build additionally needs
`keystore.properties` at the project root pointing at the phone app's release
keystore - **the same key**, because Play will not deliver two differently
signed artifacts from one listing.

## Testing without an account

The session player sits behind a login, which makes it unreachable on an
emulator with no Google account. Debug builds accept a stand-in:

```bash
adb shell am start -n com.kegelee.app/.wear.MainActivity --ez demo true
```

Gated on `BuildConfig.DEBUG`, so it cannot ship. It is a stand-in for a signed-in
account, never a fallback - nothing reaches for it when a real sync merely
failed.

Verified on a Wear OS 7 (API 37) x86_64 emulator, small round.

## Publishing

Same `applicationId` as the phone app, `uses-feature android.hardware.type.watch
required="true"`, and `com.google.android.wearable.standalone = true`. Play takes
it as the Wear OS form factor of the existing listing; upload it to that form
factor in the same release rather than as a separate app.
