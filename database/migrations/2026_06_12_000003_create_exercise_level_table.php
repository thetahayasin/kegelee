<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('exercise_level', function (Blueprint $table) {
            $table->id();
            $table->foreignId('exercise_id')->constrained()->cascadeOnDelete();
            $table->foreignId('level_id')->constrained()->cascadeOnDelete();
            // How long this exercise runs in a session at this level (seconds).
            $table->decimal('duration_seconds', 6, 2)->default(30);
            $table->timestamps();

            $table->unique(['exercise_id', 'level_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('exercise_level');
    }
};
