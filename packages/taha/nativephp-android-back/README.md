# taha/nativephp-android-back

Native-style hardware back for NativePHP Android apps.

The generated shell handles the back gesture like a browser: `webView.goBack()`,
else `finish()`. This plugin swaps that for an app-driven flow:

1. `MainActivity` asks the page's `window.appBack.handleSystemBack()` on every
   back press.
2. The app's JavaScript closes any open sheet or dialog first, then walks the
   app's own screen hierarchy (Exercise -> Exercises -> Home) instead of
   replaying raw history.
3. At a root screen the JS returns `exit` and the shell minimizes the app with
   `moveTaskToBack(true)`, exactly like a native root screen.
4. Pages without an opinion return `default` and get plain history behaviour.

## How it stays applied

The patch runs as a NativePHP `pre_compile` plugin hook (`native-back:patch`),
so it re-applies on every Android build - including right after
`native:install --force` regenerates `MainActivity.kt`. It is idempotent and
refuses to guess if the upstream template ever changes shape (the build then
prints a warning instead of silently shipping browser-back).

Run it manually any time:

```bash
php artisan native-back:patch
```

## App-side contract

Your JavaScript must expose `window.appBack.handleSystemBack()` returning
`'handled' | 'exit' | 'default'`. In this app that lives in
`resources/js/app.js` together with the screen hierarchy map.
