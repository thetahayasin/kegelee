<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\SettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The admin login used to render in the public app layout, which pastes three
 * operator-supplied blobs of raw HTML and a stylesheet into every page. On the
 * form that hands out control of the backend, that is a keylogger one bad
 * paste (or one compromised settings write) away.
 */
class AdminLoginLayoutTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_login_page_runs_no_injected_code(): void
    {
        app(SettingsService::class)->setMany([
            'inject_head' => '<script>window.headMarker=1</script>',
            'inject_body_start' => '<script>window.bodyStartMarker=1</script>',
            'inject_body_end' => '<script>window.bodyEndMarker=1</script>',
            'custom_css' => 'body{--injected-marker:1}',
        ]);

        $res = $this->get('/mystic/login');

        $res->assertOk();
        $res->assertDontSee('headMarker', false);
        $res->assertDontSee('bodyStartMarker', false);
        $res->assertDontSee('bodyEndMarker', false);
        $res->assertDontSee('injected-marker', false);
    }

    public function test_the_public_pages_still_get_the_injections(): void
    {
        // The setting is not being ignored, it is being kept off one page.
        app(SettingsService::class)->setMany([
            'inject_head' => '<script>window.headMarker=1</script>',
        ]);

        $this->get('/legal')->assertOk()->assertSee('headMarker', false);
    }

    public function test_admin_password_recovery_lives_under_the_admin_prefix(): void
    {
        $this->get('/mystic/forgot-password')->assertOk();

        // The old public addresses are gone with the rest of the web app.
        $this->get('/forgot-password')->assertNotFound();
        $this->get('/login')->assertNotFound();
        $this->get('/register')->assertNotFound();
    }

    public function test_the_admin_panel_still_refuses_non_admins(): void
    {
        $this->actingAs(User::factory()->create(['is_admin' => false]));

        $this->get('/mystic')->assertRedirect(route('admin.login'));
    }
}
