<?php

namespace Tests\Feature;

use App\Models\User;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class AppleSignInTest extends TestCase
{
    use RefreshDatabase;

    private static $signingKey;

    private string $clientKeyPath;

    private string $exchangeToken = '';

    private int $exchangeStatus = 200;

    private int $revokeStatus = 200;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        Mail::fake();
        self::$signingKey ??= openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
        $clientKey = openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_EC, 'curve_name' => 'prime256v1']);
        openssl_pkey_export($clientKey, $pem);
        $this->clientKeyPath = tempnam(sys_get_temp_dir(), 'apple-test-');
        file_put_contents($this->clientKeyPath, $pem);
        config(['services.apple.client_id' => 'com.kegelee.app', 'services.apple.team_id' => 'TESTTEAM',
            'services.apple.key_id' => 'TESTKEY', 'services.apple.private_key_path' => $this->clientKeyPath]);
        $rsa = openssl_pkey_get_details(self::$signingKey)['rsa'];
        Http::preventStrayRequests();
        Http::fake([
            'appleid.apple.com/auth/keys' => Http::response(['keys' => [[
                'kty' => 'RSA', 'kid' => 'apple-test', 'alg' => 'RS256', 'use' => 'sig',
                'n' => JWT::urlsafeB64Encode($rsa['n']), 'e' => JWT::urlsafeB64Encode($rsa['e']),
            ]]]),
            'appleid.apple.com/auth/token' => fn () => Http::response([
                'id_token' => $this->exchangeToken, 'refresh_token' => 'private-refresh-token',
            ], $this->exchangeStatus),
            'appleid.apple.com/auth/revoke' => fn () => Http::response([], $this->revokeStatus),
        ]);
    }

    protected function tearDown(): void
    {
        unlink($this->clientKeyPath);
        parent::tearDown();
    }

    private function authorization(array $overrides = [], bool $deleting = false): array
    {
        $challenge = $this->postJson('/api/v1/'.($deleting ? 'user/apple-delete-challenge' : 'auth/apple/challenge'))
            ->assertOk()->json();
        $claims = array_replace([
            'iss' => 'https://appleid.apple.com', 'aud' => 'com.kegelee.app', 'sub' => 'apple-person-1',
            'iat' => time() - 1, 'exp' => time() + 300, 'nonce' => $challenge['nonce'],
            'email' => 'person@privaterelay.appleid.com', 'email_verified' => 'true',
        ], $overrides);
        $this->exchangeToken = JWT::encode($claims, self::$signingKey, 'RS256', 'apple-test');

        return ['challenge_id' => $challenge['challenge_id'], 'state' => $challenge['state'],
            'identity_token' => $this->exchangeToken, 'authorization_code' => 'single-use-code',
            'name' => 'New Person', 'timezone' => 'Europe/Berlin'];
    }

    private function appleUser(): User
    {
        $user = User::factory()->create();
        $user->forceFill(['apple_id' => 'apple-person-1', 'apple_refresh_token' => 'old-refresh-token'])->save();

        return $user;
    }

    public function test_verified_sign_in_creates_a_user_and_keeps_apple_credentials_private(): void
    {
        $res = $this->postJson('/api/v1/auth/apple/token', $this->authorization() + ['email' => 'forged@example.com'])
            ->assertOk()->assertJsonPath('success', true)->assertJsonPath('user.email', 'person@privaterelay.appleid.com');
        $user = User::sole();
        $this->assertSame('apple-person-1', $user->apple_id);
        $this->assertSame('New Person', $user->name);
        $this->assertSame('Europe/Berlin', $user->timezone);
        $this->assertNotNull($user->email_verified_at);
        $this->assertNotEmpty($res->json('user.api_token'));
        $this->assertSame('private-refresh-token', $user->apple_refresh_token);
        $this->assertNotSame('private-refresh-token', $user->getRawOriginal('apple_refresh_token'));
        $this->assertArrayNotHasKey('apple_refresh_token', $user->toArray());
        $this->assertStringNotContainsString('private-refresh-token', $res->getContent());
        $this->assertStringNotContainsString('apple-person-1', $res->getContent());
        Http::assertSent(fn ($r) => $r->url() === 'https://appleid.apple.com/auth/token'
            && $r['code'] === 'single-use-code' && $r['client_id'] === 'com.kegelee.app'
            && $r['grant_type'] === 'authorization_code' && ! empty($r['client_secret']));
    }

    public function test_returning_sign_in_uses_subject_when_name_and_email_are_absent(): void
    {
        $user = $this->appleUser();
        $data = $this->authorization(['email' => null, 'email_verified' => null]);
        unset($data['name']);
        $this->postJson('/api/v1/auth/apple/token', $data)->assertOk()->assertJsonPath('user.id', $user->id);
        $this->assertSame($user->email, $user->fresh()->email);
        $this->assertSame($user->name, $user->fresh()->name);
        $this->assertDatabaseCount('users', 1);
    }

    public function test_verified_email_can_link_to_a_verified_existing_account(): void
    {
        $user = User::factory()->create(['email' => 'person@privaterelay.appleid.com']);
        $this->postJson('/api/v1/auth/apple/token', $this->authorization())->assertOk()->assertJsonPath('user.id', $user->id);
        $this->assertSame('apple-person-1', $user->fresh()->apple_id);
        $this->assertDatabaseCount('users', 1);
    }

    public function test_an_unverified_existing_account_cannot_be_silently_linked(): void
    {
        $user = User::factory()->unverified()->create(['email' => 'person@privaterelay.appleid.com']);
        $this->postJson('/api/v1/auth/apple/token', $this->authorization())->assertStatus(409);
        $this->assertNull($user->fresh()->apple_id);
    }

    public function test_an_account_linked_to_another_apple_subject_cannot_be_taken_over_by_email(): void
    {
        $user = $this->appleUser();
        $this->postJson('/api/v1/auth/apple/token', $this->authorization([
            'email' => $user->email, 'sub' => 'different-apple-person',
        ]))->assertStatus(409);
        $this->assertSame('apple-person-1', $user->fresh()->apple_id);
    }

    public static function invalidClaims(): array
    {
        return [
            'wrong issuer' => [['iss' => 'https://attacker.example']],
            'wrong audience' => [['aud' => 'another.app']],
            'expired' => [['exp' => 1]],
            'missing expiration' => [['exp' => null]],
            'future issued' => [['iat' => 9999999999]],
            'wrong nonce' => [['nonce' => 'different-nonce']],
            'missing nonce' => [['nonce' => null]],
            'missing subject' => [['sub' => '']],
            'unverified email' => [['email_verified' => 'false']],
            'missing email' => [['email' => null]],
        ];
    }

    #[DataProvider('invalidClaims')]
    public function test_invalid_claims_never_create_a_session(array $claims): void
    {
        $this->postJson('/api/v1/auth/apple/token', $this->authorization($claims))->assertStatus(422);
        $this->assertDatabaseCount('users', 0);
    }

    public function test_forged_signature_is_rejected_before_exchanging_the_code(): void
    {
        $data = $this->authorization();
        $parts = explode('.', $data['identity_token']);
        $parts[2] = JWT::urlsafeB64Encode(str_repeat('x', 256));
        $data['identity_token'] = implode('.', $parts);
        $this->postJson('/api/v1/auth/apple/token', $data)->assertStatus(422);
        Http::assertNotSent(fn ($r) => str_ends_with($r->url(), '/auth/token'));
    }

    public function test_challenges_are_single_use_even_after_a_bad_state(): void
    {
        $data = $this->authorization();
        $this->postJson('/api/v1/auth/apple/token', array_replace($data, ['state' => str_repeat('x', 64)]))->assertStatus(422);
        $this->postJson('/api/v1/auth/apple/token', $data)->assertStatus(422);
        $valid = $this->authorization();
        $this->postJson('/api/v1/auth/apple/token', $valid)->assertOk();
        $this->postJson('/api/v1/auth/apple/token', $valid)->assertStatus(422);
    }

    public function test_expired_challenge_is_rejected(): void
    {
        $data = $this->authorization();
        $this->travel(6)->minutes();
        $this->postJson('/api/v1/auth/apple/token', $data)->assertStatus(422);
        $this->travelBack();
        Http::assertNothingSent();
    }

    public function test_the_authorization_code_must_exchange_successfully(): void
    {
        $this->exchangeStatus = 400;
        $this->postJson('/api/v1/auth/apple/token', $this->authorization())->assertStatus(422);
        $this->assertDatabaseCount('users', 0);
    }

    public function test_the_exchanged_identity_must_match_the_native_token(): void
    {
        $data = $this->authorization();
        $claims = (array) JWT::jsonDecode(JWT::urlsafeB64Decode(explode('.', $data['identity_token'])[1]));
        $claims['sub'] = 'somebody-else';
        $this->exchangeToken = JWT::encode($claims, self::$signingKey, 'RS256', 'apple-test');
        $this->postJson('/api/v1/auth/apple/token', $data)->assertStatus(422);
        $this->assertDatabaseCount('users', 0);
    }

    public function test_missing_server_credentials_fail_without_showing_secrets(): void
    {
        config(['services.apple.key_id' => null]);
        $this->postJson('/api/v1/auth/apple/challenge')->assertStatus(503)->assertJsonStructure(['error']);
        Http::assertNothingSent();
    }

    public function test_apple_deletion_reauthenticates_without_relay_email_and_revokes_before_deleting(): void
    {
        $user = $this->appleUser();
        $this->actingAs($user);
        $this->postJson('/api/v1/user/delete-code', ['platform' => 'ios'])->assertOk()->assertJsonPath('requires_apple_auth', true);
        Mail::assertNothingSent();
        $this->postJson('/api/v1/user/apple-delete', $this->authorization(deleting: true))->assertOk();
        $this->assertDatabaseMissing('users', ['id' => $user->id]);
        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/auth/revoke')
            && $r['token'] === 'private-refresh-token' && $r['token_type_hint'] === 'refresh_token');
    }

    public function test_deleting_requires_the_same_apple_account_and_a_deletion_challenge(): void
    {
        $user = $this->appleUser();
        $this->actingAs($user);
        $this->postJson('/api/v1/user/apple-delete', $this->authorization())->assertStatus(422);
        $this->postJson('/api/v1/user/apple-delete', $this->authorization(['sub' => 'someone-else'], true))->assertStatus(422);
        $this->assertDatabaseHas('users', ['id' => $user->id]);
        Http::assertNotSent(fn ($r) => str_ends_with($r->url(), '/auth/revoke'));
    }

    public function test_apple_revoke_failure_preserves_the_account_for_retry(): void
    {
        $user = $this->appleUser();
        $this->actingAs($user);
        $this->revokeStatus = 503;
        $this->postJson('/api/v1/user/apple-delete', $this->authorization(deleting: true))->assertStatus(502);
        $this->assertDatabaseHas('users', ['id' => $user->id]);
    }

    public function test_deletion_cannot_be_requested_without_authentication(): void
    {
        $this->postJson('/api/v1/user/apple-delete-challenge')->assertUnauthorized();
        $this->postJson('/api/v1/user/apple-delete')->assertUnauthorized();
    }
}
