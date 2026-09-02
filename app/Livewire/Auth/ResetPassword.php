<?php

namespace App\Livewire\Auth;

use App\Models\EmailCode;
use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Locked;
use Livewire\Component;

/**
 * Admin password recovery, second step: the emailed code plus a new password.
 *
 * Members never come through here - they reset through the API from the app -
 * so the account is re-checked for is_admin below rather than trusted to be
 * one because it reached this screen.
 */
#[Layout('components.layouts.plain')]
class ResetPassword extends Component
{
    /**
     * Whose reset this is. Locked and re-read from the session in submit():
     * it is public state, and a public property is writable by whoever holds
     * the page - which would have made this form "set any account's password
     * given a code emailed to a different one".
     */
    #[Locked]
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
            'code' => 'required|digits:6',
            'password' => 'required|string|min:6|regex:/[0-9]/',
        ], [
            'code.required'     => 'Enter the code from your email.',
            'code.digits'       => 'The code should be 6 digits.',
            'password.required' => 'Password is required.',
            'password.min'      => 'Password must be at least 6 characters and include a number.',
            'password.regex'    => 'Password must be at least 6 characters and include a number.',
        ]);

        // The session, not the property: the address is decided by the step
        // that sent the code, and nothing on this page may change it.
        $email = strtolower((string) session('reset_email', ''));
        $this->email = $email;

        if ($email === '') {
            return $this->redirectRoute('admin.password.forgot', navigate: true);
        }

        if (! EmailCode::verify($email, $this->code, 'reset')) {
            $this->addError('code', 'That code is invalid or has expired.');

            return null;
        }

        $user = User::where('email', $email)->first();

        // One message for both cases. "No account" and "not an admin" are the
        // same answer here; telling them apart is an account oracle.
        if (! $user || ! $user->is_admin) {
            $this->addError('code', 'That code is invalid or has expired.');

            return null;
        }

        $user->update([
            'password' => Hash::make($this->password),
            'email_verified_at' => $user->email_verified_at ?? now(),
            // A reset is account recovery: kill every previously issued app
            // token. Devices re-issue at their next sign-in.
            'api_token' => null,
        ]);

        Auth::login($user, true);
        session()->regenerate();
        session()->forget('reset_email');

        return $this->redirectRoute('admin.dashboard', navigate: true);
    }

    public function render()
    {
        return view('livewire.auth.reset-password');
    }
}
