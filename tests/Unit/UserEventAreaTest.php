<?php

namespace Tests\Unit;

use App\Models\UserEvent;
use PHPUnit\Framework\TestCase;

/**
 * Every event has to be classified, or the timeline quietly mis-files it.
 *
 * The area map is what turns forty event names into six readable groups on the
 * user report - the filter chips are grouped by it and every row is iconed by
 * it. An unlisted event still renders, because the accessor falls back to
 * Settings rather than throwing on a support screen, and that is exactly why
 * this test exists: the failure is silent, and a new training event would sit
 * under "Settings" with a sliders icon until somebody noticed.
 *
 * The same argument as LABELS: the lists sit a few lines apart in the model so
 * that adding one and forgetting the other is hard, and this makes it
 * impossible.
 */
class UserEventAreaTest extends TestCase
{
    public function test_every_event_name_has_an_area(): void
    {
        $missing = array_values(array_diff(UserEvent::NAMES, array_keys(UserEvent::AREAS)));

        $this->assertSame([], $missing, 'Events with no area: '.implode(', ', $missing));
    }

    public function test_every_area_used_is_one_of_the_declared_areas(): void
    {
        $declared = array_keys(UserEvent::AREA_LABELS);
        $used = array_values(array_unique(UserEvent::AREAS));

        $this->assertSame([], array_values(array_diff($used, $declared)));
    }

    public function test_the_area_map_does_not_name_events_that_do_not_exist(): void
    {
        // A rename that updated the constant but not the map would otherwise
        // leave a dead entry behind and a live event unclassified.
        $unknown = array_values(array_diff(array_keys(UserEvent::AREAS), UserEvent::NAMES));

        $this->assertSame([], $unknown, 'Areas for unknown events: '.implode(', ', $unknown));
    }

    public function test_every_toned_event_is_a_real_event(): void
    {
        $unknown = array_values(array_diff(array_keys(UserEvent::TONES), UserEvent::NAMES));

        $this->assertSame([], $unknown, 'Tones for unknown events: '.implode(', ', $unknown));
    }

    public function test_a_tone_is_one_of_the_two_verdicts(): void
    {
        $allowed = [UserEvent::TONE_GOOD, UserEvent::TONE_BAD];

        foreach (UserEvent::TONES as $name => $tone) {
            $this->assertContains($tone, $allowed, "{$name} has an unknown tone");
        }
    }
}
