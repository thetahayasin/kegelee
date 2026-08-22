<?php

namespace Tests\Feature;

use App\Models\Page;
use App\Models\PageTranslation;
use App\Support\Locales;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Legal pages are served per-locale, and the rule that matters most is the
 * fallback: a missing or empty translation must yield the English page, never
 * a blank privacy policy. Half-finished translation sets are the normal state,
 * not an edge case, so the fallback is tested harder than the happy path.
 */
class PageTranslationTest extends TestCase
{
    use RefreshDatabase;

    private Page $page;

    protected function setUp(): void
    {
        parent::setUp();

        $this->page = Page::updateOrCreate(
            ['slug' => 'privacy-policy'],
            [
                'title' => 'Privacy Policy',
                'content' => '<p>English body.</p>',
                'is_published' => true,
                'sort_order' => 1,
            ],
        );
    }

    private function translate(string $locale, string $title, ?string $content, bool $reviewed = false): PageTranslation
    {
        return PageTranslation::create([
            'page_id' => $this->page->id,
            'locale' => $locale,
            'title' => $title,
            'content' => $content,
            'is_reviewed' => $reviewed,
        ]);
    }

    // --- Locales::resolve --------------------------------------------------

    public function test_locale_resolution(): void
    {
        $this->assertSame('de', Locales::resolve('de'));
        $this->assertSame('pt-BR', Locales::resolve('pt-BR'));
        // Underscore form, as some platforms report it.
        $this->assertSame('zh-Hans', Locales::resolve('zh_Hans'));
        // Region we do not ship falls back to the base language.
        $this->assertSame('de', Locales::resolve('de-AT'));
        // Base language we do not ship falls back to the one regional variant
        // we do - a Brazilian policy beats an English one for a pt-PT reader.
        $this->assertSame('pt-BR', Locales::resolve('pt'));
        $this->assertNull(Locales::resolve('kl'));
        $this->assertNull(Locales::resolve(''));
        $this->assertNull(Locales::resolve(null));
    }

    public function test_rtl_detection_covers_regional_tags(): void
    {
        $this->assertTrue(Locales::isRtl('ar'));
        $this->assertTrue(Locales::isRtl('he'));
        $this->assertFalse(Locales::isRtl('en'));
        $this->assertFalse(Locales::isRtl('zh-Hans'));
    }

    // --- Page::localized ---------------------------------------------------

    public function test_returns_the_translation_when_one_exists(): void
    {
        $this->translate('de', 'Datenschutz', '<p>Deutscher Text.</p>');

        $out = $this->page->localized('de');

        $this->assertSame('Datenschutz', $out['title']);
        $this->assertSame('<p>Deutscher Text.</p>', $out['content']);
        $this->assertSame('de', $out['locale']);
        $this->assertFalse($out['is_fallback']);
    }

    public function test_falls_back_to_english_when_the_locale_has_no_row(): void
    {
        $out = $this->page->localized('ja');

        $this->assertSame('Privacy Policy', $out['title']);
        $this->assertSame('<p>English body.</p>', $out['content']);
        $this->assertSame('en', $out['locale']);
        $this->assertTrue($out['is_fallback']);
    }

    /**
     * Creating the row to reserve a language must not publish an empty policy.
     */
    public function test_falls_back_when_the_translation_body_is_empty(): void
    {
        $this->translate('fr', 'Confidentialite', '   ');

        $out = $this->page->localized('fr');

        $this->assertSame('<p>English body.</p>', $out['content']);
        $this->assertSame('en', $out['locale']);
        $this->assertTrue($out['is_fallback']);
    }

    public function test_unsupported_and_missing_locales_are_english(): void
    {
        foreach ([null, '', 'kl', 'en'] as $tag) {
            $out = $this->page->localized($tag);
            $this->assertSame('en', $out['locale'], "locale: ".var_export($tag, true));
            $this->assertFalse($out['is_fallback'], 'English is not a fallback from itself');
        }
    }

    /**
     * An unreviewed translation is still shown - the flag is an editorial
     * signal for the admin list, not a publish gate. Withholding a finished
     * translation because nobody ticked a box would be the worse default.
     */
    public function test_unreviewed_translations_are_still_served(): void
    {
        $this->translate('it', 'Privacy', '<p>Testo italiano.</p>', false);

        $out = $this->page->localized('it');

        $this->assertSame('<p>Testo italiano.</p>', $out['content']);
        $this->assertFalse($out['is_fallback']);
    }

    public function test_translation_title_falls_back_but_content_still_wins(): void
    {
        $this->translate('nl', '', '<p>Nederlandse tekst.</p>');

        $out = $this->page->localized('nl');

        $this->assertSame('Privacy Policy', $out['title']);
        $this->assertSame('<p>Nederlandse tekst.</p>', $out['content']);
    }

    public function test_deleting_a_page_removes_its_translations(): void
    {
        $this->translate('de', 'Datenschutz', '<p>Deutscher Text.</p>');
        $id = $this->page->id;

        $this->page->delete();

        $this->assertSame(0, PageTranslation::where('page_id', $id)->count());
    }

    // --- API ---------------------------------------------------------------

    public function test_page_endpoint_serves_the_requested_locale(): void
    {
        $this->translate('de', 'Datenschutz', '<p>Deutscher Text.</p>');

        $this->getJson('/api/v1/pages/privacy-policy?locale=de')
            ->assertOk()
            ->assertJsonPath('title', 'Datenschutz')
            ->assertJsonPath('locale', 'de')
            ->assertJsonPath('is_fallback', false);
    }

    public function test_page_endpoint_reports_the_fallback_honestly(): void
    {
        // The client sets text direction from `locale`, so it must be told
        // English came back rather than the Arabic it asked for.
        $this->getJson('/api/v1/pages/privacy-policy?locale=ar')
            ->assertOk()
            ->assertJsonPath('title', 'Privacy Policy')
            ->assertJsonPath('locale', 'en')
            ->assertJsonPath('is_fallback', true);
    }

    public function test_content_endpoint_localizes_each_page_independently(): void
    {
        $terms = Page::updateOrCreate(
            ['slug' => 'terms'],
            [
                'title' => 'Terms',
                'content' => '<p>English terms.</p>',
                'is_published' => true,
                'sort_order' => 2,
            ],
        );

        // Only the privacy policy is translated; terms is not.
        $this->translate('de', 'Datenschutz', '<p>Deutscher Text.</p>');

        $res = $this->getJson('/api/v1/content?locale=de')->assertOk();

        $pages = collect($res->json('pages'))->keyBy('slug');
        $this->assertSame('Datenschutz', $pages['privacy-policy']['title']);
        $this->assertSame('de', $pages['privacy-policy']['locale']);
        $this->assertSame('Terms', $pages['terms']['title']);
        $this->assertSame('en', $pages['terms']['locale']);
        $this->assertTrue($pages['terms']['is_fallback']);
        $this->assertSame($terms->id, $pages['terms']['id']);
    }

    public function test_content_endpoint_without_a_locale_is_english(): void
    {
        $this->translate('de', 'Datenschutz', '<p>Deutscher Text.</p>');

        $res = $this->getJson('/api/v1/content')->assertOk();

        $pages = collect($res->json('pages'))->keyBy('slug');
        $this->assertSame('Privacy Policy', $pages['privacy-policy']['title']);
    }

    /**
     * The list path eager-loads translations; without that it fires a query
     * per page, which is the kind of thing that only bites once there are 28
     * languages and a dozen pages.
     */
    public function test_content_endpoint_does_not_query_per_page(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $p = Page::create([
                'title' => "Extra page {$i}",
                'slug' => "extra-page-{$i}",
                'content' => '<p>Body.</p>',
                'is_published' => true,
                'sort_order' => 10 + $i,
            ]);
            PageTranslation::create([
                'page_id' => $p->id,
                'locale' => 'de',
                'title' => "Seite {$i}",
                'content' => '<p>Text.</p>',
            ]);
        }

        \Illuminate\Support\Facades\DB::enableQueryLog();
        $this->getJson('/api/v1/content?locale=de')->assertOk();
        $queries = \Illuminate\Support\Facades\DB::getQueryLog();
        \Illuminate\Support\Facades\DB::disableQueryLog();

        $translationQueries = collect($queries)
            ->filter(fn ($q) => str_contains($q['query'], 'page_translations'))
            ->count();

        $this->assertLessThanOrEqual(1, $translationQueries,
            'translations should be eager-loaded in a single query');
    }
}
