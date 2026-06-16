<?php

use App\Livewire\Admin;
use App\Livewire\App;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Mobile app (single device user, resolved by middleware)
|--------------------------------------------------------------------------
*/
Route::middleware('app.user')->group(function () {
    Route::get('/', App\Home::class)->name('home');
    Route::get('/welcome', App\Onboarding::class)->name('onboarding');

    Route::get('/exercises', App\Exercises\Index::class)->name('exercises.index');
    Route::get('/exercises/{exercise:slug}', App\Exercises\Show::class)->name('exercises.show');

    Route::get('/session', App\Workout::class)->name('session');
    Route::get('/workout/{exercise:slug}', App\Workout::class)->name('workout');

    Route::get('/levels', App\Levels::class)->name('levels');
    Route::get('/progress', App\ProgressTracker::class)->name('progress');
    Route::get('/schedule', App\Schedule::class)->name('schedule');
    Route::get('/profile', App\Profile::class)->name('profile');
    Route::get('/upgrade', App\Paywall::class)->name('paywall');
});

/*
|--------------------------------------------------------------------------
| Admin backend
|--------------------------------------------------------------------------
*/
Route::prefix('admin')->name('admin.')->group(function () {
    Route::get('login', Admin\Login::class)->name('login');

    Route::middleware('admin')->group(function () {
        Route::get('/', Admin\Dashboard::class)->name('dashboard');
        Route::get('exercises', Admin\Exercises::class)->name('exercises');
        Route::get('exercises/{exercise}', Admin\ExerciseEdit::class)->name('exercises.edit');
        Route::get('exercises-create', Admin\ExerciseEdit::class)->name('exercises.create');
        Route::get('levels', Admin\Levels::class)->name('levels');
        Route::get('users', Admin\Users::class)->name('users');
        Route::get('plans', Admin\Plans::class)->name('plans');
        Route::get('discounts', Admin\Discounts::class)->name('discounts');
        Route::get('subscriptions', Admin\Subscriptions::class)->name('subscriptions');
        Route::get('onboarding', Admin\OnboardingSlides::class)->name('onboarding');
        Route::get('settings', Admin\Settings::class)->name('settings');
        Route::get('logout', function () {
            auth()->logout();
            return redirect()->route('admin.login');
        })->name('logout');
    });
});
