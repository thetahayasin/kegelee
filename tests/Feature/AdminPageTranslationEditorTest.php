<?php

namespace Tests\Feature;

use App\Livewire\Admin\Pages;
use App\Models\Page;
use App\Models\PageTranslation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Livewire\Livewire;
use Tests\TestCase;

/**
 * The /mystic page editor's language tabs.
 *
 * Livewire::test renders the blade, so these also catch a broken template -
 * which matters here because the editor is the only way to get translations
 * into the system.
 */
class AdminPageTranslationEditorTest extends TestCase
{
    use RefreshDatabase;

    private Page $page;

    protected function setUp(): void
    {
        parent::setUp();

        $this->actingAs(User::create([
            'name' => 'Admin',
            'email' => 'admin@example.com',
            'password' => bcrypt('secret'),
            'is_admin' => true,
            'email_verified_at' => now(),
        ]));

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

    public function test_editing_opens_on_english_and_loads_the_base_row(): void
    {
        Livewire::test(Pages::class)
            ->call('edit', $this->page->id)
            ->assertSet('locale', 'en')
            ->assertSet('title', 'Privacy Policy')
            ->assertSet('content', '<p>English body.</p>')
            ->assertSet('slug', 'privacy-policy');
    }

    /**
     * An untranslated tab must open EMPTY, not pre-filled with English -
     * otherwise a translator can save the English text untouched and the page
     * looks translated while not being translated.
     */
    public function test_an_untranslated_language_opens_empty(): void
    {
        Livewire::test(Pages::class)
            ->call('edit', $this->page->id)
            ->call('switchLocale', 'de')
            ->assertSet('locale', 'de')
            ->assertSet('title', '')
            ->assertSet('content', '')
            ->assertSet('is_reviewed', false);
    }

    public function test_saving_a_translation_writes_a_translation_row_not_the_page(): void
    {
        Livewire::test(Pages::class)
            ->call('edit', $this->page->id)
            ->call('switchLocale', 'de')
            ->set('title', 'Datenschutz')
            ->set('content', '<p>Deutscher Text.</p>')
            ->call('save')
            ->assertHasNoErrors();

        $translation = PageTranslation::where('page_id', $this->page->id)
            ->where('locale', 'de')->first();

        $this->assertNotNull($translation);
        $this->assertSame('Datenschutz', $translation->title);
        $this->assertFalse($translation->is_reviewed);

        // The base row is untouched.
        $this->assertSame('Privacy Policy', $this->page->fresh()->title);
        $this->assertSame('<p>English body.</p>', $this->page->fresh()->content);
    }

    public function test_switching_back_to_english_reloads_the_base_row(): void
    {
        PageTranslation::create([
            'page_id' => $this->page->id,
            'locale' => 'de',
            'title' => 'Datenschutz',
            'content' => '<p>Deutscher Text.</p>',
        ]);

        Livewire::test(Pages::class)
            ->call('edit', $this->page->id)
            ->call('switchLocale', 'de')
            ->assertSet('title', 'Datenschutz')
            ->call('switchLocale', 'en')
            ->assertSet('title', 'Privacy Policy')
            ->assertSet('content', '<p>English body.</p>');
    }

    public function test_removing_a_translation_restores_the_english_fallback(): void
    {
        PageTranslation::create([
            'page_id' => $this->page->id,
            'locale' => 'de',
            'title' => 'Datenschutz',
            'content' => '<p>Deutscher Text.</p>',
        ]);

        Livewire::test(Pages::class)
            ->call('edit', $this->page->id)
            ->call('switchLocale', 'de')
            ->call('deleteTranslation')
            ->assertSet('title', '');

        $this->assertSame(0, PageTranslation::where('page_id', $this->page->id)->count());
        $this->assertTrue($this->page->fresh()->localized('de')['is_fallback']);
    }

    public function test_tab_states_distinguish_reviewed_draft_and_missing(): void
    {
        PageTranslation::create([
            'page_id' => $this->page->id,
            'locale' => 'de',
            'title' => 'Datenschutz',
            'content' => '<p>Deutscher Text.</p>',
            'is_reviewed' => true,
        ]);
        PageTranslation::create([
            'page_id' => $this->page->id,
            'locale' => 'fr',
            'title' => 'Confidentialite',
            'content' => '<p>Texte francais.</p>',
            'is_reviewed' => false,
        ]);
        // Row exists but empty: still "missing", because it falls back.
        PageTranslation::create([
            'page_id' => $this->page->id,
            'locale' => 'it',
            'title' => 'Privacy',
            'content' => '   ',
        ]);

        $states = Livewire::test(Pages::class)
            ->call('edit', $this->page->id)
            ->get('localeStates');

        $this->assertSame('done', $states['en']);
        $this->assertSame('done', $states['de']);
        $this->assertSame('draft', $states['fr']);
        $this->assertSame('missing', $states['it']);
        $this->assertSame('missing', $states['ja']);
    }

    public function test_a_translation_needs_a_title_but_slug_rules_do_not_apply(): void
    {
        // Slug uniqueness is validated on the base tab only; a translation
        // that had to satisfy it would fail against its own page.
        Livewire::test(Pages::class)
            ->call('edit', $this->page->id)
            ->call('switchLocale', 'de')
            ->set('title', '')
            ->set('content', '<p>Deutscher Text.</p>')
            ->call('save')
            ->assertHasErrors(['title']);
    }

    public function test_unknown_locales_are_ignored(): void
    {
        Livewire::test(Pages::class)
            ->call('edit', $this->page->id)
            ->call('switchLocale', 'klingon')
            ->assertSet('locale', 'en');
    }
}
