<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('knowledge_lessons', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('icon')->nullable();          // emoji or short glyph for the card
            $table->string('thumbnail_path')->nullable(); // optional card image
            $table->string('video_path')->nullable();     // uploaded video file
            $table->string('video_url')->nullable();      // or an external URL
            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['is_active', 'sort_order']);
        });

        // Tracks which lessons a user has finished (drives the sequential unlock).
        Schema::create('knowledge_lesson_user', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('knowledge_lesson_id')->constrained()->cascadeOnDelete();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'knowledge_lesson_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('knowledge_lesson_user');
        Schema::dropIfExists('knowledge_lessons');
    }
};
