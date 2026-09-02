<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\SettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * What the website is, now that the training app is the React Native client:
 * a marketing homepage, the legal pages Play links to, the admin panel and the
 * API. Everything else 404s, and this pins that both ways - the pages that must
 * render, and the routes that must be gone.
 */
class WebSurfaceTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_public_pages_render(): void
    {
        $this->get('/')->assertOk();
        $this->get('/legal')->assertOk();
        $this->get('/delete-account')->assertOk();
        $this->get('/up')->assertOk();
    }

    public function test_the_homepage_falls_back_to_the_legal_index_when_disabled(): void
    {
        app(SettingsService::class)->setMany([
            'homepage_enabled' => [false, 'bool', 'homepage'],
        ]);

        // Not the app: there is no web app to send anyone to any more, and the
        // policies have to stay reachable for the Play listing.
        $this->get('/')->assertRedirect(route('legal.index'));
    }

    public function test_the_admin_panel_renders_for_an_admin(): void
    {
        $this->actingAs(User::factory()->create(['is_admin' => true]));

        $this->get('/mystic')->assertOk();
        $this->get('/mystic/pages')->assertOk();
        $this->get('/mystic/settings')->assertOk();
    }

    #[DataProvider('removedRoutes')]
    public function test_the_web_app_routes_are_gone(string $path): void
    {
        $this->get($path)->assertNotFound();
    }

    public static function removedRoutes(): array
    {
        return array_map(fn ($p) => [$p], [
            '/welcome',
            '/app',
            '/login',
            '/register',
            '/verify',
            '/upgrade',
            '/profile',
            '/settings',
            '/change-password',
            '/exercises',
            '/session',
            '/levels',
            '/progress',
            '/schedule',
            '/reminders',
            '/knowledge',
            '/sync/status',
        ]);
    }
}
