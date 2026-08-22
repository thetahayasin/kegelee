<?php

namespace App\Models;

use App\Support\Locales;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Page extends Model
{
    protected $guarded = [];

    protected $casts = [
        'is_published' => 'boolean',
    ];

    public function getRouteKeyName(): string
    {
        return 'slug';
    }

    public function translations(): HasMany
    {
        return $this->hasMany(PageTranslation::class);
    }

    /**
     * This page's title and content in the best available language.
     *
     * Falls back to the base English row whenever the requested locale has no
     * translation, an empty one, or is not a language we ship. That fallback
     * is the whole point: a legal page must never render blank because a
     * translation is missing, and half-finished translation sets are the
     * normal state of affairs rather than an edge case.
     *
     * `locale` in the result is the language actually being returned, so
     * callers can set lang/dir on the response correctly instead of assuming
     * they got what they asked for.
     *
     * @return array{title:string,content:?string,locale:string,is_fallback:bool}
     */
    public function localized(?string $requested): array
    {
        $base = [
            'title'       => (string) $this->title,
            'content'     => $this->content,
            'locale'      => Locales::BASE,
            'is_fallback' => true,
        ];

        $locale = Locales::resolve($requested);
        if ($locale === null || $locale === Locales::BASE) {
            $base['is_fallback'] = false;

            return $base;
        }

        // relationLoaded so a list of pages can eager-load translations and
        // not fire a query per row.
        $translation = $this->relationLoaded('translations')
            ? $this->translations->firstWhere('locale', $locale)
            : $this->translations()->where('locale', $locale)->first();

        // An empty content column is treated as "not translated yet". Someone
        // creating the row to reserve the language should not thereby publish
        // an empty privacy policy.
        if (! $translation || trim((string) $translation->content) === '') {
            return $base;
        }

        return [
            'title'       => $translation->title !== '' ? $translation->title : (string) $this->title,
            'content'     => $translation->content,
            'locale'      => $locale,
            'is_fallback' => false,
        ];
    }
}
