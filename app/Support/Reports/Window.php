<?php

namespace App\Support\Reports;

use Illuminate\Support\Carbon;

/**
 * The stretch of time a report is about, and the stretch before it.
 *
 * Three fixed lengths rather than a date picker. Every question these pages
 * answer is "is this getting better or worse", which needs a window the same
 * length as the last one far more than it needs an arbitrary one - and a free
 * date range is also an unbounded table scan arriving from a query string.
 */
final class Window
{
    /** The only lengths on offer, in days. */
    public const CHOICES = [7, 30, 90];

    public const DEFAULT = 30;

    private function __construct(public readonly int $days)
    {
    }

    /**
     * Read a window off whatever the URL carried. Anything that is not one of
     * the three offered becomes the default, rather than being trusted.
     */
    public static function of(mixed $days): self
    {
        $days = is_numeric($days) ? (int) $days : self::DEFAULT;

        return new self(in_array($days, self::CHOICES, true) ? $days : self::DEFAULT);
    }

    /** Midnight at the start of the first day counted. */
    public function since(): Carbon
    {
        return Carbon::today()->subDays($this->days - 1)->startOfDay();
    }

    /** Now. The window always ends at this moment, never at a past midnight. */
    public function until(): Carbon
    {
        return Carbon::now();
    }

    /** The same length again, immediately before this one. */
    public function prevSince(): Carbon
    {
        return $this->since()->copy()->subDays($this->days);
    }

    public function prevUntil(): Carbon
    {
        return $this->since();
    }

    /** "the last 30 days", for writing into a sentence. */
    public function label(): string
    {
        return "the last {$this->days} days";
    }

    /** "the 30 days before that". */
    public function previousLabel(): string
    {
        return "the {$this->days} days before that";
    }
}
