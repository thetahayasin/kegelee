<?php

namespace Taha\AndroidBack;

use Illuminate\Support\ServiceProvider;
use Taha\AndroidBack\Commands\PatchBackCommand;

class AndroidBackServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        if ($this->app->runningInConsole()) {
            $this->commands([
                PatchBackCommand::class,
            ]);
        }
    }
}
