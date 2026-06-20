<?php

namespace App\Livewire\Auth;

use App\Models\Level;
use App\Models\User;
use App\Services\CodeSender;
use App\Services\SettingsService;
use Illuminate\Support\Facades\Hash;
use Livewire\Attributes\Layout;
use Livewire\Component;

#[Layout('components.layouts.app')]
class Register extends Component
{
    public string $name = '';
    public string $email = '';
    public string $password = '';

    public function mount()
    {
        if (auth()->check()) {
            return $this->redirectRoute('home', navigate: true);
        }
        return $this->redirect('/welcome?auth_prompt=1&auth_mode=register', navigate: true);
    }

    public function register()
    {
        $this->validate([
            'name' => 'required|string|max:120',
            'email' => 'required|email|max:190|unique:users,email',
            'password' => 'required|string|min:6',
        ]);

        $user = User::create([
            'name' => $this->name,
            'email' => strtolower($this->email),
            'password' => Hash::make($this->password),
            'level_id' => Level::where('is_active', true)->orderBy('number')->value('id'),
            'onboarded_at' => now(),
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
