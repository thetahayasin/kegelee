<?php

namespace Database\Seeders;

use App\Models\Level;
use App\Models\Measurement;
use App\Models\TrainingDay;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        User::updateOrCreate(
            ['email' => 'admin@kegel.test'],
            [
                'name' => 'Admin',
                'password' => Hash::make('password'),
                'is_admin' => true,
                'onboarded_at' => now(),
            ],
        );

        $level5 = Level::where('number', 5)->first();

        $demo = User::updateOrCreate(
            ['email' => 'demo@kegel.test'],
            [
                'name' => 'Demo User',
                'password' => Hash::make('password'),
                'is_admin' => false,
                'level_id' => $level5?->id,
                'onboarded_at' => now(),
            ],
        );

        // Reproduce the reference state: 18 completed training days (so the
        // next unlock is "Clamp" at 20 days, exactly like the screenshots).
        $demo->trainingDays()->delete();
        for ($i = 18; $i >= 1; $i--) {
            $date = Carbon::today()->subDays($i);
            TrainingDay::create([
                'user_id' => $demo->id,
                'date' => $date->toDateString(),
                'sessions_count' => 2,
                'required_sessions' => 2,
                'completed_at' => $date->copy()->setTime(20, 0),
            ]);
        }

        // A couple of endurance measurements for the progress chart.
        $demo->measurements()->delete();
        Measurement::create(['user_id' => $demo->id, 'seconds' => 3, 'measured_at' => Carbon::today()->subDays(7)]);
        Measurement::create(['user_id' => $demo->id, 'seconds' => 4, 'measured_at' => Carbon::today()]);
    }
}
