<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

class EmailCode extends Model
{
    protected $guarded = [];

    protected $casts = [
        'expires_at' => 'datetime',
    ];

    /**
     * Issue a fresh 6-digit code for an email + purpose, replacing any code
     * already outstanding for that pair.
     *
     * One row per (email, purpose) is a database rule now, not a convention:
     * delete-then-create left a window where two concurrent requests both
     * inserted, and verify() reads first() - so one of the two codes emailed
     * would never work.
     */
    public static function issue(string $email, string $purpose = 'verify', int $minutes = 15): self
    {
        return static::updateOrCreate(
            ['email' => $email, 'purpose' => $purpose],
            [
                'code' => str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT),
                'expires_at' => now()->addMinutes($minutes),
                // A reissue starts the guess budget again; the old code is
                // gone, so its wrong guesses no longer describe anything.
                'attempts' => 0,
            ],
        );
    }

    /** Wrong guesses allowed before the code is burned. */
    public const MAX_ATTEMPTS = 5;

    public static function verify(string $email, string $code, string $purpose = 'verify'): bool
    {
        // Fetch by email+purpose (issue() keeps at most one) and compare the
        // code in PHP, so wrong guesses can be counted against the row. Capped
        // at MAX_ATTEMPTS: a 6-digit code must never be brute-forceable within
        // its lifetime - the per-IP route throttle alone doesn't stop guesses
        // spread across many IPs.
        $row = static::where('email', $email)
            ->where('purpose', $purpose)
            ->where('expires_at', '>', Carbon::now())
            ->first();

        if (! $row) {
            return false;
        }

        // A row that has already spent its budget is dead even to the RIGHT
        // code. It should not exist - the miss below burns it - but if one is
        // ever left behind (a crash between the increment and the delete, a
        // row written by hand), honouring it would hand the guesser the win
        // they had already been cut off from.
        if ($row->attempts >= self::MAX_ATTEMPTS) {
            static::whereKey($row->id)->delete();

            return false;
        }

        if (! hash_equals($row->code, $code)) {
            // Counted in the database, not in PHP. Read-then-write let two
            // requests arriving together both read attempts = 4 and both write
            // 5, so a burst of parallel guesses cost one attempt between them
            // and the cap could be walked straight past. The WHERE is the
            // budget: the row is only bumped while there is one left, and the
            // number of rows the database says it changed tells us whether
            // this guess was inside it.
            $spentOne = static::whereKey($row->id)
                ->where('attempts', '<', self::MAX_ATTEMPTS - 1)
                ->increment('attempts');

            if ($spentOne === 0) {
                // No budget left, so this guess was the last one allowed. The
                // code is burned rather than left to be guessed at again.
                static::whereKey($row->id)->delete();
            }

            return false;
        }

        $row->delete();

        return true;
    }
}
