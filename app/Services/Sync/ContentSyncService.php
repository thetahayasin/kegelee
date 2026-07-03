<?php

namespace App\Services\Sync;

use App\Models\Page;
use Illuminate\Support\Facades\Log;

/**
 * Pulls the only backend-managed content left into this device's local
 * SQLite: legal pages (their content doubles as the offline fallback copy;
 * opening a page always fetches the live version first).
 *
 * Exercises, levels, onboarding, plans and the basics tutorials are all
 * hardcoded in the app (App\Support catalogues) and are never synced.
 */
class ContentSyncService
{
    /** Last pull outcome, for on-device diagnostics. */
    public array $report = ['ran' => false];

    /**
     * Fetch and apply the remote catalogue. Returns true if anything changed.
     * Never throws - a sync failure must never break a page render. The detailed
     * outcome (http status / error / counts) is recorded in $this->report.
     */
    public function pull(): bool
    {
        $this->report = ['ran' => true, 'ok' => false, 'http' => null, 'error' => null, 'counts' => []];

        if (! BackendClient::isClient()) {
            $this->report['error'] = 'not_a_client';
            return false;
        }

        try {
            $response = BackendClient::request()->get(BackendClient::base().'/v1/content');
            $this->report['http'] = $response->status();

            if (! $response->successful()) {
                $this->report['error'] = 'http_'.$response->status();
                return false;
            }

            $data = $response->json();
            if (! is_array($data)) {
                $this->report['error'] = 'bad_json';
                return false;
            }

            try {
                $this->applyPages($data['pages'] ?? []);
                $this->report['ok'] = true;
            } catch (\Throwable $e) {
                $this->report['error'] = $e->getMessage();
                Log::warning('Content sync [pages] failed: '.$e->getMessage());
            }

            $this->report['counts'] = ['pages' => count($data['pages'] ?? [])];

            return true;
        } catch (\Throwable $e) {
            $this->report['error'] = $e->getMessage();
            Log::warning('Content sync pull failed: '.$e->getMessage());

            return false;
        }
    }

    /**
     * Legal pages: the list powers the Settings links and the content is the
     * device's fallback copy. Opening a page always fetches the live version
     * from the backend first, so users normally read the current text.
     *
     * @param array<int, array<string, mixed>> $rows
     */
    private function applyPages(array $rows): void
    {
        if (! $rows) {
            return;
        }

        $slugs = array_filter(array_column($rows, 'slug'));
        Page::whereNotIn('slug', $slugs)->update(['is_published' => false]);

        foreach ($rows as $row) {
            if (empty($row['slug'])) {
                continue;
            }

            $attributes = [
                'title'        => $row['title'] ?? '',
                'sort_order'   => $row['sort_order'] ?? 0,
                'is_published' => true,
            ];
            if (array_key_exists('content', $row) && $row['content'] !== null) {
                $attributes['content'] = $row['content'];
            }

            Page::updateOrCreate(['slug' => $row['slug']], $attributes);
        }
    }
}
