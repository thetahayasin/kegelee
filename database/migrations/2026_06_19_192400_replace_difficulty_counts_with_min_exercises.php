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
        Schema::table('levels', function (Blueprint $table) {
            $table->unsignedInteger('min_exercises')->default(3);
            $table->dropColumn(['beginner_count', 'pro_count', 'expert_count']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('levels', function (Blueprint $table) {
            $table->unsignedInteger('beginner_count')->default(2);
            $table->unsignedInteger('pro_count')->default(0);
            $table->unsignedInteger('expert_count')->default(0);
            $table->dropColumn('min_exercises');
        });
    }
};
