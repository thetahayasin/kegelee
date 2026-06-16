<?php

namespace App\Livewire\Admin;

use App\Models\Discount;
use Livewire\Attributes\Layout;
use Livewire\Component;

#[Layout('components.layouts.admin')]
class Discounts extends Component
{
    public string $code = '';
    public string $description = '';
    public string $type = 'percent';
    public float $value = 10;
    public ?int $max_redemptions = null;
    public ?string $expires_at = null;

    public function create(): void
    {
        $this->validate([
            'code' => 'required|alpha_dash|unique:discounts,code',
            'type' => 'in:percent,fixed',
            'value' => 'required|numeric|min:0',
        ]);

        Discount::create([
            'code' => strtoupper($this->code),
            'description' => $this->description,
            'type' => $this->type,
            'value' => $this->value,
            'max_redemptions' => $this->max_redemptions ?: null,
            'expires_at' => $this->expires_at ?: null,
            'is_active' => true,
        ]);

        $this->reset(['code', 'description', 'value', 'max_redemptions', 'expires_at']);
    }

    public function toggle(int $id): void
    {
        $d = Discount::findOrFail($id);
        $d->update(['is_active' => ! $d->is_active]);
    }

    public function delete(int $id): void
    {
        Discount::findOrFail($id)->delete();
    }

    public function render()
    {
        return view('livewire.admin.discounts', ['discounts' => Discount::latest()->get()]);
    }
}
