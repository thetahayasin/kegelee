<?php

namespace Database\Seeders;

use App\Models\Page;
use Illuminate\Database\Seeder;

class PageSeeder extends Seeder
{
    public function run(): void
    {
        $pages = [
            [
                'slug' => 'privacy-policy',
                'title' => 'Privacy Policy',
                'content' => "<p>This Privacy Policy explains how we collect, use and protect your information when you use the app.</p><p>Edit this content from the admin panel under Pages.</p>",
            ],
            [
                'slug' => 'refund-policy',
                'title' => 'Refund Policy',
                'content' => "<p>Subscriptions are billed through the app store you purchased from. Refund requests are handled per the store's policy.</p><p>Edit this content from the admin panel under Pages.</p>",
            ],
            [
                'slug' => 'terms',
                'title' => 'Terms of Service',
                'content' => "<p>By using this app you agree to these Terms of Service.</p><p>Edit this content from the admin panel under Pages.</p>",
            ],
        ];

        // Create-only: never overwrite content the admin has edited.
        foreach ($pages as $i => $data) {
            Page::firstOrCreate(
                ['slug' => $data['slug']],
                $data + ['is_published' => true, 'sort_order' => $i],
            );
        }
    }
}
