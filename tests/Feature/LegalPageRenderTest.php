<?php

namespace Tests\Feature;

use App\Models\Page;
use App\Support\SafeHtml;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The legal pages are the only content the website renders unescaped, and they
 * are the URLs the Play listing points at, so they are also the most-visited
 * pages here. Whatever the editor produced, script must not run.
 */
class LegalPageRenderTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_renders_a_published_page(): void
    {
        Page::updateOrCreate(['slug' => 'privacy-policy'], [
            'title' => 'Privacy Policy',
            'content' => '<p>We keep your data.</p>',
            'is_published' => true,
        ]);

        $this->get('/p/privacy-policy')
            ->assertOk()
            ->assertSee('We keep your data.', false);
    }

    public function test_a_draft_page_is_not_public(): void
    {
        Page::updateOrCreate(['slug' => 'draft-policy'], [
            'title' => 'Draft',
            'content' => 'wip',
            'is_published' => false,
        ]);

        $this->get('/p/draft-policy')->assertNotFound();
    }

    public function test_script_in_the_content_is_stripped_before_it_reaches_the_browser(): void
    {
        Page::updateOrCreate(['slug' => 'terms'], [
            'title' => 'Terms',
            'content' => '<p>Fine print</p><script>alert(1)</script><img src=x onerror="alert(2)">'
                .'<a href="javascript:alert(3)">tap</a>',
            'is_published' => true,
        ]);

        $res = $this->get('/p/terms');

        $res->assertOk();
        $res->assertSee('Fine print', false);
        $res->assertDontSee('alert(1)', false);
        $res->assertDontSee('onerror', false);
        $res->assertDontSee('javascript:', false);
    }

    public function test_the_sanitiser_keeps_ordinary_markup(): void
    {
        $html = '<h2>Heading</h2><p>Text with a <a href="https://example.com">link</a> and <strong>bold</strong>.</p>';

        $this->assertSame($html, SafeHtml::render($html));
    }

    public function test_the_sanitiser_handles_the_obvious_evasions(): void
    {
        // Padding and casing are the whole trick; the browser ignores both.
        $this->assertStringNotContainsString('script', strtolower(SafeHtml::render('<ScRiPt>bad()</ScRiPt>')));
        $this->assertStringNotContainsString('alert', SafeHtml::render('<a href="  JaVaScRiPt:alert(1)">x</a>'));
        $this->assertStringNotContainsString('alert', SafeHtml::render('<div ONCLICK="alert(1)">x</div>'));
        // An unclosed tag still loses the tag; what is left is inert text.
        $unclosed = SafeHtml::render('<style>x{}</style><script src="/x.js">bad()');
        $this->assertStringNotContainsString('<script', $unclosed);
        $this->assertStringNotContainsString('<style', $unclosed);
    }
}
