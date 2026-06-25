<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('plans', 'trial_days')) {
            Schema::table('plans', function (Blueprint $table) {
                $table->dropColumn('trial_days');
            });
        }

        Schema::table('subscriptions', function (Blueprint $table) {
            $table->boolean('auto_renewing')->default(true)->after('canceled_at');
        });
    }

    public function down(): void
    {
        Schema::table('plans', function (Blueprint $table) {
            $table->unsignedInteger('trial_days')->default(0)->after('interval_count');
        });

        Schema::table('subscriptions', function (Blueprint $table) {
            $table->dropColumn('auto_renewing');
        });
    }
};
