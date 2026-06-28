<?php

namespace App\Livewire\Admin;

use App\Models\Plan;
use Illuminate\Support\Str;
use Livewire\Attributes\Layout;
use Livewire\Component;

#[Layout('components.layouts.admin')]
class Plans extends Component
{
    public array $rows = [];
    public ?string $savedMessage = null;

    public function mount(): void
    {
        $this->loadRows();
    }

    private function loadRows(): void
    {
        $this->rows = Plan::orderBy('sort_order')->get()->map(fn (Plan $p) => [
            'id'               => $p->id,
            'name'             => $p->name,
            'price'            => $p->price,
            'interval'         => $p->interval,
            'interval_count'   => $p->interval_count,
            'store_product_id' => $p->store_product_id,
            'is_featured'      => $p->is_featured,
            'is_active'        => $p->is_active,
        ])->all();
    }

    public function addPlan(): void
    {
        Plan::create([
            'name' => 'New plan',
            'slug' => 'plan-'.Str::random(5),
            'price' => 0,
            'interval' => 'month',
            'interval_count' => 1,
            'sort_order' => (int) Plan::max('sort_order') + 1,
        ]);
        $this->loadRows();
    }

    public function delete(int $id): void
    {
        Plan::findOrFail($id)->delete();
        $this->loadRows();
    }

    public function save(): void
    {
        foreach ($this->rows as $row) {
            Plan::where('id', $row['id'])->update([
                'name'             => $row['name'],
                'price'            => (float) $row['price'],
                'interval'         => $row['interval'],
                'interval_count'   => max(1, (int) $row['interval_count']),
                'store_product_id' => $row['store_product_id'] ?: null,
                'is_featured'      => (bool) $row['is_featured'],
                'is_active'        => (bool) $row['is_active'],
            ]);
        }
        $this->savedMessage = 'Plans saved.';
        $this->loadRows();
    }

    public function render()
    {
        return view('livewire.admin.plans', ['intervals' => ['day', 'week', 'month', 'year', 'lifetime']]);
    }
}
