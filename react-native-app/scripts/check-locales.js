/**
 * Compares every locale file against en.json.
 *
 * Missing keys are survivable - i18next falls back to English per key - but
 * EXTRA keys are dead weight and usually a typo in a key name, which means the
 * intended string is silently still English. Both are reported; only structural
 * damage (unparseable JSON) is treated as a failure.
 *
 * Walks to FULL DEPTH. It used to descend exactly two levels
 * (`for (g of en) for (k of en[g])`), which is right for the flat groups and
 * blind for `catalogue`, whose exercise names, level names and step labels sit
 * one level further down. That hid 98 user-facing strings - a fifth of the
 * file - from every release: adding an exercise would have reported 100%
 * parity while all 28 translations quietly served English.
 */
const fs = require('fs');
const path = require('path');

const dir = path.join('src', 'i18n', 'locales');
const en = JSON.parse(fs.readFileSync(path.join(dir, 'en.json'), 'utf8'));
/** Every leaf path in the tree, e.g. `catalogue.steps.relax`. */
const leafKeys = (obj, prefix = '', out = []) => {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) leafKeys(v, key, out);
    else out.push(key);
  }
  return out;
};

const enKeys = leafKeys(en);

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
  // Sets, not arrays: this is now ~500 keys against 28 files, and the
  // nested includes() scan was quadratic.
  const have = new Set(leafKeys(data));
  const enSet = new Set(enKeys);
  const missing = enKeys.filter((k) => !have.has(k));
  const extra = [...have].filter((k) => !enSet.has(k));
  const pct = Math.round(((enKeys.length - missing.length) / enKeys.length) * 100);
  console.log(
    `${tag.padEnd(8)} ${String(pct).padStart(3)}%  ${enKeys.length - missing.length}/${enKeys.length}` +
      (extra.length ? `  EXTRA: ${extra.slice(0, 5).join(', ')}` : ''),
  );
  if (extra.length) bad++;
}
console.log(`\nen.json: ${enKeys.length} keys`);
process.exit(bad ? 1 : 0);
