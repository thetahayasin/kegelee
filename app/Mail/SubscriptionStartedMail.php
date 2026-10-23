<?php

namespace App\Mail;

use App\Models\Subscription;
use App\Services\SettingsService;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class SubscriptionStartedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public Subscription $subscription) {}

    public function envelope(): Envelope
    {
        $appName = app(SettingsService::class)->get('app_name', 'Kegel Trainer');

        return new Envelope(subject: "Welcome to {$appName} Premium");
    }

    public function content(): Content
    {
        $settings  = app(SettingsService::class);
        $appName   = $settings->get('app_name', 'Kegel Trainer');
        $accent    = $settings->get('color_accent', '#c1ff72');
        // A row can legitimately have no plan: a product id the catalogue does
        // not know resolves to null, and an admin grant may never set one.
        // Reading ->name off that threw inside the mailable, which took the
        // whole webhook down with it.
        $planName  = $this->subscription->plan?->name ?? 'Premium';
        $endsAt    = $this->subscription->ends_at;
        $isTrial   = $this->subscription->status === 'trialing';

        return new Content(view: 'emails.subscription', with: [
            'appName'   => $appName,
            'accent'    => $accent,
            'headline'  => "You're now a Premium member!",
            'body'      => $isTrial
                ? "Your {$planName} free trial is active. Full access is yours, enjoy every feature."
                : "Your {$planName} subscription is active. Full access is yours, enjoy every feature.",
            'detail'    => $endsAt
                ? ($isTrial
                    ? "Trial ends on {$endsAt->format('F j, Y')}. After that, your subscription renews automatically unless cancelled."
                    : "Your subscription renews on {$endsAt->format('F j, Y')}. You can manage billing anytime in your subscription settings.")
                : "Your lifetime access is active, with no renewal needed.",
            'ctaLabel'  => 'Open the App',
        ]);
    }
}
