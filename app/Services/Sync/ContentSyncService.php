<?php

namespace App\Services\Sync;

use App\Models\KnowledgeLesson;
use App\Models\Page;
use Illuminate\Support\Facades\Log;

/**
 * Pulls the small backend-managed catalogue into this device's local SQLite:
 * knowledge lessons (their videos stream online-only from the backend) and
 * legal page titles (their content is fetched live, never cached).
 *
 * Exercises, levels, onboarding and plans are hardcoded in the app
 * (App\Support catalogues) and are never synced.
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

            // Apply each domain independently: a failure in one must never
            // roll back the other.
            $domains = [
                'knowledge' => fn () => $this->applyKnowledge($data['knowledge_lessons'] ?? []),
                'pages'     => fn () => $this->applyPages($data['pages'] ?? []),
            ];

            $domainStatus = [];
            foreach ($domains as $name => $apply) {
                try {
                    $apply();
                    $domainStatus[$name] = 'ok';
                } catch (\Throwable $e) {
                    $domainStatus[$name] = $e->getMessage();
                    Log::warning("Content sync [$name] failed: ".$e->getMessage());
                }
            }

            $this->report['ok'] = empty(array_filter($domainStatus, fn ($s) => $s !== 'ok'));
            $this->report['domains'] = $domainStatus;
            $this->report['counts'] = [
                'knowledge' => count($data['knowledge_lessons'] ?? []),
                'pages'     => count($data['pages'] ?? []),
            ];

            return true;
        } catch (\Throwable $e) {
            $this->report['error'] = $e->getMessage();
            Log::warning('Content sync pull failed: '.$e->getMessage());

            return false;
        }
    }

    /** @param array<int, array<string, mixed>> $rows */
    private function applyKnowledge(array $rows): void
    {
        $ids = array_filter(array_column($rows, 'id'));
        KnowledgeLesson::whereNotIn('id', $ids)->update(['is_active' => false]);

        foreach ($rows as $row) {
            if (empty($row['id'])) {
                continue;
            }

            KnowledgeLesson::updateOrCreate(['id' => $row['id']], [
                'title'       => $row['title'] ?? '',
                'description' => $row['description'] ?? null,
                // The backend already resolved a streamable URL; store it directly
                // in video_url so videoSrc() serves it without local storage.
                'video_url'   => $row['video_src'] ?? null,
                'video_path'  => null,
                'sort_order'  => $row['sort_order'] ?? 0,
                'is_active'   => true,
            ]);
        }
    }

    /**
     * Only the page LIST syncs (slug, title, order) so Settings can show the
     * legal links. The page content itself is fetched live when opened -
     * legal documents are online-only so users always see the current version.
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

            Page::updateOrCreate(['slug' => $row['slug']], [
                'title'        => $row['title'] ?? '',
                'sort_order'   => $row['sort_order'] ?? 0,
                'is_published' => true,
            ]);
        }
    }
}
