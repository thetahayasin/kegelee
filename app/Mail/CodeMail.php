<?php

namespace App\Mail;

use App\Support\Locales;
use App\Support\MailTranslations;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class CodeMail extends Mailable
{
    use Queueable, SerializesModels;

    /** The three things a code is ever for. Anything else is treated as verify. */
    private const PURPOSES = ['reset', 'verify', 'delete'];

    public function __construct(
        public string $code,
        public string $purpose,
        public string $appName,
        public string $accent = '#c1ff72',
        // Not $locale: Illuminate\Mail\Mailable already declares an untyped
        // $locale of its own for its translator integration, and redeclaring
        // it with a type is a fatal error.
        public ?string $langTag = null,
    ) {
    }

    /**
     * 'delete' used to fall through to 'verify' here and in the template, so
     * the email asking somebody to confirm deleting their account was headed
     * "verify your email". It is its own purpose now.
     */
    private function key(string $prefix): string
    {
        $purpose = in_array($this->purpose, self::PURPOSES, true) ? $this->purpose : 'verify';

        return $prefix.'_'.$purpose;
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: MailTranslations::get($this->langTag, $this->key('subject'), $this->appName),
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.code',
            with: [
                'heading' => MailTranslations::get($this->langTag, $this->key('heading'), $this->appName),
                'intro'   => MailTranslations::get($this->langTag, 'body', $this->appName),
                'ignore'  => MailTranslations::get($this->langTag, 'ignore', $this->appName),
                'dir'     => Locales::isRtl($this->langTag) ? 'rtl' : 'ltr',
                'lang'    => Locales::resolve($this->langTag) ?? Locales::BASE,
            ],
        );
    }
}
