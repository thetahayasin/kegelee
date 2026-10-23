<?php

namespace App\Console\Commands;

use App\Models\KnowledgeLesson;
use App\Models\Level;
use App\Models\Plan;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class SeedAppReviewer extends Command
{
    protected $signature = 'app:seed-reviewer {--credentials-file= : Private JSON file containing name, email and password}';

    protected $description = 'Create a verified, non-admin App Review account with one year of manual access';

    public function handle(): int
    {
        $file = $this->option('credentials-file');
        if (! is_string($file) || ! is_file($file) || ! is_readable($file)) {
            $this->error('Provide a readable private credentials JSON file.');
            return self::FAILURE;
        }

        try {
            $credentials = json_decode(file_get_contents($file), true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException $e) {
            $this->error('The credentials file must contain valid JSON.');
            return self::FAILURE;
        }
        if (! is_array($credentials)) {
            $this->error('The credentials file must contain name, email and password.');
            return self::FAILURE;
        }
        if (isset($credentials['email']) && is_string($credentials['email'])) {
            $credentials['email'] = strtolower(trim($credentials['email']));
        }
        $validator = Validator::make($credentials, [
            'name' => 'required|string|max:255',
            'email' => 'required|email|max:255',
            'password' => 'required|string|min:12|max:128|regex:/[0-9]/',
        ]);
        if ($validator->fails()) {
            $this->error('Invalid reviewer details. Supply a name, email and password of 12–128 characters including a number.');
            return self::FAILURE;
        }

        // Never reset an existing customer's password or add access to their account.
        if (User::where('email', $credentials['email'])->exists()) {
            $this->error('That email already exists; the account was left unchanged.');
            return self::FAILURE;
        }
        $level = Level::where('is_active', true)->orderBy('number')->first();
        $plan = Plan::where('is_active', true)->where('slug', 'premium-yearly')->first();
        if (! $level || ! $plan) {
            $this->error('The active level and yearly plan must already be configured. No content was reseeded.');
            return self::FAILURE;
        }

        $user = DB::transaction(function () use ($credentials, $level, $plan) {
            $user = User::create([
                'name' => $credentials['name'], 'email' => $credentials['email'],
                'password' => $credentials['password'], 'is_admin' => false,
                'email_verified_at' => now(), 'onboarded_at' => now(),
                'onboarding_completed_at' => now(), 'onboarding_level' => $level->number,
                'level_id' => $level->id, 'timezone' => 'UTC',
            ]);
            $user->subscriptions()->create([
                'plan_id' => $plan->id, 'store' => 'manual', 'status' => 'active',
                'started_at' => now(), 'ends_at' => now()->addYear(), 'auto_renewing' => false,
            ]);
            $lessons = KnowledgeLesson::where('is_active', true)->pluck('id')
                ->mapWithKeys(fn ($id) => [$id => ['completed_at' => now()]])->all();
            $user->completedLessons()->sync($lessons);
            return $user;
        });

        $this->info("Reviewer account {$user->id} created and verified; manual access expires in one year.");
        $this->line('Use the credentials from the private file. No password was printed and no email was sent.');
        return self::SUCCESS;
    }
}
