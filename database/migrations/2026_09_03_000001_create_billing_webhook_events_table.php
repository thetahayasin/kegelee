<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Every store webhook we accept, recorded once.
 *
 * Both RevenueCat and Google Pub/Sub deliver AT LEAST once, so the same
 * EXPIRATION or RENEWAL arrives two or three times whenever a response is slow.
 * Without a record of what has already been applied, a redelivered renewal
 * re-sent the renewal email and a redelivered purchase could mint a second row.
 * The unique (source, event_id) is the whole point of the table.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('billing_webhook_events', function (Blueprint $table) {
            $table->id();
            $table->string('source', 16);
            // 191 so the unique index fits inside MySQL's 767-byte key limit on
            // older utf8mb4 collations.
            $table->string('event_id', 191);
            $table->string('event_type', 64)->nullable();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->unsignedBigInteger('subscription_id')->nullable();
            $table->timestamp('occurred_at')->nullable();
            $table->json('payload')->nullable();
            $table->timestamp('handled_at')->nullable();
            // Why an event did nothing: 'stale', 'unknown_user', 'test', and so
            // on. This is what makes a gap in the subscription table
            // reconcilable after the fact instead of merely puzzling.
            $table->string('note')->nullable();
            $table->timestamps();

            $table->unique(['source', 'event_id']);
            $table->index(['source', 'event_type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('billing_webhook_events');
    }
};
