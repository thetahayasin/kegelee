<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // Development data only. UserSeeder mints accounts with known
        // passwords and the content seeders overwrite live copy, so running
        // this against production is a breach, not a mistake to be warned
        // about. ProductionSeeder is the one that belongs there.
        if (app()->environment('production')) {
            $this->command?->error('DatabaseSeeder is for local development. Use ProductionSeeder in production.');

            return;
        }

        $this->call([
            SettingSeeder::class,
            LevelSeeder::class,
            ExerciseSeeder::class,
            KnowledgeSeeder::class,
            PageSeeder::class,
            PlanSeeder::class,
            UserSeeder::class,
        ]);
    }
}
