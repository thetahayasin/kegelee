<?php

namespace App\Livewire\App;

use App\Models\Discount;
use App\Models\Plan;
use App\Models\Subscription;
use Livewire\Attributes\Layout;
use Livewire\Component;

#[Layout('components.layouts.app')]
class Paywall extends Component
{
    public ?int $selectedPlan = null;

    public string $code = '';

    public ?Discount $discount = null;

    public ?string $message = null;

    public function mount(): void
    {
        $this->selectedPlan = Plan::where('is_active', true)->where('is_featured', true)->value('id')
            ?? Plan::where('is_active', true)->where('price', '>', 0)->orderBy('sort_order')->value('id');
    }

    public function applyCode(): void
    {
        $discount = Discount::where('code', strtoupper(trim($this->code)))->first();

        if (! $discount || ! $discount->isRedeemable()) {
            $this->discount = null;
            $this->message = 'That code is not valid.';
            return;
        }

        $this->discount = $discount;
        $this->message = 'Code applied: '.($discount->type === 'percent' ? $discount->value.'% off' : '$'.$discount->value.' off');
    }

    public function subscribe(int $planId): void
    {
        $plan = Plan::findOrFail($planId);
        $user = auth()->user();

        if ($plan->price <= 0) {
            $this->redirectRoute('home', navigate: true);
            return;
        }

        Subscription::create([
            'user_id' => $user->id,
            'plan_id' => $plan->id,
            'discount_id' => $this->discount?->id,
            'status' => $plan->trial_days > 0 ? 'trialing' : 'active',
            'store' => 'manual',
            'trial_ends_at' => $plan->trial_days > 0 ? now()->addDays($plan->trial_days) : null,
            'started_at' => now(),
            'ends_at' => match ($plan->interval) {
                'day' => now()->addDays($plan->interval_count),
                'week' => now()->addWeeks($plan->interval_count),
                'month' => now()->addMonths($plan->interval_count),
                'year' => now()->addYears($plan->interval_count),
                default => null,
            },
        ]);

        if ($this->discount) {
            $this->discount->increment('redemptions');
        }

        $this->redirectRoute('profile', navigate: true);
    }

    public function render()
    {
        return view('livewire.app.paywall', [
            'plans' => Plan::where('is_active', true)->orderBy('sort_order')->get(),
        ]);
    }
}
