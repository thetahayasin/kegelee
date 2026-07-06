<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Level extends Model
{
    protected $guarded = [];

    protected $casts = [
        'total_session_seconds' => 'float',
        'rest_seconds' => 'float',
        'min_exercises' => 'integer',
        'is_active' => 'boolean',
    ];

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function effectiveSessionsPerDay(): int
    {
        return $this->sessions_per_day
            ?? \App\Support\AppConfig::SESSIONS_PER_DAY;
    }
}
