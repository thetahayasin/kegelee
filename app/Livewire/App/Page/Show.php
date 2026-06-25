<?php

namespace App\Livewire\App\Page;

use App\Models\Page;
use Livewire\Attributes\Layout;
use Livewire\Component;

#[Layout('components.layouts.page')]
class Show extends Component
{
    public Page $page;

    public function mount()
    {
        if (! $this->page->is_published && ! optional(auth()->user())->is_admin) {
            abort(404);
        }
    }

    public function render()
    {
        return view('livewire.app.page.show', ['title' => $this->page->title]);
    }
}
