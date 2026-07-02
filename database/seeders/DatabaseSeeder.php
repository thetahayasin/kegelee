<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
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
