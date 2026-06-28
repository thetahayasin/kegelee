<?php

namespace Taha\AndroidAlarms;

use Illuminate\Support\ServiceProvider;

class AndroidAlarmsServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(Alarm::class, fn () => new Alarm());

        // Bind the facade accessor string used by Taha\AndroidAlarms\Facades\Alarm.
        $this->app->alias(Alarm::class, 'taha.android-alarms');
    }

    public function boot(): void
    {
        //
    }
}
