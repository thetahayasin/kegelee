<?php

namespace Database\Seeders;

use App\Models\Page;
use App\Models\PageTranslation;
use App\Support\LegalPageTranslations;
use App\Support\Locales;
use Illuminate\Database\Seeder;

/**
 * Seeds the machine-translated legal pages.
 *
 * Idempotent, and deliberately non-destructive about review state: a row a
 * human has already reviewed is left completely alone, so re-running this
 * after someone has corrected the German policy will not overwrite their work
 * with the machine output again.
 */
class PageTranslationSeeder extends Seeder
{
    public function run(): void
    {
        $pages = Page::whereIn('slug', array_keys(LegalPageTranslations::SOURCE))
            ->get()
            ->keyBy('slug');

        $written = 0;
        $skipped = 0;

        foreach (LegalPageTranslations::all() as $locale => $bySlug) {
            if (! Locales::isSupported($locale) || $locale === Locales::BASE) {
                $this->command?->warn("Skipping unsupported locale: {$locale}");
                continue;
            }

            foreach ($bySlug as $slug => $data) {
                $page = $pages->get($slug);
                if (! $page) {
                    $this->command?->warn("No page with slug {$slug}; skipping {$locale}.");
                    continue;
                }

                $existing = PageTranslation::where('page_id', $page->id)
                    ->where('locale', $locale)
                    ->first();

                if ($existing && $existing->is_reviewed) {
                    $skipped++;
                    continue;
                }

                // Throws on a block-count mismatch rather than writing a page
                // whose headings have slid into the wrong paragraphs.
                $html = LegalPageTranslations::render($slug, $data['blocks']);

                PageTranslation::updateOrCreate(
                    ['page_id' => $page->id, 'locale' => $locale],
                    [
                        'title' => $data['title'],
                        'content' => $html,
                        'is_reviewed' => false,
                    ],
                );
                $written++;
            }
        }

        $this->command?->info("Legal page translations: {$written} written, {$skipped} left alone (already reviewed).");
    }
}
