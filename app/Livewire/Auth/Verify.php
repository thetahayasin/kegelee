<?php

namespace App\Livewire\Auth;

use App\Models\EmailCode;
use App\Models\User;
use App\Services\CodeSender;
use Illuminate\Support\Facades\Auth;
use Livewire\Attributes\Layout;
use Livewire\Component;

#[Layout('components.layouts.app')]
class Verify extends Component
{
    public string $email = '';
    public string $code = '';
    public bool $resent = false;

    public function mount()
    {
        $this->email = (string) session('verify_email', '');
        if (! $this->email) {
            return $this->redirectRoute('register', navigate: true);
        }
    }

    public function verify()
    {
        $this->validate(['code' => 'required|digits:6']);

        if (! EmailCode::verify($this->email, $this->code, 'verify')) {
            $this->addError('code', 'That code is invalid or has expired.');
            return;
        }

        $user = User::where('email', $this->email)->first();
        if (! $user) {
            return $this->redirectRoute('register', navigate: true);
        }

        $user->update(['email_verified_at' => now()]);
        Auth::login($user, true);
        session()->regenerate();
        session()->forget('verify_email');

        return $this->redirectRoute('home', navigate: true);
    }

    public function resend(): void
    {
        CodeSender::send($this->email, 'verify');
        $this->resent = true;
    }

    public function render()
    {
        return view('livewire.auth.verify');
    }
}
