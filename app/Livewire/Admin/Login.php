<?php

namespace App\Livewire\Admin;

use Illuminate\Support\Facades\Auth;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Validate;
use Livewire\Component;

#[Layout('components.layouts.app')]
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
        $this->validate();

        if (! Auth::attempt(['email' => $this->email, 'password' => $this->password], true)) {
            $this->addError('email', 'These credentials do not match our records.');
            return;
        }

        if (! Auth::user()->is_admin) {
            Auth::logout();
            $this->addError('email', 'This account does not have admin access.');
            return;
        }

        return $this->redirectRoute('admin.dashboard');
    }

    public function render()
    {
        return view('livewire.admin.login');
    }
}
