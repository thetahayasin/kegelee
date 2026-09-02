<?php

namespace App\Support\Reports;

/**
 * This period against the one before it.
 *
 * A number on its own is not information. "412 sessions" is good news or bad
 * news depending entirely on what last month was, and the whole reason every
 * card here carries one of these is so nobody has to remember.
 */
final class Delta
{
    /**
     * @return array{pct: int|null, dir: string, text: string}
     *
     * pct is null when there is nothing honest to compare against: a previous
     * period of zero makes every change infinite, which is not a fact about
     * the app. The text says so in words instead of printing a percentage
     * nobody should act on.
     */
    public static function of(float|int $now, float|int $then): array
    {
        if ($then <= 0) {
            return $now > 0
                ? ['pct' => null, 'dir' => 'up', 'text' => 'new this period']
                : ['pct' => null, 'dir' => 'flat', 'text' => 'nothing either period'];
        }

        $pct = (int) round((($now - $then) / $then) * 100);

        if ($pct === 0) {
            return ['pct' => 0, 'dir' => 'flat', 'text' => 'same as last period'];
        }

        return [
            'pct' => $pct,
            'dir' => $pct > 0 ? 'up' : 'down',
            'text' => ($pct > 0 ? 'up ' : 'down ').abs($pct).'% vs last period',
        ];
    }
}
