<?php

namespace App\Livewire\App;

use App\Models\Reminder;
use App\Services\IcsBuilder;
use App\Services\SettingsService;
use Livewire\Attributes\Layout;
use Livewire\Component;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Taha\AndroidAlarms\Facades\Alarm;

#[Layout('components.layouts.app')]
class Reminders extends Component
{
    /** Selected weekdays (ints 0-6, 0 = Monday) — shared across all times. */
    public array $selectedDays = [];

    /** Session times (HH:MM). Every time fires on every selected day. */
    public array $times = ['08:00'];

    public bool $saved = false;

    /** Status line shown under the action button after scheduling/saving. */
    public ?string $alarmMessage = null;

    /** One-time consent sheet before we touch the device Clock app. */
    public bool $showConsent = false;

    public bool $hasConsent = false;

    /** True after a reschedule — old alarms can't be auto-deleted via the Clock API. */
    public bool $isReschedule = false;

    public function mount(SettingsService $settings): void
    {
        $rows = auth()->user()->reminders()->get();

        $this->selectedDays = $rows->where('is_enabled', true)->pluck('weekday')->map(fn ($w) => (int) $w)->values()->all();

        // Times are shared across days; take them from any enabled row, else any row.
        $source = $rows->firstWhere('is_enabled', true) ?? $rows->first();
        $this->times = ! empty($source?->times) ? array_values($source->times) : ['08:00'];

        $this->hasConsent = (bool) $settings->get('clock_alarm_consent');
    }

    /** Toggle a weekday in the shared selection. */
    public function toggleDay(int $day): void
    {
        if (in_array($day, $this->selectedDays, true)) {
            $this->selectedDays = array_values(array_diff($this->selectedDays, [$day]));
        } else {
            $this->selectedDays[] = $day;
            sort($this->selectedDays);
        }
        $this->saved = false;
    }

    public function addTime(): void
    {
        $this->times[] = '08:00';
        $this->saved = false;
    }

    public function removeTime(int $index): void
    {
        if (count($this->times) > 1) {
            array_splice($this->times, $index, 1);
            $this->times = array_values($this->times);
            $this->saved = false;
        }
    }

    public function save(): void
    {
        $this->validate([
            'times' => 'required|array|min:1',
            'times.*' => 'required|date_format:H:i',
            'selectedDays' => 'array',
            'selectedDays.*' => 'integer|between:0,6',
        ]);

        $user = auth()->user();

        // Persist as one row per weekday (the shared times apply to selected days).
        foreach (array_keys(Reminder::DAYS) as $weekday) {
            $user->reminders()->updateOrCreate(
                ['weekday' => $weekday],
                ['times' => $this->times, 'is_enabled' => in_array($weekday, $this->selectedDays, true)],
            );
        }

        $this->saved = true;
    }

    /**
     * The single primary action: persist the schedule, then add it to the
     * device's Clock app (real recurring alarms). Off-device or where no Clock
     * app exists, fall back to a calendar (.ics) download so it still works.
     */
    public function scheduleAlarms(IcsBuilder $builder): ?StreamedResponse
    {
        $this->save();
        $this->alarmMessage = null;
        $this->isReschedule = false;

        if (empty($this->selectedDays)) {
            $this->addError('selectedDays', 'Pick at least one day first.');
            return null;
        }

        // On a device with a Clock app → real alarms (after one-time consent).
        if ($this->onClockDevice()) {
            if (! $this->hasConsent) {
                $this->showConsent = true;
                return null;
            }
            $this->createAlarms();
            return null;
        }

        // Web / no Clock app → calendar event the OS can add.
        return $this->downloadIcs($builder);
    }

    public function grantConsent(SettingsService $settings): void
    {
        $settings->set('clock_alarm_consent', now()->toIso8601String());
        $settings->flush();

        $this->hasConsent = true;
        $this->showConsent = false;

        $this->createAlarms();
    }

    public function declineConsent(): void
    {
        $this->showConsent = false;
        $this->alarmMessage = 'No alarms were added. Your reminders are still saved.';
    }

    public function openClockAlarms(): void
    {
        if ($this->onClockDevice()) {
            Alarm::openAlarmsList();
        }
    }

    /** Hand the whole weekly schedule to the Clock app as the fewest alarms. */
    private function createAlarms(): void
    {
        $settings = app(SettingsService::class);
        $appName = (string) $settings->get('app_name', config('app.name', 'Reminder'));

        $alreadyScheduled = (bool) $settings->get('clock_alarms_set_at');

        $result = Alarm::setWeeklySchedule($this->buildSlots(), $appName);

        $fired = (int) ($result['intentsFired'] ?? 0);
        $settings->set('clock_alarms_set_at', now()->toIso8601String());
        $settings->flush();

        $this->isReschedule = $alreadyScheduled;
        $this->alarmMessage = $fired > 0
            ? "Added {$fired} alarm".($fired === 1 ? '' : 's').' to your Clock app.'
            : 'Could not add alarms to your Clock app.';
    }

    /**
     * Cross-product the selected days with the times into alarm slots. The
     * native side groups slots that share a time into one recurring alarm.
     *
     * @return list<array{id:string, dayOfWeek:int, hour:int, minute:int, label:string, sessionUuid:null}>
     */
    private function buildSlots(): array
    {
        $slots = [];

        foreach ($this->selectedDays as $weekday) {
            foreach ($this->times as $time) {
                if (! preg_match('/^\d{1,2}:\d{2}$/', (string) $time)) {
                    continue;
                }
                [$hour, $minute] = array_map('intval', explode(':', $time));
                $slots[] = [
                    'id' => $weekday.'-'.$time,
                    'dayOfWeek' => (int) $weekday, // 0 = Monday .. 6 = Sunday (matches Reminder::DAYS)
                    'hour' => $hour,
                    'minute' => $minute,
                    'label' => 'Session',
                    'sessionUuid' => null,
                ];
            }
        }

        return $slots;
    }

    private function downloadIcs(IcsBuilder $builder): StreamedResponse
    {
        $this->alarmMessage = 'Saved. Opening your calendar to add these reminders.';
        $ics = $builder->forUser(auth()->user());

        return response()->streamDownload(
            fn () => print($ics),
            'reminders.ics',
            ['Content-Type' => 'text/calendar; charset=utf-8'],
        );
    }

    /** Real device with a Clock app — uses the runtime bridge, never cached config. */
    private function onClockDevice(): bool
    {
        return function_exists('nativephp_call') && Alarm::isClockAppAvailable();
    }

    public function render()
    {
        return view('livewire.app.reminders', [
            'dayLabels' => Reminder::SHORT,
            'appName' => app(SettingsService::class)->get('app_name', config('app.name')),
        ]);
    }
}
