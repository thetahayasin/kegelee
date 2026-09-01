import React from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { Palette } from '../theme/colors';
import { useThemedStyles } from '../theme/ThemeContext';

/**
 * Minimal HTML renderer for the wysiwyg legal / page content. Handles the tags
 * the editor actually produces - headings, paragraphs, lists, bold/italic,
 * links and line breaks - without pulling in a full HTML engine.
 */

const decode = (s: string) =>
  s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/&#8217;/gi, '’')
    .replace(/&#8211;/gi, '–')
    .replace(/&#8220;/gi, '“')
    .replace(/&#8221;/gi, '”');

type Run = { text: string; bold?: boolean; italic?: boolean; href?: string };

// Parse inline formatting (strong/b, em/i, a, br) inside a block into runs.
const parseInline = (html: string): Run[] => {
  const runs: Run[] = [];
  let bold = false;
  let italic = false;
  let href: string | undefined;
  const re = /<\/?(strong|b|em|i|a|br)([^>]*)>|([^<]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[3] != null) {
      const text = decode(m[3]);
      if (text) {
        runs.push({ text, bold, italic, href });
      }
    } else {
      const tag = m[1].toLowerCase();
      const closing = m[0].startsWith('</');
      if (tag === 'br') {
        runs.push({ text: '\n' });
      } else if (tag === 'strong' || tag === 'b') {
        bold = !closing;
      } else if (tag === 'em' || tag === 'i') {
        italic = !closing;
      } else if (tag === 'a') {
        if (closing) {
          href = undefined;
        } else {
          const h = m[2].match(/href\s*=\s*["']([^"']+)["']/i);
          href = h ? h[1] : undefined;
        }
      }
    }
  }
  return runs;
};

const InlineText = ({ runs, style }: { runs: Run[]; style?: any }) => {
  const styles = useThemedStyles(makeStyles);
  return (
    <Text style={style}>
      {runs.map((r, i) => (
        <Text
          key={i}
          onPress={r.href ? () => Linking.openURL(r.href as string) : undefined}
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
  const src = html || '';
  const blocks: { type: string; content: string }[] = [];
  const blockRe = /<(h[1-6]|p|ul|ol|blockquote)([^>]*)>([\s\S]*?)<\/\1>/gi;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(src)) !== null) {
    const between = src.slice(lastIndex, m.index).trim();
    if (between) {
      blocks.push({ type: 'p', content: between });
    }
    blocks.push({ type: m[1].toLowerCase(), content: m[3] });
    lastIndex = blockRe.lastIndex;
  }
  const tail = src.slice(lastIndex).trim();
  if (tail) {
    blocks.push({ type: 'p', content: tail });
  }
  if (blocks.length === 0 && src.trim()) {
    blocks.push({ type: 'p', content: src });
  }

  return (
    <View>
      {blocks.map((b, i) => {
        if (b.type === 'ul' || b.type === 'ol') {
          const items = [...b.content.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map(
            x => x[1],
          );
          return (
            <View key={i} style={styles.list}>
              {items.map((it, j) => (
                <View key={j} style={styles.listItem}>
                  <Text style={styles.bullet}>{b.type === 'ol' ? `${j + 1}.` : '•'}</Text>
                  <InlineText runs={parseInline(it)} style={styles.li} />
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
            : b.type.startsWith('h')
            ? styles.h4
            : b.type === 'blockquote'
            ? styles.quote
            : styles.p;
        return <InlineText key={i} runs={parseInline(b.content)} style={style} />;
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
