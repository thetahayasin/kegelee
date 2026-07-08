<?php

namespace App\Livewire\App;

use App\Models\Level;
use Livewire\Attributes\Layout;
use Livewire\Component;

#[Layout('components.layouts.app')]
class Levels extends Component
{
    public function select(int $levelId)
    {
        $level = Level::where('is_active', true)->findOrFail($levelId);
        $user  = auth()->user();

        $user->update(['level_id' => $level->id]);

        // Refresh the cached relationship so any render between now and the
        // redirect shows the NEW level name, not the stale in-memory one.
        $user->load('level');

        // Push the change to the backend immediately so the server knows about
        // the new level right away (the regular sync cycle also sends level_id,
        // but an immediate push avoids the next pull reverting the change).
        if (\App\Services\Sync\BackendClient::isClient()) {
            try {
                app(\App\Services\Sync\UserSyncService::class)->push($user);
            } catch (\Throwable $e) {
                // Best-effort — the periodic sync will catch it.
            }
        }

        // Hard redirect (navigate: false) clears the wire:navigate SPA cache
        // so every page (Profile, Home, etc.) re-renders with the new level.
        $this->redirect(route('home'), navigate: false);
    }

    public function render()
    {
        return view('livewire.app.levels', [
            'levels' => Level::where('is_active', true)->orderBy('number')->get(),
            'currentId' => auth()->user()->level_id,
        ]);
    }
}
