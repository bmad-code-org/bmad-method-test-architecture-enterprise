'use strict';

/**
 * Interaction plans isolated by evaluation partition (Story 1.51, AD-9, AD-22), through the real CLI over real eval-quality and
 * the `partition-plan` fixture: one shared step, one development-only step in `contract.json`, and one held-out step whose
 * request carries a private canary in the sealed held-out plan.
 *
 * The revert checks the story names are each one case below:
 *  - each partition launches one request per authorized step in preflight and run (restoring shared-plan execution launches
 *    the held-out request in a development run and the development request in a held-out run),
 *  - no artifact, log or replay file of one partition holds the other's canary, step ID or oracle (removing the view leaves
 *    the canary in every development artifact),
 *  - the held-out run scores after the development run, outside the gap loop, and `compare --accept` and `ci --tier pr`
 *    replay each baseline with no stale warning (compiling `contract.json` for a held-out baseline reads as stale),
 *  - a run of a folder with no `partitionPlan` writes the folder's own `contract.json` bytes in every partition.
 *
 * Story 1.105 adds rubrics to the same plan, through the `rubricLayer` over the same fixture: a criterion belongs to the
 * partition whose steps its evidence reads, so
 *  - each view holds only the criteria its steps reach (a view that keeps the other partition's criterion fails the pure and the
 *    run cases), and a development run holds no held-out criterion in any artifact,
 *  - `check` names a criterion that no view reaches, by criterion ID and never by a byte of the held-out plan,
 *  - calibration judges the items of the run's own criteria, so an item of the other partition's criterion is never judged there.
 */

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { PartitionPlanError, contractView, loadContractView, selectPartition, stepsReadBy } = require('../cli/lib/evaluate/partition');
const { suite } = require('./lib/evaluate-story-121');

const FIXTURE = path.join(__dirname, 'fixtures', 'evaluate', 'partition-plan');
const CI_PLAN = path.join(__dirname, 'fixtures', 'evaluate', 'mutation', 'evals', 'verdict-ci', 'ci', 'evaluation-ci-plan.json');
const PLAN_FILE = 'corpus/held-out/plan.json';
const GIT = ['-c', 'user.name=TeA test', '-c', 'user.email=tea-test@example.test', '-c', 'core.hooksPath=/dev/null'];
const GIT_ENV = {
  ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))),
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};

const CANARY = 'canary-9c41d7e2';
const SHARED_REQUEST = 'Judge the request.';
const DEVELOPMENT_REQUEST = 'Judge the development case.';
const HELD_OUT_REQUEST = `${CANARY}: judge the held-out case.`;
/** What the contract's sensitivity witness sends, and what each partition's probe witnesses send, beside the plan's own steps. */
const WITNESSES = ['Judge alpha.', 'Judge beta.'];
const DEVELOPMENT_WITNESS = 'Judge the development witness.';
const HELD_OUT_WITNESS = 'Judge the held-out witness.';

/** What must stay out of each partition's artifacts: the other partition's request, step ID, oracle and witness. */
const KEEP_OUT = {
  development: [CANARY, 'held-out-run', 'O-101', 'judge the held-out case', HELD_OUT_WITNESS],
  'held-out': ['development-run', 'O-002', DEVELOPMENT_REQUEST, DEVELOPMENT_WITNESS],
};

/** The rubric layer: a development criterion, a shared one in `contract.json`, and a held-out one in the plan (Story 1.105). */
const STUB_JUDGE = path.join(__dirname, 'fixtures', 'evaluate', 'stub-judge.js');
const SCALE = [
  { level: 0, anchor: 'The response does not say accepted.' },
  { level: 1, anchor: 'The response says accepted.' },
];
const rubricOf = (id, criteria) => ({
  id,
  scaleLevels: SCALE,
  failureModePenalties: [{ name: 'silent', description: 'No verdict is stated.' }],
  maxLength: 100,
  criteria,
});
const criterionOf = (id, text, step) => ({ id, text, evidence: `/interactions/${step}/stdout` });
const DEVELOPMENT_CRITERION = criterionOf('RC-001', 'Does the development case state its verdict?', 'development-run');
const SHARED_CRITERION = criterionOf('RC-002', 'Does the shared request state its verdict?', 'shared-run');
const HELD_OUT_CRITERION = criterionOf('RC-101', `${CANARY}: does the held-out case state its verdict?`, 'held-out-run');
/** What must stay out of each partition's artifacts once rubrics join the plan: the other partition's own criterion. */
const RUBRIC_KEEP_OUT = {
  development: [...KEEP_OUT.development, 'R-101', 'RC-101'],
  'held-out': [...KEEP_OUT['held-out'], 'RC-001', DEVELOPMENT_CRITERION.text],
};

const test = suite('tea-evaluate-partition-plans');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);

/** Every regular file under `directory`, as absolute paths. */
function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(file);
    return entry.isFile() ? [file] : [];
  });
}

/** The files of `directory` that hold any of `tokens`, as `relative-path: token`, case-sensitively. */
function holding(directory, tokens) {
  const found = [];
  for (const file of filesUnder(directory)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const token of tokens) if (text.includes(token)) found.push(`${path.relative(directory, file)}: ${token}`);
  }
  return found;
}

/** The target's launch marker lines past `from`: the workspace label and request of each launch. */
function launchesSince(project, from) {
  const file = project.env.VERDICT_MARKER;
  const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean) : [];
  return lines.slice(from).map((line) => JSON.parse(line));
}
const launchCount = (project) => launchesSince(project, 0).length;

/** The requests each workspace launched, sorted, by workspace label. */
function requestsByWorkspace(launches) {
  const byWorkspace = new Map();
  for (const { workspace, request } of launches) byWorkspace.set(workspace, [...(byWorkspace.get(workspace) ?? []), request]);
  return byWorkspace;
}

function commit(repository, message) {
  for (const args of [
    ['add', '--all'],
    ['commit', '--quiet', '-m', message],
  ]) {
    const run = spawnSync('git', [...GIT, '-C', repository, ...args], { encoding: 'utf8', env: GIT_ENV });
    assert.equal(run.status, 0, `git ${args.join(' ')}: ${run.stderr}`);
  }
}

/**
 * The rubric layer over a project's folder (Story 1.105): `contract.json` gains R-001 holding `development` criteria, the held-out
 * plan gains R-101 holding `heldOut` ones, and the stub judge, its model snapshot and one labelled file with two anchored items
 * per criterion make every rubric judgeable. The stub scores every criterion at the top level, so each criterion agrees on half
 * its items and `minimumAgreement` is one half. Stories that partition more of the contract extend a project through this layer.
 */
function rubricLayer(
  { folder, directory },
  { development = [DEVELOPMENT_CRITERION, SHARED_CRITERION], heldOut = [HELD_OUT_CRITERION] } = {},
) {
  const edit = (file, change) => {
    const value = read(path.join(folder, file));
    change(value);
    write(path.join(folder, file), value);
  };
  edit('contract.json', (contract) => {
    contract.rubrics = development.length === 0 ? [] : [rubricOf('R-001', development)];
  });
  edit(PLAN_FILE, (plan) => {
    if (heldOut.length > 0) plan.rubrics = [rubricOf('R-101', heldOut)];
  });
  edit('evaluation.json', (evaluation) => {
    evaluation.judge = {
      agent: 'custom',
      agentCommand: process.execPath,
      agentArgs: [STUB_JUDGE, '--capture', path.join(directory, 'prompts.jsonl')],
      timeoutMs: 60_000,
    };
    evaluation.judgeCalibration = { minimumAgreement: 0.5 };
  });
  write(path.join(folder, 'policy/evaluator-conditions.json'), {
    schemaVersion: 1,
    modelSnapshot: 'none',
    systemPromptDigest: `sha256:${crypto.createHash('sha256').update('').digest('hex')}`,
    judge: { modelSnapshot: 'stub-judge-2026-09' },
  });
  write(path.join(folder, 'policy/judge-calibration.json'), {
    items: [...development.map((criterion) => ['R-001', criterion]), ...heldOut.map((criterion) => ['R-101', criterion])].flatMap(
      ([rubricId, criterion]) =>
        [0, 1].map((level) => ({
          rubricId,
          criterionId: criterion.id,
          response: `calibration response ${criterion.id} ${level}`,
          expectedLevel: level,
        })),
    ),
  });
}

/** The judge's calls since `from`: whether each was a calibration call and the `rubric/criterion` keys it was asked to score. */
function judgeCalls(project, from = 0) {
  const file = path.join(project.directory, 'prompts.jsonl');
  const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean) : [];
  const heading = 'Rubrics and evidence (JSON):';
  return lines.slice(from).map((line) => {
    const prompt = JSON.parse(line);
    const material = JSON.parse(prompt.slice(prompt.indexOf(heading) + heading.length));
    return {
      calibration: prompt.includes('calibration response'),
      criteria: material.rubrics.flatMap((rubric) => rubric.criteria.map((criterion) => `${rubric.rubricId}/${criterion.criterionId}`)),
      prompt,
    };
  });
}
const judgeCallCount = (project) => judgeCalls(project).length;

/** The fixture's project, with the verdict CI plan placed on the folder (the plan names the folder by its path in the repository). */
function planProject(label, layer = null) {
  return test.project(
    label,
    ({ folder, directory }) => {
      // A byte-for-byte comparison of the run's contract.json with the folder's can fail only when the folder's layout is one
      // a view would not produce.
      if (layer !== null) rubricLayer({ folder, directory }, layer);
      relayContract(folder);
      fs.mkdirSync(path.join(folder, 'ci'));
      write(
        path.join(folder, 'ci/evaluation-ci-plan.json'),
        fs.readFileSync(CI_PLAN, 'utf8').replaceAll('test/fixtures/evaluate/mutation/evals/verdict-ci', 'evals/verdict'),
      );
    },
    { marker: true, fixture: FIXTURE },
  );
}

const cli = (project, command, args = []) => test.cli(project.folder, command, args, project.env);

/** Rewrites the folder's contract.json in a layout no view serializes (4 spaces, no final newline), the same data. */
function relayContract(folder) {
  const file = path.join(folder, 'contract.json');
  write(file, JSON.stringify(read(file), null, 4));
}

/** The run's outcome by probe, from its `partitions.json`. */
function outcomes(run) {
  const partitions = read(path.join(run, 'partitions.json'));
  return JSON.stringify([...partitions.development, ...partitions['held-out']].map((entry) => [entry.probeId, entry.outcome]));
}

/** The plan's steps and oracles as a run's `contract.json` holds them. */
function viewOf(run) {
  const contract = read(path.join(run, 'contract.json'));
  return {
    steps: contract.interactionPlan.map((step) => step.stepId),
    oracles: contract.oracles.map((oracle) => oracle.id),
    behaviors: Object.fromEntries(contract.behaviors.map((behavior) => [behavior.id, behavior.oracles])),
  };
}

try {
  // ---- selectPartition and the pure view -------------------------------------------------------------------------------------
  const probes = ['P-001', 'P-002', 'P-003'].map((probeId) => ({ probe: { probeId } }));
  assert.deepEqual(selectPartition({ partition: undefined, heldOutProbes: ['P-003'], probes }), { selectedProbeIds: null });
  assert.deepEqual(
    [...selectPartition({ partition: 'development', heldOutProbes: ['P-003'], probes }).selectedProbeIds],
    ['P-001', 'P-002'],
  );
  assert.deepEqual([...selectPartition({ partition: 'held-out', heldOutProbes: ['P-003'], probes }).selectedProbeIds], ['P-003']);
  assert.equal(selectPartition({ partition: 'unknown', heldOutProbes: [], probes }).refusal.exitCode, 64);
  assert.equal(selectPartition({ partition: 'held-out', heldOutProbes: [], probes }).refusal.exitCode, 10);

  const fixtureFolder = path.join(FIXTURE, 'evals/verdict');
  const contractBytes = fs.readFileSync(path.join(fixtureFolder, 'contract.json'));
  const evaluation = read(path.join(fixtureFolder, 'evaluation.json'));
  const heldOutPlan = read(path.join(fixtureFolder, PLAN_FILE));
  const view = (partition, plan = heldOutPlan) => contractView({ contractBytes, evaluation, heldOutPlan: plan, partition });
  const development = view('development', null);
  assert.equal(development.bytes, contractBytes, 'the development view is the folder bytes, not a copy of them');
  const heldOutView = view('held-out');
  const everything = view('both');
  assert.equal(heldOutView.bytes.toString('utf8'), `${JSON.stringify(heldOutView.contract, null, 2)}\n`);
  assert.deepEqual(
    heldOutView.contract.interactionPlan.map((step) => step.stepId),
    ['shared-run', 'held-out-run'],
  );
  assert.deepEqual(
    heldOutView.contract.oracles.map((oracle) => oracle.id),
    ['O-001', 'O-101'],
  );
  assert.deepEqual(
    heldOutView.contract.behaviors.map((behavior) => behavior.oracles),
    [['O-001'], ['O-101']],
  );
  assert.deepEqual(
    everything.contract.interactionPlan.map((step) => step.stepId),
    ['shared-run', 'development-run', 'held-out-run'],
  );
  assert.deepEqual(
    everything.contract.oracles.map((oracle) => oracle.id),
    ['O-001', 'O-002', 'O-101'],
  );
  assert.deepEqual(
    everything.contract.behaviors.map((behavior) => behavior.oracles),
    [['O-001'], ['O-002', 'O-101']],
  );
  const untouched = (contract) => ({ ...contract, interactionPlan: null, oracles: null, behaviors: null });
  assert.deepEqual(
    untouched(heldOutView.contract),
    untouched(JSON.parse(contractBytes.toString('utf8'))),
    'a view changed more than the plan',
  );
  assert.deepEqual(
    untouched(everything.contract),
    untouched(JSON.parse(contractBytes.toString('utf8'))),
    'a view changed more than the plan',
  );
  // No partitionPlan: every view is the source bytes.
  const unplanned = { ...evaluation };
  delete unplanned.partitionPlan;
  for (const partition of ['development', 'held-out', 'both']) {
    assert.equal(contractView({ contractBytes, evaluation: unplanned, heldOutPlan: null, partition }).bytes, contractBytes);
  }

  // Steps are read from the structured reference fields only: a pointer operand, a captured binding, evidenceTargets, a rubric
  // criterion's evidence, a waiver's condition and `after`. A literal, a commentary or a scope that spells a pointer is not one.
  const spelledOut = {
    literal: '/interactions/literal-step/stdout',
    commentary: '/interactions/commentary-step/stdout',
    scope: '/interactions/scope-step/stdout',
    check: {
      op: 'equality',
      operands: [{ literal: { pointer: '/interactions/nested-step/stdout' } }, { literal: '/interactions/other-step/stdout' }],
    },
    inputBinding: { stdin: { pointer: { literal: '/interactions/binding-step/stdout' } } },
  };
  assert.deepEqual(stepsReadBy(spelledOut), []);
  assert.deepEqual(
    stepsReadBy({
      after: 'after-step',
      commentary: '/interactions/commentary-step/stdout',
      direction: { evidenceTargets: ['/interactions/target-step/stdout', 'not a pointer'] },
      check: {
        op: 'equality',
        operands: [{ pointer: '/interactions/pointer-step/exit-code' }, { literal: '/interactions/literal-step/stdout' }],
      },
      inputBinding: { stdin: { pointer: { captured: '/interactions/captured-step/stdout' }, other: { literal: 1 } } },
      criteria: [{ evidence: '/interactions/evidence-step/stdout' }],
      condition: '/interactions/condition-step/exit-code is absent',
    }).sort(),
    ['after-step', 'captured-step', 'condition-step', 'evidence-step', 'pointer-step', 'target-step'],
  );
  // A shared oracle whose literal, commentary or scope spells a development-only pointer stays in the held-out view.
  const spelledSource = JSON.parse(contractBytes.toString('utf8'));
  spelledSource.oracles[0].check.operands.push({
    op: 'containment',
    operands: [{ pointer: '/interactions/shared-run/stdout' }, { literal: '/interactions/development-run/stdout' }],
  });
  spelledSource.oracles[0].commentary = '/interactions/development-run/stdout';
  spelledSource.oracles[0].direction.scope = '/interactions/development-run/exit-code';
  assert.deepEqual(
    contractView({
      contractBytes: Buffer.from(JSON.stringify(spelledSource)),
      evaluation,
      heldOutPlan,
      partition: 'held-out',
    }).contract.oracles.map((oracle) => oracle.id),
    ['O-001', 'O-101'],
    'a literal that spells a pointer dropped a shared oracle from the held-out view',
  );

  // ---- rubrics: a criterion belongs to the partition whose steps its evidence reads (Story 1.105) -------------------------------
  const lateCriterion = criterionOf('RC-003', 'Does the development case exit cleanly?', 'development-run');
  const rubricSource = JSON.parse(contractBytes.toString('utf8'));
  rubricSource.rubrics = [
    rubricOf('R-001', [DEVELOPMENT_CRITERION, SHARED_CRITERION]),
    rubricOf('R-002', [lateCriterion]),
    rubricOf('R-003', []),
  ];
  const rubricBytes = Buffer.from(JSON.stringify(rubricSource, null, 4));
  const rubricPlan = { ...heldOutPlan, rubrics: [rubricOf('R-101', [HELD_OUT_CRITERION])] };
  const rubricView = (partition, plan = rubricPlan) =>
    contractView({ contractBytes: rubricBytes, evaluation, heldOutPlan: plan, partition });
  const criteriaIn = (partition) =>
    rubricView(partition).contract.rubrics.map((rubric) => [rubric.id, rubric.criteria.map((criterion) => criterion.id)]);
  // The development view is the source bytes: it carries the development and shared criteria and never the plan's.
  assert.equal(rubricView('development').bytes, rubricBytes, 'the development view is not the folder bytes');
  assert.deepEqual(
    rubricView('development').contract.rubrics.map((rubric) => rubric.id),
    ['R-001', 'R-002', 'R-003'],
  );
  assert.equal(
    JSON.stringify(rubricView('development').contract).includes('RC-101'),
    false,
    'the development view carries the held-out criterion',
  );
  // The held-out view drops a criterion that reads a development-only step, drops a rubric left with none, keeps a rubric that
  // never had one, and appends the plan's rubrics.
  assert.deepEqual(criteriaIn('held-out'), [
    ['R-001', ['RC-002']],
    ['R-003', []],
    ['R-101', ['RC-101']],
  ]);
  assert.deepEqual(criteriaIn('both'), [
    ['R-001', ['RC-001', 'RC-002']],
    ['R-002', ['RC-003']],
    ['R-003', []],
    ['R-101', ['RC-101']],
  ]);
  assert.deepEqual(
    { ...rubricView('held-out').contract.rubrics[0], criteria: null },
    { ...rubricSource.rubrics[0], criteria: null },
    'the held-out view changed more of a rubric than its criteria',
  );
  // A plan with no `rubrics` appends nothing, so a plan written before rubrics joined it adds none; the held-out view still drops the
  // criteria the held-out partition cannot reach.
  assert.deepEqual(
    rubricView('held-out', heldOutPlan).contract.rubrics.map((rubric) => rubric.id),
    ['R-001', 'R-003'],
  );
  assert.deepEqual(view('held-out').contract.rubrics, []);
  assert.deepEqual(view('both').contract.rubrics, []);

  // ---- check: one case per rule, naming paths and IDs and never a byte of the plan -------------------------------------------
  const guarded = planProject('plan-check');
  const planFile = path.join(guarded.folder, PLAN_FILE);
  const originals = new Map(
    ['contract.json', 'evaluation.json', PLAN_FILE, 'probes/P-003.probe.json'].map((file) => [
      file,
      fs.readFileSync(path.join(guarded.folder, file)),
    ]),
  );
  const change = (file, edit) => {
    const value = read(path.join(guarded.folder, file));
    edit(value);
    write(path.join(guarded.folder, file), value);
  };
  /** `check` over an edited copy of the folder, restored afterwards; the corpus index follows the edit unless `stale`. */
  const checked = (edit, { stale = false } = {}) => {
    try {
      edit();
      if (!stale) assert.equal(cli(guarded, 'digest').status, 0);
      return cli(guarded, 'check');
    } finally {
      for (const [file, bytes] of originals) fs.writeFileSync(path.join(guarded.folder, file), bytes);
      fs.rmSync(path.join(guarded.folder, 'probes/P-005.probe.json'), { force: true });
      assert.equal(cli(guarded, 'digest').status, 0);
    }
  };
  const pristine = cli(guarded, 'check');
  assert.equal(pristine.status, 0, pristine.output);
  const findings = [
    [
      'an unknown development-only step',
      () => change('evaluation.json', (value) => value.partitionPlan.developmentOnlySteps.push('missing-run')),
      /partitionPlan\.developmentOnlySteps names step missing-run, which contract\.json does not declare/,
    ],
    [
      'a held-out step ID that a contract step has',
      () => change(PLAN_FILE, (value) => (value.interactionPlan[0].stepId = 'shared-run')),
      /corpus\/held-out\/plan\.json.*step shared-run has the ID of a step contract\.json declares/,
    ],
    [
      'a held-out step ID declared twice',
      () => change(PLAN_FILE, (value) => value.interactionPlan.push(structuredClone(value.interactionPlan[0]))),
      /step held-out-run is declared more than once/,
    ],
    [
      'a held-out oracle ID that a contract oracle has',
      () => change(PLAN_FILE, (value) => (value.oracles[0].id = 'O-001')),
      /oracle O-001 has the ID of an oracle contract\.json declares/,
    ],
    [
      'a held-out step waiting for a development-only step',
      () => change(PLAN_FILE, (value) => (value.interactionPlan[0].after = 'development-run')),
      /step held-out-run reads step development-run, which the held-out view does not declare/,
    ],
    [
      'a shared step waiting for a development-only step',
      () => change('contract.json', (contract) => (contract.interactionPlan[0].after = 'development-run')),
      /contract\.json.*step shared-run reads development-only step development-run, which the held-out view removes/,
    ],
    [
      'a held-out oracle pointing at a step the view does not declare',
      () =>
        change(PLAN_FILE, (value) => {
          value.oracles[0].check.operands[1].operands[0].pointer = '/interactions/development-run/stdout';
        }),
      /oracle O-101 reads step development-run, which the held-out view does not declare/,
    ],
    [
      'a view that empties a behavior of its oracles',
      () => change(PLAN_FILE, (value) => (value.behaviorOracles = {})),
      /behavior B-002 keeps no oracle in the held-out view/,
    ],
    [
      'a behavior of a held-out probe with two oracles in the held-out view',
      () =>
        change(PLAN_FILE, (value) => {
          value.oracles.push({ ...structuredClone(value.oracles[0]), id: 'O-102' });
          value.behaviorOracles['B-002'].push('O-102');
        }),
      /behavior B-002, discharged by a held-out probe, declares 2 oracles in the held-out view; it must declare exactly 1/,
    ],
    [
      'a behaviorOracles entry for an unknown behavior',
      () => change(PLAN_FILE, (value) => (value.behaviorOracles['B-009'] = ['O-101'])),
      /behaviorOracles names behavior B-009, which contract\.json does not declare/,
    ],
    [
      'a behaviorOracles entry naming an oracle the plan does not declare',
      () => change(PLAN_FILE, (value) => value.behaviorOracles['B-002'].push('O-199')),
      /behaviorOracles lists oracle O-199 for behavior B-002, which the held-out plan does not declare/,
    ],
    [
      'a non-deterministic evaluator',
      () => change('evaluation.json', (value) => (value.evaluator = { kind: 'command', command: 'evaluator/judge.sh' })),
      /partitionPlan requires the deterministic evaluator; evaluator\.kind is "command"/,
    ],
    [
      'a held-out probe with no development probe for its behavior',
      () => change('evaluation.json', (value) => value.heldOutProbes.push('P-004')),
      /P-004 leaves behavior B-002 without a development probe/,
    ],
    [
      'a gameability probe',
      () => {
        const probe = read(path.join(guarded.folder, 'probes/P-001.probe.json'));
        write(path.join(guarded.folder, 'probes/P-005.probe.json'), {
          ...probe,
          probeId: 'P-005',
          qualification: { route: 'gameability', naiveOracle: 'O-002' },
        });
      },
      /probes\/P-005\.probe\.json.*is a gameability probe; its degenerate response answers one plan/,
    ],
    [
      'a held-out step that is not a contract step',
      () => change(PLAN_FILE, (value) => (value.interactionPlan[0]['canary-extra'] = 'canary-field-value')),
      /corpus\/held-out\/plan\.json.*interactionPlan\[0\] must NOT have additional properties/,
    ],
    [
      'a held-out plan with an unexpected field',
      () => change(PLAN_FILE, (value) => (value['canary-top-level'] = 'canary-top-value')),
      /corpus\/held-out\/plan\.json.*\(root\) must NOT have additional properties/,
    ],
    [
      'a waiver reading a development-only step',
      () =>
        change('contract.json', (contract) =>
          contract.waivers.push({
            id: 'W-001',
            rule: 'AD-20',
            rationale: 'The development run is flaky.',
            condition: '/interactions/development-run/exit-code is absent',
            approval: null,
            expiresAt: null,
          }),
        ),
      /contract\.json.*waivers read development-only step development-run; a partition plan does not partition waivers yet/,
    ],
    [
      'a held-out oracle declared twice',
      () => change(PLAN_FILE, (value) => value.oracles.push(structuredClone(value.oracles[0]))),
      /oracle O-101 is declared more than once/,
    ],
    [
      'an empty heldOutProbes beside a partitionPlan',
      () => change('evaluation.json', (value) => (value.heldOutProbes = [])),
      /partitionPlan declares a held-out plan and heldOutProbes names no probe that runs it/,
    ],
    [
      'a binding key the adopter chose in a held-out step',
      () => change(PLAN_FILE, (value) => (value.interactionPlan[0].inputBinding.stdin['canary-binding'] = { bogus: 1 })),
      /corpus\/held-out\/plan\.json.*interactionPlan\[0\]\/inputBinding\/stdin\/\*/,
    ],
    [
      'a behaviorOracles key the adopter chose',
      () => change(PLAN_FILE, (value) => (value.behaviorOracles['canary-behavior'] = ['O-101'])),
      /corpus\/held-out\/plan\.json.*\/behaviorOracles property name must be valid/,
    ],
    [
      'a free-text step ID declared twice in the held-out plan',
      () =>
        change(PLAN_FILE, (value) => {
          value.interactionPlan[0].stepId = 'canary-free text';
          value.interactionPlan.push(structuredClone(value.interactionPlan[0]));
        }),
      /corpus\/held-out\/plan\.json.*\/interactionPlan\/0\/stepId must match pattern/,
    ],
    [
      'a free-text oracle ID declared twice in the held-out plan',
      () =>
        change(PLAN_FILE, (value) => {
          value.oracles[0].id = 'canary-free text';
          value.oracles.push(structuredClone(value.oracles[0]));
        }),
      /corpus\/held-out\/plan\.json.*\/oracles\/0\/id must match pattern/,
    ],
    [
      'a free-text after clause in the held-out plan',
      () => change(PLAN_FILE, (value) => (value.interactionPlan[0].after = 'canary-free text')),
      /corpus\/held-out\/plan\.json.*interactionPlan\[0\]\/after must/,
    ],
  ];
  for (const [name, edit, pattern] of findings) {
    const ran = checked(edit);
    assert.equal(ran.status, 10, `${name}: ${ran.output}`);
    assert.match(ran.output, pattern, name);
    assert.equal(ran.output.includes('canary-'), false, `${name}: check quoted a byte of the held-out plan:\n${ran.output}`);
  }
  // An unreadable or unparsable plan is named by path; the parser's own message, which quotes bytes, never appears.
  for (const [name, edit, pattern] of [
    [
      'an unparsable plan',
      () => write(planFile, 'canary-garbage {"interactionPlan": ['),
      /corpus\/held-out\/plan\.json does not parse as JSON/,
    ],
    ['an absent plan', () => fs.rmSync(planFile), /corpus\/held-out\/plan\.json cannot be read \(ENOENT\)/],
  ]) {
    const ran = checked(edit);
    assert.equal(ran.status, 10, `${name}: ${ran.output}`);
    assert.match(ran.output, pattern, name);
    assert.equal(ran.output.includes('canary-'), false, `${name}: ${ran.output}`);
  }
  // A literal, a commentary or a scope that spells a pointer is the adopter's text, never a reference: it is not read, so it
  // is neither a finding nor echoed.
  const spelled = checked(() =>
    change(PLAN_FILE, (value) => {
      value.oracles[0].check.operands.push({
        op: 'containment',
        operands: [{ pointer: '/interactions/held-out-run/stdout' }, { literal: '/interactions/canary-ghost/stdout' }],
      });
      value.oracles[0].commentary = '/interactions/canary-ghost/exit-code is what this reads';
      value.oracles[0].direction.scope = '/interactions/canary-ghost/stdout';
    }),
  );
  assert.equal(spelled.status, 0, spelled.output);
  assert.equal(spelled.output.includes('canary-'), false, spelled.output);
  // A behavior the source declares with no oracle stays legal: the held-out view leaves it none, as the source does.
  const unarmed = checked(() =>
    change('contract.json', (contract) => contract.behaviors.push({ ...structuredClone(contract.behaviors[0]), id: 'B-003', oracles: [] })),
  );
  assert.equal(unarmed.status, 0, unarmed.output);
  // A path outside corpus/held-out/ opens nothing, whatever the file there holds.
  const outside = path.resolve(guarded.folder, '../../../outside.json');
  // A valid plan with a canary step ID, so a reader that opens it parses, validates and views it instead of failing the plan shape.
  fs.writeFileSync(outside, fs.readFileSync(planFile, 'utf8').replaceAll('held-out-run', 'canary-outside-run'));
  const traversal = checked(() => change('evaluation.json', (value) => (value.partitionPlan.heldOutPlan = '../../../outside.json')));
  assert.equal(traversal.status, 10, traversal.output);
  assert.match(
    traversal.output,
    /partitionPlan\.heldOutPlan "\.\.\/\.\.\/\.\.\/outside\.json" is not a file directly under corpus\/held-out\//,
  );
  assert.doesNotMatch(traversal.output, /must NOT have additional properties|canary-/, 'check read a file outside corpus/held-out/');
  assert.throws(
    () =>
      loadContractView({
        folder: guarded.folder,
        evaluation: {
          ...read(path.join(guarded.folder, 'evaluation.json')),
          partitionPlan: { developmentOnlySteps: [], heldOutPlan: '../../../outside.json' },
        },
        partition: 'held-out',
      }),
    (error) => error instanceof PartitionPlanError && /is not a file directly under corpus\/held-out\//.test(error.message),
  );
  // A corpus directory that is a link to a folder elsewhere holds a file the pattern admits and the folder does not own.
  const elsewhere = path.join(guarded.directory, 'elsewhere');
  fs.mkdirSync(path.join(elsewhere, 'held-out'), { recursive: true });
  fs.copyFileSync(planFile, path.join(elsewhere, 'held-out/plan.json'));
  fs.renameSync(path.join(guarded.folder, 'corpus'), path.join(guarded.folder, 'corpus-real'));
  fs.symlinkSync(elsewhere, path.join(guarded.folder, 'corpus'));
  try {
    assert.throws(
      () => loadContractView({ folder: guarded.folder, evaluation: read(path.join(guarded.folder, 'evaluation.json')), partition: 'both' }),
      /is not directly under corpus\/held-out\/ of the evaluation folder/,
    );
  } finally {
    fs.rmSync(path.join(guarded.folder, 'corpus'));
    fs.renameSync(path.join(guarded.folder, 'corpus-real'), path.join(guarded.folder, 'corpus'));
  }
  // A plan edited after the index was written is a stale index for `check`.
  const staleCheck = checked(() => fs.appendFileSync(planFile, '\n'), { stale: true });
  assert.equal(staleCheck.status, 10, staleCheck.output);
  assert.match(staleCheck.output, /corpus-index\.json is stale.*corpus\/held-out\/plan\.json changed or added/);
  assert.equal(cli(guarded, 'check').status, 0);

  // ---- check over rubrics: each criterion has a home, and one no view reaches is named by its ID (Story 1.105) ----------------
  const rubricGuarded = planProject('plan-rubric-check', {});
  const rubricFiles = ['contract.json', 'evaluation.json', PLAN_FILE, 'policy/judge-calibration.json', 'policy/evaluator-conditions.json'];
  const rubricOriginals = new Map(rubricFiles.map((file) => [file, fs.readFileSync(path.join(rubricGuarded.folder, file))]));
  const rubricChange = (file, edit) => {
    const value = read(path.join(rubricGuarded.folder, file));
    edit(value);
    write(path.join(rubricGuarded.folder, file), value);
  };
  const rubricChecked = (edit, command = ['check']) => {
    try {
      edit();
      assert.equal(cli(rubricGuarded, 'digest').status, 0);
      return cli(rubricGuarded, command[0], command.slice(1));
    } finally {
      for (const [file, bytes] of rubricOriginals) fs.writeFileSync(path.join(rubricGuarded.folder, file), bytes);
      assert.equal(cli(rubricGuarded, 'digest').status, 0);
    }
  };
  // A development criterion, a shared one and a held-out one together are a valid plan: the 1.51 refusal of a rubric that reads a
  // development-only step is replaced by the derivation, so each criterion has a view.
  const rubricsPristine = cli(rubricGuarded, 'check');
  assert.equal(rubricsPristine.status, 0, rubricsPristine.output);
  // Story 1.51's id-only rule holds over the plan's rubrics: a criterion the plan declares is named by its ID when the ID has the
  // schema's shape and by its index otherwise, and its pointer, channel, member and levels are never printed.
  const idOnlyCases = [
    [
      'a held-out criterion ID of no criterion shape',
      () => rubricChange(PLAN_FILE, (plan) => (plan.rubrics[0].criteria[0].id = 'canary-crit-id')),
      /corpus\/held-out\/plan\.json.*rubrics\[0\]\/criteria\/0\/id must match pattern/,
    ],
    [
      'a held-out scale level that is no integer',
      () => rubricChange(PLAN_FILE, (plan) => (plan.rubrics[0].scaleLevels[1].level = 'canary-level')),
      /corpus\/held-out\/plan\.json.*rubrics\[0\]\/scaleLevels\/1\/level must be integer/,
    ],
    [
      'a held-out criterion reading a channel the engine does not know',
      () => rubricChange(PLAN_FILE, (plan) => (plan.rubrics[0].criteria[0].evidence = '/interactions/held-out-run/canary-channel')),
      /corpus\/held-out\/plan\.json.*rubrics\[0\]\/criteria\/0\/evidence must match pattern/,
    ],
    [
      'a held-out criterion reading a member no calibration response holds',
      () => {
        rubricChange(
          PLAN_FILE,
          (plan) => (plan.rubrics[0].criteria[0].evidence = '/interactions/held-out-run/response-body/canary-member'),
        );
        rubricChange('policy/judge-calibration.json', (labelled) => {
          for (const item of labelled.items.filter((entry) => entry.rubricId === 'R-101')) item.response = '{"other":1}';
        });
      },
      /policy\/judge-calibration\.json.*items\[4\] response does not reach the evidence of R-101\/RC-101/,
    ],
    [
      'a held-out criterion reading a call input no calibration response names',
      () =>
        rubricChange(PLAN_FILE, (plan) => (plan.rubrics[0].criteria[0].evidence = '/interactions/held-out-run/call-inputs/canary-member')),
      /corpus\/held-out\/plan\.json.*rubrics\[0\]\/criteria\/0\/evidence must match pattern/,
    ],
    [
      'a held-out rubric ID that a contract rubric has, over a criterion ID of no shape',
      () =>
        rubricChange(PLAN_FILE, (plan) => {
          plan.rubrics[0].id = 'R-001';
          plan.rubrics[0].criteria[0].id = 'canary-crit-id';
        }),
      /corpus\/held-out\/plan\.json.*rubric R-001 has the ID of a rubric contract\.json declares/,
    ],
    [
      'a held-out criterion of no criterion shape reading a development-only step',
      () =>
        rubricChange(PLAN_FILE, (plan) => {
          plan.rubrics[0].criteria[0].id = 'canary-crit-id';
          plan.rubrics[0].criteria[0].evidence = '/interactions/development-run/stdout';
        }),
      /corpus\/held-out\/plan\.json.*criterion criteria\[0\] of rubric R-101 reads step development-run, which the held-out view does not declare/,
    ],
    [
      'a held-out criterion ID with the criterion shape and a free-text tail, reading a development-only step',
      () =>
        rubricChange(PLAN_FILE, (plan) => {
          plan.rubrics[0].criteria[0].id = 'RC-101-canary-x';
          plan.rubrics[0].criteria[0].evidence = '/interactions/development-run/stdout';
        }),
      /corpus\/held-out\/plan\.json.*criterion criteria\[0\] of rubric R-101 reads step development-run, which the held-out view does not declare/,
    ],
  ];
  for (const [name, edit, pattern] of [
    [
      'a contract criterion reading a step the contract does not declare',
      () => rubricChange('contract.json', (contract) => (contract.rubrics[0].criteria[1].evidence = '/interactions/ghost-run/stdout')),
      /contract\.json.*criterion RC-002 of rubric R-001 reads step ghost-run, which the development view does not declare/,
    ],
    [
      'a contract criterion reading a held-out step',
      () => rubricChange('contract.json', (contract) => (contract.rubrics[0].criteria[0].evidence = '/interactions/held-out-run/stdout')),
      /contract\.json.*criterion RC-001 of rubric R-001 reads step held-out-run, which the development view does not declare/,
    ],
    [
      'a held-out criterion reading a development-only step',
      () => rubricChange(PLAN_FILE, (plan) => (plan.rubrics[0].criteria[0].evidence = '/interactions/development-run/stdout')),
      /corpus\/held-out\/plan\.json.*criterion RC-101 of rubric R-101 reads step development-run, which the held-out view does not declare/,
    ],
    [
      'a held-out criterion reading a step no view holds',
      () => rubricChange(PLAN_FILE, (plan) => (plan.rubrics[0].criteria[0].evidence = '/interactions/ghost-run/stdout')),
      /corpus\/held-out\/plan\.json.*criterion RC-101 of rubric R-101 reads step ghost-run, which the held-out view does not declare/,
    ],
    [
      'a held-out rubric ID that a contract rubric has',
      () => rubricChange(PLAN_FILE, (plan) => (plan.rubrics[0].id = 'R-001')),
      /corpus\/held-out\/plan\.json.*rubric R-001 has the ID of a rubric contract\.json declares/,
    ],
    [
      'a held-out rubric declared twice',
      () => rubricChange(PLAN_FILE, (plan) => plan.rubrics.push(structuredClone(plan.rubrics[0]))),
      /corpus\/held-out\/plan\.json.*rubric R-101 is declared more than once/,
    ],
    [
      'a held-out rubric ID of no rubric shape',
      () => rubricChange(PLAN_FILE, (plan) => (plan.rubrics[0].id = 'canary-free text')),
      /corpus\/held-out\/plan\.json.*\/rubrics\/0\/id must match pattern/,
    ],
    [
      'a held-out criterion whose evidence the engine schema refuses',
      () => rubricChange(PLAN_FILE, (plan) => (plan.rubrics[0].criteria[0].evidence = 'canary-not-a-pointer')),
      /corpus\/held-out\/plan\.json.*rubrics\[0\]\/criteria\/0\/evidence must match pattern/,
    ],
    ...idOnlyCases,
    [
      'a calibration item for a criterion no view declares',
      () =>
        rubricChange('policy/judge-calibration.json', (labelled) =>
          labelled.items.push({ rubricId: 'R-101', criterionId: 'RC-009', response: 'calibration response', expectedLevel: 0 }),
        ),
      /policy\/judge-calibration\.json.*items\[6\] names unknown rubric criterion R-101\/RC-009/,
    ],
    [
      'a held-out criterion with no calibration item at one of its levels',
      () => rubricChange('policy/judge-calibration.json', (labelled) => labelled.items.splice(5, 1)),
      /policy\/judge-calibration\.json.*R-101\/RC-101 has no calibration item labelled at one of its anchored levels/,
    ],
    [
      'a judge beside a partition plan that declares no rubric in any view',
      () => {
        rubricChange('contract.json', (contract) => (contract.rubrics = []));
        rubricChange(PLAN_FILE, (plan) => delete plan.rubrics);
        rubricChange('policy/judge-calibration.json', (labelled) => (labelled.items = []));
      },
      /evaluation\.json.*contract\.json declares no rubric, so no judge runs/,
    ],
  ]) {
    const ran = rubricChecked(edit);
    assert.equal(ran.status, 10, `${name}: ${ran.output}`);
    assert.match(ran.output, pattern, name);
    assert.equal(ran.output.includes('canary-'), false, `${name}: check quoted a byte of the held-out plan:\n${ran.output}`);
  }
  // The rubric rules read the plan only when it is sound: no finding of its own, a held-out view the engine's contract schema accepts,
  // and a `contract.json` that does too. Beside a plan or a contract with a finding they hold the rubrics `check` can see, so the
  // finding is the only one and the plan's labelled items are neither validated nor named. Each case below gives the plan criterion an
  // evidence pointer the labelled items cannot reach, which a both view built over the unsound plan would report.
  const unreachableMember = () => {
    rubricChange(PLAN_FILE, (plan) => (plan.rubrics[0].criteria[0].evidence = '/interactions/held-out-run/response-body/canary-member'));
    rubricChange('policy/judge-calibration.json', (labelled) => {
      for (const item of labelled.items.filter((entry) => entry.rubricId === 'R-101')) item.response = '{"other":1}';
    });
  };
  for (const [name, edit, pattern] of [
    [
      'a held-out view the engine schema refuses',
      () => rubricChange(PLAN_FILE, (plan) => (plan.rubrics[0].criteria[0].evidence = 'canary-not-a-pointer')),
      /corpus\/held-out\/plan\.json: \[partition-plan\] rubrics\[0\]\/criteria\/0\/evidence must match pattern/,
    ],
    [
      'a plan with a finding of its own',
      () => {
        unreachableMember();
        rubricChange(PLAN_FILE, (plan) => (plan.behaviorOracles['B-009'] = ['O-101']));
      },
      /behaviorOracles names behavior B-009, which contract\.json does not declare/,
    ],
    [
      'a contract.json that fails its own schema',
      () => {
        unreachableMember();
        rubricChange('contract.json', (contract) => (contract.oracles[0].polarity = 'bogus'));
      },
      /contract\.json: \[engine-schema\]/,
    ],
  ]) {
    const ran = rubricChecked(edit);
    assert.equal(ran.status, 10, `${name}: ${ran.output}`);
    assert.match(ran.output, pattern, name);
    assert.doesNotMatch(
      ran.output,
      /\[judge(-calibration)?\]/,
      `${name}: check judged the labelled items of a plan it cannot trust:\n${ran.output}`,
    );
  }
  // A criterion of `contract.json` whose ID has no shape is named by its index in the partition-plan finding. The adopter's own
  // contract.json is not the held-out plan, so the other findings about the file may quote it; this finding is the plan rule's.
  const freeTextContract = rubricChecked(() =>
    rubricChange('contract.json', (contract) => {
      contract.rubrics[0].criteria[1].id = 'canary-contract-crit';
      contract.rubrics[0].criteria[1].evidence = '/interactions/ghost-run/stdout';
    }),
  );
  assert.equal(freeTextContract.status, 10, freeTextContract.output);
  const planRule = freeTextContract.output.split('\n').filter((line) => line.includes('[partition-plan]'));
  assert.equal(planRule.length, 1, freeTextContract.output);
  assert.match(
    planRule[0],
    /^contract\.json: \[partition-plan\] criterion criteria\[1\] of rubric R-001 reads step ghost-run, which the development view does not declare/,
  );
  assert.equal(planRule[0].includes('canary-'), false, `the plan rule quoted contract.json's free-text ID: ${planRule[0]}`);
  // A judge the both view's rubrics need is named against the contract and its held-out plan together: `contract.json` alone may
  // declare none, and the count is the two files' sum, which neither file holds.
  const noJudge = rubricChecked(() => {
    rubricChange('contract.json', (contract) => (contract.rubrics = []));
    rubricChange(
      'policy/judge-calibration.json',
      (labelled) => (labelled.items = labelled.items.filter((item) => item.rubricId === 'R-101')),
    );
    rubricChange('evaluation.json', (evaluation) => delete evaluation.judge);
    rubricChange('policy/evaluator-conditions.json', (conditions) => delete conditions.judge);
  });
  assert.equal(noJudge.status, 10, noJudge.output);
  assert.match(
    noJudge.output,
    /evaluation\.json: \[judge\] the contract and its held-out plan declare a rubric, and evaluation\.json declares no judge/,
  );
  assert.match(
    noJudge.output,
    /policy\/evaluator-conditions\.json: \[judge\] the contract and its held-out plan declare a rubric, and policy\/evaluator-conditions\.json names no judge\.modelSnapshot/,
  );
  assert.doesNotMatch(noJudge.output, /rubric\(s\)|contract\.json declares/, 'check counted rubrics over the both view for contract.json');
  // A plan criterion's schema error is named by its index among the plan's rubrics: the held-out view lists the rubrics `contract.json`
  // keeps first, and a rubric left with no held-out criterion is not kept, so the plan's rubric is `rubrics[0]` here although
  // `contract.json` declares one rubric.
  const dropped = rubricChecked(() => {
    rubricChange('contract.json', (contract) => (contract.rubrics[0].criteria = [contract.rubrics[0].criteria[0]]));
    rubricChange(PLAN_FILE, (plan) => (plan.rubrics[0].criteria[0].evidence = 'canary-not-a-pointer'));
  });
  assert.equal(dropped.status, 10, dropped.output);
  assert.match(
    dropped.output,
    /corpus\/held-out\/plan\.json: \[partition-plan\] rubrics\[0\]\/criteria\/0\/evidence must match pattern/,
    'a plan rubric was located by the count of contract.json rubrics',
  );
  assert.doesNotMatch(dropped.output, /held-out view \/rubrics|canary-/, dropped.output);
  // A development criterion is held to its own calibration items as any criterion is.
  const ownItems = rubricChecked(() => rubricChange('policy/judge-calibration.json', (labelled) => labelled.items.splice(0, 1)));
  assert.equal(ownItems.status, 10, ownItems.output);
  assert.match(ownItems.output, /R-001\/RC-001 has no calibration item labelled at anchored level 0/, ownItems.output);
  // A rubric only the held-out plan declares: `contract.json` holds none, and the judge and the labelled file serve the held-out
  // partition alone. `check` reads both files, and a development run, which never opens the plan, does not call the judge unused
  // or the held-out items unknown.
  const heldOutOnly = rubricChecked(() => {
    rubricChange('contract.json', (contract) => (contract.rubrics = []));
    rubricChange(
      'policy/judge-calibration.json',
      (labelled) => (labelled.items = labelled.items.filter((item) => item.rubricId === 'R-101')),
    );
  });
  assert.equal(heldOutOnly.status, 0, heldOutOnly.output);
  // A development run of that layout judges nothing, and a held-out run of it calibrates and judges the plan's rubric alone: the
  // judge is called in the partition that owns the criterion and in no other.
  try {
    rubricChange('contract.json', (contract) => (contract.rubrics = []));
    rubricChange(
      'policy/judge-calibration.json',
      (labelled) => (labelled.items = labelled.items.filter((item) => item.rubricId === 'R-101')),
    );
    assert.equal(cli(rubricGuarded, 'digest').status, 0);
    const before = judgeCallCount(rubricGuarded);
    const developmentRun = cli(rubricGuarded, 'run', ['--partition', 'development']);
    assert.equal(developmentRun.status, 0, developmentRun.output);
    assert.equal(judgeCallCount(rubricGuarded), before, 'a development partition with no rubric called the judge');
    assert.equal(developmentRun.output.includes('RC-101'), false, 'a development run named the held-out criterion');
    const heldOutRun = cli(rubricGuarded, 'run', ['--partition', 'held-out']);
    assert.equal(heldOutRun.status, 0, heldOutRun.output);
    const heldOutCalls = judgeCalls(rubricGuarded, before);
    const calibrationCalls = heldOutCalls.filter((call) => call.calibration);
    assert.equal(calibrationCalls.length, 2, 'the held-out run did not calibrate the plan rubric over its two labelled items');
    assert.ok(
      heldOutCalls.some((call) => !call.calibration),
      'the held-out run judged no trial',
    );
    assert.deepEqual(
      [...new Set(heldOutCalls.map((call) => call.criteria.join(',')))],
      ['R-101/RC-101'],
      'the held-out run judged a criterion other than the plan rubric',
    );
  } finally {
    for (const [file, bytes] of rubricOriginals) fs.writeFileSync(path.join(rubricGuarded.folder, file), bytes);
    assert.equal(cli(rubricGuarded, 'digest').status, 0);
  }
  // Every partition's findings stay id-only through preflight too: it runs `check` first, so a held-out or both preflight over a
  // plan with a criterion of no shape, or with an evidence pointer the labelled items cannot reach, stops with a finding that names
  // none of the plan's text.
  for (const [name, edit] of idOnlyCases) {
    for (const args of [['preflight', '--partition', 'held-out'], ['preflight']]) {
      const ran = rubricChecked(edit, args);
      assert.equal(ran.status, 10, `${name} (${args.join(' ')}): ${ran.output}`);
      assert.equal(ran.output.includes('canary-'), false, `${name} (${args.join(' ')}) quoted a byte of the held-out plan:\n${ran.output}`);
    }
  }
  // A contract.json that fails its own schema cannot make the both view, so `check` holds the rubrics it can see and leaves the rest
  // to the partition that owns them: the contract error is the only finding, and no rubric, judge or labelled item is called
  // missing, unused or unknown for want of the plan's rubrics.
  for (const [name, layout] of [
    [
      'a rubric only the held-out plan declares',
      () => {
        rubricChange('contract.json', (contract) => (contract.rubrics = []));
        rubricChange(
          'policy/judge-calibration.json',
          (labelled) => (labelled.items = labelled.items.filter((item) => item.rubricId === 'R-101')),
        );
      },
    ],
    ['rubrics in both files', () => {}],
  ]) {
    const ran = rubricChecked(() => {
      layout();
      rubricChange('contract.json', (contract) => (contract.oracles[0].polarity = 'bogus'));
    });
    assert.equal(ran.status, 10, `${name}: ${ran.output}`);
    assert.match(ran.output, /contract\.json/, `${name}: the contract error is gone`);
    assert.doesNotMatch(
      ran.output,
      /\[judge(-calibration)?\]|no rubric|never used|unknown rubric criterion|calibration item/,
      `${name}: check blamed the rubrics, the judge or the labelled file for a contract error:\n${ran.output}`,
    );
  }

  // ---- a development run never opens the held-out plan; a held-out or both run refuses one it cannot read ----------------------
  for (const [name, edit] of [
    ['an unparsable plan', () => write(planFile, 'canary-garbage {"interactionPlan": [')],
    ['an absent plan', () => fs.rmSync(planFile)],
  ]) {
    edit();
    assert.equal(cli(guarded, 'digest').status, 0);
    const manifest = read(path.join(guarded.folder, 'evaluation.json'));
    assert.equal(
      loadContractView({ folder: guarded.folder, evaluation: manifest, partition: 'development' }).bytes.equals(
        originals.get('contract.json'),
      ),
      true,
    );
    for (const partition of ['held-out', 'both']) {
      assert.throws(
        () => loadContractView({ folder: guarded.folder, evaluation: manifest, partition }),
        PartitionPlanError,
        `${name}: ${partition}`,
      );
    }
    const before = launchCount(guarded);
    const developmentRun = cli(guarded, 'preflight', ['--partition', 'development']);
    assert.equal(developmentRun.status, 0, `${name}: a development preflight opened the held-out plan\n${developmentRun.output}`);
    assert.ok(launchesSince(guarded, before).length > 0);
    assert.equal(developmentRun.output.includes('canary-'), false);
    for (const args of [['--partition', 'held-out'], []]) {
      const refused = cli(guarded, 'preflight', args);
      assert.equal(refused.status, 10, `${name} ${args.join(' ')}: ${refused.output}`);
      assert.match(refused.output, /corpus\/held-out\/plan\.json (does not parse as JSON|cannot be read \(ENOENT\))/);
      assert.equal(refused.output.includes('canary-garbage'), false);
    }
    for (const [file, bytes] of originals) fs.writeFileSync(path.join(guarded.folder, file), bytes);
    assert.equal(cli(guarded, 'digest').status, 0);
  }
  // A probe file that does not parse sends preflight and run down their fallback; a development run stays a development run
  // there, so the held-out plan beside it is neither opened, validated nor named.
  write(planFile, 'canary-garbage {"interactionPlan": [');
  write(path.join(guarded.folder, 'probes/P-006.probe.json'), 'canary-bad-probe {');
  try {
    for (const command of ['preflight', 'run']) {
      const development = cli(guarded, command, ['--partition', 'development']);
      assert.equal(development.status, 10, `${command}: ${development.output}`);
      assert.match(development.output, /probes\/P-006\.probe\.json/, `${command} did not report the probe`);
      assert.doesNotMatch(development.output, /plan\.json|canary-garbage/, `${command}: a development run named the held-out plan`);
      const both = cli(guarded, command);
      assert.match(both.output, /corpus\/held-out\/plan\.json does not parse as JSON/, `${command}: the control run skipped the plan`);
    }
  } finally {
    fs.rmSync(path.join(guarded.folder, 'probes/P-006.probe.json'));
    fs.writeFileSync(planFile, originals.get(PLAN_FILE));
    assert.equal(cli(guarded, 'digest').status, 0);
  }

  // A plan rewritten without a new index is stale for check and for a run that opens it, and invisible to a development run.
  fs.writeFileSync(planFile, `${fs.readFileSync(planFile, 'utf8')}\n`);
  assert.equal(cli(guarded, 'preflight', ['--partition', 'development']).status, 0);
  const staleRun = cli(guarded, 'preflight', ['--partition', 'held-out']);
  assert.equal(staleRun.status, 10, staleRun.output);
  assert.match(staleRun.output, /corpus-index\.json is stale.*corpus\/held-out\/plan\.json changed or added/);
  fs.writeFileSync(planFile, originals.get(PLAN_FILE));

  // ---- preflight and run, each partition launches only its own requests ------------------------------------------------------
  const flow = planProject('plan-flow');
  const PARTITION_REQUESTS = {
    development: [SHARED_REQUEST, DEVELOPMENT_REQUEST],
    'held-out': [SHARED_REQUEST, HELD_OUT_REQUEST],
    both: [SHARED_REQUEST, DEVELOPMENT_REQUEST, HELD_OUT_REQUEST],
  };
  const PREFLIGHT_REQUESTS = {
    development: [...PARTITION_REQUESTS.development, ...WITNESSES, DEVELOPMENT_WITNESS],
    'held-out': [...PARTITION_REQUESTS['held-out'], ...WITNESSES, HELD_OUT_WITNESS],
    both: [...PARTITION_REQUESTS.both, ...WITNESSES, DEVELOPMENT_WITNESS, HELD_OUT_WITNESS],
  };
  const sorted = (list) => [...new Set(list)].sort();
  /** One qualified run's workspaces: a trial runs each authorized step once; a qualification runs it once per arm. */
  const assertLaunches = (partition, launches, { trials }) => {
    assert.deepEqual(
      sorted(launches.map(({ request }) => request)),
      sorted(PREFLIGHT_REQUESTS[partition]),
      `${partition}: launched requests`,
    );
    for (const [workspace, requests] of requestsByWorkspace(launches)) {
      if (trials && workspace?.startsWith('trial-')) {
        assert.deepEqual([...requests].sort(), [...PARTITION_REQUESTS[partition]].sort(), `${partition}: ${workspace} launched`);
      }
      if (workspace?.startsWith('qualify-')) {
        const counts = new Set(PARTITION_REQUESTS[partition].map((request) => requests.filter((launched) => launched === request).length));
        assert.equal(counts.size, 1, `${partition}: ${workspace} ran the plan unevenly (${requests.join(' | ')})`);
        assert.ok([...counts][0] >= 1);
      }
    }
  };
  const qualified = (run) => fs.readdirSync(path.join(run, 'qualification')).sort();
  const developmentLog = [];
  const heldOutLog = [];

  let mark = launchCount(flow);
  const developmentPreflight = cli(flow, 'preflight', ['--partition', 'development']);
  assert.equal(developmentPreflight.status, 0, developmentPreflight.output);
  assertLaunches('development', launchesSince(flow, mark), { trials: false });
  const developmentPreflightRun = test.latest(flow.folder);
  assert.deepEqual(qualified(developmentPreflightRun), ['P-002', 'P-004']);
  assert.deepEqual(viewOf(developmentPreflightRun).steps, ['shared-run', 'development-run']);
  developmentLog.push(developmentPreflight.output);

  mark = launchCount(flow);
  const heldOutPreflight = cli(flow, 'preflight', ['--partition', 'held-out']);
  assert.equal(heldOutPreflight.status, 0, heldOutPreflight.output);
  assertLaunches('held-out', launchesSince(flow, mark), { trials: false });
  const heldOutPreflightRun = test.latest(flow.folder);
  assert.deepEqual(qualified(heldOutPreflightRun), ['P-003'], 'preflight --partition held-out qualified a development probe');
  assert.deepEqual(viewOf(heldOutPreflightRun).steps, ['shared-run', 'held-out-run']);
  heldOutLog.push(heldOutPreflight.output);

  assert.equal(cli(flow, 'preflight', ['--partition', 'unknown']).status, 64);

  // Development first: it launches nothing of the held-out partition, and its run directory, scores and output hold none of it.
  mark = launchCount(flow);
  const developmentRan = cli(flow, 'run', ['--partition', 'development']);
  assert.equal(developmentRan.status, 0, developmentRan.output);
  assertLaunches('development', launchesSince(flow, mark), { trials: true });
  const developmentRun = test.latest(flow.folder);
  assert.equal(
    fs.readFileSync(path.join(developmentRun, 'contract.json')).equals(fs.readFileSync(path.join(flow.folder, 'contract.json'))),
    true,
    'the development run holds a contract.json that differs from the folder',
  );
  assert.deepEqual(viewOf(developmentRun), {
    steps: ['shared-run', 'development-run'],
    oracles: ['O-001', 'O-002'],
    behaviors: { 'B-001': ['O-001'], 'B-002': ['O-002'] },
  });
  const developmentScored = cli(flow, 'score', ['--run', path.basename(developmentRun)]);
  assert.equal(developmentScored.status, 0, developmentScored.output);
  developmentLog.push(developmentRan.output, developmentScored.output);
  assert.deepEqual(holding(developmentRun, KEEP_OUT.development), [], 'the development run holds the held-out partition');
  assert.deepEqual(
    JSON.parse(outcomes(developmentRun)).map(([probeId, outcome]) => [probeId, outcome.caught]),
    [
      ['P-001', false],
      ['P-002', true],
      ['P-004', true],
    ],
  );

  const accepted = cli(flow, 'compare', ['--run', path.basename(developmentRun), '--accept']);
  assert.equal(accepted.status, 0, accepted.output);
  developmentLog.push(accepted.output);
  commit(flow.repository, 'development baseline');
  assert.deepEqual(
    holding(path.join(flow.folder, 'baseline'), KEEP_OUT.development),
    [],
    'the development replay holds the held-out partition',
  );
  const developmentCi = cli(flow, 'ci', ['--tier', 'pr']);
  assert.equal(developmentCi.status, 0, developmentCi.output);
  assert.doesNotMatch(developmentCi.output, /stale/, 'a development baseline replays as stale');
  developmentLog.push(developmentCi.output);
  assert.deepEqual(
    developmentLog.flatMap((text) => KEEP_OUT.development.filter((token) => text.includes(token))),
    [],
    'a development command printed the held-out partition',
  );

  // Then held-out: the canary reaches the target, the held-out view scores, and the gap loop's view says only what it may.
  mark = launchCount(flow);
  const heldOutRan = cli(flow, 'run', ['--partition', 'held-out']);
  assert.equal(heldOutRan.status, 0, heldOutRan.output);
  assertLaunches('held-out', launchesSince(flow, mark), { trials: true });
  assert.ok(
    launchesSince(flow, mark).some(({ request }) => request === HELD_OUT_REQUEST),
    'the held-out request never reached the target',
  );
  const heldOutRun = test.latest(flow.folder);
  assert.deepEqual(viewOf(heldOutRun), {
    steps: ['shared-run', 'held-out-run'],
    oracles: ['O-001', 'O-101'],
    behaviors: { 'B-001': ['O-001'], 'B-002': ['O-101'] },
  });
  const heldOutScored = cli(flow, 'score', ['--run', path.basename(heldOutRun)]);
  assert.equal(heldOutScored.status, 0, heldOutScored.output);
  heldOutLog.push(heldOutRan.output, heldOutScored.output);
  assert.deepEqual(holding(heldOutRun, KEEP_OUT['held-out']), [], 'the held-out run holds the development partition');
  const heldOutOutcome = read(path.join(heldOutRun, 'partitions.json'))['held-out'][0].outcome;
  assert.equal(heldOutOutcome.caught, true, JSON.stringify(heldOutOutcome));
  const gap = read(path.join(heldOutRun, 'gap-view.json'));
  assert.deepEqual(Object.keys(gap['held-out'][0]).sort(), ['outcome', 'probeClass', 'probeId']);
  assert.equal(JSON.stringify(gap).includes(CANARY), false, 'the gap view carries the canary');
  assert.equal(JSON.stringify(gap).includes('held-out-run'), false, 'the gap view carries the held-out step');

  // Independent of the development run: delete its directory and score the held-out run again.
  const heldOutBefore = outcomes(heldOutRun);
  for (const run of [developmentPreflightRun, developmentRun]) fs.rmSync(run, { recursive: true });
  const rescored = cli(flow, 'score', ['--run', path.basename(heldOutRun)]);
  assert.equal(rescored.status, 0, rescored.output);
  assert.equal(outcomes(heldOutRun), heldOutBefore, 'rescoring without the development run changed the held-out outcome');

  const heldOutAccepted = cli(flow, 'compare', ['--run', path.basename(heldOutRun), '--accept']);
  assert.equal(heldOutAccepted.status, 0, heldOutAccepted.output);
  heldOutLog.push(heldOutAccepted.output);
  commit(flow.repository, 'held-out baseline');
  assert.deepEqual(
    holding(path.join(flow.folder, 'baseline'), KEEP_OUT['held-out']),
    [],
    'the held-out replay holds the development partition',
  );
  const heldOutCi = cli(flow, 'ci', ['--tier', 'pr']);
  assert.equal(heldOutCi.status, 0, heldOutCi.output);
  assert.doesNotMatch(heldOutCi.output, /stale/, 'a held-out baseline replays as stale: its contract is compiled from the wrong view');
  heldOutLog.push(heldOutCi.output);
  // A view that cannot be derived is a stale reason of its own: the baseline never passes without its digest comparison.
  const sourceContractFile = path.join(flow.folder, 'contract.json');
  const sourceContract = fs.readFileSync(sourceContractFile);
  try {
    fs.writeFileSync(sourceContractFile, '{');
    const unreadable = cli(flow, 'ci', ['--tier', 'pr']);
    assert.notEqual(unreadable.status, 0, unreadable.output);
    assert.match(unreadable.output, /the held-out view of the contract cannot be derived \(an unexpected SyntaxError while deriving it\)/);
  } finally {
    fs.writeFileSync(sourceContractFile, sourceContract);
  }
  assert.deepEqual(
    heldOutLog.flatMap((text) => KEEP_OUT['held-out'].filter((token) => text.includes(token))),
    [],
    'a held-out command printed the development partition',
  );

  // Both, with no flag: the whole plan and every oracle, as before.
  mark = launchCount(flow);
  const bothRan = cli(flow, 'run');
  assert.equal(bothRan.status, 0, bothRan.output);
  assertLaunches('both', launchesSince(flow, mark), { trials: true });
  const bothRun = test.latest(flow.folder);
  assert.deepEqual(viewOf(bothRun), {
    steps: ['shared-run', 'development-run', 'held-out-run'],
    oracles: ['O-001', 'O-002', 'O-101'],
    behaviors: { 'B-001': ['O-001'], 'B-002': ['O-002', 'O-101'] },
  });
  const bothScored = cli(flow, 'score', ['--run', path.basename(bothRun)]);
  assert.equal(bothScored.status, 0, bothScored.output);
  // eval-quality designates an oracle only for a behavior that names exactly one, and the both view gives B-002 its development
  // oracle and its held-out one, so the probes of B-002 are scored without a designated oracle here; every probe is still
  // scored, and the probes of B-001, which has one oracle in every view, read as they do in a partition's own run.
  const bothOutcomes = JSON.parse(outcomes(bothRun));
  assert.deepEqual(bothOutcomes.map(([probeId]) => probeId).sort(), ['P-001', 'P-002', 'P-003', 'P-004']);
  assert.deepEqual(
    bothOutcomes.filter(([probeId]) => ['P-001', 'P-002'].includes(probeId)).map(([probeId, outcome]) => [probeId, outcome.caught]),
    [
      ['P-001', false],
      ['P-002', true],
    ],
  );

  // ---- no partitionPlan: the source bytes in every view ----------------------------------------------------------------------
  const unplannedProject = test.project(
    'plan-absent',
    ({ folder }) => {
      const manifest = path.join(folder, 'evaluation.json');
      write(manifest, { ...read(manifest), heldOutProbes: ['P-002'] });
      relayContract(folder);
    },
    { marker: true },
  );
  for (const args of [['--partition', 'development'], ['--partition', 'held-out'], []]) {
    const ran = test.cli(unplannedProject.folder, 'preflight', args, unplannedProject.env);
    assert.equal(ran.status, 0, `${args.join(' ')}: ${ran.output}`);
    const run = test.latest(unplannedProject.folder);
    assert.equal(
      fs.readFileSync(path.join(run, 'contract.json')).equals(fs.readFileSync(path.join(unplannedProject.folder, 'contract.json'))),
      true,
      `a run with no partitionPlan rewrote contract.json (${args.join(' ') || 'both'})`,
    );
  }
  // ---- rubrics through run and score: each partition judges and calibrates its own criteria (Story 1.105) ---------------------
  // One labelled file serves every partition. It holds two items per criterion, so the development run is handed items of the
  // held-out criterion and the held-out run items of the development one, and each must leave them unjudged.
  const rubricFlow = planProject('plan-rubric-flow', {});
  const rubricsOf = (run) => read(path.join(run, 'contract.json')).rubrics.map((rubric) => [rubric.id, rubric.criteria.map((c) => c.id)]);
  const calibratedIn = (run) => read(path.join(run, 'judge-calibration.json')).criteria.map((c) => `${c.rubricId}/${c.criterionId}`);
  const calibrationCalls = (calls) => calls.filter((call) => call.calibration);
  const trialCalls = (calls) => calls.filter((call) => !call.calibration);
  /** Runs a partition and returns its run directory and the judge's calls. */
  const rubricRun = (args) => {
    const from = judgeCallCount(rubricFlow);
    const ran = cli(rubricFlow, 'run', args);
    assert.equal(ran.status, 0, ran.output);
    const run = test.latest(rubricFlow.folder);
    const scored = cli(rubricFlow, 'score', ['--run', path.basename(run)]);
    assert.equal(scored.status, 0, scored.output);
    return { run, calls: judgeCalls(rubricFlow, from), output: `${ran.output}${scored.output}` };
  };

  const rubricDevelopment = rubricRun(['--partition', 'development']);
  assert.deepEqual(rubricsOf(rubricDevelopment.run), [['R-001', ['RC-001', 'RC-002']]]);
  assert.deepEqual(calibratedIn(rubricDevelopment.run), ['R-001/RC-001', 'R-001/RC-002']);
  assert.equal(
    calibrationCalls(rubricDevelopment.calls).length,
    4,
    'the development run did not judge exactly its own four calibration items',
  );
  assert.ok(trialCalls(rubricDevelopment.calls).length > 0, 'the development run judged no trial');
  assert.deepEqual(
    [...new Set(trialCalls(rubricDevelopment.calls).map((call) => call.criteria.join(',')))],
    ['R-001/RC-001,R-001/RC-002'],
    'a development trial was judged on another set of criteria',
  );
  assert.equal(
    rubricDevelopment.calls.some((call) => call.prompt.includes('RC-101') || call.prompt.includes(CANARY)),
    false,
    'the judge of a development run was handed the held-out criterion or one of its calibration items',
  );
  assert.deepEqual(holding(rubricDevelopment.run, RUBRIC_KEEP_OUT.development), [], 'the development run holds the held-out criterion');
  assert.equal(rubricDevelopment.output.includes('RC-101'), false);

  const rubricHeldOut = rubricRun(['--partition', 'held-out']);
  assert.deepEqual(rubricsOf(rubricHeldOut.run), [
    ['R-001', ['RC-002']],
    ['R-101', ['RC-101']],
  ]);
  assert.deepEqual(calibratedIn(rubricHeldOut.run), ['R-001/RC-002', 'R-101/RC-101']);
  assert.equal(calibrationCalls(rubricHeldOut.calls).length, 4, 'the held-out run did not judge exactly its own four calibration items');
  assert.deepEqual(
    [...new Set(trialCalls(rubricHeldOut.calls).map((call) => call.criteria.join(',')))],
    ['R-001/RC-002,R-101/RC-101'],
    'a held-out trial was judged on another set of criteria',
  );
  assert.equal(
    rubricHeldOut.calls.some((call) => call.prompt.includes('RC-001') || call.prompt.includes(DEVELOPMENT_CRITERION.text)),
    false,
    'the judge of a held-out run was handed the development criterion or one of its calibration items',
  );
  assert.deepEqual(holding(rubricHeldOut.run, RUBRIC_KEEP_OUT['held-out']), [], 'the held-out run holds the development criterion');
  const rubricHeldOutOutcome = read(path.join(rubricHeldOut.run, 'partitions.json'))['held-out'][0].outcome;
  assert.equal(rubricHeldOutOutcome.caught, true, JSON.stringify(rubricHeldOutOutcome));
  const rubricGap = JSON.stringify(read(path.join(rubricHeldOut.run, 'gap-view.json')));
  assert.equal(rubricGap.includes('RC-101') || rubricGap.includes('R-101'), false, 'the gap view names the held-out criterion');

  // The whole contract judges every criterion once, and a labelled file that names a criterion of no view is refused there.
  const rubricBoth = rubricRun([]);
  assert.deepEqual(rubricsOf(rubricBoth.run), [
    ['R-001', ['RC-001', 'RC-002']],
    ['R-101', ['RC-101']],
  ]);
  assert.equal(calibrationCalls(rubricBoth.calls).length, 6, 'the both run did not judge every calibration item');
  const labelledFile = path.join(rubricFlow.folder, 'policy/judge-calibration.json');
  const labelledBytes = fs.readFileSync(labelledFile);
  try {
    const labelled = read(labelledFile);
    labelled.items.push({ rubricId: 'R-101', criterionId: 'RC-009', response: 'calibration response', expectedLevel: 0 });
    write(labelledFile, labelled);
    const refused = cli(rubricFlow, 'run');
    assert.equal(refused.status, 10, refused.output);
    assert.match(refused.output, /items\[6\] names unknown rubric criterion R-101\/RC-009/);
  } finally {
    fs.writeFileSync(labelledFile, labelledBytes);
  }

  // `ci`'s judge-calibration check calibrates the view of the baseline's partition. A rubric only the held-out plan declares left
  // `contract.json` with none, so the check used to report "no rubric declared" and skip the calibration it exists to gate.
  const rubricCi = planProject('plan-rubric-ci', { development: [], heldOut: [HELD_OUT_CRITERION] });
  /** The CI plan of a project reduced to the scheduled judge-calibration check. */
  const calibrationOnlyPlan = (project) =>
    write(path.join(project.folder, 'ci/evaluation-ci-plan.json'), {
      schemaVersion: 1,
      checks: [
        {
          id: 'judge-calibration',
          tier: 'scheduled',
          trigger: ['schedule', 'manual-dispatch'],
          kind: 'evaluate',
          command: ['tea-evaluate', 'ci', '--evaluation', '.', '--tier', 'scheduled'],
          enforcement: 'block',
          evidence: ['runs/<invocationId>/checks/judge-calibration/stdout'],
          placement: { tier: 'scheduled', defaultTier: 'scheduled', reason: 'AD-10 default' },
        },
      ],
    });
  calibrationOnlyPlan(rubricCi);
  commit(rubricCi.repository, 'scheduled plan');
  const calibratedByCi = cli(rubricCi, 'ci', ['--tier', 'scheduled']);
  assert.equal(calibratedByCi.status, 0, calibratedByCi.output);
  assert.doesNotMatch(
    calibratedByCi.output,
    /declares no rubric/,
    'ci skipped the calibration of a rubric only the held-out plan declares',
  );
  assert.equal(
    judgeCalls(rubricCi).filter((call) => call.calibration).length,
    2,
    'ci did not calibrate the held-out criterion over its two labelled items',
  );

  // The check follows the partition the baseline recorded, not the whole contract. A development baseline sees `contract.json`
  // alone: its development criterion is calibrated, and the plan's rubric is not, whatever the plan holds.
  /** Accepts the run of `partition` as the project's baseline and commits it. */
  const acceptBaseline = (project, partition) => {
    const ran = cli(project, 'run', ['--partition', partition]);
    assert.equal(ran.status, 0, ran.output);
    const run = test.latest(project.folder);
    assert.equal(cli(project, 'score', ['--run', path.basename(run)]).status, 0);
    const accepted = cli(project, 'compare', ['--run', path.basename(run), '--accept']);
    assert.equal(accepted.status, 0, accepted.output);
    commit(project.repository, `${partition} baseline`);
  };
  const developmentBaseline = planProject('plan-rubric-ci-development', { development: [DEVELOPMENT_CRITERION], heldOut: [] });
  calibrationOnlyPlan(developmentBaseline);
  commit(developmentBaseline.repository, 'scheduled plan');
  acceptBaseline(developmentBaseline, 'development');
  const developmentCalls = judgeCallCount(developmentBaseline);
  const developmentCalibrated = cli(developmentBaseline, 'ci', ['--tier', 'scheduled']);
  assert.equal(developmentCalibrated.status, 0, developmentCalibrated.output);
  assert.doesNotMatch(developmentCalibrated.output, /declares no rubric/, 'ci skipped the calibration of a development baseline');
  const developmentBaselineCalls = judgeCalls(developmentBaseline, developmentCalls);
  assert.deepEqual(
    developmentBaselineCalls.filter((call) => call.calibration).map((call) => call.criteria.join(',')),
    ['R-001/RC-001', 'R-001/RC-001'],
    'ci did not calibrate the development criterion over its two labelled items',
  );
  // A plan rubric no development view holds is not this baseline's to calibrate, and the plan is not opened to find out: a plan
  // that cannot be read changes nothing.
  acceptBaseline(rubricCi, 'development');
  const planBytes = fs.readFileSync(path.join(rubricCi.folder, PLAN_FILE));
  const beforeCorrupt = judgeCallCount(rubricCi);
  try {
    write(path.join(rubricCi.folder, PLAN_FILE), 'canary-garbage {"interactionPlan": [');
    const skipped = cli(rubricCi, 'ci', ['--tier', 'scheduled']);
    assert.equal(skipped.status, 0, skipped.output);
    const evidence = /evidence is in (runs\/[^ ]+)/.exec(skipped.output)?.[1];
    assert.ok(evidence, skipped.output);
    assert.match(
      fs.readFileSync(path.join(rubricCi.folder, evidence, 'checks/judge-calibration/stdout'), 'utf8'),
      /the contract declares no rubric/,
      'ci did not report the development baseline as holding no rubric',
    );
    assert.doesNotMatch(
      skipped.output,
      /corpus\/held-out\/plan\.json|canary-garbage|\[partition-plan\]/,
      'the development baseline opened the held-out plan',
    );
    assert.equal(judgeCallCount(rubricCi), beforeCorrupt, 'ci judged for a development baseline whose view holds no rubric');
  } finally {
    fs.writeFileSync(path.join(rubricCi.folder, PLAN_FILE), planBytes);
  }

  // A held-out baseline sees the plan's rubric and the criteria of `contract.json` its view reaches (here none, the development
  // criterion reads a development-only step), so the check calibrates the plan's criterion alone; a plan that cannot be read is then
  // the check's authoring finding, since this baseline's view cannot be built without it.
  const heldOutBaseline = planProject('plan-rubric-ci-held-out', { development: [DEVELOPMENT_CRITERION], heldOut: [HELD_OUT_CRITERION] });
  calibrationOnlyPlan(heldOutBaseline);
  commit(heldOutBaseline.repository, 'scheduled plan');
  acceptBaseline(heldOutBaseline, 'held-out');
  const heldOutCalls = judgeCallCount(heldOutBaseline);
  const heldOutCalibrated = cli(heldOutBaseline, 'ci', ['--tier', 'scheduled']);
  assert.equal(heldOutCalibrated.status, 0, heldOutCalibrated.output);
  assert.doesNotMatch(heldOutCalibrated.output, /declares no rubric/, 'ci skipped the calibration of a held-out baseline');
  assert.deepEqual(
    judgeCalls(heldOutBaseline, heldOutCalls)
      .filter((call) => call.calibration)
      .map((call) => call.criteria.join(',')),
    ['R-101/RC-101', 'R-101/RC-101'],
    'ci did not calibrate the plan criterion over its two labelled items for a held-out baseline',
  );
  const heldOutPlanBytes = fs.readFileSync(path.join(heldOutBaseline.folder, PLAN_FILE));
  const heldOutBeforeCorrupt = judgeCallCount(heldOutBaseline);
  try {
    write(path.join(heldOutBaseline.folder, PLAN_FILE), 'canary-garbage {"interactionPlan": [');
    const refused = cli(heldOutBaseline, 'ci', ['--tier', 'scheduled']);
    assert.equal(refused.status, 10, refused.output);
    const refusedEvidence = /evidence is in (runs\/[^ ]+)/.exec(refused.output)?.[1];
    assert.ok(refusedEvidence, refused.output);
    const refusedFinding = fs.readFileSync(path.join(heldOutBaseline.folder, refusedEvidence, 'checks/judge-calibration/stdout'), 'utf8');
    assert.match(refusedFinding, /evaluation\.json: \[partition-plan\]/);
    assert.doesNotMatch(`${refused.output}${refusedFinding}`, /canary-/, 'the unreadable plan was quoted');
    assert.equal(judgeCallCount(heldOutBaseline), heldOutBeforeCorrupt, 'ci judged over a plan it could not read');
  } finally {
    fs.writeFileSync(path.join(heldOutBaseline.folder, PLAN_FILE), heldOutPlanBytes);
  }

  // With no baseline the run is the whole contract, so the check reads the both view. A rubric whose only criterion reads a
  // development-only step is still `contract.json`'s own; a view that dropped it would report "no rubric" and skip the gate.
  const developmentOnly = planProject('plan-rubric-ci-no-baseline', { development: [DEVELOPMENT_CRITERION], heldOut: [] });
  calibrationOnlyPlan(developmentOnly);
  commit(developmentOnly.repository, 'scheduled plan');
  const noBaselineCalibrated = cli(developmentOnly, 'ci', ['--tier', 'scheduled']);
  assert.equal(noBaselineCalibrated.status, 0, noBaselineCalibrated.output);
  assert.doesNotMatch(noBaselineCalibrated.output, /declares no rubric/, 'ci skipped the calibration of a folder with no baseline');
  assert.deepEqual(
    judgeCalls(developmentOnly)
      .filter((call) => call.calibration)
      .map((call) => call.criteria.join(',')),
    ['R-001/RC-001', 'R-001/RC-001'],
    'ci did not calibrate a development-only criterion over its two labelled items when no baseline names a partition',
  );

  // A plan that cannot be read is the check's authoring finding when no baseline narrows the view to `contract.json`: the folder
  // would otherwise pass as declaring no rubric.
  const corruptPlan = planProject('plan-rubric-ci-corrupt-plan', { development: [], heldOut: [HELD_OUT_CRITERION] });
  calibrationOnlyPlan(corruptPlan);
  write(path.join(corruptPlan.folder, PLAN_FILE), 'canary-garbage {"interactionPlan": [');
  commit(corruptPlan.repository, 'scheduled plan and an unreadable plan');
  const corrupted = cli(corruptPlan, 'ci', ['--tier', 'scheduled']);
  assert.equal(corrupted.status, 10, corrupted.output);
  const corruptedEvidence = /evidence is in (runs\/[^ ]+)/.exec(corrupted.output)?.[1];
  assert.ok(corruptedEvidence, corrupted.output);
  const corruptedFinding = fs.readFileSync(path.join(corruptPlan.folder, corruptedEvidence, 'checks/judge-calibration/stdout'), 'utf8');
  assert.match(corruptedFinding, /evaluation\.json: \[partition-plan\]/);
  assert.doesNotMatch(`${corrupted.output}${corruptedFinding}`, /canary-/, 'the unreadable plan was quoted');
  assert.doesNotMatch(corruptedFinding, /declares no rubric/);
  assert.equal(judgeCallCount(corruptPlan), 0, 'ci judged over a plan it could not read');

  // An empty held-out set is an authoring defect for preflight, as it is for run.
  const none = test.project('plan-none');
  for (const command of ['preflight', 'run']) {
    const refused = test.cli(none.folder, command, ['--partition', 'held-out'], none.env);
    assert.equal(refused.status, 10, `${command}: ${refused.output}`);
    assert.match(refused.output, /held-out partition has no selected probes/);
  }
  process.stdout.write('Evaluate partition plans passed.\n');
} finally {
  test.cleanup();
}
