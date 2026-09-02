/**
 * @format
 *
 * Plural categories across the 28 translated locales.
 *
 * English has two plural forms, so en.json only ever carries `_one` and
 * `_other`. Most languages have more: Russian and Polish have four, Arabic
 * six. i18next v21+ resolves the suffix through `Intl.PluralRules`, so a
 * Russian screen showing "3 days" looks up `training.daysLeft_few` - a key
 * that has no English counterpart and never will.
 *
 * When that key is absent i18next silently falls back to English, and the
 * fallback lands on exactly the numbers people see most: 2, 3 and 4 days.
 * A key-set diff against en.json cannot catch it, because the missing key is
 * not missing relative to English. Hence this test, which asks
 * `Intl.PluralRules` what each locale actually needs.
 *
 * The required set is derived at run time rather than hardcoded, because CLDR
 * moves. Spanish, French, Italian and Portuguese gained a `many` category in
 * CLDR 42; a table written before that would still be passing today.
 */
/// <reference types="node" />
// The project pins `types` to jest alone, so the node globals this file needs
// (fs, path, __dirname) are pulled in here rather than opened up project-wide.
import fs from 'fs';
import path from 'path';

const DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales');

type Tree = { [key: string]: string | Tree };

const read = (tag: string): Tree =>
  JSON.parse(fs.readFileSync(path.join(DIR, `${tag}.json`), 'utf8')) as Tree;

/** Every leaf path in the tree, e.g. `catalogue.steps.relax`. */
const leafKeys = (obj: Tree, prefix = '', out: string[] = []): string[] => {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object') leafKeys(v, key, out);
    else out.push(key);
  }
  return out;
};

const tags: string[] = fs
  .readdirSync(DIR)
  .filter((f: string) => f.endsWith('.json') && f !== 'en.json')
  .map((f: string) => path.basename(f, '.json'))
  .sort();

/**
 * Base paths of the pluralised keys. English marks them by carrying an `_one`
 * variant; anything without one is a plain string that needs no categories.
 */
const pluralBases = leafKeys(read('en'))
  .filter((k) => k.endsWith('_one'))
  .map((k) => k.slice(0, -'_one'.length));

/**
 * Categories that always render the number as a digit, so the placeholder has
 * to survive into them. `one` and `two` are left out because several languages
 * spell the number into the word instead - Hebrew's dual "יומיים" and Arabic's
 * "يومان" both mean "two days" with no digit anywhere, and the translations
 * already do the same in `_one` ("يوم واحد", "יום אחד").
 */
const NUMERIC = ['zero', 'few', 'many', 'other'];

describe('plural categories', () => {
  it('finds the pluralised keys in en.json', () => {
    // A guard on the fixture itself. If a rename ever emptied this list, every
    // per-locale test below would pass while checking nothing at all.
    expect(pluralBases.length).toBeGreaterThan(0);
    expect(tags.length).toBe(28);
  });

  // A loop rather than `it.each`, so a failure names one locale in its own
  // test instead of collapsing 28 of them into a single assertion.
  for (const tag of tags) {
    it(`${tag} has every category Intl.PluralRules asks for`, () => {
      const have = new Set(leafKeys(read(tag)));
      const categories = new Intl.PluralRules(tag).resolvedOptions()
        .pluralCategories;

      const missing: string[] = [];
      for (const base of pluralBases) {
        // A base the locale has not translated at all is a plain missing key,
        // which i18next survives per key and which check-locales.js reports.
        // Demand the full set only once the locale has started on that key.
        if (!have.has(`${base}_one`)) continue;
        for (const c of categories) {
          if (!have.has(`${base}_${c}`)) missing.push(`${base}_${c}`);
        }
      }
      expect(missing).toEqual([]);
    });
  }

  for (const tag of tags) {
    it(`${tag} keeps its interpolations in every variant`, () => {
      const data = read(tag);
      const have = new Set(leafKeys(data));
      const at = (key: string): string => {
        let node: string | Tree = data;
        for (const p of key.split('.')) node = (node as Tree)[p];
        return node as string;
      };
      const categories = new Intl.PluralRules(tag).resolvedOptions()
        .pluralCategories;

      for (const base of pluralBases) {
        if (!have.has(`${base}_other`)) continue;
        const other = at(`${base}_other`);
        // Everything but the count - `{{price}}` on the paywall strings.
        // Losing one of those does not read as a translation quirk, it prints
        // a bare placeholder or an empty gap where a price belongs, so it is
        // required in every variant with no exception.
        const tokens = (other.match(/{{\w+}}/g) ?? []).filter(
          (t) => t !== '{{count}}',
        );
        const wantsCount = other.includes('{{count}}');

        for (const c of categories) {
          if (!have.has(`${base}_${c}`)) continue;
          // The key travels with the value so a failure says which string.
          const label = `${base}_${c}: ${at(`${base}_${c}`)}`;
          for (const token of tokens) expect(label).toContain(token);
          if (wantsCount && NUMERIC.includes(c)) {
            expect(label).toContain('{{count}}');
          }
        }
      }
    });
  }
});
