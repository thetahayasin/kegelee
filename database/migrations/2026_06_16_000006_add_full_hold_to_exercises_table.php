<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('exercises', function (Blueprint $table) {
            // When true the exercise is a single sustained contraction held for
            // its whole per-level duration (no relax beats, circle stays full).
            $table->boolean('full_hold')->default(false)->after('relax_label');
        });
    }

    public function down(): void
    {
        Schema::table('exercises', function (Blueprint $table) {
            $table->dropColumn('full_hold');
        });
    }
};
