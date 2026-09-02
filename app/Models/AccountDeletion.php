<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A tally mark for an account that was deleted, with nothing on it that could
 * say whose it was.
 *
 * Written the moment before the account goes, because everything that could
 * answer "how many people leave, and how long did they stay" is cascaded away
 * with the user row itself.
 */
class AccountDeletion extends Model
{
    protected $guarded = [];

    protected $casts = [
        'deleted_at' => 'datetime',
        'had_subscription' => 'boolean',
    ];
}
