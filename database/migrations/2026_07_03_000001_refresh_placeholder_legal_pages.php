<?php

use App\Models\Page;
use Database\Seeders\PageSeeder;
use Illuminate\Database\Migrations\Migration;

/**
 * The legal pages shipped with throwaway placeholder text ("Edit this content
 * from the admin panel"). Replace them with the real release content - but
 * ONLY where the placeholder is still present, so pages an admin already
 * edited are left untouched.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (PageSeeder::pages() as $i => $data) {
            $page = Page::where('slug', $data['slug'])->first();

            if (! $page) {
                Page::create($data + ['is_published' => true, 'sort_order' => $i]);
                continue;
            }

            $isPlaceholder = $page->content === null
                || trim($page->content) === ''
                || str_contains($page->content, 'Edit this content from the admin panel');

            if ($isPlaceholder) {
                $page->update(['title' => $data['title'], 'content' => $data['content']]);
            }
        }
    }

    public function down(): void
    {
        // Content refresh; nothing to undo.
    }
};
