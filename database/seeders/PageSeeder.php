<?php

namespace Database\Seeders;

use App\Models\Page;
use Illuminate\Database\Seeder;

/**
 * The legal pages, with real content ready for release. Create-only by
 * default so admin edits are never overwritten; the refresh migration
 * upgrades pages that still carry the old placeholder text.
 */
class PageSeeder extends Seeder
{
    public function run(): void
    {
        foreach (self::pages() as $i => $data) {
            Page::firstOrCreate(
                ['slug' => $data['slug']],
                $data + ['is_published' => true, 'sort_order' => $i],
            );
        }
    }

    /** @return array<int, array{slug: string, title: string, content: string}> */
    public static function pages(): array
    {
        return [
            [
                'slug' => 'privacy-policy',
                'title' => 'Privacy Policy',
                'content' => <<<'HTML'
<p>This Privacy Policy explains what information Kegelee collects, how it is used, and the choices you have. We keep it short and in plain language.</p>

<h2>What we collect</h2>
<p>When you create an account we store your name, email address, and a securely hashed password. If you sign in with Google, we receive your name and email address from Google.</p>
<p>While you train, the app records your workout sessions, completed training days, endurance measurements, chosen difficulty level, and reminder times. This progress data is stored on your device first and synced to our server so you can restore it if you reinstall or change phones.</p>

<h2>What we do not collect</h2>
<p>We do not collect your location, contacts, photos, or any health data beyond the training progress described above. We do not show ads and we never sell your data to anyone.</p>

<h2>Payments</h2>
<p>Subscriptions are billed by Google Play. We never see or store your card details. We receive a purchase confirmation from Google so we can unlock your subscription and keep it active across your devices.</p>

<h2>How your data is used</h2>
<p>Your data is used only to run the app: signing you in, saving your progress, syncing between devices, sending verification and password reset emails, and managing your subscription. That is all.</p>

<h2>Where your data lives</h2>
<p>Your progress lives on your device and is synced over an encrypted connection to our server. Access to our server is restricted and protected.</p>

<h2>Deleting your data</h2>
<p>You can reset your training progress from the app settings at any time, which also deletes it from our server. To delete your account and all data connected to it, contact us at the address below and we will remove it.</p>

<h2>Contact</h2>
<p>Questions about privacy? Email us at support@kegelee.com.</p>
HTML,
            ],
            [
                'slug' => 'refund-policy',
                'title' => 'Refund Policy',
                'content' => <<<'HTML'
<p>Kegelee subscriptions are purchased and billed through Google Play, so refunds are handled by Google under the Google Play refund policy.</p>

<h2>How to request a refund</h2>
<p>Open the Google Play Store, go to your account, choose Payments and subscriptions, select the Kegelee purchase, and request a refund. For recent purchases Google usually resolves requests within a day or two.</p>

<h2>Cancelling</h2>
<p>You can cancel your subscription at any time in Google Play. You keep full access until the end of the period you paid for, and you will not be charged again after that.</p>

<h2>Need help?</h2>
<p>If you have trouble with a purchase or a refund, email us at support@kegelee.com and we will do our best to help.</p>
HTML,
            ],
            [
                'slug' => 'terms',
                'title' => 'Terms of Service',
                'content' => <<<'HTML'
<p>Welcome to Kegelee. By creating an account or using the app you agree to these terms. Please read them; they are short.</p>

<h2>What Kegelee is</h2>
<p>Kegelee is a guided pelvic floor training app. It provides exercise routines, progress tracking, and reminders. It is a fitness tool, not a medical device.</p>

<h2>Not medical advice</h2>
<p>Kegelee does not provide medical advice, diagnosis, or treatment. If you have a medical condition, are recovering from surgery, are pregnant, or feel pain while exercising, stop and talk to a doctor before continuing. Always listen to your body.</p>

<h2>Your account</h2>
<p>You are responsible for keeping your login details safe and for what happens under your account. You must provide accurate information when signing up.</p>

<h2>Subscriptions</h2>
<p>The full training experience requires a subscription purchased through Google Play. Prices are shown in the app before you buy. Subscriptions renew automatically unless you cancel in Google Play, and cancelling keeps your access until the end of the paid period. Refunds follow our Refund Policy and the Google Play rules.</p>

<h2>Fair use</h2>
<p>Do not attempt to copy, resell, break, or abuse the app or its services. We may suspend accounts that do.</p>

<h2>Liability</h2>
<p>Kegelee is provided as is. To the extent the law allows, we are not liable for injuries or losses arising from use of the app. Train sensibly and within your limits.</p>

<h2>Changes</h2>
<p>We may update these terms as the app evolves. Meaningful changes will be reflected on this page with the date above.</p>

<h2>Contact</h2>
<p>Questions about these terms? Email us at support@kegelee.com.</p>
HTML,
            ],
        ];
    }
}
