<?php

namespace App\Support;

/**
 * Translated legal page copy.
 *
 * SOURCE holds the English text as a list of [tag, text] blocks. Every
 * translation is then just an ordered list of STRINGS - the tag sequence is
 * reused from SOURCE rather than repeated per language.
 *
 * That is the whole point of the shape: 28 languages x 3 pages of hand-written
 * HTML is 84 chances to lose a closing tag, and a broken privacy policy is not
 * a thing you find out about gracefully. Here the markup is generated once and
 * a language can only be wrong by having the wrong number of blocks, which
 * render() refuses and a test asserts.
 *
 * Everything here is machine-translated and seeded with is_reviewed = false.
 * Legal text carries real consequences and no engine is qualified to write it
 * for 28 jurisdictions; the admin editor shows which languages a human has
 * actually signed off, and the flag is there to be ticked deliberately.
 */
class LegalPageTranslations
{
    /** @var array<string,array{title:string,blocks:array<int,array{0:string,1:string}>}> */
    public const SOURCE = [
        'privacy-policy' => [
            'title' => 'Privacy Policy',
            'blocks' => [
                ['p', 'This Privacy Policy explains what information Kegelee collects, how it is used, and the choices you have. We keep it short and in plain language.'],
                ['h2', 'What we collect'],
                ['p', 'When you create an account we store your name, email address, and a securely hashed password. If you sign in with Google, we receive your name and email address from Google.'],
                ['p', 'While you train, the app records your workout sessions, completed training days, endurance measurements, chosen difficulty level, and reminder times. This progress data is stored on your device first and synced to our server so you can restore it if you reinstall or change phones.'],
                ['h2', 'What we do not collect'],
                ['p', 'We do not collect your location, contacts, photos, or any health data beyond the training progress described above. We do not show ads and we never sell your data to anyone.'],
                ['h2', 'Payments'],
                ['p', 'Subscriptions are billed by Google Play. We never see or store your card details. We receive a purchase confirmation from Google so we can unlock your subscription and keep it active across your devices.'],
                ['h2', 'How your data is used'],
                ['p', 'Your data is used only to run the app: signing you in, saving your progress, syncing between devices, sending verification and password reset emails, and managing your subscription. That is all.'],
                ['h2', 'Where your data lives'],
                ['p', 'Your progress lives on your device and is synced over an encrypted connection to our server. Access to our server is restricted and protected.'],
                ['h2', 'Deleting your data'],
                ['p', 'You can reset your training progress from the app settings at any time, which also deletes it from our server. To delete your account and all data connected to it, contact us at the address below and we will remove it.'],
                ['h2', 'Contact'],
                ['p', 'Questions about privacy? Email us at support@kegelee.com.'],
            ],
        ],
        'refund-policy' => [
            'title' => 'Refund Policy',
            'blocks' => [
                ['p', 'Kegelee subscriptions are purchased and billed through Google Play, so refunds are handled by Google under the Google Play refund policy.'],
                ['h2', 'How to request a refund'],
                ['p', 'Open the Google Play Store, go to your account, choose Payments and subscriptions, select the Kegelee purchase, and request a refund. For recent purchases Google usually resolves requests within a day or two.'],
                ['h2', 'Cancelling'],
                ['p', 'You can cancel your subscription at any time in Google Play. You keep full access until the end of the period you paid for, and you will not be charged again after that.'],
                ['h2', 'Need help?'],
                ['p', 'If you have trouble with a purchase or a refund, email us at support@kegelee.com and we will do our best to help.'],
            ],
        ],
        'terms' => [
            'title' => 'Terms of Service',
            'blocks' => [
                ['p', 'Welcome to Kegelee. By creating an account or using the app you agree to these terms. Please read them; they are short.'],
                ['h2', 'What Kegelee is'],
                ['p', 'Kegelee is a guided pelvic floor training app. It provides exercise routines, progress tracking, and reminders. It is a fitness tool, not a medical device.'],
                ['h2', 'Not medical advice'],
                ['p', 'Kegelee does not provide medical advice, diagnosis, or treatment. If you have a medical condition, are recovering from surgery, are pregnant, or feel pain while exercising, stop and talk to a doctor before continuing. Always listen to your body.'],
                ['h2', 'Your account'],
                ['p', 'You are responsible for keeping your login details safe and for what happens under your account. You must provide accurate information when signing up.'],
                ['h2', 'Subscriptions'],
                ['p', 'The full training experience requires a subscription purchased through Google Play. Prices are shown in the app before you buy. Subscriptions renew automatically unless you cancel in Google Play, and cancelling keeps your access until the end of the paid period. Refunds follow our Refund Policy and the Google Play rules.'],
                ['h2', 'Fair use'],
                ['p', 'Do not attempt to copy, resell, break, or abuse the app or its services. We may suspend accounts that do.'],
                ['h2', 'Liability'],
                ['p', 'Kegelee is provided as is. To the extent the law allows, we are not liable for injuries or losses arising from use of the app. Train sensibly and within your limits.'],
                ['h2', 'Changes'],
                ['p', 'We may update these terms as the app evolves. Meaningful changes will be reflected on this page with the date above.'],
                ['h2', 'Contact'],
                ['p', 'Questions about these terms? Email us at support@kegelee.com.'],
            ],
        ],
    ];

    /** Where the per-locale files live. */
    private const DIR = 'legal';

    /**
     * Every translated locale: locale => slug => ['title', 'blocks'].
     *
     * One file per language under lang/legal/, because 28 languages in a
     * single constant is a file nobody can review and every edit collides in.
     * A file per language is what you hand to a translator.
     *
     * `blocks` must have exactly as many entries as SOURCE[slug]['blocks'],
     * in the same order. Locales with no file simply fall back to English.
     *
     * @return array<string,array<string,array{title:string,blocks:array<int,string>}>>
     */
    public static function all(): array
    {
        $out = [];
        foreach (array_keys(Locales::translatable()) as $locale) {
            $data = self::forLocale($locale);
            if ($data !== null) {
                $out[$locale] = $data;
            }
        }

        return $out;
    }

    /** @return array<string,array{title:string,blocks:array<int,string>}>|null */
    public static function forLocale(string $locale): ?array
    {
        $path = lang_path(self::DIR.'/'.$locale.'.php');

        return is_file($path) ? require $path : null;
    }

    /** How many blocks a page has, for callers checking their own arrays. */
    public static function blockCount(string $slug): int
    {
        return count(self::SOURCE[$slug]['blocks'] ?? []);
    }

    /**
     * Build the HTML for one page in one locale.
     *
     * @param  array<int,string>  $blocks  Same order and count as the source.
     *
     * @throws \InvalidArgumentException when the block count does not match,
     *         because silently zipping mismatched arrays would put a heading's
     *         text inside a paragraph and shift every block after it.
     */
    public static function render(string $slug, array $blocks): string
    {
        $source = self::SOURCE[$slug]['blocks'] ?? null;
        if ($source === null) {
            throw new \InvalidArgumentException("Unknown legal page slug: {$slug}");
        }

        if (count($blocks) !== count($source)) {
            throw new \InvalidArgumentException(sprintf(
                'Page "%s" has %d blocks but the translation supplied %d.',
                $slug,
                count($source),
                count($blocks),
            ));
        }

        $html = [];
        foreach ($source as $i => [$tag, $_english]) {
            $text = trim($blocks[$i]);
            $html[] = "<{$tag}>".e($text)."</{$tag}>";
        }

        return implode("\n", $html);
    }

    /** The English HTML, rendered from the same source the translations use. */
    public static function renderSource(string $slug): string
    {
        $blocks = array_map(fn (array $b) => $b[1], self::SOURCE[$slug]['blocks'] ?? []);

        return self::render($slug, $blocks);
    }
}
