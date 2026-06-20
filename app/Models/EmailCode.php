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

    public static function verify(string $email, string $code, string $purpose = 'verify'): bool
    {
        $row = static::where('email', $email)
            ->where('purpose', $purpose)
            ->where('code', $code)
            ->where('expires_at', '>', Carbon::now())
            ->first();

        if (! $row) {
            return false;
        }

        $row->delete();

        return true;
    }
}
