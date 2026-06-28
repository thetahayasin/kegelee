<?php

namespace Taha\AndroidAlarms;

/**
 * PHP entrypoint for the system-Clock alarm bridge. Each method calls a Kotlin
 * BridgeFunction that fires an AlarmClock intent into the device's Clock app.
 *
 * Off-device (web, or any host without the native bridge) every call returns
 * null, so callers must treat null as "not available here" and guard their UX.
 */
class Alarm
{
    /**
     * Does the device have a Clock app that can handle ACTION_SET_ALARM?
     * Call this before scheduling; if false, tell the user to install one.
     */
    public function isClockAppAvailable(): bool
    {
        $result = $this->call('Alarm.IsClockAppAvailable', []);

        return (bool) ($result['available'] ?? false);
    }

    /**
     * The primary call. Create the user's whole weekly schedule as the minimum
     * number of alarms: slots sharing an identical time become ONE alarm that
     * recurs on each of those weekdays (via EXTRA_DAYS).
     *
     * @param  array<int, array{id?:mixed, dayOfWeek:int|string, hour:int, minute:int, label?:string, sessionUuid?:mixed}>  $slots
     * @return array|null  { available, slots, groups, intentsFired }
     */
    public function setWeeklySchedule(array $slots, ?string $appName = null, bool $vibrate = true): ?array
    {
        return $this->call('Alarm.SetWeeklySchedule', [
            'appName' => $appName ?: (string) config('app.name', 'Reminder'),
            'slots' => array_values($slots),
            'vibrate' => $vibrate,
        ]);
    }

    /**
     * Fire a single alarm (useful for "remind me for just this session").
     *
     * @param  array<int, int|string>  $days  weekdays (0..6 or MON..SUN); empty = one-off
     * @return array|null  { available, intentsFired }
     */
    public function setSingleAlarm(int $hour, int $minute, array $days = [], string $label = '', bool $vibrate = true): ?array
    {
        return $this->call('Alarm.SetSingleAlarm', [
            'hour' => $hour,
            'minute' => $minute,
            'days' => array_values($days),
            'label' => $label,
            'vibrate' => $vibrate,
        ]);
    }

    /**
     * Open the Clock app's alarms list (ACTION_SHOW_ALARMS) so the user can
     * review/edit/delete alarms - this is how reschedule cleanup happens, since
     * the AlarmClock API cannot delete a previously-created alarm.
     *
     * @return array|null  { opened }
     */
    public function openAlarmsList(): ?array
    {
        return $this->call('Alarm.OpenAlarmsList', []);
    }

    /**
     * Invoke a native bridge function. Returns the decoded success data map, or
     * null when the bridge is unavailable (off-device) or the call errored.
     */
    private function call(string $method, array $payload): ?array
    {
        if (! function_exists('nativephp_call')) {
            return null;
        }

        $raw = nativephp_call($method, json_encode((object) $payload));
        if (! $raw) {
            return null;
        }

        $decoded = json_decode($raw, true);
        if (! is_array($decoded)) {
            return null;
        }

        // BridgeResponse.success returns the data map directly; an error response
        // is { status: "error", code, message, ... }.
        if (($decoded['status'] ?? null) === 'error') {
            return null;
        }

        // Tolerate a legacy { data: {...} } envelope just in case.
        return $decoded['data'] ?? $decoded;
    }
}
