import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { Palette } from '../theme/colors';
import { useThemedStyles } from '../theme/ThemeContext';

/**
 * Minimal HTML renderer for the wysiwyg legal / page content. Handles the tags
 * the editor actually produces - headings, paragraphs, lists, bold/italic,
 * links and line breaks - without pulling in a full HTML engine.
 *
 * The rule that matters: anything NOT in that list is dropped as markup, never
 * shown as text. The previous version matched tags with
 * `/<\/?(strong|b|em|i|a|br)([^>]*)>/`, which is not anchored to a whole tag
 * name - so `<img src="x.png">` matched as an `<i>` with the attributes
 * `mg src="x.png"`, silently italicising the rest of the paragraph. And any
 * tag it did not recognise at all (a `<table>`, a `<span>`) fell through to
 * the text branch, which printed the raw attributes and a stray `>` into the
 * middle of the page. Both were visible in production on the terms page.
 */

/**
 * Decode entities, `&amp;` LAST.
 *
 * Order is the whole correctness story here. Decoding `&amp;` first turns the
 * literally-escaped text `&amp;lt;` into `&lt;`, which the next replacement
 * then turns into `<` - so text that was deliberately escaped by the editor
 * comes back out as markup. Every other entity is decoded first, and the
 * ampersand rule runs once nothing is left that could be re-interpreted.
 */
const decode = (s: string): string =>
  s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#8217;/gi, '’')
    .replace(/&#8211;/gi, '–')
    .replace(/&#8220;/gi, '“')
    .replace(/&#8221;/gi, '”')
    .replace(/&amp;/gi, '&');

export type Run = { text: string; bold?: boolean; italic?: boolean; href?: string };

export type TextBlock = { type: 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'blockquote'; runs: Run[] };
export type ListBlock = { type: 'ul' | 'ol'; items: Run[][] };
export type Block = TextBlock | ListBlock;

// An explicit guard rather than relying on the discriminant to narrow in JSX:
// each member's `type` is itself a union of literals, which TypeScript does
// not narrow away inside the map callback below.
const isListBlock = (block: Block): block is ListBlock =>
  block.type === 'ul' || block.type === 'ol';

type BlockTag = 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'blockquote';

const BLOCK_TAGS = new Set<string>(['p', 'h1', 'h2', 'h3', 'h4', 'blockquote']);
const INLINE_TAGS = new Set<string>(['strong', 'b', 'em', 'i', 'a', 'br']);
const LIST_TAGS = new Set<string>(['ul', 'ol']);

/**
 * One pass over the source, in four alternatives.
 *
 * Comments first (they can contain anything, including `<`), then a WHOLE tag
 * - the name is captured on its own so it can be checked against the known
 * sets rather than merely started with - then a run of text, then a bare `<`
 * that begins nothing. That last alternative is what guarantees the loop
 * always advances: without it a lone `<` matches nothing, exec returns the
 * same index forever, and the component hangs the UI thread.
 */
const TOKEN_RE = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s[^>]*?)?)\s*\/?>|([^<]+)|(<)/g;

/** Only schemes it is safe to hand to the OS from untrusted page content. */
const SAFE_LINK = /^(https:|mailto:)/i;

export const parseHtmlBlocks = (html: string): Block[] => {
  const blocks: Block[] = [];
  let runs: Run[] = [];

  // Depth counters rather than booleans: `<b>a <b>b</b> c</b>` should stay
  // bold through "c", which a boolean flipped by the inner close would not.
  let boldDepth = 0;
  let italicDepth = 0;
  let href: string | undefined;

  // The block currently being filled. A stack, so `<blockquote><p>x</p>more`
  // returns to the blockquote after the paragraph closes instead of silently
  // becoming a paragraph for the rest of the document.
  const blockStack: BlockTag[] = [];
  const currentBlock = (): BlockTag => blockStack[blockStack.length - 1] ?? 'p';

  let listType: 'ul' | 'ol' | null = null;
  let listItems: Run[][] = [];
  let inListItem = false;

  const hasContent = (candidate: Run[]) => candidate.some((r) => r.text.trim() !== '');

  const flushInline = (type: BlockTag) => {
    if (hasContent(runs)) blocks.push({ type, runs });
    runs = [];
  };

  const flushListItem = () => {
    if (hasContent(runs)) listItems.push(runs);
    runs = [];
    inListItem = false;
  };

  const closeList = () => {
    if (!listType) return;
    if (inListItem) flushListItem();
    if (listItems.length > 0) blocks.push({ type: listType, items: listItems });
    listType = null;
    listItems = [];
  };

  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(html)) !== null) {
    // A comment, or a bare '<' that starts no tag. Both are dropped: showing
    // either one is showing the reader our parser's internals.
    if (m[2] === undefined && m[4] === undefined) continue;

    if (m[4] !== undefined) {
      const text = decode(m[4]);
      if (text) runs.push({ text, bold: boldDepth > 0, italic: italicDepth > 0, href });
      continue;
    }

    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const attrs = m[3] || '';

    if (INLINE_TAGS.has(tag)) {
      if (tag === 'br') {
        runs.push({ text: '\n' });
      } else if (tag === 'strong' || tag === 'b') {
        boldDepth = closing ? Math.max(0, boldDepth - 1) : boldDepth + 1;
      } else if (tag === 'em' || tag === 'i') {
        italicDepth = closing ? Math.max(0, italicDepth - 1) : italicDepth + 1;
      } else if (tag === 'a') {
        if (closing) {
          href = undefined;
        } else {
          const h = attrs.match(/href\s*=\s*["']([^"']*)["']/i);
          href = h ? decode(h[1]) : undefined;
        }
      }
      continue;
    }

    if (BLOCK_TAGS.has(tag)) {
      const blockTag = tag as BlockTag;
      if (closing) {
        if (inListItem) {
          // A paragraph inside a list item: its text belongs to the item.
          continue;
        }
        flushInline(blockTag);
        const idx = blockStack.lastIndexOf(blockTag);
        if (idx >= 0) blockStack.length = idx;
        else blockStack.pop();
      } else {
        if (inListItem) continue;
        flushInline(currentBlock());
        blockStack.push(blockTag);
      }
      continue;
    }

    if (LIST_TAGS.has(tag)) {
      if (closing) {
        closeList();
      } else {
        flushInline(currentBlock());
        closeList();
        listType = tag as 'ul' | 'ol';
        listItems = [];
      }
      continue;
    }

    if (tag === 'li') {
      if (closing) {
        flushListItem();
      } else {
        if (inListItem) flushListItem();
        // Text loose inside a <ul> before the first <li> is not a list item.
        runs = [];
        inListItem = true;
      }
      continue;
    }

    // Everything else - img, table, tr, td, span, div, script, style - is
    // markup this renderer does not implement. Dropped, NOT printed.
  }

  closeList();
  flushInline(currentBlock());
  return blocks;
};

const openLink = (url: string) => {
  if (!SAFE_LINK.test(url)) return;
  // A rejected openURL (no browser, no mail client, a URL the OS refuses)
  // used to be an unhandled promise rejection from a tap on a legal page.
  Linking.openURL(url).catch(() => {});
};

const InlineText = ({ runs, style }: { runs: Run[]; style?: any }) => {
  const styles = useThemedStyles(makeStyles);
  return (
    <Text style={style}>
      {runs.map((r, i) => (
        <Text
          key={i}
          onPress={r.href && SAFE_LINK.test(r.href) ? () => openLink(r.href as string) : undefined}
          style={[r.bold && styles.bold, r.italic && styles.italic, r.href && styles.link]}
        >
          {r.text}
        </Text>
      ))}
    </Text>
  );
};

export const HtmlRenderer = ({ html }: { html: string }) => {
  const styles = useThemedStyles(makeStyles);
  // The parse is a full scan of the document and depends on nothing but the
  // source, so it must not re-run on an unrelated re-render (a theme change,
  // a parent's state). Legal pages run to thousands of characters.
  const blocks = useMemo(() => parseHtmlBlocks(html || ''), [html]);

  return (
    <View>
      {blocks.map((b, i) => {
        if (isListBlock(b)) {
          return (
            <View key={i} style={styles.list}>
              {b.items.map((item, j) => (
                <View key={j} style={styles.listItem}>
                  <Text style={styles.bullet}>{b.type === 'ol' ? `${j + 1}.` : '•'}</Text>
                  <InlineText runs={item} style={styles.li} />
                </View>
              ))}
            </View>
          );
        }
        const style =
          b.type === 'h1'
            ? styles.h1
            : b.type === 'h2'
            ? styles.h2
            : b.type === 'h3'
            ? styles.h3
            : b.type === 'h4'
            ? styles.h4
            : b.type === 'blockquote'
            ? styles.quote
            : styles.p;
        return <InlineText key={i} runs={b.runs} style={style} />;
      })}
    </View>
  );
};

const makeStyles = (COLORS: Palette) => StyleSheet.create({
  p: { fontSize: 15, color: COLORS.whiteMuted, lineHeight: 24, marginBottom: 14 },
  h1: { fontSize: 24, fontWeight: 'bold', color: COLORS.white, marginTop: 8, marginBottom: 12 },
  h2: { fontSize: 20, fontWeight: 'bold', color: COLORS.white, marginTop: 8, marginBottom: 10 },
  h3: { fontSize: 17, fontWeight: 'bold', color: COLORS.white, marginTop: 6, marginBottom: 8 },
  h4: { fontSize: 15, fontWeight: 'bold', color: COLORS.white, marginBottom: 6 },
  quote: {
    fontSize: 15,
    fontStyle: 'italic',
    color: COLORS.textMuted,
    lineHeight: 24,
    marginBottom: 14,
    paddingStart: 12,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
  },
  list: { marginBottom: 14 },
  listItem: { flexDirection: 'row', marginBottom: 6 },
  bullet: { color: COLORS.accentText, marginEnd: 8, fontSize: 15, lineHeight: 24 },
  li: { flex: 1, fontSize: 15, color: COLORS.whiteMuted, lineHeight: 24 },
  bold: { fontWeight: 'bold', color: COLORS.white },
  italic: { fontStyle: 'italic' },
  link: { color: COLORS.accentText, textDecorationLine: 'underline' },
});
