<div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
            <h1 class="text-2xl font-bold">Subscriptions</h1>
            <p class="text-sm text-muted">Active subscriber records, billing status, and manual grants.</p>
        </div>
        <button wire:click="openGrant" class="flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white tap">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
            Grant subscription
        </button>
    </div>

    {{-- What the last action did at the STORE, which is not the same thing as
         what it did here. --}}
    @if ($storeMsg)
        <div class="mb-4 flex items-start gap-3 rounded-2xl px-4 py-3 text-sm {{ $storeMsgOk ? 'bg-success/15 text-success' : 'bg-yellow-500/15 text-yellow-300' }}">
            <span class="flex-1">{{ $storeMsg }}</span>
            <button wire:click="$set('storeMsg', null)" class="shrink-0 opacity-70 hover:opacity-100" aria-label="Dismiss">
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
        </div>
    @endif

    {{-- Summary cards. Live records only: a row past its ends_at is counted
         nowhere, whatever its status still says. --}}
    <div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        @foreach ([
            ['Active', $summary['active'], 'bg-success/15 text-success'],
            ['Trialing', $summary['trialing'], 'bg-accent/15 text-accent'],
            ['Past due', $summary['past_due'], 'bg-yellow-500/15 text-yellow-400'],
            ['Canceled', $summary['canceled'], 'bg-white/8 text-muted'],
        ] as [$label, $val, $cls])
            <div class="rounded-2xl bg-surface p-4">
                <p class="text-2xl font-bold">{{ number_format($val) }}</p>
                <span class="mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold {{ $cls }}">{{ $label }}</span>
            </div>
        @endforeach
    </div>

    {{-- Filters --}}
    <div class="mb-4 flex flex-wrap gap-3">
        <input wire:model.live.debounce.300ms="search" placeholder="Search email or name…"
               class="h-10 flex-1 min-w-48 rounded-xl border border-white/10 bg-surface px-4 text-sm focus:border-accent focus:outline-none">
        <select wire:model.live="filterStatus" class="h-10 rounded-xl border border-white/10 bg-surface px-3 text-sm focus:border-accent focus:outline-none">
            <option value="">All statuses</option>
            @foreach (['active','trialing','past_due','canceled','expired'] as $s)
                <option value="{{ $s }}">{{ ucfirst(str_replace('_', ' ', $s)) }}</option>
            @endforeach
        </select>
        <select wire:model.live="filterPlan" class="h-10 rounded-xl border border-white/10 bg-surface px-3 text-sm focus:border-accent focus:outline-none">
            <option value="">All plans</option>
            @foreach ($plans as $p)
                <option value="{{ $p->id }}">{{ $p->name }}</option>
            @endforeach
        </select>
    </div>

    {{-- Table --}}
    <div class="overflow-x-auto rounded-2xl border border-white/5 bg-surface">
        <table class="w-full min-w-[920px] text-sm">
            <thead class="border-b border-white/5 text-left">
                <tr class="text-[11px] uppercase tracking-wider text-dim">
                    <th class="px-4 py-3 font-semibold">User</th>
                    <th class="px-4 py-3 font-semibold">Plan</th>
                    <th class="px-4 py-3 font-semibold">Status</th>
                    <th class="px-4 py-3 font-semibold">Renewal</th>
                    <th class="px-4 py-3 font-semibold">Store</th>
                    <th class="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
            </thead>
            <tbody>
                @forelse ($subscriptions as $sub)
                    {{-- Main row --}}
                    <tr class="border-b border-white/5 last:border-0 hover:bg-white/3 transition-colors" wire:key="row-{{ $sub->id }}">
                        <td class="px-4 py-3">
                            <button wire:click="toggleExpand({{ $sub->id }})" class="block max-w-[230px] text-left">
                                <p class="truncate font-medium">{{ $sub->user?->name ?? '—' }}</p>
                                <p class="truncate text-xs text-muted">{{ $sub->user?->email ?? '' }}</p>
                            </button>
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap">{{ $sub->plan?->name ?? '—' }}</td>
                        <td class="px-4 py-3 whitespace-nowrap">
                            @php($statusColor = match($sub->effective_status) {
                                'active' => 'bg-success/15 text-success',
                                'trialing' => 'bg-accent/15 text-accent',
                                'past_due' => 'bg-yellow-500/15 text-yellow-400',
                                'canceled' => 'bg-white/10 text-muted',
                                'expired' => 'bg-white/5 text-muted',
                                default => 'bg-white/10 text-muted',
                            })
                            <div class="flex flex-col gap-1">
                                <span class="w-fit rounded-full px-2.5 py-1 text-xs font-semibold {{ $statusColor }}">
                                    {{ ucfirst(str_replace('_', ' ', $sub->effective_status)) }}
                                </span>
                                {{-- Whether they can actually train right now. A
                                     canceled or past-due row still can. --}}
                                @if ($sub->isEntitled())
                                    <span class="flex items-center gap-1.5 text-[11px] text-success">
                                        <span class="h-1.5 w-1.5 rounded-full bg-success"></span>Has access
                                    </span>
                                @else
                                    <span class="flex items-center gap-1.5 text-[11px] text-dim">
                                        <span class="h-1.5 w-1.5 rounded-full bg-white/25"></span>No access
                                    </span>
                                @endif
                            </div>
                        </td>

                        {{-- Renewal: the question the old table could not answer.
                             auto_renewing is written by both webhooks and was
                             shown nowhere, so a subscription switched off in
                             Google Play looked identical to a healthy one right
                             up until the day it expired. --}}
                        <td class="px-4 py-3 whitespace-nowrap">
                            @if (! $sub->ends_at)
                                <span class="text-xs font-semibold text-success">Lifetime</span>
                            @else
                                <div class="flex flex-col gap-0.5">
                                    <span class="text-xs font-medium {{ $sub->willRenew() ? 'text-content' : 'text-muted' }}">
                                        {{ $sub->willRenew() ? 'Renews' : 'Ends' }}
                                        <span class="tabular-nums">{{ $sub->ends_at->format('j M Y') }}</span>
                                    </span>
                                    <span class="text-[11px] {{ $sub->ends_at->isPast() ? 'text-accent-soft' : 'text-dim' }}">
                                        {{ $sub->ends_at->diffForHumans() }}
                                    </span>
                                </div>
                            @endif
                        </td>

                        <td class="px-4 py-3 whitespace-nowrap capitalize text-muted">{{ str_replace('_', ' ', $sub->store ?? '—') }}</td>
                        <td class="px-4 py-3">
                            <div class="flex items-center justify-end gap-1.5 whitespace-nowrap">
                                {{-- Note --}}
                                <button wire:click="openNote({{ $sub->id }})"
                                        title="{{ $sub->notes ? 'Edit note' : 'Add a note' }}"
                                        class="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-medium {{ $sub->notes ? 'text-accent' : 'text-muted hover:text-content' }} tap">
                                    Note
                                </button>
                                {{-- Extend --}}
                                <button wire:click="openExtend({{ $sub->id }})"
                                        title="Extend / set new end date"
                                        class="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted hover:text-content tap">
                                    Extend
                                </button>
                                {{-- Change plan --}}
                                <button wire:click="openChangePlan({{ $sub->id }})"
                                        title="Change plan"
                                        class="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted hover:text-content tap">
                                    Plan
                                </button>
                                {{-- Cancel / Reactivate. The label says which of
                                     the two cancellations this is: one that
                                     reaches Google, or one that only writes our
                                     own row and leaves the customer billing. --}}
                                @if (in_array($sub->status, ['active','trialing','past_due']))
                                    @php($reachesStore = $this->canContactStore($sub))
                                    <button wire:click="cancel({{ $sub->id }})"
                                            wire:confirm="{{ $reachesStore
                                                ? 'Cancel this subscription in Google Play? The subscriber keeps access until the paid period ends.'
                                                : 'The store CANNOT be contacted for this row. It will be marked cancelled here only, and the customer will keep being billed until you cancel it in the Play Console. Continue?' }}"
                                            class="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-medium text-accent-soft hover:text-accent tap">
                                        {{ $reachesStore ? 'Cancel' : 'Mark cancelled (store not contacted)' }}
                                    </button>
                                @else
                                    <button wire:click="reactivate({{ $sub->id }})"
                                            wire:confirm="Reactivate this subscription? This changes nothing at the store - it grants access on this server alone."
                                            class="rounded-lg bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent tap">
                                        Reactivate
                                    </button>
                                @endif
                                {{-- Expand toggle --}}
                                <button wire:click="toggleExpand({{ $sub->id }})"
                                        aria-label="{{ $expandedId === $sub->id ? 'Hide details' : 'Show details' }}"
                                        aria-expanded="{{ $expandedId === $sub->id ? 'true' : 'false' }}"
                                        class="grid h-7 w-7 place-items-center rounded-lg bg-surface-2 text-muted tap">
                                    <svg viewBox="0 0 24 24" class="h-4 w-4 transition-transform {{ $expandedId === $sub->id ? 'rotate-180' : '' }}"
                                         fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
                                </button>
                            </div>
                        </td>
                    </tr>
                    {{-- Detail row --}}
                    @if ($expandedId === $sub->id)
                        <tr class="bg-surface-2/60 border-b border-white/5" wire:key="detail-{{ $sub->id }}">
                            <td colspan="6" class="px-6 py-4">
                                <div class="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
                                    <div><span class="text-muted">ID</span><span class="ml-2 font-mono">{{ $sub->id }}</span></div>
                                    <div><span class="text-muted">Started</span><span class="ml-2">{{ $sub->started_at?->format('j M Y') ?? '—' }}</span></div>
                                    <div><span class="text-muted">Trial ends</span><span class="ml-2">{{ $sub->trial_ends_at?->format('j M Y') ?? '—' }}</span></div>
                                    <div><span class="text-muted">Canceled at</span><span class="ml-2">{{ $sub->canceled_at?->format('j M Y H:i') ?? '—' }}</span></div>
                                    <div><span class="text-muted">Order ID</span><span class="ml-2 font-mono text-xs">{{ $sub->google_order_id ?? $sub->store_transaction_id ?? '—' }}</span></div>
                                    <div class="sm:col-span-3 break-all"><span class="text-muted">Purchase token</span><span class="ml-2 font-mono text-xs">{{ $sub->purchase_token ? substr($sub->purchase_token, 0, 60).'…' : '—' }}</span></div>
                                    {{-- The store's own word for the state. Our
                                         status is coarser on purpose, so this is
                                         the only place a grace period is
                                         tellable from an account hold. --}}
                                    <div><span class="text-muted">Store state</span><span class="ml-2">{{ $sub->store_state ? str_replace('_', ' ', $sub->store_state) : '—' }}</span></div>
                                    <div><span class="text-muted">Auto renew</span><span class="ml-2">{{ $sub->auto_renewing ? 'On' : 'Off' }}</span></div>
                                    <div><span class="text-muted">Last store event</span><span class="ml-2">{{ $sub->last_event_at?->format('j M Y H:i') ?? '—' }}</span></div>
                                    @if ($sub->discount_id)
                                        <div><span class="text-muted">Discount</span><span class="ml-2">#{{ $sub->discount_id }}</span></div>
                                    @endif
                                    @if ($sub->notes)
                                        <div class="sm:col-span-3"><span class="text-muted">Note</span><span class="ml-2 whitespace-pre-line">{{ $sub->notes }}</span></div>
                                    @endif
                                </div>
                            </td>
                        </tr>
                    @endif
                @empty
                    <tr><td colspan="6" class="p-8 text-center text-muted">No subscriptions match your filters.</td></tr>
                @endforelse
            </tbody>
        </table>
    </div>

    <div class="mt-4">{{ $subscriptions->links() }}</div>

    {{-- ====================================================================
         GRANT MODAL
    ==================================================================== --}}
    @if ($showGrant)
        <div class="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4"
             role="dialog" aria-modal="true" aria-label="Grant subscription" tabindex="-1"
             wire:click.self="$set('showGrant', false)" wire:keydown.escape.window="$set('showGrant', false)">
            <div class="my-auto w-full max-w-md rounded-2xl bg-surface p-6 shadow-2xl">
                <div class="mb-5 flex items-center justify-between">
                    <h2 class="text-lg font-bold">Grant subscription</h2>
                    <button wire:click="$set('showGrant', false)" aria-label="Close grant subscription" class="grid h-8 w-8 place-items-center rounded-lg bg-surface-2 text-muted tap">
                        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                </div>

                @if ($grantSuccess)
                    <div class="mb-4 rounded-xl bg-success/15 px-4 py-3 text-sm font-semibold text-success">{{ $grantMsg }}</div>
                    <button wire:click="$set('showGrant', false)" class="w-full rounded-xl bg-accent py-3 font-semibold text-white tap">Close</button>
                @else
                    <div class="space-y-4">
                        {{-- User lookup --}}
                        <div>
                            <label class="mb-1 block text-sm text-muted">User email</label>
                            <div class="flex gap-2">
                                <input wire:model="grantEmail" placeholder="user@example.com"
                                       class="h-11 flex-1 rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                                <button wire:click="findGrantUser" class="h-11 rounded-xl bg-surface-2 px-4 text-sm font-medium tap">Find</button>
                            </div>
                            @if ($grantMsg && !$grantSuccess)
                                <p class="mt-1 text-xs {{ $grantUserId ? 'text-success' : 'text-red-400' }}">{{ $grantMsg }}</p>
                            @endif
                        </div>

                        {{-- Plan --}}
                        <div>
                            <label class="mb-1 block text-sm text-muted">Plan</label>
                            {{-- .live: the submit button below is disabled
                                 until a plan is chosen, and a deferred binding
                                 never told the server it had been. --}}
                            <select wire:model.live="grantPlanId" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                                <option value="">Select a plan</option>
                                @foreach ($plans as $p)
                                    <option value="{{ $p->id }}">{{ $p->name }} (${{ number_format($p->price, 2) }}/{{ $p->interval }})</option>
                                @endforeach
                            </select>
                            @error('grantPlanId') <p class="mt-1 text-xs text-red-400">{{ $message }}</p> @enderror
                        </div>

                        {{-- Dates --}}
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="mb-1 block text-sm text-muted">Start date</label>
                                <input type="date" wire:model="grantStart"
                                       class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                                @error('grantStart') <p class="mt-1 text-xs text-red-400">{{ $message }}</p> @enderror
                            </div>
                            <div>
                                <label class="mb-1 block text-sm text-muted">End date <span class="text-muted">(optional)</span></label>
                                <input type="date" wire:model="grantEnd"
                                       class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                            </div>
                        </div>

                        {{-- Store --}}
                        <div>
                            <label class="mb-1 block text-sm text-muted">Source</label>
                            <select wire:model="grantStore" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                                <option value="manual">Manual (admin granted)</option>
                                <option value="google_play">Google Play</option>
                                <option value="app_store">App Store</option>
                                <option value="promo">Promotional</option>
                                <option value="refund_waiver">Refund waiver</option>
                            </select>
                        </div>

                        @error('grantUserId') <p class="text-xs text-red-400">{{ $message }}</p> @enderror

                        <button wire:click="grant" @disabled(!$grantUserId || !$grantPlanId)
                                wire:confirm="Grant paid access to this account by hand? No money is taken and nothing will renew it."
                                class="w-full rounded-xl bg-accent py-3 font-semibold text-white tap disabled:opacity-50">
                            <span wire:loading.remove wire:target="grant">Grant subscription</span>
                            <span wire:loading wire:target="grant">Granting…</span>
                        </button>
                    </div>
                @endif
            </div>
        </div>
    @endif

    {{-- ====================================================================
         EXTEND MODAL
    ==================================================================== --}}
    @if ($showExtend)
        <div class="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4"
             role="dialog" aria-modal="true" aria-label="Extend subscription" tabindex="-1"
             wire:click.self="$set('showExtend', false)" wire:keydown.escape.window="$set('showExtend', false)">
            <div class="my-auto w-full max-w-sm rounded-2xl bg-surface p-6 shadow-2xl">
                <div class="mb-5 flex items-center justify-between">
                    <h2 class="text-lg font-bold">Extend subscription</h2>
                    <button wire:click="$set('showExtend', false)" aria-label="Close extend subscription" class="grid h-8 w-8 place-items-center rounded-lg bg-surface-2 text-muted tap">
                        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                </div>
                <p class="mb-4 text-sm text-muted">Set a new expiry date. The subscription status will be set to <strong class="text-content">active</strong>. This changes nothing at the store, so its next renewal or expiry event overwrites the date.</p>
                <div>
                    <label class="mb-1 block text-sm text-muted">New end date</label>
                    <input type="date" wire:model="extendEnd"
                           class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                    @error('extendEnd') <p class="mt-1 text-xs text-red-400">{{ $message }}</p> @enderror
                </div>
                <div class="mt-4 flex gap-3">
                    <button wire:click="$set('showExtend', false)" class="flex-1 rounded-xl bg-surface-2 py-3 text-sm font-medium tap">Cancel</button>
                    <button wire:click="extend"
                            wire:confirm="Extend paid access by hand? The store keeps its own expiry and will overwrite this date."
                            class="flex-1 rounded-xl bg-accent py-3 text-sm font-semibold text-white tap">Save</button>
                </div>
            </div>
        </div>
    @endif

    {{-- ====================================================================
         CHANGE PLAN MODAL
    ==================================================================== --}}
    @if ($showChangePlan)
        <div class="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4"
             role="dialog" aria-modal="true" aria-label="Change plan" tabindex="-1"
             wire:click.self="$set('showChangePlan', false)" wire:keydown.escape.window="$set('showChangePlan', false)">
            <div class="my-auto w-full max-w-sm rounded-2xl bg-surface p-6 shadow-2xl">
                <div class="mb-5 flex items-center justify-between">
                    <h2 class="text-lg font-bold">Change plan</h2>
                    <button wire:click="$set('showChangePlan', false)" aria-label="Close change plan" class="grid h-8 w-8 place-items-center rounded-lg bg-surface-2 text-muted tap">
                        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                </div>
                <select wire:model="changePlanNewId" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 text-sm focus:border-accent focus:outline-none">
                    @foreach ($plans as $p)
                        <option value="{{ $p->id }}">{{ $p->name }} (${{ number_format($p->price,2) }}/{{ $p->interval }})</option>
                    @endforeach
                </select>
                <div class="mt-4 flex gap-3">
                    <button wire:click="$set('showChangePlan', false)" class="flex-1 rounded-xl bg-surface-2 py-3 text-sm font-medium tap">Cancel</button>
                    <button wire:click="applyChangePlan"
                            wire:confirm="Change the recorded plan? The store keeps billing the plan the customer actually bought."
                            class="flex-1 rounded-xl bg-accent py-3 text-sm font-semibold text-white tap">Save</button>
                </div>
            </div>
        </div>
    @endif

    {{-- ====================================================================
         NOTE MODAL
         Free-text context on a row: why it was granted, what support agreed,
         which duplicate it replaced. The fields for this existed on the
         component with nothing behind them.
    ==================================================================== --}}
    @if ($showNote)
        <div class="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4"
             role="dialog" aria-modal="true" aria-label="Subscription note" tabindex="-1"
             wire:click.self="$set('showNote', false)" wire:keydown.escape.window="$set('showNote', false)">
            <div class="my-auto w-full max-w-md rounded-2xl bg-surface p-6 shadow-2xl">
                <div class="mb-5 flex items-center justify-between">
                    <h2 class="text-lg font-bold">Note</h2>
                    <button wire:click="$set('showNote', false)" aria-label="Close note" class="grid h-8 w-8 place-items-center rounded-lg bg-surface-2 text-muted tap">
                        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                </div>
                <textarea wire:model="noteText" rows="5" placeholder="Why this subscription looks the way it does…"
                          class="w-full rounded-xl border border-white/10 bg-surface-2 p-3 text-sm focus:border-accent focus:outline-none"></textarea>
                @error('noteText') <p class="mt-1 text-xs text-red-400">{{ $message }}</p> @enderror
                <div class="mt-4 flex gap-3">
                    <button wire:click="$set('showNote', false)" class="flex-1 rounded-xl bg-surface-2 py-3 text-sm font-medium tap">Cancel</button>
                    <button wire:click="saveNote" class="flex-1 rounded-xl bg-accent py-3 text-sm font-semibold text-white tap">Save note</button>
                </div>
            </div>
        </div>
    @endif
</div>
