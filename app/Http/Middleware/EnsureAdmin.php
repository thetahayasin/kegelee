<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class EnsureAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! Auth::check() || ! Auth::user()->is_admin) {
            // Direct RedirectResponse: redirect() returns Livewire's Redirector
            // during Livewire requests, which violates the Response return type.
            return new \Illuminate\Http\RedirectResponse(route('admin.login'));
        }

        return $next($request);
    }
}
