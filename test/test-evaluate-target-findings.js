/**
 * Target findings across target kinds, from a genuine recorded failure to a measured fix, through the real bin.
 *
 * For a skill (the refund-check skill through `tea-skill-runner`), an MCP tool server and an AI-feature HTTP service, each case
 * copies the fixture evaluation with its target and plants the defect `test/fixtures/evaluate-target-findings/flaws.json` names.
 * Then, at the CLI boundary:
 *
 * - `run` and `score` record the defect: the clean control fails one trial of three (eval-quality's `false-positive`), score exits 2;
 * - `tea-evaluate target-findings` drafts the candidate from that evidence (an intermittent behavior, its trial, trial count,
 *   behavior and severity), and the case classifies it as a target problem and records it undecided;
 * - `check` accepts it with a readiness warning and exit 0, so the gap loop keeps running, and `check --ready` (the pre-PR check)
 *   exits 10 on the undecided finding, on a this-pr finding with no measurement and on a scored evaluation with no file;
 * - the defect is removed (the this-pr fix), one rerun is run and scored, the measurement records both runs and each probe's
 *   before and after outcome, and `check --ready` exits 0;
 * - a measurement whose before run is not the finding's, whose receipt differs from the scores, whose after run is unknown, or
 *   that a second this-pr finding measures with another rerun exits 10, and a problem the rerun shows cannot be decided this-pr.
 *
 * A defect that fires in the qualification workspace stops `run` at exit 11 with no score: the drafter offers the clean control's
 * qualification record, and the finding citing it checks clean (the rare clean-control failure a later run may not repeat). The same
 * holds for a seeded defect probe whose clean arm fails before its mutation: its `baseline-pass.json` is the drafted evidence, `check`
 * accepts a clean-control failure citing it, and refuses one citing its trials, a known-failing record or a record that held. A
 * held-out probe's qualification record stays closed to the drafter.
 *
 * The checker's evidence rules run over those genuine runs too: a cited trial whose vote passed, a trial or score the run does not
 * hold, an isolation path inside the allowlist, a process finding the sealed records do not list (rebuilt as interpretation.json
 * is, so a rescore or an accepted baseline still verifies it), a held-out probe cited beyond its gap-view row, and schema shapes.
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
const FLAWS = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'evaluate-target-findings', 'flaws.json'), 'utf8'));
const FILE = 'target-findings.json';
const TRIAL_WORKSPACE = 'trial-clean-2';
const QUALIFICATION_WORKSPACE = 'qualify-clean';
const DEFECT_QUALIFICATION_WORKSPACE = 'qualify-P-002';

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

function replaceOnce(file, find, replace) {
  const text = fs.readFileSync(file, 'utf8');
  assert.equal(text.split(find).length, 2, `${file} holds the text to replace exactly once`);
  fs.writeFileSync(file, text.replace(find, replace));
}

/** A disposable project: the fixture with its target, no baseline or runs, and the installs the fixture's registry starts. */
function project(kind) {
  const flaw = FLAWS[kind];
  const root = path.join(scratch.make(kind), flaw.fixture);
  fs.cpSync(path.join(FIXTURES, flaw.fixture), root, {
    recursive: true,
    filter: (source) => !['runs', 'node_modules', 'baseline'].includes(path.basename(source)),
  });
  const folder = path.join(root, ...flaw.evaluation.split('/'));
  if (kind === 'skill') {
    const modules = path.join(root, 'node_modules');
    const tea = path.join(modules, 'bmad-method-test-architecture-enterprise');
    fs.mkdirSync(path.join(modules, '.bin'), { recursive: true });
    fs.mkdirSync(tea);
    fs.cpSync(path.join(ROOT, 'cli'), path.join(tea, 'cli'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(tea, 'package.json'));
    fs.cpSync(path.join(ROOT, 'node_modules', 'commander'), path.join(modules, 'commander'), { recursive: true });
    fs.symlinkSync('../bmad-method-test-architecture-enterprise/cli/skill-runner.js', path.join(modules, '.bin', 'tea-skill-runner'));
  } else {
    fs.mkdirSync(path.join(folder, 'node_modules'));
    fs.symlinkSync(path.join(ROOT, 'node_modules', 'eval-quality'), path.join(folder, 'node_modules', 'eval-quality'));
    fs.symlinkSync(ROOT, path.join(folder, 'node_modules', 'bmad-method-test-architecture-enterprise'));
  }
  return { kind, flaw, root, folder, env: flaw.env };
}

/** Plants the kind's target defect, firing in one workspace; the stand-in model's reading of an ambiguity is planted beside it. */
function plant(context, workspace) {
  const { flaw, root } = context;
  replaceOnce(path.join(root, flaw.target.file), flaw.target.find, flaw.target.replace.replaceAll('{{workspace}}', workspace));
  if (flaw.model !== undefined)
    replaceOnce(path.join(root, flaw.model.file), flaw.model.find, flaw.model.replace.replaceAll('{{workspace}}', workspace));
}

/** The this-PR fix: the target artifact back to its committed text. */
function fix(context) {
  const { flaw, root } = context;
  fs.copyFileSync(path.join(FIXTURES, flaw.fixture, flaw.target.file), path.join(root, flaw.target.file));
}

function cli(context, args) {
  const result = spawnSync(process.execPath, [CLI, ...args, '--evaluation', context.folder], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...context.env },
  });
  if (result.error) throw result.error;
  return { ...result, output: `${result.stdout}${result.stderr}` };
}

/** `run` then `score`, and the run and score invocation IDs they wrote. */
function runAndScore(context, expectedScoreExit) {
  const ran = cli(context, ['run']);
  assert.equal(ran.status, 0, `run exited ${ran.status}:\n${ran.output}`);
  const run = /score --run (\S+)/.exec(ran.stdout)?.[1];
  assert.ok(run, `run named no invocation:\n${ran.output}`);
  const scored = cli(context, ['score', '--run', run]);
  assert.equal(scored.status, expectedScoreExit, `score exited ${scored.status}, expected ${expectedScoreExit}:\n${scored.output}`);
  const scores = fs.readdirSync(path.join(context.folder, 'runs', run, 'scores')).filter((name) => /^\d/.test(name));
  return { run, score: scores.toSorted().at(-1) };
}

function draft(context, run) {
  const result = cli(context, ['target-findings', ...(run === undefined ? [] : ['--run', run])]);
  assert.equal(result.status, 0, `target-findings exited ${result.status}:\n${result.output}`);
  return JSON.parse(result.stdout);
}

function warningsOf(result) {
  return result.stderr.split('\n').filter((line) => line.startsWith(`warning: ${FILE}: [target-findings]`));
}

function findingsOf(result) {
  return result.stdout.split('\n').filter((line) => line.startsWith(`${FILE}: `));
}

function expectClean(result) {
  assert.equal(result.status, 0, `expected exit 0, got ${result.status}:\n${result.output}`);
  assert.deepEqual(findingsOf(result), []);
}

function expectFinding(result, rule, fragment) {
  assert.equal(result.status, 10, `expected exit 10, got ${result.status}:\n${result.output}`);
  assert.ok(
    findingsOf(result).some((line) => line.includes(`[${rule}]`) && line.includes(fragment)),
    `no ${FILE} [${rule}] finding holds ${JSON.stringify(fragment)}:\n${result.stdout}`,
  );
}

/** The receipt of one probe under one score, copied from its evidence artifact as the agent copies it. */
function receipt(context, { run, score }, probe) {
  const outcome = readJson(path.join(context.folder, 'runs', run, 'scores', score, probe, 'evidence-artifact.json'))
    .reducedProbeOutcomes[0];
  return {
    caught: outcome.caught,
    caughtCount: outcome.caughtCount,
    validCount: outcome.validCount,
    votes: outcome.trialVotes.toSorted((left, right) => left.trialIndex - right.trialIndex).map((vote) => vote.state),
  };
}

function writeFindings(context, findings) {
  const { evaluationId } = readJson(path.join(context.folder, 'evaluation.json'));
  writeJson(path.join(context.folder, FILE), { schemaVersion: 1, evaluationId, findings });
}

function editFindings(context, edit) {
  const file = path.join(context.folder, FILE);
  const value = readJson(file);
  edit(value);
  writeJson(file, value);
}

const SUMMARIES = {
  skill:
    'The skill declined a refund exactly at the limit in one trial of three, because SKILL.md calls the at-limit case a judgment call.',
  mcp: 'The grader tool server rejected a correct answer in one trial of three.',
  api: 'The grader service rejected a correct answer in one trial of three.',
};
const CHANGES = {
  skill: 'Remove the judgment-call line, so a refund equal to the limit is always approved.',
  mcp: 'Remove the workspace-dependent rejection from grade_answer.',
  api: 'Remove the workspace-dependent rejection from the grading handler.',
};

/** The classification Stage 11 makes over a candidate: a target problem, with what it got wrong and where the fix lands. */
function classify(kind, id, candidate) {
  return {
    id,
    summary: SUMMARIES[kind],
    source: candidate.source,
    evidence: candidate.evidence,
    behaviorId: candidate.behaviorId,
    severity: candidate.severity,
    target: { artifact: FLAWS[kind].target.file, change: CHANGES[kind] },
    disposition: { decision: 'undecided' },
  };
}

for (const kind of Object.keys(FLAWS)) {
  let context;
  let before;
  let after;
  let finding;

  test(`${kind}: a genuine intermittent failure is drafted, classified and held undecided until the pre-PR check`, () => {
    context = project(kind);
    plant(context, TRIAL_WORKSPACE);
    before = runAndScore(context, 2);
    const ready = cli(context, ['check', '--ready']);
    expectFinding(ready, 'target-findings', 'the evaluation has scored evidence and no target-findings.json');
    const drafted = draft(context);
    assert.equal(drafted.run, before.run);
    assert.equal(drafted.score, before.score);
    const intermittent = drafted.candidates.filter((candidate) => candidate.source === 'intermittent-behavior');
    assert.equal(intermittent.length, 1, JSON.stringify(drafted.candidates));
    assert.deepEqual(intermittent[0].evidence, { run: before.run, score: before.score, probe: 'P-001', trials: [2], trialCount: 3 });
    assert.equal(intermittent[0].behaviorId, 'B-001');
    assert.equal(intermittent[0].severity, 'critical');
    finding = classify(kind, 'T-001', intermittent[0]);
    writeFindings(context, [finding]);
    const loop = cli(context, ['check']);
    expectClean(loop);
    assert.ok(
      warningsOf(loop).some((line) => line.includes('finding T-001 is undecided')),
      loop.stderr,
    );
    expectFinding(cli(context, ['check', '--ready']), 'target-findings', 'finding T-001 is undecided');
    editFindings(context, (value) => (value.findings[0].disposition = { decision: 'this-pr' }));
    expectFinding(cli(context, ['check', '--ready']), 'target-findings', 'finding T-001 is decided this-pr and records no measurement');
  });

  test(`${kind}: the this-pr fix is measured by one rerun and the pre-PR check passes`, () => {
    fix(context);
    after = runAndScore(context, 0);
    assert.deepEqual(
      draft(context, after.run).candidates.filter((candidate) => candidate.evidence.probe === 'P-001'),
      [],
      'the fixed target still yields a P-001 candidate',
    );
    const partition = readJson(path.join(context.folder, 'runs', after.run, 'run.json')).partition;
    finding.disposition = {
      decision: 'this-pr',
      measurement: {
        partitions: [{ partition, before, after }],
        probes: [{ probe: 'P-001', before: receipt(context, before, 'P-001'), after: receipt(context, after, 'P-001') }],
      },
    };
    assert.deepEqual(finding.disposition.measurement.probes[0].after.votes, [
      'passed-clean-control',
      'passed-clean-control',
      'passed-clean-control',
    ]);
    writeFindings(context, [finding]);
    const ready = cli(context, ['check', '--ready']);
    expectClean(ready);
    assert.deepEqual(warningsOf(ready), []);
    // A newer run still in progress (no completion, no outcome) is passed over when no run is named.
    const running = path.join(context.folder, 'runs', '20991231T000000000Z-ffffffff');
    fs.mkdirSync(running);
    writeJson(path.join(running, 'run.json'), { invocationId: path.basename(running), command: 'run' });
    assert.equal(draft(context).run, after.run);
    fs.rmSync(running, { recursive: true });
  });

  test(`${kind}: a measurement the runs do not bear out is refused`, () => {
    const measured = structuredClone(finding);
    for (const [label, edit, rule, fragment] of [
      [
        'a before run other than the finding evidence',
        (value) => (value.findings[0].disposition.measurement.partitions[0].before = after),
        'target-findings',
        `not the run ${before.run} score ${before.score} its evidence cites`,
      ],
      [
        'a receipt that differs from the score',
        (value) =>
          (value.findings[0].disposition.measurement.probes[0].before.votes = [
            'passed-clean-control',
            'passed-clean-control',
            'passed-clean-control',
          ]),
        'target-findings',
        'records before outcome',
      ],
      [
        'a receipt with no before outcome beside a scored before run',
        (value) => (value.findings[0].disposition.measurement.probes[0].before = null),
        'target-findings',
        'records no before outcome for P-001',
      ],
      [
        'an after run no folder holds',
        (value) =>
          (value.findings[0].disposition.measurement.partitions[0].after = { run: '20261125T235959000Z-00000000', score: after.score }),
        'target-findings',
        'which is neither under runs/ nor the accepted baseline, so its outcomes are unverified',
      ],
      [
        'a partition the after run did not run',
        (value) => (value.findings[0].disposition.measurement.partitions[0].partition = 'development'),
        'target-findings',
        'a run of both',
      ],
    ]) {
      writeFindings(context, [structuredClone(measured)]);
      editFindings(context, edit);
      const result = cli(context, ['check', '--ready']);
      assert.equal(result.status, 10, `${label}: expected exit 10, got ${result.status}:\n${result.output}`);
      assert.ok(
        findingsOf(result).some((line) => line.includes(`[${rule}]`) && line.includes(fragment)),
        `${label}:\n${result.stdout}`,
      );
    }
    writeFindings(context, [structuredClone(measured)]);
  });

  test(`${kind}: one decision point: a second rerun and a problem the rerun shows are both refused this-pr`, () => {
    const second = {
      ...structuredClone(finding),
      id: 'T-002',
      disposition: {
        decision: 'this-pr',
        measurement: {
          ...structuredClone(finding.disposition.measurement),
          partitions: [{ ...finding.disposition.measurement.partitions[0], after: before }],
        },
      },
    };
    writeFindings(context, [structuredClone(finding), second]);
    expectFinding(cli(context, ['check']), 'target-findings', 'every this-pr change is applied together and measured by one rerun');
    // A run of both partitions and a run of one partition are the same rerun only when they are the same run.
    const partial = structuredClone(second);
    partial.disposition.measurement.partitions = [{ partition: 'development', before, after: before }];
    writeFindings(context, [structuredClone(finding), partial]);
    expectFinding(
      cli(context, ['check']),
      'target-findings',
      `measures development after run ${before.run}, and T-001 after run ${after.run}`,
    );
    const regression = {
      ...structuredClone(finding),
      id: 'T-002',
      summary: 'The rerun shows a new failure.',
      evidence: { run: after.run, score: after.score, probe: 'P-001', trials: [1] },
      source: 'behavior-failure',
      disposition: { decision: 'this-pr' },
    };
    writeFindings(context, [structuredClone(finding), regression]);
    expectFinding(
      cli(context, ['check']),
      'target-findings',
      'finding T-002 comes from the rerun that measured the this-pr changes, so it cannot be decided this-pr',
    );
    fs.writeFileSync(path.join(context.folder, 'target-handoff.md'), '# Target handoff\n\n## T-002: the rerun regression\n');
    writeFindings(context, [
      structuredClone(finding),
      {
        ...regression,
        evidence: { ...regression.evidence, trials: [1] },
        disposition: { decision: 'new-pr', handoff: 'target-handoff.md' },
      },
    ]);
    expectFinding(cli(context, ['check']), 'target-findings', 'is a behavior failure, and score');
    writeFindings(context, [structuredClone(finding)]);
  });

  test(`${kind}: cited evidence must show what the source says`, () => {
    for (const [label, edit, rule, fragment] of [
      [
        'a cited trial whose vote passed',
        (value) => (value.findings[0].evidence.trials = [1]),
        'target-findings',
        'its cited trials must fail and every other trial pass',
      ],
      [
        'a trial count other than the votes',
        (value) => (value.findings[0].evidence.trialCount = 4),
        'target-findings',
        'records trialCount 4',
      ],
      [
        'a trial the run does not hold',
        (value) => ((value.findings[0].evidence.trials = [4]), (value.findings[0].evidence.trialCount = 5)),
        'target-findings',
        'record-4.json does not exist',
      ],
      [
        'a score the run does not hold',
        (value) => (value.findings[0].evidence.score = '20261125T235959000Z-00000000'),
        'target-findings',
        'which holds no score of probe P-001',
      ],
      [
        'a clean-control failure on a passing trial',
        (value) => (
          (value.findings[0].source = 'clean-control-failure'),
          (value.findings[0].evidence.trials = [3]),
          delete value.findings[0].evidence.trialCount
        ),
        'target-findings',
        'a clean control that failed reads false-positive',
      ],
      [
        'a clean-control failure on a seeded probe',
        (value) => (
          (value.findings[0].source = 'clean-control-failure'),
          (value.findings[0].evidence.probe = 'P-002'),
          delete value.findings[0].evidence.trialCount
        ),
        'target-findings',
        'P-002, which is not a clean control',
      ],
      ['an undeclared behavior', (value) => (value.findings[0].behaviorId = 'B-099'), 'reference', 'names behavior B-099'],
      ['an uncommitted probe', (value) => (value.findings[0].evidence.probe = 'P-099'), 'reference', 'cites probe P-099'],
      [
        'another evaluation',
        (value) => (value.evaluationId = 'another-evaluation'),
        'target-findings',
        'evaluationId "another-evaluation" is not',
      ],
    ]) {
      writeFindings(context, [{ ...structuredClone(finding), disposition: { decision: 'undecided' } }]);
      editFindings(context, edit);
      const result = cli(context, ['check']);
      assert.equal(result.status, 10, `${label}: expected exit 10, got ${result.status}:\n${result.output}`);
      assert.ok(
        findingsOf(result).some((line) => line.includes(`[${rule}]`) && line.includes(fragment)),
        `${label}:\n${result.stdout}`,
      );
    }
    writeFindings(context, [structuredClone(finding)]);
  });

  test(`${kind}: a clean control that fails its qualification baseline is drafted from the record of a run that stopped`, () => {
    const stopped = project(kind);
    plant(stopped, QUALIFICATION_WORKSPACE);
    const ran = cli(stopped, ['run']);
    assert.equal(ran.status, 11, `run exited ${ran.status}, expected 11:\n${ran.output}`);
    assert.match(ran.output, /the clean control's baseline does not pass/);
    const run = fs.readdirSync(path.join(stopped.folder, 'runs')).find((name) => /^\d/.test(name));
    const drafted = draft(stopped, run);
    assert.equal(drafted.score, null);
    assert.deepEqual(
      drafted.candidates.map((candidate) => [candidate.source, candidate.evidence]),
      [['clean-control-failure', { run, probe: 'P-001', qualification: 'baseline-pass' }]],
    );
    writeFindings(stopped, [
      { ...classify(kind, 'T-001', drafted.candidates[0]), disposition: { decision: 'new-pr', handoff: 'target-handoff.md' } },
    ]);
    fs.writeFileSync(
      path.join(stopped.folder, 'target-handoff.md'),
      '# Target handoff\n\n## T-001: the clean control fails its qualification\n',
    );
    expectClean(cli(stopped, ['check', '--ready']));
    // A record that is not this probe's clean arm failing is no evidence, to the drafter or to check.
    const recordFile = path.join(stopped.folder, 'runs', run, 'qualification', 'P-001', 'baseline-pass.json');
    const genuine = fs.readFileSync(recordFile);
    fs.writeFileSync(recordFile, '{}\n');
    assert.deepEqual(draft(stopped, run).candidates, []);
    expectFinding(cli(stopped, ['check']), 'target-findings', 'it names probe null, not P-001');
    fs.writeFileSync(recordFile, genuine);
    // The handoff names the finding by its whole ID.
    fs.writeFileSync(path.join(stopped.folder, 'target-handoff.md'), '# Target handoff\n\n## T-0010: another finding\n');
    expectFinding(cli(stopped, ['check']), 'target-findings', 'which does not name T-001');
    fs.writeFileSync(
      path.join(stopped.folder, 'target-handoff.md'),
      '# Target handoff\n\n## T-001: the clean control fails its qualification\n',
    );
    fix(stopped);
    const fixed = cli(stopped, ['run']);
    assert.equal(fixed.status, 0, fixed.output);
    const held = /score --run (\S+)/.exec(fixed.stdout)[1];
    editFindings(stopped, (value) => (value.findings[0].evidence.run = held));
    expectFinding(cli(stopped, ['check']), 'target-findings', 'its oracles give held');
  });

  test(`${kind}: a defect probe whose clean arm fails qualification is drafted from its record and checks clean`, () => {
    const stopped = project(kind);
    plant(stopped, DEFECT_QUALIFICATION_WORKSPACE);
    const ran = cli(stopped, ['run']);
    assert.equal(ran.status, 11, `run exited ${ran.status}, expected 11:\n${ran.output}`);
    assert.match(ran.output, /the clean arm did not pass/);
    const run = fs.readdirSync(path.join(stopped.folder, 'runs')).find((name) => /^\d/.test(name));
    const recordFile = path.join(stopped.folder, 'runs', run, 'qualification', 'P-002', 'baseline-pass.json');
    assert.equal(readJson(recordFile).verdict, 'violated');
    const drafted = draft(stopped, run);
    assert.equal(drafted.score, null);
    assert.deepEqual(
      drafted.candidates.map((candidate) => [candidate.source, candidate.evidence]),
      [['clean-control-failure', { run, probe: 'P-002', qualification: 'baseline-pass' }]],
    );
    writeFindings(stopped, [
      { ...classify(kind, 'T-001', drafted.candidates[0]), disposition: { decision: 'new-pr', handoff: 'target-handoff.md' } },
    ]);
    fs.writeFileSync(
      path.join(stopped.folder, 'target-handoff.md'),
      '# Target handoff\n\n## T-001: the defect probe clean arm fails its qualification\n',
    );
    expectClean(cli(stopped, ['check', '--ready']));
    // Only clean controls record a known-failing baseline, so a defect probe cites the clean arm it ran.
    editFindings(stopped, (value) => (value.findings[0].evidence.qualification = 'baseline-known-failing'));
    expectFinding(cli(stopped, ['check']), 'target-findings', 'only a clean control records baseline-known-failing');
    // A defect probe's trials run its mutated arm, so its clean arm fails only in its qualification record.
    editFindings(stopped, (value) => {
      delete value.findings[0].evidence.qualification;
      value.findings[0].evidence.score = run;
    });
    expectFinding(cli(stopped, ['check']), 'target-findings', 'P-002, which is not a clean control');
    editFindings(stopped, (value) => {
      delete value.findings[0].evidence.score;
      value.findings[0].evidence.qualification = 'baseline-pass';
    });
    expectClean(cli(stopped, ['check', '--ready']));
    // The record is held to the clean arm it stands for: its probe and phase, and the verdict its oracles give, to the drafter and to check.
    // The genuine record of a clean arm that passed, with only its verdict changed, is the forgery the check exists to refuse.
    const failing = readJson(recordFile);
    fix(stopped);
    const fixed = cli(stopped, ['run']);
    assert.equal(fixed.status, 0, fixed.output);
    const held = /score --run (\S+)/.exec(fixed.stdout)[1];
    const passing = readJson(path.join(stopped.folder, 'runs', held, 'qualification', 'P-002', 'baseline-pass.json'));
    assert.equal(passing.verdict, 'held');
    for (const [forged, fragment] of [
      [{ ...passing, verdict: 'violated' }, 'it states verdict "violated", and its oracles give held'],
      [{ ...failing, verdict: 'held' }, 'it states verdict "held", and its oracles give violated'],
      [{ verdict: 'violated' }, 'it names probe null, not P-002'],
      [{ ...failing, probeId: 'P-001' }, 'it names probe "P-001", not P-002'],
      [{ ...failing, phase: 'mutated-fail' }, 'it names phase "mutated-fail", not baseline-pass'],
      [{ ...failing, oracles: [] }, 'it holds no oracle results'],
      [{ ...failing, oracles: failing.oracles.map((oracle) => ({ ...oracle, disposition: 'held' })) }, 'is not one qualification writes'],
    ]) {
      writeJson(recordFile, forged);
      assert.deepEqual(draft(stopped, run).candidates, [], `the drafter listed ${JSON.stringify(forged).slice(0, 120)}`);
      expectFinding(cli(stopped, ['check', '--ready']), 'target-findings', fragment);
    }
    writeJson(recordFile, failing);
    expectClean(cli(stopped, ['check', '--ready']));
  });
}

/** A run directory copied from a fixture's accepted baseline, for evidence the genuine runs do not hold. */
function baselineRun(fixture, evaluation, run) {
  const root = path.join(scratch.make(fixture), fixture);
  fs.cpSync(path.join(FIXTURES, fixture), root, {
    recursive: true,
    filter: (source) => !['runs', 'node_modules'].includes(path.basename(source)),
  });
  const folder = path.join(root, ...evaluation.split('/'));
  fs.cpSync(path.join(folder, 'baseline'), path.join(folder, 'runs', run), { recursive: true });
  return { folder, env: {} };
}

test('isolation and process citations are held to the allowlist and to the sealed records', () => {
  const run = '20261125T100000000Z-0a1b2c3d';
  const context = baselineRun('evaluate-api', 'evals/grader', run);
  const { scoreInvocationId: score } = readJson(path.join(context.folder, 'baseline', 'baseline.json'));
  const runRoot = path.join(context.folder, 'runs', run);
  const manifestFile = path.join(runRoot, 'trial-sets', 'P-001', 'isolation-manifest.json');
  const manifest = readJson(manifestFile);
  writeJson(manifestFile, { ...manifest, observedMounts: ['/home/adopter/.npmrc', manifest.allowedMounts[0]] });
  // A process finding: the record's finding cites its grading observation, and the run classifies that operation as process.
  const recordFile = path.join(runRoot, 'trial-sets', 'P-001', 'record-1.json');
  const record = readJson(recordFile);
  writeJson(recordFile, {
    ...record,
    findings: [
      { findingId: 'F-001', observationIds: [record.observations[0].observationId], oracleId: null, severity: 'material', kind: 'defect' },
    ],
  });
  writeJson(path.join(runRoot, 'operation-phases.json'), { grader: { 'grade-answer': 'process', 'report-release': 'outcome' } });
  const finding = (id, source, evidence) => ({
    id,
    summary: 'The service graded correctly by a wasteful path.',
    source,
    evidence: { run, probe: 'P-001', ...evidence },
    behaviorId: 'B-001',
    severity: 'material',
    target: { artifact: 'server/grader.js', change: 'Validate the answer before grading.' },
    disposition: { decision: 'declined', reason: 'The adopter keeps the handler as it is.' },
  });
  const write = (findings) => writeFindings(context, findings);
  write([
    finding('T-001', 'isolation-violation', { paths: ['/home/adopter/.npmrc'] }),
    finding('T-002', 'process-finding', { score, trials: [1], finding: 'F-001' }),
  ]);
  expectClean(cli(context, ['check']));
  writeJson(manifestFile, { ...manifest, observedMounts: {} });
  write([finding('T-001', 'isolation-violation', { paths: ['/home/adopter/.npmrc'] })]);
  expectFinding(cli(context, ['check']), 'target-findings', 'holds no list of observedMounts and allowedMounts to verify them against');
  assert.equal(cli(context, ['target-findings', '--run', run]).status, 0, 'the drafter stopped on a malformed manifest');
  writeJson(manifestFile, { ...manifest, observedMounts: ['/home/adopter/.npmrc', manifest.allowedMounts[0]] });
  write([finding('T-001', 'isolation-violation', { paths: [manifest.allowedMounts[0]] })]);
  expectFinding(cli(context, ['check']), 'target-findings', "does not record outside the trial set's allowlist");
  write([finding('T-001', 'process-finding', { score, trials: [1], finding: 'F-002' })]);
  expectFinding(cli(context, ['check']), 'target-findings', 'do not list in the process phase');
  // The interpretation view plays no part: a rescore that replaced it, or a baseline that never kept it, still verifies the finding.
  fs.rmSync(path.join(runRoot, 'interpretation.json'), { force: true });
  write([finding('T-001', 'process-finding', { score, trials: [1], finding: 'F-001' })]);
  expectClean(cli(context, ['check']));
  // An unknown run is not verified: a warning in the loop, a finding before the pull request.
  write([finding('T-001', 'isolation-violation', { run: '20261125T235959000Z-00000000', paths: ['/home/adopter/.npmrc'] })]);
  const loop = cli(context, ['check']);
  expectClean(loop);
  assert.ok(
    warningsOf(loop).some((line) => line.includes('so its evidence is unverified')),
    loop.stderr,
  );
  expectFinding(cli(context, ['check', '--ready']), 'target-findings', 'so its evidence is unverified');
});

test('a held-out probe is cited by its gap-view row, verified against the score, and reproduced on a development probe', () => {
  const run = '20261125T100000000Z-0a1b2c3d';
  const context = baselineRun('evaluate-gap-loop', 'after/evaluation', run);
  const evaluation = readJson(path.join(context.folder, 'evaluation.json'));
  const { scoreInvocationId: score } = readJson(path.join(context.folder, 'baseline', 'baseline.json'));
  const missTrialTwo = (probe) => {
    const file = path.join(context.folder, 'runs', run, 'scores', score, probe, 'evidence-artifact.json');
    const artifact = readJson(file);
    const outcome = artifact.reducedProbeOutcomes[0];
    outcome.trialVotes = outcome.trialVotes.map((vote) => (vote.trialIndex === 2 ? { ...vote, state: 'missed' } : vote));
    outcome.caughtCount = 2;
    writeJson(file, artifact);
  };
  missTrialTwo('P-010');
  missTrialTwo('P-005');
  const row = { probeClass: 'defect', caught: true, caughtCount: 2, validCount: 3, votes: ['caught', 'missed', 'caught'] };
  const finding = (evidence) => ({
    id: 'T-001',
    summary: 'The mechanism misses a held-out defect in one trial of three.',
    source: 'intermittent-behavior',
    evidence: { run, score, probe: 'P-010', ...evidence },
    behaviorId: 'B-001',
    severity: 'material',
    target: { artifact: 'review.js', change: 'Report a missing assertion in every test of the file.' },
    disposition: { decision: 'declined', reason: 'The adopter accepts the miss rate for now.' },
  });
  const write = (evidence) =>
    writeJson(path.join(context.folder, FILE), { schemaVersion: 1, evaluationId: evaluation.evaluationId, findings: [finding(evidence)] });
  write({ gapView: row, reproducedBy: { run, score, probe: 'P-005', trials: [2] } });
  expectClean(cli(context, ['check']));
  write({ gapView: { ...row, votes: ['caught', 'caught', 'caught'] } });
  expectFinding(cli(context, ['check']), 'target-findings', 'copies a gap-view row of P-010 that differs');
  write({ gapView: row, trials: [2], trialCount: 3 });
  expectFinding(cli(context, ['check']), 'target-findings', 'cites trials of held-out probe P-010');
  write({ gapView: row, reproducedBy: { run, score, probe: 'P-011', trials: [2] } });
  expectFinding(cli(context, ['check']), 'target-findings', 'reproduces on held-out probe P-011');
  // A seeded probe's clean arm that failed qualification is drafted for a development probe; a held-out probe's stays closed.
  // Each record's first oracle resolves the other way, as a clean arm that failed records it.
  for (const probe of ['P-005', 'P-010']) {
    const file = path.join(context.folder, 'runs', run, 'qualification', probe, 'baseline-pass.json');
    const record = readJson(file);
    const [first, ...rest] = record.oracles;
    const resolution = first.polarity === 'expects-hold' ? 'false' : 'true';
    writeJson(file, { ...record, verdict: 'violated', oracles: [{ ...first, resolution, disposition: 'violated' }, ...rest] });
  }
  const { behaviorId } = readJson(path.join(context.folder, 'probes', 'P-005.probe.json'));
  const { severity } = readJson(path.join(context.folder, 'contract.json')).behaviors.find((behavior) => behavior.id === behaviorId);
  assert.deepEqual(
    draft(context, run).candidates.filter((candidate) => candidate.evidence.qualification !== undefined),
    [{ source: 'clean-control-failure', evidence: { run, probe: 'P-005', qualification: 'baseline-pass' }, behaviorId, severity }],
  );
});

test('shapes the schema refuses', () => {
  const run = '20261125T100000000Z-0a1b2c3d';
  const context = baselineRun('evaluate-mcp', 'evals/grader', run);
  const base = {
    id: 'T-001',
    summary: 'A rule the target never states.',
    source: 'authoring',
    evidence: { record: 'requirements.md', excerpt: 'Confirmed by: fixture adopter' },
    behaviorId: null,
    severity: 'low',
    target: { artifact: 'server/grader.js', change: 'State the rule.' },
    disposition: { decision: 'declined', reason: 'Out of scope.' },
  };
  writeFindings(context, [base]);
  expectClean(cli(context, ['check']));
  for (const [label, edit] of [
    ['a declined finding with no reason', (value) => (value.disposition = { decision: 'declined' })],
    ['a new-pr finding with no handoff', (value) => (value.disposition = { decision: 'new-pr' })],
    ['an unknown decision', (value) => (value.disposition = { decision: 'later' })],
    ['an unknown source', (value) => (value.source = 'hunch')],
    [
      'a null behavior outside authoring',
      (value) => ((value.source = 'clean-control-failure'), (value.evidence = { run, score: run, probe: 'P-001' })),
    ],
    ['an authoring finding with no excerpt', (value) => (value.evidence = { record: 'requirements.md' })],
    [
      'a clean-control failure with neither score nor qualification',
      (value) => ((value.source = 'clean-control-failure'), (value.behaviorId = 'B-001'), (value.evidence = { run, probe: 'P-001' })),
    ],
    [
      'a gap-view row with no score',
      (value) => (
        (value.source = 'behavior-failure'),
        (value.behaviorId = 'B-001'),
        (value.evidence = {
          run,
          probe: 'P-001',
          gapView: { probeClass: 'defect', caught: false, caughtCount: 0, validCount: 3, votes: [] },
        })
      ),
    ],
    [
      'a measurement with no receipts',
      (value) =>
        (value.disposition = {
          decision: 'this-pr',
          measurement: { partitions: [{ partition: 'both', before: null, after: { run, score: run } }], probes: [] },
        }),
    ],
    ['an off-pattern ID', (value) => (value.id = 'F-1')],
    ['an absolute target artifact', (value) => (value.target.artifact = '/etc/passwd')],
  ]) {
    const value = structuredClone(base);
    edit(value);
    writeFindings(context, [value]);
    const result = cli(context, ['check']);
    assert.equal(result.status, 10, `${label}: expected exit 10, got ${result.status}`);
    assert.ok(
      findingsOf(result).some((line) => line.includes('[schema]')),
      `${label}: no schema finding:\n${result.stdout}`,
    );
  }
  writeFindings(context, [{ ...base, evidence: { ...base.evidence, excerpt: 'The limit is exclusive.' } }]);
  expectFinding(cli(context, ['check']), 'target-findings', 'quotes an excerpt requirements.md does not hold');
});

scratch.removeAll();
if (failures.length > 0) {
  console.error(`test-evaluate-target-findings: ${failures.length} of ${cases} case(s) failed`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log(`test-evaluate-target-findings: ${cases} case(s) passed`);
