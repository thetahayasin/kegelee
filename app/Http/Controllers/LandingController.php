<?php

namespace App\Http\Controllers;

use App\Services\SettingsService;

class LandingController extends Controller
{
    /**
     * GET / - the public marketing homepage.
     *
     * There is no web app behind it any more: the product is the mobile app,
     * and this page's job is to explain it and link to the store listing.
     */
    public function __invoke(SettingsService $settings)
    {
        // Homepage switched off from the admin panel. The legal pages are the
        // only other public surface, and they have to stay reachable because
        // the Play listing links straight at them.
        if (! $settings->get('homepage_enabled', true)) {
            return redirect()->route('legal.index');
        }

        return view('landing');
    }
}
