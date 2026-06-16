@php
    $colorField = function ($key, $label) {
        return [$key, $label];
    };
@endphp
<div x-data="{ tab: 'branding' }">
    <div class="mb-6 flex items-center justify-between">
        <h1 class="text-2xl font-bold">Settings</h1>
        @if ($savedMessage)<span class="rounded-lg bg-success/15 px-3 py-1.5 text-sm font-semibold text-success">{{ $savedMessage }}</span>@endif
    </div>

    {{-- Tabs --}}
    <div class="mb-6 flex flex-wrap gap-2">
        @foreach (['branding' => 'Branding', 'theme' => 'Theme', 'circle' => 'Circle UI', 'progression' => 'Progression', 'seo' => 'SEO', 'code' => 'Code injection'] as $key => $label)
            <button @click="tab = '{{ $key }}'" :class="tab === '{{ $key }}' ? 'bg-accent text-white' : 'bg-surface text-muted'"
                    class="rounded-xl px-4 py-2 text-sm font-medium tap">{{ $label }}</button>
        @endforeach
    </div>

    <form wire:submit="save" class="space-y-4">
        {{-- BRANDING --}}
        <div x-show="tab === 'branding'" class="space-y-4 rounded-2xl bg-surface p-5">
            <div>
                <label class="mb-1 block text-sm text-muted">App name</label>
                <input wire:model="values.app_name" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
            </div>
            <div>
                <label class="mb-1 block text-sm text-muted">Tagline</label>
                <input wire:model="values.app_tagline" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
            </div>
            <div class="grid gap-4 md:grid-cols-2">
                <div>
                    <label class="mb-1 block text-sm text-muted">Logo</label>
                    @if ($logoUrl)<img src="{{ $logoUrl }}" class="mb-2 h-12 rounded bg-surface-2 object-contain">@endif
                    <input type="file" wire:model="logoUpload" accept="image/*" class="block w-full text-sm text-muted file:mr-2 file:rounded file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-content">
                    @error('logoUpload')<p class="mt-1 text-sm text-accent-soft">{{ $message }}</p>@enderror
                </div>
                <div>
                    <label class="mb-1 block text-sm text-muted">Favicon</label>
                    <input type="file" wire:model="faviconUpload" accept="image/*" class="block w-full text-sm text-muted file:mr-2 file:rounded file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-content">
                    @error('faviconUpload')<p class="mt-1 text-sm text-accent-soft">{{ $message }}</p>@enderror
                </div>
            </div>
        </div>

        {{-- THEME --}}
        <div x-show="tab === 'theme'" class="grid gap-4 rounded-2xl bg-surface p-5 md:grid-cols-2">
            @foreach (['color_accent' => 'Accent', 'color_accent_soft' => 'Accent soft', 'color_success' => 'Success', 'color_bg' => 'Background', 'color_surface' => 'Surface', 'color_surface_2' => 'Surface 2', 'color_text' => 'Text', 'color_text_muted' => 'Muted text'] as $key => $label)
                <div class="flex items-center gap-3">
                    <input type="color" wire:model="values.{{ $key }}" class="h-11 w-14 rounded-lg border border-white/10 bg-surface-2">
                    <div class="flex-1">
                        <label class="block text-sm text-muted">{{ $label }}</label>
                        <input wire:model="values.{{ $key }}" class="h-9 w-full rounded-lg border border-white/10 bg-surface-2 px-2 font-mono text-sm focus:border-accent focus:outline-none">
                    </div>
                </div>
            @endforeach
        </div>

        {{-- CIRCLE UI --}}
        <div x-show="tab === 'circle'" class="grid gap-4 rounded-2xl bg-surface p-5 md:grid-cols-2">
            <div>
                <label class="mb-1 block text-sm text-muted">Circle size (px)</label>
                <input type="number" wire:model="values.circle_size" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
            </div>
            <div>
                <label class="mb-1 block text-sm text-muted">Track width (px)</label>
                <input type="number" wire:model="values.circle_track_width" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
            </div>
            <div class="flex items-center gap-3">
                <input type="color" wire:model="values.circle_glow_color" class="h-11 w-14 rounded-lg border border-white/10 bg-surface-2">
                <div class="flex-1"><label class="block text-sm text-muted">Glow colour</label>
                    <input wire:model="values.circle_glow_color" class="h-9 w-full rounded-lg border border-white/10 bg-surface-2 px-2 font-mono text-sm focus:border-accent focus:outline-none"></div>
            </div>
            <div>
                <label class="mb-1 block text-sm text-muted">Arc animation smoothness (seconds)</label>
                <input type="number" step="0.01" min="0.05" max="0.5" wire:model="values.circle_animation_speed" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                <p class="mt-1 text-xs text-muted">How tightly the arc tracks the count (0.12 = recommended). Keep small — this is not the tempo; use Playback speed for that.</p>
            </div>
            <div>
                <label class="mb-1 block text-sm text-muted">Playback speed</label>
                <input type="number" step="0.05" min="0.3" max="1.5" wire:model="values.circle_time_scale" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                <p class="mt-1 text-xs text-muted">Tempo of the whole exercise — count, beats and glow (1 = real time, 0.7 ≈ 40% slower, 0.5 = half speed).</p>
            </div>
            <div>
                <label class="mb-1 block text-sm text-muted">Glow pulse speed (seconds)</label>
                <input type="number" step="0.05" min="0.1" max="2" wire:model="values.circle_glow_speed" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                <p class="mt-1 text-xs text-muted">How fast the red circle fades in and out (0.1 = snappy, 2 = slow)</p>
            </div>
            <div>
                <label class="mb-1 block text-sm text-muted">Start phase</label>
                <select wire:model="values.circle_start_phase" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                    <option value="contract">Contract first</option>
                    <option value="relax">Relax first</option>
                </select>
            </div>
            <div class="space-y-3 pt-2">
                <label class="flex items-center gap-3"><input type="checkbox" wire:model="values.circle_glow_enabled" class="h-5 w-5 accent-[var(--c-accent)]"> <span>Contraction glow</span></label>
                <label class="flex items-center gap-3"><input type="checkbox" wire:model="values.haptics_enabled" class="h-5 w-5 accent-[var(--c-accent)]"> <span>Haptics</span></label>
                <label class="flex items-center gap-3"><input type="checkbox" wire:model="values.sound_enabled" class="h-5 w-5 accent-[var(--c-accent)]"> <span>Sound cues</span></label>
            </div>
        </div>

        {{-- PROGRESSION --}}
        <div x-show="tab === 'progression'" class="grid gap-4 rounded-2xl bg-surface p-5 md:grid-cols-2">
            <div>
                <label class="mb-1 block text-sm text-muted">Sessions per day (counts as a completed day)</label>
                <input type="number" wire:model="values.sessions_per_day" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
            </div>
            <div>
                <label class="mb-1 block text-sm text-muted">Plan length (days per month)</label>
                <input type="number" wire:model="values.plan_length_days" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
            </div>
            <label class="flex items-center gap-3"><input type="checkbox" wire:model="values.allow_extra_sessions" class="h-5 w-5 accent-[var(--c-accent)]"> <span>Allow extra (optional) sessions</span></label>
            <label class="flex items-center gap-3"><input type="checkbox" wire:model="values.onboarding_enabled" class="h-5 w-5 accent-[var(--c-accent)]"> <span>Show onboarding story</span></label>
        </div>

        {{-- SEO --}}
        <div x-show="tab === 'seo'" class="space-y-4 rounded-2xl bg-surface p-5">
            <div><label class="mb-1 block text-sm text-muted">SEO title</label>
                <input wire:model="values.seo_title" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none"></div>
            <div><label class="mb-1 block text-sm text-muted">Meta description</label>
                <textarea wire:model="values.seo_description" rows="2" class="w-full rounded-xl border border-white/10 bg-surface-2 px-3 py-2 focus:border-accent focus:outline-none"></textarea></div>
            <div><label class="mb-1 block text-sm text-muted">Keywords</label>
                <input wire:model="values.seo_keywords" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none"></div>
            <div><label class="mb-1 block text-sm text-muted">OG image</label>
                <input type="file" wire:model="ogUpload" accept="image/*" class="block w-full text-sm text-muted file:mr-2 file:rounded file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-content"></div>
        </div>

        {{-- CODE INJECTION --}}
        <div x-show="tab === 'code'" class="space-y-4 rounded-2xl bg-surface p-5">
            <p class="text-sm text-muted">Inject analytics, pixels, fonts or custom markup. Rendered raw - use trusted code only.</p>
            <div><label class="mb-1 block text-sm text-muted">&lt;head&gt; injection</label>
                <textarea wire:model="values.inject_head" rows="3" class="w-full rounded-xl border border-white/10 bg-surface-2 px-3 py-2 font-mono text-sm focus:border-accent focus:outline-none"></textarea></div>
            <div><label class="mb-1 block text-sm text-muted">Body start injection</label>
                <textarea wire:model="values.inject_body_start" rows="3" class="w-full rounded-xl border border-white/10 bg-surface-2 px-3 py-2 font-mono text-sm focus:border-accent focus:outline-none"></textarea></div>
            <div><label class="mb-1 block text-sm text-muted">Body end injection</label>
                <textarea wire:model="values.inject_body_end" rows="3" class="w-full rounded-xl border border-white/10 bg-surface-2 px-3 py-2 font-mono text-sm focus:border-accent focus:outline-none"></textarea></div>
            <div><label class="mb-1 block text-sm text-muted">Custom CSS</label>
                <textarea wire:model="values.custom_css" rows="4" class="w-full rounded-xl border border-white/10 bg-surface-2 px-3 py-2 font-mono text-sm focus:border-accent focus:outline-none"></textarea></div>
        </div>

        <button type="submit" class="rounded-xl bg-accent px-6 py-3 font-semibold text-white tap">Save settings</button>
    </form>
</div>
