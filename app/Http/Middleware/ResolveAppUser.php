<?php

namespace App\Http\Middleware;

use App\Models\Level;
use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * NativePHP runs the app for a single device owner, so the mobile screens
 * always operate on an authenticated user. If nobody is logged in we attach
 * (or create) the local device account, then continue. Swap this out for a
 * real login flow when shipping a multi-account web build.
 */
class ResolveAppUser
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! Auth::check()) {
            $user = User::where('email', 'demo@kegel.test')->first()
                ?? User::where('is_admin', false)->first()
                ?? User::create([
                    'name' => 'Me',
                    'email' => 'device@kegel.test',
                    'password' => bcrypt(str()->random(32)),
                    'level_id' => Level::where('is_active', true)->orderBy('number')->value('id'),
                ]);

            Auth::login($user, remember: true);
        }

        return $next($request);
    }
}
