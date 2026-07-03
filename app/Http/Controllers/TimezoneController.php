<?php

namespace App\Http\Controllers;

use App\Services\Sync\BackendClient;
use App\Services\Sync\UserSyncService;
use Illuminate\Http\Request;

class TimezoneController extends Controller
{
    /**
     * POST /timezone - stores the device timezone (captured client-side on
     * first load) so day boundaries follow the user's local day.
     */
    public function __invoke(Request $request, UserSyncService $userSync)
    {
        $tz = (string) $request->input('timezone');

        if ($tz !== '' && in_array($tz, timezone_identifiers_list(), true)) {
            $user = $request->user();
            if ($user->timezone !== $tz) {
                $user->update(['timezone' => $tz]);
                // On a device, propagate the new timezone up to the backend now.
                if (BackendClient::isClient()) {
                    $userSync->push($user);
                }
            }
        }

        return response()->noContent();
    }
}
