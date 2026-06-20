<?php

namespace App\Services;

use App\Models\Reminder;
use App\Models\User;
use Carbon\Carbon;

class IcsBuilder
{
    public function __construct(private SettingsService $settings) {}

    public function forUser(User $user): string
    {
        $reminders = $user->reminders()->where('is_enabled', true)->orderBy('weekday')->get();

        $appName = $this->settings->get('app_name', 'Kegel Trainer');
        $stamp = Carbon::now('UTC')->format('Ymd\THis\Z');

        $lines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//'.$this->escape($appName).'//Reminders//EN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'X-WR-CALNAME:'.$this->escape($appName).' Reminders',
        ];

        foreach ($reminders as $reminder) {
            foreach ($reminder->times as $j => $time) {
                $lines = array_merge($lines, $this->event($reminder, $j, $time, $appName, $stamp, $user->id));
            }
        }

        $lines[] = 'END:VCALENDAR';

        return implode("\r\n", $lines)."\r\n";
    }

    /** @return list<string> */
    private function event(Reminder $reminder, int $session, string $time, string $appName, string $stamp, int $userId): array
    {
        [$hour, $minute] = array_map('intval', explode(':', $time));

        $start = Carbon::now()
            ->next(Reminder::DAYS[$reminder->weekday])
            ->setTime($hour, $minute, 0);

        $uid = "reminder-{$userId}-{$reminder->weekday}-{$session}@".(parse_url(config('app.url'), PHP_URL_HOST) ?: 'kegel.app');
        $label = $appName.' - session '.($session + 1);

        return [
            'BEGIN:VEVENT',
            'UID:'.$uid,
            'DTSTAMP:'.$stamp,
            'DTSTART:'.$start->format('Ymd\THis'),
            'DURATION:PT15M',
            'RRULE:FREQ=WEEKLY;BYDAY='.$reminder->rruleDay(),
            'SUMMARY:'.$this->escape($label),
            'DESCRIPTION:'.$this->escape('Time for your pelvic floor training session.'),
            'BEGIN:VALARM',
            'ACTION:DISPLAY',
            'DESCRIPTION:'.$this->escape($label),
            'TRIGGER:PT0M',
            'END:VALARM',
            'END:VEVENT',
        ];
    }

    private function escape(string $value): string
    {
        return str_replace(
            ['\\', ',', ';', "\n"],
            ['\\\\', '\\,', '\\;', '\\n'],
            $value,
        );
    }
}
