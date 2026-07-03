<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Support\Facades\DB;

class AdminMaintenanceController extends Controller
{
    /** POST /admin/reset-progress - wipe every app user's training progress. */
    public function resetProgress()
    {
        $userIds = User::where('is_admin', false)->pluck('id');
        DB::table('training_days')->whereIn('user_id', $userIds)->delete();
        DB::table('workout_sessions')->whereIn('user_id', $userIds)->delete();
        DB::table('measurements')->whereIn('user_id', $userIds)->delete();
        DB::table('knowledge_lesson_user')->whereIn('user_id', $userIds)->delete();
        DB::table('reminders')->whereIn('user_id', $userIds)->delete();
        User::whereIn('id', $userIds)->update(['onboarded_at' => null, 'level_started_days' => 0]);

        return back()->with('status', 'All app progress has been reset.');
    }

    /** GET /admin/logout */
    public function logout()
    {
        auth()->logout();

        return redirect()->route('admin.login');
    }
}
