const fs = require('fs');
const path = require('path');

const gradlePath = path.join(__dirname, '../android/app/build.gradle');

if (!fs.existsSync(gradlePath)) {
  console.error('build.gradle not found at ' + gradlePath);
  process.exit(1);
}

let content = fs.readFileSync(gradlePath, 'utf8');

// Regex to find versionCode
const versionCodeRegex = /(versionCode\s+)(\d+)/;
const match = content.match(versionCodeRegex);

if (!match) {
  console.error('Could not find versionCode in build.gradle');
  process.exit(1);
}

const currentCode = parseInt(match[2], 10);
const newCode = currentCode + 1;

content = content.replace(versionCodeRegex, `$1${newCode}`);

// Optional: also bump versionName patch version
const versionNameRegex = /(versionName\s+)"([^"]+)"/;
const nameMatch = content.match(versionNameRegex);
if (nameMatch) {
  const currentName = nameMatch[2];
  const parts = currentName.split('.');
  if (parts.length === 3) {
    parts[2] = parseInt(parts[2], 10) + 1;
    const newName = parts.join('.');
    content = content.replace(versionNameRegex, `$1"${newName}"`);
    console.log(`Bumping Android version: ${currentName} (${currentCode}) -> ${newName} (${newCode})`);
  } else {
    console.log(`Bumping Android versionCode: ${currentCode} -> ${newCode}`);
  }
} else {
  console.log(`Bumping Android versionCode: ${currentCode} -> ${newCode}`);
}

fs.writeFileSync(gradlePath, content, 'utf8');
