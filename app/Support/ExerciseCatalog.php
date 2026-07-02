<?php

namespace App\Support;

/**
 * The hardcoded exercise catalogue - the single source of truth for every
 * exercise the app can play.
 *
 * Each exercise is a keyframed movement pattern: an ordered list of segments
 * [label, seconds, from, to] where from/to describe the squeeze intensity
 * (0 = fully relaxed, 1 = fully contracted). The workout player animates the
 * glow between those keyframes and shows the segment label (Contract, Hold,
 * Release, Rest, Floor 1, ...) so the user always knows what to do.
 *
 * Nothing here is stored in or edited from the backend. The backend only
 * handles accounts, session history, completed days, reminders and
 * subscriptions. The ExerciseSeeder mirrors this catalogue into the local
 * database purely so foreign keys and route binding keep working.
 */
final class ExerciseCatalog
{
    /** @var array<string, array<string, mixed>>|null slug => definition */
    private static ?array $all = null;

    /** @return array<string, array<string, mixed>> slug => definition */
    public static function all(): array
    {
        return self::$all ??= self::build();
    }

    /** @return array<string, mixed>|null */
    public static function get(string $slug): ?array
    {
        return self::all()[$slug] ?? null;
    }

    /** One full pattern cycle, in seconds. */
    public static function cycleSeconds(string $slug): float
    {
        $def = self::get($slug);
        if (! $def) {
            return 0.0;
        }

        return round(array_sum(array_column($def['pattern'], 'seconds')), 2);
    }

    /** Whole pattern cycles that fit in the given duration (at least one). */
    public static function repsForDuration(string $slug, float $duration): int
    {
        $cycle = self::cycleSeconds($slug);

        return $cycle > 0 ? max(1, (int) floor($duration / $cycle + 1e-6)) : 0;
    }

    /**
     * Expand the exercise into player steps filling the given duration with
     * whole pattern cycles (never cut a movement in half).
     *
     * @return array<int, array{phase: string, label: string, seconds: float, from: float, to: float}>
     */
    public static function steps(string $slug, float $duration): array
    {
        $def = self::get($slug);
        if (! $def) {
            return [];
        }

        $reps = self::repsForDuration($slug, $duration);
        $steps = [];

        for ($i = 0; $i < $reps; $i++) {
            foreach ($def['pattern'] as $seg) {
                $steps[] = $seg;
            }
        }

        return $steps;
    }

    /**
     * A movement segment. Intensity animates from -> to over the duration.
     * The phase drives haptics and styling: rising or held tension is a
     * contraction, falling or zero tension is a release.
     *
     * @return array{phase: string, label: string, seconds: float, from: float, to: float}
     */
    private static function seg(float $seconds, float $from, float $to, string $label): array
    {
        $phase = match (true) {
            $to > $from => 'contract',
            $to < $from => 'relax',
            $to > 0 => 'contract', // held tension
            default => 'relax',    // resting at zero
        };

        return ['phase' => $phase, 'label' => $label, 'seconds' => $seconds, 'from' => $from, 'to' => $to];
    }

    /** Hold a steady intensity. */
    private static function hold(float $seconds, float $value, string $label): array
    {
        return self::seg($seconds, $value, $value, $label);
    }

    /** n quick full-range squeeze-and-let-go pulses sharing one label. */
    private static function pulses(int $n, float $on, string $label): array
    {
        $out = [];
        for ($i = 0; $i < $n; $i++) {
            $out[] = self::seg($on, 0, 1, $label);
            $out[] = self::seg($on, 1, 0, $label);
        }

        return $out;
    }

    /** n small oscillations near the top - held tension that trembles. */
    private static function tremble(int $n, float $on, string $label): array
    {
        $out = [];
        for ($i = 0; $i < $n; $i++) {
            $out[] = self::seg($on, 1, 0.72, $label);
            $out[] = self::seg($on, 0.72, 1, $label);
        }

        return $out;
    }

    /** @return array<string, array<string, mixed>> */
    private static function build(): array
    {
        $s = fn (float $dur, float $from, float $to, string $label) => self::seg($dur, $from, $to, $label);
        $hold = fn (float $dur, float $v, string $label) => self::hold($dur, $v, $label);

        $definitions = [
            [
                'name' => 'Trembling',
                'slug' => 'trembling',
                'unlock_after_days' => 0,
                'summary' => 'Rapid quick flicks',
                'description' => 'Rapid short squeezes that make the muscle tremble and wake up its fast response.',
                'how_to' => 'Squeeze your pelvic floor quickly, then let go right away. Repeat with the circle. Keep the flicks light and fast, then rest and breathe when the circle rests.',
                'pattern' => [...self::pulses(6, 0.45, 'Quick flicks'), $hold(1.4, 0, 'Rest')],
            ],
            [
                'name' => 'Holding',
                'slug' => 'holding',
                'unlock_after_days' => 0,
                'summary' => 'Squeeze, hold 3 seconds, rest',
                'description' => 'The classic exercise. Squeeze, hold for a few seconds, then rest just as long.',
                'how_to' => 'Squeeze your pelvic floor and hold it while the circle stays full. Then let go slowly and rest until the circle empties. Keep breathing normally the whole time.',
                'pattern' => [$s(1, 0, 1, 'Contract'), $hold(3, 1, 'Hold'), $s(1, 1, 0, 'Release'), $hold(3, 0, 'Rest')],
            ],
            [
                'name' => 'Front Clamp',
                'slug' => 'front-clamp',
                'unlock_after_days' => 1,
                'summary' => 'Hold 3 seconds, quick release',
                'description' => 'A steady hold at the front of the pelvic floor, finished with a quick clean release.',
                'how_to' => 'Squeeze as if stopping the flow of urine and hold it steady. When the circle drops, let go all at once. Rest, then repeat.',
                'pattern' => [$s(1.2, 0, 1, 'Contract'), $hold(3, 1, 'Hold'), $s(0.4, 1, 0, 'Quick release'), $hold(1.2, 0, 'Rest')],
            ],
            [
                'name' => 'Reverse Clamp',
                'slug' => 'reverse-clamp',
                'unlock_after_days' => 3,
                'summary' => 'Quick clamp, slow release',
                'description' => 'A fast squeeze followed by a slow, controlled letting go. Great for control.',
                'how_to' => 'Squeeze quickly and hold for a moment. Then release as slowly as you can, following the circle down. The slow letting go is the exercise.',
                'pattern' => [$s(0.4, 0, 1, 'Contract'), $hold(1, 1, 'Hold'), $s(3, 1, 0, 'Ease down slowly'), $hold(1.2, 0, 'Rest')],
            ],
            [
                'name' => 'Flash',
                'slug' => 'flash',
                'unlock_after_days' => 5,
                'summary' => 'Fastest flick pulses',
                'description' => 'The fastest flicks. Short snappy squeezes that train quick reactions.',
                'how_to' => 'Squeeze and let go as fast as you can, in time with the circle. Stay light, do not strain. Rest when the circle rests.',
                'pattern' => [...self::pulses(8, 0.28, 'Flash flicks'), $hold(1, 0, 'Rest')],
            ],
            [
                'name' => 'Steady Trembling',
                'slug' => 'steady-trembling',
                'unlock_after_days' => 7,
                'summary' => 'Hold high, tremble, release',
                'description' => 'Squeeze up, keep the tension while it gently trembles, then release.',
                'how_to' => 'Squeeze up to a strong hold. Keep the tension while making tiny quick squeezes on top of it. Then release and rest.',
                'pattern' => [$s(1, 0, 1, 'Contract'), ...self::tremble(5, 0.24, 'Hold and tremble'), $s(0.6, 1, 0, 'Release'), $hold(1.2, 0, 'Rest')],
            ],
            [
                'name' => 'Clamp',
                'slug' => 'clamp',
                'unlock_after_days' => 14,
                'summary' => 'Firm clamp, 3 second hold',
                'description' => 'A firm full squeeze held steady, then let go with control.',
                'how_to' => 'Squeeze firmly and hold it steady without letting the tension drop. Release with control and rest before the next round.',
                'pattern' => [$s(0.7, 0, 1, 'Contract'), $hold(3, 1, 'Hold'), $s(0.9, 1, 0, 'Release'), $hold(2.5, 0, 'Rest')],
            ],
            [
                'name' => 'Starter',
                'slug' => 'starter',
                'unlock_after_days' => 20,
                'summary' => 'Gentle ease in and out',
                'description' => 'A gentle warm up. Ease into the squeeze, hold briefly, ease out and breathe.',
                'how_to' => 'Tighten slowly and smoothly as the circle fills. Hold briefly, then let go just as smoothly. Focus on breathing calmly.',
                'pattern' => [$s(2, 0, 1, 'Ease in'), $hold(1.5, 1, 'Hold'), $s(1.5, 1, 0, 'Ease out'), $hold(1.5, 0, 'Breathe')],
            ],
            [
                'name' => 'Short Holding',
                'slug' => 'short-holding',
                'unlock_after_days' => 36,
                'summary' => 'Quick squeeze, 4 second hold',
                'description' => 'Short, strong holds with a clean release.',
                'how_to' => 'Squeeze quickly to full strength and hold it there. Release cleanly when the circle drops, rest briefly, then go again.',
                'pattern' => [$s(0.8, 0, 1, 'Squeeze'), $hold(4, 1, 'Hold'), $s(0.7, 1, 0, 'Release'), $hold(1.5, 0, 'Rest')],
            ],
            [
                'name' => 'Waves',
                'slug' => 'waves',
                'unlock_after_days' => 43,
                'summary' => 'Smooth rise and fall',
                'description' => 'A smooth, continuous rise and fall with no full rest between waves.',
                'how_to' => 'Tighten slowly all the way up, then release slowly all the way down, like a wave. Keep the movement smooth and continuous.',
                'pattern' => [$s(2.6, 0, 1, 'Rise'), $s(2.6, 1, 0, 'Fall'), $s(2.6, 0, 1, 'Rise'), $s(2.6, 1, 0, 'Fall')],
            ],
            [
                'name' => 'Pulsation',
                'slug' => 'pulsation',
                'unlock_after_days' => 50,
                'summary' => 'Rapid rhythmic pulses',
                'description' => 'Rhythmic pulses that build stamina and timing.',
                'how_to' => 'Squeeze and release in a steady rhythm with the circle. Keep every pulse the same strength. Rest when the circle rests.',
                'pattern' => [...self::pulses(8, 0.35, 'Pulse'), $hold(2, 0, 'Rest')],
            ],
            [
                'name' => 'Push',
                'slug' => 'push',
                'unlock_after_days' => 57,
                'summary' => 'Build to a strong peak',
                'description' => 'Build the squeeze gradually to a strong peak, hold it, then let go.',
                'how_to' => 'Tighten gradually, getting stronger as the circle fills. At the top, hold your strongest squeeze. Squeeze harder, never push down or strain.',
                'pattern' => [$s(4, 0, 1, 'Build'), $hold(2.5, 1, 'Peak hold'), $s(1.2, 1, 0, 'Release'), $hold(1.5, 0, 'Rest')],
            ],
            [
                'name' => 'Upstairs',
                'slug' => 'upstairs',
                'unlock_after_days' => 69,
                'summary' => 'Climb up in 4 steps',
                'description' => 'Climb the squeeze up in small steps until you reach the top.',
                'how_to' => 'Tighten a little and hold. Then a little more. Step up in stages until you reach your strongest squeeze, then release and rest.',
                'pattern' => [$hold(0.9, 0.25, 'Step 1'), $hold(0.9, 0.5, 'Step 2'), $hold(0.9, 0.75, 'Step 3'), $hold(1.1, 1, 'Top'), $s(1.2, 1, 0, 'Release'), $hold(1.2, 0, 'Rest')],
            ],
            [
                'name' => 'Steady Clamp',
                'slug' => 'steady-clamp',
                'unlock_after_days' => 79,
                'summary' => 'Clamp, 5 second steady hold',
                'description' => 'A long, steady clamp held under full control.',
                'how_to' => 'Squeeze to full strength and keep it perfectly steady while the circle holds. Release with control and rest well between rounds.',
                'pattern' => [$s(0.8, 0, 1, 'Clamp'), $hold(5, 1, 'Hold steady'), $s(0.8, 1, 0, 'Release'), $hold(2, 0, 'Rest')],
            ],
            [
                'name' => 'Downstairs',
                'slug' => 'downstairs',
                'unlock_after_days' => 89,
                'summary' => 'Lower down in 4 steps',
                'description' => 'Squeeze to the top, then come down in small controlled steps.',
                'how_to' => 'Squeeze up to full strength first. Then relax a little at a time, pausing at each step on the way down. The slow controlled descent is the goal.',
                'pattern' => [$s(0.9, 0, 1, 'Lift'), $hold(0.8, 1, 'Top'), $hold(0.9, 0.75, 'Down 3'), $hold(0.9, 0.5, 'Down 2'), $hold(0.9, 0.25, 'Down 1'), $s(0.7, 0.25, 0, 'Release'), $hold(1.2, 0, 'Rest')],
            ],
            [
                'name' => 'Long Steady Clamp',
                'slug' => 'long-steady-clamp',
                'unlock_after_days' => 99,
                'summary' => 'Clamp, 10 second max hold',
                'description' => 'An extended maximum hold for peak endurance.',
                'how_to' => 'Squeeze to full strength and hold for the whole count. If the tension fades, gently squeeze back up to full. Rest well afterwards.',
                'pattern' => [$s(1, 0, 1, 'Clamp'), $hold(10, 1, 'Hold'), $s(1, 1, 0, 'Release'), $hold(3, 0, 'Rest')],
            ],
            [
                'name' => 'Elevator',
                'slug' => 'elevator',
                'unlock_after_days' => 109,
                'summary' => 'Lift, hold top, lower',
                'description' => 'The signature exercise. Lift floor by floor, hold at the top, then lower back down.',
                'how_to' => 'Imagine an elevator rising inside you. Tighten a little more at each floor. Hold at the top, then come back down one floor at a time until fully relaxed.',
                'pattern' => [$hold(0.85, 0.2, 'Floor 1'), $hold(0.85, 0.4, 'Floor 2'), $hold(0.85, 0.6, 'Floor 3'), $hold(0.85, 0.8, 'Floor 4'), $hold(1.3, 1, 'Top'), $hold(0.85, 0.8, 'Down 4'), $hold(0.85, 0.6, 'Down 3'), $hold(0.85, 0.4, 'Down 2'), $hold(0.85, 0.2, 'Down 1'), $s(0.7, 0.2, 0, 'Ground'), $hold(1.3, 0, 'Rest')],
            ],
        ];

        $bySlug = [];
        foreach ($definitions as $i => $def) {
            $def['sort_order'] = $i;
            $bySlug[$def['slug']] = $def;
        }

        return $bySlug;
    }
}
