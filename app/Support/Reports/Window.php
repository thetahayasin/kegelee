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

    /**
     * The same window, shifted back by its own length.
     *
     * "The same length" is the entire job, and it used to run from prevSince()
     * to since() - a whole number of days - while the current window runs from
     * since() to NOW, which is a whole number of days minus however much of
     * today has not happened yet. So every comparison on every report page put
     * a partial period against a complete one and reported the difference as
     * change.
     *
     * The bias is not small and it is not constant. On the 7-day window a
     * completely flat metric read as down 10% by mid-morning and down 14% just
     * after midnight, recovering through the day as today filled up: the
     * figures moved on their own, all day, every day, and the direction was
     * always the same one. 30 days understated by ~2%, 90 by ~1%.
     *
     * Shifting the whole window back by `days` keeps both ends aligned to the
     * same time of day, so the two periods are the same length whenever they
     * are asked and a flat metric reads as flat. The cost is that the previous
     * period now stops `days` before now rather than exactly where this one
     * starts, leaving the last part-day before the window unattributed to
     * either. That is the honest trade: a small gap between two comparable
     * periods beats no gap between two periods that cannot be compared.
     */
    public function prevSince(): Carbon
    {
        return $this->since()->copy()->subDays($this->days);
    }

    public function prevUntil(): Carbon
    {
        return $this->until()->copy()->subDays($this->days);
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
