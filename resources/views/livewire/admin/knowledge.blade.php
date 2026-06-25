<div>
    <div class="mb-6 flex items-center justify-between">
        <div>
            <h1 class="text-2xl font-bold">Knowledge</h1>
            <p class="text-sm text-muted">Sequential video lessons — each unlocks when the previous one is finished.</p>
        </div>
        <div class="flex items-center gap-3">
            @if ($savedMessage)<span class="text-sm font-semibold text-success">{{ $savedMessage }}</span>@endif
            <button wire:click="addLesson" class="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold tap">Add lesson</button>
        </div>
    </div>

    <form wire:submit="save" class="space-y-4">
        @foreach ($rows as $i => $row)
            <div wire:key="lesson-{{ $row['id'] }}" class="rounded-2xl bg-surface p-5">
                <div class="mb-3 flex items-center justify-between">
                    <span class="text-xs font-semibold uppercase tracking-wide text-muted">Lesson {{ $i + 1 }}</span>
                    <div class="flex items-center gap-3">
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" wire:model="rows.{{ $i }}.is_active" class="h-4 w-4 accent-[var(--c-accent)] rounded border-white/10 bg-surface-2 focus:ring-0">
                            <span class="text-xs font-medium text-content">Active</span>
                        </label>
                        <button type="button" wire:click="delete({{ $row['id'] }})" wire:confirm="Delete this lesson and its video?"
                                class="text-xs text-muted hover:text-accent-soft transition-colors font-medium">Delete</button>
                    </div>
                </div>

                <div class="grid gap-4 md:grid-cols-3">
                    {{-- Left: fields --}}
                    <div class="md:col-span-2 space-y-3">
                        <div class="flex gap-2">
                            <input type="number" wire:model="rows.{{ $i }}.sort_order"
                                   class="h-10 w-16 rounded-lg border border-white/10 bg-surface-2 px-2 text-center focus:border-accent focus:outline-none" title="Sort order">
                            <input wire:model="rows.{{ $i }}.title" placeholder="Lesson title"
                                   class="h-10 flex-1 rounded-lg border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                        </div>
                        @error("rows.{$i}.title") <p class="text-xs text-accent-soft">{{ $message }}</p> @enderror

                        <textarea wire:model="rows.{{ $i }}.description" rows="3" placeholder="Description shown below the video"
                                  class="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2 focus:border-accent focus:outline-none"></textarea>

                        <div>
                            <label class="mb-1 block text-[11px] font-medium text-muted">External video URL (YouTube, Vimeo, direct link)</label>
                            <input wire:model="rows.{{ $i }}.video_url" placeholder="https://..."
                                   class="h-10 w-full rounded-lg border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                            @error("rows.{$i}.video_url") <p class="text-xs text-accent-soft">{{ $message }}</p> @enderror
                        </div>
                    </div>

                    {{-- Right: video upload + preview --}}
                    <div class="space-y-3">
                        @if ($row['video_src'])
                            <div class="relative overflow-hidden rounded-xl bg-black aspect-video">
                                <video src="{{ $row['video_src'] }}" class="h-full w-full object-cover" preload="metadata"></video>
                                <div class="absolute inset-0 flex items-center justify-center bg-black/30">
                                    <svg viewBox="0 0 24 24" class="h-8 w-8 text-white/80" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                                </div>
                                <span class="absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold text-white">Uploaded</span>
                            </div>
                        @endif

                        <div x-data="{ uploading: false, progress: 0 }"
                             x-on:livewire-upload-start="uploading = true; progress = 0"
                             x-on:livewire-upload-finish="uploading = false"
                             x-on:livewire-upload-error="uploading = false"
                             x-on:livewire-upload-progress="progress = $event.detail.progress"
                             class="relative">

                            <label class="group flex flex-col items-center justify-center border border-dashed border-white/10 hover:border-accent/40 rounded-xl bg-surface-2 p-4 cursor-pointer transition-all text-center">
                                <svg viewBox="0 0 24 24" class="h-6 w-6 text-muted group-hover:text-accent transition-colors mb-1" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                                </svg>
                                <span class="text-[11px] font-semibold text-content group-hover:text-accent transition-colors truncate max-w-full px-2">
                                    {{ !empty($videoUploads[$i]) ? $videoUploads[$i]->getClientOriginalName() : ($row['video_src'] ? 'Replace video' : 'Upload video') }}
                                </span>
                                <span class="text-[9px] text-muted mt-0.5">MP4, WebM or MOV - max 100 MB</span>
                                <input type="file" wire:model="videoUploads.{{ $i }}" accept="video/mp4,video/quicktime,video/webm" class="hidden">
                            </label>

                            <div x-show="uploading" x-cloak class="absolute inset-0 bg-surface/90 rounded-xl flex flex-col items-center justify-center p-3 z-10">
                                <div class="flex items-center justify-between w-full text-[10px] text-muted mb-1 px-1">
                                    <span>Uploading...</span>
                                    <span class="font-semibold text-accent" x-text="progress + '%'"></span>
                                </div>
                                <div class="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                                    <div class="bg-accent h-full rounded-full transition-all duration-150" x-bind:style="'width: ' + progress + '%'"></div>
                                </div>
                            </div>
                        </div>
                        @error("videoUploads.{$i}") <p class="text-xs text-accent-soft">{{ $message }}</p> @enderror
                    </div>
                </div>
            </div>
        @endforeach

        @if (count($rows) === 0)
            <div class="rounded-2xl bg-surface p-10 text-center">
                <p class="text-muted">No lessons yet. Click "Add lesson" to create the first one.</p>
            </div>
        @endif

        <div class="flex items-center gap-4 pt-4">
            <button type="submit" class="rounded-xl bg-accent px-6 py-3 font-semibold text-sm tap">
                <span wire:loading.remove wire:target="save">Save all</span>
                <span wire:loading wire:target="save">Saving...</span>
            </button>
            <button type="button" wire:click="addLesson" class="rounded-xl bg-surface px-5 py-3 text-sm font-semibold text-muted tap">Add lesson</button>
        </div>
    </form>
</div>
