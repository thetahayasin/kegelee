<?php

namespace App\Support;

/**
 * Last line of defence before page content is echoed unescaped.
 *
 * The admin editor writes HTML on purpose, so the content cannot be escaped -
 * but "an admin typed it" is not the same as "it is safe": the editor accepts
 * pasted markup, and a legal page is served to every visitor. This strips the
 * three things that turn a policy page into script execution: script/style/
 * frame elements, inline event handlers, and javascript: URLs.
 *
 * It is deliberately a denylist over a small, known input (our own editor's
 * output), not a general-purpose sanitiser. Anything richer belongs in a real
 * HTML purifier.
 */
final class SafeHtml
{
    public static function render(?string $html): string
    {
        $html = (string) $html;

        if ($html === '') {
            return '';
        }

        // Whole elements whose CONTENT is code, so removing the tags alone
        // would leave the code behind as text that the browser still runs.
        $html = preg_replace('#<\s*(script|style|iframe|object|embed|form)\b[^>]*>.*?<\s*/\s*\1\s*>#is', '', $html) ?? '';

        // ...and the unclosed versions of the same.
        $html = preg_replace('#<\s*/?\s*(script|style|iframe|object|embed|form)\b[^>]*>#i', '', $html) ?? '';

        // Inline handlers: onclick, onerror, onload, ...
        $html = preg_replace('#\son[a-z-]+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)#i', '', $html) ?? '';

        // javascript:/vbscript: URLs, quoted and unquoted. The padding classes
        // soak up the whitespace, NULs and HTML entities used to hide the
        // scheme from a naive match ("java&#9;script:").
        $scheme = '(?:&\#\d+;|[\s\x00-\x20])*(?:j\s*a\s*v\s*a|v\s*b)\s*s\s*c\s*r\s*i\s*p\s*t\s*:';
        $attrs = '(href|src|xlink:href|formaction|action)';

        $html = preg_replace(
            '~'.$attrs.'\s*=\s*("|\')\s*'.$scheme.'[^"\']*\2~i',
            '$1=$2#$2',
            $html
        ) ?? '';

        $html = preg_replace(
            '~'.$attrs.'\s*=\s*'.$scheme.'[^\s>]*~i',
            '$1="#"',
            $html
        ) ?? '';

        return $html;
    }
}
