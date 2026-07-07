<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Forces new users through "Learn the basics" before they can reach the
 * training app. Understanding the basics first is what brings real gains, so a
 * user must complete all three tutorials before the workout, exercises and
 * progress screens open up.
 *
 * The knowledge lessons live at public routes (outside this gate), so a blocked
 * user is sent there, finishes the basics, and the gate opens.
 *
 * Grandfathered: anyone who has already recorded a workout session is never
 * bounced back - the gate only ever stops brand-new users.
 *
 * Admins bypass so they can preview the app.
 */
class EnsureBasicsCompleted
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user
            && ! $user->is_admin
            && ! $user->hasCompletedBasics()
            && ! $user->workoutSessions()->exists()
        ) {
            // Direct RedirectResponse: redirect() returns Livewire's Redirector
            // during Livewire requests, which violates the Response return type.
            return new \Illuminate\Http\RedirectResponse(route('knowledge.index'));
        }

        return $next($request);
    }
}
