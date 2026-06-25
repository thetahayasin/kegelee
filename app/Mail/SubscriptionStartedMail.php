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
        $accent    = $settings->get('color_accent', '#E8202A');
        $plan      = $this->subscription->plan;
        $endsAt    = $this->subscription->ends_at;
        $isTrial   = $this->subscription->status === 'trialing';

        return new Content(view: 'emails.subscription', with: [
            'appName'   => $appName,
            'accent'    => $accent,
            'headline'  => "You're now a Premium member!",
            'body'      => $isTrial
                ? "Your {$plan->name} free trial is active. Full access is yours — enjoy every feature."
                : "Your {$plan->name} subscription is active. Full access is yours — enjoy every feature.",
            'detail'    => $endsAt
                ? ($isTrial
                    ? "Trial ends on {$endsAt->format('F j, Y')}. After that, your subscription renews automatically unless cancelled."
                    : "Your subscription renews on {$endsAt->format('F j, Y')}. You can manage billing anytime via Google Play.")
                : "Your lifetime access is active — no renewal needed.",
            'ctaLabel'  => 'Open the App',
        ]);
    }
}
