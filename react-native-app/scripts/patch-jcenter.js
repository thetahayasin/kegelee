const fs = require('fs');
const path = require('path');

const nodeModulesDir = path.join(__dirname, '../node_modules');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      // Skip hidden directories
      if (!path.basename(file).startsWith('.')) {
        results = results.concat(walk(file));
      }
    } else if (file.endsWith('build.gradle')) {
      results.push(file);
    }
  });
  return results;
}

if (fs.existsSync(nodeModulesDir)) {
  console.log('Searching for build.gradle files in node_modules to remove jcenter()...');
  const gradleFiles = walk(nodeModulesDir);
  let patchedCount = 0;

  gradleFiles.forEach((file) => {
    let content = fs.readFileSync(file, 'utf8');
    if (content.includes('jcenter()')) {
      content = content.replace(/jcenter\(\)/g, 'mavenCentral()');
      fs.writeFileSync(file, content, 'utf8');
      console.log(`Patched: ${path.relative(nodeModulesDir, file)}`);
      patchedCount++;
    }
  });

  console.log(`Finished patching. Patched ${patchedCount} file(s).`);
} else {
  console.warn('node_modules directory not found.');
}
