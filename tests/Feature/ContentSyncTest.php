<?php

namespace Tests\Feature;

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

    public function test_content_returns_pages_only(): void
    {
        // The catalogue migration seeds the default pages; pin known content.
        Page::updateOrCreate(
            ['slug' => 'privacy-policy'],
            ['title' => 'Privacy Policy', 'content' => '<p>Policy body.</p>', 'is_published' => true, 'sort_order' => 0],
        );

        $res = $this->withHeaders(['Authorization' => 'Bearer '.$this->apiKey])
            ->getJson('/api/v1/content');

        $res->assertStatus(200);

        // Pages sync with content as the device's fallback copy; opening a
        // page still fetches the live version first.
        $res->assertJsonPath('pages.0.slug', 'privacy-policy');
        $res->assertJsonPath('pages.0.title', 'Privacy Policy');
        $res->assertJsonPath('pages.0.content', '<p>Policy body.</p>');

        // Everything hardcoded in the app never syncs.
        $this->assertNull($res->json('exercises'));
        $this->assertNull($res->json('levels'));
        $this->assertNull($res->json('onboarding_slides'));
        $this->assertNull($res->json('plans'));
        $this->assertNull($res->json('knowledge_lessons'));
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

    public function test_device_pull_ingests_page_titles_and_content(): void
    {
        // Act like the device: a sync target whose host differs from the request.
        config(['app.content_sync_url' => 'https://ke.downloadh.com/api/v1/content']);
        $_SERVER['HTTP_HOST'] = '127.0.0.1';

        Http::fake([
            'ke.downloadh.com/api/v1/content' => Http::response([
                'pages' => [[
                    'id' => 1, 'slug' => 'privacy-policy', 'title' => 'Privacy Policy',
                    'content' => '<p>Fresh policy.</p>', 'sort_order' => 0,
                ]],
            ], 200),
        ]);

        $svc = app(ContentSyncService::class);
        $ok = $svc->pull();

        $this->assertTrue($ok, 'pull should succeed: '.json_encode($svc->report));
        $this->assertTrue($svc->report['ok']);

        $page = Page::where('slug', 'privacy-policy')->first();
        $this->assertNotNull($page);
        $this->assertSame('Privacy Policy', $page->title);
        $this->assertSame('<p>Fresh policy.</p>', $page->content);
        $this->assertTrue((bool) $page->is_published);
    }

    public function test_basics_lessons_are_seeded_and_sequential(): void
    {
        $lessons = \App\Models\KnowledgeLesson::where('is_active', true)->orderBy('sort_order')->get();

        $this->assertCount(3, $lessons);
        $this->assertSame(
            ['Why Kegel training works', 'Find your pelvic floor', 'Your first exercise'],
            $lessons->pluck('title')->all(),
        );

        // Every lesson maps to an interactive tutorial partial.
        foreach (\App\Support\BasicsLessons::all() as $lesson) {
            $this->assertTrue(view()->exists($lesson['view']), $lesson['view']);
        }
    }
}
