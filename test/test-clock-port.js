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

/**
 * Every harness that reads the clock, with the cheapest argv that still writes a
 * result record.
 *
 * Pinning one harness was the hole a review found: five of the thirty-eight port
 * call sites live in `eval-test-design.js`, so reverting the other thirty-three
 * shipped with a green gate. A scripted run of each one closes it, and
 * `--validate-only` and `--preflight-only` both write a record with a duration in
 * it while spending no model call and no credential.
 *
 * `eval-contract-strength.js` is absent because it writes no suite-result record:
 * its artifact is a cost report under its own shape, and its pre-flight declines
 * `--agent-cmd` entirely. Its readings are covered by the source scan below,
 * which is the weaker check and the only one that fits it.
 *
 * `eval-all.js` is absent from this list and covered separately, because every
 * route through it that writes a suite record spawns one child per suite, which
 * is a whole eval run. It is reached below through the one branch that writes a
 * full summary and spawns nothing.
 */
const HARNESSES = [
  { file: 'eval-test-design.js', args: ['--validate-only'] },
  { file: 'eval-trace.js', args: ['--validate-only'] },
  { file: 'eval-fragment-selection.js', args: ['--validate-only'] },
  { file: 'eval-bmad-tea-routing.js', args: ['--validate-only'] },
  { file: 'eval-test-review.js', args: ['--preflight-only', '--agent', 'custom', '--agent-cmd', process.execPath] },
];
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
 *
 * The base sits decades away from wall-clock time, and the distance is doing
 * work. A half-reverted run that takes its start mark from `Date.now()` and its
 * end mark from the scripted clock produces a delta of that distance, which the
 * whole-hour check rejects. Move the base near the current date and that
 * detection narrows to the chance the two happen to differ by a whole hour.
 */
function scriptedInstants() {
  const base = Date.parse('2001-01-01T00:00:00.000Z');
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
      env: { ...process.env, TEA_CLOCK_FIXTURE: fixturePath, TEA_CLOCK_FIXTURE_ALLOW_RECORD: '1', STUB_MODE: 'correct' },
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

    // Every other harness, under the same scripted clock. One harness proving the
    // port is in its own path says nothing about the other six.
    for (const harness of HARNESSES) {
      const perFixture = path.join(workspace, `${harness.file}.txt`);
      fs.writeFileSync(perFixture, `${instants.join('\n')}\n`, 'utf8');
      const perJson = path.join(workspace, `${harness.file}.json`);
      const result = spawnSync(process.execPath, [path.join(PROJECT_ROOT, 'test', harness.file), ...harness.args, '--json', perJson], {
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
        timeout: 300_000,
        env: { ...process.env, TEA_CLOCK_FIXTURE: perFixture, TEA_CLOCK_FIXTURE_ALLOW_RECORD: '1' },
      });
      if (!fs.existsSync(perJson)) {
        assert(false, `${harness.file} wrote a record under the scripted clock`, `exit ${result.status}`);
        continue;
      }
      const perRecord = JSON.parse(fs.readFileSync(perJson, 'utf8'));
      const perDurations = [perRecord.durationMs, ...(perRecord.runners ?? []).map((runner) => runner.durationMs)].filter(
        (value) => typeof value === 'number',
      );
      // Zero is rejected here for the same reason it is rejected above. A run that
      // takes its start mark from the wall clock and its end mark from a clock
      // scripted decades earlier produces a negative delta, which `elapsedMsSince`
      // clamps to zero, so zero is the signature of a half-revert rather than a
      // fast run. Under a scripted clock every legitimate duration is at least one
      // scripted hour.
      const offScriptHere = perDurations.filter((value) => value === 0 || value % hour !== 0);
      assert(
        perDurations.length > 0 && offScriptHere.length === 0,
        `${harness.file} takes every duration from the clock port`,
        `durations ${JSON.stringify(perDurations)}`,
      );
      assert(
        typeof perRecord.generatedAt === 'string' && perRecord.generatedAt.startsWith(instants[0].slice(0, 4)),
        `${harness.file} stamps generatedAt from the clock port`,
        `generatedAt ${perRecord.generatedAt}`,
      );
    }

    // `eval-all.js` reaches its record through a path the loop above cannot use,
    // because every other route spawns one child process per suite and that is a
    // whole eval run. Its unaccounted-skills branch writes a full run summary,
    // with a port duration and a port stamp, and exits before spawning anything.
    // A TEA skill is a directory under `src/workflows/testarch` or `src/agents`,
    // so an empty directory the manifest does not account for reaches that branch
    // and nothing else. Git does not track an empty directory, so a crash between
    // the two calls below leaves the working tree clean.
    const probeSkill = path.join(PROJECT_ROOT, 'src', 'workflows', 'testarch', 'tea-clock-port-probe');
    const allJson = path.join(workspace, 'eval-all.json');
    fs.mkdirSync(probeSkill, { recursive: true });
    let allRun;
    try {
      const allFixture = path.join(workspace, 'eval-all.txt');
      fs.writeFileSync(allFixture, `${instants.join('\n')}\n`, 'utf8');
      // `--agent` is required before argv parsing completes, and the branch this
      // reaches exits before any child is spawned, so the value never runs.
      allRun = spawnSync(
        process.execPath,
        [path.join(PROJECT_ROOT, 'test', 'eval-all.js'), '--agent', 'custom', '--agent-cmd', process.execPath, '--json', allJson],
        {
          cwd: PROJECT_ROOT,
          encoding: 'utf8',
          timeout: 120_000,
          env: { ...process.env, TEA_CLOCK_FIXTURE: allFixture, TEA_CLOCK_FIXTURE_ALLOW_RECORD: '1' },
        },
      );
    } finally {
      fs.rmSync(probeSkill, { recursive: true, force: true });
    }
    if (fs.existsSync(allJson)) {
      const allRecord = JSON.parse(fs.readFileSync(allJson, 'utf8'));
      assert(
        typeof allRecord.durationMs === 'number' && allRecord.durationMs !== 0 && allRecord.durationMs % hour === 0,
        'eval-all.js takes its duration from the clock port',
        `durationMs ${allRecord.durationMs}`,
      );
      assert(
        typeof allRecord.generatedAt === 'string' && allRecord.generatedAt.startsWith(instants[0].slice(0, 4)),
        'eval-all.js stamps generatedAt from the clock port',
        `generatedAt ${allRecord.generatedAt}`,
      );
    } else {
      assert(false, 'eval-all.js wrote a run summary under the scripted clock', `exit ${allRun?.status}`);
    }

    // The fixture is exhaustible on purpose. A run that asked for more instants
    // than it scripts has to fail rather than silently read the system clock,
    // which is what keeps the assertions above meaningful.
    const shortFixture = path.join(workspace, 'short.txt');
    fs.writeFileSync(shortFixture, `${instants[0]}\n`, 'utf8');
    const shortJson = path.join(workspace, 'short.json');
    const shortRun = runHarnessUnderScriptedClock(shortFixture, shortJson);
    assert(
      shortRun.status !== 0,
      'a fixture too short to serve the run fails rather than falling back to the system clock',
      `exit ${shortRun.status}`,
    );
    // The exit code alone is not enough. `test/eval-test-design.js` converts a
    // throw inside one run into a scored lost run, which also exits non-zero, so
    // an exhausted clock swallowed there would satisfy the assertion above for a
    // reason that has nothing to do with the clock. The failure has to name the
    // port, and no result record may be written, which is what distinguishes a
    // clock that refused from a run that merely went wrong.
    const shortOutput = String(shortRun.stderr || '') + String(shortRun.stdout || '');
    assert(
      /ClockReadResponse|scripted clock/.test(shortOutput),
      'the short-fixture failure names the clock rather than some other lost run',
      shortOutput.trim().split('\n').slice(-3).join(' | '),
    );
    assert(
      !fs.existsSync(shortJson),
      'the exhausted clock wrote no result record, so no duration was recorded from a fallback',
      `a record exists at ${shortJson}`,
    );
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }

  // Cheap insurance over the spawn loop above, and the only cover for the one
  // harness that writes no suite-result record. A reading reintroduced anywhere
  // in a harness fails here even where no scripted run reaches it.
  const harnessFiles = fs.readdirSync(path.join(PROJECT_ROOT, 'test')).filter((name) => name.startsWith('eval-') && name.endsWith('.js'));
  // Every way of reading the host clock, not only `Date.now()`. Scanning for that
  // one form missed the exact line finding 2 removed: putting
  // `generatedAt: new Date().toISOString()` back into a harness passed the scan
  // while reintroducing the defect. `new Date(value)` with an argument is a
  // conversion rather than a reading, and the harnesses use it to render a mark
  // the port already gave them, so only the no-argument form is refused.
  const wallClockRead = /\b(?:Date\.now|performance\.now|process\.hrtime)\s*\(|new\s+Date\s*\(\s*\)/;
  const withWallClock = harnessFiles.filter((name) => {
    const body = fs.readFileSync(path.join(PROJECT_ROOT, 'test', name), 'utf8');
    return body
      .split('\n')
      .filter((line) => !/^\s*(?:\/\/|\*|\/\*)/.test(line))
      .some((line) => wallClockRead.test(line));
  });
  assert(
    withWallClock.length === 0,
    `none of the ${harnessFiles.length} harnesses reads the wall clock directly`,
    `${withWallClock.join(', ')} still call Date.now(); every duration reaches a record through test/lib/clock.js`,
  );

  console.log(`\n${failed === 0 ? colors.green : colors.red}${passed} passed, ${failed} failed${colors.reset}\n`);
  return failed === 0 ? 0 : 1;
}

process.exit(main());
