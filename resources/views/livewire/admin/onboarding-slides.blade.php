<div>
    <div class="mb-6 flex items-center justify-between">
        <h1 class="text-2xl font-bold">Onboarding story</h1>
        <div class="flex items-center gap-3">
            @if ($savedMessage)<span class="text-sm font-semibold text-success">{{ $savedMessage }}</span>@endif
            <button wire:click="addSlide" class="rounded-xl bg-surface px-4 py-2.5 text-sm font-semibold tap">Add slide</button>
        </div>
    </div>

    <div class="grid gap-6 lg:grid-cols-3 items-start">
        {{-- Left column: Editor cards --}}
        <div class="lg:col-span-2 space-y-4">
            <form wire:submit="save" class="space-y-4">
                @foreach ($rows as $i => $row)
                    <div wire:key="slide-{{ $row['id'] }}" 
                         wire:click="setPreviewIndex({{ $i }})"
                         class="grid gap-4 rounded-2xl p-5 md:grid-cols-3 transition-all duration-300 border cursor-pointer {{ $previewIndex === $i ? 'bg-surface border-accent shadow-lg shadow-accent/5' : 'bg-surface-2/40 border-white/5 opacity-80 hover:opacity-100 hover:border-white/10' }}">
                        
                        <div class="md:col-span-2 space-y-3">
                            <div class="flex gap-2">
                                <input type="number" wire:model="rows.{{ $i }}.sort_order" wire:focus="setPreviewIndex({{ $i }})" class="h-10 w-14 rounded-lg border border-white/10 bg-surface-2 px-2 focus:border-accent focus:outline-none" title="Order">
                                <input wire:model="rows.{{ $i }}.title" wire:focus="setPreviewIndex({{ $i }})" placeholder="Title" class="h-10 flex-1 rounded-lg border border-white/10 bg-surface-2 px-2 focus:border-accent focus:outline-none">
                            </div>
                            <textarea wire:model="rows.{{ $i }}.body" wire:focus="setPreviewIndex({{ $i }})" rows="3" placeholder="Body" class="w-full rounded-lg border border-white/10 bg-surface-2 px-2 py-2 focus:border-accent focus:outline-none"></textarea>
                            <div class="flex gap-2">
                                <input wire:model="rows.{{ $i }}.cta_label" wire:focus="setPreviewIndex({{ $i }})" placeholder="Button label" class="h-10 flex-1 rounded-lg border border-white/10 bg-surface-2 px-2 focus:border-accent focus:outline-none">
                            </div>
                        </div>

                        <div class="flex flex-col justify-between space-y-2">
                            {{-- Custom Visual Thumbnail --}}
                            <div class="relative flex items-center justify-center rounded-xl bg-surface-2 h-32 overflow-hidden border border-white/5">
                                <div class="scale-50 transform origin-center">
                                    <x-onboarding-visual :index="$i" />
                                </div>
                            </div>
                            
                            <div class="flex items-center justify-between pt-1">
                                <label class="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" wire:model="rows.{{ $i }}.is_active" class="h-5 w-5 accent-[var(--c-accent)]"> 
                                    <span class="text-sm">Active</span>
                                </label>
                                <button type="button" wire:click="delete({{ $row['id'] }})" wire:confirm="Delete slide?" class="text-xs text-muted hover:text-accent-soft">Delete</button>
                            </div>
                        </div>
                    </div>
                @endforeach
                
                <div class="pt-2">
                    <button type="submit" class="w-full rounded-xl bg-accent px-6 py-3 font-bold text-white shadow-lg shadow-accent/15 tap">Save onboarding</button>
                </div>
            </form>
        </div>

        {{-- Right column: Interactive Sticky Phone Mockup --}}
        @if (isset($rows[$previewIndex]))
            @php($activeSlide = $rows[$previewIndex])
            <div class="sticky top-6 hidden lg:flex flex-col items-center">
                <div class="text-xs font-semibold tracking-wider text-muted uppercase mb-3">Live Onboarding Preview (Slide {{ $previewIndex + 1 }})</div>
                
                {{-- Phone Frame --}}
                <div class="relative w-[320px] h-[580px] rounded-[3rem] border-8 border-surface-2 bg-[#060810] shadow-2xl flex flex-col px-5 py-6 overflow-hidden">
                    {{-- Camera notch/pill --}}
                    <div class="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-4 rounded-full bg-surface-2 z-20"></div>
                    
                    {{-- Watermark behind glass --}}
                    <div class="absolute inset-0 z-0 overflow-hidden pointer-events-none opacity-5 flex items-center justify-center">
                        <span class="text-white text-6xl font-black rotate-90 uppercase tracking-widest">{{ app(\App\Services\SettingsService::class)->get('app_name') }}</span>
                    </div>

                    {{-- Progress Bars --}}
                    <div class="relative z-10 flex items-center gap-1.5 pt-1">
                        @foreach ($rows as $idx => $s)
                            <div class="h-1 flex-1 rounded-full {{ $idx <= $previewIndex ? 'bg-accent' : 'bg-white/10' }} transition-colors"></div>
                        @endforeach
                        <span class="ml-1 text-[10px] text-muted">Skip</span>
                    </div>

                    {{-- Animation visual area --}}
                    <div class="relative z-10 flex-1 flex items-center justify-center py-4">
                        <x-onboarding-visual :index="$previewIndex" />
                    </div>

                    {{-- Onboarding text --}}
                    <div class="relative z-10 text-center space-y-2 mb-6">
                        <h2 class="text-xl font-extrabold leading-tight text-white">{{ $activeSlide['title'] ?: 'Untitled Slide' }}</h2>
                        <p class="text-xs leading-relaxed text-muted">{{ $activeSlide['body'] ?: 'No description text provided.' }}</p>
                    </div>

                    {{-- Next/CTA button --}}
                    <div class="relative z-10 flex gap-2">
                        @if ($previewIndex > 0 && $previewIndex < count($rows) - 1)
                            <div class="h-11 flex items-center justify-center rounded-xl bg-surface px-4 text-xs font-semibold text-white border border-white/5">Back</div>
                        @endif
                        <div class="h-11 flex-1 flex items-center justify-center rounded-xl bg-accent text-bg text-xs font-bold shadow-lg shadow-accent/10">
                            {{ $activeSlide['cta_label'] ?: ($previewIndex >= count($rows) - 1 ? 'Get Started' : 'Next') }}
                        </div>
                    </div>
                </div>
            </div>
        @endif
    </div>
</div>
