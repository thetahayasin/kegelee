<?php

namespace App\Livewire\Admin;

use App\Models\KnowledgeLesson;
use Livewire\Attributes\Layout;
use Livewire\Component;
use Livewire\WithFileUploads;

#[Layout('components.layouts.admin')]
class Knowledge extends Component
{
    use WithFileUploads;

    public array $rows = [];
    public array $videoUploads = [];
    public array $thumbUploads = [];
    public ?string $savedMessage = null;

    public function mount(): void
    {
        $this->loadRows();
    }

    private function loadRows(): void
    {
        $this->rows = KnowledgeLesson::orderBy('sort_order')->get()->map(fn (KnowledgeLesson $l) => [
            'id' => $l->id,
            'title' => $l->title,
            'description' => $l->description,
            'icon' => $l->icon,
            'video_url' => $l->video_url,
            'video_src' => $l->videoSrc(),
            'thumb_url' => $l->thumbnailUrl(),
            'sort_order' => $l->sort_order,
            'is_active' => $l->is_active,
        ])->all();
    }

    public function addLesson(): void
    {
        KnowledgeLesson::create([
            'title' => 'New lesson',
            'sort_order' => (int) KnowledgeLesson::max('sort_order') + 1,
            'is_active' => true,
        ]);
        $this->loadRows();
    }

    public function delete(int $id): void
    {
        KnowledgeLesson::findOrFail($id)->delete();
        $this->loadRows();
    }

    public function save(): void
    {
        $this->validate([
            'rows.*.title' => 'required|string|max:160',
            'rows.*.video_url' => 'nullable|url',
            'videoUploads.*' => 'nullable|mimetypes:video/mp4,video/quicktime,video/webm|max:102400',
            'thumbUploads.*' => 'nullable|image|max:4096',
        ]);

        foreach ($this->rows as $i => $row) {
            $lesson = KnowledgeLesson::find($row['id']);
            if (! $lesson) {
                continue;
            }
            $data = [
                'title' => $row['title'],
                'description' => $row['description'],
                'icon' => $row['icon'],
                'video_url' => $row['video_url'] ?: null,
                'sort_order' => (int) $row['sort_order'],
                'is_active' => (bool) $row['is_active'],
            ];
            if (! empty($this->videoUploads[$i])) {
                $data['video_path'] = $this->videoUploads[$i]->store('knowledge/videos', 'public');
            }
            if (! empty($this->thumbUploads[$i])) {
                $data['thumbnail_path'] = $this->thumbUploads[$i]->store('knowledge/thumbs', 'public');
            }
            $lesson->update($data);
        }

        $this->videoUploads = [];
        $this->thumbUploads = [];
        $this->savedMessage = 'Knowledge saved.';
        $this->loadRows();
    }

    public function render()
    {
        return view('livewire.admin.knowledge');
    }
}
