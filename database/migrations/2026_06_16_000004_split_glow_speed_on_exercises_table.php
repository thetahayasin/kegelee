<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('exercises', function (Blueprint $table) {
            $table->renameColumn('glow_speed', 'contract_glow_speed');
        });

        Schema::table('exercises', function (Blueprint $table) {
            $table->float('relax_glow_speed')->default(0.45)->after('contract_glow_speed');
        });
    }

    public function down(): void
    {
        Schema::table('exercises', function (Blueprint $table) {
            $table->dropColumn('relax_glow_speed');
        });

        Schema::table('exercises', function (Blueprint $table) {
            $table->renameColumn('contract_glow_speed', 'glow_speed');
        });
    }
};
