<?php

namespace App\Http\Middleware;

use App\Services\SettingsService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureAppEnabled
{
    public function __construct(private SettingsService $settings) {}

    public function handle(Request $request, Closure $next): Response
    {
        if (! $this->settings->get('app_enabled', true) && ! auth()->user()?->is_admin) {
            return redirect()->route('landing')->with('app_disabled', true);
        }

        return $next($request);
    }
}
