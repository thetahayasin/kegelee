# Kegelee App Store listing

## Status verified on 2026-09-24

The signed iOS release archive **1.0 (6)** built successfully on EAS from
commit `ebcad02` and was uploaded to App Store Connect on 2026-09-18. The app
source is unchanged from the earlier 1.0 (5) build; the intervening commits
changed documentation and the backend preflight script.

- [Successful EAS build](https://expo.dev/accounts/thetahayasin/projects/kegelee/builds/3996494b-ebb6-462e-990b-2209f60d839f)
- [Successful upload](https://expo.dev/accounts/thetahayasin/projects/kegelee/submissions/8a34e041-37cb-4974-b8bf-42761508a3a4)
- [App Store Connect / TestFlight](https://appstoreconnect.apple.com/apps/6809782947/testflight/ios)

The earlier downloaded 22.5 MB IPA was inspected: bundle ID `com.kegelee.app`, version
`1.0`, build `5`, iOS 16.4 minimum, iPhone and iPad support, embedded Hermes
bundle and privacy manifest. Both the provisioning profile and the signed
Mach-O executable contain `com.apple.developer.applesignin = [Default]`.
The Apple authentication module is included in the executable.

Apple processing completed with `VALID`; build `2b0ce2c5-d0ae-4e5e-abd9-55c9712df292`
is selected for version `1.0`. After the regulated-medical-device and App
Privacy declarations were completed, version 1.0 was attached to review
submission `72fb7094-53e8-4026-a903-43ac033008a0` with the subscription group
and all three subscriptions. Apple accepted the five-item submission at
`2026-09-24T06:43:58.368Z`; both the submission and app version now report
`WAITING_FOR_REVIEW`. App Review details are saved with
Khalid Mehmood, the private demo credentials, accurate review notes and the
owner-requested reserved fictional contact number. The contact number is not
reachable and can cause review delays if Apple calls it.
The three subscriptions were `READY_TO_SUBMIT` on 2026-09-12. RevenueCat's
App Store Connect and In-App Purchase keys are now configured and both show
`Valid credentials` after reloading the dashboard. The missing-key warning has
cleared. All three Apple products map to the current `base_plans` offering and
the `premium` entitlement; the SDK key matches the uploaded app.

The dedicated Sign in with Apple key is configured in the production-ready
origin on this server. Its Apple challenge endpoint returns HTTP 200 through
Nginx and PHP 8.4. This verifies challenge generation and client-secret signing,
not a completed Apple authorization. A fresh production database was migrated
and seeded at the owner's direction; the private reviewer account signs in and
receives an API token. The public domain still points to the previous host and
its challenge endpoint returns 404. The remaining infrastructure step is the
Hostinger DNS cutover and public TLS certificate. See [server deployment](../../../docs/server-deployment.md).
Native Apple sign-in and StoreKit transactions have not been exercised on a
device.

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

A dedicated `appreview@kegelee.com` account is seeded in the new production
database and signs in successfully through the production origin. Its private
credentials are stored outside source control and are saved in the App Review
details. The public domain still reaches the old host, where this account does
not exist.

`php artisan app:seed-reviewer --credentials-file=/private/path/reviewer.json`
is ready for the production server once access is available. The private JSON
contains `name`, `email`, and `password`; it must stay outside source control.
The command creates a verified non-admin account, marks the basics complete,
and grants one year of non-renewing manual access. It never changes an existing
account, prints a password, sends mail, or reseeds production content. The
command and successful API login are covered by `SeedAppReviewerTest`.

## Submitted state and follow-up

- Replace the reserved fictional review contact number with a real reachable
  international number if Apple needs to call during review.
- Device verification of the uploaded browser screenshots against build 6.
  Sandbox Apple sign-in, purchase/restore, plan changes and account deletion
  testing remain pending after the server credentials are configured.

The public-domain cutover is being handled separately at the owner's direction.
The saved Support URL leads to the refund page and `support@kegelee.com` contact
address.

The binary, subscription group and three subscriptions are submitted for
review. They have not been approved or released.

App Store Server Notifications V2 are configured and verified for both
production and sandbox using the RevenueCat endpoint approved by the owner.

The iOS source changes include App Store product mapping, SDK configuration,
store-aware subscription management and English Apple billing messages. New
Apple-specific messages fall back to English in other locales until translated.
The browser capture also identified and fixed truncated iPad tab labels.

Validation: all 416 mobile tests passed. The complete backend suite passed all
490 tests with 4,178 assertions on 2026-09-24. This includes signed Apple token verification,
nonce/state replay protection, verified account linking, encrypted token
storage and authenticated deletion with Apple revocation. TypeScript passed;
full lint has zero errors and 25 existing warnings. The iOS JavaScript/Hermes
export and the exact Xcode bundling script passed locally. EAS native archive,
IPA entitlement inspection and App Store Connect upload all passed. Device
Apple authorization and StoreKit purchase/restore verification remain pending.
