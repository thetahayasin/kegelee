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
        if (! $this->settings->get('app_enabled', true)) {
            // Direct RedirectResponse: redirect() returns Livewire's Redirector
            // during Livewire requests, which violates the Response return type.
            $request->session()->flash('app_disabled', true);

            return new \Illuminate\Http\RedirectResponse(route('landing'));
        }

        return $next($request);
    }
}
