<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Plan extends Model
{
    protected $guarded = [];

    protected $casts = [
        'price' => 'float',
        'is_active' => 'boolean',
        'is_featured' => 'boolean',
    ];

    public function subscriptions(): HasMany
    {
        return $this->hasMany(Subscription::class);
    }

    /**
     * The bare Play subscription id, without the base plan suffix.
     *
     * `store_product_id` is the full base plan identifier
     * (`premium_monthly:p3m`) because that is the only thing that names a
     * price. The Play Developer API is the other way round: purchases live
     * under the SUBSCRIPTION (`premium_monthly`), and passing it the composite
     * id gets a 404 on every verify, acknowledge and cancel.
     */
    public function storeSubscriptionId(): string
    {
        $id = (string) ($this->store_product_id ?? '');

        return str_contains($id, ':') ? (string) strstr($id, ':', true) : $id;
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
