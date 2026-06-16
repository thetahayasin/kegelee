<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Replace the numeric glow "speed in seconds" with a simpler per-phase
        // animation mode: "slowly" (the glow travels over the phase's seconds and
        // completes) or "at_once" (it moves to its target right away, seamlessly).
        Schema::table('exercises', function (Blueprint $table) {
            $table->string('contract_glow_mode')->default('slowly')->after('relax_label');
            $table->string('relax_glow_mode')->default('slowly')->after('contract_glow_mode');
        });

        Schema::table('exercises', function (Blueprint $table) {
            $table->dropColumn(['contract_glow_speed', 'relax_glow_speed']);
        });
    }

    public function down(): void
    {
        Schema::table('exercises', function (Blueprint $table) {
            $table->decimal('contract_glow_speed', 6, 2)->default(0.45)->after('relax_label');
            $table->decimal('relax_glow_speed', 6, 2)->default(0.45)->after('contract_glow_speed');
        });

        Schema::table('exercises', function (Blueprint $table) {
            $table->dropColumn(['contract_glow_mode', 'relax_glow_mode']);
        });
    }
};
