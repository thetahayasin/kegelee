<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * /.well-known/assetlinks.json is what makes Android open our https links in
 * the app rather than a browser, which is how the Google sign-in returns. It
 * is served from a route because the fingerprint differs per build and lives
 * in the environment.
 */
class AssetLinksTest extends TestCase
{
    public function test_it_publishes_the_configured_package_and_fingerprints(): void
    {
        config([
            'services.google_play.package_name' => 'com.kegelee.app',
            // Two fingerprints, comma separated and lower case, which is how
            // the Play Console shows them.
            'services.google_play.app_link_sha256' => 'aa:bb:cc, dd:ee:ff',
        ]);

        $res = $this->get('/.well-known/assetlinks.json');

        $res->assertOk();
        // Android refuses to verify a file served as anything else.
        $this->assertStringStartsWith('application/json', $res->headers->get('Content-Type'));

        $res->assertJsonPath('0.relation.0', 'delegate_permission/common.handle_all_urls');
        $res->assertJsonPath('0.target.namespace', 'android_app');
        $res->assertJsonPath('0.target.package_name', 'com.kegelee.app');
        $res->assertJsonPath('0.target.sha256_cert_fingerprints', ['AA:BB:CC', 'DD:EE:FF']);
    }

    public function test_it_publishes_nothing_when_no_fingerprint_is_configured(): void
    {
        // A statement listing no fingerprint is not "not configured yet" to
        // Android, it is a verification failure. An empty list says the same
        // thing without the false signal.
        config(['services.google_play.app_link_sha256' => '']);

        $this->get('/.well-known/assetlinks.json')
            ->assertOk()
            ->assertExactJson([]);
    }
}
