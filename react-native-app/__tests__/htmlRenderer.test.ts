/**
 * @format
 *
 * The legal-page HTML tokenizer.
 *
 * Three inputs, all of them things the wysiwyg editor really produces and all
 * of them things the previous parser got visibly wrong on the live terms page.
 * The parser is tested rather than the component: what broke was the tokenizer,
 * and asserting on it directly says what the correct answer is instead of
 * asserting on a rendered tree.
 */

import { parseHtmlBlocks, Block, Run } from '../src/components/HtmlRenderer';

const runsOf = (blocks: Block[]): Run[] =>
  blocks.flatMap((b) => ('runs' in b ? b.runs : b.items.flat()));

const textOf = (blocks: Block[]) => runsOf(blocks).map((r) => r.text).join('');

describe('unknown tags', () => {
  it('drops a void tag instead of leaking its attributes and a stray >', () => {
    const blocks = parseHtmlBlocks('<p>a <img src="x.png"> b</p>');
    const text = textOf(blocks);
    expect(text).toBe('a  b');
    expect(text).not.toContain('>');
    expect(text).not.toContain('x.png');
  });

  it('does not read <img> as an <i>', () => {
    // The old regex was not anchored to a whole tag name, so `img` matched the
    // `i` alternative and switched italics on for the rest of the paragraph.
    const blocks = parseHtmlBlocks('<p>a <img src="x.png"> b</p>');
    expect(runsOf(blocks).some((r) => r.italic)).toBe(false);
  });

  it('keeps a table\'s text and none of its markup', () => {
    const html =
      '<table class="t"><thead><tr><th>Plan</th></tr></thead>' +
      '<tbody><tr><td>Monthly</td></tr></tbody></table>';
    const blocks = parseHtmlBlocks(html);
    const text = textOf(blocks);
    expect(text).toContain('Plan');
    expect(text).toContain('Monthly');
    expect(text).not.toContain('>');
    expect(text).not.toContain('class');
    expect(runsOf(blocks).some((r) => r.italic)).toBe(false);
  });

  it('unwraps a span without inventing formatting', () => {
    const blocks = parseHtmlBlocks('<p><span style="font-style: italic">hello</span></p>');
    const text = textOf(blocks);
    expect(text).toBe('hello');
    expect(text).not.toContain('>');
    expect(text).not.toContain('style');
    expect(runsOf(blocks).some((r) => r.italic)).toBe(false);
  });
});

describe('the tags it does implement', () => {
  it('marks bold, italic and links', () => {
    const blocks = parseHtmlBlocks(
      '<p><strong>bold</strong> <em>it</em> <a href="https://kegelee.com">link</a></p>',
    );
    const runs = runsOf(blocks);
    expect(runs.find((r) => r.text === 'bold')?.bold).toBe(true);
    expect(runs.find((r) => r.text === 'it')?.italic).toBe(true);
    expect(runs.find((r) => r.text === 'link')?.href).toBe('https://kegelee.com');
  });

  it('keeps nested emphasis open until its own close tag', () => {
    const blocks = parseHtmlBlocks('<p><b>a <b>b</b> c</b></p>');
    expect(runsOf(blocks).every((r) => r.bold)).toBe(true);
  });

  it('reads a list as items', () => {
    const blocks = parseHtmlBlocks('<ul><li>one</li><li>two</li></ul>');
    expect(blocks).toHaveLength(1);
    const [list] = blocks;
    expect(list.type).toBe('ul');
    expect('items' in list && list.items.map((i) => i.map((r) => r.text).join(''))).toEqual([
      'one',
      'two',
    ]);
  });

  it('returns to the enclosing block after a nested one closes', () => {
    const blocks = parseHtmlBlocks('<blockquote><p>inner</p>outer</blockquote>');
    expect(blocks.map((b) => b.type)).toEqual(['p', 'blockquote']);
  });

  it('keeps headings as headings', () => {
    const blocks = parseHtmlBlocks('<h2>Title</h2><p>Body</p>');
    expect(blocks.map((b) => b.type)).toEqual(['h2', 'p']);
  });
});

describe('entities', () => {
  it('decodes &amp; last, so escaped markup stays escaped', () => {
    // '&amp;lt;' is the editor's way of writing the literal text '&lt;'.
    // Decoding '&amp;' first turned it into '&lt;' and then into '<'.
    expect(textOf(parseHtmlBlocks('<p>&amp;lt;b&amp;gt;</p>'))).toBe('&lt;b&gt;');
  });

  it('decodes the entities the editor actually emits', () => {
    expect(textOf(parseHtmlBlocks('<p>Terms&nbsp;&amp;&nbsp;Conditions</p>'))).toBe(
      'Terms & Conditions',
    );
    expect(textOf(parseHtmlBlocks('<p>it&#8217;s</p>'))).toBe('it’s');
  });
});

describe('malformed input', () => {
  it('does not hang on a bare less-than', () => {
    // The tokenizer must always advance, or exec() returns the same index
    // forever and the UI thread stops.
    expect(textOf(parseHtmlBlocks('<p>5 < 6</p>'))).toContain('5 ');
  });

  it('handles an unclosed tag without losing the text after it', () => {
    expect(textOf(parseHtmlBlocks('<p>start <strong>bold'))).toBe('start bold');
  });

  it('produces nothing at all for empty or whitespace-only input', () => {
    expect(parseHtmlBlocks('')).toEqual([]);
    expect(parseHtmlBlocks('<p>   </p>')).toEqual([]);
  });
});
