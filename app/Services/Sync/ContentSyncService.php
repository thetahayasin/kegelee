<?php

namespace App\Services\Sync;

use App\Livewire\Admin\Settings as AdminSettings;
use App\Models\Exercise;
use App\Models\KnowledgeLesson;
use App\Models\Level;
use App\Models\OnboardingSlide;
use App\Services\SettingsService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * Pulls the content catalogue (exercises, levels, onboarding, knowledge lessons
 * and app settings) from the remote backend into this device's local SQLite.
 *
 * The app renders every page server-side from the local database, so content
 * MUST land in SQLite (not just IndexedDB) for it to appear. This is the engine
 * that makes admin-managed content show up in the native app.
 */
class ContentSyncService
{
    /** Last pull outcome, for on-device diagnostics. */
    public array $report = ['ran' => false];

    /** @var array<string, array<int, string>> table => column names */
    private array $columnCache = [];

    public function __construct(private readonly SettingsService $settings)
    {
    }

    /**
     * Keep only the keys that are real columns on the given table. The device's
     * schema can differ from the backend's (e.g. exercises has no video_path),
     * so writing an unknown column would throw and roll the whole pull back.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function fillable(string $table, array $data): array
    {
        $cols = $this->columnCache[$table] ??= Schema::getColumnListing($table);

        return array_intersect_key($data, array_flip($cols));
    }

    /**
     * Fetch and apply the remote catalogue. Returns true if anything changed.
     * Never throws — a sync failure must never break a page render. The detailed
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

            // Apply each domain INDEPENDENTLY (no shared transaction): a failure
            // in one (e.g. a foreign-key hiccup on the pivot) must never roll
            // back the others. Parents (exercises, levels) before the pivot.
            $domains = [
                'exercises'       => fn () => $this->applyExercises($data['exercises'] ?? []),
                'levels'          => fn () => $this->applyLevels($data['levels'] ?? []),
                'exercise_levels' => fn () => $this->applyExerciseLevels($data['exercise_levels'] ?? []),
                'onboarding'      => fn () => $this->applyOnboarding($data['onboarding_slides'] ?? []),
                'knowledge'       => fn () => $this->applyKnowledge($data['knowledge_lessons'] ?? []),
                'settings'        => fn () => $this->applySettings($data['settings'] ?? []),
                'plans'           => fn () => $this->applyPlans($data['plans'] ?? []),
                'discounts'       => fn () => $this->applyDiscounts($data['discounts'] ?? []),
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
                'exercises' => count($data['exercises'] ?? []),
                'levels'    => count($data['levels'] ?? []),
                'knowledge' => count($data['knowledge_lessons'] ?? []),
                'plans'     => count($data['plans'] ?? []),
                'discounts' => count($data['discounts'] ?? []),
            ];

            return true;
        } catch (\Throwable $e) {
            $this->report['error'] = $e->getMessage();
            Log::warning('Content sync pull failed: '.$e->getMessage());

            return false;
        }
    }

    /** @param array<int, array<string, mixed>> $rows */
    private function applyExercises(array $rows): void
    {
        $ids = array_filter(array_column($rows, 'id'));
        Exercise::whereNotIn('id', $ids)->update(['is_active' => false]);

        foreach ($rows as $row) {
            if (empty($row['id'])) {
                continue;
            }

            Exercise::updateOrCreate(['id' => $row['id']], $this->fillable('exercises', [
                'slug'               => $row['slug'] ?? null,
                'name'               => $row['name'] ?? '',
                'description'        => $row['description'] ?? null,
                'instructions'       => $row['instructions'] ?? null,
                'contract_seconds'   => $row['contract_seconds'] ?? 0,
                'relax_seconds'      => $row['relax_seconds'] ?? 0,
                'hold_seconds'       => $row['hold_seconds'] ?? 0,
                'min_duration'       => $row['min_duration'] ?? 0,
                'max_duration'       => $row['max_duration'] ?? 0,
                'is_active'          => $row['is_active'] ?? true,
                'full_hold'          => $row['full_hold'] ?? false,
                'start_phase'        => $row['start_phase'] ?? 'relax',
                'contract_glow_mode' => $row['contract_glow_mode'] ?? null,
                'relax_glow_mode'    => $row['relax_glow_mode'] ?? null,
                'contract_label'     => $row['contract_label'] ?? null,
                'relax_label'        => $row['relax_label'] ?? null,
                'unlock_after_days'  => $row['unlock_after_days'] ?? 0,
                'sort_order'         => $row['sort_order'] ?? 0,
                // Store the absolute backend URL; the model accessors pass it through.
                'icon_path'          => $row['icon_url'] ?? null,
                'video_path'         => $row['video_url'] ?? null,
            ]));
        }
    }

    /** @param array<int, array<string, mixed>> $rows */
    private function applyExerciseLevels(array $rows): void
    {
        if (! $rows) {
            return;
        }

        // Only link pivots whose parents exist locally — otherwise the FK
        // constraint throws (exactly what was rolling the whole pull back).
        $exerciseIds = array_flip(Exercise::pluck('id')->all());
        $levelIds = array_flip(Level::pluck('id')->all());

        // Clear existing local pivots before rewriting them
        DB::table('exercise_level')->truncate();

        foreach ($rows as $row) {
            $exerciseId = $row['exercise_id'] ?? null;
            $levelId = $row['level_id'] ?? null;

            if (! $exerciseId || ! $levelId) {
                continue;
            }
            if (! isset($exerciseIds[$exerciseId], $levelIds[$levelId])) {
                continue;
            }

            DB::table('exercise_level')->updateOrInsert(
                ['exercise_id' => $exerciseId, 'level_id' => $levelId],
                ['duration_seconds' => $row['duration_seconds'] ?? 30, 'updated_at' => now()],
            );
        }
    }

    /** @param array<int, array<string, mixed>> $rows */
    private function applyLevels(array $rows): void
    {
        $ids = array_filter(array_column($rows, 'id'));
        Level::whereNotIn('id', $ids)->update(['is_active' => false]);

        foreach ($rows as $row) {
            if (empty($row['id'])) {
                continue;
            }

            Level::updateOrCreate(['id' => $row['id']], $this->fillable('levels', [
                'number'                => $row['number'] ?? 1,
                'name'                  => $row['name'] ?? '',
                'description'           => $row['description'] ?? null,
                'total_session_seconds' => $row['total_session_seconds'] ?? 0,
                'rest_seconds'          => $row['rest_seconds'] ?? 0,
                'min_exercises'         => $row['min_exercises'] ?? 0,
                'days_to_complete'      => $row['days_to_complete'] ?? 30,
                'sessions_per_day'      => $row['sessions_per_day'] ?? null,
                'is_active'             => true,
            ]));
        }
    }

    /** @param array<int, array<string, mixed>> $rows */
    private function applyOnboarding(array $rows): void
    {
        $ids = array_filter(array_column($rows, 'id'));
        OnboardingSlide::whereNotIn('id', $ids)->update(['is_active' => false]);

        foreach ($rows as $row) {
            if (empty($row['id'])) {
                continue;
            }

            OnboardingSlide::updateOrCreate(['id' => $row['id']], $this->fillable('onboarding_slides', [
                'title'      => $row['title'] ?? '',
                'body'       => $row['body'] ?? null,
                'icon'       => $row['icon'] ?? null,
                'cta_label'  => $row['cta_label'] ?? null,
                'media_path' => $row['media_url'] ?? null,
                'sort_order' => $row['sort_order'] ?? 0,
                'is_active'  => true,
            ]));
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

            KnowledgeLesson::updateOrCreate(['id' => $row['id']], $this->fillable('knowledge_lessons', [
                'title'       => $row['title'] ?? '',
                'description' => $row['description'] ?? null,
                // The backend already resolved a streamable URL; store it directly
                // in video_url so videoSrc() serves it without local storage.
                'video_url'   => $row['video_src'] ?? null,
                'video_path'  => null,
                'sort_order'  => $row['sort_order'] ?? 0,
                'is_active'   => true,
            ]));
        }
    }

    /** @param array<string, mixed> $settings */
    private function applySettings(array $settings): void
    {
        foreach ($settings as $key => $value) {
            if ($value === null) {
                continue;
            }
            $type = AdminSettings::TYPES[$key] ?? 'string';
            $this->settings->set($key, $value, $type);
        }
    }

    /** @param array<int, array<string, mixed>> $rows */
    private function applyPlans(array $rows): void
    {
        $ids = array_filter(array_column($rows, 'id'));
        \App\Models\Plan::whereNotIn('id', $ids)->update(['is_active' => false]);

        foreach ($rows as $row) {
            if (empty($row['id'])) {
                continue;
            }

            \App\Models\Plan::updateOrCreate(['id' => $row['id']], $this->fillable('plans', [
                'name'             => $row['name'] ?? '',
                'slug'             => $row['slug'] ?? '',
                'description'      => $row['description'] ?? null,
                'price'            => $row['price'] ?? 0,
                'currency'         => $row['currency'] ?? 'USD',
                'interval'         => $row['interval'] ?? 'month',
                'interval_count'   => $row['interval_count'] ?? 1,
                'features'         => isset($row['features']) ? (is_array($row['features']) ? json_encode($row['features']) : $row['features']) : null,
                'store_product_id' => $row['store_product_id'] ?? null,
                'is_active'        => $row['is_active'] ?? true,
                'is_featured'      => $row['is_featured'] ?? false,
                'sort_order'       => $row['sort_order'] ?? 0,
            ]));
        }
    }

    /** @param array<int, array<string, mixed>> $rows */
    private function applyDiscounts(array $rows): void
    {
        $ids = array_filter(array_column($rows, 'id'));
        \App\Models\Discount::whereNotIn('id', $ids)->update(['is_active' => false]);

        foreach ($rows as $row) {
            if (empty($row['id'])) {
                continue;
            }

            \App\Models\Discount::updateOrCreate(['id' => $row['id']], $this->fillable('discounts', [
                'code'            => $row['code'] ?? '',
                'description'     => $row['description'] ?? null,
                'type'            => $row['type'] ?? 'percent',
                'value'           => $row['value'] ?? 0,
                'max_redemptions' => $row['max_redemptions'] ?? null,
                'redemptions'     => $row['redemptions'] ?? 0,
                'starts_at'       => !empty($row['starts_at']) ? now()->parse($row['starts_at']) : null,
                'expires_at'      => !empty($row['expires_at']) ? now()->parse($row['expires_at']) : null,
                'is_active'       => $row['is_active'] ?? true,
            ]));
        }
    }
}
