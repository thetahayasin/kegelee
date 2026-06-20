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
    public bool $saved = false;

    public function update()
    {
        $this->validate([
            'current' => 'required',
            'password' => 'required|string|min:6',
        ]);

        $user = auth()->user();

        if ($user->password && ! Hash::check($this->current, $user->password)) {
            $this->addError('current', 'Your current password is incorrect.');
            return;
        }

        $user->update(['password' => Hash::make($this->password)]);
        $this->reset(['current', 'password']);
        $this->saved = true;
    }

    public function render()
    {
        return view('livewire.app.change-password');
    }
}
