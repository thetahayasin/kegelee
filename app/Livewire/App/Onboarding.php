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
            $result = $this->authenticateRemotely(strtolower($this->email), $this->password);

            if (! empty($result['user'])) {
                $remoteUser = $result['user'];
                $attributes = [
                    'name' => $remoteUser['name'],
                    'email_verified_at' => $remoteUser['email_verified_at'] ? now()->parse($remoteUser['email_verified_at']) : null,
                    'password' => $remoteUser['password_hash'],
                    'is_admin' => (bool)$remoteUser['is_admin'],
                    'level_id' => $remoteUser['level_id'],
                    'level_started_days' => (int)$remoteUser['level_started_days'],
                    'onboarded_at' => $remoteUser['onboarded_at'] ? now()->parse($remoteUser['onboarded_at']) : null,
                    'timezone' => $remoteUser['timezone'],
                ];
                if (! \App\Models\User::where('email', strtolower($remoteUser['email']))->exists()) {
                    $attributes['id'] = $remoteUser['id'];
                }
                $user = \App\Models\User::updateOrCreate(['email' => strtolower($remoteUser['email'])], $attributes);
            } else {
                \Illuminate\Support\Facades\RateLimiter::hit($key, 300);
                if (($result['reason'] ?? '') === 'invalid') {
                    $this->addError('email', 'Email or password is incorrect.');
                } else {
                    $this->addError('email', 'Could not reach the server. Check your internet connection and try again.');
                }
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
        if (\App\Services\Sync\BackendClient::isClient()) {
            try {
                app(\App\Services\Sync\ContentSyncService::class)->pull();
                $userSync = app(\App\Services\Sync\UserSyncService::class);
                $userSync->push($user);
                $userSync->pull($user);
            } catch (\Throwable $e) {
                // Best-effort.
            }
        }

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
            'password' => 'required|string|min:6|confirmed',
        ], [
            'name.required'      => 'Name is required.',
            'email.required'     => 'Email is required.',
            'email.email'        => 'Enter a valid email address.',
            'password.required'  => 'Password is required.',
            'password.min'       => 'Password must be at least 6 characters.',
            'password.confirmed' => "Passwords don't match.",
        ]);

        if (\App\Services\Sync\BackendClient::isClient()) {
            $remoteUser = $this->registerRemotely();
            if (is_array($remoteUser) && isset($remoteUser['error'])) {
                $this->addError('email', $remoteUser['error']);
                return;
            }

            if (! $remoteUser) {
                $this->addError('email', 'Could not reach the server. Check your internet connection and try again.');
                return;
            }

            \Illuminate\Support\Facades\RateLimiter::hit($key, 900);

            $user = \App\Models\User::updateOrCreate(
                ['email' => strtolower($remoteUser['email'])],
                [
                    'id' => $remoteUser['id'],
                    'name' => $remoteUser['name'],
                    'email_verified_at' => $remoteUser['email_verified_at'] ? now()->parse($remoteUser['email_verified_at']) : null,
                    'password' => $remoteUser['password_hash'],
                    'is_admin' => (bool)$remoteUser['is_admin'],
                    'level_id' => $remoteUser['level_id'],
                    'level_started_days' => (int)$remoteUser['level_started_days'],
                    'onboarded_at' => $remoteUser['onboarded_at'] ? now()->parse($remoteUser['onboarded_at']) : null,
                    'timezone' => $remoteUser['timezone'],
                ]
            );
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

    /**
     * @return array{user?: array<string,mixed>, reason?: string}
     */
    private function authenticateRemotely(string $email, string $password): array
    {
        if (! \App\Services\Sync\BackendClient::isClient()) {
            return ['reason' => 'offline'];
        }

        try {
            $response = \App\Services\Sync\BackendClient::request()
                ->post(\App\Services\Sync\BackendClient::base().'/v1/auth/login', [
                    'email' => $email,
                    'password' => $password,
                ]);

            if ($response->successful()) {
                return ['user' => $response->json('user')];
            }

            if (in_array($response->status(), [401, 422], true)) {
                if ($response->json('error') === 'Invalid API key.') {
                    return ['reason' => 'unreachable'];
                }
                return ['reason' => 'invalid'];
            }

            return ['reason' => 'unreachable'];
        } catch (\Throwable $e) {
            return ['reason' => 'unreachable'];
        }
    }

    private function registerRemotely(): ?array
    {
        if (! \App\Services\Sync\BackendClient::isClient()) {
            return null;
        }

        try {
            $response = \App\Services\Sync\BackendClient::request()
                ->post(\App\Services\Sync\BackendClient::base().'/v1/auth/register', [
                    'name' => trim($this->name),
                    'email' => strtolower($this->email),
                    'password' => $this->password,
                    'password_confirmation' => $this->password_confirmation,
                ]);

            if ($response->successful()) {
                return $response->json('user');
            } elseif ($response->status() === 422) {
                $errors = $response->json('errors.email');
                $message = $errors ? $errors[0] : $response->json('message');
                return ['error' => $message ?: 'Validation failed.'];
            } elseif ($response->status() === 401 && $response->json('error') === 'Invalid API key.') {
                return ['error' => 'API configuration error. Please check sync settings.'];
            }
            return ['error' => 'Could not register on remote server. Status code: ' . $response->status()];
        } catch (\Exception $e) {
            return ['error' => 'Could not reach the server. Check your internet connection and try again.'];
        }
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
