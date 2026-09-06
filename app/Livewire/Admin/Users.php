<?php

namespace App\Livewire\Admin;

use App\Models\Level;
use App\Models\User;
use App\Models\UserEvent;
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

    /**
     * Whose name the open modal is about.
     *
     * Held here rather than looked up in the Blade. A `User::find()` inside a
     * view is a query nobody can see from the component, and it ran on every
     * render of a page that already had the row in hand.
     */
    public ?string $editingUserName = null;

    // Create user
    public bool $creating = false;
    public string $newName = '';
    public string $newEmail = '';
    public string $newUserPassword = '';

    public ?string $statusMessage = null;

    /**
     * Whose timeline is open, if any.
     *
     * One at a time, and loaded only when opened. Every row carrying its own
     * event history would be a query per user per render on a paginated list -
     * and nobody reads twenty timelines at once.
     */
    public ?int $timelineUserId = null;

    /**
     * Show only one kind of event. In the URL so "this person's purchases" is
     * a link that can be pasted into a conversation.
     */
    #[Url]
    public string $timelineFilter = '';

    /** Whether the timeline is showing everything rather than the last 200. */
    public bool $timelineAll = false;

    public function toggleTimeline(int $userId): void
    {
        $this->statusMessage = null;
        $this->timelineUserId = $this->timelineUserId === $userId ? null : $userId;
        // A filter and a "show all" belong to the timeline that was open, not
        // to the next one.
        $this->timelineAll = false;
    }

    public function showWholeTimeline(): void
    {
        $this->timelineAll = true;
    }

    public function updatingSearch(): void
    {
        $this->resetPage();
    }

    /**
     * Set (or clear) somebody's difficulty.
     *
     * Both arguments arrive from a browser event, which means strings: the
     * "--" option sends "", and an int type hint made Livewire reject the
     * call outright, so clearing a level silently did nothing.
     */
    public function setLevel(mixed $userId, mixed $levelId): void
    {
        $this->statusMessage = null;

        $userId = (int) $userId;
        $levelId = (int) $levelId;

        User::where('id', $userId)->update(['level_id' => $levelId ?: null]);
    }

    public function toggleAdmin(int $userId): void
    {
        $this->statusMessage = null;

        $user = User::findOrFail($userId);

        // You cannot take your own admin rights away: it is the one change
        // here that locks the person making it out of this page.
        if ($user->id === auth()->id()) {
            $this->statusMessage = 'You cannot change your own role.';

            return;
        }

        $user->update(['is_admin' => ! $user->is_admin]);

        $this->statusMessage = $user->is_admin
            ? "{$user->email} can now reach the admin panel."
            : "{$user->email} is now an ordinary member.";
    }

    public function createUser(): void
    {
        $this->statusMessage = null;

        $data = $this->validate([
            'newName'         => 'required|string|max:255',
            'newEmail'        => 'required|email|max:255|unique:users,email',
            'newUserPassword' => 'required|string|min:6|regex:/[0-9]/',
        ], [
            'newUserPassword.min' => 'Password must be at least 6 characters and include a number.',
            'newUserPassword.regex' => 'Password must be at least 6 characters and include a number.',
        ]);

        $user = User::create([
            'name'              => $data['newName'],
            'email'             => strtolower($data['newEmail']),
            'password'          => Hash::make($data['newUserPassword']),
            'email_verified_at' => now(), // ready to log in immediately, no code needed
            'level_id'          => Level::where('is_active', true)->orderBy('number')->value('id'),
        ]);

        $this->reset(['creating', 'newName', 'newEmail', 'newUserPassword']);
        $this->statusMessage = "User {$user->email} created and verified - they can log in now.";
    }

    /** Mark an existing user verified so they can log in without an email code. */
    public function markVerified(int $userId): void
    {
        $this->statusMessage = null;

        $user = User::findOrFail($userId);
        $user->update(['email_verified_at' => now()]);
        $this->statusMessage = "{$user->email} marked as verified.";
    }

    public function openPasswordReset(int $userId): void
    {
        $this->statusMessage = null;

        $user = User::findOrFail($userId);
        $this->editingUserId = $userId;
        $this->editingUserName = $user->name;
        $this->newPassword = '';
        $this->resetValidation();
    }

    public function resetPassword(): void
    {
        $this->validate(['newPassword' => 'required|string|min:6|regex:/[0-9]/'], [
            'newPassword.min' => 'Password must be at least 6 characters and include a number.',
            'newPassword.regex' => 'Password must be at least 6 characters and include a number.',
        ]);

        $user = User::findOrFail($this->editingUserId);
        $user->update(['password' => Hash::make($this->newPassword)]);

        $this->closeModals();
        $this->newPassword = '';
        $this->statusMessage = "Password updated for {$user->name}.";
    }

    public function openEditProfile(int $userId): void
    {
        $this->statusMessage = null;

        $user = User::findOrFail($userId);
        $this->editingProfileId = $userId;
        $this->editingUserName = $user->name;
        $this->editName  = $user->name;
        $this->editEmail = $user->email;
        $this->resetValidation();
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

        $this->closeModals();
        $this->statusMessage = "Profile updated for {$user->name}.";
    }

    /**
     * Shut both modals.
     *
     * The buttons used to close them in the browser, before the server had
     * answered. That looked fine until something failed validation: the modal
     * was already gone and took the error message with it, so a rejected email
     * address read as a save that had silently done nothing. Closing is now
     * something only a successful save does.
     */
    public function closeModals(): void
    {
        $this->editingUserId = null;
        $this->editingProfileId = null;
        $this->editingUserName = null;
        $this->resetValidation();
    }

    public function deleteUser(int $userId): void
    {
        $this->statusMessage = null;

        $user = User::findOrFail($userId);

        if ($user->id === auth()->id()) {
            $this->statusMessage = 'You cannot delete the account you are signed in with.';

            return;
        }

        $name = $user->name;

        // Everything they own, not just the row. A plain delete() left the
        // sessions, measurements and outstanding email codes behind, and the
        // button already promised "this removes all their data".
        $user->deleteWithData();

        $this->statusMessage = "{$name} and all their data have been deleted.";
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
                // Counted in the same query rather than read per row: the
                // funnel column below needs both for every user on the page,
                // and asking per row is 40 extra queries for 20 users.
                'completedLessons as lessons_done_count' => fn ($q) => $q->whereNotNull('knowledge_lesson_user.completed_at'),
                // entitled(), not `status IN (active, trialing)`. The status
                // column alone marked a lapsed account as a subscriber on
                // every row of this table, and dropped cancelled subscribers
                // who are still inside a period they paid for.
                'subscriptions as active_subs_count' => fn ($q) => $q->entitled(),
            ])
            ->latest()
            ->paginate(20);

        return view('livewire.admin.users', [
            'users' => $users,
            'levels' => Level::orderBy('number')->get(),
            'timeline' => $this->timeline(),
            'timelineTotal' => $this->timelineUserId ? $this->timelineQuery()->count() : 0,
            // Only for the row that is open: what they run the app on. Newest
            // install first, because that is the one they are using now.
            'timelineDevices' => $this->timelineUserId
                ? \App\Models\Device::where('user_id', $this->timelineUserId)
                    ->orderByDesc('last_seen_at')
                    ->limit(3)
                    ->get()
                : collect(),
            // The filter's options are the events this person actually has, so
            // the list never offers a choice that shows nothing.
            'timelineNames' => $this->timelineUserId
                ? UserEvent::where('user_id', $this->timelineUserId)
                    ->distinct()
                    ->orderBy('name')
                    ->pluck('name')
                : collect(),
        ]);
    }

    private function timelineQuery()
    {
        return UserEvent::where('user_id', $this->timelineUserId)
            ->when($this->timelineFilter !== '', fn ($q) => $q->where('name', $this->timelineFilter));
    }

    /**
     * The open row's events, newest first.
     *
     * Capped at 200 unless "Show all" was pressed, and even then at a
     * thousand: a timeline is for reading, and a page holding every event a
     * two-year-old account ever produced is one nobody can scroll.
     */
    private function timeline()
    {
        if (! $this->timelineUserId) {
            return collect();
        }

        return $this->timelineQuery()
            ->orderByDesc('occurred_at')
            ->limit($this->timelineAll ? 1000 : 200)
            ->get();
    }
}
