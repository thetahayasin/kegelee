<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('exercises', function (Blueprint $table) {
            $table->string('difficulty')->default('beginner'); // beginner, pro, expert
            $table->decimal('min_duration', 8, 2)->default(30.0);
            $table->decimal('max_duration', 8, 2)->default(120.0);
        });

        Schema::table('levels', function (Blueprint $table) {
            $table->unsignedInteger('beginner_count')->default(2);
            $table->unsignedInteger('pro_count')->default(0);
            $table->unsignedInteger('expert_count')->default(0);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('exercises', function (Blueprint $table) {
            $table->dropColumn(['difficulty', 'min_duration', 'max_duration']);
        });

        Schema::table('levels', function (Blueprint $table) {
            $table->dropColumn(['beginner_count', 'pro_count', 'expert_count']);
        });
    }
};
