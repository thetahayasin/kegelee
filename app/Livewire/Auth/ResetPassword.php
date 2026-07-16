<?php

namespace App\Livewire\Auth;

use App\Models\EmailCode;
use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Livewire\Attributes\Layout;
use Livewire\Component;

#[Layout('components.layouts.app')]
class ResetPassword extends Component
{
    public string $email = '';
    public string $code = '';
    public string $password = '';

    public function mount(): void
    {
        $this->email = (string) session('reset_email', '');
    }

    public function submit()
    {
        $this->validate([
            'email' => 'required|email|max:190',
            'code' => 'required|digits:6',
            'password' => 'required|string|min:6|regex:/[0-9]/',
        ], [
            'email.required'    => 'Email is required.',
            'email.email'       => 'Enter a valid email address.',
            'code.required'     => 'Enter the code from your email.',
            'code.digits'       => 'The code should be 6 digits.',
            'password.required' => 'Password is required.',
            'password.min'      => 'Password must be at least 6 characters and include a number.',
            'password.regex'    => 'Password must be at least 6 characters and include a number.',
        ]);

        $email = strtolower($this->email);

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
        ]);

        // A reset is account recovery: kill every previously issued app token
        // (devices re-issue at next sign-in). Backend only - on a NativePHP
        // device this component updates the local MIRROR, whose stored token
        // must survive so the device can keep syncing.
        if (! \App\Services\Sync\BackendClient::isClient()) {
            $user->update(['api_token' => null]);
        }

        Auth::login($user, true);
        session()->regenerate();
        session()->forget('reset_email');

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

        // Admins recover straight into the backend; everyone else into the app.
        return $this->redirectRoute($user->is_admin ? 'admin.dashboard' : 'home', navigate: true);
    }

    public function render()
    {
        return view('livewire.auth.reset-password');
    }
}
