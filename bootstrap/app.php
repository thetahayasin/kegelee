<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
        apiPrefix: 'api',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // The token resolver must run BEFORE 'auth' so the user it sets
        // satisfies the auth check on the /v1/user/* routes.
        $middleware->priority([
            \App\Http\Middleware\ResolveApiUser::class,
            \Illuminate\Auth\Middleware\Authenticate::class,
            \Illuminate\Contracts\Auth\Middleware\AuthenticatesRequests::class,
        ]);

        $middleware->alias([
            'admin' => \App\Http\Middleware\EnsureAdmin::class,
            'subscribed' => \App\Http\Middleware\EnsureSubscribed::class,
            'basics' => \App\Http\Middleware\EnsureBasicsCompleted::class,
            'app.enabled' => \App\Http\Middleware\EnsureAppEnabled::class,
            'api.user' => \App\Http\Middleware\ResolveApiUser::class,
        ]);

        $middleware->append(\App\Http\Middleware\CacheStaticAssets::class);

        // Device app only: pull backend content + two-way sync user data on
        // page navigations. No-op on the backend (CONTENT_SYNC_URL empty).
        $middleware->web(append: [
            \App\Http\Middleware\SyncWithBackend::class,
        ]);

        // Guests hitting the app land on the public homepage (or onboarding when
        // the homepage is disabled). Admin routes redirect to the admin login.
        $middleware->redirectGuestsTo(fn (Request $request) => $request->is('admin*')
            ? route('admin.login')
            : route('landing'));

        // Authenticated users hitting guest-only routes (login, register) land
        // on the main app screen instead of the unpredictable / → LandingController chain.
        $middleware->redirectUsersTo('/app');
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Livewire component updates (POST /livewire/update) must get JSON
        // errors — otherwise the client receives an HTML stack trace and the
        // SPA breaks. But GET page navigations (including wire:navigate loads,
        // which also carry Livewire headers) must NEVER get a JSON body: it
        // replaces the page with raw {"message":"Unauthenticated."} text.
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*')
                || str_starts_with($request->path(), 'livewire-')
                || $request->is('livewire/*')
                || ($request->headers->has('X-Livewire') && $request->isMethod('POST')),
        );

        // A signed-out user navigating to the app must land on login, not a
        // raw {"message":"Unauthenticated."} body. API and Livewire update
        // requests keep their JSON 401 so the client-side hooks handle them.
        $exceptions->render(function (\Illuminate\Auth\AuthenticationException $e, Request $request) {
            $isJsonSurface = $request->is('api/*')
                || $request->is('livewire/*')
                || ($request->headers->has('X-Livewire') && $request->isMethod('POST'));

            if (! $isJsonSurface) {
                return redirect()->guest($request->is('admin*')
                    ? route('admin.login')
                    : route('landing'));
            }
        });
    })->create();
