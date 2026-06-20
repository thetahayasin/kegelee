<?php

namespace App\Livewire\App;

use App\Models\Page;
use App\Services\ProgressionService;
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

    public function render(ProgressionService $progression)
    {
        $user = auth()->user();

        return view('livewire.app.settings', [
            'user' => $user,
            'subscription' => $user->activeSubscription(),
            'completedDays' => $progression->completedDays($user),
            'pages' => Page::where('is_published', true)->orderBy('sort_order')->get(['id', 'title', 'slug']),
        ]);
    }
}
