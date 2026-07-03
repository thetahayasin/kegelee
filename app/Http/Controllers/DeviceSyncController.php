<?php

namespace App\Http\Controllers;

use App\Models\KnowledgeLesson;
use App\Services\Sync\BackendClient;
use App\Services\Sync\ContentSyncService;
use App\Services\Sync\UserSyncService;
use Illuminate\Http\JsonResponse;

/**
 * Device-local sync endpoints (the app's own webview calls these on its
 * local server). No-ops on the backend, where the install is not a client.
 */
class DeviceSyncController extends Controller
{
    /**
     * POST /sync/run - the app calls this when connectivity returns so fresh
     * backend data lands immediately instead of waiting for the next
     * navigation.
     */
    public function run(ContentSyncService $content, UserSyncService $userSync): JsonResponse
    {
        $diag = BackendClient::diagnostics();

        if (! BackendClient::isClient()) {
            return response()->json(['ok' => false, 'reason' => 'not_a_client', 'diagnostics' => $diag]);
        }

        $changed = $content->pull();

        if ($user = auth()->user()) {
            $userSync->push($user);
            $userSync->pull($user);
        }

        return response()->json([
            'ok' => $content->report['ok'] ?? false,
            'changed' => $changed,
            'content' => $content->report,
            'diagnostics' => $diag,
        ]);
    }

    /**
     * GET /sync/status - plain-GET diagnostic: open on the device to see
     * exactly why sync is or is not working. Safe to leave in.
     */
    public function status(ContentSyncService $content): JsonResponse
    {
        $diag = BackendClient::diagnostics();
        $content->pull();

        return response()->json([
            'diagnostics' => $diag,
            'content_pull' => $content->report,
            'local_lesson_count' => KnowledgeLesson::count(),
        ], 200, [], JSON_PRETTY_PRINT);
    }
}
