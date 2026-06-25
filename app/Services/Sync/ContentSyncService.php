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

    public function __construct(private readonly SettingsService $settings)
    {
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

            DB::transaction(function () use ($data) {
                $this->applyExercises($data['exercises'] ?? []);
                $this->applyExerciseLevels($data['exercise_levels'] ?? []);
                $this->applyLevels($data['levels'] ?? []);
                $this->applyOnboarding($data['onboarding_slides'] ?? []);
                $this->applyKnowledge($data['knowledge_lessons'] ?? []);
                $this->applySettings($data['settings'] ?? []);
            });

            $this->report['ok'] = true;
            $this->report['counts'] = [
                'exercises' => count($data['exercises'] ?? []),
                'levels'    => count($data['levels'] ?? []),
                'knowledge' => count($data['knowledge_lessons'] ?? []),
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
        foreach ($rows as $row) {
            if (empty($row['id'])) {
                continue;
            }

            Exercise::updateOrCreate(['id' => $row['id']], [
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
            ]);
        }
    }

    /** @param array<int, array<string, mixed>> $rows */
    private function applyExerciseLevels(array $rows): void
    {
        foreach ($rows as $row) {
            if (empty($row['exercise_id']) || empty($row['level_id'])) {
                continue;
            }

            DB::table('exercise_level')->updateOrInsert(
                ['exercise_id' => $row['exercise_id'], 'level_id' => $row['level_id']],
                ['duration_seconds' => $row['duration_seconds'] ?? 30, 'updated_at' => now()],
            );
        }
    }

    /** @param array<int, array<string, mixed>> $rows */
    private function applyLevels(array $rows): void
    {
        foreach ($rows as $row) {
            if (empty($row['id'])) {
                continue;
            }

            Level::updateOrCreate(['id' => $row['id']], [
                'number'                => $row['number'] ?? 1,
                'name'                  => $row['name'] ?? '',
                'description'           => $row['description'] ?? null,
                'total_session_seconds' => $row['total_session_seconds'] ?? 0,
                'rest_seconds'          => $row['rest_seconds'] ?? 0,
                'min_exercises'         => $row['min_exercises'] ?? 0,
                'days_to_complete'      => $row['days_to_complete'] ?? 30,
                'sessions_per_day'      => $row['sessions_per_day'] ?? null,
                'is_active'             => true,
            ]);
        }
    }

    /** @param array<int, array<string, mixed>> $rows */
    private function applyOnboarding(array $rows): void
    {
        foreach ($rows as $row) {
            if (empty($row['id'])) {
                continue;
            }

            OnboardingSlide::updateOrCreate(['id' => $row['id']], [
                'title'      => $row['title'] ?? '',
                'body'       => $row['body'] ?? null,
                'icon'       => $row['icon'] ?? null,
                'cta_label'  => $row['cta_label'] ?? null,
                'media_path' => $row['media_url'] ?? null,
                'sort_order' => $row['sort_order'] ?? 0,
                'is_active'  => true,
            ]);
        }
    }

    /** @param array<int, array<string, mixed>> $rows */
    private function applyKnowledge(array $rows): void
    {
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
}
