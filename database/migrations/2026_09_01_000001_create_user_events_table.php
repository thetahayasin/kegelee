<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What people actually did, as opposed to what they ended up being.
 *
 * The users table records STATE - a level, an onboarding completion date, a
 * subscription. State answers "who is this account now" and cannot answer
 * "what happened". The two questions that keep coming up need the second one:
 * did they finish the quiz or skip it, did the tour help or get dismissed on
 * the first card, which locked feature were they reaching for when they went
 * to the paywall.
 *
 * Deliberately thin. This is not an analytics pipeline - it is an append-only
 * log of a dozen named things, written by the same push the rest of the app
 * already uses, with enough shape to group and count and nothing more. A
 * generic event bus here would collect a great deal of data nobody reads.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            /**
             * A name from a known list - see UserEvent::NAMES. Kept as a string
             * rather than an enum column so adding one is a code change and not
             * a migration, and validated on the way in so the list stays real.
             */
            $table->string('name', 48);

            /**
             * Which thing the event was about: the tour's id, the feature
             * behind the lock, the screen the paywall was opened from. One
             * short label, because every question worth asking of this table
             * is "how many X, grouped by subject".
             */
            $table->string('subject', 48)->nullable();

            /** Anything else worth keeping. Not queried, only read per user. */
            $table->json('meta')->nullable();

            /**
             * When it happened on the DEVICE, not when it reached us. These
             * arrive in batches after time offline, so created_at would cluster
             * every event of a week onto the minute the app next had signal.
             */
            $table->timestamp('occurred_at');

            /**
             * The client's own id for this event.
             *
             * Pushes are retried - that is the whole point of the outbox - so
             * without this a flaky connection turns one quiz completion into
             * five. Unique per user rather than globally: two devices
             * generating the same uuid is not a case worth losing sleep over,
             * but two users is not a collision at all.
             */
            $table->uuid('client_id');
            $table->unique(['user_id', 'client_id']);

            $table->timestamps();

            // The two shapes every report here uses: one user's timeline, and
            // one event name across everybody over a period.
            $table->index(['user_id', 'occurred_at']);
            $table->index(['name', 'occurred_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_events');
    }
};
