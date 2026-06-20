<?php

namespace App\Http\Controllers;

use App\Services\IcsBuilder;
use Illuminate\Http\Response;

class ReminderIcsController extends Controller
{
    public function download(IcsBuilder $builder): Response
    {
        $ics = $builder->forUser(auth()->user());

        return response($ics, 200, [
            'Content-Type' => 'text/calendar; charset=utf-8',
            'Content-Disposition' => 'attachment; filename="reminders.ics"',
        ]);
    }
}
