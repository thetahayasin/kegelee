<?php

namespace App\Support;

/**
 * The hardcoded "Learn the basics" lessons - three short interactive
 * tutorials built into the app (no videos, fully offline):
 *
 *   0  Why Kegel training works - the benefits, and why learning the
 *      basics first is what brings real gains.
 *   1  Find your pelvic floor - locating the right muscles in plain
 *      words, with a press-and-hold squeeze try-out.
 *   2  Your first exercise - how the circle works, a live Trembling
 *      demo, and a short guided try.
 *
 * Each lesson renders the blade partial named by `view`. The
 * KnowledgeSeeder mirrors titles into the knowledge_lessons table so the
 * existing sequential unlock and completion tracking keep working.
 */
final class BasicsLessons
{
    /** @return array<int, array{title: string, view: string}> keyed by sort order */
    public static function all(): array
    {
        return [
            0 => [
                'title' => 'Why Kegel training works',
                'view' => 'livewire.app.knowledge.lessons.why',
            ],
            1 => [
                'title' => 'Find your pelvic floor',
                'view' => 'livewire.app.knowledge.lessons.find',
            ],
            2 => [
                'title' => 'Your first exercise',
                'view' => 'livewire.app.knowledge.lessons.first',
            ],
        ];
    }
}
