<?php

namespace Tests\Feature;

use App\Models\KnowledgeLesson;
use App\Models\Page;
use App\Services\Sync\ContentSyncService;
use Illuminate\Foundation\Testing\RefreshDatabase;
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

    public function test_content_returns_knowledge_and_page_list_only(): void
    {
        KnowledgeLesson::create([
            'title' => 'Where are your pelvic floor muscles?',
            'description' => 'Find them first.',
            'video_path' => 'knowledge/videos/clip.mp4',
            'is_active' => true, 'sort_order' => 0,
        ]);
        // The catalogue migration seeds the default pages; pin known content.
        Page::updateOrCreate(
            ['slug' => 'privacy-policy'],
            ['title' => 'Privacy Policy', 'content' => '<p>Policy body.</p>', 'is_published' => true, 'sort_order' => 0],
        );

        $res = $this->withHeaders(['Authorization' => 'Bearer '.$this->apiKey])
            ->getJson('/api/v1/content');

        $res->assertStatus(200);

        // Knowledge lesson present with description + absolute video URL.
        $res->assertJsonPath('knowledge_lessons.0.title', 'Where are your pelvic floor muscles?');
        $res->assertJsonPath('knowledge_lessons.0.description', 'Find them first.');
        $this->assertStringStartsWith('https://ke.downloadh.com/', $res->json('knowledge_lessons.0.video_src'));

        // Page LIST syncs (title/slug), but never the content - legal pages
        // are read live so users always see the current version.
        $res->assertJsonPath('pages.0.slug', 'privacy-policy');
        $res->assertJsonPath('pages.0.title', 'Privacy Policy');
        $this->assertNull($res->json('pages.0.content'));

        // The hardcoded catalogues never sync.
        $this->assertNull($res->json('exercises'));
        $this->assertNull($res->json('levels'));
        $this->assertNull($res->json('onboarding_slides'));
        $this->assertNull($res->json('plans'));
    }

    public function test_page_endpoint_serves_live_content(): void
    {
        Page::updateOrCreate(
            ['slug' => 'terms'],
            ['title' => 'Terms of Service', 'content' => '<p>The terms.</p>', 'is_published' => true, 'sort_order' => 2],
        );

        $res = $this->withHeaders(['Authorization' => 'Bearer '.$this->apiKey])
            ->getJson('/api/v1/pages/terms');

        $res->assertStatus(200);
        $res->assertJsonPath('title', 'Terms of Service');
        $res->assertJsonPath('content', '<p>The terms.</p>');

        $this->withHeaders(['Authorization' => 'Bearer '.$this->apiKey])
            ->getJson('/api/v1/pages/missing')
            ->assertStatus(404);
    }

    public function test_device_pull_ingests_knowledge_and_page_titles(): void
    {
        // Act like the device: a sync target whose host differs from the request.
        config(['app.content_sync_url' => 'https://ke.downloadh.com/api/v1/content']);
        $_SERVER['HTTP_HOST'] = '127.0.0.1';

        Http::fake([
            'ke.downloadh.com/api/v1/content' => Http::response([
                'knowledge_lessons' => [[
                    'id' => 1, 'title' => 'Pelvic floor', 'description' => 'Intro',
                    'video_src' => 'https://ke.downloadh.com/storage/k.mp4', 'sort_order' => 0,
                ]],
                'pages' => [[
                    'id' => 1, 'slug' => 'privacy-policy', 'title' => 'Privacy Policy', 'sort_order' => 0,
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

        // The page list mirrors locally (for the Settings links); content stays online-only.
        $page = Page::where('slug', 'privacy-policy')->first();
        $this->assertNotNull($page);
        $this->assertSame('Privacy Policy', $page->title);
        $this->assertTrue((bool) $page->is_published);
    }
}
