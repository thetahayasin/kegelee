<?php

namespace App\Support;

/**
 * The hardcoded exercise catalogue - the single source of truth for every
 * exercise the app can play.
 *
 * Each exercise is the original two-phase rhythm: a contract beat and a relax
 * beat, expressed as keyframed segments [label, seconds, from, to] where
 * from/to describe the squeeze intensity (0 = fully relaxed, 1 = fully
 * contracted). A "slowly" phase travels across its whole beat (a ramp); an
 * "at once" phase jumps straight to its value and stays there. Holding is one
 * continuous hold for the whole round.
 *
 * Patterns hold only the movement itself - rest happens between exercises,
 * inserted by the SessionBuilder, never inside a pattern.
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
            default => 'relax',    // released, waiting for the next beat
        };

        return ['phase' => $phase, 'label' => $label, 'seconds' => $seconds, 'from' => $from, 'to' => $to];
    }

    /** Hold a steady intensity - the glow jumps there "at once" and stays. */
    private static function hold(float $seconds, float $value, string $label): array
    {
        return self::seg($seconds, $value, $value, $label);
    }

    /** @return array<string, array<string, mixed>> */
    private static function build(): array
    {
        $s = fn (float $dur, float $from, float $to, string $label) => self::seg($dur, $from, $to, $label);
        $hold = fn (float $dur, float $v, string $label) => self::hold($dur, $v, $label);

        $definitions = [
            [
                // Contract at once for 0.7s, let go at once for 0.4s - starts relaxed.
                'name' => 'Trembling',
                'slug' => 'trembling',
                'unlock_after_days' => 0,
                'summary' => 'Quick flicks, on and off',
                'description' => 'Rapid short squeezes that make the muscle tremble and wake up its fast response.',
                'how_to' => 'Squeeze quickly, then let go right away. Follow the circle as it flicks on and off. Keep the flicks light and fast.',
                'pattern' => [$hold(0.4, 0, 'Relax'), $hold(0.7, 1, 'Contract')],
            ],
            [
                // One continuous hold for the whole round.
                'name' => 'Holding',
                'slug' => 'holding',
                'unlock_after_days' => 0,
                'summary' => 'One steady hold',
                'description' => 'Squeeze and keep holding to build baseline endurance in the pelvic floor.',
                'how_to' => 'Squeeze your pelvic floor and keep holding for the whole round. If the tension fades, gently squeeze back up. Keep breathing normally.',
                'pattern' => [$hold(3, 1, 'Contract & hold')],
            ],
            [
                // Contract slowly over 3s, then let go at once.
                'name' => 'Front Clamp',
                'slug' => 'front-clamp',
                'unlock_after_days' => 1,
                'summary' => 'Squeeze up slowly, let go at once',
                'description' => 'A slow, focused squeeze of the front pelvic floor with a quick clean release.',
                'how_to' => 'Tighten slowly over 3 seconds as the circle fills. When it empties, let go all at once. Then start the next slow squeeze.',
                'pattern' => [$s(3, 0, 1, 'Contract & hold'), $hold(1, 0, 'Release')],
            ],
            [
                // Front Clamp reversed: squeeze up instantly, then straight
                // into the slow 3s release - no hold in between.
                'name' => 'Reverse Clamp',
                'slug' => 'reverse-clamp',
                'unlock_after_days' => 3,
                'summary' => 'Squeeze at once, release slowly',
                'description' => 'A quick squeeze followed by a slow, controlled letting go. Great for control.',
                'how_to' => 'Squeeze at once, then immediately start releasing as slowly as you can, following the circle down. The slow letting go is the exercise.',
                'pattern' => [$s(0.3, 0, 1, 'Clamp'), $s(3, 1, 0, 'Release slowly')],
            ],
            [
                // The fastest flicks: 0.3s on, 0.3s off.
                'name' => 'Flash',
                'slug' => 'flash',
                'unlock_after_days' => 5,
                'summary' => 'Fastest on and off flicks',
                'description' => 'The fastest flicks. Short snappy squeezes that train quick reactions.',
                'how_to' => 'Squeeze and let go as fast as you can, in time with the circle. Stay light, do not strain.',
                'pattern' => [$hold(0.3, 1, 'Contract'), $hold(0.3, 0, 'Relax')],
            ],
            [
                // Contract at once, hold the tension, then a quick smooth relax.
                'name' => 'Steady Trembling',
                'slug' => 'steady-trembling',
                'unlock_after_days' => 7,
                'summary' => 'Squeeze at once, hold, then relax',
                'description' => 'Squeeze at once, keep the tension steady for a couple of seconds, then relax.',
                'how_to' => 'Squeeze at once and hold the tension. When the circle drops, let go smoothly. Then repeat the quick squeeze and hold.',
                'pattern' => [$hold(2.4, 1, 'Contract & hold'), $s(0.5, 1, 0, 'Relax')],
            ],
            [
                // Contract slowly over 3s, relax slowly over 3s.
                'name' => 'Clamp',
                'slug' => 'clamp',
                'unlock_after_days' => 14,
                'summary' => 'Slow squeeze up, slow release',
                'description' => 'A firm squeeze built up slowly and released just as slowly.',
                'how_to' => 'Tighten slowly over 3 seconds as the circle fills, then release just as slowly as it empties. Keep the movement smooth in both directions.',
                'pattern' => [$s(3, 0, 1, 'Contract & hold'), $s(3, 1, 0, 'Relax')],
            ],
            [
                // A small quick flick, a smooth relax down, then a 5 second hold.
                'name' => 'Starter',
                'slug' => 'starter',
                'unlock_after_days' => 20,
                'summary' => 'Quick flick, then a 5 second hold',
                'description' => 'One quick squeeze to wake the muscle, then a strong 5 second hold.',
                'how_to' => 'Give one quick squeeze, relax smoothly, then squeeze again and hold strong for five seconds. Let go, breathe, and repeat.',
                'pattern' => [$s(0.3, 0, 1, 'Contract'), $s(0.7, 1, 0, 'Relax'), $hold(5, 1, 'Contract & hold'), $hold(1, 0, 'Relax')],
            ],
            [
                // Squeeze up slowly over 1s, hold 4s, then let go at once.
                'name' => 'Short Holding',
                'slug' => 'short-holding',
                'unlock_after_days' => 36,
                'summary' => 'Squeeze up, hold 4 seconds, let go',
                'description' => 'A slow squeeze into a strong 4 second hold with a quick release.',
                'how_to' => 'Tighten slowly for one second, then hold at full strength for four seconds. Let go at once and go again.',
                'pattern' => [$s(1, 0, 1, 'Contract'), $hold(4, 1, 'Hold'), $hold(1, 0, 'Relax')],
            ],
            [
                // 2s slowly up, 2s slowly down - a smooth continuous wave.
                'name' => 'Waves',
                'slug' => 'waves',
                'unlock_after_days' => 43,
                'summary' => '2 seconds up, 2 seconds down',
                'description' => 'Wave-like squeezes that build and release tension continuously.',
                'how_to' => 'Tighten slowly for two seconds, then release just as slowly, like a wave rising and falling. Keep it smooth and continuous.',
                'pattern' => [$s(2, 0, 1, 'Contract & hold'), $s(2, 1, 0, 'Relax')],
            ],
            [
                // Fast half-second pulses, in and out.
                'name' => 'Pulsation',
                'slug' => 'pulsation',
                'unlock_after_days' => 50,
                'summary' => 'Fast half second pulses',
                'description' => 'Rhythmic pulses that build stamina and timing.',
                'how_to' => 'Squeeze and release in a fast steady rhythm with the circle. Keep every pulse the same strength.',
                'pattern' => [$s(0.5, 0, 1, 'Contract'), $s(0.5, 1, 0, 'Relax')],
            ],
            [
                // 3s build, 2s peak hold, 3s slow relax.
                'name' => 'Push',
                'slug' => 'push',
                'unlock_after_days' => 57,
                'summary' => '3s build, 2s peak hold, 3s relax',
                'description' => 'Build the squeeze to a strong peak, hold it, then let go slowly.',
                'how_to' => 'Tighten gradually over three seconds, getting stronger as the circle fills. Hold your strongest squeeze for two seconds, then release slowly. Squeeze harder, never push down or strain.',
                'pattern' => [$s(3, 0, 1, 'Build'), $hold(2, 1, 'Peak hold'), $s(3, 1, 0, 'Relax')],
            ],
            [
                // A 4-step climb: 25%, 50%, 75%, 100%, about 1s each, then relax.
                'name' => 'Upstairs',
                'slug' => 'upstairs',
                'unlock_after_days' => 69,
                'summary' => '4-step climb to the top',
                'description' => 'Climb the squeeze in four steps, a little stronger at each level.',
                'how_to' => 'Imagine riding an elevator upward. Tighten a little, then more, then more, until you reach your strongest squeeze, spending about one second at each level. Relax afterward.',
                'pattern' => [$hold(1, 0.25, 'Step 1'), $hold(1, 0.5, 'Step 2'), $hold(1, 0.75, 'Step 3'), $hold(1, 1, 'Top'), $hold(1, 0, 'Relax')],
            ],
            [
                'name' => 'Steady Clamp',
                'slug' => 'steady-clamp',
                'unlock_after_days' => 79,
                'summary' => '5 seconds up, 5 seconds down',
                'description' => 'A long, steady clamp that demands sustained control.',
                'how_to' => 'Tighten slowly over five seconds, then release just as slowly. Stay in full control the whole way.',
                'pattern' => [$s(5, 0, 1, 'Contract & hold'), $s(5, 1, 0, 'Relax')],
            ],
            [
                // The mirror of Upstairs: squeeze to the top, then step down
                // 75%, 50%, 25%, about 1s each, and release.
                'name' => 'Downstairs',
                'slug' => 'downstairs',
                'unlock_after_days' => 89,
                'summary' => '4-step descent from the top',
                'description' => 'Squeeze to the top, then come down one step at a time under full control.',
                'how_to' => 'Squeeze to your strongest, then relax a little at a time, pausing about one second at each level on the way down. The controlled descent is the exercise.',
                'pattern' => [$hold(1, 1, 'Top'), $hold(1, 0.75, 'Step 3'), $hold(1, 0.5, 'Step 2'), $hold(1, 0.25, 'Step 1'), $s(1, 0.25, 0, 'Relax')],
            ],
            [
                'name' => 'Long Steady Clamp',
                'slug' => 'long-steady-clamp',
                'unlock_after_days' => 99,
                'summary' => '10 second squeeze, slow release',
                'description' => 'An extended gradual squeeze for peak endurance.',
                'how_to' => 'Build to full strength over ten seconds, keeping control the whole time, then release slowly. The long climb builds endurance.',
                'pattern' => [$s(10, 0, 1, 'Contract & hold'), $s(5, 1, 0, 'Relax')],
            ],
            [
                'name' => 'Elevator',
                'slug' => 'elevator',
                'unlock_after_days' => 109,
                'summary' => 'Smooth 5 seconds up, 5 down',
                'description' => 'The signature exercise. Lift the squeeze smoothly, then lower it back down.',
                'how_to' => 'Imagine an elevator rising inside you. Tighten gradually over five seconds to the top, then lower back down just as smoothly until fully relaxed.',
                'pattern' => [$s(5, 0, 1, 'Contract & hold'), $s(5, 1, 0, 'Relax')],
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
