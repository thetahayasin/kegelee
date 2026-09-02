<?php

namespace App\Livewire\App\Page;

use App\Models\Page;
use App\Support\Locales;
use Livewire\Attributes\Layout;
use Livewire\Component;

/**
 * Legal / policy pages (privacy policy, terms, refund policy) on the website.
 *
 * These URLs are what the Play listing points at, so they stay public and
 * server-rendered. The mobile app reads the same pages through the API
 * (GET /api/v1/pages/{slug}), which is why this no longer has a device branch.
 */
#[Layout('components.layouts.page')]
class Show extends Component
{
    public Page $page;

    /** Language actually being shown, which is English unless a translation exists. */
    public string $locale = Locales::BASE;

    public bool $isRtl = false;

    public function mount(): void
    {
        if (! $this->page->is_published && ! optional(auth()->user())->is_admin) {
            abort(404);
        }

        // ?locale=de on the public URL. There is no language switcher on the
        // website yet, so this is here for deep links (and for the Play
        // listing's policy URL, which can point at a translated copy).
        $localized = $this->page->localized(Locales::resolve(request()->query('locale')));

        $this->locale = $localized['locale'];
        $this->isRtl = Locales::isRtl($this->locale);

        // Render the translated copy rather than the base row.
        $this->page->title = $localized['title'];
        $this->page->content = $localized['content'];
    }

    public function render()
    {
        return view('livewire.app.page.show', ['title' => $this->page->title]);
    }
}
