<?php

namespace App\Livewire\Admin;

use App\Models\Page;
use Illuminate\Support\Str;
use Livewire\Attributes\Layout;
use Livewire\Component;

#[Layout('components.layouts.admin')]
class Pages extends Component
{
    public ?int $editingId = null;

    public string $title = '';
    public string $slug = '';
    public string $content = '';
    public bool $is_published = true;
    public int $sort_order = 0;

    public ?string $savedMessage = null;

    public function newPage(): void
    {
        $this->reset(['editingId', 'title', 'slug', 'content']);
        $this->is_published = true;
        $this->sort_order = (int) Page::max('sort_order') + 1;
    }

    public function edit(int $id): void
    {
        $page = Page::findOrFail($id);
        $this->editingId = $page->id;
        $this->title = $page->title;
        $this->slug = $page->slug;
        $this->content = (string) $page->content;
        $this->is_published = $page->is_published;
        $this->sort_order = $page->sort_order;
        $this->savedMessage = null;
    }

    public function save(): void
    {
        $this->slug = $this->slug ?: Str::slug($this->title);

        $this->validate([
            'title' => 'required|string|max:160',
            'slug' => 'required|alpha_dash|unique:pages,slug,'.($this->editingId ?? 'NULL').',id',
            'content' => 'nullable|string',
            'sort_order' => 'integer|min:0',
        ]);

        $page = $this->editingId ? Page::find($this->editingId) : new Page();
        $page->fill([
            'title' => $this->title,
            'slug' => $this->slug,
            'content' => $this->content,
            'is_published' => $this->is_published,
            'sort_order' => $this->sort_order,
        ])->save();

        $this->editingId = $page->id;
        $this->savedMessage = 'Page saved.';
    }

    public function delete(int $id): void
    {
        Page::findOrFail($id)->delete();
        if ($this->editingId === $id) {
            $this->newPage();
        }
    }

    public function render()
    {
        return view('livewire.admin.pages', [
            'pages' => Page::orderBy('sort_order')->get(),
        ]);
    }
}
