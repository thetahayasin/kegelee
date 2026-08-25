<div x-data="{ tab: 'branding' }">
    <div class="mb-6 flex items-center justify-between">
        <h1 class="text-2xl font-bold">Settings</h1>
        @if ($savedMessage)<span class="rounded-lg bg-success/15 px-3 py-1.5 text-sm font-semibold text-success">{{ $savedMessage }}</span>@endif
    </div>

    {{-- Tabs --}}
    <div class="mb-6 flex flex-wrap gap-2">
        @foreach (['branding' => 'Branding', 'email' => 'Email', 'google' => 'Google login', 'revenuecat' => 'RevenueCat & Billing', 'homepage' => 'Homepage', 'seo' => 'SEO', 'code' => 'Code injection', 'security' => 'Security'] as $key => $label)
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
                <label class="mb-1 block text-sm text-muted">Email accent colour</label>
                <input type="color" wire:model="values.color_accent" class="h-11 w-24 rounded-xl border border-white/10 bg-surface-2 px-1">
                <p class="mt-1 text-xs text-muted">Used in the subscription emails. The app's own colours are built in.</p>
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
                    @error('logoUpload')<p class="mt-1 text-sm text-red-400">{{ $message }}</p>@enderror
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
                    @error('faviconUpload')<p class="mt-1 text-sm text-red-400">{{ $message }}</p>@enderror
                </div>
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

            {{-- Send a test using the values in the form (no save needed). --}}
            <div class="md:col-span-2 flex flex-wrap items-center gap-3 border-t border-white/5 pt-4">
                <button type="button" wire:click="testSmtp" wire:loading.attr="disabled" wire:target="testSmtp"
                        class="rounded-xl bg-surface-2 px-5 py-2.5 text-sm font-semibold tap disabled:opacity-60">
                    <span wire:loading.remove wire:target="testSmtp">Send test email</span>
                    <span wire:loading wire:target="testSmtp">Sending&hellip;</span>
                </button>
                <span class="text-xs text-muted">Sends to {{ auth()->user()->email }} using the values above.</span>
                @if ($smtpMessage)
                    <p wire:loading.remove wire:target="testSmtp"
                       class="w-full text-sm font-medium {{ $smtpOk ? 'text-success' : 'text-red-400' }}">{{ $smtpMessage }}</p>
                @endif
            </div>
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

        {{-- REVENUECAT & BILLING --}}
        <div x-show="tab === 'revenuecat'" class="space-y-4 rounded-2xl bg-surface p-5">
            <label class="flex items-center gap-3">
                <input type="checkbox" wire:model="values.revenuecat_enabled" class="h-5 w-5 accent-[var(--c-accent)]">
                <span>Enable RevenueCat In-App Subscriptions</span>
            </label>

            <p class="text-sm text-muted">
                RevenueCat manages in-app purchases across iOS &amp; Android. Configure your Products, Offerings (<code class="text-content">default</code>), and Entitlement (<code class="text-content">premium</code>) in the RevenueCat dashboard.
            </p>

            <div class="grid gap-4 md:grid-cols-2">
                <div>
                    <label class="mb-1 block text-sm text-muted">RevenueCat Secret API Key (V1/V2)</label>
                    <input type="password" wire:model="values.revenuecat_api_key" autocomplete="new-password"
                           placeholder="sk_..."
                           class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 font-mono text-sm focus:border-accent focus:outline-none">
                    <p class="mt-1 text-xs text-muted">Used server-side to verify entitlements with RevenueCat REST API.</p>
                </div>

                <div>
                    <label class="mb-1 block text-sm text-muted">Webhook Authorization Header Secret</label>
                    <input wire:model="values.revenuecat_webhook_secret"
                           placeholder="your_custom_webhook_secret"
                           class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 font-mono text-sm focus:border-accent focus:outline-none">
                    <p class="mt-1 text-xs text-muted">Value set in RevenueCat Dashboard &rarr; Integrations &rarr; Webhooks &rarr; Authorization Header.</p>
                    @if (trim((string) ($values['revenuecat_webhook_secret'] ?? '')) === '')
                        {{-- The webhook creates subscriptions from its request body, so it
                             refuses to process anything until this is set. Renewals,
                             cancellations and expiries will NOT reach the app before then. --}}
                        <p class="mt-2 rounded-lg border border-accent/40 bg-accent/10 p-2 text-xs leading-relaxed">
                            <strong>Not set - subscription webhooks are being rejected.</strong>
                            RevenueCat events (renewals, cancellations, expiries) are refused with a 503
                            until this secret is set here <em>and</em> in the RevenueCat dashboard.
                            RevenueCat retries, so nothing is lost once both sides match.
                        </p>
                    @endif
                </div>

                <div>
                    <label class="mb-1 block text-sm text-muted">Android Public SDK Key</label>
                    <input wire:model="values.revenuecat_android_public_sdk_key"
                           placeholder="goog_..."
                           class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 font-mono text-sm focus:border-accent focus:outline-none">
                </div>

                <div>
                    <label class="mb-1 block text-sm text-muted">iOS Public SDK Key</label>
                    <input wire:model="values.revenuecat_ios_public_sdk_key"
                           placeholder="appl_..."
                           class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 font-mono text-sm focus:border-accent focus:outline-none">
                </div>
            </div>

            <div class="rounded-xl border border-white/10 bg-surface-2 p-4 text-sm text-muted">
                <p class="font-semibold text-content">RevenueCat Webhook URL</p>
                <p class="mt-1 font-mono text-xs break-all text-accent">{{ url('/webhooks/revenuecat') }}</p>
                <p class="mt-2">Paste this URL into RevenueCat Dashboard &rarr; Project Settings &rarr; Integrations &rarr; Webhooks.</p>
            </div>

            <div>
                <label class="mb-1 block text-sm text-muted">Entitlement Identifier</label>
                <input wire:model="values.revenuecat_entitlement_id"
                       placeholder="premium"
                       class="h-11 w-48 rounded-xl border border-white/10 bg-surface-2 px-3 font-mono text-sm focus:border-accent focus:outline-none">
                <p class="mt-1 text-xs text-muted">Default is <code>premium</code>.</p>
            <div class="rounded-xl border border-white/10 bg-surface-2 p-4 text-sm text-muted">
                <p class="font-semibold text-content">Subscription products</p>
                <p class="mt-1">The plans are fixed in code. Create a subscription product in your Play Console / App Store Connect
                    for each <span class="text-content">Product ID</span> below (base plan price shown for reference).</p>
                <table class="mt-3 w-full text-left text-xs">
                    <thead>
                        <tr class="text-muted">
                            <th class="pb-1.5 font-medium">Plan</th>
                            <th class="pb-1.5 font-medium">Price</th>
                            <th class="pb-1.5 font-medium">Product ID (use this in Store Console)</th>
                        </tr>
                    </thead>
                    <tbody class="text-content">
                        @foreach (\App\Models\Plan::where('is_active', true)->orderBy('sort_order')->get() as $plan)
                            <tr class="border-t border-white/5">
                                <td class="py-2">{{ $plan->name }}</td>
                                <td class="py-2">${{ number_format($plan->price, 2) }}</td>
                                <td class="py-2 font-mono">{{ $plan->store_product_id }}</td>
                            </tr>
                        @endforeach
                    </tbody>
                </table>
            </div>
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
                    <p class="mt-2 text-xs font-semibold text-accent-soft">⚠ App is currently closed: web users will see the landing page.</p>
                @endunless
            </div>

            {{-- Admin login email --}}
            <p class="text-sm font-semibold text-muted">Admin email</p>
            <p class="text-xs text-muted">The address you sign in with (and where password-reset codes are sent).</p>
            <div><label class="mb-1 block text-sm text-muted">Email address</label>
                <input type="email" wire:model="adminEmail" autocomplete="username" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                @error('adminEmail') <p class="mt-1 text-xs text-red-400">{{ $message }}</p> @enderror</div>
            <div><label class="mb-1 block text-sm text-muted">Current password</label>
                <input type="password" wire:model="emailCurrentPassword" autocomplete="current-password" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                @error('emailCurrentPassword') <p class="mt-1 text-xs text-red-400">{{ $message }}</p> @enderror</div>
            <button type="button" wire:click="changeAdminEmail" class="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold tap">
                <span wire:loading.remove wire:target="changeAdminEmail">Update email</span>
                <span wire:loading wire:target="changeAdminEmail">Updating...</span>
            </button>
            @if ($emailMessage) <p class="text-sm font-semibold text-success">{{ $emailMessage }}</p> @endif

            <hr class="border-white/5">

            <p class="text-sm font-semibold text-muted">Admin password</p>
            <div><label class="mb-1 block text-sm text-muted">Current password</label>
                <input type="password" wire:model="currentPassword" autocomplete="current-password" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                @error('currentPassword') <p class="mt-1 text-xs text-red-400">{{ $message }}</p> @enderror</div>
            <div><label class="mb-1 block text-sm text-muted">New password</label>
                <input type="password" wire:model="adminNewPassword" autocomplete="new-password" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                @error('adminNewPassword') <p class="mt-1 text-xs text-red-400">{{ $message }}</p> @enderror</div>
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
