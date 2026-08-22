/**
 * Rewrites the lazy-require map in src/i18n/index.ts from whatever locale
 * files actually exist on disk.
 *
 * Metro resolves require() statically, so a map entry pointing at a file that
 * has not been written yet fails the BUNDLE, not just that language. Deriving
 * the map from the directory means adding or removing a translation is a file
 * operation plus this script, and can never leave an unbuildable reference.
 */
const fs = require('fs');
const path = require('path');

const dir = path.join('src', 'i18n', 'locales');
const tags = fs.readdirSync(dir)
  .filter((f) => f.endsWith('.json') && f !== 'en.json')
  .map((f) => path.basename(f, '.json'))
  .sort();

const body = tags.length
  ? tags.map((t) => `  ${/^[a-z]+$/.test(t) ? t : `'${t}'`}: () => require('./locales/${t}.json'),`).join('\n')
  : '  // No translations yet; English is imported statically above.';

const file = path.join('src', 'i18n', 'index.ts');
let src = fs.readFileSync(file, 'utf8');
const start = src.indexOf('const bundles: Partial<Record<LanguageTag, () => any>> = {');
const end = src.indexOf('\n};', start);
if (start < 0 || end < 0) {
  console.error('bundles map not found in', file);
  process.exit(1);
}
src = src.slice(0, start)
  + 'const bundles: Partial<Record<LanguageTag, () => any>> = {\n'
  + body
  + src.slice(end);
fs.writeFileSync(file, src);
console.log(`bundles map synced: ${tags.length} translation(s)` + (tags.length ? ` -> ${tags.join(', ')}` : ''));
