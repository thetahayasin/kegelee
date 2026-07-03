<?php

namespace Database\Seeders;

use App\Models\KnowledgeLesson;
use App\Support\BasicsLessons;
use Illuminate\Database\Seeder;

/**
 * Mirrors the hardcoded {@see BasicsLessons} into the database. The lessons
 * are interactive tutorials built into the app; the row exists only so the
 * sequential unlock and per-user completion tracking keep working.
 */
class KnowledgeSeeder extends Seeder
{
    public function run(): void
    {
        foreach (BasicsLessons::all() as $order => $lesson) {
            KnowledgeLesson::updateOrCreate(
                ['sort_order' => $order],
                [
                    'title' => $lesson['title'],
                    'description' => null,
                    'video_path' => null,
                    'video_url' => null,
                    'is_active' => true,
                ],
            );
        }

        // Retire anything beyond the fixed set (the old video lessons).
        KnowledgeLesson::where('sort_order', '>', max(array_keys(BasicsLessons::all())))
            ->update(['is_active' => false]);
    }
}
