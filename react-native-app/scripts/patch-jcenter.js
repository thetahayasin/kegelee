/**
 * Rewrite `jcenter()` to `mavenCentral()` in every build.gradle under
 * node_modules.
 *
 * JCenter is read-only and increasingly unreachable, so a single dependency
 * still listing it makes Gradle spend its resolution timeout on a dead host
 * before failing. Patching the installed copies is the only lever available:
 * these are other people's packages, and most of them are unmaintained.
 *
 * Runs from `postinstall`, which is why every failure mode below matters. A
 * crash here fails `npm install` itself, and a repository rewrite is nowhere
 * near important enough to do that.
 */
const fs = require('fs');
const path = require('path');

const nodeModulesDir = path.join(__dirname, '../node_modules');

/**
 * Collect build.gradle paths, refusing to follow symlinks.
 *
 * lstatSync, not statSync: statSync resolves the link, so a linked package -
 * which is exactly what `npm link` and pnpm-style installs produce - was
 * descended into as if it were a real directory. That both walked outside
 * node_modules (potentially rewriting files in another checkout) and could
 * loop forever on a link pointing at an ancestor.
 */
function walk(dir) {
  let results = [];
  let list;
  try {
    list = fs.readdirSync(dir);
  } catch {
    // Unreadable directory (permissions, a package removed mid-walk). Nothing
    // in it can be patched, and that is not worth stopping for.
    return results;
  }
  for (const entry of list) {
    const full = path.join(dir, entry);
    let stat;
    try {
      stat = fs.lstatSync(full);
    } catch {
      continue;
    }
    if (stat.isSymbolicLink()) {
      continue;
    }
    if (stat.isDirectory()) {
      // Skip hidden directories (.bin, .cache) - no gradle files live there.
      if (!entry.startsWith('.')) {
        results = results.concat(walk(full));
      }
    } else if (stat.isFile() && entry === 'build.gradle') {
      results.push(full);
    }
  }
  return results;
}

if (!fs.existsSync(nodeModulesDir)) {
  console.warn('patch-jcenter: node_modules not found, nothing to patch.');
  process.exit(0);
}

console.log('patch-jcenter: searching node_modules for jcenter()...');
let patchedCount = 0;
let skippedCount = 0;

for (const file of walk(nodeModulesDir)) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    if (!content.includes('jcenter()')) {
      continue;
    }
    fs.writeFileSync(file, content.replace(/jcenter\(\)/g, 'mavenCentral()'), 'utf8');
    console.log(`patch-jcenter: patched ${path.relative(nodeModulesDir, file)}`);
    patchedCount++;
  } catch (e) {
    // A read-only file, a race with another install. Report and carry on: one
    // unpatched module is a slow Gradle resolve, not a broken install.
    skippedCount++;
    console.warn(`patch-jcenter: skipped ${path.relative(nodeModulesDir, file)} (${e.message})`);
  }
}

console.log(
  `patch-jcenter: done. Patched ${patchedCount} file(s), skipped ${skippedCount}.`,
);
