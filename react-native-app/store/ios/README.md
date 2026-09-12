# Kegelee App Store listing

## Status verified on 2026-09-12

The iOS changes are integrated with upstream `main` through `1ff1c89`
(nine commits pulled, including the latest trial pricing fixes). The paywall
keeps both the new locale-aware pricing and the Apple-specific billing flow.

Apple's API still reports version `1.0` as `PREPARE_FOR_SUBMISSION`, with no
selected build, no uploaded builds, no App Review details and no review
submissions. All three subscriptions remain `READY_TO_SUBMIT`. RevenueCat
confirms the App Store Connect API key is configured; the separate In-App
Purchase subscription key is still missing.

Expo project `@thetahayasin/kegelee` is authenticated and local App Store
signing credentials have been prepared outside source control. The native
project now integrates Expo modules, includes the 1024 px RGB app icon and
branded launch screen, and targets iOS 16.4 on the EAS `sdk-57` build image.
Sign in with Apple is enabled for `com.kegelee.app`; the refreshed provisioning
profile includes its entitlement. The first EAS build (`c45763ec-2737-481d-bc75-64ebfce1498b`) failed while
importing the distribution certificate. The same key/certificate has been
repacked with macOS-compatible PKCS12 encryption and its verified Apple WWDR G3
chain. EAS also identified a Hermes regression in React Native 0.86.0; runtime
and matching tooling are updated to 0.86.3, with Expo 57.0.22. All 416 mobile
tests still pass. Native build/upload status will be updated after the retry.

## Listing

The English listing in `en-US.json` is saved to App Store Connect app
`6809782947`, version `1.0`. Its version localization ID is
`08a6eb47-490d-47cf-99be-d83155615201`. Description, subtitle, keywords,
promotional text, URLs, copyright and Health & Fitness category were verified
against the saved API values. The app is free to download and configured for
175 territories. The age-rating questionnaire identifies health/wellness
content and currently returns 4+.

| Subscription | Apple ID | USD price | Period |
| --- | --- | --- | --- |
| `com.kegelee.premium.monthly` | `6809784459` | $5.99 | 1 month |
| `com.kegelee.premium.quarterly` | `6809784379` | $15.99 | 3 months |
| `com.kegelee.premium.yearly` | `6809784328` | $59.99 | 1 year |

Each subscription has a three-day free trial, English name/description, and
Apple-equalized prices in 175 territories. They share group `22368658` at
level 1 and map to RevenueCat's existing `premium` entitlement.

## Screenshots

Ten screenshots were captured from the actual shared React Native screens in
Chromium, using React Native Web and an isolated local Laravel demo account,
as requested. All ten were uploaded to the English version listing and Apple
returned `COMPLETE`. See `screenshots/uploaded.json` for asset IDs and checksums.
The sets contain:

1. Training home with the next workout.
2. An active workout showing the guided circle.
3. Progress and training history, using a dedicated demo account.
4. Reminder schedule.
5. An interactive basics lesson.

The iPhone images are 1320 × 2868 and the iPad images are 2064 × 2752, all RGB
PNG without transparency. See [Apple's screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/).

These are browser captures with the app's iOS presentation selected, not
captures from a native iOS binary. Native storage was adapted to browser
storage; notifications and billing were unavailable in the browser. No
purchase success or loaded store prices were simulated. Compare the images
with the first native build before submission, particularly safe areas and
native controls. There is still no uploaded iOS build.

All three subscriptions are `READY_TO_SUBMIT`. The Premium training screenshot
is also attached to each subscription to show the service being offered.
The associated notes explain Premium access and
how to reach Profile → Subscription. This follows Apple's [review screenshot
description](https://developer.apple.com/help/app-store-connect/reference/in-app-purchases-and-subscriptions/in-app-purchase-information).
See `screenshots/subscription-review-uploaded.json` for the separate review
asset IDs and subscription states.

## Reviewer account

A dedicated local `appreview@kegelee.com` account was seeded and successfully
signed in through the actual app. Its screenshot data is a local demonstration.
Production admin/server credentials were not found in the available histories,
so this account has **not** been created or verified on `kegelee.com`, and its
credentials have **not** been submitted to Apple.

`php artisan app:seed-reviewer --credentials-file=/private/path/reviewer.json`
is ready for the production server once access is available. The private JSON
contains `name`, `email`, and `password`; it must stay outside source control.
The command creates a verified non-admin account, marks the basics complete,
and grants one year of non-renewing manual access. It never changes an existing
account, prints a password, sends mail, or reseeds production content. The
command and successful API login are covered by `SeedAppReviewerTest`.

Supply the working production credentials and actual contact name/phone to App
Review only after the production login has passed. No random phone was saved.

## Remaining submission fields

- Reviewer contact name, international phone number and working app test
  credentials. Apple rejects saving App Review details without contact fields.
- App privacy disclosures in the App Store Connect website, based on account,
  training and subscription data actually collected by the app and its SDKs.
- iOS build, app icon from that build, and device verification of the uploaded
  browser screenshots. Sandbox purchase/restore testing remains pending.
- Deploy the backend App Store product mappings and Apple sign-in migration.
  Configure the dedicated Sign in with Apple developer key using the variables
  in `.env.example`; this differs from the App Store Connect and In-App Purchase
  keys. Production deployment and live Apple authorization are not yet verified.
- Separate In-App Purchase key in RevenueCat; the App Store Connect API key
  is already configured and validated.
- The live privacy/refund/terms pages currently describe Google Play billing;
  their billing sections need to cover Apple before iOS submission. The saved
  Support URL currently leads to the existing purchase-help page with the
  `support@kegelee.com` contact address.

The app and subscriptions have not been submitted for review or released.

App Store Server Notifications V2 are configured and verified for both
production and sandbox using the RevenueCat endpoint approved by the owner.

The iOS source changes include App Store product mapping, SDK configuration,
store-aware subscription management and English Apple billing messages. New
Apple-specific messages fall back to English in other locales until translated.
The browser capture also identified and fixed truncated iPad tab labels.

Validation on 2026-09-12: all 416 mobile tests and 489 backend tests
(4,177 assertions) passed. This includes signed Apple token verification,
nonce/state replay protection, verified account linking, encrypted token
storage and authenticated deletion with Apple revocation. TypeScript passed;
full lint has zero errors and 25 existing warnings. The iOS JavaScript/Hermes
export passed. Native iOS compilation and StoreKit purchase/restore verification
remain separate release checks.
