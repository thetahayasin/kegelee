<?php

namespace App\Livewire\Admin;

use App\Models\Level;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
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

    // Password reset
    public ?int $editingUserId = null;
    public string $newPassword = '';

    // Profile edit
    public ?int $editingProfileId = null;
    public string $editName = '';
    public string $editEmail = '';

    public ?string $statusMessage = null;

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
        if ($user->id === auth()->id()) {
            return;
        }
        $user->update(['is_admin' => ! $user->is_admin]);
    }

    public function openPasswordReset(int $userId): void
    {
        $this->editingUserId = $userId;
        $this->newPassword = '';
    }

    public function resetPassword(): void
    {
        $this->validate(['newPassword' => 'required|string|min:6']);

        $user = User::findOrFail($this->editingUserId);
        $user->update(['password' => Hash::make($this->newPassword)]);

        $this->editingUserId = null;
        $this->newPassword = '';
        $this->statusMessage = "Password updated for {$user->name}.";
    }

    public function openEditProfile(int $userId): void
    {
        $user = User::findOrFail($userId);
        $this->editingProfileId = $userId;
        $this->editName  = $user->name;
        $this->editEmail = $user->email;
    }

    public function updateProfile(): void
    {
        $this->validate([
            'editName'  => 'required|string|max:255',
            'editEmail' => 'required|email|max:255|unique:users,email,' . $this->editingProfileId,
        ]);

        $user = User::findOrFail($this->editingProfileId);
        $user->update([
            'name'  => $this->editName,
            'email' => $this->editEmail,
        ]);

        $this->editingProfileId = null;
        $this->statusMessage = "Profile updated for {$user->name}.";
    }

    public function deleteUser(int $userId): void
    {
        $user = User::findOrFail($userId);
        if ($user->id === auth()->id()) {
            return;
        }
        $user->delete();
        $this->statusMessage = "User {$user->name} deleted.";
    }

    public function render()
    {
        $users = User::query()
            ->when($this->search, fn ($q) => $q->where(fn ($w) => $w
                ->where('name', 'like', "%{$this->search}%")
                ->orWhere('email', 'like', "%{$this->search}%")))
            ->withCount([
                'trainingDays as completed_days_count' => fn ($q) => $q->whereNotNull('completed_at'),
                'workoutSessions as sessions_count',
            ])
            ->latest()
            ->paginate(20);

        return view('livewire.admin.users', [
            'users' => $users,
            'levels' => Level::orderBy('number')->get(),
        ]);
    }
}
