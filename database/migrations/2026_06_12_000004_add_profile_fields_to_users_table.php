<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('is_admin')->default(false)->after('password');
            $table->foreignId('level_id')->nullable()->after('is_admin')->constrained()->nullOnDelete();
            $table->unsignedInteger('level_started_days')->default(0)->after('level_id');
            $table->timestamp('onboarded_at')->nullable()->after('level_started_days');
            $table->string('timezone')->nullable()->after('onboarded_at');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('level_id');
            $table->dropColumn(['is_admin', 'level_started_days', 'onboarded_at', 'timezone']);
        });
    }
};
