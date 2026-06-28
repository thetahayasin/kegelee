<?php

use Taha\AndroidAlarms\Alarm;

it('has a valid nativephp.json manifest', function () {
    $manifest = json_decode(file_get_contents($this->pluginPath.'/nativephp.json'), true);

    expect($manifest)->toBeArray()
        ->and($manifest['namespace'])->toBe('Alarm')
        ->and($manifest['platforms'])->toBe(['android'])
        ->and($manifest['android']['permissions'])->toBe(['com.android.alarm.permission.SET_ALARM']);

    $names = array_column($manifest['bridge_functions'], 'name');
    expect($names)->toContain('Alarm.SetWeeklySchedule', 'Alarm.IsClockAppAvailable', 'Alarm.OpenAlarmsList', 'Alarm.SetSingleAlarm');
});

it('declares no alarm-engine machinery (no receivers/services/boot/notifications)', function () {
    $manifest = json_decode(file_get_contents($this->pluginPath.'/nativephp.json'), true);

    expect($manifest['android']['receivers'])->toBe([])
        ->and($manifest['android']['services'])->toBe([]);

    $perms = $manifest['android']['permissions'];
    expect($perms)->not->toContain('android.permission.RECEIVE_BOOT_COMPLETED')
        ->and($perms)->not->toContain('android.permission.POST_NOTIFICATIONS')
        ->and($perms)->not->toContain('android.permission.SCHEDULE_EXACT_ALARM');
});

it('fires AlarmClock.ACTION_SET_ALARM (not Google Calendar) from the Kotlin bridge', function () {
    $kotlin = file_get_contents($this->pluginPath.'/resources/android/AlarmFunctions.kt');

    expect($kotlin)->toContain('AlarmClock.ACTION_SET_ALARM')
        ->toContain('AlarmClock.EXTRA_DAYS')          // grouped multi-weekday recurrence
        ->toContain('AlarmClock.EXTRA_SKIP_UI')
        ->toContain('AlarmClock.ACTION_SHOW_ALARMS')   // openAlarmsList
        ->not->toContain('AlarmManager')
        ->not->toContain('BroadcastReceiver')
        ->not->toContain('BOOT_COMPLETED')
        ->not->toContain('calendar.google.com');
});

it('does NOT ship a hand-written bridge registration (build tool generates it)', function () {
    $kotlinFiles = glob($this->pluginPath.'/resources/android/*.kt');
    foreach ($kotlinFiles as $file) {
        expect(basename($file))->not->toContain('BridgeRegistration')
            ->and(basename($file))->not->toContain('BridgeFunctionRegistration');
    }
});

it('returns null off-device (no native bridge present)', function () {
    // function_exists('nativephp_call') is false in this test runtime.
    $alarm = new Alarm();

    expect($alarm->isClockAppAvailable())->toBeFalse()
        ->and($alarm->setWeeklySchedule([]))->toBeNull()
        ->and($alarm->openAlarmsList())->toBeNull();
});
