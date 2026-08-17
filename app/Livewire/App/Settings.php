<?php

namespace App\Livewire\App;

use App\Models\Page;
use App\Services\ProgressionService;
use App\Services\SettingsService;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Livewire\Attributes\Layout;
use Livewire\Component;

#[Layout('components.layouts.app')]
class Settings extends Component
{
    /** Delete-account modal step: 'warn' (confirm) → 'code' (enter emailed code). */
    public string $deleteStep = 'warn';

    public string $deleteCode = '';

    public function resetProgress()
    {
        $user = auth()->user();

        // On a device the backend is the source of truth, so reset there FIRST
        // (requires internet). Otherwise the next sync would just pull the old
        // progress back. If we can't reach the server, do nothing and report it.
        if (\App\Services\Sync\BackendClient::isClient()) {
            try {
                $response = \App\Services\Sync\BackendClient::request()
                    ->withHeaders(\App\Services\Sync\BackendClient::userHeaders($user))
                    ->post(\App\Services\Sync\BackendClient::base().'/v1/user/reset');
            } catch (\Throwable $e) {
                $this->addError('reset', 'No internet connection. Connect to the internet and try again.');
                return;
            }

            if (! $response->successful()) {
                $this->addError('reset', 'Could not reset right now. Please try again.');
                return;
            }
        }

        DB::table('training_days')->where('user_id', $user->id)->delete();
        DB::table('workout_sessions')->where('user_id', $user->id)->delete();
        DB::table('measurements')->where('user_id', $user->id)->delete();
        DB::table('knowledge_lesson_user')->where('user_id', $user->id)->delete();
        DB::table('reminders')->where('user_id', $user->id)->delete();
        $user->update(['level_started_days' => 0]);

        // Clear the device's offline copy so it can't re-push the deleted data.
        $this->dispatch('progress-reset');

        // Hard redirect flushes the entire wire:navigate SPA cache so every
        // page (progress tracker, home, etc.) renders with zeroed-out data.
        return redirect()->route('home');
    }

    public function logout()
    {
        Auth::logout();
        session()->invalidate();
        session()->regenerateToken();

        // Hard redirect (no SPA navigate) straight to the logged-out screen with
        // the sign-in prompt. Going via /login adds an SPA-navigate hop that left
        // a blank screen and a back-stack entry that 401'd ("Unauthenticated").
        // A full reload also clears the wire:navigate cache, so pressing Back
        // cleanly re-requests the prior page (which redirects guests to landing).
        return redirect('/welcome?auth_prompt=1&auth_mode=login');
    }

    /**
     * Email the signed-in user a code to confirm account deletion. Online only:
     * on the device this goes to the backend (which owns accounts + email), and
     * on the backend it sends directly. Advances the modal to the code step.
     */
    public function sendDeleteCode()
    {
        $user = auth()->user();

        if (\App\Services\Sync\BackendClient::isClient()) {
            try {
                $response = \App\Services\Sync\BackendClient::request()
                    ->withHeaders(\App\Services\Sync\BackendClient::userHeaders($user))
                    ->post(\App\Services\Sync\BackendClient::base().'/v1/user/delete-code');
            } catch (\Throwable $e) {
                $this->addError('delete', 'No internet connection. Connect to the internet and try again.');
                return;
            }

            if (! $response->successful()) {
                $this->addError('delete', 'Could not send the code right now. Please try again.');
                return;
            }
        } else {
            \App\Services\CodeSender::send($user->email, 'delete');
        }

        $this->resetErrorBag('delete');
        $this->deleteStep = 'code';
    }

    /**
     * Permanently delete the account after verifying the emailed code. On the
     * device the backend deletes the authoritative copy first, then the local
     * mirror is purged so it can't sync back. Irreversible.
     */
    public function deleteAccount()
    {
        $this->validate(
            ['deleteCode' => 'required|digits:6'],
            ['deleteCode.required' => 'Enter the code from your email.', 'deleteCode.digits' => 'The code should be 6 digits.'],
        );

        $user = auth()->user();

        if (\App\Services\Sync\BackendClient::isClient()) {
            try {
                $response = \App\Services\Sync\BackendClient::request()
                    ->withHeaders(\App\Services\Sync\BackendClient::userHeaders($user))
                    ->post(\App\Services\Sync\BackendClient::base().'/v1/user/delete', ['code' => $this->deleteCode]);
            } catch (\Throwable $e) {
                $this->addError('delete', 'No internet connection. Connect to the internet and try again.');
                return;
            }

            if ($response->status() === 422) {
                $this->addError('deleteCode', 'That code is invalid or has expired.');
                return;
            }
            if (! $response->successful()) {
                $this->addError('delete', 'Could not delete the account right now. Please try again.');
                return;
            }
        } elseif (! \App\Models\EmailCode::verify($user->email, $this->deleteCode, 'delete')) {
            $this->addError('deleteCode', 'That code is invalid or has expired.');
            return;
        }

        // Wipe the local copy (authoritative on the backend, mirror on device).
        $user->deleteWithData();

        Auth::logout();
        session()->invalidate();
        session()->regenerateToken();

        // Clear the device's offline caches so nothing can re-push.
        $this->dispatch('progress-reset');

        return redirect('/welcome');
    }

    public function render(ProgressionService $progression, SettingsService $settings)
    {
        $user = auth()->user();
        $subscription = $user->activeSubscription();

        // Store / RevenueCat subscription management deep link.
        $manageUrl = null;
        if ($subscription?->isGooglePlay()) {
            $package = $settings->get('google_play_package_name');
            $sku = $subscription->plan?->store_product_id;
            $manageUrl = 'https://play.google.com/store/account/subscriptions'
                .($sku && $package ? "?sku={$sku}&package={$package}" : '');
        } elseif ($subscription?->isRevenueCat() || $subscription) {
            $manageUrl = 'https://play.google.com/store/account/subscriptions';
        }

        return view('livewire.app.settings', [
            'user' => $user,
            'subscription' => $subscription,
            'manageUrl' => $manageUrl,
            'completedDays' => $progression->completedDays($user),
            'pages' => Page::where('is_published', true)->orderBy('sort_order')->get(['id', 'title', 'slug']),
        ]);
    }
}
