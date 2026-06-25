<div>
    <div class="mb-6 flex items-center justify-between">
        <div>
            <a href="{{ route('admin.exercises') }}" class="text-sm text-muted">← Exercises</a>
            <h1 class="text-2xl font-bold">{{ $exercise ? 'Edit '.$exercise->name : 'New exercise' }}</h1>
        </div>
        @if ($savedMessage)
            <span class="rounded-lg bg-success/15 px-3 py-1.5 text-sm font-semibold text-success">{{ $savedMessage }}</span>
        @endif
    </div>

    <form wire:submit="save" class="space-y-6">
        {{-- Basics --}}
        <div class="grid gap-4 rounded-2xl bg-surface p-5 md:grid-cols-2">
            <div class="md:col-span-2">
                <label class="mb-1 block text-sm text-muted">Name</label>
                <input wire:model="name" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                @error('name') <p class="mt-1 text-sm text-accent-soft">{{ $message }}</p> @enderror
            </div>
            <div class="md:col-span-2">
                <label class="mb-1 block text-sm text-muted">Description</label>
                <textarea wire:model="description" rows="2" class="w-full rounded-xl border border-white/10 bg-surface-2 px-3 py-2 focus:border-accent focus:outline-none"></textarea>
            </div>
            <div class="md:col-span-2">
                <label class="mb-1 block text-sm text-muted">Instructions</label>
                <textarea wire:model="instructions" rows="2" class="w-full rounded-xl border border-white/10 bg-surface-2 px-3 py-2 focus:border-accent focus:outline-none"></textarea>
            </div>
            <div>
                <label class="mb-1 block text-sm text-muted">Unlock after (training days)</label>
                <input type="number" wire:model="unlock_after_days" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                @error('unlock_after_days') <p class="mt-1 text-sm text-accent-soft">{{ $message }}</p> @enderror
            </div>
            <div>
                <label class="mb-1 block text-sm text-muted">Sort order</label>
                <input type="number" wire:model="sort_order" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
            </div>
            <div>
                <label class="mb-1 block text-sm text-muted">Min duration (s)</label>
                <input type="number" step="1" min="1" wire:model.live.debounce.300ms="min_duration" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                @error('min_duration') <p class="mt-1 text-sm text-accent-soft">{{ $message }}</p> @enderror
            </div>
            <div>
                <label class="mb-1 block text-sm text-muted">Max duration (s)</label>
                <input type="number" step="1" min="1" wire:model.live.debounce.300ms="max_duration" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                @error('max_duration') <p class="mt-1 text-sm text-accent-soft">{{ $message }}</p> @enderror
            </div>
            <div class="md:col-span-2 flex items-center gap-6 py-2">
                <label class="flex items-center gap-3 cursor-pointer"><input type="checkbox" wire:model="is_active" class="h-5 w-5 rounded accent-[var(--c-accent)]"> <span>Active (visible in app)</span></label>
            </div>
        </div>

        {{-- Circle rhythm: live preview beside its controls --}}
        @php($pr = ($circleSize - $trackWidth) / 2)
        @php($pcirc = round(2 * M_PI * $pr, 2))
        <div class="rounded-2xl bg-surface p-5" wire:ignore
             x-data="{
                 contract: {{ (float) $contract_seconds }},
                 relax: {{ (float) $relax_seconds }},
                 hold: {{ (float) $hold_seconds }},
                 duration: {{ $level1Duration }},
                 timeScale: {{ $timeScale }},
                 glowSpeed: {{ $glowSpeed }},
                 contractGlowMode: @js($contract_glow_mode ?: 'slowly'),
                 relaxGlowMode: @js($relax_glow_mode ?: 'slowly'),
                 startPhase: @js($start_phase ?? 'contract'),
                 contractLabel: @js($contract_label ?: 'Contract & hold'),
                 relaxLabel: @js($relax_label ?: 'Relax'),
                 fullHold: {{ $full_hold ? 'true' : 'false' }},
                 phase: @js($start_phase ?? 'contract'),
                 totalElapsed: 0, beatElapsed: 0, timer: null,
                 init() {
                     this.startTimer();
                     this.$wire.$watch('contract_seconds',   v => { this.contract = parseFloat(v) || 0.1; this.restart(); });
                     this.$wire.$watch('relax_seconds',      v => { this.relax = parseFloat(v) || 0; this.restart(); });
                     this.$wire.$watch('hold_seconds',       v => { this.hold = parseFloat(v) || 0; this.restart(); });
                     this.$wire.$watch('contract_glow_mode', v => { this.contractGlowMode = v || 'slowly'; this.restart(); });
                     this.$wire.$watch('relax_glow_mode',    v => { this.relaxGlowMode = v || 'slowly'; this.restart(); });
                     this.$wire.$watch('start_phase',        v => { this.startPhase = v; this.restart(); });
                     this.$wire.$watch('contract_label',     v => { this.contractLabel = v || 'Contract & hold'; });
                     this.$wire.$watch('relax_label',        v => { this.relaxLabel = v || 'Relax'; });
                     this.$wire.$watch('full_hold',          v => { this.fullHold = !!v; this.restart(); });
                     this.$wire.$watch('min_duration',       v => { this.duration = parseFloat(v) || 30; this.restart(); });
                 },
                 phaseDur(p) { return p === 'contract' ? this.contract : (p === 'hold' ? this.hold : this.relax); },
                 nextPhase(p) {
                     if (p === 'contract') return this.hold > 0 ? 'hold' : 'relax';
                     if (p === 'hold') return 'relax';
                     return 'contract';
                 },
                 startTimer() {
                     clearInterval(this.timer);
                     this.timer = setInterval(() => {
                         let dt = 0.05 * this.timeScale;
                         if (this.fullHold) {
                             this.phase = 'contract';
                             this.totalElapsed += dt;
                             if (this.totalElapsed >= this.duration) { this.totalElapsed = 0; }
                             return;
                         }
                         this.totalElapsed += dt;
                         let beatDur = this.phaseDur(this.phase);
                         if (beatDur <= 0) {
                             this.phase = this.nextPhase(this.phase);
                             this.beatElapsed = 0;
                         } else {
                             this.beatElapsed += dt;
                             if (this.beatElapsed >= beatDur) { this.beatElapsed = 0; this.phase = this.nextPhase(this.phase); }
                         }
                         if (this.totalElapsed >= this.duration) { this.totalElapsed = 0; this.beatElapsed = 0; this.phase = this.startPhase; }
                     }, 50);
                 },
                 restart() { clearInterval(this.timer); this.totalElapsed = 0; this.beatElapsed = 0; this.phase = this.fullHold ? 'contract' : this.startPhase; this.startTimer(); },
                 destroy() { clearInterval(this.timer); },
                 get isContract() { return this.phase === 'contract'; },
                 get blockPct() { return this.duration > 0 ? Math.min(1, this.totalElapsed / this.duration) : 0; },
                 get beatPct()  { let d = this.isContract ? this.contract : (this.relax || 1); return Math.min(1, this.beatElapsed / d); },
                 get remaining() { return Math.max(0, Math.ceil(this.duration - this.totalElapsed)); },
                 get label() { return this.phase === 'relax' ? this.relaxLabel : this.contractLabel; },
                 ease(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); },
                 get glowMode() { return this.phase === 'relax' ? this.relaxGlowMode : this.contractGlowMode; },
                 get intensity() {
                     if (this.fullHold || this.phase === 'hold') return 1;
                     if (this.glowMode === 'slowly') return this.ease(this.isContract ? this.beatPct : 1 - this.beatPct);
                     return this.isContract ? 1 : 0;
                 },
                 get glowOpacity() { return 0.08 + this.intensity * 0.92; },
                 get glowScale()   { return 0.58 + this.intensity * 0.42; },
                 get glowTransition() {
                     if (this.glowMode === 'slowly') return 'opacity 0.1s linear, transform 0.1s linear';
                     let d = this.glowMode === 'very_fast' ? Math.min(0.15, this.glowSpeed) : this.glowSpeed;
                     return 'opacity ' + d + 's ease-in-out, transform ' + d + 's ease-in-out';
                 },
             }" x-init="init()">

            <div class="mb-4 flex items-center justify-between">
                <h2 class="font-semibold">Circle rhythm</h2>
                <span class="text-xs text-muted">Live preview · Level 1</span>
            </div>

            <div class="grid items-start gap-8 lg:grid-cols-2">
                {{-- Live circle (pixel-identical to the app) --}}
                <div class="grid place-items-center" style="min-height: {{ round($circleSize * 1.7) }}px;">
                    <div class="relative grid place-items-center" style="width: {{ $circleSize }}px; height: {{ $circleSize }}px;">
                        @if ($glowEnabled)
                            <div class="contract-glow absolute left-1/2 top-1/2 rounded-full"
                                 style="width: {{ round($circleSize * 1.7) }}px; height: {{ round($circleSize * 1.7) }}px;"
                                 x-bind:style="{ opacity: glowOpacity, transform: 'translate(-50%, -50%) scale(' + glowScale + ')', transition: glowTransition }"></div>
                        @endif
                        <div class="relative grid place-items-center rounded-full bg-surface/80 ring-2 ring-white/15 [grid-area:1/1]"
                             style="width: {{ $circleSize }}px; height: {{ $circleSize }}px;">
                            <svg width="{{ $circleSize }}" height="{{ $circleSize }}" viewBox="0 0 {{ $circleSize }} {{ $circleSize }}" class="absolute -rotate-90">
                                <circle cx="{{ $circleSize / 2 }}" cy="{{ $circleSize / 2 }}" r="{{ $pr }}" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="{{ $trackWidth }}"/>
                                <circle cx="{{ $circleSize / 2 }}" cy="{{ $circleSize / 2 }}" r="{{ $pr }}" fill="none" stroke="#ffffff" stroke-width="{{ $trackWidth }}"
                                        stroke-linecap="round" stroke-dasharray="{{ $pcirc }}"
                                        x-bind:stroke-dashoffset="{{ $pcirc }} * (1 - blockPct)"
                                        style="transition: stroke-dashoffset {{ $animationSpeed }}s linear; filter: drop-shadow(0 0 3px rgba(255,255,255,0.5));"/>
                            </svg>
                            <div class="text-center">
                                <p class="text-5xl font-bold tabular-nums" x-text="remaining"></p>
                                <p class="mt-1 font-semibold" x-text="label"></p>
                            </div>
                        </div>
                    </div>
                </div>

                {{-- Controls (live: editing updates the circle as you type) --}}
                <div class="space-y-4">
                    <div class="grid gap-4 sm:grid-cols-3">
                        <div>
                            <label class="mb-1 block text-sm text-muted">Contract (s)</label>
                            <input type="number" step="0.1" min="0.1" wire:model.live.debounce.300ms="contract_seconds" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                            @error('contract_seconds') <p class="mt-1 text-sm text-accent-soft">{{ $message }}</p> @enderror
                        </div>
                        <div>
                            <label class="mb-1 block text-sm text-muted">Hold (s)</label>
                            <input type="number" step="0.1" min="0" wire:model.live.debounce.300ms="hold_seconds" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                            @error('hold_seconds') <p class="mt-1 text-sm text-accent-soft">{{ $message }}</p> @enderror
                        </div>
                        <div>
                            <label class="mb-1 block text-sm text-muted">Relax (s)</label>
                            <input type="number" step="0.1" min="0" wire:model.live.debounce.300ms="relax_seconds" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                            @error('relax_seconds') <p class="mt-1 text-sm text-accent-soft">{{ $message }}</p> @enderror
                        </div>
                    </div>
                    <p class="-mt-2 text-xs text-muted">Hold = extra time pinned at full contraction before relaxing (0 = none).</p>

                    <div class="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label class="mb-1 block text-sm text-muted">Contract glow</label>
                            <select wire:model.live="contract_glow_mode" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                                <option value="slowly">Slowly (over the contract)</option>
                                <option value="at_once">At once</option>
                                <option value="very_fast">Very fast</option>
                            </select>
                        </div>
                        <div>
                            <label class="mb-1 block text-sm text-muted">Relax glow</label>
                            <select wire:model.live="relax_glow_mode" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                                <option value="slowly">Slowly (over the relax)</option>
                                <option value="at_once">At once</option>
                                <option value="very_fast">Very fast</option>
                            </select>
                        </div>
                        <div>
                            <label class="mb-1 block text-sm text-muted">Start phase</label>
                            <select wire:model.live="start_phase" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                                <option value="contract">Contract first</option>
                                <option value="relax">Relax first</option>
                            </select>
                        </div>
                        <div>
                            <label class="mb-1 block text-sm text-muted">Contract label</label>
                            <input wire:model.live.debounce.300ms="contract_label" placeholder="Contract & hold" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                        </div>
                        <div>
                            <label class="mb-1 block text-sm text-muted">Relax label</label>
                            <input wire:model.live.debounce.300ms="relax_label" placeholder="Relax" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                        </div>
                    </div>

                    <div class="rounded-xl bg-surface-2 p-3">
                        <label class="flex items-center gap-3">
                            <input type="checkbox" wire:model.live="full_hold" class="h-5 w-5 rounded accent-[var(--c-accent)]">
                            <span class="font-medium">Full contraction hold</span>
                        </label>
                        <p class="mt-1 text-xs text-muted">One sustained contraction for the whole duration — no relax beats. Relax seconds, relax glow and start phase are ignored.</p>
                    </div>
                </div>
            </div>
        </div>

        {{-- Media --}}
        <div class="grid gap-4 rounded-2xl bg-surface p-5 md:grid-cols-2">
            <div>
                <label class="mb-1 block text-sm text-muted">Icon image</label>
                @if ($exercise?->iconUrl())
                    <div class="mb-2 flex items-center gap-3">
                        <img src="{{ $exercise->iconUrl() }}" class="h-16 w-16 rounded-xl object-contain bg-surface-2">
                        <button type="button" wire:click="removeIcon" wire:confirm="Remove this icon image?"
                                class="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted hover:text-accent-soft transition-colors">Remove</button>
                    </div>
                @endif
                <input type="file" wire:model="iconUpload" accept="image/*" class="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-content">
                <div wire:loading wire:target="iconUpload" class="mt-1 text-xs text-muted">Uploading…</div>
                @error('iconUpload') <p class="mt-1 text-sm text-accent-soft">{{ $message }}</p> @enderror
            </div>
            <div>
                <label class="mb-1 block text-sm text-muted">Training video (mp4)</label>
                @if ($exercise?->videoUrl())
                    <div class="mb-2 flex items-center gap-3">
                        <p class="text-xs text-success">Video uploaded ✓</p>
                        <button type="button" wire:click="removeVideo" wire:confirm="Remove this training video?"
                                class="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted hover:text-accent-soft transition-colors">Remove</button>
                    </div>
                @endif
                <input type="file" wire:model="videoUpload" accept="video/*" class="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-content">
                <div wire:loading wire:target="videoUpload" class="mt-1 text-xs text-muted">Uploading…</div>
                @error('videoUpload') <p class="mt-1 text-sm text-accent-soft">{{ $message }}</p> @enderror
            </div>
        </div>

        {{-- Per-level duration (calculated from min/max) --}}
        @php($cycle = (float) $contract_seconds + (float) $hold_seconds + (float) $relax_seconds)
        <div class="rounded-2xl bg-surface p-5">
            <h2 class="mb-1 font-semibold">Calculated level durations</h2>
            <p class="mb-4 text-sm text-muted">Auto-calculated from min/max duration range ({{ (int) $min_duration }}s → {{ (int) $max_duration }}s). Lower levels get shorter durations, higher levels get longer.</p>
            <div class="space-y-1">
                <div class="hidden grid-cols-3 gap-2 px-1 text-xs text-muted md:grid">
                    <span>Level</span><span>Duration (s)</span><span>Reps</span>
                </div>
                @foreach ($durations as $levelId => $row)
                    @php($dur = (float) $row['duration'])
                    @php($reps = $full_hold ? 1 : ($cycle > 0 ? (int) floor($dur / $cycle) : 0))
                    <div wire:key="dur-{{ $levelId }}" class="grid grid-cols-3 gap-2 items-center rounded-lg px-1 py-1.5 text-sm">
                        <span class="font-medium">{{ $row['level'] }}</span>
                        <span class="tabular-nums">{{ (int) $dur }}s</span>
                        <span class="text-muted">{{ $full_hold ? 'Hold' : $reps.' reps' }}</span>
                    </div>
                @endforeach
            </div>
        </div>

        <div class="flex gap-3">
            <button type="submit" class="rounded-xl bg-accent px-6 py-3 font-semibold tap">Save exercise</button>
            <a href="{{ route('admin.exercises') }}" class="rounded-xl bg-surface px-6 py-3 font-semibold tap">Cancel</a>
        </div>
    </form>
</div>
