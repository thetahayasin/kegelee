<?php

namespace App\Livewire\App;

use App\Livewire\Concerns\HandlesGoogleAuth;
use App\Services\SettingsService;
use Illuminate\Support\Collection;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Url;
use Livewire\Component;

#[Layout('components.layouts.app')]
class Onboarding extends Component
{
    use HandlesGoogleAuth;

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
    public string $password_confirmation = '';
    public bool $remember = true;

    public function mount(SettingsService $settings)
    {
        $user = auth()->user();

        if ($user) {
            // A logged-in user who's already onboarded skips straight to home.
            if ($user->onboarded_at || ! $settings->get('onboarding_enabled')) {
                return $this->redirectRoute('home', navigate: true);
            }
        }

        // Open the auth modal when prompted (after the free lessons, a login /
        // register link, or logout) — and ALSO when onboarding is disabled, so a
        // guest sees the sign-in options. We must NOT redirect a guest to
        // /register here: that route redirects straight back to /welcome and the
        // two bounce forever, which renders as a blank screen.
        $prompted = $this->auth_prompt === '1';
        $onboardingOff = ! $settings->get('onboarding_enabled');

        if (! $user && ($prompted || $onboardingOff)) {
            $this->showAuthModal = true;
            $this->index = max(0, $this->slides->count() - 1);
            $this->authMode = in_array($this->auth_mode, ['login', 'register', 'options'], true)
                ? $this->auth_mode
                : ($onboardingOff ? 'options' : 'login');
            $this->wasAutoOpened = true;
        }
    }

    public function getSlidesProperty(): Collection
    {
        return collect(\App\Support\OnboardingSlides::all());
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
        $key = 'login:'.strtolower($this->email).':'.request()->ip();
        if (\Illuminate\Support\Facades\RateLimiter::tooManyAttempts($key, 5)) {
            $seconds = \Illuminate\Support\Facades\RateLimiter::availableIn($key);
            $this->addError('email', "Too many attempts. Try again in {$seconds} seconds.");
            return;
        }

        $this->validate([
            'email' => 'required|email|max:190',
            'password' => 'required|string|max:255',
        ]);

        $user = null;

        if (\App\Services\Sync\BackendClient::isClient()) {
            $result = \App\Services\RemoteAuth::login(strtolower($this->email), $this->password);

            if (! empty($result['user'])) {
                $user = \App\Services\RemoteAuth::mirror($result['user']);
            } else {
                \Illuminate\Support\Facades\RateLimiter::hit($key, 300);
                $this->addError('email', match ($result['reason'] ?? '') {
                    'invalid' => 'Email or password is incorrect.',
                    'server' => 'The server hit a problem. Please try again in a moment.',
                    default => 'Could not reach the server. Check your internet connection and try again.',
                });
                return;
            }
        } else {
            $user = \App\Models\User::where('email', strtolower($this->email))->first();
            if (! $user || ! $user->password || ! \Illuminate\Support\Facades\Hash::check($this->password, $user->password)) {
                \Illuminate\Support\Facades\RateLimiter::hit($key, 300);
                $this->addError('email', 'Email or password is incorrect.');
                return;
            }
        }

        \Illuminate\Support\Facades\RateLimiter::clear($key);

        // Unverified accounts must confirm the emailed code first.
        if (! $user->email_verified_at) {
            \App\Services\CodeSender::send($user->email, 'verify');
            session(['verify_email' => $user->email]);
            return $this->redirectRoute('verify', navigate: true);
        }

        \Illuminate\Support\Facades\Auth::login($user, $this->remember);
        session()->regenerate();

        // Sync immediately so the home page has fresh data from the start.
        \App\Services\RemoteAuth::syncAfterLogin($user);

        return $this->redirectRoute('home', navigate: true);
    }

    public function register()
    {
        $key = 'register:'.request()->ip();
        if (\Illuminate\Support\Facades\RateLimiter::tooManyAttempts($key, 5)) {
            $seconds = \Illuminate\Support\Facades\RateLimiter::availableIn($key);
            $this->addError('email', "Too many attempts. Try again in {$seconds} seconds.");
            return;
        }

        $this->validate([
            'name'     => 'required|string|max:120',
            'email'    => 'required|email|max:190',
            'password' => 'required|string|min:6|regex:/[0-9]/|confirmed',
        ], [
            'name.required'      => 'Name is required.',
            'email.required'     => 'Email is required.',
            'email.email'        => 'Enter a valid email address.',
            'password.required'  => 'Password is required.',
            'password.min'       => 'Password must be at least 6 characters and include a number.',
            'password.regex'     => 'Password must be at least 6 characters and include a number.',
            'password.confirmed' => "Passwords don't match.",
        ]);

        if (\App\Services\Sync\BackendClient::isClient()) {
            $result = \App\Services\RemoteAuth::register(trim($this->name), strtolower($this->email), $this->password);

            if (empty($result['user'])) {
                $this->addError('email', $result['error'] ?? 'Could not reach the server. Check your internet connection and try again.');
                return;
            }

            \Illuminate\Support\Facades\RateLimiter::hit($key, 900);

            $user = \App\Services\RemoteAuth::mirror($result['user']);
        } else {
            // Check local unique constraint
            $this->validate([
                'email' => 'unique:users,email',
            ], [
                'email.unique' => 'This email is already registered.',
            ]);

            \Illuminate\Support\Facades\RateLimiter::hit($key, 900);

            $user = \App\Models\User::create([
                'name' => trim($this->name),
                'email' => strtolower($this->email),
                'password' => \Illuminate\Support\Facades\Hash::make($this->password),
                'level_id' => \App\Models\Level::where('is_active', true)->orderBy('number')->value('id'),
            ]);

            \App\Services\CodeSender::send($user->email, 'verify');
        }

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

            if ($user->isSubscribed()) {
                return $this->redirectRoute('home', navigate: true);
            }
        }

        // Guests and unsubscribed users end on the Google Play plans. The sheet
        // handles inline register/login + purchase; dismissing it drops them to
        // the free basics preview (closeTo). Pass a RELATIVE path so Livewire's
        // navigate follows it (a full URL is treated as external and ignored).
        $this->dispatch('open-subscribe-sheet', closeTo: route('knowledge.index', absolute: false));
    }

    public function closeAuthModal(): void
    {
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
