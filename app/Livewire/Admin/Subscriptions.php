<?php

namespace App\Livewire\Admin;

use App\Models\Subscription;
use Livewire\Attributes\Layout;
use Livewire\Component;
use Livewire\WithPagination;

#[Layout('components.layouts.admin')]
class Subscriptions extends Component
{
    use WithPagination;

    public function cancel(int $id): void
    {
        Subscription::where('id', $id)->update(['status' => 'canceled', 'canceled_at' => now()]);
    }

    public function render()
    {
        return view('livewire.admin.subscriptions', [
            'subscriptions' => Subscription::with(['user', 'plan'])->latest()->paginate(20),
        ]);
    }
}
