#!/usr/bin/env node
/**
 * Prove the watch trains the same exercises as the phone, or show where it does
 * not.
 *
 * The question "are they exactly the same?" cannot be answered by looking at two
 * screens, and it cannot honestly be answered by reading two implementations
 * either - which is what was being attempted, twice, without settling it. So
 * this asks both programs to state their own answer and diffs the two files.
 *
 * Both sides emit the REAL output:
 *
 *   - The phone runs its own `getSteps` and `getDurationForLevel` inside its
 *     test runner, so what comes out is the TypeScript the app actually ships.
 *   - The watch runs `SessionBuilder.dumpAllForComparison()` on the emulator,
 *     so what comes out is the Kotlin the watch actually ships.
 *
 * Neither is a transcription of the other, which is the point: a re-implementation
 * in a third language would only ever prove the re-implementation right.
 *
 * What is compared, for all 17 exercises at all 5 levels: the total duration,
 * the number of steps, and every step's phase, length and from->to pair - which
 * together are the entire definition of what an exercise does and what the
 * circle draws while it does it.
 *
 * Usage, with a Wear emulator or watch attached:
 *
 *   node scripts/compare-exercises.cjs
 *
 * Exits non-zero on any difference, so it can gate a release.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const WEAR_ROOT = path.join(__dirname, '..');
const PHONE_ROOT = path.join(WEAR_ROOT, '..', 'react-native-app');
const PKG = 'com.kegelee.app';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'kegelee-compare-'));

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', ...opts });

/** The device to talk to: an explicit serial, else the one emulator. */
function deviceArgs() {
  if (process.env.ANDROID_SERIAL) return ['-s', process.env.ANDROID_SERIAL];
  const lines = run('adb', ['devices']).split('\n').slice(1)
    .map((l) => l.trim()).filter((l) => l.endsWith('\tdevice'))
    .map((l) => l.split('\t')[0]);
  const emulators = lines.filter((s) => s.startsWith('emulator-'));
  if (emulators.length === 1) return ['-s', emulators[0]];
  if (lines.length === 1) return ['-s', lines[0]];
  throw new Error(
    `Cannot tell which device to use (${lines.join(', ') || 'none attached'}). ` +
    'Set ANDROID_SERIAL to the watch or emulator.',
  );
}

/** Ask the phone's own test runner for its answer. */
function dumpPhone() {
  const out = path.join(TMP, 'phone.json');
  const spec = path.join(PHONE_ROOT, '__tests__', '__compare_dump.test.ts');
  fs.writeFileSync(spec, `
import fs from 'fs';
import { EXERCISES, getSteps } from '../src/constants/catalogues';
import { getDurationForLevel } from '../src/services/sessionBuilder';
it('dumps every exercise at every level', () => {
  const out: any = {};
  for (const def of Object.values(EXERCISES).sort((a: any, b: any) => a.sort_order - b.sort_order)) {
    const slug = (def as any).slug;
    out[slug] = {};
    for (let level = 1; level <= 5; level++) {
      const duration = getDurationForLevel(slug, level);
      out[slug][level] = {
        duration,
        steps: getSteps(slug, duration).map((s: any) => \`\${s.phase} \${s.seconds} \${s.from}->\${s.to}\`),
      };
    }
  }
  fs.writeFileSync(process.env.COMPARE_OUT as string, JSON.stringify(out, null, 1));
  expect(true).toBe(true);
});
`);
  try {
    run('npx', ['jest', '__tests__/__compare_dump.test.ts', '--silent'], {
      cwd: PHONE_ROOT,
      env: { ...process.env, COMPARE_OUT: out },
      stdio: 'pipe',
      shell: process.platform === 'win32',
    });
  } finally {
    fs.unlinkSync(spec);
  }
  return JSON.parse(fs.readFileSync(out, 'utf8'));
}

/** Ask the watch build on the device for its answer. */
function dumpWatch(dev) {
  run('adb', [...dev, 'shell', 'am', 'start', '-n', `${PKG}/.wear.MainActivity`, '--ez', 'dump', 'true'], { stdio: 'pipe' });
  /**
   * Poll for the file rather than sleeping a fixed amount.
   *
   * The activity writes it and finishes immediately, but "immediately" on an
   * emulator under load is not the same as on a watch - and a sleep long enough
   * to be safe on the slowest of them is a sleep wasted on all the others.
   */
  let raw = '';
  for (let attempt = 0; attempt < 25; attempt++) {
    try {
      raw = run('adb', [...dev, 'shell', 'run-as', PKG, 'cat', `/data/data/${PKG}/files/exercises.json`]);
    } catch { raw = ''; }
    if (raw.trim().startsWith('{')) break;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
  }
  if (!raw.trim().startsWith('{')) {
    throw new Error(
      'The watch produced no dump. Install the DEBUG build first:\n' +
      '  gradlew assembleDebug && adb install -r app/build/outputs/apk/debug/app-debug.apk',
    );
  }
  return JSON.parse(raw);
}

function main() {
  const dev = deviceArgs();
  process.stdout.write('phone: running its own test runner...\n');
  const phone = dumpPhone();
  process.stdout.write('watch: asking the build on the device...\n');
  const watch = dumpWatch(dev);

  const slugs = Object.keys(phone);
  let checked = 0;
  const problems = [];

  for (const slug of slugs) {
    if (!watch[slug]) {
      problems.push(`${slug}: missing from the watch entirely`);
      continue;
    }
    for (let level = 1; level <= 5; level++) {
      const p = phone[slug][level];
      const w = watch[slug][level];
      checked++;
      if (!w) {
        problems.push(`${slug} L${level}: missing from the watch`);
        continue;
      }
      if (Number(p.duration) !== Number(w.duration)) {
        problems.push(`${slug} L${level}: duration phone=${p.duration} watch=${w.duration}`);
      }
      if (p.steps.length !== w.steps.length) {
        problems.push(`${slug} L${level}: ${p.steps.length} steps on the phone, ${w.steps.length} on the watch`);
        continue;
      }
      p.steps.forEach((step, i) => {
        if (step !== w.steps[i]) {
          problems.push(`${slug} L${level} step ${i}: phone "${step}" watch "${w.steps[i]}"`);
        }
      });
    }
  }

  process.stdout.write(`\nCompared ${checked} exercise/level combinations.\n`);
  if (problems.length === 0) {
    process.stdout.write('Every duration, step count, phase, length and from->to pair matches.\n');
    return;
  }
  process.stdout.write(`\n${problems.length} difference(s):\n`);
  // Capped: a systematic fault produces hundreds of these and the first few
  // say the same thing as all of them.
  problems.slice(0, 40).forEach((p) => process.stdout.write(`  ${p}\n`));
  if (problems.length > 40) process.stdout.write(`  ... and ${problems.length - 40} more\n`);
  process.exitCode = 1;
}

try {
  main();
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}
