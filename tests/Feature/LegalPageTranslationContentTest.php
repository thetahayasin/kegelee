<?php

namespace Tests\Feature;

use App\Models\Page;
use App\Models\PageTranslation;
use App\Support\LegalPageTranslations;
use App\Support\Locales;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Guards the translated legal copy itself.
 *
 * The failure this is really about: a translation file with the wrong number
 * of blocks would zip a heading's text into a paragraph and shift everything
 * after it, producing a page that renders fine and reads like nonsense. That
 * cannot be spotted by eye across 28 languages, so it is asserted here.
 */
class LegalPageTranslationContentTest extends TestCase
{
    use RefreshDatabase;

    public function test_every_translation_file_matches_the_source_structure(): void
    {
        $all = LegalPageTranslations::all();
        $this->assertNotEmpty($all, 'No translation files found under lang/legal.');

        foreach ($all as $locale => $bySlug) {
            $this->assertTrue(
                Locales::isSupported($locale),
                "lang/legal/{$locale}.php is not a language the app ships.",
            );

            foreach ($bySlug as $slug => $data) {
                $this->assertArrayHasKey($slug, LegalPageTranslations::SOURCE,
                    "{$locale}: unknown page slug '{$slug}'.");

                $this->assertArrayHasKey('title', $data, "{$locale}/{$slug}: missing title.");
                $this->assertNotSame('', trim($data['title']), "{$locale}/{$slug}: empty title.");

                $this->assertCount(
                    LegalPageTranslations::blockCount($slug),
                    $data['blocks'],
                    "{$locale}/{$slug}: block count does not match the English source.",
                );

                foreach ($data['blocks'] as $i => $text) {
                    $this->assertNotSame('', trim((string) $text),
                        "{$locale}/{$slug}: block {$i} is empty.");
                }
            }
        }
    }

    public function test_every_translation_file_covers_every_page(): void
    {
        foreach (LegalPageTranslations::all() as $locale => $bySlug) {
            foreach (array_keys(LegalPageTranslations::SOURCE) as $slug) {
                $this->assertArrayHasKey($slug, $bySlug,
                    "lang/legal/{$locale}.php is missing the '{$slug}' page.");
            }
        }
    }

    /**
     * Rendering escapes the text, so a stray angle bracket in a translation
     * cannot inject markup into a legal page.
     */
    public function test_rendering_escapes_text_and_emits_the_source_tags(): void
    {
        $blocks = array_fill(0, LegalPageTranslations::blockCount('refund-policy'), 'a < b & c');
        $html = LegalPageTranslations::render('refund-policy', $blocks);

        $this->assertStringNotContainsString('a < b', $html);
        $this->assertStringContainsString('&lt;', $html);
        $this->assertSame(3, substr_count($html, '<h2>'), 'refund-policy has three headings');
        $this->assertSame(4, substr_count($html, '<p>'), 'refund-policy has four paragraphs');
    }

    public function test_render_refuses_a_block_count_mismatch(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        LegalPageTranslations::render('terms', ['only', 'two']);
    }

    // --- Seeder ------------------------------------------------------------

    public function test_seeder_writes_unreviewed_translations(): void
    {
        $this->seed(\Database\Seeders\PageTranslationSeeder::class);

        $locales = array_keys(LegalPageTranslations::all());
        $this->assertNotEmpty($locales);

        $page = Page::where('slug', 'privacy-policy')->first();
        $this->assertNotNull($page);

        foreach ($locales as $locale) {
            $row = PageTranslation::where('page_id', $page->id)->where('locale', $locale)->first();
            $this->assertNotNull($row, "no {$locale} row was seeded");
            $this->assertFalse($row->is_reviewed, "{$locale} must land unreviewed");
            $this->assertStringContainsString('<h2>', (string) $row->content);
            // And it actually serves.
            $this->assertFalse($page->fresh()->localized($locale)['is_fallback']);
        }
    }

    /**
     * Re-seeding must not clobber a translation a human has corrected and
     * signed off - which is the whole reason for the is_reviewed flag.
     */
    public function test_seeder_leaves_reviewed_translations_alone(): void
    {
        $this->seed(\Database\Seeders\PageTranslationSeeder::class);

        $locale = array_key_first(LegalPageTranslations::all());
        $page = Page::where('slug', 'privacy-policy')->first();

        PageTranslation::where('page_id', $page->id)->where('locale', $locale)->update([
            'content' => '<p>Reviewed by a lawyer.</p>',
            'is_reviewed' => true,
        ]);

        $this->seed(\Database\Seeders\PageTranslationSeeder::class);

        $row = PageTranslation::where('page_id', $page->id)->where('locale', $locale)->first();
        $this->assertSame('<p>Reviewed by a lawyer.</p>', $row->content);
        $this->assertTrue($row->is_reviewed);
    }
}
