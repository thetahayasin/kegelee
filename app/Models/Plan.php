<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Plan extends Model
{
    protected $guarded = [];

    protected $casts = [
        'features' => 'array',
        'price' => 'float',
        'is_active' => 'boolean',
        'is_featured' => 'boolean',
    ];

    public function subscriptions(): HasMany
    {
        return $this->hasMany(Subscription::class);
    }

    public function priceWithDiscount(?Discount $discount): float
    {
        if (! $discount) {
            return $this->price;
        }

        $amount = $discount->type === 'percent'
            ? $this->price - ($this->price * $discount->value / 100)
            : $this->price - $discount->value;

        return max(0, round($amount, 2));
    }
}
