<?php

namespace App\Livewire\App;

use App\Services\Sync\BackendClient;
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

        // On a device the backend owns auth, so change it there first (requires
        // internet). Only mirror the new hash locally once the server confirms —
        // otherwise the device and backend passwords would drift apart.
        if (BackendClient::isClient()) {
            try {
                $response = BackendClient::request()
                    ->post(BackendClient::base().'/v1/auth/change-password', [
                        'email' => $user->email,
                        'current_password' => $this->current,
                        'password' => $this->password,
                    ]);
            } catch (\Throwable $e) {
                $this->addError('current', 'Could not reach the server. Connect to the internet and try again.');
                return;
            }

            if ($response->status() === 422) {
                $this->addError('current', 'Your current password is incorrect.');
                return;
            }
            if (! $response->successful()) {
                $this->addError('current', 'Could not change your password right now. Please try again.');
                return;
            }

            $user->update(['password' => $response->json('password_hash')]);
        } else {
            if ($user->password && ! Hash::check($this->current, $user->password)) {
                $this->addError('current', 'Your current password is incorrect.');
                return;
            }

            $user->update(['password' => Hash::make($this->password)]);
        }

        $this->reset(['current', 'password', 'password_confirmation']);
        $this->saved = true;
        $this->dispatch('password-changed');
    }

    public function render()
    {
        return view('livewire.app.change-password');
    }
}
