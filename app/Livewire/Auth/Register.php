<?php

namespace App\Livewire\Auth;

use App\Livewire\Concerns\HandlesGoogleAuth;
use App\Models\Level;
use App\Models\User;
use App\Services\CodeSender;
use App\Services\SettingsService;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Livewire\Attributes\Layout;
use Livewire\Component;

#[Layout('components.layouts.app')]
class Register extends Component
{
    use HandlesGoogleAuth;

    public string $name = '';
    public string $email = '';
    public string $password = '';
    public string $password_confirmation = '';

    public function mount()
    {
        if (auth()->check()) {
            return $this->redirectRoute('home', navigate: true);
        }
        return $this->redirect('/welcome?auth_prompt=1&auth_mode=register', navigate: true);
    }

    public function register()
    {
        $key = 'register:'.request()->ip();
        if (RateLimiter::tooManyAttempts($key, 5)) {
            $seconds = RateLimiter::availableIn($key);
            $this->addError('email', "Too many attempts. Try again in {$seconds} seconds.");
            return;
        }

        $this->validate([
            'name' => 'required|string|max:120',
            'email' => 'required|email|max:190',
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

        // Attempt remote registration first if we have a remote server
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

            RateLimiter::hit($key, 900);

            $user = User::updateOrCreate(
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

            $user = User::create([
                'name' => trim($this->name),
                'email' => strtolower($this->email),
                'password' => Hash::make($this->password),
                'level_id' => Level::where('is_active', true)->orderBy('number')->value('id'),
            ]);

            CodeSender::send($user->email, 'verify');
        }

        session(['verify_email' => $user->email]);

        return $this->redirectRoute('verify', navigate: true);
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
                // Return validation error message
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

    public function render(SettingsService $settings)
    {
        return view('livewire.auth.register', [
            'googleEnabled' => (bool) $settings->get('google_login_enabled') && $settings->get('google_client_id'),
        ]);
    }
}
