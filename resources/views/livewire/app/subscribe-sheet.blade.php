<div>
@guest
    {{-- Sticky subscribe bar (funnel on the knowledge pages; hidden on
         onboarding, which opens the sheet from its own final CTA). --}}
    @if ($showBar)
        @unless ($showSheet)
            <div class="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[440px] border-t border-white/10 bg-bg/80 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur-xl">
                <button type="button" wire:click="open"
                        class="grid h-14 w-full place-items-center rounded-2xl bg-accent font-bold text-white shadow-lg shadow-accent/20 tap">
                    Subscribe
                </button>
            </div>
        @endunless
    @endif

    {{-- Bottom sheet --}}
    @if ($showSheet)
        <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
             x-data="{
                 _backOff: null,
                 init() { this._backOff = window.appBack?.register(() => this.$wire.close()); },
                 destroy() { if (this._backOff) { this._backOff(); this._backOff = null; } },
             }">
            {{-- Backdrop --}}
            <div class="absolute inset-0" wire:click="close"></div>

            {{-- Sheet panel --}}
            <div class="modal-panel relative z-10 w-full max-w-[440px] rounded-t-[2.5rem] border-t border-white/10 bg-surface p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl animate-[slide-up_300ms_ease]">
                <div class="mx-auto mb-5 h-1.5 w-12 rounded-full bg-white/10"></div>

                {{-- Plans step --}}
                @if ($step === 'plans')
                    <div class="flex items-start justify-between gap-3">
                        <h2 class="text-xl font-bold leading-snug">Start your transformation journey now</h2>
                        <button type="button" wire:click="close" class="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/5 text-muted tap" aria-label="Close">
                            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                        </button>
                    </div>

                    <div class="mt-4 space-y-2.5">
                        @foreach ($plans as $plan)
                            @php($sel = (int) $selectedPlan === (int) $plan->id)
                            @php($intervalLabel = match(true) {
                                $plan->interval === 'lifetime' => '',
                                $plan->interval === 'year'     => '/year',
                                $plan->interval === 'month' && $plan->interval_count === 3 => '/3 months',
                                $plan->interval === 'month'    => '/month',
                                $plan->interval === 'week'     => '/week',
                                default                        => '/'.$plan->interval,
                            })
                            <button type="button" wire:click="selectPlan({{ $plan->id }})"
                                    class="relative flex w-full items-center gap-3 rounded-2xl border-2 p-4 text-left tap transition-colors {{ $sel ? 'border-accent bg-accent/10' : 'border-white/10 bg-surface-2' }}">
                                {{-- Radio indicator --}}
                                <span class="grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 {{ $sel ? 'border-accent' : 'border-white/25' }}">
                                    @if ($sel)
                                        <span class="h-2.5 w-2.5 rounded-full bg-accent"></span>
                                    @endif
                                </span>
                                <div class="min-w-0 flex-1">
                                    <div class="flex items-center justify-between gap-2">
                                        <p class="font-bold">{{ $plan->name }}</p>
                                        <div class="shrink-0 text-right">
                                            <span class="text-lg font-bold">${{ number_format($plan->price, 2) }}</span>
                                            <span class="text-xs text-muted">{{ $intervalLabel }}</span>
                                        </div>
                                    </div>
                                    @if ($trialDays > 0)
                                        <p class="mt-1 text-xs font-semibold text-success">{{ $trialDays }}-day free trial</p>
                                    @endif
                                </div>
                                @if ($plan->is_featured)
                                    <span class="absolute -top-2.5 right-4 rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-bold uppercase text-white">Best value</span>
                                @endif
                            </button>
                        @endforeach
                    </div>

                    <button type="button" wire:click="selectAndProceed({{ $selectedPlan ?? 0 }})" @disabled(! $selectedPlan)
                            class="mt-5 grid h-14 w-full place-items-center rounded-2xl bg-accent font-bold text-white tap disabled:opacity-50">
                        Continue
                    </button>
                    <p class="mt-3 text-center text-[11px] leading-relaxed text-muted">
                        Payment is charged to your Google&nbsp;Play account on confirmation. Your subscription renews automatically at the price shown until you cancel it in Google&nbsp;Play; uninstalling the app does not cancel or refund it. By continuing you agree to our
                        <a href="{{ route('page.show', 'terms') }}" class="text-accent underline">Terms</a>
                        and the
                        <a href="https://play.google.com/about/play-terms/" target="_blank" rel="noopener" class="text-accent underline">Google&nbsp;Play Terms</a>.
                    </p>
                @endif

                {{-- Auth step --}}
                @if ($step === 'auth')
                    <div class="flex items-center gap-3 mb-4">
                        <button type="button" wire:click="$set('step', 'plans')" class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/5 text-muted tap" aria-label="Back">
                            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
                        </button>
                        <h2 class="text-lg font-bold">{{ $authMode === 'register' ? 'Create account' : 'Sign in' }}</h2>
                        <button type="button" wire:click="close" class="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/5 text-muted tap" aria-label="Close">
                            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                        </button>
                    </div>

                    @if ($purchasing)
                        <div class="flex flex-col items-center gap-4 py-8">
                            <svg class="h-8 w-8 animate-spin text-accent" viewBox="0 0 24 24" fill="none">
                                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                            </svg>
                            <p class="text-sm text-muted">Completing your purchase…</p>
                        </div>
                    @elseif ($authMode === 'register')
                        <form wire:submit="register" class="space-y-3">
                            <div>
                                <input type="text" wire:model="name" placeholder="Full name" autocomplete="name"
                                       class="h-12 w-full rounded-xl border border-white/5 bg-surface-2 px-4 text-sm focus:border-accent focus:outline-none">
                                @error('name') <p class="mt-1 text-xs text-accent-soft">{{ $message }}</p> @enderror
                            </div>
                            <div>
                                <input type="email" wire:model="email" placeholder="Email address" autocomplete="email"
                                       class="h-12 w-full rounded-xl border border-white/5 bg-surface-2 px-4 text-sm focus:border-accent focus:outline-none">
                                @error('email') <p class="mt-1 text-xs text-accent-soft">{{ $message }}</p> @enderror
                            </div>
                            <div>
                                <input type="password" wire:model="password" placeholder="Password (6+ characters, 1 number)" autocomplete="new-password"
                                       class="h-12 w-full rounded-xl border border-white/5 bg-surface-2 px-4 text-sm focus:border-accent focus:outline-none">
                                @error('password') <p class="mt-1 text-xs text-accent-soft">{{ $message }}</p> @enderror
                            </div>
                            <div>
                                <input type="password" wire:model="password_confirmation" placeholder="Confirm password" autocomplete="new-password"
                                       class="h-12 w-full rounded-xl border border-white/5 bg-surface-2 px-4 text-sm focus:border-accent focus:outline-none">
                                @error('password_confirmation') <p class="mt-1 text-xs text-accent-soft">{{ $message }}</p> @enderror
                            </div>
                            @if ($message && ! $errors->any())
                                <p class="text-sm text-accent-soft">{{ $message }}</p>
                            @endif
                            <button type="submit" class="grid h-14 w-full place-items-center rounded-2xl bg-accent font-bold text-white tap">
                                <span wire:loading.remove wire:target="register">Create account &amp; subscribe</span>
                                <span wire:loading wire:target="register">Creating account…</span>
                            </button>
                        </form>
                        @if ($this->googleEnabled)
                            <div class="my-3 flex items-center gap-3">
                                <div class="h-px flex-1 bg-white/10"></div>
                                <span class="text-xs text-muted">or</span>
                                <div class="h-px flex-1 bg-white/10"></div>
                            </div>
                            <a wire:click="continueWithGoogle" role="button"
                               class="flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-white font-semibold text-[#1f1f1f] tap">
                                <svg viewBox="0 0 24 24" class="h-5 w-5"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
                                Continue with Google
                            </a>
                        @endif
                        <div class="mt-3 text-center text-sm">
                            <button wire:click="switchAuth('login')" class="text-accent font-semibold tap">Already have an account? Sign in</button>
                        </div>
                    @else
                        <form wire:submit="login" class="space-y-3">
                            <div>
                                <input type="email" wire:model="email" placeholder="Email address" autocomplete="email"
                                       class="h-12 w-full rounded-xl border border-white/5 bg-surface-2 px-4 text-sm focus:border-accent focus:outline-none">
                                @error('email') <p class="mt-1 text-xs text-accent-soft">{{ $message }}</p> @enderror
                            </div>
                            <div>
                                <input type="password" wire:model="password" placeholder="Password" autocomplete="current-password"
                                       class="h-12 w-full rounded-xl border border-white/5 bg-surface-2 px-4 text-sm focus:border-accent focus:outline-none">
                                @error('password') <p class="mt-1 text-xs text-accent-soft">{{ $message }}</p> @enderror
                            </div>
                            @if ($message && ! $errors->any())
                                <p class="text-sm text-accent-soft">{{ $message }}</p>
                            @endif
                            <button type="submit" class="grid h-14 w-full place-items-center rounded-2xl bg-accent font-bold text-white tap">
                                <span wire:loading.remove wire:target="login">Sign in &amp; subscribe</span>
                                <span wire:loading wire:target="login">Signing in…</span>
                            </button>
                        </form>
                        @if ($this->googleEnabled)
                            <div class="my-3 flex items-center gap-3">
                                <div class="h-px flex-1 bg-white/10"></div>
                                <span class="text-xs text-muted">or</span>
                                <div class="h-px flex-1 bg-white/10"></div>
                            </div>
                            <a wire:click="continueWithGoogle" role="button"
                               class="flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-white font-semibold text-[#1f1f1f] tap">
                                <svg viewBox="0 0 24 24" class="h-5 w-5"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
                                Continue with Google
                            </a>
                        @endif
                        <div class="mt-3 text-center text-sm">
                            <button wire:click="switchAuth('register')" class="text-accent font-semibold tap">No account yet? Create one</button>
                        </div>
                    @endif
                @endif
            </div>
        </div>
    @endif
@endguest
</div>
