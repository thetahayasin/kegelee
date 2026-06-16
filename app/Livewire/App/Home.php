<?php

namespace App\Livewire\App;

use App\Models\Exercise;
use App\Models\Level;
use App\Services\ProgressionService;
use App\Services\SettingsService;
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

    public function render(ProgressionService $progression)
    {
        $user = auth()->user();
        $position = $progression->position($user);
        $today = $progression->todayProgress($user);

        $level = $user->level ?? Level::where('is_active', true)->orderBy('number')->first();
        $sessionSeconds = (float) ($level?->total_session_seconds ?: 300);

        $exercises = Exercise::where('is_active', true)
            ->orderBy('sort_order')
            ->take(8)
            ->get()
            ->map(fn (Exercise $e) => [
                'model' => $e,
                'unlocked' => $progression->isExerciseUnlocked($user, $e),
                'days_left' => $progression->daysUntilUnlock($user, $e),
            ]);

        $nextUnlock = $progression->nextUnlock($user);

        return view('livewire.app.home', [
            'user' => $user,
            'position' => $position,
            'today' => $today,
            'sessionMinutes' => max(1, (int) round($sessionSeconds / 60)),
            'exercises' => $exercises,
            'nextUnlock' => $nextUnlock,
            'bestMeasurement' => $user->measurements()->max('seconds'),
        ]);
    }
}
