<?php

namespace App\Support;

/**
 * Progression rules, shared by the API and the mobile app.
 *
 * These used to be editable from the backend, but the workout circle,
 * exercises and progression are all built into the app - there is no reason to
 * fetch them over the wire. Per-level overrides on the `levels` table still win
 * where they are set; these are the fallbacks.
 */
final class AppConfig
{
    /** Sessions that must be finished for a training day to count as complete. */
    public const SESSIONS_PER_DAY = 2;

    /** Length of a plan / month, in days. */
    public const PLAN_LENGTH_DAYS = 30;
}
