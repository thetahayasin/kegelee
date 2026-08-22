<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One locale's copy of a legal page.
 *
 * Rows are optional by design: a locale with no row falls back to the base
 * English page rather than showing nothing. See the migration for why this is
 * a side table instead of columns on `pages`.
 */
class PageTranslation extends Model
{
    protected $guarded = [];

    protected $casts = [
        'is_reviewed' => 'boolean',
    ];

    public function page(): BelongsTo
    {
        return $this->belongsTo(Page::class);
    }
}
