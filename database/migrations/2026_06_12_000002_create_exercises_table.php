<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('exercises', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->text('description')->nullable();
            $table->text('instructions')->nullable();
            $table->string('icon_path')->nullable();
            $table->string('video_path')->nullable();
            // Universal rhythm the circle follows for this exercise. How long
            // it runs is set per level (see exercise_level pivot).
            $table->decimal('contract_seconds', 6, 2)->default(3);
            $table->decimal('relax_seconds', 6, 2)->default(3);
            $table->unsignedInteger('unlock_after_days')->default(0);
            $table->boolean('is_premium')->default(false);
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['is_active', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('exercises');
    }
};
