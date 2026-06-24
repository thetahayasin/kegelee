<?php

namespace App\Livewire\App;

use App\Models\OnboardingSlide;
use App\Services\SettingsService;
use Illuminate\Support\Collection;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Url;
use Livewire\Component;

#[Layout('components.layouts.app')]
class Onboarding extends Component
{
    #[Url]
    public ?string $auth_prompt = null;

    #[Url]
    public ?string $auth_mode = null;

    public int $index = 0;
    public bool $showAuthModal = false;
    public string $authMode = 'login'; // 'login', 'register'
    public bool $wasAutoOpened = false;

    public string $name = '';
    public string $email = '';
    public string $password = '';
    public bool $remember = true;

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

        if ($this->auth_prompt === '1') {
            $this->showAuthModal = true;
            $this->index = max(0, $this->slides->count() - 1);
            if (in_array($this->auth_mode, ['login', 'register'])) {
                $this->authMode = $this->auth_mode;
            }
        }
    }

    public function getSlidesProperty(): Collection
    {
        return OnboardingSlide::where('is_active', true)->orderBy('sort_order')->get();
    }

    public function getGoogleEnabledProperty(): bool
    {
        return (bool) app(SettingsService::class)->get('google_login_enabled');
    }

    public function getIsAllLessonsCompletedProperty(): bool
    {
        $activeCount = \App\Models\KnowledgeLesson::where('is_active', true)->count();
        if ($activeCount === 0) {
            return false;
        }

        if (auth()->check()) {
            $completedCount = auth()->user()->completedLessons()->wherePivotNotNull('completed_at')->count();
        } else {
            $completedCount = count(session('completed_lessons', []));
        }

        return $completedCount >= $activeCount;
    }

    public function showLogin(): void
    {
        $this->resetValidation();
        $this->authMode = 'login';
        $this->showAuthModal = true;
        $this->wasAutoOpened = false;
    }

    public function showRegister(): void
    {
        $this->resetValidation();
        $this->authMode = 'register';
        $this->showAuthModal = true;
        $this->wasAutoOpened = false;
    }

    public function showOptions(): void
    {
        $this->resetValidation();
        $this->authMode = 'options';
    }

    public function login()
    {
        $this->validate([
            'email' => 'required|email',
            'password' => 'required',
        ]);

        $user = \App\Models\User::where('email', strtolower($this->email))->first();

        if (! $user || ! $user->password || ! \Illuminate\Support\Facades\Hash::check($this->password, $user->password)) {
            $this->addError('email', 'These credentials do not match our records.');
            return;
        }

        // Unverified accounts must confirm the emailed code first.
        if (! $user->email_verified_at) {
            \App\Services\CodeSender::send($user->email, 'verify');
            session(['verify_email' => $user->email]);
            return $this->redirectRoute('verify', navigate: true);
        }

        \Illuminate\Support\Facades\Auth::login($user, $this->remember);
        session()->regenerate();

        return $this->redirectRoute('home', navigate: true);
    }

    public function register()
    {
        $this->validate([
            'name' => 'required|string|max:120',
            'email' => 'required|email|max:190|unique:users,email',
            'password' => 'required|string|min:8',
        ]);

        $user = \App\Models\User::create([
            'name' => trim($this->name),
            'email' => strtolower($this->email),
            'password' => \Illuminate\Support\Facades\Hash::make($this->password),
            'level_id' => \App\Models\Level::where('is_active', true)->orderBy('number')->value('id'),
        ]);

        \App\Services\CodeSender::send($user->email, 'verify');
        session(['verify_email' => $user->email]);

        return $this->redirectRoute('verify', navigate: true);
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

        // Guests finish by opening the auth modal
        $this->showAuthModal = true;
        $this->authMode = 'login';
        $this->wasAutoOpened = true;
    }

    public function closeAuthModal(): void
    {
        if ($this->isAllLessonsCompleted) {
            return;
        }

        $this->showAuthModal = false;

        if ($this->wasAutoOpened) {
            $this->redirectRoute('knowledge.index', navigate: true);
        }
    }

    public function render()
    {
        return view('livewire.app.onboarding');
    }
}
