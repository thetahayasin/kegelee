<?php

namespace App\Livewire\Concerns;

use App\Services\Sync\BackendClient;
use Native\Mobile\Facades\Browser;

/**
 * Starts "Continue with Google" from any auth surface.
 *
 * Google blocks OAuth inside the app's embedded WebView, so on the device we
 * open it in a Custom Tab via Browser::auth() (which Google allows) and return
 * through the kegelee:// deeplink. On the web we use the normal OAuth redirect.
 */
trait HandlesGoogleAuth
{
    public function continueWithGoogle()
    {
        if (BackendClient::isClient()) {
            // BackendClient::base() ends in /api; Google routes live at the origin.
            $origin = preg_replace('#/api/?$#', '', (string) BackendClient::base());
            Browser::auth($origin.'/auth/google/native');

            return;
        }

        return $this->redirect(route('auth.google'));
    }
}
