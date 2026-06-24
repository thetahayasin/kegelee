<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('email_codes', function (Blueprint $table) {
            $table->index(['email', 'purpose', 'expires_at'], 'email_codes_lookup');
        });
    }

    public function down(): void
    {
        Schema::table('email_codes', function (Blueprint $table) {
            $table->dropIndex('email_codes_lookup');
        });
    }
};
