<?php

namespace App\Livewire\Auth;

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
        RateLimiter::hit($key, 900);

        $this->validate([
            'name' => 'required|string|max:120',
            'email' => 'required|email|max:190|unique:users,email',
            'password' => 'required|string|min:6|confirmed',
        ], [
            'name.required'      => 'Name is required.',
            'email.required'     => 'Email is required.',
            'email.email'        => 'Enter a valid email address.',
            'email.unique'       => 'This email is already registered.',
            'password.required'  => 'Password is required.',
            'password.min'       => 'Password must be at least 6 characters.',
            'password.confirmed' => "Passwords don't match.",
        ]);

        $user = User::create([
            'name' => trim($this->name),
            'email' => strtolower($this->email),
            'password' => Hash::make($this->password),
            'level_id' => Level::where('is_active', true)->orderBy('number')->value('id'),
        ]);

        CodeSender::send($user->email, 'verify');
        session(['verify_email' => $user->email]);

        return $this->redirectRoute('verify', navigate: true);
    }

    public function render(SettingsService $settings)
    {
        return view('livewire.auth.register', [
            'googleEnabled' => (bool) $settings->get('google_login_enabled') && $settings->get('google_client_id'),
        ]);
    }
}
