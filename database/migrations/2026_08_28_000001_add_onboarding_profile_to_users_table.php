<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What the app learns about someone before they ever pay, kept server-side.
 *
 * All of it existed only on the device. The onboarding answers and the opening
 * hold lived in one AsyncStorage key that is consumed and deleted at sign-in,
 * and whether someone ever completed the free demo session lived in another
 * that is never sent anywhere at all. So the backend could see that an account
 * existed and that it had subscribed or not, and nothing whatsoever about the
 * journey in between - which is the half that explains the other half.
 *
 * Deliberately columns on `users` rather than a side table: there is exactly
 * one of each per account, they are read together whenever they are read at
 * all, and a one-to-one table would buy a join and nothing else.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // 0 = never trained, 1 = a little, 2 = regularly. Nullable because
            // an account created before the quiz existed genuinely has no
            // answer, which is not the same as answering zero.
            $table->unsignedTinyInteger('onboarding_experience')->nullable()->after('timezone');
            // 0 = a couple of minutes, 1 = about five, 2 = ten or more.
            $table->unsignedTinyInteger('onboarding_daily_time')->nullable()->after('onboarding_experience');
            // The opening hold, in seconds to one decimal. This is the anchor
            // every later "you have improved" is measured against, so it is
            // stored as its own field rather than inferred from the first
            // measurement row - measurements can be deleted, and a baseline
            // that quietly moves is worse than no baseline.
            $table->decimal('onboarding_baseline_seconds', 5, 1)->nullable()->after('onboarding_daily_time');
            // The level the answers and the hold produced, kept even though
            // level_id may later drift: the difference between where someone
            // started and where they are is the interesting part.
            $table->unsignedTinyInteger('onboarding_level')->nullable()->after('onboarding_baseline_seconds');
            // Reaching the end of the flow, by answering OR by skipping.
            $table->timestamp('onboarding_completed_at')->nullable()->after('onboarding_level');
            // Distinguishes "declined to answer" from "never offered", which
            // look identical if you only look at the null answers above.
            $table->boolean('onboarding_skipped')->default(false)->after('onboarding_completed_at');
            // The free demo session - the single strongest predictor in the
            // funnel of whether someone subscribes, and until now invisible.
            $table->timestamp('free_session_completed_at')->nullable()->after('onboarding_skipped');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'onboarding_experience',
                'onboarding_daily_time',
                'onboarding_baseline_seconds',
                'onboarding_level',
                'onboarding_completed_at',
                'onboarding_skipped',
                'free_session_completed_at',
            ]);
        });
    }
};
