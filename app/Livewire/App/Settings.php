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
    public function resetProgress()
    {
        $user = auth()->user();
        DB::table('training_days')->where('user_id', $user->id)->delete();
        DB::table('workout_sessions')->where('user_id', $user->id)->delete();
        DB::table('measurements')->where('user_id', $user->id)->delete();
        DB::table('knowledge_lesson_user')->where('user_id', $user->id)->delete();
        $user->update(['level_started_days' => 0]);

        return $this->redirectRoute('home', navigate: true);
    }

    public function logout()
    {
        Auth::logout();
        session()->invalidate();
        session()->regenerateToken();

        return redirect()->route('login');
    }

    public function render(ProgressionService $progression, SettingsService $settings)
    {
        $user = auth()->user();
        $subscription = $user->activeSubscription();

        // Google Play subscription centre deep link — the only place Play allows
        // users to turn off auto-renew / cancel. Pre-fills the product when known.
        $manageUrl = null;
        if ($subscription?->isGooglePlay()) {
            $package = $settings->get('google_play_package_name');
            $sku = $subscription->plan?->store_product_id;
            $manageUrl = 'https://play.google.com/store/account/subscriptions'
                .($sku && $package ? "?sku={$sku}&package={$package}" : '');
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
