<?php

namespace App\Livewire\Admin\Reports;

use App\Models\User;
use App\Models\UserEvent;
use App\Models\WorkoutSession;
use App\Support\Reports\Delta;
use App\Support\Reports\PlainWords;
use App\Support\Reports\Window;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Is anybody actually training, and where do they stop?
 *
 * The app's whole job in one page. Everything is keyed on when a workout was
 * FINISHED rather than when its row was created: rows arrive from a phone that
 * may have been offline for a week, so created_at is a chart of when people
 * had signal.
 */
class Training extends ReportPage
{
    /**
     * How far into a workout somebody got before quitting, in words.
     *
     * The app reports a quarter rather than a percentage, because that is as
     * precise as it can honestly be about a playlist of eight items.
     */
    private const QUIT_POINTS = [
        'p00' => 'Before the first quarter',
        'p25' => 'In the first half',
        'p50' => 'In the second half',
        'p75' => 'In the last quarter',
    ];

    /** Completed-day bands. Ranges, because exact counts are a long tail. */
    private const DAY_BUCKETS = [
        ['label' => 'None yet', 'from' => 0, 'to' => 0],
        ['label' => '1 to 3 days', 'from' => 1, 'to' => 3],
        ['label' => '4 to 7 days', 'from' => 4, 'to' => 7],
        ['label' => '8 to 14 days', 'from' => 8, 'to' => 14],
        ['label' => '15 to 30 days', 'from' => 15, 'to' => 30],
        ['label' => 'More than 30 days', 'from' => 31, 'to' => PHP_INT_MAX],
    ];

    public function slug(): string
    {
        return 'training';
    }

    protected function build(Window $window): array
    {
        [$since, $until] = [$window->since(), $window->until()];
        [$prevSince, $prevUntil] = [$window->prevSince(), $window->prevUntil()];

        $sessions = fn ($from, $to) => WorkoutSession::whereBetween('completed_at', [$from, $to])->count();
        $people = fn ($from, $to) => (int) WorkoutSession::whereBetween('completed_at', [$from, $to])
            ->distinct()->count('user_id');
        $averageLength = fn ($from, $to) => WorkoutSession::whereBetween('completed_at', [$from, $to])
            ->avg('duration_seconds');

        $finished = $this->eventCount(UserEvent::WORKOUT_COMPLETED, $since, $until);
        $quit = $this->eventCount(UserEvent::WORKOUT_ABANDONED, $since, $until);
        $prevFinished = $this->eventCount(UserEvent::WORKOUT_COMPLETED, $prevSince, $prevUntil);
        $prevQuit = $this->eventCount(UserEvent::WORKOUT_ABANDONED, $prevSince, $prevUntil);

        $sessionsNow = $sessions($since, $until);
        $peopleNow = $people($since, $until);
        $lengthNow = $averageLength($since, $until);

        return [
            'cards' => [
                [
                    'label' => 'Workouts finished',
                    'value' => number_format($sessionsNow),
                    'detail' => 'by '.PlainWords::people($peopleNow),
                    'delta' => Delta::of($sessionsNow, $sessions($prevSince, $prevUntil)),
                    'means' => 'Every workout recorded as done in '.$window->label().'. Two of them make a completed day.',
                    'ifLow' => null,
                ],
                [
                    'label' => 'People who trained',
                    'value' => number_format($peopleNow),
                    'detail' => $sessionsNow > 0 && $peopleNow > 0
                        ? round($sessionsNow / $peopleNow, 1).' workouts each on average'
                        : 'nobody trained in this window',
                    'delta' => Delta::of($peopleNow, $people($prevSince, $prevUntil)),
                    'means' => 'Different accounts that finished at least one workout.',
                    'ifLow' => null,
                ],
                [
                    'label' => 'Average workout length',
                    'value' => PlainWords::duration($lengthNow),
                    'detail' => 'per finished workout',
                    'delta' => Delta::of((float) $lengthNow, (float) $averageLength($prevSince, $prevUntil)),
                    'means' => 'How long a workout actually takes. It should track the difficulty levels people are on.',
                    'ifLow' => null,
                ],
                [
                    'label' => 'Run to the end',
                    'value' => PlainWords::percent($finished, $finished + $quit),
                    'detail' => ($finished + $quit) > 0
                        ? number_format($quit).' quit part way'
                        : 'the app has not reported this yet',
                    'delta' => Delta::of(
                        ($finished + $quit) > 0 ? $finished / ($finished + $quit) : 0,
                        ($prevFinished + $prevQuit) > 0 ? $prevFinished / ($prevFinished + $prevQuit) : 0,
                    ),
                    'means' => 'Of the workouts people started, how many they saw through to the last exercise.',
                    'ifLow' => ($finished + $quit) > 0 && $finished / ($finished + $quit) < 0.6
                        ? 'Look at where people quit, below. If it is mostly the first quarter, the workout is starting too hard.'
                        : null,
                ],
            ],
            'chart' => $this->perDay($window),
            'quitPoints' => $this->quitPoints($since, $until, $quit),
            'levels' => $this->levelSpread(),
            'lastExercises' => $this->lastExercises($since, $until),
            'dayBuckets' => $this->dayBuckets(),
            'streaks' => $this->streaks(),
            'quitSentence' => PlainWords::inTen($quit, $finished + $quit, 'workouts were quit part way through.'),
            'hasSessions' => $sessionsNow > 0,
        ];
    }

    private function eventCount(string $name, mixed $from, mixed $to): int
    {
        return UserEvent::where('name', $name)->whereBetween('occurred_at', [$from, $to])->count();
    }

    /**
     * Workouts per day, counted in the database rather than hydrated.
     *
     * @return array<int, array{label: string, value: int}>
     */
    private function perDay(Window $window): array
    {
        $byDay = WorkoutSession::query()
            ->whereBetween('completed_at', [$window->since(), $window->until()])
            ->selectRaw('DATE(completed_at) as day, COUNT(*) as total')
            ->groupBy('day')
            ->pluck('total', 'day');

        $bars = [];

        for ($i = $window->days - 1; $i >= 0; $i--) {
            $date = Carbon::today()->subDays($i);
            $bars[] = [
                'label' => $date->format('j'),
                'value' => (int) ($byDay[$date->toDateString()] ?? 0),
            ];
        }

        return $bars;
    }

    /** Where in a workout people give up. */
    private function quitPoints(mixed $since, mixed $until, int $totalQuit): array
    {
        $counts = UserEvent::where('name', UserEvent::WORKOUT_ABANDONED)
            ->whereBetween('occurred_at', [$since, $until])
            ->selectRaw('detail, COUNT(*) as total')
            ->groupBy('detail')
            ->pluck('total', 'detail');

        $rows = [];

        foreach (self::QUIT_POINTS as $key => $label) {
            $value = (int) ($counts[$key] ?? 0);
            $rows[] = [
                'label' => $label,
                'value' => $value,
                'pct' => $totalQuit > 0 ? (int) round($value / $totalQuit * 100) : 0,
            ];
        }

        return $rows;
    }

    /** How many accounts sit on each difficulty. */
    private function levelSpread(): array
    {
        return DB::table('users')
            ->join('levels', 'levels.id', '=', 'users.level_id')
            ->where('users.is_admin', false)
            ->groupBy('levels.number', 'levels.name')
            ->orderBy('levels.number')
            ->select(['levels.number', 'levels.name', DB::raw('COUNT(*) as total')])
            ->get()
            ->map(fn ($row) => [
                'label' => 'Level '.$row->number.' - '.$row->name,
                'value' => (int) $row->total,
            ])
            ->all();
    }

    /**
     * The exercise a workout ENDED on.
     *
     * Not "the exercise people do most": a session row keeps one exercise id
     * and it is the last one played, so this is the last thing on the screen
     * when the workout finished. It is still worth having - a name that keeps
     * appearing here is the last thing people saw before they stopped - but it
     * is not a popularity chart, and calling it one would be a lie.
     */
    private function lastExercises(mixed $since, mixed $until): array
    {
        return WorkoutSession::query()
            ->join('exercises', 'exercises.id', '=', 'workout_sessions.exercise_id')
            ->whereBetween('workout_sessions.completed_at', [$since, $until])
            ->groupBy('exercises.name')
            ->orderByDesc('total')
            ->limit(8)
            ->select(['exercises.name', DB::raw('COUNT(*) as total')])
            ->get()
            ->map(fn ($row) => ['label' => $row->name, 'value' => (int) $row->total])
            ->all();
    }

    /**
     * How far through the plan people have got, in bands.
     *
     * Counted per account in the database and bucketed in PHP: one grouped
     * query and a fold, rather than six count queries with six date ranges.
     */
    private function dayBuckets(): array
    {
        $perUser = DB::table('training_days')
            ->whereNotNull('completed_at')
            ->groupBy('user_id')
            ->select(['user_id', DB::raw('COUNT(*) as total')])
            ->pluck('total', 'user_id');

        $totalAccounts = User::where('is_admin', false)->count();

        $rows = [];

        foreach (self::DAY_BUCKETS as $bucket) {
            if ($bucket['to'] === 0) {
                // Everybody who is not in the list has completed nothing.
                $value = max(0, $totalAccounts - $perUser->count());
            } else {
                $value = $perUser->filter(
                    fn ($count) => $count >= $bucket['from'] && $count <= $bucket['to'],
                )->count();
            }

            $rows[] = [
                'label' => $bucket['label'],
                'value' => $value,
                'pct' => $totalAccounts > 0 ? (int) round($value / $totalAccounts * 100) : 0,
            ];
        }

        return $rows;
    }

    /**
     * The longest run of consecutive completed days each account has managed.
     *
     * Folded in PHP from a flat list of (person, date) pairs. Doing it in SQL
     * means window functions and date arithmetic, which is where SQLite and
     * MySQL stop agreeing.
     */
    private function streaks(): array
    {
        $days = [];

        // Bounded to six months. A streak that ended last winter says nothing
        // about the app now, and the fold has to stay a fold rather than
        // growing with every day the app has ever been live.
        $rows = DB::table('training_days')
            ->whereNotNull('completed_at')
            ->where('date', '>=', Carbon::today()->subDays(180)->toDateString())
            ->select('user_id', 'date')
            ->get();

        foreach ($rows as $row) {
            $days[(int) $row->user_id][] = substr((string) $row->date, 0, 10);
        }

        $bands = ['1 day' => 0, '2 to 3 days' => 0, '4 to 6 days' => 0, 'A week or more' => 0];

        foreach ($days as $dates) {
            sort($dates);
            $best = 1;
            $run = 1;

            for ($i = 1; $i < count($dates); $i++) {
                $previous = Carbon::parse($dates[$i - 1]);
                $current = Carbon::parse($dates[$i]);
                $run = $previous->addDay()->isSameDay($current) ? $run + 1 : 1;
                $best = max($best, $run);
            }

            $band = match (true) {
                $best >= 7 => 'A week or more',
                $best >= 4 => '4 to 6 days',
                $best >= 2 => '2 to 3 days',
                default => '1 day',
            };

            $bands[$band]++;
        }

        $total = max(1, array_sum($bands));

        return collect($bands)
            ->map(fn ($value, $label) => [
                'label' => $label,
                'value' => $value,
                'pct' => (int) round($value / $total * 100),
            ])
            ->values()
            ->all();
    }
}
