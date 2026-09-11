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

## iOS subscriptions

RevenueCat uses the existing Kegelee project (`3fbbaac1`), the App Store app
[`app37762d6351`](https://app.revenuecat.com/projects/3fbbaac1/apps/app37762d6351),
and bundle ID `com.kegelee.app`. The iOS public SDK key ships in `billing.ts`;
the synced `revenuecat_ios_public_sdk_key` setting can override it.

The current `base_plans` offering grants the `premium` entitlement on both
stores. Apple products map to the same backend plans as Google Play:

| Plan | App Store product | RevenueCat package |
| --- | --- | --- |
| 1 Month | `com.kegelee.premium.monthly` | `$rc_monthly` |
| 3 Months | `com.kegelee.premium.quarterly` | `$rc_three_month` |
| 1 Year | `com.kegelee.premium.yearly` | `$rc_annual` |

The existing `Kegelee Backend` webhook sends all apps and all events, in both
Sandbox and Production, to `https://kegelee.com/webhooks/revenuecat`.

As of 2026-09-09, the App Store Connect app is `6809782947` (SKU `kegelee-ios`).
The three subscriptions exist in the `Kegelee Premium` group (`22368658`),
with USD prices of $5.99/month, $15.99/3 months and $59.99/year, Apple-equalized
prices in 175 territories, and three-day introductory trials. All durations
provide the same access at subscription group level 1. The uploaded App Store
Connect API key shows **Valid credentials** in RevenueCat.

The app is configured as free to download. English store metadata is saved in
[store/ios/en-US.json](store/ios/en-US.json) and uploaded to App Store Connect.
Ten browser captures of the shared app screens are uploaded for iPhone and
iPad, and all three subscriptions have review screenshots and are
`READY_TO_SUBMIT`. Server Notifications V2 are verified for production and
sandbox. See [store/ios/README.md](store/ios/README.md) for capture provenance,
reviewer account setup and the remaining submission requirements.

Before iOS billing can be tested:

1. Configure the separate In-App Purchase key in the RevenueCat App Store
   app. This is a `SubscriptionKey_*.p8`
   key; see [RevenueCat's key configuration guide](https://www.revenuecat.com/docs/service-credentials/itunesconnect-app-specific-shared-secret/in-app-purchase-key-configuration).
   Keep private keys outside the repository.
2. Deploy the backend product mappings and build the updated iOS client on
   macOS. Verify sandbox purchases, restores, plan changes and webhook sync.

Apple determines subscription changes through the subscription group. iOS
does not send Google Play replacement modes or show Play-specific charge
timing. When Apple defers a change, the app retains the current entitlement
until RevenueCat reports the new product.

## Splash & icon

- Launcher icon: adaptive KE mark (`res/mipmap-*`), identical to the NativePHP build.
- Splash: native `SplashTheme` shows the KE logo on `#060810` from cold start;
  `MainActivity` swaps to `AppTheme` on launch and `App.tsx` keeps an identical
  dark loading screen until the session is restored - no white flash.
