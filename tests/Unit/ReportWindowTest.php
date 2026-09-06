<?php

namespace Tests\Unit;

use App\Support\Reports\Window;
use Illuminate\Support\Carbon;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * The two periods a report compares must be the same length.
 *
 * They were not. The current window ran to NOW and the previous one ran a whole
 * number of days, so every "vs last period" figure on every report page put a
 * part-finished period against a complete one and called the difference change.
 * A flat metric read as down 10% on the 7-day view, and the number moved by
 * itself all day as today filled up.
 */
class ReportWindowTest extends TestCase
{
    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public static function timesOfDay(): array
    {
        return [
            // The worst case for the old bug: nothing of today has happened,
            // so the current window was a full day shorter than the previous.
            'just after midnight' => ['2026-09-06 00:00:30'],
            'early morning' => ['2026-09-06 06:15:00'],
            'midday' => ['2026-09-06 12:00:00'],
            'late evening' => ['2026-09-06 23:59:00'],
        ];
    }

    #[DataProvider('timesOfDay')]
    public function test_both_periods_are_the_same_length_whatever_the_hour(string $now): void
    {
        Carbon::setTestNow($now);

        foreach (Window::CHOICES as $days) {
            $window = Window::of($days);

            $this->assertSame(
                (int) $window->since()->diffInSeconds($window->until()),
                (int) $window->prevSince()->diffInSeconds($window->prevUntil()),
                "the {$days}-day window and its comparison differ in length at {$now}",
            );
        }
    }

    public function test_the_previous_period_sits_entirely_before_this_one(): void
    {
        Carbon::setTestNow('2026-09-06 09:30:00');

        foreach (Window::CHOICES as $days) {
            $window = Window::of($days);

            $this->assertTrue(
                $window->prevUntil()->lessThanOrEqualTo($window->since()),
                "the {$days}-day comparison period overlaps the window it is compared against",
            );
        }
    }

    public function test_a_window_is_shifted_by_exactly_its_own_length(): void
    {
        Carbon::setTestNow('2026-09-06 09:30:00');

        foreach (Window::CHOICES as $days) {
            $window = Window::of($days);

            $this->assertSame($days * 86400, (int) $window->prevSince()->diffInSeconds($window->since()));
            $this->assertSame($days * 86400, (int) $window->prevUntil()->diffInSeconds($window->until()));
        }
    }

    public function test_an_unoffered_length_falls_back_rather_than_being_trusted(): void
    {
        // It arrives off a query string, so this is a bound and not a nicety.
        $this->assertSame(Window::DEFAULT, Window::of(3650)->days);
        $this->assertSame(Window::DEFAULT, Window::of('; drop table users')->days);
        $this->assertSame(Window::DEFAULT, Window::of(-7)->days);
        $this->assertSame(7, Window::of('7')->days);
    }
}
