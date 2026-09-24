# App Store Connect privacy answers

Verified against the iOS app source, server sync payloads, and the privacy
manifests embedded in the uploaded binary. These answers apply to App Store
Connect app `6809782947`.

## Medical-device declaration

In **App Information → App Store Regulations & Permits → Regulated Medical
Device**, select **No**. Kegelee provides guided fitness exercises and progress
tracking. It does not diagnose, prevent, monitor, or treat disease and is not
registered, cleared, approved, CE-marked, UKCA-marked, or self-certified as a
medical device.

## App Privacy

Select **Yes, we collect data from this app**. Add the data types below. For
every listed type, answer **No** to “Is this data used for tracking?”

| Category | Data type | Purposes | Linked to the user |
| --- | --- | --- | --- |
| Contact Info | Name | App Functionality | Yes |
| Contact Info | Email Address | App Functionality | Yes |
| Contact Info | Phone Number | App Functionality | Yes |
| Health & Fitness | Health | App Functionality; Product Personalization; Analytics | Yes |
| Health & Fitness | Fitness | App Functionality; Product Personalization; Analytics | Yes |
| Location | Coarse Location | App Functionality | Yes |
| Identifiers | User ID | App Functionality; Analytics | Yes |
| Identifiers | Device ID | App Functionality; Analytics | Yes |
| Purchases | Purchase History | App Functionality; Analytics | Yes |
| Usage Data | Product Interaction | Analytics | Yes |
| Usage Data | Other Usage Data | Analytics | Yes |
| Diagnostics | Crash Data | App Functionality; Analytics | Yes |
| Diagnostics | Other Diagnostic Data | App Functionality; Analytics | Yes |
| Other Data | Other Data Types | App Functionality; Analytics | Yes |

Publish the answers after all data types are complete.

### Evidence behind the answers

- Accounts store a name, email address, account/provider IDs, and authentication
  credentials. Sign in with Apple and Google provide identity data.
- Workout sessions, completed training days, pelvic-floor endurance
  measurements, onboarding baseline/experience, difficulty, and reminders sync
  to the account. They enable progress, personalized training, and aggregate
  product reporting.
- RevenueCat receives the account ID and purchase history to validate receipts,
  unlock Premium, and provide purchase analytics. Because the app uses its own
  account ID with RevenueCat, purchase history is linked to the user.
- The app records account-linked product interaction events such as app opens,
  quiz and lesson progress, workouts, paywall actions, purchases, restores,
  reminder actions, and settings changes for analytics.
- Each install sends a random install ID, platform, OS version, app version,
  locale, and last-seen time for support, operation, and analytics. The ID is
  random and is not an advertising identifier.
- Error-boundary events include the current screen and a truncated error
  message. No third-party crash reporter is installed.
- The uploaded binary's Google Sign-In privacy manifest additionally declares
  phone number, coarse location, device ID, other usage data, and other data
  types. They are included above so the App Store answers cover the embedded
  third-party SDK.
- RevenueCat's manifest declares purchase history. RevenueCat's own App Privacy
  guidance says Purchase History must include App Functionality and Analytics;
  it is linked here because Kegelee supplies its account ID.

### Data types not selected

Do not select Payment Info: Apple processes the payment and Kegelee never
receives card or bank details. The app does not collect precise location,
contacts/address books, photos, audio, browsing history, search history,
advertising data, or advertising identifiers. It contains no ads and does not
track people across other companies' apps or websites.

## Final submission sequence

1. Save the **No** regulated-medical-device declaration.
2. Publish every App Privacy answer above.
3. Add iOS version `1.0` to the existing review submission.
4. Confirm the draft contains version 1.0, subscription group `22368658`, and
   all three subscriptions.
5. Submit for review with release set to **After Approval**.
