<?php

namespace App\Providers;

use App\Http\Middleware\EnsureAdmin;
use App\Services\SettingsService;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Livewire\Livewire;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // One instance per request. SettingsService memoizes the whole table
        // in a private property, and it is injected into services, Livewire
        // components and Blade alike - resolving a fresh one each time threw
        // that memo away and asked the cache again.
        $this->app->singleton(SettingsService::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // A Livewire update is its own request, and it does NOT re-run the
        // middleware the page was loaded behind. Without this, an admin who
        // lost their admin flag (or their session) could keep operating an
        // already-open panel through wire:click alone, because only the
        // initial GET was ever checked.
        Livewire::addPersistentMiddleware([
            EnsureAdmin::class,
        ]);

        // Named, so it keeps its own counter. Two plain 'throttle:x,1'
        // middlewares on one route share a key - ThrottleRequests hashes the
        // route signature, not the limit - so stacking a tighter limit on top
        // of the group's just made every request cost two.
        RateLimiter::for('delete-code', fn (Request $request) => Limit::perMinute(6)
            ->by((string) ($request->user()?->id ?: $request->ip())));
    }
}
