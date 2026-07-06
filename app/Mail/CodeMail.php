<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class CodeMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $code,
        public string $purpose,
        public string $appName,
        public string $accent = '#c1ff72',
    ) {
    }

    public function envelope(): Envelope
    {
        $action = $this->purpose === 'reset' ? 'Reset your password' : 'Verify your email';

        return new Envelope(subject: $this->appName.' - '.$action.' code');
    }

    public function content(): Content
    {
        return new Content(view: 'emails.code');
    }
}
