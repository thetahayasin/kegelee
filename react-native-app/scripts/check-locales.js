/**
 * Compares every locale file against en.json.
 *
 * Missing keys are survivable - i18next falls back to English per key - so they
 * are reported but do not fail the run. EXTRA keys are dead weight and usually
 * a typo in a key name, which means the intended string is silently still
 * English; those fail, as do unparseable JSON and missing plural categories.
 *
 * Walks to FULL DEPTH. It used to descend exactly two levels
 * (`for (g of en) for (k of en[g])`), which is right for the flat groups and
 * blind for `catalogue`, whose exercise names, level names and step labels sit
 * one level further down. That hid 98 user-facing strings - a fifth of the
 * file - from every release: adding an exercise would have reported 100%
 * parity while all 28 translations quietly served English.
 *
 * Also checks PLURAL CATEGORIES, which a plain key-set diff cannot see.
 * English has two of them, so en.json only ever carries `_one` and `_other`.
 * Russian has four and Arabic six, and i18next v21+ picks the suffix straight
 * out of `Intl.PluralRules`, so a Russian screen showing 3 days looks up
 * `..._few`. When that key is absent i18next falls back to English, so the one
 * number a Russian speaker is most likely to see renders untranslated while
 * this script reports 100% parity. The required set is derived per locale at
 * run time rather than hardcoded, because CLDR moves: Spanish, French, Italian
 * and Portuguese gained a `many` category in CLDR 42 and a hardcoded table
 * would have kept passing.
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

/**
 * Base paths of every pluralised key, e.g. `training.daysLeft`. English marks
 * them by carrying an `_one` variant; everything without one is a plain string
 * and needs no per-locale categories.
 */
const pluralBases = enKeys
  .filter((k) => k.endsWith('_one'))
  .map((k) => k.slice(0, -'_one'.length));

/** The suffixes i18next will look up for `tag`, e.g. one/few/many/other. */
const categoriesFor = (tag) =>
  new Intl.PluralRules(tag).resolvedOptions().pluralCategories;

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

  const cats = categoriesFor(tag);
  // A locale's extra plural variants are legitimate, not typos: `daysLeft_few`
  // has no counterpart in en.json and never will, because English has no `few`.
  // Without this the extra-key check would reject every correctly pluralised
  // Slavic or Arabic file.
  const expected = new Set(enSet);
  for (const base of pluralBases) {
    for (const c of cats) expected.add(`${base}_${c}`);
  }
  const extra = [...have].filter((k) => !expected.has(k));

  // Only pluralised keys the locale actually translates are held to the full
  // set. A base that is missing outright is already counted as missing above,
  // and demanding its categories too would report the same gap five times.
  const missingCats = [];
  for (const base of pluralBases) {
    if (!have.has(`${base}_one`)) continue;
    for (const c of cats) {
      if (!have.has(`${base}_${c}`)) missingCats.push(`${base}_${c}`);
    }
  }

  const pct = Math.round(((enKeys.length - missing.length) / enKeys.length) * 100);
  console.log(
    `${tag.padEnd(8)} ${String(pct).padStart(3)}%  ${enKeys.length - missing.length}/${enKeys.length}` +
      (extra.length ? `  EXTRA: ${extra.slice(0, 5).join(', ')}` : '') +
      (missingCats.length
        ? `  PLURALS MISSING (${missingCats.length}): ${missingCats.slice(0, 5).join(', ')}`
        : ''),
  );
  if (extra.length || missingCats.length) bad++;
}
console.log(`\nen.json: ${enKeys.length} keys`);
process.exit(bad ? 1 : 0);
