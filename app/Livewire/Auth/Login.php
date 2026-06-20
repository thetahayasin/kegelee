<?php

namespace App\Livewire\Auth;

use App\Models\User;
use App\Services\CodeSender;
use App\Services\SettingsService;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Livewire\Attributes\Layout;
use Livewire\Component;

#[Layout('components.layouts.app')]
class Login extends Component
{
    public string $email = '';
    public string $password = '';
    public bool $remember = true;

    public function mount()
    {
        if (auth()->check()) {
            return $this->redirectRoute('home', navigate: true);
        }
        return $this->redirect('/welcome?auth_prompt=1&auth_mode=login', navigate: true);
    }

    public function login()
    {
        $this->validate([
            'email' => 'required|email',
            'password' => 'required',
        ]);

        $user = User::where('email', strtolower($this->email))->first();

        if (! $user || ! $user->password || ! Hash::check($this->password, $user->password)) {
            $this->addError('email', 'These credentials do not match our records.');
            return;
        }

        // Unverified accounts must confirm the emailed code first.
        if (! $user->email_verified_at) {
            CodeSender::send($user->email, 'verify');
            session(['verify_email' => $user->email]);
            return $this->redirectRoute('verify', navigate: true);
        }

        Auth::login($user, $this->remember);
        session()->regenerate();

        return $this->redirectRoute('home', navigate: true);
    }

    public function render(SettingsService $settings)
    {
        return view('livewire.auth.login', [
            'googleEnabled' => (bool) $settings->get('google_login_enabled') && $settings->get('google_client_id'),
        ]);
    }
}
