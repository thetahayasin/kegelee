<?php

namespace App\Livewire\App\Knowledge;

use App\Models\KnowledgeLesson;
use Livewire\Attributes\Layout;
use Livewire\Component;

#[Layout('components.layouts.app')]
class Index extends Component
{
    public function render()
    {
        $user = auth()->user();
        $completedIds = $user->completedLessons()
            ->wherePivotNotNull('completed_at')
            ->pluck('knowledge_lessons.id')
            ->all();

        $lessons = KnowledgeLesson::where('is_active', true)
            ->orderBy('sort_order')
            ->get();

        // Sequential unlock: a lesson opens once the previous one is complete.
        $prevComplete = true;
        $rows = $lessons->map(function (KnowledgeLesson $lesson) use ($completedIds, &$prevComplete) {
            $done = in_array($lesson->id, $completedIds, true);
            $unlocked = $prevComplete;
            $prevComplete = $done;

            return ['lesson' => $lesson, 'done' => $done, 'unlocked' => $unlocked];
        });

        return view('livewire.app.knowledge.index', [
            'rows' => $rows,
            'completedCount' => count($completedIds),
            'total' => $lessons->count(),
        ]);
    }
}
