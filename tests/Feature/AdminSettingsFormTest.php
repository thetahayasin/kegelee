<?php

namespace Tests\Feature;

use App\Livewire\Admin\Settings;
use App\Models\User;
use App\Services\SettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Livewire\Livewire;
use Tests\TestCase;

/**
 * The settings form writes the values the whole backend reads, so what it
 * refuses to do matters more than what it saves.
 */
class AdminSettingsFormTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->actingAs(User::factory()->create([
            'is_admin' => true,
            'email' => 'admin@example.com',
        ]));
    }

    private function settings(): SettingsService
    {
        return app(SettingsService::class);
    }

    public function test_secrets_are_never_loaded_into_the_page(): void
    {
        $this->settings()->setMany([
            'mail_password' => 'smtp-secret',
            'google_client_secret' => 'google-secret',
            'revenuecat_api_key' => 'sk_live_secret',
            'revenuecat_webhook_secret' => 'hook-secret',
            // No field in the form at all. The old mount() walked every
            // default, so this went to the browser too.
            'google_play_service_account_json' => '{"private_key":"-----BEGIN PRIVATE KEY-----"}',
        ]);

        $component = Livewire::test(Settings::class);

        foreach (['smtp-secret', 'google-secret', 'sk_live_secret', 'hook-secret', 'BEGIN PRIVATE KEY'] as $secret) {
            $component->assertDontSee($secret, false);
        }

        $this->assertArrayNotHasKey('google_play_service_account_json', $component->get('values'));
        $this->assertSame('', $component->get('secrets.mail_password'));

        // ...but the form still knows one is set, so it can say "leave blank
        // to keep" rather than "Not set".
        $component->assertSee('Leave blank to keep the saved password');
    }

    public function test_a_blank_secret_keeps_the_stored_one(): void
    {
        $this->settings()->setMany(['revenuecat_api_key' => 'sk_original']);

        Livewire::test(Settings::class)
            ->set('values.app_name', 'Renamed')
            ->call('save')
            ->assertHasNoErrors();

        $this->assertSame('sk_original', app(SettingsService::class)->get('revenuecat_api_key'));
        $this->assertSame('Renamed', app(SettingsService::class)->get('app_name'));
    }

    public function test_a_typed_secret_replaces_the_stored_one(): void
    {
        $this->settings()->setMany(['revenuecat_api_key' => 'sk_original']);

        Livewire::test(Settings::class)
            ->set('secrets.revenuecat_api_key', 'sk_new')
            ->call('save');

        $this->assertSame('sk_new', app(SettingsService::class)->get('revenuecat_api_key'));
    }

    public function test_it_only_writes_keys_the_form_owns(): void
    {
        // $values is public component state, so a crafted update can put
        // anything in it. Only the whitelist is written.
        Livewire::test(Settings::class)
            ->set('values.google_play_service_account_json', '{"stolen":true}')
            ->set('values.app_enabled', false)
            ->call('save');

        $fresh = app(SettingsService::class);
        $this->assertSame('', (string) $fresh->get('google_play_service_account_json'));
        $this->assertDatabaseMissing('app_settings', ['key' => 'google_play_service_account_json']);
        $this->assertDatabaseMissing('app_settings', ['key' => 'app_enabled']);
    }

    public function test_invalid_json_is_reported_instead_of_wiping_the_section(): void
    {
        $this->settings()->setMany([
            'home_stats' => [[['value' => '50K+', 'label' => 'Users']], 'json', 'homepage'],
        ]);

        Livewire::test(Settings::class)
            ->set('values.home_stats', '[{"value": "50K+",]')
            ->call('save')
            ->assertHasErrors(['values.home_stats' => 'json']);

        // The stored value survived the failed save; `json_decode(...) ?? []`
        // used to turn a typo into an empty homepage section.
        $this->assertNotEmpty(app(SettingsService::class)->get('home_stats'));
    }

    public function test_remove_image_only_touches_the_three_image_settings(): void
    {
        $this->settings()->setMany(['app_name' => 'Kegelee']);

        Livewire::test(Settings::class)
            ->call('removeImage', 'app_name');

        $this->assertSame('Kegelee', app(SettingsService::class)->get('app_name'));
    }

    public function test_the_port_must_be_a_port(): void
    {
        Livewire::test(Settings::class)
            ->set('values.mail_port', 99999)
            ->call('save')
            ->assertHasErrors('values.mail_port');
    }

    public function test_a_stale_success_banner_does_not_survive_the_next_action(): void
    {
        $component = Livewire::test(Settings::class)
            ->call('save')
            ->assertSet('savedMessage', 'Settings saved.');

        // A later action that fails must not leave "Settings saved." on screen
        // reading as if it had worked.
        $component->set('currentPassword', 'wrong')
            ->set('adminNewPassword', 'newpass1')
            ->set('adminNewPassword_confirmation', 'newpass1')
            ->call('changeAdminPassword')
            ->assertSet('savedMessage', null)
            ->assertHasErrors('currentPassword');
    }
}
