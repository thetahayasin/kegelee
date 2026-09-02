<?php

namespace App\Livewire\Admin\Reports;

use App\Support\Reports\Window;
use Illuminate\Support\Facades\Cache;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Url;
use Livewire\Component;

/**
 * What every report page has in common: a window, a cache and a refresh.
 *
 * The six pages ask completely different questions, but they all answer them
 * the same way - count something over 7, 30 or 90 days, compare it with the
 * period before, and do not run the same expensive fold twice in ten minutes.
 * That much lives here so each page is only its own queries and its own words.
 */
#[Layout('components.layouts.admin')]
abstract class ReportPage extends Component
{
    /** Days back. In the URL so a view can be shared or bookmarked. */
    #[Url]
    public int $days = Window::DEFAULT;

    public ?string $statusMessage = null;

    /** The cache key stem for this page. One word, used in URLs and keys. */
    abstract public function slug(): string;

    /**
     * Everything the view needs, as one array.
     *
     * One method rather than a dozen, so the whole page is one cache entry and
     * "Refresh" is one forget rather than a list of keys that will drift out of
     * date the first time somebody adds a card.
     *
     * @return array<string, mixed>
     */
    abstract protected function build(Window $window): array;

    public function setDays(int $days): void
    {
        // Bounded rather than trusted: this comes off the query string.
        $this->days = Window::of($days)->days;
        $this->statusMessage = null;
    }

    /**
     * Throw this page's cached figures away and count again.
     *
     * Ten minutes is long enough that clicking between pages is instant and
     * short enough that nobody is looking at yesterday. The button exists for
     * the one case that matters: somebody has just changed something and wants
     * to see whether it moved.
     */
    public function refreshData(): void
    {
        Cache::forget($this->cacheKey());
        $this->statusMessage = 'Counted again just now.';
    }

    protected function window(): Window
    {
        return Window::of($this->days);
    }

    protected function cacheKey(): string
    {
        return 'reports:'.$this->slug().':'.$this->window()->days;
    }

    public function render()
    {
        $window = $this->window();

        $data = Cache::remember($this->cacheKey(), 600, fn () => $this->build($window));

        return view('livewire.admin.reports.'.$this->slug(), array_merge($data, [
            'days' => $window->days,
            'window' => $window,
            'reportSlug' => $this->slug(),
        ]));
    }
}
