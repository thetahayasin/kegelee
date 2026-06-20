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
                'icon' => 'location',
            ],
            [
                'title' => 'How to find and feel them',
                'description' => 'Simple cues to locate the muscles and feel a correct contraction.',
                'icon' => 'search',
            ],
            [
                'title' => 'Why training matters',
                'description' => 'The benefits of a strong pelvic floor for control, core and confidence.',
                'icon' => 'heart',
            ],
            [
                'title' => 'Doing your Kegels right',
                'description' => 'Breathing, common mistakes, and how to get the most from every session.',
                'icon' => 'check',
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
