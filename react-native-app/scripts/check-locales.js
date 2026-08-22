/**
 * Compares every locale file against en.json.
 *
 * Missing keys are survivable - i18next falls back to English per key - but
 * EXTRA keys are dead weight and usually a typo in a key name, which means the
 * intended string is silently still English. Both are reported; only structural
 * damage (unparseable JSON) is treated as a failure.
 */
const fs = require('fs');
const path = require('path');

const dir = path.join('src', 'i18n', 'locales');
const en = JSON.parse(fs.readFileSync(path.join(dir, 'en.json'), 'utf8'));
const enKeys = [];
for (const g of Object.keys(en)) for (const k of Object.keys(en[g])) enKeys.push(g + '.' + k);

let bad = 0;
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'en.json').sort()) {
  const tag = path.basename(file, '.json');
  let data;
  try {
    data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  } catch (e) {
    console.log(`${tag.padEnd(8)} UNPARSEABLE: ${e.message}`);
    bad++;
    continue;
  }
  const have = [];
  for (const g of Object.keys(data)) for (const k of Object.keys(data[g])) have.push(g + '.' + k);
  const missing = enKeys.filter((k) => !have.includes(k));
  const extra = have.filter((k) => !enKeys.includes(k));
  const pct = Math.round(((enKeys.length - missing.length) / enKeys.length) * 100);
  console.log(
    `${tag.padEnd(8)} ${String(pct).padStart(3)}%  ${enKeys.length - missing.length}/${enKeys.length}` +
      (extra.length ? `  EXTRA: ${extra.slice(0, 5).join(', ')}` : ''),
  );
  if (extra.length) bad++;
}
console.log(`\nen.json: ${enKeys.length} keys`);
process.exit(bad ? 1 : 0);
