<?php

namespace Database\Seeders;

use App\Models\KnowledgeLesson;
use Illuminate\Database\Seeder;

class KnowledgeSeeder extends Seeder
{
    public function run(): void
    {
        $lessons = [
            [
                'title' => 'Where are your pelvic floor muscles?',
                'description' => 'Meet the hammock of muscles at the base of your pelvis and what they do.',
                'video_url' => 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
            ],
            [
                'title' => 'How to find and feel them',
                'description' => 'Simple cues to locate the muscles and feel a correct contraction.',
                'video_url' => 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
            ],
            [
                'title' => 'Why training matters',
                'description' => 'The benefits of a strong pelvic floor for control, core and confidence.',
                'video_url' => 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
            ],
            [
                'title' => 'Doing your Kegels right',
                'description' => 'Breathing, common mistakes, and how to get the most from every session.',
                'video_url' => 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
            ],
        ];

        foreach ($lessons as $i => $data) {
            KnowledgeLesson::updateOrCreate(
                ['sort_order' => $i],
                $data + ['is_active' => true],
            );
        }
    }
}
