<?php

namespace Taha\AndroidBack;

/**
 * Swaps the generated MainActivity's browser-default back handling
 * (webView.goBack, else finish) for the app-driven version: the shell asks
 * window.appBack.handleSystemBack() so open sheets close first, back walks
 * the app's own screen hierarchy, and root screens minimize the app.
 *
 * Idempotent: safe to run on every build. When NativePHP regenerates the
 * Android project (native:install --force), the next build's pre-compile
 * hook re-applies the patch automatically.
 */
final class BackPatch
{
    public const MARKER = 'appBack.handleSystemBack';

    private const DEFAULT_BLOCK = <<<'KOTLIN'
        onBackPressedDispatcher.addCallback(this) {
            if (webView.canGoBack()) {
                webView.goBack()
            } else {
                finish()
            }
        }
KOTLIN;

    private const PATCHED_BLOCK = <<<'KOTLIN'
        onBackPressedDispatcher.addCallback(this) {
            // taha/nativephp-android-back: ask the app's JavaScript first.
            // It closes open sheets/dialogs, then walks the app's own screen
            // hierarchy (native-style), and returns "exit" only at a root
            // screen. Falls back to plain webview history when the page has
            // no opinion.
            val ask = "(function(){ try { return (window.appBack && window.appBack.handleSystemBack) ? window.appBack.handleSystemBack() : 'default'; } catch (e) { return 'default'; } })()"
            webView.evaluateJavascript(ask) { result ->
                when (result?.trim('"')) {
                    "handled" -> { /* JS consumed the press */ }
                    "exit" -> moveTaskToBack(true) // minimize like a native root screen
                    else -> if (webView.canGoBack()) webView.goBack() else moveTaskToBack(true)
                }
            }
        }
KOTLIN;

    /**
     * Ensure the patch is present in the given Android project. Returns one
     * of: 'already' | 'patched' | 'missing-file' | 'unrecognized'.
     */
    public static function apply(string $androidProjectPath): string
    {
        $path = rtrim($androidProjectPath, '/\\')
            .'/app/src/main/java/com/nativephp/mobile/ui/MainActivity.kt';

        if (! is_file($path)) {
            return 'missing-file';
        }

        $source = (string) file_get_contents($path);

        if (str_contains($source, self::MARKER)) {
            return 'already';
        }

        if (! str_contains($source, self::DEFAULT_BLOCK)) {
            // The upstream template changed shape; refuse to guess.
            return 'unrecognized';
        }

        file_put_contents($path, str_replace(self::DEFAULT_BLOCK, self::PATCHED_BLOCK, $source));

        return 'patched';
    }
}
