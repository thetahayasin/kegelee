# Kegelee App Store listing

## Status verified on 2026-09-12

The signed iOS release archive **1.0 (5)** built successfully on EAS from
commit `8caab8d` and was uploaded to App Store Connect on 2026-09-12.

- [Successful EAS build](https://expo.dev/accounts/thetahayasin/projects/kegelee/builds/6a30637c-8df7-4a90-b5e5-02b36b504a3e)
- [Successful upload](https://expo.dev/accounts/thetahayasin/projects/kegelee/submissions/e141cded-9d7b-47a6-9f96-87a086a443c3)
- [App Store Connect / TestFlight](https://appstoreconnect.apple.com/apps/6809782947/testflight/ios)

The downloaded 22.5 MB IPA was inspected: bundle ID `com.kegelee.app`, version
`1.0`, build `5`, iOS 16.4 minimum, iPhone and iPad support, embedded Hermes
bundle and privacy manifest. Both the provisioning profile and the signed
Mach-O executable contain `com.apple.developer.applesignin = [Default]`.
The Apple authentication module is included in the executable.

Apple processing completed with `VALID`; build `0af564f2-18a8-4d4e-afe2-5f1926d76470`
is selected for version `1.0`. The version remains `PREPARE_FOR_SUBMISSION`;
no App Review details or review submission exist.
The three subscriptions remain `READY_TO_SUBMIT`. RevenueCat's App Store
Connect API key is configured, but its separate In-App Purchase subscription
key remains missing. Live Apple sign-in also needs the dedicated developer key
and backend deployment; the production challenge endpoint currently returns
404. Native Apple sign-in and StoreKit transactions have not been exercised
on a device.

Expo project `@thetahayasin/kegelee` uses the EAS `sdk-57` image, React Native
0.86.3 (including the Hermes regression fix), and Expo 57.0.22. The native
project integrates Expo modules, the Apple entitlement, a 1024 px RGB app icon
and branded launch screen. Local signing files and upload keys remain outside
source control and are excluded from the EAS source archive.

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
native controls using the uploaded TestFlight build.

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
- Device verification of the uploaded browser screenshots against build 5.
  Sandbox Apple sign-in, purchase/restore, plan changes and account deletion
  testing remain pending after the server credentials are configured.
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

The binary is uploaded; the app and subscriptions have not been submitted for
review or released.

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
export and the exact Xcode bundling script passed locally. EAS native archive,
IPA entitlement inspection and App Store Connect upload all passed. Device
Apple authorization and StoreKit purchase/restore verification remain pending.
