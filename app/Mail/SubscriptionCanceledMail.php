<?php

namespace App\Mail;

use App\Models\Subscription;
use App\Services\SettingsService;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class SubscriptionCanceledMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public Subscription $subscription) {}

    public function envelope(): Envelope
    {
        $appName = app(SettingsService::class)->get('app_name', 'Kegel Trainer');

        return new Envelope(subject: "Your {$appName} subscription has been cancelled");
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
            'headline' => 'Subscription cancelled',
            'body'     => "Your {$planName} subscription has been cancelled. We're sorry to see you go.",
            'detail'   => $endsAt && $endsAt->isFuture()
                ? "You still have access until {$endsAt->format('F j, Y')}. After that, premium features will no longer be available."
                : "Your premium access has ended. You can resubscribe at any time.",
            'ctaLabel' => null,
        ]);
    }
}
