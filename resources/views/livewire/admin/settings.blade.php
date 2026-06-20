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
        @foreach (['branding' => 'Branding', 'circle' => 'Circle UI', 'progression' => 'Progression', 'email' => 'Email', 'google' => 'Google login', 'seo' => 'SEO', 'code' => 'Code injection', 'security' => 'Security'] as $key => $label)
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
                <div>
                    <label class="mb-1 block text-sm text-muted">Training page image</label>
                    @if ($homeImageUrl)<img src="{{ $homeImageUrl }}" class="mb-2 h-12 rounded bg-surface-2 object-contain">@endif
                    <input type="file" wire:model="homeImageUpload" accept="image/*" class="block w-full text-sm text-muted file:mr-2 file:rounded file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-content">
                    @error('homeImageUpload')<p class="mt-1 text-sm text-accent-soft">{{ $message }}</p>@enderror
                </div>
            </div>
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
            <div>
                <label class="mb-1 block text-sm text-muted">Arc animation smoothness (seconds)</label>
                <input type="number" step="0.01" min="0.05" max="0.5" wire:model="values.circle_animation_speed" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                <p class="mt-1 text-xs text-muted">How tightly the arc tracks the count (0.12 = recommended). Keep small — this is not the tempo; use Playback speed for that.</p>
            </div>
            <div>
                <label class="mb-1 block text-sm text-muted">Counter speed</label>
                <input type="number" step="0.05" min="0.3" max="1.5" wire:model="values.circle_time_scale" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                <p class="mt-1 text-xs text-muted">How fast the countdown timer ticks (1 = real time, 0.7 = each real second counts 0.7s, making exercises last longer).</p>
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

        {{-- EMAIL (SMTP) --}}
        <div x-show="tab === 'email'" class="grid gap-4 rounded-2xl bg-surface p-5 md:grid-cols-2">
            <p class="md:col-span-2 text-sm text-muted">SMTP used to send verification and password-reset codes. Leave host blank to use the server default (codes are written to the log in local dev).</p>
            <div><label class="mb-1 block text-sm text-muted">SMTP host</label>
                <input wire:model="values.mail_host" placeholder="smtp.example.com" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none"></div>
            <div><label class="mb-1 block text-sm text-muted">Port</label>
                <input type="number" wire:model="values.mail_port" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none"></div>
            <div><label class="mb-1 block text-sm text-muted">Username</label>
                <input wire:model="values.mail_username" autocomplete="off" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none"></div>
            <div><label class="mb-1 block text-sm text-muted">Password</label>
                <input type="password" wire:model="values.mail_password" autocomplete="new-password" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none"></div>
            <div><label class="mb-1 block text-sm text-muted">Encryption</label>
                <select wire:model="values.mail_encryption" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                    <option value="tls">TLS</option><option value="ssl">SSL</option><option value="none">None</option>
                </select></div>
            <div><label class="mb-1 block text-sm text-muted">From name</label>
                <input wire:model="values.mail_from_name" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none"></div>
            <div class="md:col-span-2"><label class="mb-1 block text-sm text-muted">From address</label>
                <input type="email" wire:model="values.mail_from_address" placeholder="no-reply@yourapp.com" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none"></div>
        </div>

        {{-- GOOGLE LOGIN --}}
        <div x-show="tab === 'google'" class="space-y-4 rounded-2xl bg-surface p-5">
            <label class="flex items-center gap-3"><input type="checkbox" wire:model="values.google_login_enabled" class="h-5 w-5 accent-[var(--c-accent)]"> <span>Enable "Continue with Google"</span></label>
            <p class="text-sm text-muted">Create OAuth credentials in Google Cloud Console. Authorised redirect URI: <code class="text-content">{{ url('/auth/google/callback') }}</code></p>
            <div><label class="mb-1 block text-sm text-muted">Client ID</label>
                <input wire:model="values.google_client_id" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 font-mono text-sm focus:border-accent focus:outline-none"></div>
            <div><label class="mb-1 block text-sm text-muted">Client secret</label>
                <input type="password" wire:model="values.google_client_secret" autocomplete="new-password" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 font-mono text-sm focus:border-accent focus:outline-none"></div>
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

        {{-- SECURITY --}}
        <div x-show="tab === 'security'" class="space-y-4 rounded-2xl bg-surface p-5">
            <p class="text-sm text-muted">Change your admin account password.</p>
            <div><label class="mb-1 block text-sm text-muted">Current password</label>
                <input type="password" wire:model="currentPassword" autocomplete="current-password" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                @error('currentPassword') <p class="mt-1 text-xs text-accent-soft">{{ $message }}</p> @enderror</div>
            <div><label class="mb-1 block text-sm text-muted">New password</label>
                <input type="password" wire:model="adminNewPassword" autocomplete="new-password" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                @error('adminNewPassword') <p class="mt-1 text-xs text-accent-soft">{{ $message }}</p> @enderror</div>
            <div><label class="mb-1 block text-sm text-muted">Confirm new password</label>
                <input type="password" wire:model="adminNewPassword_confirmation" autocomplete="new-password" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none"></div>
            <button type="button" wire:click="changeAdminPassword" class="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold tap">
                <span wire:loading.remove wire:target="changeAdminPassword">Update password</span>
                <span wire:loading wire:target="changeAdminPassword">Updating...</span>
            </button>
            @if ($passwordMessage) <p class="text-sm font-semibold text-success">{{ $passwordMessage }}</p> @endif
        </div>

        <button type="submit" class="rounded-xl bg-accent px-6 py-3 font-semibold tap">
            <span wire:loading.remove wire:target="save">Save settings</span>
            <span wire:loading wire:target="save">Saving...</span>
        </button>
    </form>
</div>
