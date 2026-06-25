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
        @foreach (['branding' => 'Branding', 'circle' => 'Circle UI', 'progression' => 'Progression', 'sync' => 'Offline sync', 'email' => 'Email', 'google' => 'Google login', 'google_play' => 'Google Play', 'homepage' => 'Homepage', 'seo' => 'SEO', 'code' => 'Code injection', 'security' => 'Security'] as $key => $label)
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
                    @if ($logoUrl)
                        <div class="mb-2 flex items-center gap-3">
                            <img src="{{ $logoUrl }}" class="h-12 rounded bg-surface-2 object-contain">
                            <button type="button" wire:click="removeImage('logo_path')" wire:confirm="Remove the logo?"
                                    class="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted hover:text-accent-soft transition-colors">Remove</button>
                        </div>
                    @endif
                    <input type="file" wire:model="logoUpload" accept="image/*" class="block w-full text-sm text-muted file:mr-2 file:rounded file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-content">
                    @error('logoUpload')<p class="mt-1 text-sm text-accent-soft">{{ $message }}</p>@enderror
                </div>
                <div>
                    <label class="mb-1 block text-sm text-muted">Favicon</label>
                    @if ($faviconUrl)
                        <div class="mb-2 flex items-center gap-3">
                            <img src="{{ $faviconUrl }}" class="h-12 w-12 rounded bg-surface-2 object-contain">
                            <button type="button" wire:click="removeImage('favicon_path')" wire:confirm="Remove the favicon?"
                                    class="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted hover:text-accent-soft transition-colors">Remove</button>
                        </div>
                    @endif
                    <input type="file" wire:model="faviconUpload" accept="image/*" class="block w-full text-sm text-muted file:mr-2 file:rounded file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-content">
                    @error('faviconUpload')<p class="mt-1 text-sm text-accent-soft">{{ $message }}</p>@enderror
                </div>
                <div>
                    <label class="mb-1 block text-sm text-muted">Training page image</label>
                    @if ($homeImageUrl)
                        <div class="mb-2 flex items-center gap-3">
                            <img src="{{ $homeImageUrl }}" class="h-12 rounded bg-surface-2 object-contain">
                            <button type="button" wire:click="removeImage('home_hero_image')" wire:confirm="Remove the training page image?"
                                    class="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted hover:text-accent-soft transition-colors">Remove</button>
                        </div>
                    @endif
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

        {{-- OFFLINE SYNC --}}
        <div x-show="tab === 'sync'" class="space-y-4 rounded-2xl bg-surface p-5">
            <label class="flex items-center gap-3"><input type="checkbox" wire:model="values.sync_enabled" class="h-5 w-5 accent-[var(--c-accent)]"> <span>Enable offline sync</span></label>
            <p class="text-sm text-muted">When enabled, the app stores exercises, sessions and progress locally in the browser. User data syncs automatically when connectivity returns.</p>

            <div class="grid gap-4 md:grid-cols-2">
                <div>
                    <label class="mb-1 block text-sm text-muted">Sync interval (minutes)</label>
                    <input type="number" min="5" max="120" wire:model="values.sync_interval_minutes" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                    <p class="mt-1 text-xs text-muted">How often the app checks for new exercises/content from the server while online. Lower = fresher data, higher = less bandwidth.</p>
                </div>
                <div>
                    <label class="mb-1 block text-sm text-muted">Session lifetime (days)</label>
                    <input type="number" min="1" max="365" wire:model="values.sync_session_lifetime_days" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                    <p class="mt-1 text-xs text-muted">How long users stay logged in before needing to re-authenticate. 30 days is recommended for fitness apps.</p>
                </div>
            </div>

            <div class="rounded-xl border border-white/10 bg-surface-2 p-4 text-sm text-muted">
                <p class="font-semibold text-content">Sync API endpoint</p>
                <p class="mt-1 font-mono text-xs break-all">{{ url('/api/v1/content') }}</p>
                <p class="mt-2">Secured by <code class="text-content">SYNC_API_KEY</code> in your <code>.env</code>. The app passes this automatically — no user action needed.</p>
            </div>
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

        {{-- GOOGLE PLAY BILLING --}}
        <div x-show="tab === 'google_play'" class="space-y-4 rounded-2xl bg-surface p-5">
            <label class="flex items-center gap-3">
                <input type="checkbox" wire:model="values.google_play_enabled" class="h-5 w-5 accent-[var(--c-accent)]">
                <span>Enable Google Play Billing</span>
            </label>

            <p class="text-sm text-muted">
                Create a service account in
                <strong class="text-content">Google Cloud Console</strong> with the
                <em>Android Publisher</em> role, download its JSON key, and paste the full
                contents below. Also add the service account email to your
                <strong class="text-content">Play Console &rarr; Users &amp; permissions</strong>
                with <em>View financial data</em> + <em>Manage orders</em> access.
            </p>

            <div>
                <label class="mb-1 block text-sm text-muted">Android package name</label>
                <input wire:model="values.google_play_package_name"
                       placeholder="com.yourapp.id"
                       class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 font-mono text-sm focus:border-accent focus:outline-none">
                <p class="mt-1 text-xs text-muted">Must match the Application ID in your Play Console listing.</p>
            </div>

            <div>
                <label class="mb-1 block text-sm text-muted">Service account JSON key</label>
                <textarea wire:model="values.google_play_service_account_json"
                          rows="10"
                          placeholder='{"type":"service_account","project_id":"...","private_key_id":"...","private_key":"-----BEGIN RSA PRIVATE KEY-----\n...","client_email":"...@....iam.gserviceaccount.com",...}'
                          class="w-full rounded-xl border border-white/10 bg-surface-2 px-3 py-2 font-mono text-xs leading-relaxed focus:border-accent focus:outline-none"></textarea>
                <p class="mt-1 text-xs text-muted">Paste the full contents of the downloaded <code>.json</code> key file. Stored encrypted at rest — never exposed to the app.</p>
            </div>

            <div class="rounded-xl border border-white/10 bg-surface-2 p-4 text-sm text-muted">
                <p class="font-semibold text-content">Pub/Sub webhook URL</p>
                <p class="mt-1 font-mono text-xs break-all">{{ url('/webhooks/google-play') }}</p>
                <p class="mt-2">Configure this as the push endpoint in your Google Cloud Pub/Sub subscription so Play sends real-time renewal and cancellation events.</p>
            </div>

            <div>
                <label class="mb-1 block text-sm text-muted">Free trial days (all plans)</label>
                <input type="number" min="0" wire:model="values.subscription_trial_days"
                       class="h-11 w-32 rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                <p class="mt-1 text-xs text-muted">Set to 0 to disable trials. Applies to every plan — there are no per-plan trial periods.</p>
            </div>

            <div class="rounded-xl border border-white/10 bg-surface-2 p-4 text-sm text-muted">
                <p class="font-semibold text-content">Per-plan product IDs</p>
                <p class="mt-1">Set each plan's <em>Store product ID</em> in
                    <a href="{{ route('admin.plans') }}" class="text-accent underline">Admin &rarr; Plans</a>
                    to match the subscription product ID in your Play Console
                    (e.g. <code class="text-content">premium_monthly</code>).
                    Plans without a product ID fall back to the manual subscription flow.
                </p>
            </div>
        </div>

        {{-- HOMEPAGE --}}
        <div x-show="tab === 'homepage'" class="space-y-4 rounded-2xl bg-surface p-5">
            <label class="flex items-center gap-3">
                <input type="checkbox" wire:model="values.homepage_enabled" class="h-5 w-5 accent-[var(--c-accent)]">
                <span>Show public marketing homepage at <code class="text-content">/</code></span>
            </label>
            <p class="text-sm text-muted">When disabled, visitors are redirected to the onboarding screen instead.</p>

            <div class="mb-4">
                <label class="mb-1 block text-sm text-muted">Google Play Store URL</label>
                <input wire:model="values.play_store_url" placeholder="https://play.google.com/store/apps/details?id=com.example.app" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
            </div>

            <div class="grid gap-4 md:grid-cols-2">
                <div>
                    <label class="mb-1 block text-sm text-muted">Badge text</label>
                    <input wire:model="values.home_badge_text" placeholder="#1 Kegel App" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                </div>
                <div>
                    <label class="mb-1 block text-sm text-muted">Footer tagline</label>
                    <input wire:model="values.home_footer_tagline" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                </div>
                <div class="md:col-span-2">
                    <label class="mb-1 block text-sm text-muted">Hero headline</label>
                    <input wire:model="values.home_headline" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                </div>
                <div class="md:col-span-2">
                    <label class="mb-1 block text-sm text-muted">Hero sub-headline</label>
                    <textarea wire:model="values.home_subheadline" rows="2" class="w-full rounded-xl border border-white/10 bg-surface-2 px-3 py-2 focus:border-accent focus:outline-none"></textarea>
                </div>
                <div>
                    <label class="mb-1 block text-sm text-muted">Primary CTA button</label>
                    <input wire:model="values.home_cta_primary" placeholder="Start Free Today" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                </div>
                <div>
                    <label class="mb-1 block text-sm text-muted">Secondary CTA button</label>
                    <input wire:model="values.home_cta_secondary" placeholder="See how it works" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                </div>
            </div>

            <div>
                <label class="mb-1 block text-sm text-muted">Stats <span class="text-xs">(JSON array of {value, label})</span></label>
                <textarea wire:model="values.home_stats" rows="6"
                          class="w-full rounded-xl border border-white/10 bg-surface-2 px-3 py-2 font-mono text-xs focus:border-accent focus:outline-none"
                          placeholder='[{"value":"50K+","label":"Active users"},{"value":"1M+","label":"Sessions completed"}]'></textarea>
            </div>

            <div>
                <label class="mb-1 block text-sm text-muted">Features <span class="text-xs">(JSON array of {icon, title, desc})</span></label>
                <p class="mb-1 text-xs text-muted">Icon options: target, activity, trending-up, bell, book-open, shield, heart, zap, star, lock</p>
                <textarea wire:model="values.home_features" rows="8"
                          class="w-full rounded-xl border border-white/10 bg-surface-2 px-3 py-2 font-mono text-xs focus:border-accent focus:outline-none"></textarea>
            </div>

            <div>
                <label class="mb-1 block text-sm text-muted">How it works steps <span class="text-xs">(JSON array of {number, title, desc})</span></label>
                <textarea wire:model="values.home_steps" rows="6"
                          class="w-full rounded-xl border border-white/10 bg-surface-2 px-3 py-2 font-mono text-xs focus:border-accent focus:outline-none"></textarea>
            </div>
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
                @if ($ogImageUrl)
                    <div class="mb-2 flex items-center gap-3">
                        <img src="{{ $ogImageUrl }}" class="h-16 rounded bg-surface-2 object-contain">
                        <button type="button" wire:click="removeImage('seo_og_image')" wire:confirm="Remove the OG image?"
                                class="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted hover:text-accent-soft transition-colors">Remove</button>
                    </div>
                @endif
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

            {{-- App access toggle --}}
            <div class="rounded-xl border border-white/5 bg-surface-2 p-4">
                <div class="flex items-center justify-between gap-4">
                    <div>
                        <p class="font-semibold">App access</p>
                        <p class="mt-0.5 text-sm text-muted">When disabled, all app routes redirect to the landing page. Admin panel stays accessible. Use this to run the app in Android-only mode.</p>
                    </div>
                    <label class="relative inline-flex shrink-0 cursor-pointer items-center">
                        <input type="checkbox" wire:model="values.app_enabled" class="peer sr-only">
                        <div class="peer h-6 w-11 rounded-full bg-white/10 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-accent peer-checked:after:translate-x-full"></div>
                    </label>
                </div>
                @unless($values['app_enabled'] ?? true)
                    <p class="mt-2 text-xs font-semibold text-accent-soft">⚠ App is currently closed — web users will see the landing page.</p>
                @endunless
            </div>

            <p class="text-sm font-semibold text-muted">Admin password</p>
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
