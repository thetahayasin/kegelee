{{--
    The public account-deletion page.

    Reachable with no app installed and no session, because that is exactly the
    person Google Play requires it for: somebody who uninstalled the app and
    still wants their data gone.
--}}
<x-layouts.page title="Delete your account">
    @php($appName = app(\App\Services\SettingsService::class)->get('app_name', 'Kegel Trainer'))

    <h1 class="text-2xl font-bold">Delete your account</h1>
    <p class="mt-1 text-sm text-muted">
        This permanently erases your {{ $appName }} account and everything stored against it.
        You do not need the app installed to do it.
    </p>

    <div class="mt-6 rounded-2xl bg-surface p-5">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-muted">What gets deleted</h2>
        <ul class="mt-3 space-y-2 text-sm">
            <li>Your account, name, email address and password.</li>
            <li>Your training history: sessions, training days, levels and streaks.</li>
            <li>Your measurements and progress records.</li>
            <li>Your reminders and completed lessons.</li>
            <li>Your subscription records held by us, and any pending sign-in codes.</li>
        </ul>

        <h2 class="mt-6 text-sm font-semibold uppercase tracking-wide text-muted">What we keep</h2>
        <p class="mt-3 text-sm">
            One anonymous row counting the deletion itself: the date, how many days the account
            existed, how many sessions it recorded, and whether it was subscribed. It carries no
            name, no email and nothing that could be traced back to you.
        </p>

        <h2 class="mt-6 text-sm font-semibold uppercase tracking-wide text-muted">Your subscription</h2>
        <p class="mt-3 text-sm">
            Google Play, not us, bills and cancels subscriptions. Deleting your account here does
            not cancel an active subscription and does not refund it. Cancel it first in the
            Play Store under <span class="font-medium">Payments &amp; subscriptions &rarr; Subscriptions</span>.
        </p>
    </div>

    <div class="mt-6 rounded-2xl bg-surface p-5">
        @if (! $email)
            {{-- Step one: who is asking. --}}
            <h2 class="text-base font-semibold">Step 1 of 2 &middot; Confirm it is you</h2>
            <p class="mt-1 text-sm text-muted">
                Enter the email address on the account. We will send it a six-digit confirmation code.
            </p>

            <form method="POST" action="{{ route('account.delete.code') }}" class="mt-5 space-y-4">
                @csrf
                <div>
                    <label for="email" class="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">Email</label>
                    <input id="email" name="email" type="email" required autocomplete="email"
                           value="{{ old('email') }}"
                           class="h-11 w-full rounded-xl border border-white/10 bg-white/4 px-4 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors"
                           placeholder="you@example.com">
                    @error('email') <p class="mt-1.5 text-xs text-red-400">{{ $message }}</p> @enderror
                </div>
                <button type="submit"
                        class="grid h-11 w-full place-items-center rounded-xl text-sm font-semibold tap transition-opacity hover:opacity-90"
                        style="background:var(--c-accent);color:#0c1a00">
                    Send confirmation code
                </button>
            </form>
        @else
            {{-- Step two: the code, and the irreversible button. --}}
            <h2 class="text-base font-semibold">Step 2 of 2 &middot; Confirm deletion</h2>
            <p class="mt-1 text-sm text-muted">
                If <span class="font-medium text-content">{{ $email }}</span> has an account, a
                six-digit code is on its way. Enter it below to delete the account for good.
            </p>

            <form method="POST" action="{{ route('account.delete.destroy') }}" class="mt-5 space-y-4">
                @csrf
                <div>
                    <label for="code" class="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">Confirmation code</label>
                    <input id="code" name="code" type="text" required inputmode="numeric"
                           pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code"
                           class="h-11 w-full rounded-xl border border-white/10 bg-white/4 px-4 text-sm tracking-[0.4em] focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors"
                           placeholder="000000">
                    @error('code') <p class="mt-1.5 text-xs text-red-400">{{ $message }}</p> @enderror
                </div>

                <p class="rounded-xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-xs text-red-300">
                    This cannot be undone. Your training history cannot be restored afterwards,
                    by you or by us.
                </p>

                <button type="submit"
                        class="grid h-11 w-full place-items-center rounded-xl text-sm font-semibold text-white tap transition-opacity hover:opacity-90"
                        style="background:var(--c-danger)">
                    Permanently delete my account
                </button>
            </form>

            <form method="POST" action="{{ route('account.delete.code') }}" class="mt-3">
                @csrf
                <input type="hidden" name="email" value="{{ $email }}">
                <button type="submit" class="text-xs text-muted transition-colors hover:text-content tap">
                    Send a new code
                </button>
            </form>
        @endif
    </div>

    <p class="mt-6 text-center text-xs text-muted">
        You can also delete your account inside the app, under Profile &rarr; Delete account.
        Questions about your data are answered in our
        <a href="{{ route('legal.index') }}" class="underline hover:text-content">privacy policy</a>.
    </p>
</x-layouts.page>
