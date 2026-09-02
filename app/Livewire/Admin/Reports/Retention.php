<?php

namespace App\Livewire\Admin\Reports;

use App\Models\User;
use App\Models\UserEvent;
use App\Support\Reports\Delta;
use App\Support\Reports\PlainWords;
use App\Support\Reports\Window;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Do people come back?
 *
 * The one question a training app lives or dies by. Everything is grouped by
 * the week somebody joined, because that is the only fair comparison: people
 * who joined in March have had months to come back and people who joined on
 * Friday have had two days, and mixing them makes March look wonderful.
 *
 * All of it is folded in PHP from two flat lists of (person, date) pairs
 * rather than written as one clever query. Date arithmetic is the part of SQL
 * that differs most between SQLite and MySQL, and this has to give the same
 * answer on a laptop and on the server.
 */
class Retention extends ReportPage
{
    /** How many weeks of joiners the table shows. */
    private const WEEKS = 12;

    /**
     * How wide a "day 7" is.
     *
     * Exactly seven days later is the textbook definition and it is too sharp
     * to be useful at this size: somebody who came back on the Saturday
     * instead of the Friday is the same good news, and with fifty people a
     * week the exact-day version is mostly noise. The page says so out loud.
     */
    private const CHECKS = [
        'day1' => ['label' => 'Came back the next day', 'when' => 'on the day after they joined', 'from' => 1, 'to' => 1],
        'day7' => ['label' => 'Came back about a week later', 'when' => 'between five and nine days after joining', 'from' => 5, 'to' => 9],
        'day30' => ['label' => 'Came back about a month later', 'when' => 'between 25 and 35 days after joining', 'from' => 25, 'to' => 35],
    ];

    public function slug(): string
    {
        return 'retention';
    }

    protected function build(Window $window): array
    {
        // Far enough back to cover both the table and the previous window that
        // the cards compare against, and no further.
        $foldSince = Carbon::today()->subWeeks(self::WEEKS)->startOfWeek()
            ->min($window->prevSince())
            ->startOfDay();

        /** @var \Illuminate\Support\Collection<int, Carbon> $joined id => when they joined */
        $joined = User::where('is_admin', false)
            ->where('created_at', '>=', $foldSince)
            ->pluck('created_at', 'id');

        $activeDays = $this->activeDaysByUser($foldSince);
        $trainedDays = $this->trainedDaysByUser($foldSince);

        return [
            'cards' => $this->cards($window, $joined, $activeDays, $trainedDays),
            'weeks' => $this->weeklyTable($joined, $activeDays),
            'hasAnybody' => $joined->isNotEmpty(),
        ];
    }

    /**
     * Every day each person had the app open, as a set of Y-m-d strings.
     *
     * Two sources merged: the app_opened event, which only exists on builds
     * that send it, and a finished workout, which every version has always
     * recorded. Somebody who did both on one day is one day either way, which
     * is what a set is for.
     *
     * @return array<int, array<string, true>>
     */
    private function activeDaysByUser(Carbon $since): array
    {
        $days = [];

        $rows = DB::table('user_events')
            ->where('name', UserEvent::APP_OPENED)
            ->where('occurred_at', '>=', $since)
            // DATE() is spelled the same in SQLite and MySQL. Anything richer
            // than this is not.
            ->selectRaw('user_id, DATE(occurred_at) as day')
            ->distinct()
            ->get();

        foreach ($rows as $row) {
            $days[(int) $row->user_id][(string) $row->day] = true;
        }

        $sessions = DB::table('workout_sessions')
            ->whereNotNull('completed_at')
            ->where('completed_at', '>=', $since)
            ->selectRaw('user_id, DATE(completed_at) as day')
            ->distinct()
            ->get();

        foreach ($sessions as $row) {
            $days[(int) $row->user_id][(string) $row->day] = true;
        }

        return $days;
    }

    /**
     * Every day each person completed - both workouts done, not just one.
     *
     * @return array<int, array<string, true>>
     */
    private function trainedDaysByUser(Carbon $since): array
    {
        $days = [];

        $rows = DB::table('training_days')
            ->whereNotNull('completed_at')
            ->where('date', '>=', $since->toDateString())
            ->select('user_id', 'date')
            ->get();

        foreach ($rows as $row) {
            // The date column is a plain Y-m-d string on purpose, so it needs
            // no conversion on either database.
            $days[(int) $row->user_id][substr((string) $row->date, 0, 10)] = true;
        }

        return $days;
    }

    /**
     * The three headline numbers, for people who joined in this window against
     * people who joined in the one before it.
     */
    private function cards(Window $window, $joined, array $activeDays, array $trainedDays): array
    {
        $inWindow = fn ($from, $to) => $joined->filter(
            fn (Carbon $at) => $at->betweenIncluded($from, $to),
        );

        $now = $inWindow($window->since(), $window->until());
        $before = $inWindow($window->prevSince(), $window->prevUntil());

        $cards = [];

        foreach (self::CHECKS as $check) {
            // Somebody who joined yesterday cannot yet have failed to come
            // back a month later, and counting them as a failure is how a
            // retention figure ends up looking like a cliff every time
            // marketing works. Only people who have HAD the time are counted.
            $ready = fn ($group) => $group->filter(
                fn (Carbon $at) => $at->copy()->addDays($check['to'])->isPast(),
            );

            $nowReady = $ready($now);
            $beforeReady = $ready($before);

            $nowCame = $this->cameBack($nowReady, $activeDays, $check['from'], $check['to']);
            $beforeCame = $this->cameBack($beforeReady, $activeDays, $check['from'], $check['to']);

            $cards[] = [
                'label' => $check['label'],
                'value' => PlainWords::percent($nowCame, $nowReady->count()),
                'detail' => $nowReady->isEmpty()
                    ? 'nobody has been signed up long enough yet'
                    : $nowCame.' of '.PlainWords::people($nowReady->count()).' who joined in '.$window->label(),
                'delta' => Delta::of(
                    $nowReady->count() > 0 ? $nowCame / $nowReady->count() : 0,
                    $beforeReady->count() > 0 ? $beforeCame / $beforeReady->count() : 0,
                ),
                'means' => 'Of the people who joined in '.$window->label().' and have had the time, how many opened the app again '.$check['when'].'.',
                'ifLow' => $nowReady->count() > 0 && $nowCame / $nowReady->count() < 0.2
                    ? 'Fewer than 2 in 10 are coming back. The usual cause is reminders never being set - Engagement shows how many people set them.'
                    : null,
            ];
        }

        // Three days in the first week is the point at which training has
        // become a habit rather than a try. It comes from completed DAYS, not
        // from workouts, so half-finished days do not flatter it.
        $ready = $now->filter(fn (Carbon $at) => $at->copy()->addDays(7)->isPast());
        $stuck = $this->trainedThreeDays($ready, $trainedDays);
        $beforeReadyGroup = $before->filter(fn (Carbon $at) => $at->copy()->addDays(7)->isPast());
        $beforeStuck = $this->trainedThreeDays($beforeReadyGroup, $trainedDays);

        $cards[] = [
            'label' => 'Trained 3 days in their first week',
            'value' => PlainWords::percent($stuck, $ready->count()),
            'detail' => $ready->isEmpty()
                ? 'nobody has finished a first week yet'
                : $stuck.' of '.PlainWords::people($ready->count()),
            'delta' => Delta::of(
                $ready->count() > 0 ? $stuck / $ready->count() : 0,
                $beforeReadyGroup->count() > 0 ? $beforeStuck / $beforeReadyGroup->count() : 0,
            ),
            'means' => 'Completed days, not single workouts. Three of them in the first week is where trying turns into a habit.',
            'ifLow' => $ready->count() > 0 && $stuck / $ready->count() < 0.15
                ? 'Almost nobody is getting to three days. Training shows where in a workout people stop.'
                : null,
        ];

        return $cards;
    }

    private function cameBack($group, array $activeDays, int $from, int $to): int
    {
        $count = 0;

        foreach ($group as $userId => $joinedAt) {
            $days = $activeDays[$userId] ?? [];

            for ($offset = $from; $offset <= $to; $offset++) {
                if (isset($days[$joinedAt->copy()->addDays($offset)->toDateString()])) {
                    $count++;
                    break;
                }
            }
        }

        return $count;
    }

    private function trainedThreeDays($group, array $trainedDays): int
    {
        $count = 0;

        foreach ($group as $userId => $joinedAt) {
            $days = $trainedDays[$userId] ?? [];
            $inWeek = 0;

            for ($offset = 0; $offset <= 6; $offset++) {
                if (isset($days[$joinedAt->copy()->addDays($offset)->toDateString()])) {
                    $inWeek++;
                }
            }

            if ($inWeek >= 3) {
                $count++;
            }
        }

        return $count;
    }

    /**
     * One row per week people joined, newest first.
     *
     * @return array<int, array<string, mixed>>
     */
    private function weeklyTable($joined, array $activeDays): array
    {
        $weeks = [];

        for ($i = 0; $i < self::WEEKS; $i++) {
            $start = Carbon::today()->startOfWeek()->subWeeks($i);
            $end = $start->copy()->endOfWeek();

            $group = $joined->filter(fn (Carbon $at) => $at->betweenIncluded($start, $end));
            $row = [
                'week' => $start->format('j M'),
                'people' => $group->count(),
                'checks' => [],
            ];

            foreach (self::CHECKS as $key => $check) {
                $ready = $group->filter(fn (Carbon $at) => $at->copy()->addDays($check['to'])->isPast());
                $came = $this->cameBack($ready, $activeDays, $check['from'], $check['to']);

                $row['checks'][$key] = [
                    // A dash, not a zero: nobody in this week has had the time
                    // yet, which is not the same as nobody coming back.
                    'ready' => $ready->count(),
                    'count' => $came,
                    'pct' => $ready->count() > 0 ? (int) round($came / $ready->count() * 100) : null,
                ];
            }

            $weeks[] = $row;
        }

        return $weeks;
    }
}
