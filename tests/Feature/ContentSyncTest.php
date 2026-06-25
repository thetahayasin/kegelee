<?php

namespace Tests\Feature;

use App\Models\Exercise;
use App\Models\KnowledgeLesson;
use App\Models\Level;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ContentSyncTest extends TestCase
{
    use RefreshDatabase;

    private string $apiKey = 'Y5PqnYAf8MIW1tM8XDTNLUMmRAxRuiRBkCA8BY6kBFt12Uuo';

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.sync_api_key' => $this->apiKey, 'app.url' => 'https://ke.downloadh.com']);
    }

    public function test_content_returns_absolute_media_urls_pivot_and_knowledge(): void
    {
        $level = Level::create(['number' => 1, 'name' => 'Level 1', 'is_active' => true]);
        $exercise = Exercise::create([
            'slug' => 'trembling', 'name' => 'Trembling', 'is_active' => true,
            'contract_seconds' => 1, 'relax_seconds' => 1, 'sort_order' => 0,
            'video_path' => 'exercises/clip.mp4',
        ]);
        DB::table('exercise_level')->insert([
            'exercise_id' => $exercise->id, 'level_id' => $level->id, 'duration_seconds' => 30,
        ]);
        KnowledgeLesson::create([
            'title' => 'Where are your pelvic floor muscles?',
            'description' => 'Find them first.',
            'video_path' => 'knowledge/videos/clip.mp4',
            'is_active' => true, 'sort_order' => 0,
        ]);

        $res = $this->withHeaders(['Authorization' => 'Bearer '.$this->apiKey])
            ->getJson('/api/v1/content');

        $res->assertStatus(200);

        // Knowledge lesson present with description + absolute video URL.
        $res->assertJsonPath('knowledge_lessons.0.title', 'Where are your pelvic floor muscles?');
        $res->assertJsonPath('knowledge_lessons.0.description', 'Find them first.');
        $this->assertStringStartsWith('https://ke.downloadh.com/', $res->json('knowledge_lessons.0.video_src'));

        // Exercise media URL is absolute.
        $this->assertStringStartsWith('https://ke.downloadh.com/', $res->json('exercises.0.video_url'));

        // Per-level durations included.
        $this->assertEquals(30, $res->json('exercise_levels.0.duration_seconds'));
        $res->assertJsonPath('exercise_levels.0.exercise_id', $exercise->id);
    }
}
