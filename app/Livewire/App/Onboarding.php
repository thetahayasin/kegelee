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
        if (! $settings->get('onboarding_enabled') || auth()->user()->onboarded_at) {
            return $this->redirectRoute('home', navigate: true);
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
        auth()->user()->update(['onboarded_at' => now()]);

        return $this->redirectRoute('home', navigate: true);
    }

    public function render()
    {
        return view('livewire.app.onboarding');
    }
}
