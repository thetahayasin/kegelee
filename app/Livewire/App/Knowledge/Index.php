<?php

namespace App\Livewire\App\Knowledge;

use App\Models\KnowledgeLesson;
use App\Services\Sync\BackendClient;
use App\Services\Sync\ContentSyncService;
use App\Services\SettingsService;
use Livewire\Attributes\Layout;
use Livewire\Component;

#[Layout('components.layouts.app')]
class Index extends Component
{
    public function render()
    {
        $user = auth()->user();
        if ($user) {
            $completedIds = $user->completedLessons()
                ->wherePivotNotNull('completed_at')
                ->pluck('knowledge_lessons.id')
                ->all();
        } else {
            $completedIds = session('completed_lessons', []);
        }

        $lessons = KnowledgeLesson::where('is_active', true)
            ->orderBy('sort_order')
            ->get();

        // Self-heal + self-report: if there is no content yet, pull it straight
        // from the backend here (server-side, no JS / IndexedDB involved). If it
        // is STILL empty afterwards, capture exactly why so the page can show it.
        $syncStatus = null;
        if ($lessons->isEmpty()) {
            $content = app(ContentSyncService::class);
            $content->pull();

            $lessons = KnowledgeLesson::where('is_active', true)
                ->orderBy('sort_order')
                ->get();

            if ($lessons->isEmpty() && app(SettingsService::class)->get('sync_debug', true)) {
                $syncStatus = array_merge(
                    BackendClient::diagnostics(),
                    ['content_pull' => $content->report],
                );
            }
        }

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
            'syncStatus' => $syncStatus,
        ]);
    }
}
