<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('exercises', function (Blueprint $table) {
            $table->string('contract_label')->default('Contract & hold')->after('start_phase');
            $table->string('relax_label')->default('Relax')->after('contract_label');
        });
    }

    public function down(): void
    {
        Schema::table('exercises', function (Blueprint $table) {
            $table->dropColumn(['contract_label', 'relax_label']);
        });
    }
};
