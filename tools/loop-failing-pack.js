/**
 * Repeats the confinement case "a failing pack over a partial clone" and reports every run whose outcome differs.
 *
 * The case replaces `pack-objects` with a git wrapper that exits 1; the build over a partial clone must then refuse naming
 * `rev-list`, `pack-objects` and the wrapper's message on every run (Story 1.120). A run that refuses anywhere else, such as
 * at `read-tree HEAD`, fails the case's check and is listed here with the message it carried.
 *
 * Usage: node tools/loop-failing-pack.js [--runs=200] [--parallel=1] [--log=<directory>]
 *   --runs      how many times the suite runs (default 200).
 *   --parallel  how many runs are in flight at once (default 1); the story's loop runs once serially and once at 8.
 *   --log       a directory that keeps every run's output as run-<n>.log (default: no logs; failing runs always print).
 *
 * Needs a host with git 2.44 or later: an older git skips the partial-clone cases, and every run then fails with that reason.
 * Exits 0 when every run passed, 1 when any run failed, did not exercise the case or could not keep its log, 2 on a bad argument.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SUITE = path.join(ROOT, 'test', 'test-evaluate-run.js');
const CASE = "the withheld git history's reach units";
const FAILING = 'a failing pack over a partial clone';

const KNOWN = new Set(['runs', 'parallel', 'log']);

/** The arguments as `{ name: value }`; a flag that is unknown, has no `=value` or repeats ends in a message. */
function options() {
  const given = {};
  for (const argument of process.argv.slice(2)) {
    const match = /^--([a-z]+)=(.+)$/.exec(argument);
    if (match === null || !KNOWN.has(match[1]) || match[1] in given) {
      return {
        error: `unexpected argument ${JSON.stringify(argument)}; the loop takes --runs=<n>, --parallel=<n> and --log=<directory> once each`,
      };
    }
    given[match[1]] = match[2];
  }
  return { given };
}

function positive(given, name, fallback) {
  if (!(name in given)) return fallback;
  const value = Number(given[name]);
  return Number.isInteger(value) && value >= 1
    ? value
    : { error: `--${name} takes a whole number of 1 or more, got ${JSON.stringify(given[name])}` };
}

/** One run of the suite; resolves with its exit code, its output and the check count the suite printed. */
function once() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SUITE, '--group=confinement', `--only=${CASE}`], {
      cwd: ROOT,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('error', (error) => resolve({ code: 1, output: `${output}\n${error.message}` }));
    child.on('close', (code) => resolve({ code, output }));
  });
}

/**
 * A run exercised the case when the suite counted checks and did not skip the partial-clone sections, which an older git does
 * (the suite prints "all 0 ... passed" when the case never ran, and fails the skip itself only when CI is set).
 */
function notExercised(output) {
  if (output.includes('skipped the partial-clone cases')) return 'the host skipped the partial-clone cases, so the failing pack never ran';
  const counted = /all (\d+) tea-evaluate run check\(s\) passed/.exec(output);
  if (counted === null) return 'the suite printed no check count, so the case did not finish';
  return Number(counted[1]) === 0 ? 'the suite counted no checks, so the case did not run' : null;
}

async function main() {
  const parsed = options();
  const runs = parsed.error === undefined ? positive(parsed.given, 'runs', 200) : parsed;
  const parallel = parsed.error === undefined ? positive(parsed.given, 'parallel', 1) : parsed;
  const bad = [parsed, runs, parallel].find((value) => value.error !== undefined);
  if (bad !== undefined) {
    console.error(bad.error);
    return 2;
  }
  const logs = parsed.given.log === undefined ? null : path.resolve(parsed.given.log);
  if (logs !== null) {
    try {
      fs.mkdirSync(logs, { recursive: true });
    } catch (error) {
      console.error(`cannot use ${logs} as the log directory: ${error.message}`);
      return 2;
    }
  }
  const failures = [];
  let next = 0;
  let passed = 0;
  async function worker() {
    for (;;) {
      const index = next++;
      if (index >= runs) return;
      const { code, output } = await once();
      if (logs !== null) {
        try {
          fs.writeFileSync(path.join(logs, `run-${index + 1}.log`), output);
        } catch (error) {
          failures.push({ run: index + 1, reason: `could not write the run's log: ${error.message}` });
          console.log(`run ${index + 1}: could not write its log: ${error.message}`);
          continue;
        }
      }
      const skipped = code === 0 ? notExercised(output) : null;
      if (code === 0 && skipped === null) {
        passed++;
        continue;
      }
      const reason =
        code === 0
          ? skipped
          : (output.split('\n').find((line) => line.includes(FAILING)) ?? output.trim().split('\n').slice(-3).join(' | '));
      failures.push({ run: index + 1, reason });
      console.log(`run ${index + 1} failed: ${reason}`);
    }
  }
  await Promise.all(Array.from({ length: parallel }, worker));
  console.log(`${passed} of ${runs} runs passed, ${failures.length} failed (parallel ${parallel})`);
  return failures.length === 0 ? 0 : 1;
}

main().then((code) => {
  process.exitCode = code;
});
