<?php

namespace Tests\Feature;

use App\Models\Exercise;
use App\Models\KnowledgeLesson;
use App\Models\Level;
use App\Services\Sync\ContentSyncService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
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

    public function test_device_pull_ingests_knowledge_without_crashing_on_missing_columns(): void
    {
        // Act like the device: a sync target whose host differs from the request.
        config(['app.content_sync_url' => 'https://ke.downloadh.com/api/v1/content']);
        $_SERVER['HTTP_HOST'] = '127.0.0.1';

        // Backend sends an exercise video_url even though the device's exercises
        // table has no video_path column — the pull must skip it, not roll back.
        Http::fake([
            'ke.downloadh.com/api/v1/content' => Http::response([
                'exercises' => [[
                    'id' => 1, 'slug' => 'trembling', 'name' => 'Trembling',
                    'contract_seconds' => 1, 'relax_seconds' => 1, 'sort_order' => 0,
                    'contract_label' => 'Contract', 'relax_label' => 'Relax',
                    'contract_glow_mode' => 'at_once', 'relax_glow_mode' => 'at_once',
                    'start_phase' => 'relax', 'full_hold' => false,
                    'icon_url' => 'https://ke.downloadh.com/storage/i.png',
                    'video_url' => 'https://ke.downloadh.com/storage/v.mp4',
                ]],
                'exercise_levels' => [],
                'levels' => [['id' => 1, 'number' => 1, 'name' => 'Level 1']],
                'onboarding_slides' => [],
                'knowledge_lessons' => [[
                    'id' => 1, 'title' => 'Pelvic floor', 'description' => 'Intro',
                    'video_src' => 'https://ke.downloadh.com/storage/k.mp4', 'sort_order' => 0,
                ]],
                'settings' => [],
                'plans' => [[
                    'id' => 5, 'name' => 'Premium Monthly Test', 'slug' => 'premium-monthly-test',
                    'price' => 12.99, 'currency' => 'USD', 'interval' => 'month',
                    'interval_count' => 1, 'trial_days' => 7, 'is_active' => true,
                    'is_featured' => true, 'sort_order' => 1, 'store_product_id' => 'pm_test'
                ]],
                'discounts' => [[
                    'id' => 3, 'code' => 'TEST50', 'description' => '50% Off Test',
                    'type' => 'percent', 'value' => 50.0, 'is_active' => true
                ]],
            ], 200),
        ]);

        $svc = app(ContentSyncService::class);
        $ok = $svc->pull();

        $this->assertTrue($ok, 'pull should succeed: '.json_encode($svc->report));
        $this->assertTrue($svc->report['ok']);
        $this->assertSame(1, KnowledgeLesson::count());
        $lesson = KnowledgeLesson::first();
        $this->assertSame('Pelvic floor', $lesson->title);
        $this->assertSame('https://ke.downloadh.com/storage/k.mp4', $lesson->videoSrc());
        // Exercise synced with its icon, video_path silently skipped (no column).
        $this->assertSame('https://ke.downloadh.com/storage/i.png', Exercise::find(1)->icon_path);

        // Verify plans and discounts synced successfully
        $this->assertSame(1, \App\Models\Plan::where('slug', 'premium-monthly-test')->count());
        $plan = \App\Models\Plan::where('slug', 'premium-monthly-test')->first();
        $this->assertEquals(12.99, (float) $plan->price);
        $this->assertTrue((bool) $plan->is_featured);

        $this->assertSame(1, \App\Models\Discount::where('code', 'TEST50')->count());
        $discount = \App\Models\Discount::where('code', 'TEST50')->first();
        $this->assertEquals(50.0, (float) $discount->value);
    }
}
