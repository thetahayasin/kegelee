<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
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

    public function exercises(): BelongsToMany
    {
        return $this->belongsToMany(Exercise::class)
            ->withPivot('duration_seconds')
            ->withTimestamps();
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function effectiveSessionsPerDay(): int
    {
        return $this->sessions_per_day
            ?? (int) app(\App\Services\SettingsService::class)->get('sessions_per_day', 2);
    }
}
