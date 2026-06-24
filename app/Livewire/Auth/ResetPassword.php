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
            'password' => 'required|string|min:8',
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

        Auth::login($user, true);
        session()->regenerate();
        session()->forget('reset_email');

        return $this->redirectRoute('home', navigate: true);
    }

    public function render()
    {
        return view('livewire.auth.reset-password');
    }
}
