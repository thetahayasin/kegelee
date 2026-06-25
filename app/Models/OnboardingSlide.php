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
        if (! $this->media_path) {
            return null;
        }

        // Synced content stores an absolute backend URL — pass it through as-is.
        if (str_starts_with($this->media_path, 'http://') || str_starts_with($this->media_path, 'https://')) {
            return $this->media_path;
        }

        return Storage::url($this->media_path);
    }
}
