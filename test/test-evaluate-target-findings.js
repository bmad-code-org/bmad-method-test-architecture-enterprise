/**
 * Target findings across target kinds: `target-findings.json` produced from a scored run and held by `tea-evaluate check`.
 *
 * Each case copies a real fixture evaluation with its target and spawns the real bin over it:
 *
 * - a skill (`evaluate-tutorial`, the refund-check skill through `tea-skill-runner`), an MCP tool server (`evaluate-mcp`) and an
 *   AI-feature HTTP service (`evaluate-api`), each with an accepted baseline;
 * - the scored development run every finding cites is written from that baseline, with the isolation path (MCP) and the
 *   interpretation process finding (API) the findings cite, so every citation resolves against evidence on disk;
 * - before the file exists `check` warns that a scored evaluation has no target findings; an empty list records "no improvements"
 *   and warns of nothing; the committed findings (`test/fixtures/evaluate-target-findings/<kind>/`) check clean with no warning;
 * - an undecided finding and a this-pr finding with no measurement each warn and keep exit 0, since the gap loop's own `check`
 *   must keep passing until the decision point;
 * - every planted defect exits 10 naming `target-findings.json` and its rule: a cited trial, trial count, score, isolation path,
 *   interpretation finding, behavior, probe, clean control, excerpt, handoff or evaluation the folder does not bear out, findings
 *   out of order or repeated, a measurement of one run, a behavior failing every trial filed as intermittent, and shapes the
 *   schema refuses;
 * - a held-out probe (`evaluate-gap-loop/after`) is cited by its gap-view row alone: its trials are refused.
 *
 * Usage: node test/test-evaluate-target-findings.js
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { scratchDirectories } = require('./lib/scratch-directories');

const ROOT = path.join(__dirname, '..');
const CLI = path.join(ROOT, 'cli', 'evaluate.js');
const FIXTURES = path.join(__dirname, 'fixtures');
const FINDINGS = path.join(FIXTURES, 'evaluate-target-findings');
const RUN = '20261125T100000000Z-0a1b2c3d';
const SCORE = '20261125T100100000Z-0a1b2c3d';
const FILE = 'target-findings.json';

const KINDS = [
  { kind: 'skill', fixture: 'evaluate-tutorial', evaluation: 'evaluation' },
  { kind: 'mcp', fixture: 'evaluate-mcp', evaluation: 'evals/grader' },
  { kind: 'api', fixture: 'evaluate-api', evaluation: 'evals/grader' },
];

const scratch = scratchDirectories('tea-evaluate-target-findings');
const failures = [];
let cases = 0;

function test(name, body) {
  cases += 1;
  try {
    body();
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function check(folder) {
  const result = spawnSync(process.execPath, [CLI, 'check', '--evaluation', folder], { cwd: ROOT, encoding: 'utf8' });
  if (result.error) throw result.error;
  return result;
}

function warningsOf(result) {
  return result.stderr.split('\n').filter((line) => line.startsWith(`warning: ${FILE}: [target-findings]`));
}

function findingsOf(result) {
  return result.stdout.split('\n').filter((line) => line.startsWith(`${FILE}: `));
}

/** A copy of one fixture evaluation with its target beside it, as `launch.root` reaches it. */
function copyEvaluation({ fixture, evaluation }) {
  const root = path.join(scratch.make(fixture), fixture);
  fs.cpSync(path.join(FIXTURES, fixture), root, {
    recursive: true,
    filter: (source) => !source.split(path.sep).includes('runs') && !source.split(path.sep).includes('node_modules'),
  });
  return path.join(root, ...evaluation.split('/'));
}

/**
 * The scored development run the findings cite, written from the accepted baseline: the same trial sets and per-probe scores
 * under the run's own score invocation, with the evidence each kind's findings add.
 */
function writeRun(folder, kind) {
  const baseline = readJson(path.join(folder, 'baseline', 'baseline.json'));
  const run = path.join(folder, 'runs', RUN);
  fs.cpSync(path.join(folder, 'baseline'), run, { recursive: true });
  fs.renameSync(path.join(run, 'scores', baseline.scoreInvocationId), path.join(run, 'scores', SCORE));
  const runRecord = readJson(path.join(run, 'run.json'));
  writeJson(path.join(run, 'run.json'), { ...runRecord, invocationId: RUN, seed: RUN });
  if (kind === 'mcp') {
    const manifest = path.join(run, 'trial-sets', 'P-001', 'isolation-manifest.json');
    writeJson(manifest, { ...readJson(manifest), observedMounts: ['/home/adopter/.npmrc'] });
  }
  if (kind === 'api') {
    writeJson(path.join(run, 'interpretation.json'), {
      scoreInvocationId: SCORE,
      probes: [
        {
          probeId: 'P-001',
          trials: [1, 2, 3].map((trialIndex) => ({
            trialIndex,
            findings: trialIndex === 1 ? [{ findingId: 'F-001' }] : [],
            process: trialIndex === 1 ? ['F-001'] : [],
            outcome: [],
          })),
        },
      ],
    });
  }
}

function placeFindings(folder, kind) {
  for (const name of fs.readdirSync(path.join(FINDINGS, kind))) fs.copyFileSync(path.join(FINDINGS, kind, name), path.join(folder, name));
}

/** Rewrites the folder's findings through `edit` and checks it. */
function checkEdited(folder, edit) {
  const value = readJson(path.join(folder, FILE));
  edit(value);
  writeJson(path.join(folder, FILE), value);
  return check(folder);
}

function expectFinding(result, rule, fragment) {
  assert.equal(result.status, 10, `expected exit 10, got ${result.status}:\n${result.stdout}${result.stderr}`);
  const lines = findingsOf(result);
  assert.ok(
    lines.some((line) => line.includes(`[${rule}]`) && line.includes(fragment)),
    `no ${FILE} [${rule}] finding holds ${JSON.stringify(fragment)}:\n${result.stdout}`,
  );
}

function expectClean(result) {
  assert.equal(result.status, 0, `expected exit 0, got ${result.status}:\n${result.stdout}${result.stderr}`);
  assert.deepEqual(findingsOf(result), []);
}

/** Each case starts from the kind's committed findings over a fresh copy with the cited run written. */
function prepared(entry) {
  const folder = copyEvaluation(entry);
  writeRun(folder, entry.kind);
  placeFindings(folder, entry.kind);
  return folder;
}

for (const entry of KINDS) {
  const { kind } = entry;

  test(`${kind}: a scored evaluation with no target findings warns, and an empty list is the explicit no-improvement state`, () => {
    const folder = copyEvaluation(entry);
    const before = check(folder);
    expectClean(before);
    assert.equal(warningsOf(before).length, 1, before.stderr);
    assert.match(warningsOf(before)[0], /has scored evidence and no target-findings\.json/);
    writeJson(path.join(folder, FILE), {
      schemaVersion: 1,
      evaluationId: readJson(path.join(folder, 'evaluation.json')).evaluationId,
      findings: [],
    });
    const empty = check(folder);
    expectClean(empty);
    assert.deepEqual(warningsOf(empty), []);
  });

  test(`${kind}: the decided findings produced from the scored run check clean with no warning`, () => {
    const result = check(prepared(entry));
    expectClean(result);
    assert.deepEqual(warningsOf(result), []);
    assert.match(result.stdout, /has no authoring defects/);
  });

  test(`${kind}: an undecided finding and an unmeasured this-pr finding warn and keep exit 0`, () => {
    const folder = prepared(entry);
    const undecided = checkEdited(folder, (value) => {
      value.findings[0].disposition = { decision: 'undecided' };
    });
    expectClean(undecided);
    assert.ok(
      warningsOf(undecided).some((line) => line.includes('finding T-001 is undecided')),
      undecided.stderr,
    );
    const unmeasured = checkEdited(folder, (value) => {
      value.findings[0].disposition = { decision: 'this-pr' };
    });
    expectClean(unmeasured);
    assert.ok(
      warningsOf(unmeasured).some((line) => line.includes('finding T-001 is decided this-pr and records no measurement')),
      unmeasured.stderr,
    );
  });

  test(`${kind}: a finding naming an undeclared behavior, an uncommitted probe or another evaluation is refused`, () => {
    const folder = prepared(entry);
    expectFinding(
      checkEdited(folder, (value) => {
        value.findings[0].behaviorId = 'B-099';
      }),
      'reference',
      'names behavior B-099, which contract.json does not declare',
    );
    expectFinding(
      checkEdited(folder, (value) => {
        value.findings[0].behaviorId = 'B-001';
        value.findings[0].evidence.probe = 'P-099';
      }),
      'reference',
      'cites probe P-099, which probes/ does not hold',
    );
    placeFindings(folder, kind);
    expectFinding(
      checkEdited(folder, (value) => {
        value.evaluationId = 'another-evaluation';
      }),
      'target-findings',
      'evaluationId "another-evaluation" is not',
    );
  });

  test(`${kind}: repeated, unordered and one-run measurements are refused`, () => {
    const folder = prepared(entry);
    expectFinding(
      checkEdited(folder, (value) => {
        value.findings[1].id = 'T-001';
      }),
      'duplicate-id',
      'finding ID "T-001" is declared more than once',
    );
    placeFindings(folder, kind);
    expectFinding(
      checkEdited(folder, (value) => {
        value.findings.reverse();
      }),
      'target-findings',
      'finding T-001 follows T-002; list findings in ID order',
    );
    placeFindings(folder, kind);
    expectFinding(
      checkEdited(folder, (value) => {
        value.findings[0].disposition = {
          decision: 'this-pr',
          measurement: { before: { run: RUN, score: SCORE }, after: { run: RUN, score: SCORE } },
        };
      }),
      'target-findings',
      `measures run ${RUN} before and after`,
    );
  });

  test(`${kind}: shapes the schema refuses`, () => {
    const folder = prepared(entry);
    for (const [label, edit] of [
      ['a declined finding with no reason', (value) => (value.findings[0].disposition = { decision: 'declined' })],
      ['a new-pr finding with no handoff', (value) => (value.findings[0].disposition = { decision: 'new-pr' })],
      ['an unknown decision', (value) => (value.findings[0].disposition = { decision: 'later' })],
      ['an unknown source', (value) => (value.findings[0].source = 'hunch')],
      ['a null behavior outside authoring', (value) => (value.findings[0].behaviorId = null)],
      [
        'an authoring finding with no excerpt',
        (value) => (value.findings[0] = { ...value.findings[0], source: 'authoring', evidence: { record: 'requirements.md' } }),
      ],
      ['an off-pattern ID', (value) => (value.findings[0].id = 'F-1')],
      ['an absolute target artifact', (value) => (value.findings[0].target.artifact = '/etc/passwd')],
    ]) {
      placeFindings(folder, kind);
      const result = checkEdited(folder, edit);
      assert.equal(result.status, 10, `${label}: expected exit 10, got ${result.status}`);
      assert.ok(
        findingsOf(result).some((line) => line.includes('[schema]')),
        `${label}: no schema finding:\n${result.stdout}`,
      );
    }
  });
}

test('skill: an intermittent behavior is held to the trial set the run recorded', () => {
  const folder = prepared(KINDS[0]);
  expectFinding(
    checkEdited(folder, (value) => {
      value.findings[0].evidence.trialCount = 4;
      value.findings[0].evidence.trials = [4];
    }),
    'target-findings',
    'cites trial 4 of probe P-001; runs/20261125T100000000Z-0a1b2c3d/trial-sets/P-001/record-4.json does not exist',
  );
  placeFindings(folder, 'skill');
  expectFinding(
    checkEdited(folder, (value) => {
      value.findings[0].evidence.trialCount = 4;
    }),
    'target-findings',
    'records trialCount 4; runs/20261125T100000000Z-0a1b2c3d/trial-sets/P-001 holds 3 trial record(s)',
  );
  placeFindings(folder, 'skill');
  expectFinding(
    checkEdited(folder, (value) => {
      value.findings[0].evidence.trials = [1, 2, 3];
    }),
    'target-findings',
    'cites every trial of 3 as failing',
  );
  placeFindings(folder, 'skill');
  expectFinding(
    checkEdited(folder, (value) => {
      value.findings[0].evidence.trials = [5];
    }),
    'target-findings',
    'cites trial 5 of 3',
  );
  placeFindings(folder, 'skill');
  expectFinding(
    checkEdited(folder, (value) => {
      value.findings[0].evidence.score = '20261125T120000000Z-0a1b2c3d';
    }),
    'target-findings',
    'cites score invocation 20261125T120000000Z-0a1b2c3d of run',
  );
});

test('skill: an authoring finding quotes its record and a new-pr finding is named in its handoff', () => {
  const folder = prepared(KINDS[0]);
  expectFinding(
    checkEdited(folder, (value) => {
      value.findings[1].evidence.excerpt = 'The limit is exclusive.';
    }),
    'target-findings',
    'quotes an excerpt requirements.md does not hold',
  );
  placeFindings(folder, 'skill');
  expectFinding(
    checkEdited(folder, (value) => {
      value.findings[1].evidence.record = 'authoring-log.md';
    }),
    'target-findings',
    'cites record authoring-log.md, which does not exist in the evaluation folder',
  );
  placeFindings(folder, 'skill');
  fs.writeFileSync(path.join(folder, 'target-handoff.md'), '# Target handoff\n\nNothing yet.\n');
  expectFinding(check(folder), 'target-findings', 'hands off to target-handoff.md, which does not name T-002');
  fs.rmSync(path.join(folder, 'target-handoff.md'));
  expectFinding(check(folder), 'target-findings', 'hands off to target-handoff.md, which does not exist in the evaluation folder');
});

test('skill: a cited run that is neither on disk nor the accepted run is recorded and not verified', () => {
  const folder = prepared(KINDS[0]);
  fs.rmSync(path.join(folder, 'runs'), { recursive: true });
  const result = check(folder);
  expectClean(result);
  assert.deepEqual(warningsOf(result), []);
});

test('mcp: an isolation violation cites paths the run recorded and a clean-control failure cites a clean control', () => {
  const folder = prepared(KINDS[1]);
  expectFinding(
    checkEdited(folder, (value) => {
      value.findings[0].evidence.paths = ['/home/adopter/.ssh/id_ed25519'];
    }),
    'target-findings',
    'cites path "/home/adopter/.ssh/id_ed25519", which runs/20261125T100000000Z-0a1b2c3d/trial-sets/P-001/isolation-manifest.json does not list in observedMounts',
  );
  placeFindings(folder, 'mcp');
  expectFinding(
    checkEdited(folder, (value) => {
      value.findings[1].evidence.probe = 'P-002';
    }),
    'target-findings',
    'is a clean-control failure on P-002, which is not a clean control',
  );
});

test('api: a process finding cites a finding the interpretation lists under process', () => {
  const folder = prepared(KINDS[2]);
  expectFinding(
    checkEdited(folder, (value) => {
      value.findings[0].evidence.finding = 'F-002';
    }),
    'target-findings',
    'cites finding "F-002", which runs/20261125T100000000Z-0a1b2c3d/interpretation.json does not list under process for probe P-001 in trial 1',
  );
  placeFindings(folder, 'api');
  expectFinding(
    checkEdited(folder, (value) => {
      value.findings[0].evidence.trials = [2];
    }),
    'target-findings',
    'does not list under process for probe P-001 in trial 2',
  );
});

test('a scored run with no accepted baseline also asks for target findings, and an unscored folder does not', () => {
  const folder = copyEvaluation({ fixture: 'evaluate', evaluation: 'valid' });
  const unscored = check(folder);
  expectClean(unscored);
  assert.deepEqual(warningsOf(unscored), []);
  const scoreDirectory = path.join(folder, 'runs', RUN, 'scores', SCORE);
  fs.mkdirSync(scoreDirectory, { recursive: true });
  writeJson(path.join(scoreDirectory, 'score.json'), { invocationId: SCORE, run: RUN });
  const scored = check(folder);
  expectClean(scored);
  assert.equal(warningsOf(scored).length, 1, scored.stderr);
});

test('a held-out probe is cited by its gap-view row alone', () => {
  const folder = copyEvaluation({ fixture: 'evaluate-gap-loop', evaluation: 'after/evaluation' });
  const evaluation = readJson(path.join(folder, 'evaluation.json'));
  const baseline = readJson(path.join(folder, 'baseline', 'baseline.json'));
  const finding = (evidence) => ({
    schemaVersion: 1,
    evaluationId: evaluation.evaluationId,
    findings: [
      {
        id: 'T-001',
        summary: 'The mechanism missed a held-out defect its development twin catches.',
        source: 'clean-control-failure',
        evidence: { run: baseline.acceptedRun, score: baseline.scoreInvocationId, probe: 'P-010', ...evidence },
        behaviorId: 'B-001',
        severity: 'material',
        target: { artifact: 'review.js', change: 'Report a missing assertion in every test of the file.' },
        disposition: { decision: 'declined', reason: 'Reproduced and fixed on the development probe first.' },
      },
    ],
  });
  writeJson(path.join(folder, FILE), finding({ trials: [1] }));
  expectFinding(
    check(folder),
    'target-findings',
    'cites trials of held-out probe P-010; cite a held-out probe by its gap-view.json row alone',
  );
});

scratch.removeAll();
if (failures.length > 0) {
  console.error(`test-evaluate-target-findings: ${failures.length} of ${cases} case(s) failed`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log(`test-evaluate-target-findings: ${cases} case(s) passed`);
