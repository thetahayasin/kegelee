/**
 * How this build makes money.
 *
 * The free-ads branch ships the whole app to everyone and pays for itself
 * with AdMob instead of a subscription. Flipping this is the ONE switch:
 *
 *   - `resolveEntitlement` answers "entitled" for every account, so every
 *     padlock, PremiumNotice, free day cap and level-picker lock in the app
 *     opens through the same `subscribed` flag it always read.
 *   - Settings and the training banner stop offering a plan.
 *   - Ads are shown (see services/ads).
 *
 * The backend has its own matching switch (FREE_APP in .env, read by
 * User::hasPremiumAccess), because the server owns the level and the day cap
 * and would otherwise undo a free account's level change on the next pull.
 * Both must be on together.
 *
 * The billing code is left in place and still configured, so a legacy
 * subscriber's row keeps syncing and Settings can still send them to Google
 * Play to cancel it.
 */
export const FREE_APP = true;
