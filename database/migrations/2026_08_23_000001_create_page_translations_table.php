<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Per-locale copies of a legal page.
 *
 * Deliberately a side table rather than locale columns on `pages`: the base
 * row stays the single English source that every other part of the system
 * already reads, and a locale that has no row here simply falls back to it.
 * That means adding a language is inserting rows, never a migration, and a
 * half-finished translation set degrades to English instead of to a blank
 * privacy policy - which is the failure that actually matters here.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('page_translations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('page_id')->constrained()->cascadeOnDelete();
            // BCP-47 tag as the app uses it: 'de', 'pt-BR', 'zh-Hans'.
            $table->string('locale', 12);
            $table->string('title');
            $table->longText('content')->nullable();
            // Machine translations start unreviewed. Legal text carries real
            // consequences, so the admin list has to be able to show at a
            // glance which languages a human has actually signed off.
            $table->boolean('is_reviewed')->default(false);
            $table->timestamps();

            $table->unique(['page_id', 'locale']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('page_translations');
    }
};
