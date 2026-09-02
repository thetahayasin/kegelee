<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One row per install, so "which app version is out there" is answerable.
 *
 * Every support question starts with "which build are they on, on what
 * Android, in what language" - and none of that was recorded anywhere. It is
 * facts about the INSTALL, not about the person, so it lives here rather than
 * being copied onto every event row: the device sends it once per push and it
 * overwrites the same row for that install.
 *
 * Deliberately not a fingerprint. The install id is a random uuid the app
 * generates and forgets on uninstall; there is no advertising id, no hardware
 * id and no location. Timezone stays on `users` where it already is.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('devices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            /** The app's own random id for this install. */
            $table->string('install_id', 64);

            $table->string('platform', 16)->nullable();
            $table->string('os_version', 24)->nullable();
            $table->string('app_version', 24)->nullable();
            $table->string('locale', 12)->nullable();

            /** First and latest push seen from this install. */
            $table->timestamp('first_seen_at')->nullable();
            $table->timestamp('last_seen_at')->nullable();

            $table->timestamps();

            // One row per install per account: the same phone signed into two
            // accounts is two rows, which is what the reports mean by a device.
            $table->unique(['user_id', 'install_id']);
            // "Who is on the newest build" and "how many installs are live".
            $table->index(['app_version', 'last_seen_at']);
            $table->index('last_seen_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('devices');
    }
};
