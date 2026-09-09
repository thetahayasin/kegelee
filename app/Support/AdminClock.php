<?php

namespace App\Support;

use App\Models\User;

/**
 * The two clocks an admin screen is read on.
 *
 * Storage is UTC and stays UTC. This is only about which wall clock a stored
 * instant gets printed against, and the admin has always needed two of them at
 * once: the account's, because that is the clock the person was actually
 * living on when they did the thing, and the admin's own, because that is the
 * clock the support conversation is happening on right now.
 *
 * Printing one without saying which it was is how "their last session was
 * Tuesday" and "they say they trained on Wednesday" both turn out to be true.
 */
final class AdminClock
{
    /**
     * The clock this account lives on.
     *
     * The device names its own zone on every sync, so this is the same value
     * the backend already keys the day rollover on - the admin and the app
     * agree about which day a session belongs to because they read the same
     * field, not because they happen to round the same way.
     *
     * Null until a device has ever synced, which is a real state: an account
     * created on the web and never opened in the app has no locality to speak
     * of, and UTC is the honest answer rather than a guess at one.
     */
    public static function zoneFor(User $user): string
    {
        return self::valid($user->timezone) ?? config('app.timezone');
    }

    /**
     * The clock the person reading the screen is on.
     *
     * ADMIN_TIMEZONE first, and it is deliberately the stronger of the two.
     * The console is read from one place, and that is a fact about the desk it
     * is read at rather than about any row in the users table. An admin's own
     * users.timezone is written from whatever device last synced, so letting it
     * win would mean a test handset left on another zone silently moving every
     * timestamp on every admin screen.
     *
     * The admin's own zone is the fallback for a deployment that has not set
     * one, and UTC after that, which is at least never wrong about itself.
     */
    public static function adminZone(?User $admin = null): string
    {
        $admin ??= auth()->user();

        return self::valid(config('app.admin_timezone'))
            ?? self::valid($admin?->timezone)
            ?? config('app.timezone');
    }

    /**
     * Both clocks, for handing straight to a view.
     *
     * @return array{user: string, admin: string}
     */
    public static function pair(User $subject, ?User $admin = null): array
    {
        return [
            'user' => self::zoneFor($subject),
            'admin' => self::adminZone($admin),
        ];
    }

    /**
     * A zone we are willing to hand to PHP, or null.
     *
     * users.timezone is written from whatever a device claims. The sync
     * endpoint checks it against the IANA list before storing, but a row
     * predating that check - or edited by hand - would otherwise reach
     * setTimezone() and throw, taking down a support screen over a bad string
     * somebody's phone sent months ago.
     */
    private static function valid(mixed $zone): ?string
    {
        $zone = is_string($zone) ? trim($zone) : '';

        return $zone !== '' && isset(self::index()[$zone]) ? $zone : null;
    }

    /**
     * The IANA list as a lookup, built once per request.
     *
     * The users table calls this once per row and the timeline once per
     * timestamp, and timezone_identifiers_list() rebuilds an array of some
     * four hundred strings every time it is asked. A hash lookup instead of a
     * linear scan over a list we rebuild anyway.
     *
     * @return array<string, true>
     */
    private static function index(): array
    {
        static $index = null;

        return $index ??= array_fill_keys(timezone_identifiers_list(), true);
    }
}
