<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One record per subscription email actually sent.
 *
 * Three different code paths could send the welcome email for a single
 * purchase (the paywall, the sync push and the RevenueCat webhook), and a
 * redelivered RENEWAL re-sent the renewal email every time it arrived. The
 * unique key is the dedupe: the renewal key carries the period's end date, so
 * a genuine second renewal still mails and a replay of the first does not.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('subscription_mail_log', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('subscription_id');
            $table->string('mail_class', 191);
            $table->timestamp('sent_at')->nullable();

            $table->unique(['subscription_id', 'mail_class']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('subscription_mail_log');
    }
};
