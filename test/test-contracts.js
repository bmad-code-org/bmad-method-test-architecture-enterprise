/**
 * Check every Behavioral Evaluation Contract under test/contracts/ against the
 * status test/contracts/expected-status.json records for it.
 *
 * The contracts are the machine-checkable statement of what a TEA skill has to
 * do. Nothing else in this repository can tell you whether one is well formed,
 * because the format belongs to eval-quality and its compiler is the only
 * authority on it.
 *
 * Every contract is `blocked` today. eval-quality's contract language can
 * describe a system under test that speaks HTTP, and a TEA skill runs behind a
 * command, so each one fails to parse in the same handful of places.
 * test/contracts/README.md records that finding in full. A baseline is what
 * keeps a known failure from reading as a passing check, and what makes the day
 * they start compiling visible instead of silent: a contract whose status moves
 * in EITHER direction fails this check until the baseline is updated to say so.
 *
 * The issue shapes in the baseline are locations with array indices collapsed,
 * so adding a case to a suite does not churn the file while a new KIND of
 * failure still does.
 *
 * This check never passes silently. eval-quality is deliberately not a declared
 * dependency yet, for the reason README.md gives, so an absent compiler is a
 * skip that says it skipped.
 *
 * Usage:
 *   node test/test-contracts.js
 *   node test/test-contracts.js --cli /path/to/eval-quality/dist/cli/main.js
 *   node test/test-contracts.js --cli <path> --write   # rewrite the baseline
 *
 * Exit codes:
 *   0  every contract matched its recorded status, or the compiler is absent
 *   1  a contract's status or failure shape moved away from the baseline
 *   2  the compiler was named and could not be run
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.join(__dirname, '..');
const CONTRACT_ROOT = path.join(__dirname, 'contracts');
const BASELINE = path.join(CONTRACT_ROOT, 'expected-status.json');

const colors = {
  reset: '\u001B[0m',
  red: '\u001B[31m',
  green: '\u001B[32m',
  yellow: '\u001B[33m',
  dim: '\u001B[2m',
};

/** Every *.contract.json under test/contracts, at any depth, in a stable order. */
function findContracts(directory) {
  if (!fs.existsSync(directory)) return [];
  const found = [];
  const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...findContracts(full));
    else if (entry.name.endsWith('.contract.json')) found.push(full);
  }
  return found;
}

/**
 * The compiler, or null when the package is not installed.
 *
 * An explicit --cli wins, so the check can run against a local build before a
 * release reaches npm. require.resolve settles the installed case, because it
 * answers from this repository's own resolution rather than from whatever
 * happens to be on PATH.
 */
function resolveCompiler(argv) {
  const flagIndex = argv.indexOf('--cli');
  if (flagIndex !== -1) {
    const value = argv[flagIndex + 1];
    if (!value) {
      console.error(`${colors.red}--cli requires a path to eval-quality's built CLI entry point${colors.reset}`);
      process.exit(2);
    }
    if (!fs.existsSync(value)) {
      console.error(`${colors.red}--cli names a path that does not exist: ${value}${colors.reset}`);
      process.exit(2);
    }
    return value;
  }
  try {
    // eval-quality is a declared devDependency, so this resolves in a normal
    // install. The catch below is for a tree installed with --omit=dev, where
    // the honest answer is a skip that says it skipped.
    const manifest = require.resolve('eval-quality/package.json', { paths: [PROJECT_ROOT] });
    return path.join(path.dirname(manifest), 'dist', 'cli', 'main.js');
  } catch {
    return null;
  }
}

/**
 * The compiler's stderr reduced to the distinct kinds of failure it reported.
 *
 * Array indices collapse to `N` so a suite that grows by a case does not
 * rewrite the baseline, while a new kind of failure still does. The first line
 * carries the failure code and is kept whole.
 */
function failureShape(stderr) {
  const lines = String(stderr || '')
    .trim()
    .split('\n');
  const first = lines[0] ?? '';
  const code = /^eval-quality: ([a-z-]+):/.exec(first)?.[1] ?? 'unknown';
  const shapes = new Set();
  for (const line of lines.slice(1)) {
    const located = /^\s+(\/\S*|\(root\)):/.exec(line);
    if (located) shapes.add(located[1].replaceAll(/\/\d+/g, '/N'));
    else if (line.trim().startsWith('... and ')) shapes.add('(truncated)');
  }
  return { code, issueShapes: [...shapes].sort() };
}

function readBaseline() {
  if (!fs.existsSync(BASELINE)) return {};
  const parsed = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  return parsed.contracts ?? {};
}

function writeBaseline(observed) {
  const body = {
    $comment: [
      'The status this repository expects from each contract under test/contracts/.',
      '',
      'Every entry is `blocked` today, because eval-quality cannot yet describe a command-line system',
      'under test. test/contracts/README.md records that finding with its evidence.',
      '',
      'A contract whose status moves in either direction fails test/test-contracts.js. Moving to',
      '`compiles` is the good direction and still fails, on purpose: a baseline nobody has to update is',
      'a baseline nobody reads.',
      '',
      'Regenerate with: node test/test-contracts.js --cli <path to eval-quality dist/cli/main.js> --write',
    ],
    contracts: Object.fromEntries(
      Object.keys(observed)
        .sort()
        .map((key) => [key, observed[key]]),
    ),
  };
  fs.writeFileSync(BASELINE, `${JSON.stringify(body, null, 2)}\n`);
}

function sameShape(actual, expected) {
  if (!expected || actual.status !== expected.status) return false;
  if (actual.status === 'compiles') return true;
  return (
    actual.code === expected.code &&
    actual.issueShapes.length === (expected.issueShapes ?? []).length &&
    actual.issueShapes.every((shape, index) => shape === expected.issueShapes[index])
  );
}

function main(argv) {
  const contracts = findContracts(CONTRACT_ROOT);
  if (contracts.length === 0) {
    console.error(`${colors.red}no *.contract.json found under test/contracts${colors.reset}`);
    return 1;
  }

  const write = argv.includes('--write');
  const compiler = resolveCompiler(argv);
  if (compiler === null) {
    console.log(
      `${colors.yellow}skipped${colors.reset}: eval-quality is not installed, so ${contracts.length} contract(s) went unchecked.`,
    );
    console.log(`${colors.dim}Install it, or pass --cli <path to dist/cli/main.js>. See test/contracts/README.md.${colors.reset}`);
    return 0;
  }

  const expected = readBaseline();
  const observed = {};
  const moved = [];

  for (const contract of contracts) {
    const key = path.relative(CONTRACT_ROOT, contract);
    const result = spawnSync(process.execPath, [compiler, 'compile', '--in', contract], { encoding: 'utf8' });
    if (result.error) {
      console.error(`${colors.red}could not run the compiler: ${result.error.message}${colors.reset}`);
      return 2;
    }
    // 64 is eval-quality's usage error, which means this check invoked it wrong
    // rather than that the contract is bad.
    if (result.status === 64) {
      console.error(`${colors.red}the compiler rejected this check's own invocation${colors.reset}`);
      console.error(`${colors.dim}${(result.stderr || '').trim()}${colors.reset}`);
      return 2;
    }

    const actual = result.status === 0 ? { status: 'compiles' } : { status: 'blocked', ...failureShape(result.stderr) };
    observed[key] = actual;

    if (write) continue;
    if (sameShape(actual, expected[key])) {
      const note = actual.status === 'compiles' ? 'compiles' : `blocked on ${actual.code}, ${actual.issueShapes.length} issue shape(s)`;
      console.log(`${colors.green}OK${colors.reset}   ${key} ${colors.dim}(${note})${colors.reset}`);
      continue;
    }
    moved.push({ key, actual, expected: expected[key] });
  }

  if (write) {
    writeBaseline(observed);
    console.log(`${colors.green}wrote${colors.reset} ${path.relative(PROJECT_ROOT, BASELINE)} for ${contracts.length} contract(s).`);
    return 0;
  }

  for (const { key, actual, expected: before } of moved) {
    console.error(`${colors.red}MOVED${colors.reset} ${key}`);
    console.error(`  recorded: ${before ? JSON.stringify(before) : '(no entry)'}`);
    console.error(`  observed: ${JSON.stringify(actual)}`);
  }
  if (moved.length > 0) {
    console.error(
      `\n${colors.red}${moved.length} contract(s) moved away from the recorded status.${colors.reset} Re-run with --write once you have read why.`,
    );
    return 1;
  }
  console.log(`\n${colors.green}${contracts.length} contract(s) match their recorded status.${colors.reset}`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { findContracts, resolveCompiler, failureShape };
