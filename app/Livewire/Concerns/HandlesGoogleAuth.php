<?php

namespace App\Livewire\Concerns;

use App\Services\Sync\BackendClient;

/**
 * Starts "Continue with Google" from any auth surface.
 *
 * Google blocks OAuth inside the app's embedded WebView, so on the device we
 * navigate to the backend's OAuth URL: the WebView intercepts any external
 * https main-frame navigation and opens it in the SYSTEM BROWSER (see
 * WebViewManager.shouldOverrideUrlLoading), which Google allows. The flow
 * returns through the kegelee:// deeplink. (Browser::auth() is NOT used - it
 * has no Android bridge handler and silently does nothing there.)
 * On the web backend we use the normal same-site OAuth redirect.
 */
trait HandlesGoogleAuth
{
    public function continueWithGoogle()
    {
        if (BackendClient::isClient()) {
            // BackendClient::base() ends in /api; Google routes live at the origin.
            $origin = preg_replace('#/api/?$#', '', (string) BackendClient::base());

            return $this->redirect($origin.'/auth/google/native');
        }

        return $this->redirect(route('auth.google'));
    }
}
