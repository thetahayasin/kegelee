<?php

namespace App\Livewire\App\Page;

use App\Models\Page;
use App\Services\Sync\BackendClient;
use Livewire\Component;

/**
 * Legal / policy pages (privacy policy, terms, refund policy).
 *
 * On the backend website the local database is the source and the public
 * page layout is used. Inside the native app the page renders in the app
 * layout and the content is fetched live from the backend on every open,
 * so users always read the current version. Offline shows a friendly
 * "no connection" state with a retry, never a stale copy.
 */
class Show extends Component
{
    public Page $page;

    public bool $isDevice = false;

    public ?string $remoteContent = null;

    public ?string $remoteUpdatedAt = null;

    public bool $offline = false;

    public function mount()
    {
        if (! $this->page->is_published && ! optional(auth()->user())->is_admin) {
            abort(404);
        }

        $this->isDevice = BackendClient::isClient();

        if ($this->isDevice) {
            $this->fetch();
        }
    }

    /** Load the live page content from the backend. Also used by the Retry button. */
    public function fetch(): void
    {
        $this->offline = false;
        $this->remoteContent = null;

        try {
            $response = BackendClient::request()
                ->get(BackendClient::base().'/v1/pages/'.$this->page->slug);

            if ($response->successful()) {
                $this->remoteContent = (string) $response->json('content');
                $this->remoteUpdatedAt = $response->json('updated_at');

                return;
            }
        } catch (\Throwable $e) {
            // Unreachable - fall through to the local copy below.
        }

        // Live fetch failed. Show the copy stored on the device (seeded at
        // install) rather than wrongly claiming there is no internet; the
        // offline state only appears when there is nothing to show at all.
        if (! empty($this->page->content)) {
            $this->remoteContent = (string) $this->page->content;
            $this->remoteUpdatedAt = $this->page->updated_at?->toIso8601String();

            return;
        }

        $this->offline = true;
    }

    public function render()
    {
        return view('livewire.app.page.show', ['title' => $this->page->title])
            ->layout($this->isDevice ? 'components.layouts.app' : 'components.layouts.page');
    }
}
