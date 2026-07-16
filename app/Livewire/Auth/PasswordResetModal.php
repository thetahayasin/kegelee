<?php

namespace App\Livewire\Auth;

use App\Models\EmailCode;
use App\Models\User;
use App\Services\CodeSender;
use App\Services\RemoteAuth;
use App\Services\Sync\BackendClient;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Livewire\Attributes\On;
use Livewire\Component;

/**
 * Self-contained "reset password" modal. Opened from any login surface via the
 * `open-reset-modal` event, it runs the whole email-code flow inline instead of
 * on the old full-page /forgot-password + /reset-password screens.
 *
 * Online only: on the device it goes through the backend (which owns accounts
 * and sends the email); on the backend website it runs locally.
 */
class PasswordResetModal extends Component
{
    public bool $show = false;

    /** 'request' (email) → 'reset' (code + new password). */
    public string $step = 'request';

    public string $email = '';
    public string $code = '';
    public string $password = '';

    #[On('open-reset-modal')]
    public function open(string $email = ''): void
    {
        $this->reset(['code', 'password']);
        $this->resetValidation();
        $this->step = 'request';
        $this->email = $email ?: $this->email;
        $this->show = true;
    }

    public function close(): void
    {
        $this->show = false;
        $this->reset(['step', 'code', 'password']);
        $this->resetValidation();
    }

    public function sendCode(): void
    {
        $this->validate(['email' => 'required|email|max:190']);
        $email = strtolower($this->email);

        $key = 'reset:'.$email;
        if (RateLimiter::tooManyAttempts($key, 3)) {
            $this->addError('email', 'Too many attempts. Try again in '.RateLimiter::availableIn($key).' seconds.');
            return;
        }
        RateLimiter::hit($key, 900);

        // On the device the backend issues + emails the code; on the backend it
        // sends directly. Only send when the account exists (no enumeration),
        // but always advance so the presence of an account isn't revealed.
        if (BackendClient::isClient()) {
            try {
                BackendClient::request()->post(BackendClient::base().'/v1/auth/reset-code', ['email' => $email]);
            } catch (\Throwable $e) {
                $this->addError('email', 'No internet connection. Connect to the internet and try again.');
                return;
            }
        } elseif (User::where('email', $email)->exists()) {
            CodeSender::send($email, 'reset');
        }

        $this->resetErrorBag();
        $this->step = 'reset';
    }

    public function submit()
    {
        $this->validate([
            'email' => 'required|email|max:190',
            'code' => 'required|digits:6',
            'password' => 'required|string|min:6|regex:/[0-9]/',
        ], [
            'code.required' => 'Enter the code from your email.',
            'code.digits' => 'The code should be 6 digits.',
            'password.min' => 'Password must be at least 6 characters and include a number.',
            'password.regex' => 'Password must be at least 6 characters and include a number.',
        ]);

        $email = strtolower($this->email);

        if (BackendClient::isClient()) {
            try {
                $response = BackendClient::request()->post(BackendClient::base().'/v1/auth/reset', [
                    'email' => $email,
                    'code' => $this->code,
                    'password' => $this->password,
                ]);
            } catch (\Throwable $e) {
                $this->addError('code', 'No internet connection. Connect to the internet and try again.');
                return;
            }

            if ($response->status() === 422) {
                $this->addError('code', 'That code is invalid or has expired.');
                return;
            }
            if (! $response->successful() || ! $response->json('user')) {
                $this->addError('code', 'Could not reset your password right now. Please try again.');
                return;
            }

            $user = RemoteAuth::mirror($response->json('user'));
        } else {
            if (! EmailCode::verify($email, $this->code, 'reset')) {
                $this->addError('code', 'That code is invalid or has expired.');
                return;
            }

            $user = User::where('email', $email)->first();
            if (! $user) {
                $this->addError('email', 'No account found for that email.');
                return;
            }

            $user->update([
                'password' => Hash::make($this->password),
                'email_verified_at' => $user->email_verified_at ?? now(),
                // A reset is account recovery: kill every previously issued
                // app token. Devices get a fresh one at their next sign-in.
                'api_token' => null,
            ]);
        }

        Auth::login($user, true);
        session()->regenerate();

        RemoteAuth::syncAfterLogin($user);

        return $this->redirectRoute($user->is_admin ? 'admin.dashboard' : 'home', navigate: true);
    }

    public function render()
    {
        return view('livewire.auth.password-reset-modal');
    }
}
