'use strict';

/**
 * The fixture, constants, layers and helpers the Story 1.51 partition-plan suites share:
 * `test/test-evaluate-partition-plans.js` (views, `check`, run and score) and
 * `test/test-evaluate-partition-plans-attempts.js` (the evaluator mapping, records and gameability flows). Each suite calls the
 * factory with its own name, so each owns its scratch directories and the two never share one.
 */

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { RUN_LABELS } = require('../../cli/lib/evaluate/records');
const { suite } = require('./evaluate-story-121');

/** The `schemaVersion` a runtime schema of the Evaluate commands declares, which the files built here carry as the product's readers expect. */
const schemaVersionOf = (name) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'cli', 'lib', 'evaluate', 'schemas', `${name}.schema.json`), 'utf8'))
    .properties.schemaVersion.const;
const CONDITIONS_VERSION = schemaVersionOf('evaluator-conditions');
const MAPPING_VERSION = schemaVersionOf('evaluator-mapping');
const ANSWERS_VERSION = schemaVersionOf('degenerate-response');

function createHarness(suiteName) {
  const FIXTURE = path.join(__dirname, '..', 'fixtures', 'evaluate', 'partition-plan');
  const CI_PLAN = path.join(__dirname, '..', 'fixtures', 'evaluate', 'mutation', 'evals', 'verdict-ci', 'ci', 'evaluation-ci-plan.json');
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
  const STUB_JUDGE = path.join(__dirname, '..', 'fixtures', 'evaluate', 'stub-judge.js');
  const STUB_AGENT = path.join(__dirname, '..', 'fixtures', 'evaluate', 'evaluators', 'stub-evaluator-agent.js');
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

  /**
   * The waiver layer: waivers of `contract.json` that read a development-only step and a shared one, and a held-out waiver in the plan
   * (Story 1.106). A waiver is complete (a rule, a rationale, an approval and an expiry), because the engine's compile refuses one that
   * is not (`waiver-incomplete`).
   */
  const waiverOf = (id, rationale, condition) => ({
    id,
    rule: 'omission-and-completeness',
    rationale,
    condition,
    approval: 'gate-c-reviewer',
    expiresAt: '2099-01-01T00:00:00Z',
  });
  const DEVELOPMENT_WAIVER = waiverOf('W-001', 'The development case is flaky.', '/interactions/development-run/exit-code is absent');
  const SHARED_WAIVER = waiverOf('W-002', 'The shared request has no seed here.', '/interactions/shared-run/exit-code is absent');
  const HELD_OUT_WAIVER = waiverOf('W-101', `${CANARY}: the held-out case is flaky.`, '/interactions/held-out-run/exit-code is absent');
  /** A plan waiver that reads a shared step: both of the plan's partitions may honour it, so the held-out and both views keep it. */
  const HELD_OUT_SHARED_WAIVER = waiverOf(
    'W-103',
    'The shared request has no exit code here.',
    '/interactions/shared-run/exit-code is absent',
  );
  /** What must stay out of each partition's artifacts once waivers join the plan: the other partition's own waivers. */
  const WAIVER_KEEP_OUT = {
    development: [...KEEP_OUT.development, 'W-101', 'W-103', HELD_OUT_SHARED_WAIVER.rationale],
    'held-out': [...KEEP_OUT['held-out'], 'W-001', DEVELOPMENT_WAIVER.rationale],
  };

  /**
   * The mapping layer (Story 1.107): a command evaluator (`test/fixtures/evaluate/partition-plan-evaluator/`) judges every trial, and
   * `evaluator/mapping.json` binds the keys it prints. The development partition reads `contract.json`, so the file holds the rows of the
   * shared and the development-only oracle, and the held-out plan's `mappings` hold the row of the held-out oracle. With rubrics, the
   * same split holds for criterion rows.
   */
  const EVALUATOR_FIXTURE = path.join(__dirname, '..', 'fixtures', 'evaluate', 'partition-plan-evaluator');
  const SHARED_ROW = { oracleId: 'O-001', behaviorId: 'B-001' };
  const DEVELOPMENT_ROW = { oracleId: 'O-002', behaviorId: 'B-002' };
  const HELD_OUT_ROW = { oracleId: 'O-101', behaviorId: 'B-002' };
  const criterionRow = (rubricId, criterion) => ({ rubricId, criterionId: criterion.id, levels: [0, 1] });
  /** What must stay out of each partition's artifacts once the evaluator's keys are partitioned: the other partition's keys. */
  const MAPPING_KEEP_OUT = {
    development: [...RUBRIC_KEEP_OUT.development, 'accepted:held-out-run', 'score:held-out-run'],
    'held-out': [...RUBRIC_KEEP_OUT['held-out'], 'accepted:development-run', 'score:development-run'],
  };

  const test = suite(suiteName);
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
    { development = [DEVELOPMENT_CRITERION, SHARED_CRITERION], heldOut = [HELD_OUT_CRITERION], judge = true } = {},
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
      // Under another evaluator the evaluator scores the rubric itself, so a judge block would never be used (`check` refuses it).
      if (judge) {
        evaluation.judge = {
          agent: 'custom',
          agentCommand: process.execPath,
          agentArgs: [STUB_JUDGE, '--capture', path.join(directory, 'prompts.jsonl')],
          timeoutMs: 60_000,
        };
      }
      evaluation.judgeCalibration = { minimumAgreement: 0.5 };
    });
    if (judge) {
      write(path.join(folder, 'policy/evaluator-conditions.json'), {
        schemaVersion: CONDITIONS_VERSION,
        modelSnapshot: 'none',
        systemPromptDigest: `sha256:${crypto.createHash('sha256').update('').digest('hex')}`,
        judge: { modelSnapshot: 'stub-judge-2026-09' },
      });
    }
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

  /**
   * The waiver layer over a project's folder (Story 1.106): `contract.json` gains the `development` waivers and the held-out plan the
   * `heldOut` ones. Stories that partition more of the contract extend a project through this layer and `rubricLayer`.
   */
  function waiverLayer(
    { folder },
    { development = [DEVELOPMENT_WAIVER, SHARED_WAIVER], heldOut = [HELD_OUT_WAIVER, HELD_OUT_SHARED_WAIVER] } = {},
  ) {
    const edit = (file, change) => {
      const value = read(path.join(folder, file));
      change(value);
      write(path.join(folder, file), value);
    };
    edit('contract.json', (contract) => {
      contract.waivers = development;
    });
    edit(PLAN_FILE, (plan) => {
      if (heldOut.length > 0) plan.waivers = heldOut;
    });
  }

  /**
   * The gameability layer (Story 1.109): a development gameability probe P-005 and a held-out one P-006, both on B-002, whose naive oracle
   * is O-001, the shared oracle every view keeps. Each probe's degenerate response splits where the plan does: `corpus/gameability/` answers
   * the steps of `contract.json` (the shared one, which satisfies O-001, and the development-only one, which O-002 rejects) and
   * `corpus/held-out/gameability/`, beside the held-out plan, answers the held-out plan's step with the canary, which O-101 rejects. The
   * second probe answers the same steps from its own bytes. `heldOut` is the held-out probe's partition: it joins `heldOutProbes` unless
   * `false`. Stories that partition more of the gameability arm extend a project through this layer.
   */
  const SHARED_ANSWER = { stdout: 'request: Judge the request.\nverdict: accepted\n', stderr: '', exitCode: 0 };
  const DEVELOPMENT_ANSWER = { stdout: 'verdict: pending, development case\n', stderr: '', exitCode: 0 };
  const HELD_OUT_ANSWER = { stdout: `${CANARY}: verdict: pending\n`, stderr: '', exitCode: 0 };
  const HELD_OUT_ANSWERS_DIR = 'corpus/held-out/gameability';
  const gameabilityProbeOf = (probeId, signatureOf) => ({
    probeId,
    probeClass: 'gameability',
    behaviorId: 'B-002',
    expectedClean: false,
    rationale: 'Gameability: a shortcut answer prints a pending verdict without judging the request.',
    defects: [],
    defectSignature: signatureOf,
    qualification: {
      route: 'gameability',
      degenerateResponse: 'Prints a pending verdict and exits 0, without judging the request.',
      naiveOracle: 'O-001',
    },
  });
  function gameabilityLayer({ folder }, { heldOut = true } = {}) {
    const signature = (probeFile) => {
      const value = structuredClone(read(path.join(folder, 'probes', probeFile)).defectSignature);
      value.condition.predicate.operands[1].literal = 'verdict: pending';
      return value;
    };
    // The both view answers every step of the plan for every gameability probe, so an oracle the answer violates at any step files a
    // finding that cites the probe, and the probe's signature must admit the answer there too (Story 1.110): both probes select
    // any prompt, where a signature that selects one step's request reads the other step's finding as an unwitnessed claim.
    const gameabilitySignature = signature('P-003.probe.json');
    write(path.join(folder, 'probes/P-005.probe.json'), gameabilityProbeOf('P-005', gameabilitySignature));
    write(path.join(folder, 'probes/P-006.probe.json'), gameabilityProbeOf('P-006', gameabilitySignature));
    for (const probeId of ['P-005', 'P-006']) {
      fs.mkdirSync(path.join(folder, 'corpus/gameability'), { recursive: true });
      write(path.join(folder, `corpus/gameability/${probeId}.json`), {
        schemaVersion: ANSWERS_VERSION,
        steps: { 'shared-run': SHARED_ANSWER, 'development-run': DEVELOPMENT_ANSWER },
      });
      fs.mkdirSync(path.join(folder, HELD_OUT_ANSWERS_DIR), { recursive: true });
      write(path.join(folder, `${HELD_OUT_ANSWERS_DIR}/${probeId}.json`), {
        schemaVersion: ANSWERS_VERSION,
        steps: { 'held-out-run': HELD_OUT_ANSWER },
      });
    }
    const evaluation = read(path.join(folder, 'evaluation.json'));
    evaluation.arms = [...evaluation.arms, 'gameability'];
    if (heldOut) evaluation.heldOutProbes = [...evaluation.heldOutProbes, 'P-006'];
    write(path.join(folder, 'evaluation.json'), evaluation);
  }

  /**
   * The several-oracles layer (Story 1.110): a behavior B-003 that lists two development-only oracles in `contract.json` (copies of
   * O-002) and one held-out oracle in the plan (a copy of O-101), and a development clean control P-007 on it. `check` holds a defect or
   * gameability probe to a behavior of exactly one oracle, so a clean control is the probe whose partition view lists several.
   */
  function severalOraclesLayer({ folder }) {
    const contractFile = path.join(folder, 'contract.json');
    const contract = read(contractFile);
    const copyOf = (list, id, to) => ({ ...structuredClone(list.find((entry) => entry.id === id)), id: to });
    contract.oracles.push(copyOf(contract.oracles, 'O-002', 'O-004'), copyOf(contract.oracles, 'O-002', 'O-005'));
    const behavior = copyOf(contract.behaviors, 'B-002', 'B-003');
    behavior.requirementLinks = [{ scheme: 'tea-evaluate-fixture', id: 'strict-policy-accepts-second-case' }];
    behavior.oracles = ['O-004', 'O-005'];
    contract.behaviors.push(behavior);
    write(contractFile, contract);
    const plan = read(path.join(folder, PLAN_FILE));
    plan.oracles.push(copyOf(plan.oracles, 'O-101', 'O-102'));
    plan.behaviorOracles['B-003'] = ['O-102'];
    write(path.join(folder, PLAN_FILE), plan);
    write(path.join(folder, 'probes/P-007.probe.json'), {
      ...read(path.join(folder, 'probes/P-001.probe.json')),
      probeId: 'P-007',
      behaviorId: 'B-003',
    });
  }

  /**
   * Wires the stub sealed-brief agent into a folder (Story 1.107): the stub through the `custom` adapter, the qualification the adopter
   * declares, a tool-call budget for its bridged run, and the model snapshot it runs under. `capture` is the file the stub appends its
   * prompt to. The stub answers the key `verdict-accepted`, so the mapping it reads binds that key. It judges a request of its own
   * that no mutation of the fixture's target changes, so a run through it holds the qualification to a `minimumAgreement` of 0.
   */
  function sealedBriefAgentLayer(folder, capture, minimumAgreement = 0.9) {
    const edit = (file, change) => {
      const value = read(path.join(folder, file));
      change(value);
      write(path.join(folder, file), value);
    };
    edit('evaluation.json', (evaluation) => {
      evaluation.evaluator = {
        kind: 'sealed-brief-agent',
        agent: 'custom',
        agentCommand: process.execPath,
        agentArgs: [STUB_AGENT, '--capture', capture],
        timeoutMs: 60_000,
      };
      evaluation.evaluatorQualification = { attempts: 2, minimumAgreement };
    });
    edit('contract.json', (contract) => (contract.budgets.maxToolCalls = 3));
    write(path.join(folder, 'policy/evaluator-conditions.json'), {
      schemaVersion: CONDITIONS_VERSION,
      modelSnapshot: 'none',
      systemPromptDigest: `sha256:${crypto.createHash('sha256').update('').digest('hex')}`,
      evaluator: { modelSnapshot: 'stub-evaluator-2026-09' },
    });
  }

  /**
   * The mapping layer over a project's folder (Story 1.107): the stub command evaluator in `evaluator/`, its mapping (the rows of the
   * shared and the development-only oracle, and with `rubric` those of the development and the shared criterion), and the held-out
   * plan's `mappings` (the held-out oracle's row, and with `rubric` the held-out criterion's). `rubric` joins the rubric layer with no
   * judge, since the evaluator scores the rubric itself. `agent` swaps the command for the stub sealed-brief agent. `canary` spells the plan's keys `canary-...`, for the `check` cases that never
   * run the evaluator and hold the output to none of the plan's text. `log` is the file the evaluator appends its stdin to. Stories
   * that partition more of the contract extend a project through this layer and the layers above.
   */
  function mappingLayer(
    { folder, directory },
    { rubric = false, canary = false, agent = false, log = path.join(directory, 'evaluator-input.jsonl') } = {},
  ) {
    if (rubric) {
      rubricLayer({ folder, directory }, { judge: false });
      // The stub names the key a score answers by the step the criterion reads, so each calibration response spells that key.
      const criteria = [DEVELOPMENT_CRITERION, SHARED_CRITERION, HELD_OUT_CRITERION];
      const file = path.join(folder, 'policy/judge-calibration.json');
      const labelled = read(file);
      for (const item of labelled.items) {
        const step = /^\/interactions\/([^/]+)\//.exec(criteria.find((criterion) => criterion.id === item.criterionId).evidence)[1];
        item.response = `calibration response score:${step} ${item.expectedLevel}`;
      }
      write(file, labelled);
    }
    fs.cpSync(EVALUATOR_FIXTURE, path.join(folder, 'evaluator'), { recursive: true });
    const keys = { 'accepted:shared-run': SHARED_ROW, 'accepted:development-run': DEVELOPMENT_ROW };
    const planRows = [{ key: canary ? 'canary-oracle-key' : 'accepted:held-out-run', ...HELD_OUT_ROW }];
    if (rubric) {
      keys['score:development-run'] = criterionRow('R-001', DEVELOPMENT_CRITERION);
      keys['score:shared-run'] = criterionRow('R-001', SHARED_CRITERION);
      planRows.push({ key: canary ? 'canary-criterion-key' : 'score:held-out-run', ...criterionRow('R-101', HELD_OUT_CRITERION) });
    }
    write(path.join(folder, 'evaluator/mapping.json'), { schemaVersion: MAPPING_VERSION, keys });
    const plan = read(path.join(folder, PLAN_FILE));
    plan.mappings = planRows;
    write(path.join(folder, PLAN_FILE), plan);
    const evaluation = read(path.join(folder, 'evaluation.json'));
    evaluation.evaluator = {
      kind: 'command',
      command: 'evaluator/rows.js',
      args: [...(rubric ? ['--rubric'] : []), '--labels', RUN_LABELS, '--log', log],
      timeoutMs: 60_000,
    };
    write(path.join(folder, 'evaluation.json'), evaluation);
    if (agent) {
      // The stub agent answers the key `verdict-accepted` for the shared oracle, so the file binds that key beside the development-only row.
      write(path.join(folder, 'evaluator/mapping.json'), {
        schemaVersion: MAPPING_VERSION,
        keys: { 'verdict-accepted': SHARED_ROW, 'accepted:development-run': DEVELOPMENT_ROW },
      });
      sealedBriefAgentLayer(folder, path.join(directory, 'agent-capture.jsonl'), 0);
    }
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

  /** Sets `evaluation.json` `tiers` to the tiers the plan places a check on. */
  function setTiers(folder, plan) {
    const file = path.join(folder, 'evaluation.json');
    const evaluation = read(file);
    const used = new Set(plan.checks.map((item) => item.placement.tier));
    evaluation.tiers = ['pr', 'merge', 'scheduled', 'release'].filter((tier) => used.has(tier));
    write(file, evaluation);
  }

  /**
   * The fixture's project, with the verdict CI plan placed on the folder (the plan names the folder by its path in the repository).
   * `layer` adds the rubric layer, `waivers` the waiver layer, `mappings` the mapping layer and `gameability` the gameability layer, each with
   * the options it takes; null leaves the fixture as it is. `several` adds the several-oracles layer.
   */
  function planProject(label, layer = null, waivers = null, mappings = null, gameability = null, several = false) {
    return test.project(
      label,
      ({ folder, directory }) => {
        // A byte-for-byte comparison of the run's contract.json with the folder's can fail only when the folder's layout is one
        // a view would not produce.
        if (layer !== null) rubricLayer({ folder, directory }, layer);
        if (waivers !== null) waiverLayer({ folder, directory }, waivers);
        if (mappings !== null) mappingLayer({ folder, directory }, mappings);
        if (gameability !== null) gameabilityLayer({ folder, directory }, gameability);
        if (several) severalOraclesLayer({ folder });
        relayContract(folder);
        fs.mkdirSync(path.join(folder, 'ci'));
        const plan = JSON.parse(
          fs.readFileSync(CI_PLAN, 'utf8').replaceAll('test/fixtures/evaluate/mutation/evals/verdict-ci', 'evals/verdict'),
        );
        // A contract that declares a rubric needs judge calibration on each live tier its plan uses (rule `applicability`).
        if (layer !== null || mappings?.rubric === true) {
          for (const tier of ['scheduled', 'release']) {
            const twin = plan.checks.find((item) => item.id === 'twin-run' && item.placement.tier === tier);
            plan.checks.push({
              ...twin,
              id: 'judge-calibration',
              enforcement: 'block',
              evidence: ['runs/<invocationId>/checks/judge-calibration/stdout'],
              placement: { ...twin.placement, reason: 'AD-10 default: a rubric is declared, so its judge is calibrated on this tier.' },
            });
          }
        }
        write(path.join(folder, 'ci/evaluation-ci-plan.json'), plan);
        setTiers(folder, plan);
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

  /**
   * The deterministic evaluator's output of a run, laid out as a records harness would seal it (Story 1.107): its evaluator
   * configuration, and per probe the records and the isolation manifest of the trial set. Returns the directory.
   */
  function snapshotRecords(project, run, label) {
    const target = path.join(project.directory, `records-${label}`);
    fs.mkdirSync(target);
    fs.copyFileSync(path.join(run, 'evaluator-configuration.json'), path.join(target, 'evaluator-configuration.json'));
    const sets = path.join(run, 'trial-sets');
    for (const entry of fs.readdirSync(sets, { withFileTypes: true }).filter((candidate) => candidate.isDirectory())) {
      fs.cpSync(path.join(sets, entry.name), path.join(target, entry.name), { recursive: true });
    }
    return target;
  }

  // The fixture's own files and the rubric and mapping sources derived from them, which the view cases and the evaluator flows both read.
  const fixtureFolder = path.join(FIXTURE, 'evals/verdict');
  const contractBytes = fs.readFileSync(path.join(fixtureFolder, 'contract.json'));
  const evaluation = read(path.join(fixtureFolder, 'evaluation.json'));
  const heldOutPlan = read(path.join(fixtureFolder, PLAN_FILE));
  const lateCriterion = criterionOf('RC-003', 'Does the development case exit cleanly?', 'development-run');
  const rubricSource = JSON.parse(contractBytes.toString('utf8'));
  rubricSource.rubrics = [
    rubricOf('R-001', [DEVELOPMENT_CRITERION, SHARED_CRITERION]),
    rubricOf('R-002', [lateCriterion]),
    rubricOf('R-003', []),
  ];
  const rubricBytes = Buffer.from(JSON.stringify(rubricSource, null, 4));
  const rubricPlan = { ...heldOutPlan, rubrics: [rubricOf('R-101', [HELD_OUT_CRITERION])] };
  const mappingSource = {
    schemaVersion: MAPPING_VERSION,
    keys: {
      'accepted:shared-run': SHARED_ROW,
      'accepted:development-run': DEVELOPMENT_ROW,
      'score:development-run': criterionRow('R-001', DEVELOPMENT_CRITERION),
      'score:shared-run': criterionRow('R-001', SHARED_CRITERION),
      'score:RC-003': criterionRow('R-002', lateCriterion),
    },
  };
  const HELD_OUT_ROWS = [
    { key: 'accepted:held-out-run', ...HELD_OUT_ROW },
    { key: 'score:held-out-run', ...criterionRow('R-101', HELD_OUT_CRITERION) },
  ];
  const mappingPlan = { ...rubricPlan, mappings: HELD_OUT_ROWS };
  /** The oracle each probe's call of a run's latest score was handed through `--designated-oracle`, null for a call handed none (Story 1.110). */
  const designatedBy = (callRecord) => {
    const { argv } = read(callRecord);
    const at = argv.indexOf('--designated-oracle');
    return at === -1 ? null : argv[at + 1];
  };

  return {
    FIXTURE,
    CI_PLAN,
    PLAN_FILE,
    GIT,
    GIT_ENV,
    CANARY,
    SHARED_REQUEST,
    DEVELOPMENT_REQUEST,
    HELD_OUT_REQUEST,
    WITNESSES,
    DEVELOPMENT_WITNESS,
    HELD_OUT_WITNESS,
    KEEP_OUT,
    STUB_JUDGE,
    STUB_AGENT,
    SCALE,
    rubricOf,
    criterionOf,
    DEVELOPMENT_CRITERION,
    SHARED_CRITERION,
    HELD_OUT_CRITERION,
    RUBRIC_KEEP_OUT,
    waiverOf,
    DEVELOPMENT_WAIVER,
    SHARED_WAIVER,
    HELD_OUT_WAIVER,
    HELD_OUT_SHARED_WAIVER,
    WAIVER_KEEP_OUT,
    EVALUATOR_FIXTURE,
    SHARED_ROW,
    DEVELOPMENT_ROW,
    HELD_OUT_ROW,
    criterionRow,
    MAPPING_KEEP_OUT,
    test,
    read,
    write,
    filesUnder,
    holding,
    launchesSince,
    launchCount,
    requestsByWorkspace,
    commit,
    rubricLayer,
    waiverLayer,
    SHARED_ANSWER,
    DEVELOPMENT_ANSWER,
    HELD_OUT_ANSWER,
    HELD_OUT_ANSWERS_DIR,
    gameabilityProbeOf,
    gameabilityLayer,
    severalOraclesLayer,
    sealedBriefAgentLayer,
    mappingLayer,
    judgeCalls,
    judgeCallCount,
    setTiers,
    planProject,
    cli,
    relayContract,
    outcomes,
    viewOf,
    snapshotRecords,
    fixtureFolder,
    contractBytes,
    evaluation,
    heldOutPlan,
    lateCriterion,
    rubricSource,
    rubricBytes,
    rubricPlan,
    mappingSource,
    HELD_OUT_ROWS,
    mappingPlan,
    designatedBy,
  };
}

module.exports = { createHarness };
