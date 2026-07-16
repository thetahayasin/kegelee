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

    /** Issue a fresh 6-digit code for an email + purpose (replacing old ones). */
    public static function issue(string $email, string $purpose = 'verify', int $minutes = 15): self
    {
        static::where('email', $email)->where('purpose', $purpose)->delete();

        return static::create([
            'email' => $email,
            'code' => str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT),
            'purpose' => $purpose,
            'expires_at' => now()->addMinutes($minutes),
        ]);
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

        if (! hash_equals($row->code, $code)) {
            if ($row->attempts + 1 >= self::MAX_ATTEMPTS) {
                $row->delete();
            } else {
                $row->increment('attempts');
            }

            return false;
        }

        $row->delete();

        return true;
    }
}
