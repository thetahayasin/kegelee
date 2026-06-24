<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'admin' => \App\Http\Middleware\EnsureAdmin::class,
        ]);

        $middleware->append(\App\Http\Middleware\CacheStaticAssets::class);

        // Guests hitting the app land on the public homepage (or onboarding when
        // the homepage is disabled). Admin routes redirect to the admin login.
        $middleware->redirectGuestsTo(fn (Request $request) => $request->is('admin*')
            ? route('admin.login')
            : route('landing'));
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Livewire update requests must get JSON errors — otherwise the client
        // receives an HTML stack trace and the whole SPA breaks.
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*')
                || str_starts_with($request->path(), 'livewire-')
                || $request->headers->has('X-Livewire'),
        );

        // A signed-out user navigating to the app must land on login, not a
        // raw {"message":"Unauthenticated."} body. API and Livewire requests
        // keep their JSON 401 so the client-side hooks can handle them.
        $exceptions->render(function (\Illuminate\Auth\AuthenticationException $e, Request $request) {
            if (! $request->is('api/*') && ! $request->headers->has('X-Livewire')) {
                return redirect()->guest($request->is('admin*')
                    ? route('admin.login')
                    : route('landing'));
            }
        });
    })->create();
