<?php

namespace App\Support\Reports;

/**
 * Numbers said the way a person would say them.
 *
 * "Conversion 31.4%" and "3 in 10 people who saw the paywall went on to pay"
 * are the same fact, and only one of them can be acted on without being
 * translated first. Percentages stay on the cards, where there is room for
 * exactly one number; sentences get the ratio in tenths.
 */
final class PlainWords
{
    /**
     * "3 in 10 people who saw the paywall went on to pay."
     *
     * $sentence is the tail: it should read on from "N in 10 ". Below one in
     * twenty the tenths are useless (they all round to zero), so that band gets
     * its own wording rather than saying "0 in 10", which reads as none at all.
     */
    public static function inTen(float|int $part, float|int $whole, string $sentence): string
    {
        if ($whole <= 0) {
            return 'Nobody has got that far yet, so there is nothing to work out.';
        }

        $share = $part / $whole;

        if ($share <= 0) {
            return 'Nobody yet '.$sentence;
        }

        if ($share < 0.05) {
            return 'Fewer than 1 in 20 '.$sentence;
        }

        return round($share * 10).' in 10 '.$sentence;
    }

    /** A percentage for a card, or a dash when there is nothing to divide. */
    public static function percent(float|int $part, float|int $whole): string
    {
        return $whole > 0 ? round($part / $whole * 100).'%' : '-';
    }

    /** "12 people" / "1 person". Counts always carry their noun. */
    public static function people(int $count): string
    {
        return $count === 1 ? '1 person' : number_format($count).' people';
    }

    /** "12 times" / "once". For things that happened, not for people. */
    public static function times(int $count): string
    {
        return match (true) {
            $count === 0 => 'never',
            $count === 1 => 'once',
            default => number_format($count).' times',
        };
    }

    /** "4 minutes 12 seconds", from a number of seconds. */
    public static function duration(?float $seconds): string
    {
        if (! $seconds || $seconds <= 0) {
            return '-';
        }

        $seconds = (int) round($seconds);
        $minutes = intdiv($seconds, 60);
        $rest = $seconds % 60;

        if ($minutes === 0) {
            return "{$rest}s";
        }

        return "{$minutes}m {$rest}s";
    }
}
