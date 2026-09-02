<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class AdminMaintenanceController extends Controller
{
    /** POST /mystic/logout */
    public function logout(Request $request)
    {
        auth()->logout();

        // The session is what proved the admin was an admin, so it goes with
        // them: invalidate it and mint a fresh CSRF token rather than leaving
        // the old id usable.
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect()->route('admin.login');
    }
}
