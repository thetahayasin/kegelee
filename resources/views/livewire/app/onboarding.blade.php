<div class="min-h-[100dvh] flex flex-col px-6 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
     x-data="{
         index: @entangle('index').live,
         slides: [],
         init() {
             this.slides = @js($this->slides->values()->all());
         }
     }">
    {{-- Top bar: progress + Sign In --}}
    <div class="flex items-center justify-between gap-4 pt-2">
        <div class="flex flex-1 items-center gap-1.5">
            <template x-for="(s, i) in slides" :key="s.id || i">
                <div class="h-1.5 flex-1 rounded-full transition-colors"
                     :class="i <= index ? 'bg-accent' : 'bg-white/10'"></div>
            </template>
        </div>
        @guest
            <button wire:click="showLogin" class="text-sm font-semibold text-accent tap">Sign In</button>
        @endguest
    </div>

    {{-- Slide visual & copy --}}
    <div class="flex flex-1 flex-col animate-slide-up mt-4">
        {{-- Large visual --}}
        <div class="grid flex-1 place-items-center">
            <div x-show="index === 0" class="w-full h-full flex items-center justify-center"><x-onboarding-visual index="0" /></div>
            <div x-show="index === 1" class="w-full h-full flex items-center justify-center"><x-onboarding-visual index="1" /></div>
            <div x-show="index === 2" class="w-full h-full flex items-center justify-center"><x-onboarding-visual index="2" /></div>
            <div x-show="index === 3" class="w-full h-full flex items-center justify-center"><x-onboarding-visual index="3" /></div>
        </div>

        {{-- Copy --}}
        <div class="space-y-3 pb-6 text-center" x-show="slides[index]">
            <h1 class="text-3xl font-bold leading-tight text-white" x-text="slides[index] ? slides[index].title : ''"></h1>
            <p class="leading-relaxed text-muted text-sm" x-text="slides[index] ? slides[index].body : ''"></p>
        </div>
    </div>

    {{-- CTA --}}
    <div class="flex items-center gap-3">
        <button x-show="index > 0 && index < (slides.length - 1)"
                @click="index = Math.max(0, index - 1)"
                class="h-14 rounded-2xl bg-surface px-5 text-content tap">Back</button>
        <button @click="if (index >= slides.length - 1) { $wire.finish(); } else { index = Math.min(slides.length - 1, index + 1); }"
                class="h-14 flex-1 rounded-2xl bg-accent text-base font-semibold tap text-white"
                x-text="slides[index] ? (slides[index].cta_label || (index === slides.length - 1 ? 'Get Started' : 'Next')) : 'Next'">
        </button>
    </div>

    {{-- Bottom-sheet auth modal --}}
    @if ($showAuthModal)
        <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/70 transition-opacity duration-300"
             x-data="{ show: false }"
             x-init="$nextTick(() => show = true)">

            {{-- Backdrop click to close --}}
            <div class="absolute inset-0" wire:click="closeAuthModal"></div>

            {{-- Sheet panel --}}
            <div class="relative w-full max-w-[440px] rounded-t-[2.5rem] bg-surface border-t border-white/10 p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl z-10"
                 x-show="show"
                 x-transition:enter="transform transition-transform ease-out duration-300"
                 x-transition:enter-start="translate-y-full"
                 x-transition:enter-end="translate-y-0"
                 x-transition:leave="transform transition-transform ease-in duration-200"
                 x-transition:leave-start="translate-y-0"
                 x-transition:leave-end="translate-y-full">

                {{-- Drag handle --}}
                <div class="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/10"></div>

                @if ($authMode === 'options')
                    {{-- Close button (options view) --}}
                    <button wire:click="closeAuthModal" class="absolute top-4 right-4 grid h-8 w-8 place-items-center rounded-full bg-white/5 hover:bg-white/10 text-muted tap" aria-label="Close">
                        <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>

                    {{-- Options View --}}
                    <div class="mt-2 space-y-3">
                        <button wire:click="showRegister" class="flex h-14 w-full items-center justify-center rounded-2xl bg-accent font-bold text-white shadow-lg shadow-accent/15 tap">
                            Sign Up
                        </button>
                        <button wire:click="showLogin" class="flex h-14 w-full items-center justify-center rounded-2xl bg-surface font-semibold text-content border border-white/5 tap">
                            Log In
                        </button>

                        @if ($this->googleEnabled)
                            <div class="flex items-center gap-3 py-1">
                                <div class="h-px flex-1 bg-white/10"></div>
                                <span class="text-xs text-muted">or</span>
                                <div class="h-px flex-1 bg-white/10"></div>
                            </div>
                            <a href="{{ route('auth.google') }}"
                               class="flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-white font-semibold text-[#1f1f1f] tap">
                                <svg viewBox="0 0 24 24" class="h-5 w-5"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
                                Continue with Google
                            </a>
                        @endif
                    </div>

                @elseif ($authMode === 'login')
                    {{-- Login View --}}
                    <div class="space-y-4">
                        <div class="flex items-center justify-between gap-3">
                            <h2 class="text-xl font-bold text-white">Login</h2>
                            <button wire:click="closeAuthModal" class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/5 hover:bg-white/10 text-muted tap" aria-label="Close">
                                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                            </button>
                        </div>

                        <form wire:submit="login" class="space-y-4" autocomplete="on">
                            <div>
                                <label for="login-email" class="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Email Address</label>
                                <input type="email" id="login-email" name="login-email" autocomplete="email" wire:model="email" class="h-12 w-full rounded-xl bg-surface-2 border border-white/5 px-4 text-sm text-content focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all" placeholder="name@example.com" required>
                                @error('email') <span class="text-xs text-accent-soft mt-1 block">{{ $message }}</span> @enderror
                            </div>

                            <div>
                                <div class="flex items-center justify-between mb-1.5">
                                    <label for="login-password" class="block text-xs font-semibold text-muted uppercase tracking-wider">Password</label>
                                    <a href="{{ route('password.forgot') }}" wire:navigate class="text-xs font-semibold text-accent tap">Forgot password?</a>
                                </div>
                                <input type="password" id="login-password" name="login-password" autocomplete="current-password" wire:model="password" class="h-12 w-full rounded-xl bg-surface-2 border border-white/5 px-4 text-sm text-content focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all" placeholder="••••••••" required>
                                @error('password') <span class="text-xs text-accent-soft mt-1 block">{{ $message }}</span> @enderror
                            </div>

                            <button type="submit" wire:loading.attr="disabled" wire:target="login"
                                    class="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent font-bold text-white shadow-lg shadow-accent/15 tap mt-2 disabled:opacity-70">
                                <svg wire:loading wire:target="login" class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" class="opacity-25"/><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>
                                <span wire:loading.remove wire:target="login">Log In</span>
                                <span wire:loading wire:target="login">Logging in...</span>
                            </button>
                        </form>

                        @if ($this->googleEnabled)
                            <div class="flex items-center gap-3 py-1">
                                <div class="h-px flex-1 bg-white/10"></div>
                                <span class="text-xs text-muted">or</span>
                                <div class="h-px flex-1 bg-white/10"></div>
                            </div>
                            <a href="{{ route('auth.google') }}"
                               class="flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-white font-semibold text-[#1f1f1f] tap">
                                <svg viewBox="0 0 24 24" class="h-5 w-5"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
                                Continue with Google
                            </a>
                        @endif

                        <div class="flex justify-center pt-1 text-sm">
                            <button wire:click="showRegister" class="text-accent font-semibold tap">Don't have an account? Sign Up</button>
                        </div>
                    </div>

                @elseif ($authMode === 'register')
                    {{-- Register View --}}
                    <div class="space-y-4">
                        <div class="flex items-center justify-between gap-3">
                            <h2 class="text-xl font-bold text-white">Sign Up</h2>
                            <button wire:click="closeAuthModal" class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/5 hover:bg-white/10 text-muted tap" aria-label="Close">
                                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                            </button>
                        </div>

                        <form wire:submit="register" class="space-y-4" autocomplete="on">
                            <div>
                                <label for="register-name" class="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Full Name</label>
                                <input type="text" id="register-name" name="register-name" autocomplete="name" wire:model="name" class="h-12 w-full rounded-xl bg-surface-2 border border-white/5 px-4 text-sm text-content focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all" placeholder="Your Name" required>
                                @error('name') <span class="text-xs text-accent-soft mt-1 block">{{ $message }}</span> @enderror
                            </div>

                            <div>
                                <label for="register-email" class="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Email Address</label>
                                <input type="email" id="register-email" name="register-email" autocomplete="email" wire:model="email" class="h-12 w-full rounded-xl bg-surface-2 border border-white/5 px-4 text-sm text-content focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all" placeholder="name@example.com" required>
                                @error('email') <span class="text-xs text-accent-soft mt-1 block">{{ $message }}</span> @enderror
                            </div>

                            <div>
                                <label for="register-password" class="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Password</label>
                                <input type="password" id="register-password" name="register-password" autocomplete="new-password" wire:model="password" class="h-12 w-full rounded-xl bg-surface-2 border border-white/5 px-4 text-sm text-content focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all" placeholder="Min. 6 characters" required>
                                @error('password') <span class="text-xs text-accent-soft mt-1 block">{{ $message }}</span> @enderror
                            </div>

                            <div>
                                <label for="register-password-confirm" class="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Confirm Password</label>
                                <input type="password" id="register-password-confirm" name="register-password-confirm" autocomplete="new-password" wire:model="password_confirmation" class="h-12 w-full rounded-xl bg-surface-2 border border-white/5 px-4 text-sm text-content focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all" placeholder="Repeat your password" required>
                                @error('password_confirmation') <span class="text-xs text-accent-soft mt-1 block">{{ $message }}</span> @enderror
                            </div>

                            <button type="submit" wire:loading.attr="disabled" wire:target="register"
                                    class="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent font-bold text-white shadow-lg shadow-accent/15 tap mt-2 disabled:opacity-70">
                                <svg wire:loading wire:target="register" class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" class="opacity-25"/><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>
                                <span wire:loading.remove wire:target="register">Create Account</span>
                                <span wire:loading wire:target="register">Creating account...</span>
                            </button>
                        </form>

                        @if ($this->googleEnabled)
                            <div class="flex items-center gap-3 py-1">
                                <div class="h-px flex-1 bg-white/10"></div>
                                <span class="text-xs text-muted">or</span>
                                <div class="h-px flex-1 bg-white/10"></div>
                            </div>
                            <a href="{{ route('auth.google') }}"
                               class="flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-white font-semibold text-[#1f1f1f] tap">
                                <svg viewBox="0 0 24 24" class="h-5 w-5"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
                                Continue with Google
                            </a>
                        @endif

                        <div class="flex justify-center pt-1 text-sm">
                            <button wire:click="showLogin" class="text-accent font-semibold tap">Already have an account? Log In</button>
                        </div>
                    </div>
                @endif
            </div>
        </div>
    @endif
</div>
