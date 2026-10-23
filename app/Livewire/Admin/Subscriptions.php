<?php

namespace App\Livewire\Admin;

use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use App\Services\GooglePlayBillingService;
use Illuminate\Support\Facades\Log;
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

    /**
     * The outcome of the last action that involved the store.
     *
     * Cancelling here only ever wrote our own row. Google went on billing the
     * customer, and the admin had no way to tell an actual cancellation from a
     * local one, so this states which happened.
     */
    public ?string $storeMsg = null;
    public bool $storeMsgOk = false;

    /**
     * Correct the rows before showing them.
     *
     * A missed EXPIRATION leaves a subscription at 'active' with a date in the
     * past. Everything on this page already reads through effective_status and
     * entitled(), so the display was right either way - but the status FILTER
     * cannot be, since it is a WHERE on the raw column, and an admin who picks
     * "Expired" should not be shown fewer rows than the ones labelled expired
     * in front of them.
     *
     * On mount rather than in render(), so it runs when an admin opens the
     * page and not again on every keystroke in the search box.
     */
    public function mount(): void
    {
        Subscription::sweepLapsed();
    }

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

    /**
     * Can this row's cancellation actually reach the store?
     *
     * Used by the blade to label the button honestly, so an admin is never
     * shown "Cancel" for an action that stops at our own database.
     */
    public function canContactStore(Subscription $sub): bool
    {
        return in_array($sub->store, ['google_play', 'revenuecat'], true)
            && ! empty($sub->purchase_token)
            && $sub->plan
            && $sub->plan->storeSubscriptionId() !== ''
            && app(GooglePlayBillingService::class)->isConfigured();
    }

    public function cancel(int $id): void
    {
        $sub = Subscription::with('plan')->findOrFail($id);

        // Auto-renew off is the part that was missing: the row said 'canceled'
        // while still claiming it would renew, so the admin list showed
        // "Renews" against a cancelled subscription.
        $sub->update([
            'status' => 'canceled',
            'canceled_at' => now(),
            'auto_renewing' => false,
        ]);

        if (! $this->canContactStore($sub)) {
            $this->storeMsg = 'Marked cancelled here only - the store was not contacted, so it will bill again. Cancel it in Google Play Console (or RevenueCat) as well.';
            $this->storeMsgOk = false;
        } else {
            try {
                // The bare subscription id: the Play API keys purchases on the
                // subscription, not the base plan.
                app(GooglePlayBillingService::class)
                    ->cancelSubscription($sub->plan->storeSubscriptionId(), $sub->purchase_token);

                $this->storeMsg = 'Cancelled in Google Play. Access continues until '
                    . ($sub->ends_at?->format('j M Y') ?? 'the end of the paid period') . '.';
                $this->storeMsgOk = true;
            } catch (\Throwable $e) {
                Log::error('Admin cancel could not reach Google Play', [
                    'subscription_id' => $sub->id,
                    'error' => $e->getMessage(),
                ]);

                $this->storeMsg = 'Marked cancelled here, but Google Play refused the cancellation ('
                    . $e->getMessage() . '). Cancel it in the Play Console or it will bill again.';
                $this->storeMsgOk = false;
            }
        }

        $this->logAction('cancel', $sub);
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

        // Reactivating changes nothing at the store, so a subscription Google
        // has already ended is being re-granted on this server's word alone.
        $this->storeMsg = 'Reactivated here only. The store was not contacted, so nothing will bill again on its own.';
        $this->storeMsgOk = false;

        $this->logAction('reactivate', $sub);
    }

    public function markExpired(int $id): void
    {
        $sub = Subscription::findOrFail($id);
        $sub->update(['status' => 'expired', 'auto_renewing' => false]);

        $this->storeMsg = 'Marked expired here only. The store was not contacted.';
        $this->storeMsgOk = false;

        $this->logAction('mark_expired', $sub);
    }

    /**
     * Every admin change to somebody's billing, in the log.
     *
     * These actions grant and remove paid access by hand, and none of them left
     * any trace of who did it - so a subscription that appeared or vanished was
     * unanswerable after the fact.
     */
    private function logAction(string $action, Subscription $sub, array $extra = []): void
    {
        Log::info('Admin subscription action', array_merge([
            'action' => $action,
            'admin_id' => auth()->id(),
            'subscription_id' => $sub->id,
            'target_user_id' => $sub->user_id,
            'store' => $sub->store,
        ], $extra));
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

        $sub = Subscription::create([
            'user_id' => $this->grantUserId,
            'plan_id' => $plan->id,
            'status' => 'active',
            'store' => $this->grantStore,
            'started_at' => \Carbon\Carbon::parse($this->grantStart),
            'ends_at' => $endsAt,
            // Granted by hand, so nothing will ever renew it.
            'auto_renewing' => false,
        ]);

        $this->logAction('grant', $sub, ['plan_id' => $plan->id, 'ends_at' => (string) $endsAt]);

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

        $sub = Subscription::findOrFail($this->extendId);
        $sub->update([
            'ends_at' => \Carbon\Carbon::parse($this->extendEnd)->endOfDay(),
            'status' => 'active',
            'canceled_at' => null,
        ]);

        $this->logAction('extend', $sub, ['ends_at' => $this->extendEnd]);

        // Extending here does not extend the store's own period, so the next
        // renewal or expiry event will overwrite this date.
        $this->storeMsg = 'Extended here only. The store keeps its own expiry, so its next event will overwrite this date.';
        $this->storeMsgOk = false;

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

        $sub = Subscription::findOrFail($this->changePlanSubId);
        $sub->update(['plan_id' => $this->changePlanNewId]);

        $this->logAction('change_plan', $sub, ['plan_id' => $this->changePlanNewId]);

        $this->storeMsg = 'Plan changed on this record only. The store keeps billing the plan the customer actually bought.';
        $this->storeMsgOk = false;

        $this->showChangePlan = false;
    }

    // -------------------------------------------------------------------------
    // Notes
    // -------------------------------------------------------------------------

    public function openNote(int $id): void
    {
        $sub = Subscription::findOrFail($id);
        $this->noteSubId = $id;
        $this->noteText = (string) ($sub->notes ?? '');
        $this->showNote = true;
    }

    public function saveNote(): void
    {
        $this->validate(['noteText' => 'nullable|string|max:2000']);

        $sub = Subscription::findOrFail($this->noteSubId);
        $sub->update(['notes' => trim($this->noteText) ?: null]);

        $this->logAction('note', $sub);

        $this->storeMsg = 'Note saved.';
        $this->storeMsgOk = true;

        $this->showNote = false;
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

        // Every card counts LIVE records only, because a missed EXPIRATION
        // leaves the status saying 'active' forever. This was four hand-written
        // WHERE clauses, two of them bounded and two not, so the same lapsed
        // subscriber could be absent from Active and still counted under
        // Canceled - the four cards did not describe one population.
        //
        // Now they are entitled() split by status, which makes that structural
        // rather than a thing to remember: the four cards sum to exactly the
        // number of entitled rows, and they cannot drift apart again without
        // the shared scope changing underneath all of them at once.
        $summary = [
            'active' => Subscription::entitled()->where('status', 'active')->count(),
            'trialing' => Subscription::entitled()->where('status', 'trialing')->count(),
            'canceled' => Subscription::entitled()->where('status', 'canceled')->count(),
            'past_due' => Subscription::entitled()->where('status', 'past_due')->count(),
        ];

        return view('livewire.admin.subscriptions', [
            'subscriptions' => $query->paginate(25),
            'plans' => Plan::orderBy('sort_order')->get(),
            'summary' => $summary,
        ]);
    }
}
