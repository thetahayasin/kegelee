<?php

namespace App\Exceptions;

use Illuminate\Http\Request;
use RuntimeException;

class AppleSignInException extends RuntimeException
{
    public function __construct(string $message, public readonly int $status = 422)
    {
        parent::__construct($message);
    }

    public function render(Request $request)
    {
        return $request->is('api/*')
            ? response()->json(['error' => $this->getMessage()], $this->status)
            : back()->withErrors(['apple' => $this->getMessage()]);
    }

    public function report(): bool
    {
        // Authentication errors must not put identity tokens or codes in logs.
        return true;
    }
}
