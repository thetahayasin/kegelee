<?php

namespace App\Livewire\App\Knowledge;

use App\Models\KnowledgeLesson;
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

    /** Record completion (e.g. when the video ends) without leaving the screen. */
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

        if ($next) {
            return $this->redirectRoute('knowledge.show', ['lesson' => $next->id], navigate: true);
        }

        if (! auth()->check()) {
            return $this->redirectRoute('onboarding', ['auth_prompt' => 1], navigate: true);
        }

        return $this->redirectRoute('knowledge.index', navigate: true);
    }

    public function render()
    {
        $hasNext = KnowledgeLesson::where('is_active', true)
            ->where('sort_order', '>', $this->lesson->sort_order)
            ->exists();

        return view('livewire.app.knowledge.show', ['hasNext' => $hasNext]);
    }
}
