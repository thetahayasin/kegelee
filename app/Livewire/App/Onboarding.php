<?php

namespace App\Livewire\App;

use App\Models\OnboardingSlide;
use App\Services\SettingsService;
use Illuminate\Support\Collection;
use Livewire\Attributes\Layout;
use Livewire\Component;

#[Layout('components.layouts.app')]
class Onboarding extends Component
{
    public int $index = 0;

    public function mount(SettingsService $settings)
    {
        $user = auth()->user();

        if ($user) {
            // A logged-in user who's already onboarded skips straight to home.
            if ($user->onboarded_at || ! $settings->get('onboarding_enabled')) {
                return $this->redirectRoute('home', navigate: true);
            }
        } elseif (! $settings->get('onboarding_enabled')) {
            return $this->redirectRoute('register', navigate: true);
        }
    }

    public function getSlidesProperty(): Collection
    {
        return OnboardingSlide::where('is_active', true)->orderBy('sort_order')->get();
    }

    public function next(): void
    {
        if ($this->index >= $this->slides->count() - 1) {
            $this->finish();
            return;
        }
        $this->index++;
    }

    public function back(): void
    {
        $this->index = max(0, $this->index - 1);
    }

    public function skip(): void
    {
        $this->finish();
    }

    public function finish()
    {
        $user = auth()->user();

        if ($user) {
            $user->update(['onboarded_at' => now()]);
            return $this->redirectRoute('home', navigate: true);
        }

        // Guests finish the intro by creating an account.
        return $this->redirectRoute('register', navigate: true);
    }

    public function render()
    {
        return view('livewire.app.onboarding');
    }
}
