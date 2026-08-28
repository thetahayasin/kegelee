<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The first-run profile and the free demo, reported from the device.
 *
 * Both used to exist only in device storage - the quiz answers in a key that
 * is consumed and deleted the moment an account is created, and the demo
 * marker in one that was never sent anywhere. So the backend knew an account
 * had signed up and whether it had paid, and nothing about the journey in
 * between.
 *
 * Everything here is WRITE-ONCE, and that is the property worth guarding: the
 * device re-sends this payload on every sync until a pull confirms it landed,
 * so the same values arrive repeatedly and must not accumulate, drift, or let
 * a second device overwrite the real first run with its own.
 */
class OnboardingProfileSyncTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::create([
            'name' => 'Newcomer',
            'email' => 'newcomer@example.com',
            'password' => bcrypt('secret'),
            'email_verified_at' => now(),
        ]);
    }

    private function push(array $payload)
    {
        return $this->withHeaders([
            'X-User-Token' => $this->user->apiToken(),
        ])->postJson('/api/v1/user/push', $payload);
    }

    public function test_it_records_the_onboarding_profile(): void
    {
        $this->push(['onboarding' => [
            'experience' => 1,
            'daily_time' => 2,
            'baseline_seconds' => 9.4,
            'level' => 3,
            'skipped' => false,
        ]])->assertOk();

        $this->user->refresh();

        $this->assertSame(1, $this->user->onboarding_experience);
        $this->assertSame(2, $this->user->onboarding_daily_time);
        $this->assertEqualsWithDelta(9.4, $this->user->onboarding_baseline_seconds, 0.01);
        $this->assertSame(3, $this->user->onboarding_level);
        $this->assertFalse($this->user->onboarding_skipped);
        $this->assertNotNull($this->user->onboarding_completed_at);
    }

    public function test_a_second_push_does_not_overwrite_the_first_run(): void
    {
        // The device re-sends until a pull confirms, so this is the normal
        // case rather than an edge one - and a later device signing into the
        // same account must not replace the real first run with its own.
        $this->push(['onboarding' => [
            'experience' => 0, 'daily_time' => 0, 'baseline_seconds' => 4.0, 'level' => 1, 'skipped' => false,
        ]])->assertOk();

        $firstStamp = $this->user->refresh()->onboarding_completed_at;

        $this->push(['onboarding' => [
            'experience' => 2, 'daily_time' => 2, 'baseline_seconds' => 30.0, 'level' => 5, 'skipped' => false,
        ]])->assertOk();

        $this->user->refresh();
        $this->assertSame(0, $this->user->onboarding_experience);
        $this->assertEqualsWithDelta(4.0, $this->user->onboarding_baseline_seconds, 0.01);
        $this->assertSame(1, $this->user->onboarding_level);
        $this->assertEquals($firstStamp, $this->user->onboarding_completed_at);
    }

    public function test_a_skipped_quiz_stores_no_baseline(): void
    {
        // Skip sends a baseline of 0, which means "not measured" rather than
        // "measured as nothing". Storing a 0 would make every later
        // improvement comparison read as infinite progress.
        $this->push(['onboarding' => [
            'experience' => null, 'daily_time' => null, 'baseline_seconds' => 0, 'level' => 1, 'skipped' => true,
        ]])->assertOk();

        $this->user->refresh();

        $this->assertNull($this->user->onboarding_baseline_seconds);
        $this->assertNull($this->user->onboarding_experience);
        $this->assertTrue($this->user->onboarding_skipped);
        // Still completed: they reached the end of the flow, they just
        // declined to answer, and the two are different facts.
        $this->assertNotNull($this->user->onboarding_completed_at);
    }

    public function test_it_rejects_out_of_range_answers_without_failing_the_push(): void
    {
        $this->push(['onboarding' => [
            'experience' => 9, 'daily_time' => -1, 'baseline_seconds' => 'nonsense', 'level' => 77, 'skipped' => false,
        ]])->assertOk();

        $this->user->refresh();

        $this->assertNull($this->user->onboarding_experience);
        $this->assertNull($this->user->onboarding_daily_time);
        $this->assertNull($this->user->onboarding_baseline_seconds);
        $this->assertNull($this->user->onboarding_level);
    }

    public function test_it_stamps_the_free_session_once(): void
    {
        $this->push(['free_session_completed' => true])->assertOk();
        $first = $this->user->refresh()->free_session_completed_at;
        $this->assertNotNull($first);

        $this->travel(2)->days();
        $this->push(['free_session_completed' => true])->assertOk();

        // The date means "when they first finished one", so a later push must
        // leave it where it is.
        $this->assertEquals($first, $this->user->refresh()->free_session_completed_at);
    }

    public function test_it_does_not_stamp_the_free_session_when_not_reported(): void
    {
        $this->push(['free_session_completed' => false])->assertOk();
        $this->assertNull($this->user->refresh()->free_session_completed_at);
    }

    public function test_the_pull_echoes_the_profile_back(): void
    {
        // This is what lets the device stop re-sending: the pull, not the
        // push, is the proof it was stored.
        $this->push(['onboarding' => [
            'experience' => 2, 'daily_time' => 1, 'baseline_seconds' => 12.5, 'level' => 4, 'skipped' => false,
        ]])->assertOk();
        $this->push(['free_session_completed' => true])->assertOk();

        $res = $this->withHeaders(['X-User-Token' => $this->user->apiToken()])
            ->getJson('/api/v1/user/pull');

        $res->assertOk()
            ->assertJsonPath('onboarding.experience', 2)
            ->assertJsonPath('onboarding.daily_time', 1)
            ->assertJsonPath('onboarding.level', 4)
            ->assertJsonPath('onboarding.skipped', false);

        $this->assertNotNull($res->json('free_session_completed_at'));
    }

    public function test_the_pull_reports_no_profile_for_an_account_that_has_none(): void
    {
        $res = $this->withHeaders(['X-User-Token' => $this->user->apiToken()])
            ->getJson('/api/v1/user/pull');

        $res->assertOk()->assertJsonPath('onboarding', null);
        $this->assertNull($res->json('free_session_completed_at'));
    }
}
