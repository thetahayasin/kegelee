<?php

namespace App\Livewire\Admin;

use App\Models\Level;
use App\Models\User;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Url;
use Livewire\Component;
use Livewire\WithPagination;

#[Layout('components.layouts.admin')]
class Users extends Component
{
    use WithPagination;

    #[Url]
    public string $search = '';

    public function updatingSearch(): void
    {
        $this->resetPage();
    }

    public function setLevel(int $userId, ?int $levelId): void
    {
        User::where('id', $userId)->update(['level_id' => $levelId ?: null]);
    }

    public function toggleAdmin(int $userId): void
    {
        $user = User::findOrFail($userId);
        $user->update(['is_admin' => ! $user->is_admin]);
    }

    public function render()
    {
        $users = User::query()
            ->when($this->search, fn ($q) => $q->where(fn ($w) => $w
                ->where('name', 'like', "%{$this->search}%")
                ->orWhere('email', 'like', "%{$this->search}%")))
            ->withCount(['trainingDays as completed_days_count' => fn ($q) => $q->whereNotNull('completed_at')])
            ->latest()
            ->paginate(15);

        return view('livewire.admin.users', [
            'users' => $users,
            'levels' => Level::orderBy('number')->get(),
        ]);
    }
}
