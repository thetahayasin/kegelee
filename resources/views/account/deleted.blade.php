<x-layouts.page title="Account deleted">
    <div class="mx-auto max-w-md py-10 text-center">
        <div class="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-surface-2">
            <svg viewBox="0 0 24 24" class="h-7 w-7 text-success" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 6L9 17l-5-5"/>
            </svg>
        </div>

        <h1 class="mt-5 text-2xl font-bold">Account deleted</h1>
        <p class="mt-2 text-sm text-muted">
            The account and everything stored against it have been erased. Nothing is left to
            sign in with, and there is nothing to restore.
        </p>
        <p class="mt-4 text-sm text-muted">
            If you had a subscription, cancel it in the Play Store under
            <span class="font-medium text-content">Payments &amp; subscriptions &rarr; Subscriptions</span>.
            Google handles billing, so it does not stop on its own.
        </p>

        <a href="{{ route('landing') }}"
           class="mt-7 inline-grid h-11 place-items-center rounded-xl px-6 text-sm font-semibold tap transition-opacity hover:opacity-90"
           style="background:var(--c-accent);color:#0c1a00">
            Back to home
        </a>
    </div>
</x-layouts.page>
