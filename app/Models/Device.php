<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One install of the app, as last seen.
 *
 * Facts about the phone, not about the person: which build, which Android,
 * which language. They belong here rather than on every event row because they
 * change once in a while and would otherwise be copied onto thousands of rows
 * that no report groups by.
 */
class Device extends Model
{
    protected $guarded = [];

    protected $casts = [
        'first_seen_at' => 'datetime',
        'last_seen_at' => 'datetime',
    ];

    /** Platforms we accept. Anything else is a client we do not ship. */
    public const PLATFORMS = ['android', 'ios'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** "Android 14 · 1.4.0 · en", for the admin. */
    public function getSummaryAttribute(): string
    {
        return collect([
            $this->platform ? ucfirst($this->platform).($this->os_version ? ' '.$this->os_version : '') : null,
            $this->app_version ? 'app '.$this->app_version : null,
            $this->locale,
        ])->filter()->implode(' · ');
    }
}
