<?php

namespace App\Http\Controllers;

use App\Services\SettingsService;

class LandingController extends Controller
{
    /**
     * GET / - the public marketing homepage when enabled; otherwise route
     * users straight into the app flow.
     */
    public function __invoke(SettingsService $settings)
    {
        // When a public marketing homepage is enabled, always show it -
        // authenticated users navigate to the app via the "Open App" link.
        if ($settings->get('homepage_enabled', true)) {
            return view('landing');
        }

        // Homepage disabled (native-app / no-marketing mode).
        if (auth()->check() && auth()->user()->onboarded_at) {
            return redirect()->route('home');
        }

        return redirect()->route('onboarding');
    }
}
