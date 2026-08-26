<?php

namespace App\Livewire\Auth;

use App\Models\User;
use App\Services\CodeSender;
use Illuminate\Support\Facades\RateLimiter;
use Livewire\Attributes\Layout;
use Livewire\Component;

#[Layout('components.layouts.app')]
class ForgotPassword extends Component
{
    public string $email = '';

    public function send()
    {
        $this->validate(['email' => 'required|email|max:190']);

        $email = strtolower($this->email);

        $key = 'forgot:'.$email;
        if (RateLimiter::tooManyAttempts($key, 3)) {
            $seconds = RateLimiter::availableIn($key);
            $this->addError('email', "Too many attempts. Try again in {$seconds} seconds.");
            return;
        }
        RateLimiter::hit($key, 900);
        // Backend recovery is for admins only. App users reset through the
        // mobile app, which uses the API flow (/api/auth/reset-code) instead.
        // Only send if the account exists AND is an admin, but always continue
        // down the same path either way (no enumeration).
        if (User::where('email', $email)->where('is_admin', true)->exists()) {
            CodeSender::send($email, 'reset');
        }

        session(['reset_email' => $email]);

        return $this->redirectRoute('password.reset', navigate: true);
    }

    public function render()
    {
        return view('livewire.auth.forgot-password');
    }
}
