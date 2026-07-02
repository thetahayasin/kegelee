<?php

namespace App\Livewire\App;

use App\Models\Exercise;
use App\Models\Level;
use App\Services\ProgressionService;
use App\Services\SettingsService;
use App\Models\WorkoutSession;
use Livewire\Attributes\Layout;
use Livewire\Component;

#[Layout('components.layouts.app')]
class Home extends Component
{
    public function mount(SettingsService $settings)
    {
        if ($settings->get('onboarding_enabled') && ! auth()->user()->onboarded_at) {
            return $this->redirectRoute('onboarding', navigate: true);
        }
    }

    public function syncPending(array $sessions, ProgressionService $progression): void
    {
        $user = auth()->user();
        foreach ($sessions as $s) {
            $ts = (int) ($s['ts'] ?? 0);
            $secs = max(0, (int) ($s['seconds'] ?? 0));
            if ($secs < 10) continue;
            $at = $ts > 0 ? \Carbon\Carbon::createFromTimestampMs($ts) : now();
            $exists = WorkoutSession::where('user_id', $user->id)
                ->where('completed_at', '>=', $at->copy()->subSeconds(5))
                ->where('completed_at', '<=', $at->copy()->addSeconds(5))
                ->exists();
            if (! $exists) {
                $progression->recordSession($user, null, $secs);
            }
        }
    }

    public function render(ProgressionService $progression, SettingsService $settings)
    {
        $user = auth()->user();
        $position = $progression->position($user);
        $today = $progression->todayProgress($user);

        $level = $user->level ?? Level::where('is_active', true)->orderBy('number')->first();
        $sessionSeconds = (float) ($level?->total_session_seconds ?: 90);

        // "1.5 min" for level 1, whole minutes everywhere else.
        $minutes = $sessionSeconds / 60;
        $sessionLength = (fmod($minutes, 1.0) > 0.01 ? number_format($minutes, 1) : (string) (int) round($minutes)).' min';

        $exercises = Exercise::where('is_active', true)
            ->orderBy('sort_order')
            ->take(8)
            ->get()
            ->map(fn (Exercise $e) => [
                'model' => $e,
                'unlocked' => $progression->isExerciseUnlocked($user, $e),
                'days_left' => $progression->daysUntilUnlock($user, $e),
            ]);

        return view('livewire.app.home', [
            'user' => $user,
            'position' => $position,
            'today' => $today,
            'sessionLength' => $sessionLength,
            'exercises' => $exercises,
            'bestMeasurement' => $user->measurements()->max('seconds'),
            'heroImage' => $settings->get('home_hero_image')
                ? \Illuminate\Support\Facades\Storage::url($settings->get('home_hero_image'))
                : null,
        ]);
    }
}
