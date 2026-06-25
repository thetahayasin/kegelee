<?php

namespace App\Livewire\Admin;

use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use Livewire\Attributes\Layout;
use Livewire\Component;
use Livewire\WithPagination;

#[Layout('components.layouts.admin')]
class Subscriptions extends Component
{
    use WithPagination;

    // ---- Filters ----
    public string $search = '';
    public string $filterStatus = '';
    public ?int $filterPlan = null;

    // ---- Expanded detail row ----
    public ?int $expandedId = null;

    // ---- Grant modal ----
    public bool $showGrant = false;
    public string $grantEmail = '';
    public ?int $grantUserId = null;
    public string $grantUserName = '';
    public ?int $grantPlanId = null;
    public string $grantStart = '';
    public string $grantEnd = '';
    public string $grantStore = 'manual';
    public ?string $grantMsg = null;
    public bool $grantSuccess = false;

    // ---- Extend modal ----
    public bool $showExtend = false;
    public ?int $extendId = null;
    public string $extendEnd = '';

    // ---- Change-plan modal ----
    public bool $showChangePlan = false;
    public ?int $changePlanSubId = null;
    public ?int $changePlanNewId = null;

    // ---- Note modal ----
    public bool $showNote = false;
    public ?int $noteSubId = null;
    public string $noteText = '';

    public function updatingSearch(): void
    {
        $this->resetPage();
    }

    public function updatingFilterStatus(): void
    {
        $this->resetPage();
    }

    public function updatingFilterPlan(): void
    {
        $this->resetPage();
    }

    // -------------------------------------------------------------------------
    // Status actions
    // -------------------------------------------------------------------------

    public function cancel(int $id): void
    {
        Subscription::where('id', $id)->update([
            'status' => 'canceled',
            'canceled_at' => now(),
        ]);
    }

    public function reactivate(int $id): void
    {
        $sub = Subscription::findOrFail($id);
        $sub->update([
            'status' => 'active',
            'canceled_at' => null,
            'ends_at' => $sub->ends_at && $sub->ends_at->isPast()
                ? now()->addMonth()
                : $sub->ends_at,
        ]);
    }

    public function markExpired(int $id): void
    {
        Subscription::where('id', $id)->update(['status' => 'expired']);
    }

    // -------------------------------------------------------------------------
    // Row expansion
    // -------------------------------------------------------------------------

    public function toggleExpand(int $id): void
    {
        $this->expandedId = $this->expandedId === $id ? null : $id;
    }

    // -------------------------------------------------------------------------
    // Grant subscription
    // -------------------------------------------------------------------------

    public function openGrant(): void
    {
        $this->reset(['grantEmail', 'grantUserId', 'grantUserName', 'grantPlanId',
            'grantStart', 'grantEnd', 'grantStore', 'grantMsg', 'grantSuccess']);
        $this->grantStart = now()->toDateString();
        $this->showGrant = true;
    }

    public function findGrantUser(): void
    {
        $this->grantMsg = null;
        $user = User::where('email', trim($this->grantEmail))->first();

        if (! $user) {
            $this->grantUserId = null;
            $this->grantUserName = '';
            $this->grantMsg = 'No user found with that email.';

            return;
        }

        $this->grantUserId = $user->id;
        $this->grantUserName = $user->name;
        $this->grantMsg = "Found: {$user->name}";
    }

    public function grant(): void
    {
        $this->validate([
            'grantUserId' => 'required|exists:users,id',
            'grantPlanId' => 'required|exists:plans,id',
            'grantStart' => 'required|date',
            'grantEnd' => 'nullable|date|after:grantStart',
        ]);

        $plan = Plan::findOrFail($this->grantPlanId);

        $endsAt = $this->grantEnd
            ? \Carbon\Carbon::parse($this->grantEnd)->endOfDay()
            : match ($plan->interval) {
                'day' => now()->addDays($plan->interval_count),
                'week' => now()->addWeeks($plan->interval_count),
                'month' => now()->addMonths($plan->interval_count),
                'year' => now()->addYears($plan->interval_count),
                default => null,
            };

        Subscription::create([
            'user_id' => $this->grantUserId,
            'plan_id' => $plan->id,
            'status' => 'active',
            'store' => $this->grantStore,
            'started_at' => \Carbon\Carbon::parse($this->grantStart),
            'ends_at' => $endsAt,
        ]);

        $this->grantSuccess = true;
        $this->grantMsg = "Subscription granted to {$this->grantUserName}.";
        $this->resetPage();
    }

    // -------------------------------------------------------------------------
    // Extend / renew end date
    // -------------------------------------------------------------------------

    public function openExtend(int $id): void
    {
        $sub = Subscription::findOrFail($id);
        $this->extendId = $id;
        $this->extendEnd = ($sub->ends_at?->isFuture() ? $sub->ends_at : now())->addMonth()->toDateString();
        $this->showExtend = true;
    }

    public function extend(): void
    {
        $this->validate(['extendEnd' => 'required|date|after:today']);

        Subscription::where('id', $this->extendId)->update([
            'ends_at' => \Carbon\Carbon::parse($this->extendEnd)->endOfDay(),
            'status' => 'active',
            'canceled_at' => null,
        ]);

        $this->showExtend = false;
    }

    // -------------------------------------------------------------------------
    // Change plan
    // -------------------------------------------------------------------------

    public function openChangePlan(int $id): void
    {
        $sub = Subscription::with('plan')->findOrFail($id);
        $this->changePlanSubId = $id;
        $this->changePlanNewId = $sub->plan_id;
        $this->showChangePlan = true;
    }

    public function applyChangePlan(): void
    {
        $this->validate(['changePlanNewId' => 'required|exists:plans,id']);

        Subscription::where('id', $this->changePlanSubId)
            ->update(['plan_id' => $this->changePlanNewId]);

        $this->showChangePlan = false;
    }

    // -------------------------------------------------------------------------
    // Render
    // -------------------------------------------------------------------------

    public function render()
    {
        $query = Subscription::with(['user', 'plan'])
            ->when($this->search, fn ($q) => $q->whereHas('user', fn ($u) => $u->where('email', 'like', "%{$this->search}%")->orWhere('name', 'like', "%{$this->search}%")))
            ->when($this->filterStatus, fn ($q) => $q->where('status', $this->filterStatus))
            ->when($this->filterPlan, fn ($q) => $q->where('plan_id', $this->filterPlan))
            ->latest();

        $summary = [
            'active' => Subscription::where('status', 'active')->count(),
            'trialing' => Subscription::where('status', 'trialing')->count(),
            'canceled' => Subscription::where('status', 'canceled')->count(),
            'past_due' => Subscription::where('status', 'past_due')->count(),
        ];

        return view('livewire.admin.subscriptions', [
            'subscriptions' => $query->paginate(25),
            'plans' => Plan::orderBy('sort_order')->get(),
            'summary' => $summary,
        ]);
    }
}
