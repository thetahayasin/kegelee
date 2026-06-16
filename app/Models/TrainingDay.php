<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TrainingDay extends Model
{
    protected $guarded = [];

    // `date` is stored as a plain Y-m-d string so day lookups (firstOrCreate)
    // match exactly and stay idempotent across requests.
    protected $casts = [
        'completed_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isComplete(): bool
    {
        return $this->completed_at !== null;
    }
}
