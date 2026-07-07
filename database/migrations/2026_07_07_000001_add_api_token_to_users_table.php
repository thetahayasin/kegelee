<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Per-user API token for device→backend sync auth. Replaces both the global
 * SYNC_API_KEY (which shipped inside the APK) and the password-hash headers
 * (which let a leaked hash act as a credential). Issued once per user on any
 * successful auth; revoke by setting it null (forces re-login everywhere).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('api_token', 64)->nullable()->index();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex(['api_token']);
            $table->dropColumn('api_token');
        });
    }
};
