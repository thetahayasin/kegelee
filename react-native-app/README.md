# Kegelee (React Native)

Native React Native client for Kegelee - a pixel-for-pixel port of the NativePHP
app: same dark lime theme (`#060810` / `#c1ff72`), same KE logo and splash, same
training / progress / schedule / profile flow. Catalogues (exercises, levels,
onboarding) are bundled on-device; auth, progress, knowledge, legal and
subscriptions talk to the Kegelee backend. Local state lives in SQLite.

- **Stack:** React Native 0.86 (New Architecture + Hermes), React Navigation,
  react-native-sqlite-storage, notifee, Google Sign-In.
- **Package / app id:** `com.kegelee.app`  ·  **Version:** 1.0.0 (code 12)
- **Reminders:** native scheduled **notifications** via notifee (not alarms).

## Prerequisites

- Node >= 22.11, JDK 17 (Android Studio's bundled JBR works)
- Android SDK (path in `android/local.properties`)
- `android/keystore.properties` for release signing (see below) - gitignored

```sh
npm install
```

## Run in development

```sh
npm start          # Metro bundler
npm run android    # build + install the debug app on a device/emulator
```

## Building

Windows PowerShell one-command builds (wrap `patch-jcenter`, version bump,
Gradle, signature check). All builds use the shared Gradle home `E:\.gradle_home`.

| Command | Output |
| --- | --- |
| `npm run build:debug` | Unsigned-obfuscation debug APK |
| `npm run build:release` | Signed + R8-obfuscated release **APK** |
| `npm run build:aab` | Release APK **and** Play Store **AAB** |

Or call the scripts directly for more options:

```powershell
# Release APK (signed, minified, obfuscated, resources shrunk)
.\scripts\build-release.ps1

# Release APK + AAB, clean first, then install on the device
.\scripts\build-release.ps1 -Aab -Clean -Install

# Keep the current version (skip the auto bump)
.\scripts\build-release.ps1 -NoBump

# Fast debug build and install
.\scripts\build-debug.ps1 -Install
```

Artifacts:

- APK: `android/app/build/outputs/apk/release/app-release.apk`
- AAB: `android/app/build/outputs/bundle/release/app-release.aab`

## Release signing

Release builds are signed with the **kegelee release key** (the same keystore as
the NativePHP app). Signing is driven by `android/keystore.properties`, which is
gitignored:

```properties
storeFile=kegelee-release.keystore
storePassword=********
keyAlias=kegelee
keyPassword=********
```

`kegelee-release.keystore` lives in `android/app/`. If `keystore.properties` is
missing, release builds fall back to debug signing (not uploadable to Play).

## Obfuscation / minification (R8)

`release` runs R8 in full mode: `minifyEnabled` + `shrinkResources` +
obfuscation, with keep rules in `android/app/proguard-rules.pro`. If a release
build ever crashes on a code path that debug did not, add a targeted `-keep`
rule there rather than disabling R8.

## Splash & icon

- Launcher icon: adaptive KE mark (`res/mipmap-*`), identical to the NativePHP build.
- Splash: native `SplashTheme` shows the KE logo on `#060810` from cold start;
  `MainActivity` swaps to `AppTheme` on launch and `App.tsx` keeps an identical
  dark loading screen until the session is restored - no white flash.
