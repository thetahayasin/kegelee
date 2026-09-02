<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\User as SocialiteUser;
use Mockery;
use Tests\TestCase;

/**
 * "Continue with Google" for the mobile app.
 *
 * Two things are load-bearing here and neither is about Google:
 *
 * 1. The app generates a nonce before it opens the browser and refuses a
 *    redirect that does not carry the same one back. A custom scheme belongs
 *    to nobody - any installed app can register kegelee://, and any web page
 *    can navigate to it - so without the round trip this flow was "here is a
 *    session, sign in as it" from an unauthenticated source.
 *
 * 2. Reaching an EXISTING account by email needs Google to say the address is
 *    verified. Otherwise anyone able to put somebody else's address on a
 *    Google account inherits their account here.
 */
class GoogleNativeAuthTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    /** Mock the Google profile the callback will resolve. */
    private function mockGoogleUser(string $id, string $email, bool $emailVerified, string $name = 'Test'): void
    {
        $user = (new SocialiteUser)->setRaw(['email_verified' => $emailVerified])->map([
            'id' => $id,
            'name' => $name,
            'email' => $email,
        ]);

        $provider = Mockery::mock(\Laravel\Socialite\Two\GoogleProvider::class);
        $provider->shouldReceive('stateless')->andReturnSelf();
        $provider->shouldReceive('user')->andReturn($user);

        Socialite::shouldReceive('driver')->with('google')->andReturn($provider);
    }

    public function test_the_redirect_remembers_the_app_nonce_against_its_own_state(): void
    {
        $res = $this->get('/auth/google/native?state=app-nonce-1');

        $res->assertRedirect();
        parse_str((string) parse_url($res->headers->get('Location'), PHP_URL_QUERY), $query);

        $this->assertNotEmpty($query['state'] ?? null, 'the OAuth redirect must carry a state');
        $this->assertNotSame('app-nonce-1', $query['state'], 'the app nonce is not handed to Google');
        $this->assertSame(['nonce' => 'app-nonce-1'], Cache::get('goauth:state:'.$query['state']));
    }

    public function test_the_callback_returns_a_token_and_echoes_the_app_nonce(): void
    {
        Cache::put('goauth:state:srv-state', ['nonce' => 'app-nonce-1'], 300);
        $this->mockGoogleUser('g-1', 'new@example.com', true, 'New Person');

        $res = $this->get('/auth/google/native/callback?state=srv-state&code=x');

        $location = $res->headers->get('Location');
        parse_str((string) parse_url($location, PHP_URL_QUERY), $query);

        $this->assertStringContainsString('/auth/google/finish', $location);
        $this->assertSame('app-nonce-1', $query['state']);
        $this->assertNotEmpty($query['token']);

        $user = User::where('email', 'new@example.com')->sole();
        $this->assertSame((string) $user->id, (string) Cache::get('goauth:'.$query['token']));
        $this->assertNotNull($user->email_verified_at);
    }

    public function test_a_callback_without_a_known_state_is_refused(): void
    {
        $this->mockGoogleUser('g-2', 'nobody@example.com', true);

        $res = $this->get('/auth/google/native/callback?state=never-issued&code=x');

        $this->assertStringContainsString('error=state', (string) $res->headers->get('Location'));
        $this->assertDatabaseMissing('users', ['email' => 'nobody@example.com']);
    }

    public function test_a_state_can_only_be_used_once(): void
    {
        Cache::put('goauth:state:srv-state', ['nonce' => 'n'], 300);
        $this->mockGoogleUser('g-3', 'once@example.com', true);

        $this->get('/auth/google/native/callback?state=srv-state&code=x');

        // A replayed redirect finds nothing waiting.
        $res = $this->get('/auth/google/native/callback?state=srv-state&code=x');
        $this->assertStringContainsString('error=state', (string) $res->headers->get('Location'));
    }

    public function test_an_unverified_google_email_cannot_take_over_an_existing_account(): void
    {
        $existing = User::factory()->create([
            'email' => 'owner@example.com',
            'google_id' => null,
        ]);

        Cache::put('goauth:state:srv-state', ['nonce' => 'n'], 300);
        $this->mockGoogleUser('attacker-google-id', 'owner@example.com', false);

        $res = $this->get('/auth/google/native/callback?state=srv-state&code=x');

        $this->assertStringContainsString('error=unverified', (string) $res->headers->get('Location'));
        $this->assertNull($existing->fresh()->google_id, 'the account must not be linked');
    }

    public function test_a_verified_google_email_links_to_the_existing_account(): void
    {
        $existing = User::factory()->create([
            'email' => 'owner@example.com',
            'google_id' => null,
        ]);

        Cache::put('goauth:state:srv-state', ['nonce' => 'n'], 300);
        $this->mockGoogleUser('google-id-9', 'owner@example.com', true);

        $this->get('/auth/google/native/callback?state=srv-state&code=x');

        $this->assertSame('google-id-9', $existing->fresh()->google_id);
    }

    public function test_the_finish_page_hands_the_token_to_the_app_deeplink(): void
    {
        // Reached only when the App Link is not verified on the device (or the
        // flow finished in a desktop browser): it bounces to the scheme.
        $res = $this->get('/auth/google/finish?token=abc123&state=app-nonce-1');

        $res->assertOk();
        $res->assertSee('kegelee://auth/google/finish?token=abc123&amp;state=app-nonce-1', false);
    }

    public function test_the_callback_never_signs_anyone_into_a_web_session(): void
    {
        Cache::put('goauth:state:srv-state', ['nonce' => 'n'], 300);
        $this->mockGoogleUser('g-4', 'web@example.com', true);

        $this->get('/auth/google/native/callback?state=srv-state&code=x');

        // The browser here is the system browser, not the app. Leaving a
        // session behind in it is an account handed to whoever uses the phone
        // next; the app authenticates by redeeming the token instead.
        $this->assertGuest();
    }
}
