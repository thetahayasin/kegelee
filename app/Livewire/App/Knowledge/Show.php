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
        return auth()->user()->completedLessons()
            ->where('knowledge_lessons.id', $this->lesson->id)
            ->wherePivotNotNull('completed_at')
            ->exists();
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

        return auth()->user()->completedLessons()
            ->where('knowledge_lessons.id', $previous->id)
            ->wherePivotNotNull('completed_at')
            ->exists();
    }

    /** Record completion (e.g. when the video ends) without leaving the screen. */
    public function markDone(): void
    {
        auth()->user()->completedLessons()->syncWithoutDetaching([
            $this->lesson->id => ['completed_at' => now()],
        ]);
        $this->done = true;
    }

    public function complete()
    {
        auth()->user()->completedLessons()->syncWithoutDetaching([
            $this->lesson->id => ['completed_at' => now()],
        ]);

        $next = KnowledgeLesson::where('is_active', true)
            ->where('sort_order', '>', $this->lesson->sort_order)
            ->orderBy('sort_order')
            ->first();

        if ($next) {
            return $this->redirectRoute('knowledge.show', ['lesson' => $next->id], navigate: true);
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
