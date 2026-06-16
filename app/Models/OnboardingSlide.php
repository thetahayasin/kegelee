<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class OnboardingSlide extends Model
{
    protected $guarded = [];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function mediaUrl(): ?string
    {
        return $this->media_path ? Storage::url($this->media_path) : null;
    }
}
