<?php

namespace App\Support;

/**
 * App-behaviour constants baked into the build. These used to be editable from
 * the backend, but the workout circle, exercises, onboarding and progression
 * are all built into the app - there is no reason to fetch them over the wire.
 *
 *   - Progression rules (how many sessions count as a completed day, and how
 *     long a plan runs) are fixed. Per-level overrides on the `levels` table
 *     still win where set; these are the fallbacks.
 *   - Offline sync is always on. The endpoint comes from the build-time .env
 *     (CONTENT_SYNC_URL); auth is the per-user token issued at sign-in; the
 *     interval is fixed here.
 */
final class AppConfig
{
    /** Sessions that must be finished for a training day to count as complete. */
    public const SESSIONS_PER_DAY = 2;

    /** Length of a plan / month, in days. */
    public const PLAN_LENGTH_DAYS = 30;

    /** Offline sync is always enabled in the shipped app. */
    public const SYNC_ENABLED = true;

    /** How often the app re-syncs while it stays open (minutes). It also syncs
     *  on open and on reconnect regardless of this interval. */
    public const SYNC_INTERVAL_MINUTES = 15;
}
