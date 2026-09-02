<?php

namespace App\Livewire\Admin;

use App\Models\Page;
use App\Models\PageTranslation;
use App\Support\Locales;
use Illuminate\Support\Str;
use Livewire\Attributes\Layout;
use Livewire\Component;

/**
 * Legal page editor, with one tab per language.
 *
 * English is the base row in `pages` and owns everything structural - slug,
 * published, sort order. Every other language is a row in `page_translations`
 * holding only a title and body, because those are the only things that differ
 * between languages; letting a translator change the slug would break the
 * URL the Play listing points at.
 */
#[Layout('components.layouts.admin')]
class Pages extends Component
{
    public ?int $editingId = null;

    public string $title = '';
    public string $slug = '';
    public string $content = '';
    public bool $is_published = true;
    public int $sort_order = 0;

    /** Which language tab is open. 'en' edits the base page itself. */
    public string $locale = Locales::BASE;

    /** Whether a human has checked this translation. Base language is always true. */
    public bool $is_reviewed = false;

    public ?string $savedMessage = null;

    public function newPage(): void
    {
        $this->reset(['editingId', 'title', 'slug', 'content']);
        $this->locale = Locales::BASE;
        $this->is_reviewed = false;
        $this->is_published = true;
        $this->sort_order = (int) Page::max('sort_order') + 1;
    }

    public function edit(int $id): void
    {
        $this->editingId = $id;
        // Always land on the base language: it is the one that must exist, and
        // it is what everything falls back to.
        $this->locale = Locales::BASE;
        $this->loadLocale();
    }

    public function switchLocale(string $locale): void
    {
        if (! Locales::isSupported($locale)) {
            return;
        }

        $this->locale = $locale;
        $this->resetValidation();
        $this->loadLocale();
    }

    /** Fill the form from whichever row the current language maps to. */
    private function loadLocale(): void
    {
        $page = Page::findOrFail($this->editingId);

        $this->slug = $page->slug;
        $this->is_published = $page->is_published;
        $this->sort_order = $page->sort_order;
        $this->savedMessage = null;

        if ($this->isBase()) {
            $this->title = $page->title;
            $this->content = (string) $page->content;
            $this->is_reviewed = true;

            return;
        }

        $translation = $page->translations()->where('locale', $this->locale)->first();

        // No row yet: start from empty rather than pre-filling with English.
        // A translator seeing English text in the box is one distraction away
        // from saving it untouched, and that would look translated while not
        // being translated - worse than an obvious gap.
        $this->title = $translation->title ?? '';
        $this->content = (string) ($translation->content ?? '');
        $this->is_reviewed = (bool) ($translation->is_reviewed ?? false);
    }

    public function save(): void
    {
        if ($this->isBase()) {
            $this->saveBase();

            return;
        }

        // A translation needs a page to hang off. Without this guard, saving
        // on a language tab before the page existed wrote a PageTranslation
        // with page_id = null.
        if (! $this->editingId) {
            return;
        }

        $this->validate([
            'title' => 'required|string|max:160',
            'content' => 'nullable|string',
        ]);

        PageTranslation::updateOrCreate(
            ['page_id' => $this->editingId, 'locale' => $this->locale],
            [
                'title' => $this->title,
                'content' => $this->content,
                'is_reviewed' => $this->is_reviewed,
            ],
        );

        $this->savedMessage = Locales::SUPPORTED[$this->locale].' saved.';
        // Saving is not discarding: clears the editor's unsaved-changes guard.
        $this->dispatch('page-saved');
    }

    private function saveBase(): void
    {
        $this->slug = $this->slug ?: Str::slug($this->title);

        $this->validate([
            'title' => 'required|string|max:160',
            'slug' => 'required|alpha_dash|unique:pages,slug,'.($this->editingId ?? 'NULL').',id',
            'content' => 'nullable|string',
            'sort_order' => 'integer|min:0',
        ]);

        $page = $this->editingId ? Page::find($this->editingId) : new Page();
        $page->fill([
            'title' => $this->title,
            'slug' => $this->slug,
            'content' => $this->content,
            'is_published' => $this->is_published,
            'sort_order' => $this->sort_order,
        ])->save();

        $this->editingId = $page->id;
        $this->savedMessage = 'Page saved.';
        $this->dispatch('page-saved');
    }

    /** Drop this language's translation; the page falls back to English again. */
    public function deleteTranslation(): void
    {
        if ($this->isBase() || ! $this->editingId) {
            return;
        }

        PageTranslation::where('page_id', $this->editingId)
            ->where('locale', $this->locale)
            ->delete();

        $this->title = '';
        $this->content = '';
        $this->is_reviewed = false;
        $this->savedMessage = Locales::SUPPORTED[$this->locale].' translation removed.';
    }

    public function delete(int $id): void
    {
        // Translations go with it (cascadeOnDelete on the foreign key).
        Page::findOrFail($id)->delete();
        if ($this->editingId === $id) {
            $this->newPage();
        }
    }

    public function isBase(): bool
    {
        return $this->locale === Locales::BASE;
    }

    /**
     * Per-language state for the tab strip: 'done' (reviewed), 'draft'
     * (translated, not signed off) or 'missing' (falls back to English).
     *
     * @return array<string,string>
     */
    public function getLocaleStatesProperty(): array
    {
        $states = [];
        foreach (array_keys(Locales::SUPPORTED) as $tag) {
            $states[$tag] = 'missing';
        }
        $states[Locales::BASE] = 'done';

        if (! $this->editingId) {
            return $states;
        }

        $rows = PageTranslation::where('page_id', $this->editingId)->get();
        foreach ($rows as $row) {
            if (! array_key_exists($row->locale, $states)) {
                continue;
            }
            if (trim((string) $row->content) === '') {
                continue;
            }
            $states[$row->locale] = $row->is_reviewed ? 'done' : 'draft';
        }

        return $states;
    }

    public function render()
    {
        return view('livewire.admin.pages', [
            'pages' => Page::orderBy('sort_order')->get(),
            'locales' => Locales::SUPPORTED,
            'localeStates' => $this->localeStates,
            'isRtl' => Locales::isRtl($this->locale),
        ]);
    }
}
