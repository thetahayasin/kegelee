<?php

namespace App\Livewire\App;

use Illuminate\Support\Facades\Hash;
use Livewire\Attributes\Layout;
use Livewire\Component;

#[Layout('components.layouts.app')]
class ChangePassword extends Component
{
    public string $current = '';
    public string $password = '';
    public string $password_confirmation = '';
    public bool $saved = false;

    public function update()
    {
        $this->validate([
            'current'  => 'required',
            'password' => 'required|string|min:6|confirmed',
        ], [
            'current.required'   => 'Current password is required.',
            'password.required'  => 'New password is required.',
            'password.min'       => 'New password must be at least 6 characters.',
            'password.confirmed' => "Passwords don't match.",
        ]);

        $user = auth()->user();

        if ($user->password && ! Hash::check($this->current, $user->password)) {
            $this->addError('current', 'Your current password is incorrect.');
            return;
        }

        $user->update(['password' => Hash::make($this->password)]);
        $this->reset(['current', 'password', 'password_confirmation']);
        $this->saved = true;
    }

    public function render()
    {
        return view('livewire.app.change-password');
    }
}
