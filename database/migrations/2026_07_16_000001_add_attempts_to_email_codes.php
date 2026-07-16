<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Failed-guess counter for emailed 6-digit codes. A code with no attempt cap
 * is brute-forceable within its 15-minute lifetime by spreading requests
 * across IPs (the route throttle is per-IP); after a handful of wrong guesses
 * the code is burned and a fresh one must be requested.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('email_codes', function (Blueprint $table) {
            $table->unsignedTinyInteger('attempts')->default(0);
        });
    }

    public function down(): void
    {
        Schema::table('email_codes', function (Blueprint $table) {
            $table->dropColumn('attempts');
        });
    }
};
