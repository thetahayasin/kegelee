<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Support\Facades\Storage;

class KnowledgeLesson extends Model
{
    protected $guarded = [];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function completedByUsers(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'knowledge_lesson_user')
            ->withPivot('completed_at')
            ->withTimestamps();
    }

    public function thumbnailUrl(): ?string
    {
        return $this->thumbnail_path ? Storage::url($this->thumbnail_path) : null;
    }

    public function videoSrc(): ?string
    {
        if ($this->video_path) {
            return Storage::url($this->video_path);
        }

        return $this->video_url ?: null;
    }

    public function hasVideo(): bool
    {
        return (bool) $this->videoSrc();
    }
}
