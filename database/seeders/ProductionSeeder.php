<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Production-safe seed. Unlike {@see DatabaseSeeder}, this seeds ONLY the
 * content the backend needs and ensures a single admin account - it never
 * creates the demo user or the fake subscription used for local walkthroughs.
 *
 * The admin credentials come from ADMIN_EMAIL / ADMIN_PASSWORD (env). If no
 * admin exists and ADMIN_PASSWORD is blank, a strong random password is
 * generated and printed once - copy it, then change it from the admin panel.
 */
class ProductionSeeder extends Seeder
{
    public function run(): void
    {
        // Backend-managed content (no users).
        $this->call([
            SettingSeeder::class,
            LevelSeeder::class,
            ExerciseSeeder::class,
            KnowledgeSeeder::class,
            PageSeeder::class,
            PlanSeeder::class,
        ]);

        $this->ensureAdmin();
    }

    private function ensureAdmin(): void
    {
        $email = strtolower(trim((string) env('ADMIN_EMAIL', 'admin@kegelee.com')));

        // Already have an admin? Leave it untouched - password changes happen
        // from the panel, not from a re-run of the seeder.
        if (User::where('is_admin', true)->exists()) {
            $this->command?->info("Admin already exists - leaving credentials untouched.");
            return;
        }

        $rawPassword = (string) env('ADMIN_PASSWORD', '');
        $generated = false;
        if ($rawPassword === '') {
            $rawPassword = Str::password(16);
            $generated = true;
        }

        User::updateOrCreate(
            ['email' => $email],
            [
                'name' => 'Admin',
                'password' => Hash::make($rawPassword),
                'is_admin' => true,
                'email_verified_at' => now(),
                'onboarded_at' => now(),
            ],
        );

        $this->command?->info("Admin account ready: {$email}");
        if ($generated) {
            $this->command?->warn("Generated admin password (shown once): {$rawPassword}");
            $this->command?->warn('Sign in and change it from Settings -> Security immediately.');
        }
    }
}
