<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('exercises', function (Blueprint $table) {
            // Extra time the contraction is held at full (peak) after ramping up,
            // before relaxing. 0 = no hold (ramp straight into relax).
            $table->decimal('hold_seconds', 6, 2)->default(0)->after('relax_seconds');
        });
    }

    public function down(): void
    {
        Schema::table('exercises', function (Blueprint $table) {
            $table->dropColumn('hold_seconds');
        });
    }
};
