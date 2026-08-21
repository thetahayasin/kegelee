<?php

namespace App\Http\Controllers;

class AdminMaintenanceController extends Controller
{
    /** GET /mystic/logout */
    public function logout()
    {
        auth()->logout();

        return redirect()->route('admin.login');
    }
}
