<?php

namespace App\Livewire\App\Knowledge;

use App\Models\KnowledgeLesson;
use App\Support\BasicsLessons;
use Livewire\Attributes\Layout;
use Livewire\Component;

#[Layout('components.layouts.app')]
class Show extends Component
{
    public KnowledgeLesson $lesson;

    public bool $done = false;

    public function mount()
    {
        // Block deep-linking into a still-locked lesson.
        if (! $this->isUnlocked()) {
            return $this->redirectRoute('knowledge.index', navigate: true);
        }

        $this->done = $this->isCompleted();
    }

    private function isCompleted(): bool
    {
        if (auth()->check()) {
            return auth()->user()->completedLessons()
                ->where('knowledge_lessons.id', $this->lesson->id)
                ->wherePivotNotNull('completed_at')
                ->exists();
        }

        return in_array($this->lesson->id, session('completed_lessons', []), true);
    }

    /** Unlocked when it's the first active lesson or the previous one is done. */
    private function isUnlocked(): bool
    {
        $previous = KnowledgeLesson::where('is_active', true)
            ->where('sort_order', '<', $this->lesson->sort_order)
            ->orderByDesc('sort_order')
            ->first();

        if (! $previous) {
            return true;
        }

        if (auth()->check()) {
            return auth()->user()->completedLessons()
                ->where('knowledge_lessons.id', $previous->id)
                ->wherePivotNotNull('completed_at')
                ->exists();
        }

        return in_array($previous->id, session('completed_lessons', []), true);
    }

    /** Record completion (when the tutorial's last step is reached). */
    public function markDone(): void
    {
        if (auth()->check()) {
            auth()->user()->completedLessons()->syncWithoutDetaching([
                $this->lesson->id => ['completed_at' => now()],
            ]);
        } else {
            $completed = session('completed_lessons', []);
            if (! in_array($this->lesson->id, $completed, true)) {
                $completed[] = $this->lesson->id;
                session(['completed_lessons' => $completed]);
            }
        }
        $this->done = true;
    }

    public function complete()
    {
        $this->markDone();

        $next = KnowledgeLesson::where('is_active', true)
            ->where('sort_order', '>', $this->lesson->sort_order)
            ->orderBy('sort_order')
            ->first();

        // Navigate by REPLACING the current history entry (window.location.replace
        // via the 'navigate-replace' handler) so finishing a lesson and pressing
        // native Back does NOT drop back onto the just-finished tutorial.
        if ($next) {
            $this->dispatch('navigate-replace', url: route('knowledge.show', ['lesson' => $next->id]));
            return;
        }

        // Guest finished the free lessons: return to the lesson list and open
        // the subscription sheet (pick a plan, create the account, purchase
        // through Google Play).
        if (! auth()->check()) {
            $this->dispatch('navigate-replace', url: route('knowledge.index').'?subscribe=1');
            return;
        }

        $this->dispatch('navigate-replace', url: route('knowledge.index'));
    }

    public function render(\App\Services\SettingsService $settings)
    {
        $hasNext = KnowledgeLesson::where('is_active', true)
            ->where('sort_order', '>', $this->lesson->sort_order)
            ->exists();

        // The interactive tutorial partial for this lesson (hardcoded in code).
        $basics = BasicsLessons::all()[$this->lesson->sort_order] ?? null;

        // The Trembling try-out runs on the REAL exercise steps and the same
        // circle settings as the workout player, so the tutorial looks and
        // behaves exactly like a session.
        $tremblingSteps = \App\Support\ExerciseCatalog::steps('trembling', 10.0);

        return view('livewire.app.knowledge.show', [
            'hasNext' => $hasNext,
            'lessonView' => $basics['view'] ?? null,
            'circleSize' => (int) $settings->get('circle_size'),
            'trackWidth' => (int) $settings->get('circle_track_width'),
            'glowEnabled' => (bool) $settings->get('circle_glow_enabled'),
            'glowSpeed' => (float) $settings->get('circle_glow_speed', 0.45),
            'timeScale' => (float) $settings->get('circle_time_scale', 0.7),
            'tremblingSteps' => $tremblingSteps,
            'tremblingTotal' => round(array_sum(array_column($tremblingSteps, 'seconds')), 1),
        ]);
    }
}
