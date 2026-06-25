<?php

namespace App\Console\Commands;

use App\Services\SettingsService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

/**
 * Copies the admin-configured branding logo to public/icon.png so NativePHP's
 * build step (InstallsAppIcon) generates the Android/iOS launcher icons from it.
 * Run this before native:run / native:package.
 */
class SyncAppIcon extends Command
{
    protected $signature = 'app:sync-icon';

    protected $description = 'Copy the branding logo to public/icon.png for the native app launcher icon';

    public function handle(SettingsService $settings): int
    {
        $logo = $settings->get('logo_path');

        if (! $logo) {
            $this->warn('No logo set (Admin → Settings → Branding). Keeping existing app icon.');

            return self::SUCCESS;
        }

        $disk = Storage::disk('public');

        if (! $disk->exists($logo)) {
            $this->error("Logo file not found on the public disk: {$logo}");

            return self::FAILURE;
        }

        $dest = public_path('icon.png');
        file_put_contents($dest, $disk->get($logo));

        $this->info("App icon synced from logo → public/icon.png");
        $this->line('The launcher icons are generated from this file during the native build.');

        return self::SUCCESS;
    }
}
