@props([
    'model',
    'placeholder' => 'Write your content...',
])

{{--
    Simple WYSIWYG editor.

    Usage: <x-wysiwyg model="content" />  (binds to the parent Livewire `content` property)

    contenteditable + a small toolbar driven by document.execCommand. wire:ignore
    keeps Livewire from re-rendering the editable DOM; two-way sync is handled with
    @entangle so the parent property always holds the current HTML, and the editor
    re-hydrates when the bound value changes from the server (e.g. switching pages).
--}}
<div
    wire:ignore
    x-data="{
        content: @entangle($model),
        sync() { this.content = this.$refs.editor.innerHTML; },
        exec(command, value = null) {
            this.$refs.editor.focus();
            document.execCommand(command, false, value);
            this.sync();
        },
        addLink() {
            const url = window.prompt('Link URL (include https://)');
            if (url) this.exec('createLink', url);
        },
    }"
    x-init="
        $refs.editor.innerHTML = content || '';
        $watch('content', value => {
            if (document.activeElement !== $refs.editor && $refs.editor.innerHTML !== (value || '')) {
                $refs.editor.innerHTML = value || '';
            }
        });
    "
    class="overflow-hidden rounded-xl border border-white/10 bg-surface-2 focus-within:border-accent"
>
    <div class="wysiwyg-toolbar flex flex-wrap items-center gap-0.5 border-b border-white/10 bg-surface px-2 py-1.5">
        <button type="button" @click="exec('bold')" title="Bold"><b>B</b></button>
        <button type="button" @click="exec('italic')" title="Italic"><i>I</i></button>
        <button type="button" @click="exec('underline')" title="Underline"><u>U</u></button>
        <span class="mx-1 h-5 w-px bg-white/10"></span>
        <button type="button" @click="exec('formatBlock', 'H2')" title="Heading">H2</button>
        <button type="button" @click="exec('formatBlock', 'H3')" title="Subheading">H3</button>
        <button type="button" @click="exec('formatBlock', 'P')" title="Paragraph">P</button>
        <span class="mx-1 h-5 w-px bg-white/10"></span>
        <button type="button" @click="exec('insertUnorderedList')" title="Bullet list">&bull; List</button>
        <button type="button" @click="exec('insertOrderedList')" title="Numbered list">1. List</button>
        <button type="button" @click="exec('formatBlock', 'BLOCKQUOTE')" title="Quote">&ldquo;&rdquo;</button>
        <button type="button" @click="addLink()" title="Insert link">Link</button>
        <button type="button" @click="exec('unlink')" title="Remove link">Unlink</button>
        <span class="mx-1 h-5 w-px bg-white/10"></span>
        <button type="button" @click="exec('removeFormat')" title="Clear formatting">Clear</button>
    </div>

    <div
        x-ref="editor"
        contenteditable="true"
        @input="sync()"
        @blur="sync()"
        data-placeholder="{{ $placeholder }}"
        class="wysiwyg-content min-h-[18rem] max-w-none px-4 py-3 text-sm leading-relaxed"
    ></div>
</div>
