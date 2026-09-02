<?php

namespace App\Mail;

use App\Models\Subscription;
use App\Services\SettingsService;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class SubscriptionRenewedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public Subscription $subscription) {}

    public function envelope(): Envelope
    {
        $appName = app(SettingsService::class)->get('app_name', 'Kegel Trainer');

        return new Envelope(subject: "Your {$appName} subscription has renewed");
    }

    public function content(): Content
    {
        $settings = app(SettingsService::class);
        $appName  = $settings->get('app_name', 'Kegel Trainer');
        $accent   = $settings->get('color_accent', '#c1ff72');
        $endsAt   = $this->subscription->ends_at;
        // Null-safe: an unrecognised product id leaves plan_id empty, and
        // reading ->name off it threw from inside the webhook.
        $planName = $this->subscription->plan?->name ?? 'Premium';

        return new Content(view: 'emails.subscription', with: [
            'appName'  => $appName,
            'accent'   => $accent,
            'headline' => 'Subscription renewed',
            'body'     => "Your {$planName} subscription has been renewed successfully. Enjoy uninterrupted access to all features.",
            'detail'   => $endsAt
                ? "Your next renewal date is {$endsAt->format('F j, Y')}. Manage billing anytime in your subscription settings."
                : null,
            'ctaLabel' => 'Open the App',
        ]);
    }
}
