<?php

namespace App\Livewire\Admin;

use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Validate;
use Livewire\Component;

// The plain layout, not the public one: no operator-supplied code injection
// runs on the form that hands out control of the backend.
#[Layout('components.layouts.plain')]
class Login extends Component
{
    #[Validate('required|email')]
    public string $email = '';

    #[Validate('required')]
    public string $password = '';

    public function mount(): void
    {
        if (Auth::check() && Auth::user()->is_admin) {
            $this->redirectRoute('admin.dashboard');
        }
    }

    public function authenticate()
    {
        // The one form that hands out full control of the backend had no
        // attempt limit at all, while the members' login has had one for
        // months. Same shape: per email + IP, five tries, fifteen minutes.
        $key = 'admin-login:'.strtolower($this->email).':'.request()->ip();

        if (RateLimiter::tooManyAttempts($key, 5)) {
            $seconds = RateLimiter::availableIn($key);
            $this->addError('email', "Too many attempts. Try again in {$seconds} seconds.");
            return;
        }

        $this->validate();

        if (! Auth::attempt(['email' => $this->email, 'password' => $this->password], true)) {
            RateLimiter::hit($key, 900);
            $this->addError('email', 'These credentials do not match our records.');
            return;
        }

        // A non-admin with the right password is still a wrong answer here,
        // so it costs an attempt too.
        if (! Auth::user()->is_admin) {
            Auth::logout();
            RateLimiter::hit($key, 900);
            $this->addError('email', 'This account does not have admin access.');
            return;
        }

        RateLimiter::clear($key);

        return $this->redirectRoute('admin.dashboard');
    }

    public function render()
    {
        return view('livewire.admin.login');
    }
}
