/**
 * Prove the clock port is in the path that produces a duration.
 *
 * WHY THIS FILE EXISTS
 *
 * `test/test-probe-conformance.js` certifies `createSystemClockAdapter` against
 * the package's own six assertions. That is worth having and it proves nothing
 * about TEA, because the conformance runner builds its own adapter and never
 * touches a TEA call site. A story that adopted the port, certified it, and left
 * every harness reading `Date.now()` would pass that check unchanged.
 *
 * So the question this file answers is the only one that distinguishes adoption
 * from decoration: if someone replaced the port call with `Date.now()`, what
 * fails?
 *
 * The answer is this file, and the mechanism is a scripted clock.
 * `test/lib/clock.js` reads `TEA_CLOCK_FIXTURE` and, when it is set, feeds the
 * adapter a list of ISO instants instead of the system clock. A harness run under
 * that fixture must report exactly the scripted delta. `Date.now()` ignores the
 * variable and reports real elapsed time, which is a few milliseconds rather than
 * the hours the fixture scripts, so the assertion fails by three orders of
 * magnitude rather than by a rounding error.
 *
 * The scripted delta is deliberately a value no real run could produce. A fixture
 * scripting a two-millisecond gap would be indistinguishable from a fast real
 * run, and a check that a wrong implementation can satisfy by luck is not a check.
 *
 * The harness is driven end to end against the stub agent, so the duration under
 * assertion is the one a real `--json` result record carries rather than a value
 * read back out of a helper.
 *
 * No model call, no credential, no network.
 *
 * Usage: node test/test-clock-port.js
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.join(__dirname, '..');
const HARNESS = path.join(PROJECT_ROOT, 'test', 'eval-test-design.js');
const STUB = path.join(PROJECT_ROOT, 'test', 'fixtures', 'test-design-runner', 'stub-agent.js');

const colors = { reset: '[0m', red: '[31m', green: '[32m', dim: '[2m' };

let passed = 0;
let failed = 0;

function assert(condition, name, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ${colors.green}✓${colors.reset} ${name}`);
    return;
  }
  failed += 1;
  console.error(`  ${colors.red}✗ ${name}${colors.reset}`);
  if (detail) console.error(`    ${colors.dim}${detail}${colors.reset}`);
}

/**
 * Instants a real run cannot produce.
 *
 * The gaps are hours, and every reading the run takes has to come from this list
 * in order. Twelve is more than any single-set, single-repetition run needs; the
 * mechanism throws rather than falling back when a run asks for more, so a short
 * fixture fails loudly instead of quietly measuring the system clock.
 */
function scriptedInstants() {
  const base = Date.parse('2026-03-01T00:00:00.000Z');
  const hour = 3_600_000;
  return Array.from({ length: 12 }, (_, index) => new Date(base + index * hour).toISOString());
}

function runHarnessUnderScriptedClock(fixturePath, jsonPath) {
  return spawnSync(
    process.execPath,
    [HARNESS, '--agent', 'custom', '--agent-cmd', STUB, '--runs', '1', '--set', 'seeded-offline-order-capture', '--json', jsonPath],
    {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      timeout: 300_000,
      env: { ...process.env, TEA_CLOCK_FIXTURE: fixturePath, STUB_MODE: 'correct' },
    },
  );
}

function main() {
  console.log(`${colors.dim}the clock port is in the path that produces a duration${colors.reset}\n`);

  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-clock-port-'));
  try {
    const fixturePath = path.join(workspace, 'instants.txt');
    const instants = scriptedInstants();
    fs.writeFileSync(fixturePath, `${instants.join('\n')}\n`, 'utf8');
    const jsonPath = path.join(workspace, 'result.json');

    const run = runHarnessUnderScriptedClock(fixturePath, jsonPath);
    assert(
      fs.existsSync(jsonPath),
      'the harness wrote a result record under the scripted clock',
      `exit ${run.status}: ${String(run.stderr || run.stdout || '')
        .trim()
        .split('\n')
        .slice(-3)
        .join(' | ')}`,
    );
    if (!fs.existsSync(jsonPath)) return 1;

    const record = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const durations = [record.durationMs, ...(record.runners ?? []).map((runner) => runner.durationMs)].filter(
      (value) => typeof value === 'number',
    );
    assert(durations.length > 0, 'the record carries at least one duration', JSON.stringify(record).slice(0, 200));

    // Every scripted gap is a whole hour, so every duration the run reports is a
    // positive multiple of one hour. Real elapsed time over a stub run is a few
    // milliseconds and cannot be.
    const hour = 3_600_000;
    const offScript = durations.filter((value) => value === 0 || value % hour !== 0);
    assert(
      offScript.length === 0,
      'every duration in the record is a whole number of scripted hours',
      `durations ${JSON.stringify(durations)}; ${JSON.stringify(offScript)} did not come from the scripted clock, so a reading bypassed the port`,
    );

    // The sharper half of the same claim, stated as the substitution it rules
    // out: a reading taken with Date.now() over this run lands in single-digit
    // seconds at most. Nothing here may.
    const plausiblyReal = durations.filter((value) => value < 60_000);
    assert(
      plausiblyReal.length === 0,
      'no duration is small enough to have come from the system clock',
      `durations ${JSON.stringify(durations)}; ${JSON.stringify(plausiblyReal)} are within the range a real stub run produces`,
    );

    // The fixture is exhaustible on purpose. A run that asked for more instants
    // than it scripts has to fail rather than silently read the system clock,
    // which is what keeps the assertions above meaningful.
    const shortFixture = path.join(workspace, 'short.txt');
    fs.writeFileSync(shortFixture, `${instants[0]}\n`, 'utf8');
    const shortRun = runHarnessUnderScriptedClock(shortFixture, path.join(workspace, 'short.json'));
    assert(
      shortRun.status !== 0,
      'a fixture too short to serve the run fails rather than falling back to the system clock',
      `exit ${shortRun.status}`,
    );
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }

  console.log(`\n${failed === 0 ? colors.green : colors.red}${passed} passed, ${failed} failed${colors.reset}\n`);
  return failed === 0 ? 0 : 1;
}

process.exit(main());
