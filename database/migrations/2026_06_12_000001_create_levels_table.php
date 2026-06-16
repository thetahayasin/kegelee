<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('levels', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('number')->unique();
            $table->string('name');
            $table->text('description')->nullable();
            $table->unsignedInteger('days_to_complete')->default(30);
            $table->unsignedInteger('sessions_per_day')->nullable();
            // Difficulty: total session length and the rest between exercises
            // (seconds). The session packs randomised exercises to fill this.
            $table->decimal('total_session_seconds', 8, 2)->default(300);
            $table->decimal('rest_seconds', 6, 2)->default(10);
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('levels');
    }
};
