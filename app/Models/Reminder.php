<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['user_id', 'weekday', 'times', 'is_enabled'])]
class Reminder extends Model
{
    public const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    public const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    public const RRULE = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

    protected function casts(): array
    {
        return [
            'is_enabled' => 'boolean',
            'times' => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function dayName(): string
    {
        return self::DAYS[$this->weekday] ?? 'Unknown';
    }

    public function rruleDay(): string
    {
        return self::RRULE[$this->weekday] ?? 'MO';
    }
}
