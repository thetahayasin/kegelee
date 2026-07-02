<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * Exercises, levels and onboarding are hardcoded in the app now
 * (App\Support catalogues), so the per-user timing overrides, the
 * exercise/level duration pivot and the onboarding slides tables are gone.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('user_exercise_settings');
        Schema::dropIfExists('exercise_level');
        Schema::dropIfExists('onboarding_slides');
    }

    public function down(): void
    {
        // Intentionally irreversible: the feature was removed, not renamed.
    }
};
