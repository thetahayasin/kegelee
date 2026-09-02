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

        // The training app is the React Native client now, so the gates it
        // used to need on the web (subscription, basics, app-enabled) went
        // with those screens. The web serves marketing, legal, the admin
        // panel and the API.
        $middleware->alias([
            'admin' => \App\Http\Middleware\EnsureAdmin::class,
            'api.user' => \App\Http\Middleware\ResolveApiUser::class,
        ]);

        // Server-to-server webhooks carry no CSRF token: Google Play RTDN comes
        // from Pub/Sub, RevenueCat posts from its own backend. Both authenticate
        // themselves instead (RevenueCat via the Authorization header checked in
        // RevenueCatWebhookController).
        //
        // The exemption must live HERE: the web group registers
        // PreventRequestForgery, so a route-level withoutMiddleware() naming
        // the deprecated VerifyCsrfToken subclass matches nothing and the
        // push still 419s.
        $middleware->preventRequestForgery(except: [
            'webhooks/google-play',
            'webhooks/revenuecat',
        ]);

        // Only requests actually addressed to us are served. Host headers are
        // client-controlled, and they end up inside absolute URLs (password
        // reset links, the ICS feed's UIDs, cache keys), so an unfiltered one
        // is a poisoning primitive. Laravel skips this in local and in tests,
        // where the host is always localhost.
        $middleware->trustHosts(at: fn () => array_filter([
            parse_url((string) config('app.url'), PHP_URL_HOST),
        ]));

        // NOT enabled: TLS terminates at this app's own Apache
        // (public/.htaccess does the http->https redirect itself), so there is
        // no proxy whose X-Forwarded-* headers we should believe. Turn this on
        // - and only then - if the app is ever moved behind a load balancer or
        // CDN, otherwise any client can claim any IP and scheme.
        // $middleware->trustProxies(at: '*');

        $middleware->append(\App\Http\Middleware\CacheStaticAssets::class);

        // Guests hitting the app land on the public homepage (or onboarding when
        // the homepage is disabled). Admin routes redirect to the admin login.
        // The admin prefix is 'mystic', not 'admin' - only the route NAMES are
        // still admin.*, so matching on 'admin*' here sent signed-out admins to
        // the landing page instead of the login form.
        $middleware->redirectGuestsTo(fn (Request $request) => $request->is('mystic*')
            ? route('admin.login')
            : route('landing'));

        // The only authenticated surface left on the web is the admin panel,
        // so a signed-in user on a guest-only route belongs there rather than
        // on /app, which went with the training screens.
        $middleware->redirectUsersTo('/mystic');
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
                return redirect()->guest($request->is('mystic*')
                    ? route('admin.login')
                    : route('landing'));
            }
        });
    })->create();
