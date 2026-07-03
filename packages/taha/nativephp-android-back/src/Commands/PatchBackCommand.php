<?php

namespace Taha\AndroidBack\Commands;

use Illuminate\Console\Command;
use Taha\AndroidBack\BackPatch;

/**
 * The plugin's pre_compile hook. NativePHP's PluginHookRunner invokes it on
 * every Android build with --build-path pointing at the generated project.
 */
class PatchBackCommand extends Command
{
    protected $signature = 'native-back:patch
        {--platform= : Build platform (supplied by the hook runner)}
        {--build-path= : Path to the generated native project}
        {--plugin-path= : Path to this plugin (supplied by the hook runner)}
        {--app-id= : Application id (supplied by the hook runner)}
        {--config= : Build config JSON (supplied by the hook runner)}
        {--plugins= : All plugins JSON (supplied by the hook runner)}';

    protected $description = 'Ensure the native-style back handling is patched into the Android project (idempotent)';

    public function handle(): int
    {
        if (($this->option('platform') ?: 'android') !== 'android') {
            return self::SUCCESS; // Android-only plugin.
        }

        $buildPath = $this->option('build-path') ?: base_path('nativephp/android');

        return match (BackPatch::apply($buildPath)) {
            'already' => $this->ok('Native back patch already present.'),
            'patched' => $this->ok('Patched MainActivity with native-style back handling.'),
            'missing-file' => $this->failWith("MainActivity.kt not found under {$buildPath}."),
            'unrecognized' => $this->failWith('MainActivity.kt has an unfamiliar back handler (upstream template changed?). Update taha/nativephp-android-back.'),
        };
    }

    private function ok(string $message): int
    {
        $this->info($message);

        return self::SUCCESS;
    }

    private function failWith(string $message): int
    {
        $this->warn($message);

        return self::FAILURE;
    }
}
