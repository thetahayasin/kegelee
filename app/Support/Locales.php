<?php

namespace App\Support;

/**
 * The languages the apps ship.
 *
 * Mirrors SUPPORTED_LANGUAGES in react-native-app/src/i18n/index.ts, which is
 * the source of truth for what a device can ask for. Kept as a hardcoded
 * catalogue in App\Support for the same reason the exercises and plans are:
 * it is content the backend serves rather than data anyone edits.
 *
 * Tags are base-language except where a regional split is a genuinely
 * different translation - pt-BR and es-419 read differently enough from
 * pt-PT and es-ES that sharing one file would be worse than not translating.
 */
class Locales
{
    /** tag => the language's own name, never translated into the current one. */
    public const SUPPORTED = [
        'en'      => 'English',
        'ar'      => 'العربية',
        'cs'      => 'Čeština',
        'da'      => 'Dansk',
        'de'      => 'Deutsch',
        'es'      => 'Español',
        'es-419'  => 'Español (Latinoamérica)',
        'fi'      => 'Suomi',
        'fr'      => 'Français',
        'he'      => 'עברית',
        'hi'      => 'हिन्दी',
        'hu'      => 'Magyar',
        'id'      => 'Bahasa Indonesia',
        'it'      => 'Italiano',
        'ja'      => '日本語',
        'ko'      => '한국어',
        'nl'      => 'Nederlands',
        'no'      => 'Norsk',
        'pl'      => 'Polski',
        'pt-BR'   => 'Português (Brasil)',
        'ro'      => 'Română',
        'ru'      => 'Русский',
        'sk'      => 'Slovenčina',
        'sv'      => 'Svenska',
        'th'      => 'ไทย',
        'tr'      => 'Türkçe',
        'uk'      => 'Українська',
        'vi'      => 'Tiếng Việt',
        'zh-Hans' => '简体中文',
    ];

    /** The language every page is authored in, and the fallback for all others. */
    public const BASE = 'en';

    /** Scripts written right to left - the admin editor flips the textarea. */
    public const RTL = ['ar', 'he'];

    /** @return array<string,string> */
    public static function all(): array
    {
        return self::SUPPORTED;
    }

    /** Everything except the base language, i.e. what can be translated. */
    public static function translatable(): array
    {
        return array_diff_key(self::SUPPORTED, [self::BASE => '']);
    }

    public static function isSupported(?string $tag): bool
    {
        return $tag !== null && array_key_exists($tag, self::SUPPORTED);
    }

    public static function isRtl(?string $tag): bool
    {
        return in_array(self::baseOf((string) $tag), self::RTL, true);
    }

    public static function baseOf(string $tag): string
    {
        return explode('-', $tag)[0];
    }

    /**
     * Best supported tag for whatever a client asked for, or null.
     *
     * Exact match wins ('pt-BR'), then the base language ('pt' -> 'pt', and
     * 'de-AT' -> 'de'), then a regional variant when only one exists ('pt' ->
     * 'pt-BR'). A Brazilian file is a far better answer for a pt-PT reader
     * than English is, and the same holds for es-419.
     */
    public static function resolve(?string $tag): ?string
    {
        if ($tag === null) {
            return null;
        }

        $tag = trim(str_replace('_', '-', $tag));
        if ($tag === '') {
            return null;
        }

        foreach (array_keys(self::SUPPORTED) as $supported) {
            if (strcasecmp($supported, $tag) === 0) {
                return $supported;
            }
        }

        $base = strtolower(self::baseOf($tag));

        foreach (array_keys(self::SUPPORTED) as $supported) {
            if (strcasecmp($supported, $base) === 0) {
                return $supported;
            }
        }

        foreach (array_keys(self::SUPPORTED) as $supported) {
            if (strcasecmp(self::baseOf($supported), $base) === 0) {
                return $supported;
            }
        }

        return null;
    }
}
