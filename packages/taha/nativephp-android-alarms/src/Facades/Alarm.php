<?php

namespace Taha\AndroidAlarms\Facades;

use Illuminate\Support\Facades\Facade;

/**
 * @method static bool isClockAppAvailable()
 * @method static array|null setWeeklySchedule(array $slots, ?string $appName = null, bool $vibrate = true)
 * @method static array|null setSingleAlarm(int $hour, int $minute, array $days = [], string $label = '', bool $vibrate = true)
 * @method static array|null openAlarmsList()
 *
 * @see \Taha\AndroidAlarms\Alarm
 */
class Alarm extends Facade
{
    protected static function getFacadeAccessor(): string
    {
        return \Taha\AndroidAlarms\Alarm::class;
    }
}
