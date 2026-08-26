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
        // App closed: every onward destination ('/welcome', '/app', the
        // knowledge base) is behind 'app.enabled', which redirects back here.
        // Redirecting on would be an infinite loop, so show the homepage and
        // let its app_disabled notice explain why there is nowhere to go.
        if (! $settings->get('app_enabled', true)) {
            return view('landing');
        }

        // When a public marketing homepage is enabled, always show it -
        // visitors reach the store listing via the "Download" link.
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
