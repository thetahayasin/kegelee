<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A tally mark for each account deleted, and nothing that identifies it.
 *
 * Deleting an account cascades its events away with it, so "how many people
 * leave, and how long do they stay first" is a question the event log can
 * never answer about itself - the rows that would answer it are exactly the
 * rows that get removed.
 *
 * So: no user id, no email, no foreign key. Three facts that describe the
 * departure and cannot be traced back to the person, written the moment before
 * the account goes.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('account_deletions', function (Blueprint $table) {
            $table->id();
            $table->timestamp('deleted_at');

            /** How long they stayed. Null for an account with no created_at. */
            $table->unsignedInteger('days_since_signup')->nullable();

            /** Whether they were paying when they left. */
            $table->boolean('had_subscription')->default(false);

            /** How much training they had done. */
            $table->unsignedInteger('sessions_done')->default(0);

            $table->timestamps();

            $table->index('deleted_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('account_deletions');
    }
};
