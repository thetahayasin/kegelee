<?php

namespace App\Livewire\Admin;

use App\Models\OnboardingSlide;
use Livewire\Attributes\Layout;
use Livewire\Component;
use Livewire\WithFileUploads;

#[Layout('components.layouts.admin')]
class OnboardingSlides extends Component
{
    use WithFileUploads;

    public array $rows = [];
    public array $uploads = [];
    public ?string $savedMessage = null;
    public int $previewIndex = 0;

    public function setPreviewIndex(int $index): void
    {
        $this->previewIndex = $index;
    }

    public function mount(): void
    {
        $this->loadRows();
    }

    private function loadRows(): void
    {
        $this->rows = OnboardingSlide::orderBy('sort_order')->get()->map(fn (OnboardingSlide $s) => [
            'id' => $s->id,
            'title' => $s->title,
            'icon' => $s->icon,
            'body' => $s->body,
            'cta_label' => $s->cta_label,
            'media_type' => $s->media_type,
            'media_url' => $s->mediaUrl(),
            'sort_order' => $s->sort_order,
            'is_active' => $s->is_active,
        ])->all();
    }

    public function addSlide(): void
    {
        OnboardingSlide::create([
            'title' => 'New slide',
            'media_type' => 'image',
            'sort_order' => (int) OnboardingSlide::max('sort_order') + 1,
            'is_active' => true,
        ]);
        $this->loadRows();
    }

    public function delete(int $id): void
    {
        OnboardingSlide::findOrFail($id)->delete();
        $this->loadRows();
    }

    public function save(): void
    {
        $this->validate([
            'rows.*.title' => 'required|string|max:120',
            'uploads.*' => 'nullable|file|max:51200',
        ]);

        foreach ($this->rows as $i => $row) {
            $slide = OnboardingSlide::find($row['id']);
            if (! $slide) {
                continue;
            }
            $data = [
                'title' => $row['title'],
                'icon' => $row['icon'] ?? null,
                'body' => $row['body'],
                'cta_label' => $row['cta_label'],
                'media_type' => $row['media_type'],
                'sort_order' => (int) $row['sort_order'],
                'is_active' => (bool) $row['is_active'],
            ];
            if (! empty($this->uploads[$i])) {
                $data['media_path'] = $this->uploads[$i]->store('onboarding', 'public');
            }
            $slide->update($data);
        }

        $this->uploads = [];
        $this->savedMessage = 'Onboarding saved.';
        $this->loadRows();
    }

    public function render()
    {
        return view('livewire.admin.onboarding-slides');
    }
}
