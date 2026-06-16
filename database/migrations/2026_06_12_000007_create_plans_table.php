<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('plans', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->text('description')->nullable();
            $table->decimal('price', 8, 2)->default(0);
            $table->string('currency', 3)->default('USD');
            $table->enum('interval', ['day', 'week', 'month', 'year', 'lifetime'])->default('month');
            $table->unsignedInteger('interval_count')->default(1);
            $table->unsignedInteger('trial_days')->default(0);
            $table->json('features')->nullable();
            $table->string('store_product_id')->nullable();
            $table->boolean('is_active')->default(true);
            $table->boolean('is_featured')->default(false);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('plans');
    }
};
