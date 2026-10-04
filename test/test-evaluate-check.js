/**
 * `tea-evaluate check` and `tea-evaluate digest`, end to end (Story 1.4).
 *
 * Every case spawns the real bin over a real evaluation folder and the real
 * installed eval-quality:
 *
 * - the valid fixture (`test/fixtures/evaluate/valid/`) checks clean, its
 *   contract compiles through the engine CLI, and its qualified baseline probe
 *   meets the engine's probe schema;
 * - each subcommand exits 64 when `--evaluation` is missing or resolves to no
 *   `evaluation.json`;
 * - each of the eleven authoring defects, planted alone in a temp copy of the
 *   fixture, exits 10 naming its file and rule, and two planted together are
 *   both listed;
 * - `digest` writes a sorted `{path, sha256}` index over `corpus/`, `probes/`
 *   and `mutations/` and prints eval-quality's `digestArtifact` over it, which
 *   moves when a `corpus/` byte moves;
 * - `digest --file` prints `digestBytes` over one file the folder holds, writes nothing and exits 64 for a path outside the
 *   folder, a link, a directory or anything that is not a regular file (Story 1.115);
 * - a packed install (`npm pack`, installed with `--omit=dev` beside the
 *   repository's own engine) runs `tea-evaluate check` to exit 0, which proves
 *   every module the runtime needs ships in TeA's `dependencies`, and runs
 *   `tea-skill-runner` over the stub agent (Story 1.6).
 *
 * Story 1.5 adds the registry: the fixture's `evaluation.json` registry builds a
 * `CommandTargetPolicy` that eval-quality's own `CommandTargetPolicy` schema
 * accepts, a registry entry the runtime's `RegistryEntry` schema refuses is
 * refused by the builder, and a defect signature one of an entry's
 * `infrastructureExitCodes` could satisfy exits 10 (AD-7).
 *
 * Story 1.6 gives `launch` its shape (`root`, and `skillRoot` for a skill) and
 * adds the `skill-root` rule: a mutation whose `targetArtifact` is not inside
 * the skill root exits 10, a sibling directory sharing its name as a prefix
 * included.
 *
 * Story 1.17 adds the `evaluator` rule and narrows `judge` to the
 * deterministic evaluator: an unknown kind, a command evaluator with no
 * mapping or no timeout, a mapping key bound to what the contract does not
 * declare or to levels off a criterion's anchored scale, an unbound rubric
 * criterion, a link or (on POSIX) a FIFO under `evaluator/`, a
 * non-executable command, a missing records directory, a
 * sealed-brief agent with no model snapshot or on an adapter with no bridged
 * run, an unused evaluator block, and a judge beside a rubric the evaluator
 * scores each exit 10; a rubric under each non-deterministic kind with no
 * judge exits 0.
 *
 * Usage: node test/test-evaluate-check.js
 */

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const AjvModule = require('ajv/dist/2020');

const { buildCorpusIndex, writeCorpusIndex } = require('../cli/lib/evaluate/corpus-index');
const { calibrationObservation, calibrationStepPair } = require('../cli/lib/evaluate/calibration');
const { checkEvaluation } = require('../cli/lib/evaluate/check');
const { engineCliPath, engineSchemaPath, loadEngine, ENGINE_CLI_ENV } = require('../cli/lib/evaluate/engine');
const { resolveEvaluationFolder } = require('../cli/lib/evaluate/folder');
const { createRegistry, registryFromEvaluation } = require('../cli/lib/evaluate/registry');
const { digest, digestFiles, redactArgs, redactSecrets } = require('../cli/lib/evaluate/digest');
const { isDateTime } = require('../cli/lib/evaluate/formats');
const { createArtifactValidator } = require('../cli/lib/evaluate/records');
const { scratchDirectories } = require('./lib/scratch-directories');

const Ajv = AjvModule.default ?? AjvModule;

const PROJECT_ROOT = path.join(__dirname, '..');
const CLI = path.join(PROJECT_ROOT, 'cli', 'evaluate.js');
const VALID = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'valid');
/** The HTTP fixture: an evaluation of the loopback grader service, whose registry's one entry is the api interface `grader`. */
const API_FIXTURE = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate-api');
/** eval-quality's `digestBytes` over the empty byte string, the system prompt digest of a run that uses no model. */
const EMPTY_DIGEST = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const TEA_MANIFEST = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));

const colors = { reset: '\u001B[0m', red: '\u001B[31m', green: '\u001B[32m' };

const failures = [];
let checks = 0;
const scratch = scratchDirectories('tea-evaluate-check');

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function tempDir(label) {
  return scratch.make(label);
}

function runCli(args, options = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: options.cwd ?? PROJECT_ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
  });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, output: `${result.stdout}${result.stderr}` };
}

function copyValid() {
  const folder = path.join(tempDir('case'), 'valid');
  fs.cpSync(VALID, folder, { recursive: true });
  return folder;
}

/** A copy of the HTTP fixture's project, answering the evaluation folder inside it. */
function copyApi() {
  const project = path.join(tempDir('case'), 'evaluate-api');
  fs.cpSync(API_FIXTURE, project, { recursive: true });
  return path.join(project, 'evals', 'grader');
}

function editJson(folder, relative, edit) {
  const file = path.join(folder, relative);
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  edit(value);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

const PHASE_INTERFACE = 'tea-atdd-runner';
const PHASE_OPERATION = 'generate-red-phase-tests';

/** Declares the valid fixture's operation on a second interface too, phased as `secondPhase`, with a registry entry to serve it. */
function declareOnSecondInterface(folder, secondPhase = 'process') {
  editJson(folder, 'contract.json', (value) => {
    const other = structuredClone(value.permittedInterfaces[0]);
    other.logicalId = 'second-interface';
    value.permittedInterfaces.push(other);
  });
  editJson(folder, 'evaluation.json', (value) => {
    value.registry.push({ ...structuredClone(value.registry[0]), interfaceId: 'second-interface' });
    value.operationPhases['second-interface'] = { [PHASE_OPERATION]: secondPhase };
  });
}

/**
 * Declares a second operation on the fixture's one interface under another executable, with a registry entry, a phase and a
 * step of its own (`second-run`), so one interface carries two command entries that differ in their executable only.
 */
function declareSecondOperation(folder) {
  editJson(folder, 'contract.json', (value) => {
    const [iface] = value.permittedInterfaces;
    const operation = structuredClone(iface.operations[0]);
    operation.operationId = 'second-operation';
    operation.invocation.executable = 'second-runner';
    iface.operations.push(operation);
    const [step] = value.interactionPlan;
    value.interactionPlan.push({ ...structuredClone(step), stepId: 'second-run', operationId: 'second-operation' });
  });
  editJson(folder, 'evaluation.json', (value) => {
    value.registry.push({ ...structuredClone(value.registry[0]), executable: 'second-runner' });
    value.operationPhases[PHASE_INTERFACE]['second-operation'] = 'process';
  });
}

async function checkWindowsRunnerBudget() {
  const source = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate');
  const original = path.join(source, 'preflight');
  const expanded = await checkEvaluation(original, { platform: 'win32' });
  check(
    !expanded.some((finding) => finding.rule === 'skill-runner'),
    `the Windows authoring check refused the fixture's 160000 ms ceiling with a 30000 ms agent timeout: ${JSON.stringify(expanded)}`,
  );

  const project = tempDir('windows-runner-budget');
  fs.cpSync(path.join(source, 'preflight'), path.join(project, 'preflight'), { recursive: true });
  fs.cpSync(path.join(source, 'stub-agent'), path.join(project, 'stub-agent'), { recursive: true });
  const folder = path.join(project, 'preflight');
  editJson(folder, 'evaluation.json', (evaluation) => (evaluation.registry[0].maxElapsedMs = 60_000));
  const constrained = await checkEvaluation(folder, { platform: 'win32' });
  check(
    constrained.some((finding) => finding.rule === 'skill-runner' && finding.message.includes('120000 ms reserved for Windows')),
    'the Windows authoring check accepted a runner whose outer 60000 ms ceiling can expire during setup',
  );
  const posix = await checkEvaluation(folder, { platform: 'linux' });
  check(
    posix.some((finding) => finding.rule === 'skill-runner' && finding.message.includes('40000 ms reserved for POSIX')),
    'the POSIX authoring check accepted a 60000 ms ceiling that can expire before watchdog setup and agent execution finish',
  );
  editJson(folder, 'evaluation.json', (evaluation) => (evaluation.registry[0].maxElapsedMs = 70_000));
  const boundary = await checkEvaluation(folder, { platform: 'linux' });
  check(
    boundary.some((finding) => finding.rule === 'skill-runner'),
    'the POSIX authoring check accepted a ceiling equal to its literal plus startup and completion reserve',
  );
  editJson(folder, 'evaluation.json', (evaluation) => (evaluation.registry[0].maxElapsedMs = 70_001));
  const aboveBoundary = await checkEvaluation(folder, { platform: 'linux' });
  check(
    !aboveBoundary.some((finding) => finding.rule === 'skill-runner'),
    'the POSIX authoring check rejected a ceiling above its literal plus startup and completion reserve',
  );
}

/** Story 1.42: `operationPhases` classifies each interface-operation pair, and `check` covers exactly the contract's pairs. */
function checkOperationPhaseCoverage() {
  for (const [label, mutate, named] of [
    ['absent', (folder) => editJson(folder, 'evaluation.json', (value) => delete value.operationPhases), PHASE_OPERATION],
    ['empty', (folder) => editJson(folder, 'evaluation.json', (value) => (value.operationPhases = {})), PHASE_OPERATION],
    [
      'an interface with no operations classified',
      (folder) => editJson(folder, 'evaluation.json', (value) => (value.operationPhases[PHASE_INTERFACE] = {})),
      `${PHASE_OPERATION} of interface ${PHASE_INTERFACE}`,
    ],
    [
      'an undeclared operation',
      (folder) => editJson(folder, 'evaluation.json', (value) => (value.operationPhases[PHASE_INTERFACE].undeclared = 'process')),
      `operation undeclared of interface ${PHASE_INTERFACE}`,
    ],
    [
      'an undeclared interface',
      (folder) => editJson(folder, 'evaluation.json', (value) => (value.operationPhases.undeclared = { [PHASE_OPERATION]: 'process' })),
      `operation ${PHASE_OPERATION} of interface undeclared`,
    ],
    [
      'an unknown phase',
      (folder) => editJson(folder, 'evaluation.json', (value) => (value.operationPhases[PHASE_INTERFACE][PHASE_OPERATION] = 'setup')),
      `operation ${PHASE_OPERATION} of interface ${PHASE_INTERFACE} has unknown phase`,
    ],
    [
      'a flat phase map',
      (folder) => editJson(folder, 'evaluation.json', (value) => (value.operationPhases = { [PHASE_OPERATION]: 'outcome' })),
      `phase map entry ${PHASE_OPERATION} must be an object`,
    ],
    [
      'a reused operation ID whose second interface has no phase',
      (folder) => {
        declareOnSecondInterface(folder);
        editJson(folder, 'evaluation.json', (value) => delete value.operationPhases['second-interface']);
      },
      `${PHASE_OPERATION} of interface second-interface has no phase`,
    ],
    [
      'a reused operation ID whose second interface classifies no operation',
      (folder) => {
        declareOnSecondInterface(folder);
        editJson(folder, 'evaluation.json', (value) => (value.operationPhases['second-interface'] = {}));
      },
      `${PHASE_OPERATION} of interface second-interface has no phase`,
    ],
  ]) {
    const folder = copyValid();
    mutate(folder);
    const result = runCli(['check', '--evaluation', folder]);
    check(result.status === 10, `${label} operation phase exited ${result.status}, expected 10\n${result.output}`);
    check(result.output.includes(named), `${label} operation phase did not name ${named}\n${result.output}`);
    check(result.output.includes('operation-phases'), `${label} operation phase did not name its rule\n${result.output}`);
  }
  // A version 1 evaluation.json carries the flat map, and the version refusal comes before any rule reads it.
  const flat = copyValid();
  editJson(flat, 'evaluation.json', (value) => {
    value.schemaVersion = 1;
    value.operationPhases = { [PHASE_OPERATION]: 'outcome' };
  });
  const flatResult = runCli(['check', '--evaluation', flat]);
  check(flatResult.status === 10, `a version 1 evaluation.json exited ${flatResult.status}, expected 10\n${flatResult.output}`);
  check(
    flatResult.output.includes('schema-version'),
    `a version 1 evaluation.json was not refused on its schema version\n${flatResult.output}`,
  );
  check(
    flatResult.output.includes('migrate the file: nest operationPhases by interface and then operation') &&
      flatResult.output.includes('set schemaVersion 2') &&
      !flatResult.output.includes('install the TeA release'),
    `a version 1 evaluation.json was not pointed to the migration\n${flatResult.output}`,
  );
  // Both interfaces of a contract that reuses one operation ID are covered exactly: the contract checks clean.
  const both = copyValid();
  declareOnSecondInterface(both);
  const accepted = runCli(['check', '--evaluation', both]);
  check(
    !accepted.output.includes('operation-phases'),
    `a reused operation ID with a phase on each interface drew an operation-phases finding\n${accepted.output}`,
  );
  check(
    accepted.status === 0,
    `a reused operation ID with a phase on each interface exited ${accepted.status}, expected 0\n${accepted.output}`,
  );
  // A step is attributed to the interface it names: a second interface with the same operation ID and a tighter ceiling
  // draws no skill-runner finding for the first interface's step, and a step on it is held to its own infrastructure codes.
  const tight = copyValid();
  declareOnSecondInterface(tight);
  editJson(tight, 'contract.json', (value) => {
    value.interactionPlan[0].inputBinding.option = {
      ...value.interactionPlan[0].inputBinding.option,
      'skill-root': { literal: 'skill' },
      'timeout-ms': { literal: '5000' },
    };
    const [step] = value.interactionPlan;
    value.interactionPlan.push({ ...structuredClone(step), stepId: 'second-run', interfaceId: 'second-interface' });
  });
  editJson(tight, 'evaluation.json', (value) => {
    for (const entry of value.registry) Object.assign(entry, { target: 'tea-skill-runner', infrastructureExitCodes: [3, 4, 5, 6] });
    value.registry[1].maxElapsedMs = 1000;
  });
  const tightResult = runCli(['check', '--evaluation', tight]);
  check(
    !tightResult.output.includes('interactionPlan[0] hands'),
    `a second interface with a tighter ceiling drew a finding for the first interface's step\n${tightResult.output}`,
  );
  check(
    /interactionPlan\[1\] hands tea-skill-runner --timeout-ms .*maxElapsedMs \(1000\)/.test(tightResult.output),
    `the step on the second interface was not held to its own entry's ceiling\n${tightResult.output}`,
  );
  const second = copyValid();
  declareOnSecondInterface(second);
  editJson(second, 'evaluation.json', (value) => (value.registry[1].infrastructureExitCodes = [3, 4, 5, 6, 9]));
  editJson(second, 'contract.json', (value) => {
    const [step] = value.interactionPlan;
    value.interactionPlan.push({ ...structuredClone(step), stepId: 'second-run', interfaceId: 'second-interface' });
  });
  plantGameability(second, {
    response: (degenerate) => {
      // Both interfaces share the executable and an answer of 9, which only the second interface's entry declares as infrastructure.
      degenerate.steps['tea-atdd-runner-run'] = { stdout: '', stderr: '', exitCode: 9 };
      degenerate.steps['second-run'] = { stdout: '', stderr: '', exitCode: 9 };
    },
  });
  const secondResult = runCli(['check', '--evaluation', second]);
  check(
    secondResult.output.includes('step second-run exits 9, which its registry entry declares as an infrastructure exit code') &&
      !secondResult.output.includes('step tea-atdd-runner-run exits'),
    `a gameability answer for a step on the second interface was not held to that interface's codes\n${secondResult.output}`,
  );
  // One interface, two operations under two executables: the second entry alone has the 1000 ms ceiling and exit code 9, so
  // each lookup has to resolve the step's operation as well as its interface (Story 1.103).
  const sameInterface = copyValid();
  declareSecondOperation(sameInterface);
  editJson(sameInterface, 'contract.json', (value) => {
    for (const step of value.interactionPlan)
      step.inputBinding.option = { ...step.inputBinding.option, 'skill-root': { literal: 'skill' }, 'timeout-ms': { literal: '5000' } };
  });
  editJson(sameInterface, 'evaluation.json', (value) => {
    for (const entry of value.registry) Object.assign(entry, { target: 'tea-skill-runner', infrastructureExitCodes: [3, 4, 5, 6] });
    value.registry[1].maxElapsedMs = 1000;
    value.registry[1].infrastructureExitCodes = [3, 4, 5, 6, 9];
  });
  plantGameability(sameInterface, {
    response: (degenerate) => {
      degenerate.steps['tea-atdd-runner-run'] = { stdout: '', stderr: '', exitCode: 9 };
      degenerate.steps['second-run'] = { stdout: '', stderr: '', exitCode: 9 };
    },
  });
  const sameResult = runCli(['check', '--evaluation', sameInterface]);
  check(
    /interactionPlan\[1\] hands tea-skill-runner --timeout-ms .*maxElapsedMs \(1000\)/.test(sameResult.output) &&
      !sameResult.output.includes('interactionPlan[0] hands tea-skill-runner --timeout-ms'),
    `a step was not held to the ceiling of its own operation's entry on a shared interface\n${sameResult.output}`,
  );
  check(
    sameResult.output.includes('step second-run exits 9, which its registry entry declares as an infrastructure exit code') &&
      !sameResult.output.includes('step tea-atdd-runner-run exits'),
    `a gameability answer was not held to the infrastructure codes of its own operation's entry on a shared interface\n${sameResult.output}`,
  );
  // A principal is mapped to the interface its step names: with the operation ID on two interfaces, the step on the first
  // interface draws no mapping finding and the step on the second one, mapped to the first, draws one.
  const principals = copyValid();
  declareOnSecondInterface(principals);
  editJson(principals, 'contract.json', (value) => {
    value.testData.principals = { operator: { kind: 'human' } };
    value.interactionPlan[0].inputBinding.stdin.prompt = { principal: 'operator' };
    const [step] = value.interactionPlan;
    value.interactionPlan.push({ ...structuredClone(step), stepId: 'second-run', interfaceId: 'second-interface' });
  });
  editJson(principals, 'evaluation.json', (value) => {
    value.principalMappings = { operator: { interfaceId: 'tea-atdd-runner', environmentKey: 'HOME' } };
  });
  const principalResult = runCli(['check', '--evaluation', principals]);
  check(
    principalResult.output.includes(
      'interactionPlan[1].inputBinding.stdin.prompt maps principal "operator" to interface "tea-atdd-runner"',
    ) &&
      principalResult.output.includes('uses "second-interface"') &&
      !principalResult.output.includes('interactionPlan[0].inputBinding'),
    `a principal mapping was not held to the interface of each step that shares an operation ID\n${principalResult.output}`,
  );
  const repeated = copyValid();
  editJson(repeated, 'contract.json', (value) =>
    value.permittedInterfaces[0].operations.push(structuredClone(value.permittedInterfaces[0].operations[0])),
  );
  const result = runCli(['check', '--evaluation', repeated]);
  check(
    !result.output.includes('[operation-phases]'),
    `an operation repeated on the same interface was reported as a phase finding\n${result.output}`,
  );
}

/** Sets the fixture's one registry entry's infrastructure exit codes. */
function setInfrastructureCodes(folder, codes) {
  editJson(folder, 'evaluation.json', (value) => (value.registry[0].infrastructureExitCodes = codes));
}

/** Replaces P-002's defect signature predicate. */
function setSignature(folder, predicate) {
  editJson(folder, 'probes/P-002.probe.json', (value) => (value.defectSignature.condition.predicate = predicate));
}

const EXIT_CODE = { pointer: '/interactions/observed/exit-code' };
const exitEquals = (code) => ({ op: 'equality', operands: [EXIT_CODE, { literal: code }] });
/** A clause reading only one call-input option of the observed interaction. */
const optionEquals = (name, value) => ({
  op: 'equality',
  operands: [{ pointer: `/interactions/observed/call-inputs/option/${name}` }, { literal: value }],
});
/** `count` call-input clauses beside `rest`, all joined by `all`. */
const withOptionClauses = (count, ...rest) => ({
  op: 'all',
  operands: [...Array.from({ length: count }, (_, index) => optionEquals(`flag${index + 1}`, 'on')), ...rest],
});

/**
 * Plants P-003, a gameability probe on B-001 whose naive oracle is O-002, with
 * its degenerate response at corpus/gameability/P-003.json and the
 * gameability arm declared (Story 1.9); `probe` and `response` edit each
 * before it is written, and `response: null` leaves the file out.
 */
function plantGameability(folder, { probe = () => {}, response = () => {} } = {}) {
  const signature = JSON.parse(fs.readFileSync(path.join(folder, 'probes', 'P-002.probe.json'), 'utf8')).defectSignature;
  const planted = {
    probeId: 'P-003',
    probeClass: 'gameability',
    behaviorId: 'B-001',
    expectedClean: false,
    rationale: 'Gameability: a shortcut run that writes nothing and exits 1 passes a naive check.',
    defects: [],
    defectSignature: signature,
    qualification: { route: 'gameability', degenerateResponse: 'Exits 1 having written nothing.', naiveOracle: 'O-002' },
  };
  probe(planted);
  fs.writeFileSync(path.join(folder, 'probes', 'P-003.probe.json'), `${JSON.stringify(planted, null, 2)}\n`);
  const degenerate = { schemaVersion: 1, steps: { 'tea-atdd-runner-run': { stdout: '', stderr: '', exitCode: 1 } } };
  if (response !== null) {
    response(degenerate);
    fs.mkdirSync(path.join(folder, 'corpus', 'gameability'), { recursive: true });
    fs.writeFileSync(path.join(folder, 'corpus', 'gameability', 'P-003.json'), `${JSON.stringify(degenerate, null, 2)}\n`);
  }
  editJson(folder, 'evaluation.json', (value) => value.arms.push('gameability'));
}

/** Declares R-001 in the contract, the judge in evaluation.json and its model in the evaluator conditions (Story 1.9); `edit` changes the three before they are written. */
function plantRubric(folder, edit = () => {}) {
  const rubric = {
    id: 'R-001',
    scaleLevels: [
      { level: 0, anchor: 'The scaffold holds an active test.' },
      { level: 1, anchor: 'Every test in the scaffold is skipped.' },
    ],
    failureModePenalties: [{ name: 'active-test', description: 'An active test counts as no scaffold.' }],
    maxLength: 200,
    criteria: [{ id: 'RC-001', text: 'Are the scaffold tests all skipped?', evidence: '/interactions/tea-atdd-runner-run/exit-code' }],
  };
  const judge = { agent: 'custom', agentCommand: 'stub-judge', agentArgs: [], timeoutMs: 60_000 };
  const conditions = {
    schemaVersion: 1,
    modelSnapshot: 'a-model-snapshot',
    systemPromptDigest: `sha256:${'0'.repeat(64)}`,
    judge: { modelSnapshot: 'a-judge-snapshot' },
  };
  const planted = { rubric, judge, conditions };
  edit(planted);
  editJson(folder, 'contract.json', (value) => (value.rubrics = [planted.rubric]));
  editJson(folder, 'evaluation.json', (value) => {
    if (planted.judge === null) delete value.judge;
    else value.judge = planted.judge;
  });
  fs.writeFileSync(path.join(folder, 'policy', 'evaluator-conditions.json'), `${JSON.stringify(planted.conditions, null, 2)}\n`);
  if (planted.rubric !== null) plantCalibration(folder, planted.rubric);
}

function plantCalibration(folder, rubric) {
  editJson(folder, 'evaluation.json', (value) => (value.judgeCalibration = { minimumAgreement: 0.5 }));
  fs.writeFileSync(
    path.join(folder, 'policy', 'judge-calibration.json'),
    `${JSON.stringify(
      {
        items: rubric.criteria.flatMap((criterion) =>
          rubric.scaleLevels.map((level) => ({
            rubricId: rubric.id,
            criterionId: criterion.id,
            response: /\/(?:exit-code|response-status)$/.test(criterion.evidence) ? String(level.level) : `example at level ${level.level}`,
            expectedLevel: level.level,
          })),
        ),
      },
      null,
      2,
    )}\n`,
  );
}

/**
 * Characters a path field refuses beyond C0 and DEL, one per class: C1
 * controls, the line and paragraph separators, and the bidirectional
 * formatting characters (embeddings and overrides, isolates, marks).
 */
const UNPRINTABLE_PATH_CHARACTERS = [
  ['a C1 control (U+0085)', '\u0085'],
  ['a C1 control (U+009B)', '\u009B'],
  ['a line separator (U+2028)', '\u2028'],
  ['a paragraph separator (U+2029)', '\u2029'],
  ['a right-to-left override (U+202E)', '\u202E'],
  ['a left-to-right isolate (U+2066)', '\u2066'],
  ['a right-to-left mark (U+200F)', '\u200F'],
  ['an Arabic letter mark (U+061C)', '\u061C'],
];

/** How a deployment reports its release at the interface `grader`: an operation of the HTTP fixture's contract and a JSON pointer into its answer. */
const REPORT = { operationId: 'report-release', pointer: '/release' };

/**
 * How a deployment reports its release at another interface `plantApiHistorical` adds to the contract: that
 * interface's own copy of the report operation.
 */
function reportOf(interfaceId) {
  return { operationId: `report-${interfaceId}-release`, pointer: '/release' };
}

/** Two deployments of the target, each an origin for the interface `grader` and a report of the release it runs. */
const DEPLOYMENTS = {
  preFix: { release: 'grader-1.4.2', reports: { grader: REPORT }, origins: { grader: 'http://127.0.0.1:41001' } },
  fix: { release: 'grader-1.4.3', reports: { grader: REPORT }, origins: { grader: 'http://127.0.0.1:41002' } },
};

/** Two deployments each serving the interfaces `grader` and `ledger`, with a report for each. */
const TWO_INTERFACE_DEPLOYMENTS = {
  preFix: {
    release: 'grader-1.4.2',
    reports: { grader: REPORT, ledger: reportOf('ledger') },
    origins: { grader: 'http://127.0.0.1:41001', ledger: 'http://127.0.0.1:41003' },
  },
  fix: {
    release: 'grader-1.4.3',
    reports: { grader: REPORT, ledger: reportOf('ledger') },
    origins: { grader: 'http://127.0.0.1:41002', ledger: 'http://127.0.0.1:41004' },
  },
};

/** P-002 as a historical probe with a natural defect whose qualification carries `boundary`, on the historical arm. */
function plantHistorical(folder, boundary) {
  editJson(folder, 'probes/P-002.probe.json', (value) => {
    value.qualification = { route: 'historical', ...boundary };
    value.defects[0].source = 'natural';
  });
  editJson(folder, 'evaluation.json', (value) => (value.arms = ['clean', 'historical']));
  fs.rmSync(path.join(folder, 'mutations'), { recursive: true });
}

/**
 * The HTTP fixture's P-002 as a historical probe with a natural defect whose
 * qualification names `deployments`, on the historical arm, with an api entry
 * for each interface the origins name (`grader` is the fixture's own; another
 * is a deployed copy of it) whose `deployments` authorize every origin named
 * for it, so a finding the case expects is the only one `check` has. Each
 * other interface is also declared by the contract, with its own copy of the
 * report operation (`reportOf`), served at a path of its own
 * (`/<interfaceId>/release`), since eval-quality's compile refuses two `api`
 * operations that share a method and a path; `collide` leaves the copy at
 * `GET /release`, the grader's own, which compile refuses (Story 1.75).
 */
function plantApiHistorical(folder, deployments, { collide = false } = {}) {
  editJson(folder, 'probes/P-002.probe.json', (value) => {
    value.qualification = { route: 'historical', deployments };
    value.defects[0].source = 'natural';
  });
  editJson(folder, 'evaluation.json', (value) => {
    value.arms = ['clean', 'historical'];
    const [grader] = value.registry;
    const { server, auth, ...deployed } = grader;
    const ids = [...new Set([deployments.preFix, deployments.fix].flatMap((side) => Object.keys(side.origins)))];
    value.registry = ids.map((id) => {
      const entry = id === grader.interfaceId ? grader : { ...deployed, interfaceId: id, port: 41_000 };
      const origins = [deployments.preFix.origins[id], deployments.fix.origins[id]].map((origin) => new URL(origin));
      const hosts = origins.map((url) => ({
        scheme: url.protocol.slice(0, -1),
        host: url.hostname.replaceAll(/^\[|\]$/g, ''),
        port: Number(url.port),
      }));
      const unique = hosts.filter((one, at) => hosts.findIndex((other) => JSON.stringify(other) === JSON.stringify(one)) === at);
      return { ...entry, deployments: unique.map((one) => ({ ...one, addresses: [one.host] })) };
    });
  });
  const others = [...new Set([deployments.preFix, deployments.fix].flatMap((side) => Object.keys(side.origins)))].filter(
    (id) => id !== 'grader',
  );
  if (others.length > 0) {
    editJson(folder, 'contract.json', (value) => {
      const [grader] = value.permittedInterfaces;
      const report = grader.operations.find((operation) => operation.operationId === 'report-release');
      for (const id of others) {
        value.permittedInterfaces.push({
          ...structuredClone(grader),
          logicalId: id,
          operations: [
            {
              ...structuredClone(report),
              operationId: reportOf(id).operationId,
              pathTemplate: collide ? report.pathTemplate : `/${id}/release`,
            },
          ],
        });
      }
    });
    editJson(folder, 'evaluation.json', (value) => {
      for (const id of others) value.operationPhases[id] = { [reportOf(id).operationId]: 'outcome' };
    });
  }
  fs.rmSync(path.join(folder, 'mutations'), { recursive: true });
}

/** The findings `check` printed, one per line naming a file and a rule. */
function findingsOf(stdout) {
  return stdout.split('\n').filter((line) => /^\S+: \[[a-z-]+\] /.test(line));
}

/**
 * Story 1.42: an operation ID two interfaces declare is looked up inside the interface the report is keyed by, so a
 * deployment report naming it draws no historical finding.
 */
function checkReportOperationReusedAcrossInterfaces() {
  const folder = copyApi();
  plantApiHistorical(folder, DEPLOYMENTS);
  editJson(folder, 'contract.json', (value) => {
    const other = structuredClone(value.permittedInterfaces[0]);
    other.logicalId = 'status';
    for (const operation of other.operations) operation.pathTemplate = `/status${operation.pathTemplate}`;
    value.permittedInterfaces.push(other);
  });
  editJson(folder, 'evaluation.json', (value) => (value.operationPhases.status = structuredClone(value.operationPhases.grader)));
  const result = runCli(['check', '--evaluation', folder]);
  check(
    historicalFindingsOf(result.stdout).length === 0,
    `a report operation declared on two interfaces drew a historical finding\n${result.output}`,
  );
}

/**
 * An engine CLI stand-in (`TEA_EVALUATE_ENGINE_CLI`): it appends its argv to the file `SHIM_LOG` names, prints the line
 * `SHIM_LINE` holds on the stream `SHIM_STREAM` names (`stderr`, the default, `stdout` or `none`) and exits with
 * `SHIM_EXIT` (4, the compile refusal, by default).
 */
function engineShim() {
  const file = path.join(tempDir('engine-shim'), 'shim.js');
  fs.writeFileSync(
    file,
    [
      "const fs = require('node:fs');",
      "fs.appendFileSync(process.env.SHIM_LOG, `${process.argv.slice(2).join(' ')}\\n`);",
      "const stream = process.env.SHIM_STREAM ?? 'stderr';",
      'if (stream !== "none") process[stream].write(`${process.env.SHIM_LINE}\\n`);',
      'process.exit(Number(process.env.SHIM_EXIT ?? 4));',
    ].join('\n'),
  );
  return file;
}

/** The files under `directory` with their bytes, to read a folder `check` was not to write to. */
function snapshotOf(directory) {
  const entries = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else entries.push(`${path.relative(directory, full)}:${sha256Hex(fs.readFileSync(full))}`);
    }
  };
  walk(directory);
  return entries;
}

/**
 * Story 1.75 (route B): when a probe's deployments name a report operation (Story 1.77 widened the trigger from reports on
 * two or more interfaces), `check` runs eval-quality's own compile and quotes a `duplicate-operation-signature` refusal as
 * one `historical` finding, so two interfaces whose report operations share a method and a path exit 10 at `check` and
 * not at the run's compile. TeA compares no template: the finding carries the engine's line.
 */
async function checkReportSignatureCollision() {
  const label = 'report operations of two interfaces at one method and path';
  const privateTemp = tempDir('check-temp');
  const environment = { TMPDIR: privateTemp, TEMP: privateTemp, TMP: privateTemp };

  // Collision: exit 10, one historical finding quoting the engine's line.
  const collided = copyApi();
  plantApiHistorical(collided, TWO_INTERFACE_DEPLOYMENTS, { collide: true });
  await writeCorpusIndex(collided);
  const before = snapshotOf(collided);
  const result = runCli(['check', '--evaluation', collided], { env: environment });
  check(result.status === 10, `${label}: check exited ${result.status}; expected 10\n${result.output}`);
  const findings = historicalFindingsOf(result.stdout);
  check(findings.length === 1 && findingsOf(result.stdout).length === 1, `${label}: expected one historical finding\n${result.output}`);
  const [finding = ''] = findings;
  check(finding.startsWith('probes/P-002.probe.json: [historical] '), `${label}: the finding does not name the probe\n${finding}`);
  for (const needle of [
    'logicalId=grader',
    'logicalId=ledger',
    'operationId=report-release',
    'operationId=report-ledger-release',
    '("GET /release")',
    'duplicate-operation-signature',
  ]) {
    check(finding.includes(needle), `${label}: the finding does not name ${needle}\n${finding}`);
  }
  const direct = spawnSync(
    process.execPath,
    [engineCliPath({}), 'compile', '--in', path.join(collided, 'contract.json'), '--out', path.join(tempDir('direct'), 'out.json')],
    { encoding: 'utf8' },
  );
  const engineLine = direct.stderr.split('\n').find((line) => line.includes('duplicate-operation-signature'));
  check(
    direct.status === 4 && engineLine !== undefined && finding.includes(engineLine.trim()),
    `${label}: the finding does not quote the engine's own refusal line (${engineLine})\n${finding}`,
  );
  check(
    JSON.stringify(snapshotOf(collided)) === JSON.stringify(before),
    `${label}: check changed the evaluation folder (compile output or record written under it)`,
  );
  check(
    fs.readdirSync(privateTemp).length === 0,
    `${label}: check left ${JSON.stringify(fs.readdirSync(privateTemp))} in its temporary directory`,
  );

  // Distinct paths: exit 0.
  const distinct = copyApi();
  plantApiHistorical(distinct, TWO_INTERFACE_DEPLOYMENTS);
  await writeCorpusIndex(distinct);
  const clean = runCli(['check', '--evaluation', distinct], { env: environment });
  check(clean.status === 0, `report operations at distinct paths: check exited ${clean.status}; expected 0\n${clean.output}`);

  // The stand-in refuses compile with the line it is given and logs each call.
  const shim = engineShim();
  // A collision line in the engine's own shape that names the report operation of the grader, which every case below reports.
  const collisionLine =
    'eval-quality: duplicate-operation-signature: EvalContract.permittedInterfaces[logicalId=ledger].operations[operationId=report-ledger-release]: collides with permittedInterfaces[logicalId=grader].operations[operationId=report-release] after parameter-name erasure ("GET /release") among api-shaped operations (AD-19, AD-40)';
  const shimmed = (folder, line, { exit = 4, stream = 'stderr' } = {}) => {
    const log = path.join(tempDir('shim-log'), 'calls.log');
    const run = runCli(['check', '--evaluation', folder], {
      env: { ...environment, [ENGINE_CLI_ENV]: shim, SHIM_LOG: log, SHIM_LINE: line, SHIM_EXIT: String(exit), SHIM_STREAM: stream },
    });
    return { run, calls: fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : [] };
  };

  // The stand-in's collision line is quoted as it is printed, which shows the rule runs the engine stage and computes nothing.
  const quoted = shimmed(distinct, collisionLine);
  check(
    quoted.run.status === 10 &&
      historicalFindingsOf(quoted.run.stdout).length === 1 &&
      quoted.run.stdout.includes(collisionLine) &&
      quoted.calls.length === 1 &&
      quoted.calls[0].startsWith('compile --in '),
    `a collision line the engine printed was not quoted from one compile call\n${quoted.run.output}\n${quoted.calls}`,
  );

  // A collision line on stdout is quoted too.
  const onStdout = shimmed(distinct, collisionLine, { stream: 'stdout' });
  check(
    onStdout.run.status === 10 && historicalFindingsOf(onStdout.run.stdout).length === 1 && onStdout.run.stdout.includes(collisionLine),
    `a collision line printed on stdout was not quoted\n${onStdout.run.output}`,
  );

  // Several probes that name two reports: one compile, one finding, on the first of them.
  const several = copyApi();
  plantApiHistorical(several, TWO_INTERFACE_DEPLOYMENTS);
  const second = JSON.parse(fs.readFileSync(path.join(several, 'probes', 'P-002.probe.json'), 'utf8'));
  fs.writeFileSync(path.join(several, 'probes', 'P-003.probe.json'), `${JSON.stringify({ ...second, probeId: 'P-003' }, null, 2)}\n`);
  await writeCorpusIndex(several);
  const many = shimmed(several, collisionLine);
  const manyFindings = historicalFindingsOf(many.run.stdout);
  check(
    many.run.status === 10 &&
      manyFindings.length === 1 &&
      manyFindings[0].startsWith('probes/P-002.probe.json: [historical] ') &&
      many.calls.length === 1,
    `two probes naming two reports did not draw one finding on P-002 from one compile call (findings ${JSON.stringify(manyFindings)}, calls ${JSON.stringify(many.calls)})\n${many.run.output}`,
  );

  // One report: one compile call, and the finding only when the engine refuses (Story 1.77 widened the trigger from two reports).
  const single = copyApi();
  plantApiHistorical(single, DEPLOYMENTS);
  await writeCorpusIndex(single);
  const one = shimmed(single, collisionLine);
  check(
    one.run.status === 10 && historicalFindingsOf(one.run.stdout).length === 1 && one.calls.length === 1,
    `a probe naming a report for one interface did not draw one finding from one compile call (exit ${one.run.status}, calls ${JSON.stringify(one.calls)})\n${one.run.output}`,
  );
  const oneClean = copyApi();
  plantApiHistorical(oneClean, DEPLOYMENTS);
  await writeCorpusIndex(oneClean);
  const oneAccepted = runCli(['check', '--evaluation', oneClean], { env: environment });
  check(
    oneAccepted.status === 0 && findingsOf(oneAccepted.stdout).length === 0,
    `one reported interface with no collision did not exit 0 with no finding (exit ${oneAccepted.status})\n${oneAccepted.output}`,
  );

  // Another refusal: this rule stays quiet; `run` and the compile check own it.
  // The line names the reported operation, so only the code in it keeps this rule quiet.
  const other = shimmed(
    distinct,
    'eval-quality: unknown-interface: EvalContract.permittedInterfaces[logicalId=grader].operations[operationId=report-release]: stand-in refusal',
  );
  check(
    other.run.status === 0 && historicalFindingsOf(other.run.stdout).length === 0 && other.calls.length === 1,
    `a compile refusal for another cause drew a finding from this rule (exit ${other.run.status})\n${other.run.output}`,
  );

  // A compile fault (5), a usage exit (64) and a refusal with no collision line draw no finding.
  for (const [name, options] of [
    ['exit 5', { exit: 5 }],
    ['exit 64', { exit: 64 }],
    ['exit 3, which no compile documents', { exit: 3 }],
    ['exit 4 with no duplicate-operation-signature line', { exit: 4, stream: 'none' }],
  ]) {
    const quiet = shimmed(distinct, collisionLine, options);
    check(
      quiet.run.status === 0 && historicalFindingsOf(quiet.run.stdout).length === 0 && quiet.calls.length === 1,
      `a compile that ended at ${name} drew a finding from this rule (exit ${quiet.run.status}, calls ${quiet.calls.length})\n${quiet.run.output}`,
    );
  }

  // A temporary directory that cannot be made leaves the stage unrun; this rule stays quiet.
  const noTemp = runCli(['check', '--evaluation', collided], {
    env: { TMPDIR: path.join(privateTemp, 'missing'), TEMP: path.join(privateTemp, 'missing'), TMP: path.join(privateTemp, 'missing') },
  });
  check(
    noTemp.status === 0 && historicalFindingsOf(noTemp.stdout).length === 0,
    `a temporary directory that cannot be made drew a finding from this rule (exit ${noTemp.status})\n${noTemp.output}`,
  );

  // `preflight` and `run` stop at the check stage with the same finding, before any engine stage of their own.
  const stopped = runCli(['preflight', '--evaluation', collided], { env: environment });
  check(
    stopped.status === 10 &&
      historicalFindingsOf(stopped.stdout).length === 1 &&
      stopped.stdout.includes('duplicate-operation-signature') &&
      stopped.stdout.includes(engineLine.trim()),
    `preflight over the colliding registry did not stop at the check stage with the engine's line (exit ${stopped.status})\n${stopped.output}`,
  );

  // Engine unavailable: the stage cannot start; this rule stays quiet.
  const unavailable = runCli(['check', '--evaluation', distinct], {
    env: { ...environment, [ENGINE_CLI_ENV]: path.join(privateTemp, 'no-such-eval-quality') },
  });
  check(
    unavailable.status === 0 && historicalFindingsOf(unavailable.stdout).length === 0,
    `an engine stage that cannot start drew a finding from this rule (exit ${unavailable.status})\n${unavailable.output}`,
  );
  check(
    fs.readdirSync(privateTemp).length === 0,
    `the cases left ${JSON.stringify(fs.readdirSync(privateTemp))} in the temporary directory`,
  );
}

/**
 * Adds an interface `status` with one ordinary operation, a copy of the grader's `operationId` under another ID at the
 * grader's own method and path, so the two share a signature and nothing else of the contract collides. The registry
 * does not serve `status` over HTTP, which is how `checkReportOperationReusedAcrossInterfaces` plants a second interface.
 */
function plantCollidingOrdinaryInterface(folder, operationId) {
  editJson(folder, 'contract.json', (value) => {
    const [grader] = value.permittedInterfaces;
    const original = grader.operations.find((operation) => operation.operationId === operationId);
    value.permittedInterfaces.push({
      ...structuredClone(grader),
      logicalId: 'status',
      operations: [{ ...structuredClone(original), operationId: `status-${operationId}` }],
    });
  });
  editJson(folder, 'evaluation.json', (value) => {
    value.operationPhases.status = { [`status-${operationId}`]: value.operationPhases.grader[operationId] };
  });
}

/**
 * Story 1.102: a contract whose `permittedInterfaces` repeat one `logicalId` is refused by eval-quality's compile with
 * `duplicate-interface-identifier`, and `check` quotes the engine's line as one `interface-identifier` finding on
 * `contract.json`, so the repeat exits 10 at `check` and not at `seal` or the run's compile. TeA compares no identifier
 * (AD-1): a contract of two or more interfaces is the only thing it asks the engine about, and the finding carries the
 * engine's own line.
 */
function checkInterfaceIdentifierRepeat() {
  const label = 'two interfaces sharing a logicalId';
  const privateTemp = tempDir('check-temp');
  const environment = { TMPDIR: privateTemp, TEMP: privateTemp, TMP: privateTemp };
  const repeatedFindingsOf = (stdout) => findingsOf(stdout).filter((line) => line.startsWith('contract.json: [interface-identifier] '));

  // A repeat: exit 10, one finding quoting the engine's line, which names the identifier and both positions.
  const repeated = copyValid();
  editJson(repeated, 'contract.json', (value) => {
    value.permittedInterfaces.push(structuredClone(value.permittedInterfaces[0]));
  });
  const before = snapshotOf(repeated);
  const result = runCli(['check', '--evaluation', repeated], { env: environment });
  check(result.status === 10, `${label}: check exited ${result.status}; expected 10\n${result.output}`);
  const found = repeatedFindingsOf(result.stdout);
  check(found.length === 1, `${label}: expected one interface-identifier finding, got ${found.length}\n${result.output}`);
  const [finding = ''] = found;
  for (const needle of ['duplicate-interface-identifier', `"${PHASE_INTERFACE}"`, 'permittedInterfaces[0]', 'permittedInterfaces[1]']) {
    check(finding.includes(needle), `${label}: the finding does not name ${needle}\n${finding}`);
  }
  const direct = spawnSync(
    process.execPath,
    [engineCliPath({}), 'compile', '--in', path.join(repeated, 'contract.json'), '--out', path.join(tempDir('direct'), 'out.json')],
    { encoding: 'utf8' },
  );
  const engineLine = direct.stderr.split('\n').find((line) => line.includes('duplicate-interface-identifier'));
  check(
    direct.status === 4 && engineLine !== undefined && finding.includes(engineLine.trim()),
    `${label}: the finding does not quote the engine's own refusal line (${engineLine})\n${finding}`,
  );
  check(JSON.stringify(snapshotOf(repeated)) === JSON.stringify(before), `${label}: check changed the evaluation folder`);
  check(
    fs.readdirSync(privateTemp).length === 0,
    `${label}: check left ${JSON.stringify(fs.readdirSync(privateTemp))} in its temporary directory`,
  );

  // `preflight` stops at the check stage with the same finding.
  const stopped = runCli(['preflight', '--evaluation', repeated], { env: environment });
  check(
    stopped.status === 10 && repeatedFindingsOf(stopped.stdout).length === 1,
    `${label}: preflight did not stop at the check stage with the finding (exit ${stopped.status})\n${stopped.output}`,
  );

  // Distinct identifiers: no finding.
  const distinct = copyValid();
  declareOnSecondInterface(distinct);
  const distinctRun = runCli(['check', '--evaluation', distinct], { env: environment });
  check(
    repeatedFindingsOf(distinctRun.stdout).length === 0,
    `${label}: two interfaces with distinct identifiers drew an interface-identifier finding\n${distinctRun.output}`,
  );

  // The stand-in refuses compile with the line it is given and logs each call.
  const shim = engineShim();
  const refusalLine =
    'eval-quality: duplicate-interface-identifier: EvalContract.permittedInterfaces[1].logicalId: "tea-atdd-runner" is already the identifier of permittedInterfaces[0]; an interface\'s identifier is unique across the contract, so permittedInterfaces[0] and permittedInterfaces[1] cannot both carry it (AD-19)';
  const shimmed = (folder, line, { exit = 4, stream = 'stderr' } = {}) => {
    const log = path.join(tempDir('shim-log'), 'calls.log');
    const run = runCli(['check', '--evaluation', folder], {
      env: { ...environment, [ENGINE_CLI_ENV]: shim, SHIM_LOG: log, SHIM_LINE: line, SHIM_EXIT: String(exit), SHIM_STREAM: stream },
    });
    return { run, calls: fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : [] };
  };
  // The line is quoted as printed, from one compile call, which shows the rule runs the engine stage and computes nothing.
  const quoted = shimmed(distinct, refusalLine);
  check(
    quoted.run.status === 10 &&
      repeatedFindingsOf(quoted.run.stdout).length === 1 &&
      quoted.run.stdout.includes(refusalLine) &&
      quoted.calls.length === 1 &&
      quoted.calls[0].startsWith('compile --in '),
    `${label}: a refusal line the engine printed was not quoted from one compile call\n${quoted.run.output}\n${quoted.calls}`,
  );
  // A compile fault (5), a usage exit (64), an undocumented exit and a refusal with no such line draw no finding.
  for (const [name, options] of [
    ['exit 5', { exit: 5 }],
    ['exit 64', { exit: 64 }],
    ['exit 3, which no compile documents', { exit: 3 }],
    ['exit 4 with no duplicate-interface-identifier line', { exit: 4, stream: 'none' }],
  ]) {
    const quiet = shimmed(distinct, refusalLine, options);
    check(
      repeatedFindingsOf(quiet.run.stdout).length === 0 && quiet.calls.length === 1,
      `${label}: a compile that ended at ${name} drew a finding (calls ${quiet.calls.length})\n${quiet.run.output}`,
    );
  }
  // A contract of one interface cannot repeat an identifier, so `check` runs no compile for it.
  const single = shimmed(copyValid(), refusalLine);
  check(
    repeatedFindingsOf(single.run.stdout).length === 0 && single.calls.length === 0,
    `${label}: a contract of one interface ran ${single.calls.length} compile call(s) or drew a finding\n${single.run.output}`,
  );
}

/**
 * Story 1.77: eval-quality's compile refuses a duplicate operation signature across the whole contract, so the rule runs
 * for any probe that names a report operation, whichever operation the report collides with, and it reads the reports of
 * every `historical` probe together. The finding is worded around the operations the engine's line names.
 */
async function checkReportCollidingWithAnyOperation() {
  const label = 'a report operation that collides with an ordinary operation';
  const privateTemp = tempDir('check-temp-177');
  const environment = { TMPDIR: privateTemp, TEMP: privateTemp, TMP: privateTemp };
  const signature = (stdout) => findingsOf(stdout).filter((line) => line.includes('duplicate-operation-signature'));

  // One reported interface whose report operation shares a method and a path with an ordinary operation of another interface.
  const colliding = copyApi();
  plantApiHistorical(colliding, DEPLOYMENTS);
  plantCollidingOrdinaryInterface(colliding, 'report-release');
  await writeCorpusIndex(colliding);
  const before = snapshotOf(colliding);
  const result = runCli(['check', '--evaluation', colliding], { env: environment });
  check(result.status === 10, `${label}: check exited ${result.status}; expected 10\n${result.output}`);
  const found = signature(result.stdout);
  check(
    found.length === 1 && findingsOf(result.stdout).length === 1,
    `${label}: expected one finding, the engine's collision line\n${result.output}`,
  );
  const [finding = ''] = found;
  check(finding.startsWith('probes/P-002.probe.json: [historical] '), `${label}: the finding does not name the probe\n${finding}`);
  for (const needle of [
    'logicalId=grader',
    'logicalId=status',
    'operationId=report-release',
    'operationId=status-report-release',
    '("GET /release")',
  ]) {
    check(finding.includes(needle), `${label}: the finding does not name ${needle}\n${finding}`);
  }
  // The two operations are a report and an ordinary one, so the finding must not call both of them reports.
  check(
    /report operations/.test(finding) === false && finding.includes('shares an identity with another operation'),
    `${label}: the finding is worded as if both operations were reports\n${finding}`,
  );
  for (const assumption of ['report operations on more than one interface', "each interface's report operation", 'both report']) {
    check(!finding.includes(assumption), `${label}: the finding assumes both operations are reports ("${assumption}")\n${finding}`);
  }
  check(
    JSON.stringify(snapshotOf(colliding)) === JSON.stringify(before) && fs.readdirSync(privateTemp).length === 0,
    `${label}: check changed the evaluation folder or left a temporary directory`,
  );

  // `preflight` stops at the check stage with the same finding.
  const stopped = runCli(['preflight', '--evaluation', colliding], { env: environment });
  check(
    stopped.status === 10 && signature(stopped.stdout).length === 1,
    `${label}: preflight did not stop at the check stage with the finding (exit ${stopped.status})\n${stopped.output}`,
  );

  // Two probes that each name a report for a different single interface: the reports count together, one compile, one finding.
  const apart = copyApi();
  plantApiHistorical(apart, TWO_INTERFACE_DEPLOYMENTS, { collide: true });
  const onlyOf = (id) => {
    const keep = (side) => ({ ...side, reports: { [id]: side.reports[id] } });
    return { preFix: keep(TWO_INTERFACE_DEPLOYMENTS.preFix), fix: keep(TWO_INTERFACE_DEPLOYMENTS.fix) };
  };
  const probeOf = (id, probeId) => {
    const base = JSON.parse(fs.readFileSync(path.join(apart, 'probes', 'P-002.probe.json'), 'utf8'));
    base.probeId = probeId;
    base.qualification.deployments = onlyOf(id);
    fs.writeFileSync(path.join(apart, 'probes', `${probeId}.probe.json`), `${JSON.stringify(base, null, 2)}\n`);
  };
  probeOf('grader', 'P-002');
  probeOf('ledger', 'P-003');
  await writeCorpusIndex(apart);
  const together = runCli(['check', '--evaluation', apart], { env: environment });
  const togetherFound = signature(together.stdout);
  check(
    together.status === 10 && togetherFound.length === 1 && togetherFound[0].startsWith('probes/P-002.probe.json: [historical] '),
    `two probes naming a report each for a different interface did not draw one collision finding on P-002 (exit ${together.status}, findings ${JSON.stringify(togetherFound)})\n${together.output}`,
  );

  const shim = engineShim();

  // The reports of every `historical` probe count: only the second probe's report collides, and the finding sits on that probe.
  const second = copyApi();
  plantApiHistorical(second, DEPLOYMENTS);
  editJson(second, 'contract.json', (value) => {
    const [grader] = value.permittedInterfaces;
    const report = grader.operations.find((operation) => operation.operationId === 'report-release');
    grader.operations.push({ ...structuredClone(report), operationId: 'report-alt', pathTemplate: '/alt' });
    value.permittedInterfaces.push({
      ...structuredClone(grader),
      logicalId: 'status',
      operations: [{ ...structuredClone(report), operationId: 'status-alt', pathTemplate: '/alt' }],
    });
  });
  editJson(second, 'evaluation.json', (value) => {
    value.operationPhases.grader['report-alt'] = 'outcome';
    value.operationPhases.status = { 'status-alt': 'outcome' };
  });
  const firstProbe = JSON.parse(fs.readFileSync(path.join(second, 'probes', 'P-002.probe.json'), 'utf8'));
  const secondDeployments = structuredClone(firstProbe.qualification.deployments);
  for (const side of ['preFix', 'fix']) secondDeployments[side].reports.grader = { ...REPORT, operationId: 'report-alt' };
  fs.writeFileSync(
    path.join(second, 'probes', 'P-003.probe.json'),
    `${JSON.stringify({ ...firstProbe, probeId: 'P-003', qualification: { ...firstProbe.qualification, deployments: secondDeployments } }, null, 2)}\n`,
  );
  await writeCorpusIndex(second);
  const secondRun = runCli(['check', '--evaluation', second], { env: environment });
  const secondFound = signature(secondRun.stdout);
  check(
    secondRun.status === 10 &&
      secondFound.length === 1 &&
      secondFound[0].startsWith('probes/P-003.probe.json: [historical] ') &&
      secondFound[0].includes('operationId=report-alt'),
    `${label}: a collision of only the second probe's report did not draw one finding on that probe (exit ${secondRun.status}, findings ${JSON.stringify(secondFound)})\n${secondRun.output}`,
  );

  // A collision between operations no report names, with a probe that does name a report, draws no finding from this rule.
  const unrelated = copyApi();
  plantApiHistorical(unrelated, DEPLOYMENTS);
  editJson(unrelated, 'contract.json', (value) => {
    const [grader] = value.permittedInterfaces;
    const original = grader.operations.find((operation) => operation.operationId === 'grade-answer');
    value.permittedInterfaces.push({
      ...structuredClone(grader),
      logicalId: 'status',
      operations: ['status-a', 'status-b'].map((operationId) => ({ ...structuredClone(original), operationId, pathTemplate: '/status/x' })),
    });
  });
  editJson(unrelated, 'evaluation.json', (value) => {
    value.operationPhases.status = { 'status-a': 'outcome', 'status-b': 'outcome' };
  });
  await writeCorpusIndex(unrelated);
  const unrelatedRun = runCli(['check', '--evaluation', unrelated], { env: environment });
  check(
    signature(unrelatedRun.stdout).length === 0,
    `${label}: a real collision between two ordinary operations drew a finding although no report names either\n${unrelatedRun.output}`,
  );
  const engineLines = spawnSync(
    process.execPath,
    [engineCliPath({}), 'compile', '--in', path.join(unrelated, 'contract.json'), '--out', path.join(tempDir('direct-177'), 'out.json')],
    { encoding: 'utf8' },
  ).stderr.split('\n');
  check(
    engineLines.some((line) => line.includes('duplicate-operation-signature') && line.includes('operationId=status-')),
    `${label}: the fixture's two ordinary operations do not collide at the engine, so the case proves nothing (${JSON.stringify(engineLines)})`,
  );

  // The same shapes through the stand-in: an engine line that names a cli-shaped pair, or the report's operation ID on another interface, is not a report's collision.
  const shimmedOn = (folder, line) => {
    const calls = path.join(tempDir('shim-log-177b'), 'calls.log');
    const run = runCli(['check', '--evaluation', folder], {
      env: { ...environment, [ENGINE_CLI_ENV]: shim, SHIM_LOG: calls, SHIM_LINE: line, SHIM_EXIT: '4' },
    });
    return { run, calls: fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').trim().split('\n') : [] };
  };
  for (const [name, line] of [
    [
      'two cli operations that share the identity they render',
      'eval-quality: duplicate-operation-signature: EvalContract.permittedInterfaces[logicalId=tool].operations[operationId=run-a]: collides with permittedInterfaces[logicalId=tool].operations[operationId=run-b] on the identity it renders ("tool") among cli-shaped operations',
    ],
    [
      'two ordinary operations of the reported interface, which no report names',
      'eval-quality: duplicate-operation-signature: EvalContract.permittedInterfaces[logicalId=grader].operations[operationId=grade-answer]: collides with permittedInterfaces[logicalId=grader].operations[operationId=grade-other] after parameter-name erasure ("GET /grade") among api-shaped operations',
    ],
    [
      "the report's operation ID on an interface no report names",
      'eval-quality: duplicate-operation-signature: EvalContract.permittedInterfaces[logicalId=status].operations[operationId=report-release]: collides with permittedInterfaces[logicalId=status].operations[operationId=status-b] after parameter-name erasure ("GET /status/x") among api-shaped operations',
    ],
  ]) {
    const outcome = shimmedOn(unrelated, line);
    check(
      signature(outcome.run.stdout).length === 0 && outcome.run.status === 0 && outcome.calls.length === 1,
      `${label}: ${name} drew a finding from this rule (exit ${outcome.run.status}, calls ${outcome.calls.length})\n${outcome.run.output}`,
    );
  }

  // An ordinary-only collision with no probe naming a report: no compile call, no finding from this rule.
  const log = path.join(tempDir('shim-log-177'), 'calls.log');
  const ordinary = copyApi();
  plantHistorical(ordinary, { fixCommit: 'a1b2c3d' });
  plantCollidingOrdinaryInterface(ordinary, 'grade-answer');
  await writeCorpusIndex(ordinary);
  const ordinaryRun = runCli(['check', '--evaluation', ordinary], {
    env: {
      ...environment,
      [ENGINE_CLI_ENV]: shim,
      SHIM_LOG: log,
      SHIM_LINE: 'eval-quality: duplicate-operation-signature: stand-in refusal',
      SHIM_EXIT: '4',
    },
  });
  // The contract declares two interfaces, so `check` asks the engine once about a repeated identifier (Story 1.102); the stand-in's signature line is not this rule's to quote, since no probe names a report.
  const ordinaryCalls = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : [];
  check(
    signature(ordinaryRun.stdout).length === 0 && ordinaryCalls.length === 1,
    `${label}: a collision between ordinary operations with no probe naming a report drew a finding or did not run the one compile call for the identifier rule (calls ${ordinaryCalls.length === 0 ? 'none' : JSON.stringify(ordinaryCalls)})\n${ordinaryRun.output}`,
  );
  const ordinaryEngine = spawnSync(
    process.execPath,
    [engineCliPath({}), 'compile', '--in', path.join(ordinary, 'contract.json'), '--out', path.join(tempDir('direct-177c'), 'out.json')],
    { encoding: 'utf8' },
  );
  check(
    ordinaryEngine.status === 4 && ordinaryEngine.stderr.includes('duplicate-operation-signature'),
    `${label}: the engine does not refuse the ordinary-only fixture, so its case proves nothing (exit ${ordinaryEngine.status})\n${ordinaryEngine.stderr}`,
  );
  const ordinaryReal = runCli(['check', '--evaluation', ordinary], { env: environment });
  check(
    signature(ordinaryReal.stdout).length === 0,
    `${label}: the real engine's collision between ordinary operations drew a finding from this rule\n${ordinaryReal.output}`,
  );
  check(
    fs.readdirSync(privateTemp).length === 0,
    `the cases left ${JSON.stringify(fs.readdirSync(privateTemp))} in the temporary directory`,
  );
}

/** The findings of the historical rule among `findingsOf`. */
function historicalFindingsOf(stdout) {
  return findingsOf(stdout).filter((line) => line.includes(': [historical] '));
}

function sha256Hex(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

// ---------------------------------------------------------------------------
// The valid fixture

async function checkValidFixture() {
  const result = runCli(['check', '--evaluation', VALID]);
  check(result.status === 0, `check over the valid fixture exited ${result.status}; expected 0\n${result.output}`);
  check(!/unknown format/.test(result.output), `check printed an Ajv format warning\n${result.output}`);

  const byManifest = runCli(['check', '--evaluation', path.join(VALID, 'evaluation.json')]);
  check(byManifest.status === 0, `check naming evaluation.json itself exited ${byManifest.status}; expected 0\n${byManifest.output}`);

  const compiled = path.join(tempDir('compile'), 'contract.compiled.json');
  const compile = spawnSync(process.execPath, [engineCliPath(), 'compile', '--in', path.join(VALID, 'contract.json'), '--out', compiled], {
    encoding: 'utf8',
  });
  check(compile.status === 0, `the fixture contract does not compile through the engine CLI (exit ${compile.status})\n${compile.stderr}`);

  const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
  const validateProbe = ajv.compile(JSON.parse(fs.readFileSync(engineSchemaPath('probe.schema.json'), 'utf8')));
  const qualified = JSON.parse(fs.readFileSync(path.join(VALID, 'baseline', 'probes', 'P-001.probe.json'), 'utf8'));
  check(
    validateProbe(qualified),
    `the fixture's qualified baseline probe does not meet eval-quality's probe schema: ${JSON.stringify(validateProbe.errors)}`,
  );
}

/**
 * Story 1.12's requirements statement and Story 2.2's contract-source freshness: every evaluation names a committed
 * `requirements.md`, and the contract's `sourceSpecDigest` is the digest of exactly those bytes.
 */
async function checkRequirementsStatement() {
  const engine = await loadEngine();
  const assets = path.join(PROJECT_ROOT, 'src', 'workflows', 'testarch', 'bmad-testarch-evaluate', 'assets');
  const starter = JSON.parse(fs.readFileSync(path.join(assets, 'evaluation.json'), 'utf8'));
  const starterBytes = fs.readFileSync(path.join(assets, 'requirements-statement.md'));
  const validateStarter = new Ajv({ strict: false, allErrors: true }).compile(
    JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'cli', 'lib', 'evaluate', 'schemas', 'evaluation.schema.json'), 'utf8')),
  );
  check(validateStarter(starter), `the filled evaluation.json starter fails the runtime schema: ${JSON.stringify(validateStarter.errors)}`);
  check(
    starter.requirements?.digest === engine.digestBytes(starterBytes),
    'the filled evaluation.json starter does not digest the exact requirements statement template bytes',
  );
  const fromStarter = copyValid();
  fs.writeFileSync(path.join(fromStarter, 'requirements.md'), starterBytes);
  editJson(fromStarter, 'evaluation.json', (value) => (value.requirements = starter.requirements));
  // The contract stage stamps the statement's digest; a fixture built from the starter carries it the same way.
  editJson(fromStarter, 'contract.json', (value) => (value.sourceSpecDigest = starter.requirements.digest));
  const starterCheck = runCli(['check', '--evaluation', fromStarter]);
  check(
    starterCheck.status === 0,
    `a fixture filled from the evaluation.json starter exited ${starterCheck.status}; expected 0\n${starterCheck.output}`,
  );

  const bytes = Buffer.from('# Confirmed requirements\n\nThe target returns the expected result.\n');
  const recorded = engine.digestBytes(bytes);
  const withStatement = () => {
    const folder = copyValid();
    fs.writeFileSync(path.join(folder, 'requirements.md'), bytes);
    editJson(folder, 'evaluation.json', (value) => (value.requirements = { path: 'requirements.md', digest: recorded }));
    editJson(folder, 'contract.json', (value) => (value.sourceSpecDigest = recorded));
    return folder;
  };

  const valid = withStatement();
  const accepted = runCli(['check', '--evaluation', valid]);
  check(accepted.status === 0, `a committed requirements statement exited ${accepted.status}; expected 0\n${accepted.output}`);

  // Contract-source freshness (Story 2.2): a requirements change the contract has not absorbed blocks the pull request.
  // One byte of the statement changes, and evaluation.json is re-recorded, so the contract's sourceSpecDigest is the only
  // thing left that disagrees with the committed bytes.
  const edited = withStatement();
  const editedBytes = Buffer.concat([bytes, Buffer.from(' ')]);
  fs.writeFileSync(path.join(edited, 'requirements.md'), editedBytes);
  editJson(edited, 'evaluation.json', (value) => (value.requirements.digest = engine.digestBytes(editedBytes)));
  const editedResult = runCli(['check', '--evaluation', edited]);
  check(
    editedResult.status === 10,
    `a requirements edit the contract did not absorb exited ${editedResult.status}; expected 10\n${editedResult.output}`,
  );
  check(
    editedResult.stdout.includes('contract.json: [requirements] sourceSpecDigest') &&
      editedResult.stdout.includes(engine.digestBytes(editedBytes)),
    `a requirements edit the contract did not absorb lacks the freshness finding\n${editedResult.output}`,
  );
  const staleContract = withStatement();
  editJson(staleContract, 'contract.json', (value) => (value.sourceSpecDigest = `sha256:${'0'.repeat(64)}`));
  const staleContractResult = runCli(['check', '--evaluation', staleContract]);
  check(
    staleContractResult.status === 10,
    `a stale sourceSpecDigest exited ${staleContractResult.status}; expected 10\n${staleContractResult.output}`,
  );
  check(
    staleContractResult.stdout.includes('contract.json: [requirements] sourceSpecDigest'),
    `a stale sourceSpecDigest lacks the freshness finding\n${staleContractResult.output}`,
  );
  // A null or absent sourceSpecDigest is a finding: the contract is held to the statement like any other value.
  for (const [label, edit] of [
    ['a null sourceSpecDigest', (value) => (value.sourceSpecDigest = null)],
    ['an absent sourceSpecDigest', (value) => delete value.sourceSpecDigest],
  ]) {
    const unstamped = withStatement();
    editJson(unstamped, 'contract.json', edit);
    const unstampedResult = runCli(['check', '--evaluation', unstamped]);
    check(unstampedResult.status === 10, `${label} exited ${unstampedResult.status}; expected 10\n${unstampedResult.output}`);
    check(
      unstampedResult.stdout.includes('contract.json: [requirements] sourceSpecDigest'),
      `${label} lacks the freshness finding\n${unstampedResult.output}`,
    );
  }
  const undeclared = withStatement();
  editJson(undeclared, 'evaluation.json', (value) => delete value.requirements);
  const undeclaredResult = runCli(['check', '--evaluation', undeclared]);
  check(
    undeclaredResult.status === 10,
    `an evaluation with no requirements statement exited ${undeclaredResult.status}; expected 10\n${undeclaredResult.output}`,
  );
  check(
    undeclaredResult.stdout.includes('evaluation.json: [requirements] evaluation.json declares no requirements statement'),
    `an evaluation with no requirements statement lacks its finding\n${undeclaredResult.output}`,
  );

  for (const [label, edit, named] of [
    ['missing digest', (value) => delete value.requirements.digest, '/requirements'],
    ['malformed digest', (value) => (value.requirements.digest = 'sha256:BAD'), '/requirements/digest'],
    ['digest object with shadowed toString', (value) => (value.requirements.digest = { toString: 'x' }), '/requirements/digest'],
    ['parent path', (value) => (value.requirements.path = '../requirements.md'), '/requirements/path'],
    ['absolute path', (value) => (value.requirements.path = '/tmp/requirements.md'), '/requirements/path'],
    // eval-quality aggregate-strength admits defect, gameability and zero-action; a canary stays outside every denominator (Story 1.45).
    ['canary floor', (value) => (value.strengthFloor.canary = 1), '/strengthFloor'],
    ['floor above one', (value) => (value.strengthFloor.defect = 1.5), '/strengthFloor/defect'],
  ]) {
    const folder = withStatement();
    editJson(folder, 'evaluation.json', edit);
    const result = runCli(['check', '--evaluation', folder]);
    check(result.status === 10, `${label} exited ${result.status}; expected 10\n${result.output}`);
    check(
      result.stdout.includes('evaluation.json: [schema]') && result.stdout.includes(named),
      `${label} lacks its schema finding\n${result.output}`,
    );
  }

  const missing = withStatement();
  fs.rmSync(path.join(missing, 'requirements.md'));
  const missingResult = runCli(['check', '--evaluation', missing]);
  check(missingResult.status === 10, `missing requirements.md exited ${missingResult.status}; expected 10\n${missingResult.output}`);
  check(
    missingResult.stdout.includes('requirements.md: [requirements]'),
    `missing requirements.md lacks a finding\n${missingResult.output}`,
  );

  const changed = withStatement();
  fs.appendFileSync(path.join(changed, 'requirements.md'), '\n');
  const changedResult = runCli(['check', '--evaluation', changed]);
  check(changedResult.status === 10, `changed requirements bytes exited ${changedResult.status}; expected 10\n${changedResult.output}`);
  check(
    changedResult.stdout.includes('requirements.md: [requirements]'),
    `changed requirements bytes lack a finding\n${changedResult.output}`,
  );

  if (process.platform !== 'win32') {
    const linked = withStatement();
    fs.rmSync(path.join(linked, 'requirements.md'));
    const outside = path.join(tempDir('outside-requirements'), 'requirements.md');
    fs.writeFileSync(outside, bytes);
    fs.symlinkSync(outside, path.join(linked, 'requirements.md'));
    const linkedResult = runCli(['check', '--evaluation', linked]);
    check(linkedResult.status === 10, `linked requirements.md exited ${linkedResult.status}; expected 10\n${linkedResult.output}`);
    check(
      linkedResult.stdout.includes('requirements.md: [requirements]'),
      `linked requirements.md lacks a finding\n${linkedResult.output}`,
    );

    // Simulate a FIFO swapped in after lstat has reported a regular file.
    // Without O_NONBLOCK the subsequent open waits for a writer indefinitely.
    const swapped = withStatement();
    const fifo = path.join(swapped, 'requirements.md');
    fs.rmSync(fifo);
    const made = spawnSync('mkfifo', [fifo], { encoding: 'utf8' });
    check(made.status === 0, `could not create the FIFO race fixture: ${made.stderr}`);
    if (made.status === 0) {
      const preloader = path.join(tempDir('fifo-race'), 'lstat-preloader.cjs');
      fs.writeFileSync(
        preloader,
        [
          "const fs = require('node:fs');",
          'const original = fs.lstatSync;',
          'fs.lstatSync = function (file, ...args) {',
          '  const stats = original.call(this, file, ...args);',
          '  if (file === process.env.TEA_TEST_REQUIREMENTS_FIFO && stats.isFIFO()) return { isFile: () => true };',
          '  return stats;',
          '};',
        ].join('\n'),
      );
      const raced = spawnSync(process.execPath, ['--require', preloader, CLI, 'check', '--evaluation', swapped], {
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
        env: { ...process.env, TEA_TEST_REQUIREMENTS_FIFO: fifo },
        timeout: 10_000,
      });
      check(!raced.error, `a FIFO swapped after lstat hung or failed: ${raced.error?.message}`);
      check(raced.status === 10, `a FIFO swapped after lstat exited ${raced.status}; expected 10\n${raced.stdout}${raced.stderr}`);
      check(
        raced.stdout.includes('requirements.md: [requirements]'),
        `a FIFO swapped after lstat lacks a requirements finding\n${raced.stdout}${raced.stderr}`,
      );
    }
  }
}

/** Every `evaluation.json` under `directory`, found without following a link. */
function evaluationManifestsUnder(directory) {
  const found = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...evaluationManifestsUnder(file));
    else if (entry.isFile() && entry.name === 'evaluation.json') found.push(file);
  }
  return found.sort();
}

/**
 * Story 2.2: every evaluation committed under `test/fixtures/` and `test/evaluations/` names a `requirements.md` whose
 * digest is the one its contract's `sourceSpecDigest` carries, so the freshness rule holds for every evaluation `check`
 * runs over. Negative cases are built in temp folders at test time, so no committed folder holds a failing
 * `evaluation.json` and the walk sees only evaluations meant to pass. Deleting one fixture's statement makes `check`
 * exit 10, which the last case observes in a copy.
 */
async function checkEveryEvaluationHasItsStatement() {
  const engine = await loadEngine();
  const manifests = ['fixtures', 'evaluations'].flatMap((root) => evaluationManifestsUnder(path.join(PROJECT_ROOT, 'test', root)));
  check(
    manifests.length >= 14,
    `the walk found ${manifests.length} evaluation.json file(s); expected at least the 14 committed evaluations`,
  );
  for (const manifest of manifests) {
    const folder = path.dirname(manifest);
    const name = path.relative(PROJECT_ROOT, folder);
    const evaluation = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    const statement = evaluation.requirements;
    check(statement?.path === 'requirements.md', `${name} names no requirements.md statement`);
    if (statement?.path !== 'requirements.md') continue;
    const file = path.join(folder, statement.path);
    check(fs.existsSync(file), `${name} names ${statement.path}, which is not committed`);
    if (!fs.existsSync(file)) continue;
    const digest = engine.digestBytes(fs.readFileSync(file));
    check(statement.digest === digest, `${name}: evaluation.json records ${statement.digest}; requirements.md digests to ${digest}`);
    const contract = JSON.parse(fs.readFileSync(path.join(folder, 'contract.json'), 'utf8'));
    check(
      contract.sourceSpecDigest === digest,
      `${name}: the contract's sourceSpecDigest ${contract.sourceSpecDigest} is not the statement's digest ${digest}`,
    );
  }
  // Deleting a statement from a copy of one back-filled fixture makes check exit 10, naming the statement.
  const copy = path.join(tempDir('walk'), 'valid');
  fs.cpSync(VALID, copy, { recursive: true });
  fs.rmSync(path.join(copy, 'requirements.md'));
  const result = runCli(['check', '--evaluation', copy]);
  check(result.status === 10, `a fixture with its requirements.md deleted exited ${result.status}; expected 10\n${result.output}`);
  check(result.stdout.includes('requirements.md: [requirements]'), `the deleted statement lacks its finding\n${result.output}`);
}

// ---------------------------------------------------------------------------
// The registry (Story 1.5)

/**
 * Problems eval-quality's own `CommandTargetPolicy` parser finds in `policy`,
 * or an empty list when it accepts it.
 *
 * `parseCommandTargetPolicy` on `eval-quality/adapters` refuses an invalid
 * mapping with a `RuntimeFault` whose `cause` is the `ZodError` carrying every
 * issue. A child Node process runs it, because the test tree loads the engine
 * as an ES module, and prints the issues it reports.
 */
function commandTargetPolicyProblems(policy) {
  const script = [
    "import { readFileSync } from 'node:fs';",
    "import { parseCommandTargetPolicy } from 'eval-quality/adapters';",
    'try {',
    "  parseCommandTargetPolicy(JSON.parse(readFileSync(0, 'utf8')));",
    "  process.stdout.write('[]');",
    '} catch (error) {',
    "  if (error?.code !== 'schema-parse-failure' || !Array.isArray(error.cause?.issues)) throw error;",
    '  process.stdout.write(JSON.stringify(error.cause.issues));',
    '}',
  ].join('\n');
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: PROJECT_ROOT,
    input: JSON.stringify(policy),
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`eval-quality's parseCommandTargetPolicy could not be run\n${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

function checkRegistry() {
  const evaluation = JSON.parse(fs.readFileSync(path.join(VALID, 'evaluation.json'), 'utf8'));
  const registry = registryFromEvaluation(evaluation, { root: PROJECT_ROOT });
  const policy = registry.commandTargetPolicy({ cwd: tempDir('registry-cwd') });
  const problems = commandTargetPolicyProblems(policy);
  check(
    problems.length === 0,
    `the policy the fixture registry builds does not meet eval-quality's CommandTargetPolicy schema: ${JSON.stringify(problems)}`,
  );
  const leaked = commandTargetPolicyProblems({
    authorizations: [{ ...policy.authorizations[0], infrastructureExitCodes: [3] }],
  });
  check(leaked.length > 0, "eval-quality's CommandTargetPolicy schema accepted an unknown key, so this case proves nothing");
  check(policy.authorizations.length === evaluation.registry.length, 'the policy does not carry one authorization per registry entry');
  check(
    policy.authorizations.every((authorization) => !Object.hasOwn(authorization, 'infrastructureExitCodes')),
    'an authorization carries infrastructureExitCodes, which eval-quality would refuse as an unknown key',
  );
  check(
    policy.authorizations[0]?.target === path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'red-phase-gate.js'),
    `the fixture's relative target did not resolve against the registry root: ${policy.authorizations[0]?.target}`,
  );
  check(
    registry.targetProblems().length === 0,
    `the fixture's registered target is missing or not executable: ${registry.targetProblems().join('; ')}`,
  );

  // Principal mappings are authoring wiring. A valid mapping permits check,
  // and removing it names the principal before a run can reach the target.
  const principalFolder = copyValid();
  editJson(principalFolder, 'contract.json', (value) => {
    value.testData.principals = { operator: { kind: 'human' } };
    value.interactionPlan[0].inputBinding.stdin.prompt = { principal: 'operator' };
  });
  editJson(principalFolder, 'evaluation.json', (value) => {
    value.principalMappings = { operator: { interfaceId: 'tea-atdd-runner', environmentKey: 'HOME' } };
  });
  const principalAccepted = runCli(['check', '--evaluation', principalFolder]);
  check(principalAccepted.status === 0, `a valid principal mapping exited ${principalAccepted.status}\n${principalAccepted.output}`);
  editJson(principalFolder, 'evaluation.json', (value) => delete value.principalMappings);
  const principalRejected = runCli(['check', '--evaluation', principalFolder]);
  check(
    principalRejected.status === 10 &&
      principalRejected.output.includes('operator') &&
      principalRejected.output.includes('principal-mapping'),
    `an unmapped principal was not rejected with its mapping defect\n${principalRejected.output}`,
  );

  // The builder reads the RegistryEntry schema: an entry it refuses never
  // becomes an authorization.
  const [entry] = evaluation.registry;
  const { infrastructureExitCodes, ...withoutCodes } = entry;
  let refused;
  try {
    createRegistry([withoutCodes], { root: PROJECT_ROOT });
  } catch (error) {
    refused = error;
  }
  check(
    refused !== undefined && refused.message.includes('infrastructureExitCodes'),
    `createRegistry accepted an entry with no infrastructureExitCodes (${infrastructureExitCodes.join(', ')} removed): ${refused?.message}`,
  );
  // Two executables on one interface with different keys: each authorization
  // carries its own entry's keys, and a request's environment is read for the
  // one executable it targets.
  const shared = createRegistry(
    [
      { ...entry, environmentKeys: ['HOME'] },
      { ...entry, executable: 'tea-atdd-report', environmentKeys: ['TEA_REPORT_TOKEN'] },
    ],
    { root: PROJECT_ROOT },
  );
  const sharedPolicy = shared.commandTargetPolicy({ cwd: PROJECT_ROOT });
  check(
    JSON.stringify(sharedPolicy.authorizations.map((authorization) => authorization.permittedEnvironmentKeys)) ===
      JSON.stringify([['HOME'], ['TEA_REPORT_TOKEN']]),
    `entries sharing an interface did not keep their own keys: ${JSON.stringify(sharedPolicy.authorizations.map((a) => a.permittedEnvironmentKeys))}`,
  );
  const reportEnvironment = shared.hostEnvironment(entry.interfaceId, [], 'tea-atdd-report');
  check(!Object.hasOwn(reportEnvironment, 'HOME'), "hostEnvironment for one executable read another entry's key");
  let ambiguous;
  try {
    shared.hostEnvironment(entry.interfaceId);
  } catch (error) {
    ambiguous = error;
  }
  check(ambiguous !== undefined, 'hostEnvironment answered for an interface with two executables without being told which');
  let dotted;
  try {
    dotted = createRegistry([{ ...entry, target: '..tools/gate.js' }], { root: PROJECT_ROOT }).commandTargetPolicy({ cwd: PROJECT_ROOT });
  } catch (error) {
    dotted = error;
  }
  check(!(dotted instanceof Error), `a target in a directory named "..tools" was refused: ${dotted?.message}`);

  let unknownField;
  try {
    createRegistry([{ ...entry, shell: true }], { root: PROJECT_ROOT });
  } catch (error) {
    unknownField = error;
  }
  check(unknownField !== undefined && unknownField.message.includes('shell'), 'createRegistry accepted an entry with an unknown field');

  // A directory carries the executable bit and still cannot be spawned.
  const directoryTarget = createRegistry([{ ...entry, target: 'test/fixtures/evaluate/valid' }], { root: PROJECT_ROOT });
  const directoryProblems = directoryTarget.targetProblems();
  check(
    directoryProblems.length === 1 && directoryProblems[0].includes('is not a file'),
    `targetProblems accepted a directory as a target: ${JSON.stringify(directoryProblems)}`,
  );

  // A relative root, and a relative projectRoot override, are fixed to absolute
  // paths, so a later change of working directory cannot move a target.
  const expectedTarget = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'red-phase-gate.js');
  const startDirectory = process.cwd();
  try {
    process.chdir(PROJECT_ROOT);
    const relative = createRegistry([entry], { root: '.' });
    const overridden = createRegistry([entry], { root: os.tmpdir() });
    process.chdir(os.tmpdir());
    check(relative.root === PROJECT_ROOT, `a relative registry root was kept as ${JSON.stringify(relative.root)}`);
    const relativeTarget = relative.commandTargetPolicy({ cwd: PROJECT_ROOT }).authorizations[0].target;
    check(relativeTarget === expectedTarget, `a relative registry root resolved its target to ${relativeTarget}`);
    check(relative.targetProblems().length === 0, `a relative registry root broke targetProblems: ${relative.targetProblems().join('; ')}`);
    process.chdir(path.join(PROJECT_ROOT, 'test'));
    const override = overridden.commandTargetPolicy({ cwd: PROJECT_ROOT, projectRoot: '..' }).authorizations[0].target;
    check(override === expectedTarget, `a relative projectRoot override resolved the target to ${override}`);
    check(
      overridden.targetPath(entry, '..') === expectedTarget,
      `targetPath kept a relative projectRoot override: ${overridden.targetPath(entry, '..')}`,
    );
    check(
      overridden.targetProblems('..').length === 0,
      `targetProblems kept a relative projectRoot override: ${overridden.targetProblems('..').join('; ')}`,
    );
  } finally {
    process.chdir(startDirectory);
  }
}

// ---------------------------------------------------------------------------
// Digest, redaction and record formats (review round 1)

async function checkRuntimeUnits() {
  // A missing file and a file holding the marker's bytes digest apart; a
  // missing file and an ordinary file digest as they always have.
  const folder = tempDir('digest-files');
  fs.writeFileSync(path.join(folder, 'marker.txt'), '<missing>');
  fs.writeFileSync(path.join(folder, 'plain.txt'), 'bytes');
  const markerPresent = await digestFiles(folder, ['marker.txt']);
  fs.rmSync(path.join(folder, 'marker.txt'));
  const markerMissing = await digestFiles(folder, ['marker.txt']);
  check(markerPresent !== markerMissing, 'a file holding "<missing>" digests the same as a missing file');
  check(markerMissing === digest(['marker.txt', '<missing>']), 'a missing file no longer digests as its path and the <missing> marker');
  check(
    (await digestFiles(folder, ['plain.txt'])) === digest(['plain.txt', Buffer.from('bytes')]),
    'an ordinary file no longer digests as its path and its bytes',
  );

  // URL userinfo is a credential with or without a password half.
  for (const [input, expected] of [
    ['--endpoint=https://user:pass@host.example/path?x=1', '--endpoint=https://[redacted]@host.example/path?x=1'],
    ['clone http://ghs_token@github.example/org/repo', 'clone http://[redacted]@github.example/org/repo'],
    ['https://user:p@ss@host.example/', 'https://[redacted]@host.example/'],
    ['https://host.example/users/a@b', 'https://host.example/users/a@b'],
    ['mail someone@example.com', 'mail someone@example.com'],
  ]) {
    check(redactSecrets(input) === expected, `redactSecrets(${JSON.stringify(input)}) gave ${JSON.stringify(redactSecrets(input))}`);
  }
  const args = redactArgs(['--endpoint=https://user:pass@host.example', 'https://user:pass@host.example']);
  check(
    JSON.stringify(args) === JSON.stringify(['--endpoint=[redacted]', '[redacted]']),
    `redactArgs kept URL userinfo: ${JSON.stringify(args)}`,
  );

  // date-time is checked, calendar and clock included, with no warning.
  for (const value of ['2026-09-23T10:00:00Z', '2024-02-29T23:59:60.5+05:30', '2026-01-01t00:00:00z']) {
    check(isDateTime(value), `isDateTime refused ${value}`);
  }
  for (const value of [
    '2026-02-30T00:00:00Z',
    '2023-02-29T00:00:00Z',
    '2026-01-01T24:00:00Z',
    '2026-13-01T00:00:00Z',
    '2026-01-01 00:00:00Z',
    '2026-01-01T00:00:00+24:00',
    'yesterday',
  ]) {
    check(!isDateTime(value), `isDateTime accepted ${value}`);
  }
  const stampSchema = { type: 'object', properties: { at: { type: 'string', format: 'date-time' } } };
  const validateArtifact = createArtifactValidator({ readJson: async () => ({ present: true, value: stampSchema }) });
  const warnings = [];
  const warn = console.warn;
  console.warn = (...parts) => warnings.push(parts.join(' '));
  let malformed;
  let wellFormed;
  try {
    malformed = await validateArtifact('stamp', { at: '2026-02-30T00:00:00Z' });
    wellFormed = await validateArtifact('stamp', { at: '2026-09-23T10:00:00Z' });
  } finally {
    console.warn = warn;
  }
  check(malformed.length > 0, 'createArtifactValidator accepted a malformed date-time');
  check(wellFormed.length === 0, `createArtifactValidator refused a well-formed date-time: ${JSON.stringify(wellFormed)}`);
  check(warnings.length === 0, `createArtifactValidator warned while compiling a date-time format: ${warnings.join('; ')}`);
}

// ---------------------------------------------------------------------------
// The optional engine is absent

const HIDE_ENGINE = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'engine-absent', 'hide-engine.cjs');
const ENGINE_ABSENT_MESSAGE = 'eval-quality is not installed where tea-evaluate can reach it';

/**
 * With eval-quality hidden from every resolution, the runtime still loads
 * (its synchronous schema-version reading is guarded), each subcommand exits
 * 12 naming the package to install, and asking the runtime for a schema version
 * or the engine version names the missing package too.
 */
function checkEngineAbsent() {
  for (const subcommand of ['check', 'digest']) {
    const result = spawnSync(process.execPath, ['--require', HIDE_ENGINE, CLI, subcommand, '--evaluation', copyValid()], {
      encoding: 'utf8',
    });
    check(
      result.status === 12,
      `${subcommand} with the engine absent exited ${result.status}; expected 12\n${result.stdout}${result.stderr}`,
    );
    check(
      result.stderr.includes(ENGINE_ABSENT_MESSAGE),
      `${subcommand} with the engine absent did not name the missing package\n${result.stderr}`,
    );
    // The message tells the adopter which release to install: the peer range the package declares.
    const peerRange = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8')).peerDependencies['eval-quality'];
    check(
      result.stderr.includes(`eval-quality@"${peerRange}"`),
      `${subcommand} with the engine absent did not name the declared peer range ${peerRange}\n${result.stderr}`,
    );
  }
  // A refused path exits 64 whether or not the engine is installed; only a good path needs it (Story 1.115).
  const hidden = (file) =>
    spawnSync(process.execPath, ['--require', HIDE_ENGINE, CLI, 'digest', '--evaluation', copyValid(), '--file', file], {
      encoding: 'utf8',
    });
  const refusedHidden = hidden('../outside.md');
  check(
    refusedHidden.status === 64 && !refusedHidden.stderr.includes(ENGINE_ABSENT_MESSAGE),
    `digest --file over a refused path with the engine absent exited ${refusedHidden.status}; expected 64\n${refusedHidden.stdout}${refusedHidden.stderr}`,
  );
  const goodHidden = hidden('requirements.md');
  check(
    goodHidden.status === 12 && goodHidden.stdout === '' && goodHidden.stderr.includes(ENGINE_ABSENT_MESSAGE),
    `digest --file over a good path with the engine absent exited ${goodHidden.status}; expected 12 naming the package\n${goodHidden.stdout}${goodHidden.stderr}`,
  );
  for (const [label, expression] of [
    ['a record builder', "require('./cli/lib/evaluate/records').sealedRunRecord({})"],
    ['the engine version', "require('./cli/lib/evaluate/engine').engineVersion()"],
  ]) {
    const result = spawnSync(process.execPath, ['--require', HIDE_ENGINE, '-e', expression], { cwd: PROJECT_ROOT, encoding: 'utf8' });
    check(
      result.status !== 0 && result.stderr.includes(ENGINE_ABSENT_MESSAGE),
      `${label} with the engine absent did not report the missing package (exit ${result.status})\n${result.stderr}`,
    );
  }
}

// ---------------------------------------------------------------------------
// --evaluation is required and must resolve

function checkUsage() {
  const empty = tempDir('empty');
  for (const subcommand of ['check', 'digest']) {
    const missing = runCli([subcommand]);
    check(missing.status === 64, `${subcommand} with no --evaluation exited ${missing.status}; expected 64\n${missing.output}`);
    check(missing.stderr.includes('--evaluation'), `${subcommand} with no --evaluation did not name the flag on stderr\n${missing.output}`);

    const unresolved = runCli([subcommand, '--evaluation', empty]);
    check(
      unresolved.status === 64,
      `${subcommand} over a folder with no evaluation.json exited ${unresolved.status}; expected 64\n${unresolved.output}`,
    );
    check(
      unresolved.stderr.includes('--evaluation'),
      `${subcommand} over an unresolved folder did not name the flag\n${unresolved.output}`,
    );
    check(fs.readdirSync(empty).length === 0, `${subcommand} wrote into a folder that did not resolve`);

    // A run from inside a valid folder still needs the flag: nothing defaults to the working directory.
    const fromInside = runCli([subcommand], { cwd: VALID });
    check(fromInside.status === 64, `${subcommand} run inside an evaluation folder with no flag exited ${fromInside.status}; expected 64`);
  }
  const noSubcommand = runCli([]);
  check(noSubcommand.status === 64, `tea-evaluate with no subcommand exited ${noSubcommand.status}; expected 64`);
  const unknownOption = runCli(['check', '--evaluation', VALID, '--no-such-flag']);
  check(unknownOption.status === 64, `an unknown option exited ${unknownOption.status}; expected 64`);

  const resolved = resolveEvaluationFolder(VALID);
  check(resolved.ok && resolved.folder === VALID, 'resolveEvaluationFolder did not resolve the valid fixture folder');
  check(!resolveEvaluationFolder().ok, 'resolveEvaluationFolder resolved an absent flag');

  // `link/../evaluation` climbs from the link's target, as the system resolves it.
  const base = fs.realpathSync(tempDir('climb'));
  fs.mkdirSync(path.join(base, 'real', 'deep'), { recursive: true });
  fs.cpSync(VALID, path.join(base, 'real', 'evaluation'), { recursive: true });
  fs.symlinkSync(path.join('real', 'deep'), path.join(base, 'link'), 'dir');
  const climbed = resolveEvaluationFolder(['link', '..', 'evaluation'].join(path.sep), base);
  check(
    climbed.ok && climbed.folder === path.join(base, 'real', 'evaluation'),
    `--evaluation link/../evaluation resolved to ${JSON.stringify(climbed)}; expected the folder beside the link's target`,
  );
}

// ---------------------------------------------------------------------------
// The authoring defects, one per temp copy

const DEFECT_CASES = [
  {
    name: 'a stale corpus-index.json',
    file: 'corpus-index.json',
    rule: 'stale-index',
    redigest: false,
    plant: (folder) => fs.appendFileSync(path.join(folder, 'corpus', 'reservations', 'docs', 'story.md'), 'One more line.\n'),
  },
  {
    name: 'an unknown evaluation.json schemaVersion',
    file: 'evaluation.json',
    rule: 'schema-version',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.schemaVersion = 3)),
    expect: (output) => [
      [output.includes(`${TEA_MANIFEST.name} ${TEA_MANIFEST.version}`), 'the message does not name the installed TeA version'],
      [output.includes('knows schemaVersion 2'), 'the message does not name the versions the runtime knows'],
      [output.includes('install the TeA release that introduced this version'), 'a newer version does not point to a newer release'],
    ],
  },
  {
    name: 'a committed probe carrying a runtime-owned top-level field',
    file: 'probes/P-001.probe.json',
    rule: 'runtime-owned-field',
    plant: (folder) => editJson(folder, 'probes/P-001.probe.json', (value) => (value.systemId = 'atdd-red-phase')),
    expect: (output) => [[output.includes('"systemId"'), 'the finding does not name the field']],
  },
  {
    name: 'a committed probe carrying a runtime-owned qualification field',
    file: 'probes/P-002.probe.json',
    rule: 'runtime-owned-field',
    plant: (folder) => editJson(folder, 'probes/P-002.probe.json', (value) => (value.qualification.rollbackVerified = true)),
    expect: (output) => [[output.includes('"qualification.rollbackVerified"'), 'the finding does not name the field']],
  },
  {
    name: 'a committed probe carrying a runtime-owned defect field',
    file: 'probes/P-002.probe.json',
    rule: 'runtime-owned-field',
    plant: (folder) => editJson(folder, 'probes/P-002.probe.json', (value) => (value.defects[0].oracleEvidence = [])),
    expect: (output) => [[output.includes('"defects[0].oracleEvidence"'), 'the finding does not name the field']],
  },
  {
    name: 'a mutation whose operator is not replace-exact',
    file: 'mutations/M-001.mutation.json',
    rule: 'mutation-operator',
    plant: (folder) => editJson(folder, 'mutations/M-001.mutation.json', (value) => (value.operator.kind = 'regex-replace')),
  },
  {
    name: 'a replace-exact mutation with an occurrence count other than 1',
    file: 'mutations/M-001.mutation.json',
    rule: 'mutation-operator',
    plant: (folder) => editJson(folder, 'mutations/M-001.mutation.json', (value) => (value.operator.occurrences = 2)),
  },
  {
    name: 'a targetArtifact inside a provisioned directory',
    file: 'mutations/M-001.mutation.json',
    rule: 'provisioned-target',
    plant: (folder) =>
      editJson(folder, 'mutations/M-001.mutation.json', (value) => (value.targetArtifact = 'node_modules/left-pad/index.js')),
  },
  {
    name: 'a contract declaring kind web',
    file: 'contract.json',
    rule: 'web-interface',
    plant: (folder) => editJson(folder, 'contract.json', (value) => (value.permittedInterfaces[0].kind = 'web')),
  },
  {
    name: 'a defect signature addressing a written file',
    file: 'probes/P-002.probe.json',
    rule: 'written-file-signature',
    plant: (folder) =>
      editJson(folder, 'probes/P-002.probe.json', (value) => {
        value.defectSignature.observableChannel = 'artifact';
        value.defectSignature.condition.predicate = {
          op: 'existence',
          operands: [{ pointer: '/interactions/observed/artifact/scaffold' }],
        };
      }),
  },
  {
    name: 'a written-file pointer under a non-artifact channel',
    file: 'probes/P-002.probe.json',
    rule: 'written-file-signature',
    plant: (folder) =>
      editJson(folder, 'probes/P-002.probe.json', (value) => {
        value.defectSignature.condition.predicate = {
          op: 'not',
          operands: [{ op: 'existence', operands: [{ pointer: '/interactions/observed/artifact/scaffold' }] }],
        };
      }),
  },
  {
    name: 'a behavior discharged by a defect probe declaring two oracles',
    file: 'probes/P-002.probe.json',
    rule: 'oracle-count',
    plant: (folder) => editJson(folder, 'contract.json', (value) => (value.behaviors[0].oracles = ['O-001', 'O-002'])),
  },
  {
    name: 'an off-pattern probe ID',
    file: 'probes/P-001.probe.json',
    rule: 'id-pattern',
    plant: (folder) => editJson(folder, 'probes/P-001.probe.json', (value) => (value.probeId = 'P-1')),
  },
  {
    name: 'an off-pattern behavior ID',
    file: 'contract.json',
    rule: 'id-pattern',
    plant: (folder) => editJson(folder, 'contract.json', (value) => (value.behaviors[1].id = 'B-2')),
  },
  {
    name: 'an off-pattern oracle ID',
    file: 'contract.json',
    rule: 'id-pattern',
    plant: (folder) =>
      editJson(folder, 'contract.json', (value) => {
        value.oracles[1].id = 'O-2';
        value.behaviors[1].oracles = ['O-2'];
      }),
  },
  {
    name: 'an off-pattern mutation ID',
    file: 'mutations/M-001.mutation.json',
    rule: 'id-pattern',
    plant: (folder) => editJson(folder, 'mutations/M-001.mutation.json', (value) => (value.mutationId = 'M-1')),
  },
  {
    name: 'a baseline/qualification/ reference whose digest does not match',
    file: 'baseline/probes/P-001.probe.json',
    rule: 'qualification-digest',
    plant: (folder) => editJson(folder, 'baseline/qualification/P-001.baseline-pass.json', (value) => (value.exitCode = 1)),
  },
  {
    name: 'a clean control that is not zero-action',
    file: 'probes/P-001.probe.json',
    rule: 'clean-control',
    plant: (folder) => editJson(folder, 'probes/P-001.probe.json', (value) => (value.probeClass = 'defect')),
  },
  {
    name: 'a clean-control route with expectedClean false',
    file: 'probes/P-001.probe.json',
    rule: 'clean-control',
    plant: (folder) => editJson(folder, 'probes/P-001.probe.json', (value) => (value.expectedClean = false)),
  },
  {
    name: 'a defect signature exitCode == 3 against a registry entry declaring 3 to 6 as infrastructure codes',
    file: 'probes/P-002.probe.json',
    rule: 'infrastructure-exit-code',
    plant: (folder) => {
      setInfrastructureCodes(folder, [3, 4, 5, 6]);
      setSignature(folder, exitEquals(3));
    },
    expect: (output) => [[output.includes('exits 3, which'), 'the finding does not name exactly the satisfying code 3']],
  },
  {
    name: 'a defect signature naming an executable no registry entry declares',
    file: 'probes/P-002.probe.json',
    rule: 'unregistered-executable',
    plant: (folder) =>
      editJson(folder, 'probes/P-002.probe.json', (value) => (value.defectSignature.invocation.executable = 'tea-other-runner')),
  },
  {
    name: 'a registry that repeats an interface and executable pair',
    file: 'evaluation.json',
    rule: 'registry',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => value.registry.push({ ...value.registry[0] })),
  },
  {
    name: 'a mutation targetArtifact outside the skill root',
    file: 'mutations/M-001.mutation.json',
    rule: 'skill-root',
    plant: (folder) =>
      editJson(folder, 'mutations/M-001.mutation.json', (value) => (value.targetArtifact = 'docs/step-04-generate-tests.md')),
  },
  {
    name: 'a mutation targetArtifact in a sibling directory that shares the skill root as a name prefix',
    file: 'mutations/M-001.mutation.json',
    rule: 'skill-root',
    plant: (folder) =>
      editJson(folder, 'mutations/M-001.mutation.json', (value) => (value.targetArtifact = 'skill-extras/step-04-generate-tests.md')),
  },
  {
    name: 'a mutation targetArtifact that climbs out of the skill root after entering it',
    file: 'mutations/M-001.mutation.json',
    rule: 'skill-root',
    plant: (folder) =>
      editJson(folder, 'mutations/M-001.mutation.json', (value) => (value.targetArtifact = 'skill/../docs/step-04-generate-tests.md')),
  },
  {
    name: 'a skill evaluation whose launch declares no skillRoot',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => delete value.launch.skillRoot),
    expect: (output) => [[output.includes("required property 'skillRoot'"), 'the finding does not name the missing skillRoot']],
  },
  {
    name: 'a launch with no root',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => delete value.launch.root),
    expect: (output) => [[output.includes("required property 'root'"), 'the finding does not name the missing root']],
  },
  {
    name: 'an absolute launch root',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.launch.root = '/srv/project')),
    expect: (output) => [[output.includes('/launch/root'), 'the finding does not name /launch/root']],
  },
  {
    name: 'a skill root that climbs out of the launch root',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.launch.skillRoot = '../skill')),
    expect: (output) => [[output.includes('/launch/skillRoot'), 'the finding does not name /launch/skillRoot']],
  },
];

const STORY_RULES = [
  'stale-index',
  'schema-version',
  'runtime-owned-field',
  'mutation-operator',
  'provisioned-target',
  'web-interface',
  'written-file-signature',
  'oracle-count',
  'id-pattern',
  'qualification-digest',
  'clean-control',
  'infrastructure-exit-code',
  'unregistered-executable',
  'registry',
  'skill-root',
];

/** A file outside the evaluation folder, for the symbolic-link cases to point at. */
function outsideFile(bytes) {
  const file = path.join(tempDir('outside'), 'outside.json');
  fs.writeFileSync(file, bytes);
  return file;
}

/**
 * Folder shapes the final review found crashing or passing: symbolic links and
 * files where the index or the baseline expects a directory, duplicate IDs,
 * paths that name the whole target, and a manifest that is not an object. Each
 * must be an authoring finding (exit 10), never a crash or a pass.
 */
const HARDENING_CASES = [
  {
    name: 'a qualification with no route',
    file: 'probes/P-002.probe.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'probes/P-002.probe.json', (value) => delete value.qualification.route),
    expect: (output) => [
      [output.includes('route'), 'the finding does not name the missing route'],
      [
        !/fixCommit|degenerateResponse|noKnownDefectStatement|indicts/.test(output),
        'every route branch applied, burying the missing route',
      ],
    ],
  },
  {
    name: 'a symbolic link as the corpus/ root',
    file: 'corpus',
    rule: 'corpus-file',
    redigest: false,
    digestExit: 10,
    plant: (folder) => {
      const outside = path.join(tempDir('outside-root'), 'corpus');
      fs.cpSync(path.join(folder, 'corpus'), outside, { recursive: true });
      fs.rmSync(path.join(folder, 'corpus'), { recursive: true });
      fs.symlinkSync(outside, path.join(folder, 'corpus'), 'dir');
    },
  },
  {
    name: 'a regular file as the mutations/ root',
    file: 'mutations',
    rule: 'corpus-file',
    redigest: false,
    digestExit: 10,
    plant: (folder) => {
      fs.rmSync(path.join(folder, 'mutations'), { recursive: true });
      fs.writeFileSync(path.join(folder, 'mutations'), 'not a directory\n');
    },
  },
  {
    name: 'a directory where corpus-index.json belongs',
    file: 'corpus-index.json',
    rule: 'stale-index',
    redigest: false,
    digestExit: 10,
    digestNames: 'corpus-index.json: [corpus-file]',
    plant: (folder) => {
      fs.rmSync(path.join(folder, 'corpus-index.json'));
      fs.mkdirSync(path.join(folder, 'corpus-index.json'));
    },
  },
  {
    name: 'a symbolic link loop under baseline/',
    file: 'baseline/loop',
    rule: 'baseline-file',
    plant: (folder) => fs.symlinkSync(path.join(folder, 'baseline'), path.join(folder, 'baseline', 'loop'), 'dir'),
  },
  {
    name: 'a qualification reference that is a symbolic link to an outside file with the same bytes',
    file: 'baseline/probes/P-001.probe.json',
    rule: 'qualification-digest',
    plant: (folder) => {
      const evidence = path.join(folder, 'baseline', 'qualification', 'P-001.baseline-pass.json');
      const outside = outsideFile(fs.readFileSync(evidence));
      fs.rmSync(evidence);
      fs.symlinkSync(outside, evidence);
    },
  },
  {
    name: 'a qualification directory that is a symbolic link out of the folder',
    file: 'baseline/probes/P-001.probe.json',
    rule: 'qualification-digest',
    plant: (folder) => {
      const directory = path.join(folder, 'baseline', 'qualification');
      const outside = path.join(tempDir('outside-qualification'), 'qualification');
      fs.cpSync(directory, outside, { recursive: true });
      fs.rmSync(directory, { recursive: true });
      fs.symlinkSync(outside, directory, 'dir');
    },
  },
  {
    name: 'a duplicate behavior ID',
    file: 'contract.json',
    rule: 'duplicate-id',
    plant: (folder) => editJson(folder, 'contract.json', (value) => (value.behaviors[1].id = value.behaviors[0].id)),
  },
  {
    name: 'a duplicate oracle ID',
    file: 'contract.json',
    rule: 'duplicate-id',
    plant: (folder) => editJson(folder, 'contract.json', (value) => (value.oracles[1].id = value.oracles[0].id)),
  },
  {
    name: 'a duplicate defect ID within a probe',
    file: 'probes/P-002.probe.json',
    rule: 'duplicate-id',
    plant: (folder) => editJson(folder, 'probes/P-002.probe.json', (value) => value.defects.push({ ...value.defects[0] })),
  },
  {
    name: 'a controlled-mutation probe with no scoring policy',
    file: 'policy/scoring-policy.json',
    rule: 'missing-file',
    plant: (folder) => fs.rmSync(path.join(folder, 'policy', 'scoring-policy.json')),
    expect: (output) => [[output.includes('reExecutionCap'), 'the finding does not say why the policy is needed']],
  },
  {
    name: 'a scoring policy with no reExecutionCap',
    file: 'policy/scoring-policy.json',
    rule: 'engine-schema',
    plant: (folder) => editJson(folder, 'policy/scoring-policy.json', (value) => delete value.reExecutionCap),
  },
  {
    name: 'a scoring policy stamped with a version the engine does not read',
    file: 'policy/scoring-policy.json',
    rule: 'engine-schema',
    plant: (folder) => editJson(folder, 'policy/scoring-policy.json', (value) => (value.schemaVersion += 1)),
    expect: (output) => [[output.includes('"schemaVersion"'), 'the finding does not name the stamp']],
  },
  {
    name: 'trials below the scoring policy minimumTrialCount',
    file: 'evaluation.json',
    rule: 'trials',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.trials = 2)),
    expect: (output) => [[output.includes('minimumTrialCount 3'), 'the finding does not name the minimum']],
  },
  {
    name: 'a controlled-mutation probe with no mutated arm declared',
    file: 'evaluation.json',
    rule: 'arms',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.arms = ['clean'])),
    expect: (output) => [[output.includes('controlled-mutation'), 'the finding does not name the route']],
  },
  {
    name: 'a clean control with no clean arm declared',
    file: 'evaluation.json',
    rule: 'arms',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.arms = ['mutated'])),
    expect: (output) => [[output.includes('clean-control'), 'the finding does not name the route']],
  },
  {
    name: 'an arm declared with no probe to run on it',
    file: 'evaluation.json',
    rule: 'arms',
    plant: (folder) => fs.rmSync(path.join(folder, 'probes', 'P-002.probe.json')),
    expect: (output) => [[output.includes('arms declares mutated'), 'the finding does not name the unused arm']],
  },
  {
    name: 'an arm declared for the historical route with no historical probe',
    file: 'evaluation.json',
    rule: 'arms',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => value.arms.push('historical')),
    expect: (output) => [
      [output.includes('arms declares historical, and no probe takes the historical route'), 'the finding does not name the unused arm'],
    ],
  },
  {
    name: 'a gameability probe with no gameability arm declared',
    file: 'evaluation.json',
    rule: 'arms',
    plant: (folder) => {
      plantGameability(folder);
      editJson(folder, 'evaluation.json', (value) => (value.arms = ['clean', 'mutated']));
    },
    expect: (output) => [[output.includes('takes the gameability route'), 'the finding does not name the route']],
  },
  {
    name: 'a defect-class probe on the gameability route',
    file: 'probes/P-003.probe.json',
    rule: 'gameability',
    plant: (folder) => plantGameability(folder, { probe: (probe) => (probe.probeClass = 'defect') }),
  },
  {
    name: 'a gameability probe that seeds a defect',
    file: 'probes/P-003.probe.json',
    rule: 'gameability',
    plant: (folder) =>
      plantGameability(folder, {
        probe: (probe) => {
          const seeded = JSON.parse(fs.readFileSync(path.join(folder, 'probes', 'P-002.probe.json'), 'utf8'));
          probe.defects = seeded.defects;
        },
      }),
  },
  {
    name: "a gameability probe whose naive oracle is its own behavior's",
    file: 'probes/P-003.probe.json',
    rule: 'gameability',
    plant: (folder) => plantGameability(folder, { probe: (probe) => (probe.qualification.naiveOracle = 'O-001') }),
    expect: (output) => [[output.includes('belongs to another behavior'), 'the finding does not say where the naive oracle belongs']],
  },
  {
    name: 'a gameability probe whose naive oracle the contract does not declare',
    file: 'probes/P-003.probe.json',
    rule: 'reference',
    plant: (folder) => plantGameability(folder, { probe: (probe) => (probe.qualification.naiveOracle = 'O-009') }),
  },
  {
    name: 'a gameability probe whose naive oracle is off the oracle ID pattern',
    file: 'probes/P-003.probe.json',
    rule: 'schema',
    plant: (folder) => plantGameability(folder, { probe: (probe) => (probe.qualification.naiveOracle = 'naive') }),
  },
  {
    name: 'a gameability probe with no naive oracle',
    file: 'probes/P-003.probe.json',
    rule: 'schema',
    plant: (folder) => plantGameability(folder, { probe: (probe) => delete probe.qualification.naiveOracle }),
  },
  {
    name: 'a gameability probe with no degenerate response file',
    file: 'corpus/gameability/P-003.json',
    rule: 'gameability',
    plant: (folder) => plantGameability(folder, { response: null }),
    expect: (output) => [[output.includes('is absent'), 'the finding does not say the file is absent']],
  },
  {
    name: 'a degenerate response off its schema',
    file: 'corpus/gameability/P-003.json',
    rule: 'schema',
    plant: (folder) => plantGameability(folder, { response: (response) => (response.steps['tea-atdd-runner-run'].exitCode = '1') }),
  },
  {
    name: 'a degenerate response that leaves a plan step unanswered and answers another',
    file: 'corpus/gameability/P-003.json',
    rule: 'gameability',
    plant: (folder) =>
      plantGameability(folder, {
        response: (response) => {
          response.steps = { 'another-step': response.steps['tea-atdd-runner-run'] };
        },
      }),
    expect: (output) => [
      [output.includes('answers no response for interaction plan step tea-atdd-runner-run'), 'the unanswered step is not named'],
      [output.includes('answers step another-step'), 'the undeclared step is not named'],
    ],
  },
  {
    name: 'a degenerate response that exits an infrastructure code',
    file: 'corpus/gameability/P-003.json',
    rule: 'gameability',
    plant: (folder) => plantGameability(folder, { response: (response) => (response.steps['tea-atdd-runner-run'].exitCode = 3) }),
    expect: (output) => [[output.includes('infrastructure exit code'), 'the finding does not name the infrastructure code']],
  },
  {
    name: 'a historical probe whose defect is a controlled mutation',
    file: 'probes/P-002.probe.json',
    rule: 'historical',
    plant: (folder) => {
      editJson(folder, 'probes/P-002.probe.json', (value) => (value.qualification = { route: 'historical', fixCommit: 'a1b2c3d' }));
      editJson(folder, 'evaluation.json', (value) => (value.arms = ['clean', 'historical']));
    },
    expect: (output) => [[output.includes('1 not natural'), 'the finding does not count the defect that is not natural']],
  },
  {
    name: 'a historical probe that is expected clean',
    file: 'probes/P-002.probe.json',
    rule: 'historical',
    plant: (folder) => {
      editJson(folder, 'probes/P-002.probe.json', (value) => {
        value.qualification = { route: 'historical', fixCommit: 'a1b2c3d' };
        value.defects[0].source = 'natural';
        value.expectedClean = true;
      });
      editJson(folder, 'evaluation.json', (value) => (value.arms = ['clean', 'historical']));
    },
    expect: (output) => [[output.includes('got expectedClean true'), 'the finding does not name expectedClean']],
  },
  {
    name: 'a historical probe that seeds no defect',
    file: 'probes/P-002.probe.json',
    rule: 'historical',
    plant: (folder) => {
      editJson(folder, 'probes/P-002.probe.json', (value) => {
        value.qualification = { route: 'historical', fixCommit: 'a1b2c3d' };
        value.defects = [];
      });
      editJson(folder, 'evaluation.json', (value) => (value.arms = ['clean', 'historical']));
    },
    expect: (output) => [[output.includes('0 defect(s)'), 'the finding does not count the defects']],
  },
  {
    name: 'a historical probe naming neither a fix commit nor deployments',
    file: 'probes/P-002.probe.json',
    rule: 'historical',
    plant: (folder) => plantHistorical(folder, {}),
    expect: (output) => [[output.includes('names its fix boundary'), 'the finding does not ask for a fix boundary']],
  },
  {
    name: 'a deployment-routed probe naming neither deployment',
    file: 'probes/P-002.probe.json',
    rule: 'historical',
    plant: (folder) => plantHistorical(folder, { deployments: {} }),
    expect: (output) => [
      [output.includes('names deployments and neither a preFix nor a fix deployment'), 'the finding does not name the empty pair'],
    ],
  },
  {
    name: 'a deployment-routed probe naming one deployment but not the other',
    file: 'probes/P-002.probe.json',
    rule: 'historical',
    plant: (folder) => plantHistorical(folder, { deployments: { preFix: DEPLOYMENTS.preFix } }),
    expect: (output) => [
      [output.includes('names the preFix deployment and no fix deployment'), 'the finding does not name the missing deployment'],
    ],
  },
  {
    name: 'a deployment-routed probe naming both deployments and a fix commit',
    file: 'probes/P-002.probe.json',
    rule: 'historical',
    plant: (folder) => plantHistorical(folder, { fixCommit: 'a1b2c3d', deployments: DEPLOYMENTS }),
    expect: (output) => [[output.includes('names both a fixCommit and deployments'), 'the finding does not name both boundaries']],
  },
  {
    name: 'a deployment-routed probe naming one release for both deployments',
    file: 'probes/P-002.probe.json',
    rule: 'historical',
    plant: (folder) =>
      plantHistorical(folder, {
        deployments: { preFix: DEPLOYMENTS.preFix, fix: { ...DEPLOYMENTS.fix, release: DEPLOYMENTS.preFix.release } },
      }),
    expect: (output) => [[output.includes('for both deployments'), 'the finding does not name the shared release']],
  },
  {
    name: 'a deployment-routed probe whose post-fix origin is its pre-fix origin spelled otherwise',
    file: 'probes/P-002.probe.json',
    rule: 'historical',
    copy: copyApi,
    plant: (folder) =>
      plantApiHistorical(folder, {
        preFix: DEPLOYMENTS.preFix,
        fix: { ...DEPLOYMENTS.fix, origins: { grader: 'HTTP://127.0.0.1:41001/' } },
      }),
    expect: (output, stdout) => [
      [
        output.includes('deployments.preFix.origins.grader and deployments.fix.origins.grader both reach http://127.0.0.1:41001'),
        'the finding does not name the shared origin',
      ],
      [findingsOf(stdout).length === 1, 'the shared origin is not the only finding'],
    ],
  },
  {
    name: 'a deployment-routed probe whose post-fix origin is its pre-fix address written as IPv4-mapped IPv6',
    file: 'probes/P-002.probe.json',
    rule: 'historical',
    copy: copyApi,
    plant: (folder) =>
      plantApiHistorical(folder, {
        preFix: DEPLOYMENTS.preFix,
        fix: { ...DEPLOYMENTS.fix, origins: { grader: 'http://[::ffff:7f00:1]:41001' } },
      }),
    expect: (output, stdout) => [
      [
        output.includes('deployments.preFix.origins.grader and deployments.fix.origins.grader both reach http://127.0.0.1:41001'),
        'the finding does not name the address the two spellings share',
      ],
      [findingsOf(stdout).length === 1, 'the shared address is not the only finding'],
    ],
  },
  {
    name: 'a deployment-routed probe whose pre-fix origin of one interface is the post-fix origin of another',
    file: 'probes/P-002.probe.json',
    rule: 'historical',
    copy: copyApi,
    plant: (folder) =>
      plantApiHistorical(folder, {
        preFix: {
          ...DEPLOYMENTS.preFix,
          reports: { grader: REPORT, admin: reportOf('admin') },
          origins: { grader: 'http://127.0.0.1:41001', admin: 'http://127.0.0.1:41003' },
        },
        fix: {
          ...DEPLOYMENTS.fix,
          reports: { grader: REPORT, admin: reportOf('admin') },
          origins: { grader: 'http://127.0.0.1:41002', admin: 'http://127.0.0.1:41001' },
        },
      }),
    expect: (output, stdout) => [
      [
        output.includes('deployments.preFix.origins.grader and deployments.fix.origins.admin both reach http://127.0.0.1:41001'),
        'the finding does not name the origin the two interfaces share',
      ],
      [findingsOf(stdout).length === 1, 'the shared origin is not the only finding'],
    ],
  },
  {
    name: 'a deployment-routed probe whose report names an operation the contract does not declare',
    file: 'probes/P-002.probe.json',
    rule: 'historical',
    copy: copyApi,
    plant: (folder) =>
      plantApiHistorical(folder, {
        preFix: { ...DEPLOYMENTS.preFix, reports: { grader: { ...REPORT, operationId: 'report-version' } } },
        fix: DEPLOYMENTS.fix,
      }),
    expect: (output, stdout) => [
      [
        output.includes(
          'deployments.preFix.reports.grader.operationId names "report-version", which interface "grader" of the contract does not declare',
        ),
        'the finding does not name the undeclared operation',
      ],
      [findingsOf(stdout).length === 1, 'the undeclared operation is not the only finding'],
    ],
  },
  {
    name: 'a deployment-routed probe whose report pointer names no JSON pointer (no leading slash)',
    file: 'probes/P-002.probe.json',
    rule: 'historical',
    copy: copyApi,
    plant: (folder) =>
      plantApiHistorical(folder, {
        preFix: DEPLOYMENTS.preFix,
        fix: { ...DEPLOYMENTS.fix, reports: { grader: { ...REPORT, pointer: 'release' } } },
      }),
    expect: (output, stdout) => [
      [
        output.includes('deployments.fix.reports.grader.pointer is "release", which is no JSON pointer'),
        'the finding does not name the pointer',
      ],
      [findingsOf(stdout).length === 1, 'the pointer is not the only finding'],
    ],
  },
  {
    name: 'a deployment-routed probe whose report pointer holds an unescaped tilde',
    file: 'probes/P-002.probe.json',
    rule: 'historical',
    copy: copyApi,
    plant: (folder) =>
      plantApiHistorical(folder, {
        preFix: { ...DEPLOYMENTS.preFix, reports: { grader: { ...REPORT, pointer: '/a/~2' } } },
        fix: DEPLOYMENTS.fix,
      }),
    expect: (output, stdout) => [
      [
        output.includes('deployments.preFix.reports.grader.pointer is "/a/~2", which is no JSON pointer'),
        'the finding does not name the pointer',
      ],
      [findingsOf(stdout).length === 1, 'the pointer is not the only finding'],
    ],
  },
  {
    name: 'a deployment-routed probe whose report names an operation that requires an input',
    file: 'probes/P-002.probe.json',
    rule: 'historical',
    copy: copyApi,
    plant: (folder) =>
      plantApiHistorical(folder, {
        preFix: DEPLOYMENTS.preFix,
        fix: { ...DEPLOYMENTS.fix, reports: { grader: { ...REPORT, operationId: 'grade-answer' } } },
      }),
    expect: (output, stdout) => [
      [
        output.includes('deployments.fix.reports.grader.operationId names "grade-answer", which requires input in its query channel'),
        'the finding does not name the required input',
      ],
      [findingsOf(stdout).length === 1, 'the required input is not the only finding'],
    ],
  },
  {
    name: 'a deployment-routed probe whose report names an operation with a path parameter',
    file: 'probes/P-002.probe.json',
    rule: 'historical',
    copy: copyApi,
    plant: (folder) => {
      plantApiHistorical(folder, DEPLOYMENTS);
      editJson(folder, 'contract.json', (value) => {
        const report = value.permittedInterfaces[0].operations.find((operation) => operation.operationId === 'report-release');
        report.pathTemplate = '/release/{build}';
      });
    },
    expect: (output, stdout) => [
      [output.includes('has the path parameter in "/release/{build}"'), 'the finding does not name the path parameter'],
      [findingsOf(stdout).length === 2, 'the path parameter is not the only finding, once for each deployment'],
    ],
  },
  {
    name: 'a deployment-routed probe whose reports name an interface the registry does not serve over HTTP',
    file: 'probes/P-002.probe.json',
    rule: 'historical',
    copy: copyApi,
    plant: (folder) => {
      plantApiHistorical(folder, DEPLOYMENTS);
      editJson(folder, 'contract.json', (value) => {
        const [grader] = value.permittedInterfaces;
        const other = structuredClone(grader);
        other.logicalId = 'status';
        other.operations = [
          {
            ...grader.operations.find((operation) => operation.operationId === 'report-release'),
            operationId: 'report-status',
            pathTemplate: '/status/release',
          },
        ];
        value.permittedInterfaces.push(other);
      });
      editJson(folder, 'evaluation.json', (value) => (value.operationPhases.status = { 'report-status': 'outcome' }));
      // The interface the contract declares and the registry lacks, named by the post-fix deployment's second report.
      editJson(
        folder,
        'probes/P-002.probe.json',
        (value) => (value.qualification.deployments.fix.reports.status = { operationId: 'report-status', pointer: '/release' }),
      );
    },
    expect: (output, stdout) => [
      [
        output.includes('deployments.fix.reports.status names an interface the registry does not serve over HTTP'),
        'the finding does not name the interface the registry does not serve over HTTP',
      ],
      [findingsOf(stdout).length === 1, 'the unserved interface is not the only finding'],
    ],
  },
  {
    name: 'a deployment-routed probe whose reports leave an HTTP interface of the registry without one',
    file: 'probes/P-002.probe.json',
    rule: 'historical',
    copy: copyApi,
    plant: (folder) => {
      plantApiHistorical(folder, TWO_INTERFACE_DEPLOYMENTS);
      editJson(folder, 'probes/P-002.probe.json', (value) => delete value.qualification.deployments.fix.reports.ledger);
    },
    expect: (output, stdout) => [
      [
        output.includes('deployments.fix.reports names ["grader"] and no report for "ledger"'),
        'the finding does not name the interface left without a report',
      ],
      [findingsOf(stdout).length === 1, 'the missing report is not the only finding'],
    ],
  },
  {
    name: 'a deployment-routed probe whose pre-fix reports leave the first HTTP interface of the registry without one',
    file: 'probes/P-002.probe.json',
    rule: 'historical',
    copy: copyApi,
    plant: (folder) => {
      plantApiHistorical(folder, TWO_INTERFACE_DEPLOYMENTS);
      editJson(folder, 'probes/P-002.probe.json', (value) => delete value.qualification.deployments.preFix.reports.grader);
    },
    expect: (output, stdout) => [
      [
        output.includes('deployments.preFix.reports names ["ledger"] and no report for "grader"'),
        'the finding does not name the interface left without a report',
      ],
      [findingsOf(stdout).length === 1, 'the missing report is not the only finding'],
    ],
  },
  {
    name: 'a deployment-routed probe whose report for the second interface names the operation of the first',
    file: 'probes/P-002.probe.json',
    rule: 'historical',
    copy: copyApi,
    plant: (folder) => {
      plantApiHistorical(folder, TWO_INTERFACE_DEPLOYMENTS);
      editJson(folder, 'probes/P-002.probe.json', (value) => (value.qualification.deployments.preFix.reports.ledger = { ...REPORT }));
    },
    expect: (output, stdout) => [
      [
        output.includes(
          'deployments.preFix.reports.ledger.operationId names "report-release", which interface "ledger" of the contract does not declare',
        ),
        'the finding does not name the interface the operation is looked up in',
      ],
      [findingsOf(stdout).length === 1, 'the operation of another interface is not the only finding'],
    ],
  },
  {
    name: 'a deployment-routed probe whose report names an operation the contract marks as changing state',
    file: 'probes/P-002.probe.json',
    rule: 'historical',
    copy: copyApi,
    plant: (folder) => {
      plantApiHistorical(folder, DEPLOYMENTS);
      editJson(folder, 'contract.json', (value) => {
        const report = value.permittedInterfaces[0].operations.find((operation) => operation.operationId === 'report-release');
        report.stateChangeMarker = true;
      });
    },
    expect: (output, stdout) => [
      [output.includes('which the contract marks as changing state'), 'the finding does not name the state change'],
      [findingsOf(stdout).length === 2, 'the state change is not the only finding, once for each deployment'],
    ],
  },
  {
    name: 'a deployment-routed probe whose report names an operation only a cli interface declares',
    file: 'probes/P-002.probe.json',
    rule: 'historical',
    copy: copyApi,
    plant: (folder) => {
      plantApiHistorical(folder, DEPLOYMENTS);
      editJson(folder, 'contract.json', (value) => {
        const [grader] = value.permittedInterfaces;
        const report = grader.operations.find((operation) => operation.operationId === 'report-release');
        grader.operations = grader.operations.filter((operation) => operation !== report);
        const cli = structuredClone(grader);
        cli.logicalId = 'runner';
        cli.kind = 'cli';
        cli.operations = [report];
        value.permittedInterfaces.push(cli);
      });
    },
    expect: (output, stdout) => [
      [
        output.includes('which interface "grader" of the contract does not declare'),
        'the finding does not name the interface the operation is looked up in',
      ],
      [
        // The planted cli interface is no valid contract, so engine-schema findings come with it; the historical ones are the
        // probe's own, one for each deployment, each naming the interface the report is keyed by.
        historicalFindingsOf(stdout).length === 2 &&
          historicalFindingsOf(stdout).every((line) => line.includes('which interface "grader" of the contract does not declare')),
        'the keyed interface is not the only historical finding, once for each deployment',
      ],
    ],
  },
  {
    name: 'a deployment-routed probe whose report names extra fields and an empty operation',
    file: 'probes/P-002.probe.json',
    rule: 'schema',
    copy: copyApi,
    plant: (folder) => {
      plantApiHistorical(folder, DEPLOYMENTS);
      editJson(folder, 'probes/P-002.probe.json', (value) => {
        value.qualification.deployments.preFix.reports.grader = { operationId: '', pointer: '/release', extra: 1 };
      });
    },
    expect: (output) => [
      [output.includes('must NOT have additional properties'), 'the finding does not refuse the extra field'],
      [output.includes('must NOT have fewer than 1 characters'), 'the finding does not refuse the empty operationId'],
    ],
  },
  {
    name: 'a deployment-routed probe whose second report lacks its pointer',
    file: 'probes/P-002.probe.json',
    rule: 'schema',
    copy: copyApi,
    plant: (folder) => {
      plantApiHistorical(folder, TWO_INTERFACE_DEPLOYMENTS);
      editJson(folder, 'probes/P-002.probe.json', (value) => delete value.qualification.deployments.fix.reports.ledger.pointer);
    },
    expect: (output) => [[output.includes("must have required property 'pointer'"), 'the finding does not name the missing pointer']],
  },
  {
    name: 'a deployment-routed probe whose deployment names no reports',
    file: 'probes/P-002.probe.json',
    rule: 'schema',
    copy: copyApi,
    plant: (folder) => {
      plantApiHistorical(folder, DEPLOYMENTS);
      editJson(folder, 'probes/P-002.probe.json', (value) => delete value.qualification.deployments.preFix.reports);
    },
    expect: (output) => [[output.includes("must have required property 'reports'"), 'the finding does not name the missing reports']],
  },
  {
    name: 'a deployment-routed probe whose deployment names an empty map of reports',
    file: 'probes/P-002.probe.json',
    rule: 'schema',
    copy: copyApi,
    plant: (folder) => {
      plantApiHistorical(folder, DEPLOYMENTS);
      editJson(folder, 'probes/P-002.probe.json', (value) => (value.qualification.deployments.fix.reports = {}));
    },
    expect: (output) => [[output.includes('must NOT have fewer than 1 properties'), 'the finding does not refuse the empty map']],
  },
  {
    name: 'a deployment-routed probe whose deployment still names the single report of earlier releases',
    file: 'probes/P-002.probe.json',
    rule: 'schema',
    copy: copyApi,
    plant: (folder) => {
      plantApiHistorical(folder, DEPLOYMENTS);
      editJson(folder, 'probes/P-002.probe.json', (value) => {
        const { preFix } = value.qualification.deployments;
        preFix.report = preFix.reports.grader;
      });
    },
    expect: (output) => [[output.includes('must NOT have additional properties'), 'the finding does not refuse the old field']],
  },
  {
    name: 'a deployment-routed probe beside a command registry entry',
    file: 'probes/P-002.probe.json',
    rule: 'historical',
    plant: (folder) => plantHistorical(folder, { deployments: DEPLOYMENTS }),
    expect: (output) => [
      [output.includes('reaches over HTTP alone'), 'the finding does not name the command entry'],
      [output.includes('deployments.preFix.origins names'), 'the finding does not hold the origins to the HTTP interfaces'],
    ],
  },
  {
    name: 'a historical probe whose fix commit is a ref name',
    file: 'probes/P-002.probe.json',
    rule: 'schema',
    plant: (folder) => {
      editJson(folder, 'probes/P-002.probe.json', (value) => {
        value.qualification = { route: 'historical', fixCommit: 'main' };
        value.defects[0].source = 'natural';
      });
      editJson(folder, 'evaluation.json', (value) => (value.arms = ['clean', 'historical']));
    },
  },
  {
    name: 'a gameability probe that is expected clean',
    file: 'probes/P-003.probe.json',
    rule: 'gameability',
    plant: (folder) => plantGameability(folder, { probe: (probe) => (probe.expectedClean = true) }),
    expect: (output) => [[output.includes('expectedClean true'), 'the finding does not name expectedClean']],
  },
  {
    name: 'a gameability probe with no scoring policy',
    file: 'policy/scoring-policy.json',
    rule: 'missing-file',
    plant: (folder) => {
      plantGameability(folder);
      fs.rmSync(path.join(folder, 'probes', 'P-002.probe.json'));
      fs.rmSync(path.join(folder, 'mutations'), { recursive: true });
      editJson(folder, 'evaluation.json', (value) => (value.arms = ['clean', 'gameability']));
      fs.rmSync(path.join(folder, 'policy', 'scoring-policy.json'));
    },
    expect: (output) => [[output.includes('gameability route'), 'the finding does not name the gameability route']],
  },
  {
    name: 'a historical probe with no scoring policy',
    file: 'policy/scoring-policy.json',
    rule: 'missing-file',
    plant: (folder) => {
      editJson(folder, 'probes/P-002.probe.json', (value) => {
        value.qualification = { route: 'historical', fixCommit: 'a1b2c3d' };
        value.defects[0].source = 'natural';
      });
      editJson(folder, 'evaluation.json', (value) => (value.arms = ['clean', 'historical']));
      fs.rmSync(path.join(folder, 'mutations'), { recursive: true });
      fs.rmSync(path.join(folder, 'policy', 'scoring-policy.json'));
    },
    expect: (output) => [[output.includes('regexMatchStepBudget'), 'the finding does not say why the policy is needed']],
  },
  {
    name: 'a rubric with no judge declared',
    file: 'evaluation.json',
    rule: 'judge',
    plant: (folder) => plantRubric(folder, (planted) => (planted.judge = null)),
    expect: (output) => [[output.includes('declares no judge'), 'the finding does not say the judge is missing']],
  },
  {
    name: 'a rubric with no judge model in the evaluator conditions',
    file: 'policy/evaluator-conditions.json',
    rule: 'judge',
    plant: (folder) => plantRubric(folder, ({ conditions }) => delete conditions.judge),
    expect: (output) => [[output.includes('judge.modelSnapshot'), 'the finding does not name the snapshot']],
  },
  {
    name: 'a judge declared beside a contract with no rubric',
    file: 'evaluation.json',
    rule: 'judge',
    plant: (folder) =>
      editJson(folder, 'evaluation.json', (value) => (value.judge = { agent: 'custom', agentCommand: 'stub-judge', timeoutMs: 60_000 })),
    expect: (output) => [[output.includes('declares no rubric'), 'the finding does not say the contract declares no rubric']],
  },
  {
    name: 'a judge model in the evaluator conditions beside a contract with no rubric',
    file: 'policy/evaluator-conditions.json',
    rule: 'judge',
    plant: (folder) =>
      fs.writeFileSync(
        path.join(folder, 'policy', 'evaluator-conditions.json'),
        JSON.stringify({
          schemaVersion: 1,
          modelSnapshot: 'none',
          systemPromptDigest: EMPTY_DIGEST,
          judge: { modelSnapshot: null },
        }),
      ),
    expect: (output) => [[output.includes('never used; remove it'), 'the finding does not say to remove the block']],
  },
  {
    name: 'a judge on an agent adapter TeA does not have',
    file: 'evaluation.json',
    rule: 'judge',
    plant: (folder) => plantRubric(folder, ({ judge }) => (judge.agent = 'no-such-agent')),
  },
  {
    name: 'a judge on an adapter that cannot run read-only',
    file: 'evaluation.json',
    rule: 'judge',
    plant: (folder) => plantRubric(folder, ({ judge }) => (judge.agent = 'agy')),
    expect: (output) => [[output.includes('runs read-only'), 'the finding does not say the judge runs read-only']],
  },
  {
    name: 'a judge on the custom adapter with no command',
    file: 'evaluation.json',
    rule: 'judge',
    plant: (folder) => plantRubric(folder, ({ judge }) => delete judge.agentCommand),
  },
  {
    name: 'a judge model on an adapter that takes none',
    file: 'evaluation.json',
    rule: 'judge',
    plant: (folder) => plantRubric(folder, ({ judge }) => (judge.model = 'a-model')),
    expect: (output) => [[output.includes('--model is not supported'), 'the finding does not say the adapter takes no model']],
  },
  {
    name: 'a judge with no timeout',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => plantRubric(folder, ({ judge }) => delete judge.timeoutMs),
  },
  {
    name: 'a controlled-mutation probe that seeds no defect',
    file: 'probes/P-002.probe.json',
    rule: 'mutation-route',
    plant: (folder) => editJson(folder, 'probes/P-002.probe.json', (value) => (value.defects = [])),
  },
  {
    name: 'a tea-skill-runner registry entry with no evaluator conditions',
    file: 'policy/evaluator-conditions.json',
    rule: 'evaluator-conditions',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.registry[0].target = 'tea-skill-runner')),
    expect: (output) => [[output.includes('which always runs an agent'), 'the finding does not say why the conditions are needed']],
  },
  {
    name: 'evaluator conditions naming no model with a system prompt digest other than the empty one',
    file: 'policy/evaluator-conditions.json',
    rule: 'evaluator-conditions',
    plant: (folder) =>
      fs.writeFileSync(
        path.join(folder, 'policy', 'evaluator-conditions.json'),
        JSON.stringify({ schemaVersion: 1, modelSnapshot: 'none', systemPromptDigest: `sha256:${'0'.repeat(64)}` }),
      ),
    expect: (output) => [[output.includes(EMPTY_DIGEST), 'the finding does not name the digest of the empty byte string']],
  },
  {
    name: 'a tea-skill-runner registry entry whose evaluator conditions say none',
    file: 'policy/evaluator-conditions.json',
    rule: 'evaluator-conditions',
    plant: (folder) => {
      editJson(folder, 'evaluation.json', (value) => (value.registry[0].target = 'tea-skill-runner'));
      fs.writeFileSync(
        path.join(folder, 'policy', 'evaluator-conditions.json'),
        JSON.stringify({ schemaVersion: 1, modelSnapshot: 'none', systemPromptDigest: EMPTY_DIGEST }),
      );
    },
    expect: (output) => [[output.includes('declares modelSnapshot none'), 'the finding does not name the none model']],
  },
  {
    name: 'evaluator conditions with no systemPromptDigest',
    file: 'policy/evaluator-conditions.json',
    rule: 'schema',
    plant: (folder) =>
      fs.writeFileSync(
        path.join(folder, 'policy', 'evaluator-conditions.json'),
        JSON.stringify({ schemaVersion: 1, modelSnapshot: 'a-model' }),
      ),
  },
  {
    name: 'a maxElapsedMs past the 2147483647 ms one timer holds',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.registry[0].maxElapsedMs = 2 ** 31)),
  },
  {
    name: 'a provisioned directory of "."',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.workspace.provision = ['.'])),
  },
  {
    name: 'a provisioned directory of "./"',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.workspace.provision = ['./'])),
  },
  {
    name: 'a targetArtifact with a drive letter',
    file: 'mutations/M-001.mutation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'mutations/M-001.mutation.json', (value) => (value.targetArtifact = 'C:/x')),
  },
  {
    name: 'a targetArtifact hiding a climb out of the folder after a newline',
    file: 'mutations/M-001.mutation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'mutations/M-001.mutation.json', (value) => (value.targetArtifact = 'skill\n/../../x')),
  },
  {
    name: 'a provisioned directory hiding a climb after a newline',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.workspace.provision = ['node_modules\n/..'])),
  },
  {
    name: 'an evaluation.json that is null',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => fs.writeFileSync(path.join(folder, 'evaluation.json'), 'null\n'),
    expect: (output) => [
      [output.includes('(root) must be object'), 'the finding does not say the root must be an object'],
      [!output.includes('[schema-version]'), 'a non-object manifest was told to upgrade TeA'],
    ],
  },
  {
    name: 'an evaluation.json that is an array',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => fs.writeFileSync(path.join(folder, 'evaluation.json'), '[]\n'),
    expect: (output) => [[!output.includes('[schema-version]'), 'a non-object manifest was told to upgrade TeA']],
  },
  {
    name: 'a defect signature any non-zero exit satisfies',
    file: 'probes/P-002.probe.json',
    rule: 'infrastructure-exit-code',
    plant: (folder) => {
      setInfrastructureCodes(folder, [3, 4, 5, 6]);
      setSignature(folder, { op: 'not', operands: [exitEquals(0)] });
    },
    expect: (output) => [[output.includes('exits 3, 4, 5, 6, which'), 'the finding does not name every satisfying code']],
  },
  {
    name: 'a defect signature whose stream clause holds on a silent failure',
    file: 'probes/P-002.probe.json',
    rule: 'infrastructure-exit-code',
    plant: (folder) =>
      setSignature(folder, {
        op: 'all',
        operands: [exitEquals(3), { op: 'existence', operands: [{ pointer: '/interactions/observed/stderr' }] }],
      }),
  },
  {
    name: 'a defect signature with no pointer that always holds',
    file: 'probes/P-002.probe.json',
    rule: 'infrastructure-exit-code',
    plant: (folder) => setSignature(folder, { op: 'equality', operands: [{ literal: 1 }, { literal: 1 }] }),
  },
  {
    name: 'a defect signature testing the exit code against a contract reference set',
    file: 'probes/P-002.probe.json',
    rule: 'infrastructure-exit-code',
    plant: (folder) => {
      editJson(folder, 'contract.json', (value) => {
        value.referenceSets = {
          'gate-failures': { keys: ['code'], members: [{ code: 3 }], commentary: 'The exit codes the gate reports a failure with.' },
        };
      });
      setSignature(folder, { op: 'set-membership', operands: [EXIT_CODE, { referenceSet: 'gate-failures' }] });
    },
    expect: (output) => [
      [output.includes('exits 3, which'), 'the finding does not name the code the reference set admits'],
      [!output.includes('[engine-schema]'), 'the planted contract is not valid, so the case proves nothing'],
    ],
  },
  {
    name: 'a defect signature the engine cannot resolve',
    file: 'probes/P-002.probe.json',
    rule: 'infrastructure-exit-code',
    plant: (folder) => setSignature(folder, { op: 'set-membership', operands: [EXIT_CODE, { referenceSet: 'undeclared-set' }] }),
    expect: (output) => [[output.includes('could not be resolved'), 'an unresolvable signature did not fail closed']],
  },
  {
    name: 'a manifestation witness any non-zero exit satisfies',
    file: 'probes/P-002.probe.json',
    rule: 'infrastructure-exit-code',
    plant: (folder) =>
      editJson(folder, 'probes/P-002.probe.json', (value) => {
        value.defects[0].manifestationWitness.relation = {
          op: 'not',
          operands: [{ op: 'equality', operands: [{ pointer: '/interactions/manifest-active-tests/exit-code' }, { literal: 0 }] }],
        };
      }),
    expect: (output) => [[output.includes('manifestationWitness.relation could hold'), 'the finding does not name the witness relation']],
  },
  {
    name: 'a defect signature whose call-input clause a failed run with the same inputs meets',
    file: 'probes/P-002.probe.json',
    rule: 'infrastructure-exit-code',
    plant: (folder) => {
      setInfrastructureCodes(folder, [3]);
      setSignature(folder, {
        op: 'all',
        operands: [
          { op: 'equality', operands: [{ pointer: '/interactions/observed/call-inputs/option/agent' }, { literal: 'claude' }] },
          { op: 'not', operands: [exitEquals(0)] },
        ],
      });
    },
  },
  {
    name: 'a manifestation witness reading its own declared inputs beside a non-zero exit',
    file: 'probes/P-002.probe.json',
    rule: 'infrastructure-exit-code',
    plant: (folder) =>
      editJson(folder, 'probes/P-002.probe.json', (value) => {
        value.defects[0].manifestationWitness.relation = {
          op: 'all',
          operands: [
            {
              op: 'equality',
              operands: [{ pointer: '/interactions/manifest-active-tests/call-inputs/option/agent' }, { literal: 'claude' }],
            },
            {
              op: 'not',
              operands: [{ op: 'equality', operands: [{ pointer: '/interactions/manifest-active-tests/exit-code' }, { literal: 0 }] }],
            },
          ],
        };
      }),
  },
  {
    name: 'a manifestation witness naming an interface no registry entry declares',
    file: 'probes/P-002.probe.json',
    rule: 'unregistered-executable',
    plant: (folder) =>
      editJson(folder, 'probes/P-002.probe.json', (value) => (value.defects[0].manifestationWitness.interfaceId = 'tea-other')),
  },
  {
    name: 'a registry entry with no infrastructureExitCodes',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => delete value.registry[0].infrastructureExitCodes),
    expect: (output) => [[output.includes('infrastructureExitCodes'), 'the finding does not name infrastructureExitCodes']],
  },
  {
    name: 'a registry entry permitting PATH',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => value.registry[0].environmentKeys.push('PATH')),
  },
  {
    name: 'a registry entry whose target hides a climb out of the project after a newline',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.registry[0].target = 'a\n/../../../etc/x')),
  },
  {
    name: 'a registry entry reading an absolute artifact path back',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.registry[0].artifacts.scaffold = '/etc/passwd')),
  },
  {
    name: 'a registry entry whose target climbs out of the project',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.registry[0].target = '../outside/runner.js')),
  },
  {
    name: 'a registry entry declaring a relative system path',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.registry[0].systemPaths = ['opt/verdict-rules'])),
    expect: (output) => [[output.includes('/registry/0/systemPaths/0'), 'the finding does not name the relative system path']],
  },
  {
    name: 'a registry entry declaring a system path no confinement profile can carry',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.registry[0].systemPaths = ['/opt/verdict"rules'])),
    expect: (output) => [[output.includes('/registry/0/systemPaths/0'), 'the finding does not name the quoted system path']],
  },
  {
    name: 'two entries starting one target with different system paths',
    file: 'evaluation.json',
    rule: 'registry',
    plant: (folder) =>
      editJson(folder, 'evaluation.json', (value) =>
        value.registry.push({ ...value.registry[0], executable: 'tea-atdd-report', systemPaths: ['/opt/verdict-rules'] }),
      ),
    expect: (output) => [[output.includes('with other systemPaths'), 'the finding does not name the differing system paths']],
  },
  ...UNPRINTABLE_PATH_CHARACTERS.flatMap(([label, character]) => [
    {
      name: `a registry target holding ${label}`,
      file: 'evaluation.json',
      rule: 'schema',
      plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.registry[0].target = `test/fix${character}tures/gate.js`)),
    },
    {
      name: `a registry artifact path holding ${label}`,
      file: 'evaluation.json',
      rule: 'schema',
      plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.registry[0].artifacts.scaffold = `tests/${character}x.ts`)),
    },
    {
      name: `a provisioned directory holding ${label}`,
      file: 'evaluation.json',
      rule: 'schema',
      plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.workspace.provision = [`node${character}_modules`])),
    },
    {
      name: `a targetArtifact holding ${label}`,
      file: 'mutations/M-001.mutation.json',
      rule: 'schema',
      plant: (folder) => editJson(folder, 'mutations/M-001.mutation.json', (value) => (value.targetArtifact = `skill/${character}x.md`)),
    },
  ]),
  {
    name: 'a registry target with a trailing slash',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.registry[0].target = 'test/fixtures/evaluate/')),
  },
  {
    name: 'a registry target with an empty segment',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) =>
      editJson(folder, 'evaluation.json', (value) => (value.registry[0].target = 'test//fixtures/evaluate/red-phase-gate.js')),
  },
  {
    name: 'a registry artifact path with a trailing slash',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.registry[0].artifacts.scaffold = 'tests/api/')),
  },
  {
    name: 'a targetArtifact with an empty segment',
    file: 'mutations/M-001.mutation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'mutations/M-001.mutation.json', (value) => (value.targetArtifact = 'skill//x.md')),
  },
  {
    name: 'a provisioned directory with an empty segment',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.workspace.provision = ['vendor//cache'])),
  },
  {
    name: 'a defect signature whose one clause compares a call input with a stream',
    file: 'probes/P-002.probe.json',
    rule: 'infrastructure-exit-code',
    plant: (folder) =>
      setSignature(folder, {
        op: 'all',
        operands: [
          {
            op: 'equality',
            operands: [{ pointer: '/interactions/observed/call-inputs/option/agent' }, { pointer: '/interactions/observed/stdout' }],
          },
          { op: 'not', operands: [exitEquals(0)] },
        ],
      }),
    expect: (output) => [
      [output.includes('could not be resolved'), 'a clause mixing call inputs with a stream did not fail closed'],
      [output.includes('together with other evidence'), 'the finding does not say a clause mixes call inputs with other evidence'],
    ],
  },
  {
    name: 'a defect signature whose stdout clause holds on a silent failure',
    file: 'probes/P-002.probe.json',
    rule: 'infrastructure-exit-code',
    plant: (folder) => {
      setInfrastructureCodes(folder, [3, 4, 5, 6]);
      setSignature(folder, {
        op: 'all',
        operands: [exitEquals(3), { op: 'existence', operands: [{ pointer: '/interactions/observed/stdout' }] }],
      });
    },
    expect: (output) => [[output.includes('exits 3, which'), 'the finding does not name the satisfying code 3']],
  },
  {
    name: 'a defect signature with nine call-input clauses',
    file: 'probes/P-002.probe.json',
    rule: 'infrastructure-exit-code',
    plant: (folder) => setSignature(folder, withOptionClauses(9, exitEquals(1))),
    expect: (output) => [
      [output.includes('could not be resolved'), 'nine call-input clauses did not fail closed'],
      [output.includes('too many clauses'), 'the finding does not say there are too many clauses'],
    ],
  },
];

/** The stub command evaluator Story 1.17's run cases use, copied into a folder's evaluator/. */
const COMMAND_STUB = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'evaluators', 'command', 'evaluator', 'rows.js');
/** The declaration of a command evaluator with no installed framework dependency (Story 1.44). */
const NO_FRAMEWORKS = { schemaVersion: 1, frameworks: [] };
/** A command evaluator's evaluation.json block. */
const COMMAND_EVALUATOR = { kind: 'command', command: 'evaluator/rows.js', timeoutMs: 60_000 };
/** A sealed-brief agent evaluator's evaluation.json block. */
const AGENT_EVALUATOR = { kind: 'sealed-brief-agent', agent: 'custom', agentCommand: 'stub-agent', timeoutMs: 60_000 };
/** The qualification a sealed-brief agent evaluator declares (Story 1.34). */
const AGENT_QUALIFICATION = { attempts: 2, minimumAgreement: 0.9 };
/** A rubric the evaluator scores itself, with no TeA judge (Story 1.17). */
const EVALUATOR_RUBRIC = {
  id: 'R-001',
  scaleLevels: [
    { level: 0, anchor: 'The scaffold holds an active test.' },
    { level: 1, anchor: 'Every test in the scaffold is skipped.' },
  ],
  failureModePenalties: [{ name: 'active-test', description: 'An active test counts as no scaffold.' }],
  maxLength: 200,
  criteria: [{ id: 'RC-001', text: 'Are the scaffold tests all skipped?', evidence: '/interactions/tea-atdd-runner-run/exit-code' }],
};

/**
 * Wires an evaluator into the valid fixture (Story 1.17): `evaluator` into
 * evaluation.json, `mapping` (unless null) as evaluator/mapping.json binding
 * both oracles by default, the stub executable for a command evaluator, and
 * `conditions` (unless null) as policy/evaluator-conditions.json; `rubric`
 * adds R-001 to the contract, bound as `skipped`. A sealed-brief agent
 * declares `evaluatorQualification` (Story 1.34) unless `qualification` is null.
 */
function plantEvaluator(folder, evaluator, { mapping, conditions = null, rubric = false, qualification = AGENT_QUALIFICATION } = {}) {
  const keys = { accepted: { oracleId: 'O-001', behaviorId: 'B-001' }, answered: { oracleId: 'O-002', behaviorId: 'B-002' } };
  if (rubric) keys.skipped = { rubricId: 'R-001', criterionId: 'RC-001', levels: [0, 1] };
  const planted = mapping === undefined ? { schemaVersion: 1, keys } : mapping;
  editJson(folder, 'evaluation.json', (value) => {
    value.evaluator = evaluator;
    if (evaluator.kind === 'sealed-brief-agent' && qualification !== null) value.evaluatorQualification = qualification;
  });
  if (rubric) {
    editJson(folder, 'contract.json', (value) => (value.rubrics = [EVALUATOR_RUBRIC]));
    plantCalibration(folder, EVALUATOR_RUBRIC);
  }
  if (planted !== null) {
    fs.mkdirSync(path.join(folder, 'evaluator'), { recursive: true });
    fs.writeFileSync(path.join(folder, 'evaluator', 'mapping.json'), `${JSON.stringify(planted, null, 2)}\n`);
  }
  if (evaluator.kind === 'command') {
    fs.mkdirSync(path.join(folder, 'evaluator'), { recursive: true });
    fs.copyFileSync(COMMAND_STUB, path.join(folder, 'evaluator', 'rows.js'));
    fs.chmodSync(path.join(folder, 'evaluator', 'rows.js'), 0o755);
    fs.writeFileSync(path.join(folder, 'evaluator', 'frameworks.json'), `${JSON.stringify(NO_FRAMEWORKS, null, 2)}\n`);
  }
  if (conditions !== null)
    fs.writeFileSync(path.join(folder, 'policy', 'evaluator-conditions.json'), `${JSON.stringify(conditions, null, 2)}\n`);
}

/** Evaluator conditions naming the sealed-brief agent's model and no target model. */
const AGENT_CONDITIONS = {
  schemaVersion: 1,
  modelSnapshot: 'none',
  systemPromptDigest: EMPTY_DIGEST,
  evaluator: { modelSnapshot: 'an-evaluator-snapshot' },
};

/** The mapping with its first key's binding replaced. */
const mappingWith = (binding) => ({ schemaVersion: 1, keys: { accepted: binding } });

/**
 * A records evaluator over the rubric R-001 with what an adopter harness
 * writes beside its records (Story 1.40): a configuration binding the
 * labelled file's digest and the minimum agreement, and the calibration
 * judgments, its scorer's answers to each label-free observation. Both verify
 * unless an option changes them: `configuration` and `judgments` edit the
 * parsed file (null leaves it out), `rawJudgments` writes text in its place.
 */
async function plantRecordsRubric(
  folder,
  { configuration: editConfiguration = () => {}, judgments: editJudgments = () => {}, rawJudgments } = {},
) {
  plantEvaluator(folder, { kind: 'records', records: 'harness-records' }, { mapping: null });
  editJson(folder, 'contract.json', (value) => (value.rubrics = [EVALUATOR_RUBRIC]));
  plantCalibration(folder, EVALUATOR_RUBRIC);
  const engine = await loadEngine();
  const records = path.join(folder, 'harness-records');
  fs.mkdirSync(records);
  const labelled = JSON.parse(fs.readFileSync(path.join(folder, 'policy', 'judge-calibration.json'), 'utf8'));
  const contract = JSON.parse(fs.readFileSync(path.join(folder, 'contract.json'), 'utf8'));
  const [criterion] = EVALUATOR_RUBRIC.criteria;
  const configuration = {
    evaluatorIdentity: 'a harness scorer',
    decodingParameters: {
      'tea.judgeCalibrationDigest': engine.digestBytes(fs.readFileSync(path.join(folder, 'policy', 'judge-calibration.json'))),
      'tea.judgeCalibrationMinimumAgreement': 0.5,
    },
  };
  const written = {
    schemaVersion: 1,
    // The binding keys are not part of what the scorer ran under.
    scorerConfigurationDigest: engine.digestArtifact(
      { evaluatorIdentity: configuration.evaluatorIdentity, decodingParameters: {} },
      'EvaluatorConfiguration',
    ),
    items: labelled.items.map((item) => ({
      rubricId: item.rubricId,
      criterionId: item.criterionId,
      scorerInput: calibrationObservation({
        criterion,
        response: item.response,
        responseKind: item.responseKind,
        ...calibrationStepPair(contract, criterion),
      }),
      answer: item.expectedLevel,
    })),
  };
  if (editConfiguration !== null) {
    editConfiguration(configuration);
    fs.writeFileSync(path.join(records, 'evaluator-configuration.json'), `${JSON.stringify(configuration, null, 2)}\n`);
  }
  if (rawJudgments !== undefined) fs.writeFileSync(path.join(records, 'calibration-judgments.json'), rawJudgments);
  else if (editJudgments !== null) {
    editJudgments(written);
    fs.writeFileSync(path.join(records, 'calibration-judgments.json'), `${JSON.stringify(written, null, 2)}\n`);
  }
}

/** Story 1.44: the declaration a command evaluator's `evaluator/frameworks.json` carries for one installed framework. */
const FRAMEWORK_ENTRY = { package: 'acme-evals', version: '1.2.3', probe: { command: 'evaluator/probe.js', args: ['acme-evals'] } };

/** The `LEARNED.md` a declared framework is recorded in, one line per package at the version given. */
function learnedRecord(...recorded) {
  return `# Learned evaluation framework\n\n## Framework and installed version\n\n${recorded.map((entry) => `- Installed package and version: \`${entry}\``).join('\n')}\n\n## Primary-source facts used\n\n- A later section is never read for versions, \`other-pkg@9.9.9\`.\n`;
}

/**
 * A command evaluator that declares `frameworks` (Story 1.44): the stub, an executable probe beside it, the declaration
 * (`declaration` replaces the whole parsed file; `raw` writes text in its place) and `learned` as `evaluator/LEARNED.md`
 * (none when null).
 */
function plantFrameworks(folder, { frameworks = [FRAMEWORK_ENTRY], declaration, raw, learned = null } = {}) {
  plantEvaluator(folder, COMMAND_EVALUATOR);
  fs.writeFileSync(path.join(folder, 'evaluator', 'probe.js'), '#!/usr/bin/env node\n');
  fs.chmodSync(path.join(folder, 'evaluator', 'probe.js'), 0o755);
  const file = path.join(folder, 'evaluator', 'frameworks.json');
  fs.writeFileSync(file, raw ?? `${JSON.stringify(declaration ?? { schemaVersion: 1, frameworks }, null, 2)}\n`);
  if (learned !== null) fs.writeFileSync(path.join(folder, 'evaluator', 'LEARNED.md'), learned);
}

/** Story 1.44's refusals: a declaration that is absent, malformed or inconsistent with LEARNED.md, each exit 10. */
const FRAMEWORK_CASES = [
  ...[{ source: 'unknown' }, {}, { source: 'tree', extra: true }, 'tree'].map((installState) => ({
    name: `an invalid install state ${JSON.stringify(installState)}`,
    file: 'evaluator/frameworks.json',
    rule: 'evaluator',
    plant: (folder) =>
      plantFrameworks(folder, {
        frameworks: [{ ...FRAMEWORK_ENTRY, installState }],
        learned: learnedRecord('acme-evals@1.2.3'),
      }),
    expect: (output) => [[output.includes('frameworks[0].installState must be'), 'the invalid install state was not named']],
  })),
  ...[0, 60_001, 1.5, '10000'].map((probeTimeoutMs) => ({
    name: `a probe timeout outside the allowed integer range: ${JSON.stringify(probeTimeoutMs)}`,
    file: 'evaluator/frameworks.json',
    rule: 'evaluator',
    plant: (folder) =>
      plantFrameworks(folder, {
        frameworks: [{ ...FRAMEWORK_ENTRY, probe: { ...FRAMEWORK_ENTRY.probe, probeTimeoutMs } }],
        learned: learnedRecord('acme-evals@1.2.3'),
      }),
    expect: (output) => [
      [output.includes('frameworks[0].probe.probeTimeoutMs must be an integer from 1 to 60000'), 'the invalid probe bound was not named'],
    ],
  })),
  {
    name: 'a command evaluator with no evaluator/frameworks.json',
    file: 'evaluator/frameworks.json',
    rule: 'evaluator',
    plant: (folder) => {
      plantEvaluator(folder, COMMAND_EVALUATOR);
      fs.rmSync(path.join(folder, 'evaluator', 'frameworks.json'));
    },
    expect: (output) => [
      [output.includes('declares the installed frameworks it depends on'), 'the finding does not say the declaration is missing'],
    ],
  },
  {
    name: 'a declaration that is not JSON',
    file: 'evaluator/frameworks.json',
    rule: 'json',
    plant: (folder) => plantFrameworks(folder, { raw: 'not json' }),
  },
  ...[
    ['a declaration that is a list', { declaration: [] }, 'the declaration must be a JSON object'],
    ['a declaration of another schema version', { declaration: { schemaVersion: 2, frameworks: [] } }, 'schemaVersion must be 1'],
    ['a declaration with no frameworks list', { declaration: { schemaVersion: 1 } }, 'frameworks must be a list'],
    ['a declaration with an unknown property', { declaration: { schemaVersion: 1, frameworks: [], note: 'x' } }, 'unknown property "note"'],
    [
      'a version range in place of a version',
      { frameworks: [{ ...FRAMEWORK_ENTRY, version: '^1.2.3' }] },
      'frameworks[0].version must be the one exact version expected',
    ],
    [
      'a framework with no probe',
      { frameworks: [{ package: 'acme-evals', version: '1.2.3' }] },
      'frameworks[0].probe must be { "command": "evaluator/<executable>", "args": [...] }',
    ],
    [
      'a probe outside evaluator/',
      { frameworks: [{ ...FRAMEWORK_ENTRY, probe: { command: 'node', args: ['-e', '1'] } }] },
      'frameworks[0].probe.command must be a path of an executable under evaluator/',
    ],
    [
      'a probe path that leaves evaluator/',
      { frameworks: [{ ...FRAMEWORK_ENTRY, probe: { command: 'evaluator/../probe.js' } }] },
      'frameworks[0].probe.command must be a path of an executable under evaluator/',
    ],
    [
      'probe arguments that are not strings',
      { frameworks: [{ ...FRAMEWORK_ENTRY, probe: { command: 'evaluator/probe.js', args: [1] } }] },
      'frameworks[0].probe.args must be a list of strings',
    ],
    [
      'a tag in place of a version',
      { frameworks: [{ ...FRAMEWORK_ENTRY, version: 'latest' }] },
      'frameworks[0].version must be the one exact version expected, starting with a digit, with no tag, range, wildcard',
    ],
    [
      'a wildcard version',
      { frameworks: [{ ...FRAMEWORK_ENTRY, version: '1.x' }] },
      'frameworks[0].version must be the one exact version expected',
    ],
    [
      'a package name with a space',
      { frameworks: [{ ...FRAMEWORK_ENTRY, package: 'bad name' }] },
      'frameworks[0].package must name a package',
    ],
    [
      'a probe with a property the declaration does not define',
      { frameworks: [{ ...FRAMEWORK_ENTRY, probe: { command: 'evaluator/probe.js', extra: true } }] },
      'frameworks[0].probe has the unknown property "extra"',
    ],
    [
      'an unknown probe property whose name mentions the timeout field',
      { frameworks: [{ ...FRAMEWORK_ENTRY, probe: { ...FRAMEWORK_ENTRY.probe, 'x.probe.probeTimeoutMs': 10 } }] },
      'frameworks[0].probe has the unknown property "x.probe.probeTimeoutMs"',
    ],
    [
      'a backslash in the probe path',
      { frameworks: [{ ...FRAMEWORK_ENTRY, probe: { command: String.raw`evaluator/sub\probe.js` } }] },
      'frameworks[0].probe.command must be a path of an executable under evaluator/',
    ],
    [
      'an empty segment in the probe path',
      { frameworks: [{ ...FRAMEWORK_ENTRY, probe: { command: 'evaluator//probe.js' } }] },
      'frameworks[0].probe.command must be a path of an executable under evaluator/',
    ],
    [
      'a dot segment in the probe path',
      { frameworks: [{ ...FRAMEWORK_ENTRY, probe: { command: 'evaluator/./probe.js' } }] },
      'frameworks[0].probe.command must be a path of an executable under evaluator/',
    ],
    ['a framework named twice', { frameworks: [FRAMEWORK_ENTRY, FRAMEWORK_ENTRY] }, 'frameworks[1].package repeats acme-evals'],
    [
      'a framework with a property the declaration does not define',
      { frameworks: [{ ...FRAMEWORK_ENTRY, range: '^1' }] },
      'frameworks[0] has the unknown property "range"',
    ],
  ].map(([name, options, says]) => ({
    name,
    file: 'evaluator/frameworks.json',
    rule: 'schema',
    plant: (folder) => plantFrameworks(folder, { ...options, learned: learnedRecord('acme-evals@1.2.3') }),
    expect: (output) => [[output.includes(says), `the finding does not say ${says}`]],
  })),
  {
    name: 'a version probe that is not a file the folder holds',
    file: 'evaluator/frameworks.json',
    rule: 'evaluator',
    plant: (folder) => {
      plantFrameworks(folder, { learned: learnedRecord('acme-evals@1.2.3') });
      fs.rmSync(path.join(folder, 'evaluator', 'probe.js'));
    },
    expect: (output) => [
      [
        output.includes('the version probe of acme-evals names evaluator/probe.js, which is not a regular file'),
        'the finding does not name the probe',
      ],
    ],
  },
  {
    name: 'a version probe that is not executable',
    file: 'evaluator/frameworks.json',
    rule: 'evaluator',
    plant: (folder) => {
      plantFrameworks(folder, { learned: learnedRecord('acme-evals@1.2.3') });
      fs.chmodSync(path.join(folder, 'evaluator', 'probe.js'), 0o644);
    },
    expect: (output) => [
      [output.includes('evaluator/probe.js, which is not executable'), 'the finding does not say the probe is not executable'],
    ],
  },
  {
    name: 'a nonempty declaration with no LEARNED.md',
    file: 'evaluator/LEARNED.md',
    rule: 'evaluator',
    plant: (folder) => plantFrameworks(folder),
    expect: (output) => [
      [output.includes('records the installed version of acme-evals'), 'the finding does not name the package LEARNED.md must record'],
    ],
  },
  {
    name: 'a LEARNED.md that records another version than the declaration',
    file: 'evaluator/LEARNED.md',
    rule: 'evaluator',
    plant: (folder) => plantFrameworks(folder, { learned: learnedRecord('acme-evals@1.2.2') }),
    expect: (output) => [
      [
        output.includes('records acme-evals@1.2.2, and evaluator/frameworks.json declares acme-evals@1.2.3'),
        'the finding does not name both versions',
      ],
    ],
  },
  {
    name: 'a LEARNED.md that records two versions of the package',
    file: 'evaluator/LEARNED.md',
    rule: 'evaluator',
    plant: (folder) => plantFrameworks(folder, { learned: learnedRecord('acme-evals@1.2.3', 'acme-evals@1.2.2') }),
    expect: (output) => [
      [output.includes('records acme-evals@1.2.3, acme-evals@1.2.2'), 'the finding does not list both recorded versions'],
    ],
  },
  {
    name: 'a LEARNED.md that does not record the declared package',
    file: 'evaluator/LEARNED.md',
    rule: 'evaluator',
    plant: (folder) => plantFrameworks(folder, { learned: learnedRecord('other-evals@1.2.3') }),
    expect: (output) => [
      [output.includes('records no `acme-evals@1.2.3`'), 'the finding does not say the declared package is unrecorded'],
      [
        output.includes('records other-evals, which evaluator/frameworks.json does not declare'),
        'the finding does not name the undeclared package',
      ],
    ],
  },
  {
    name: 'a LEARNED.md with an inline span line that opens no fence',
    file: 'evaluator/LEARNED.md',
    rule: 'evaluator',
    // A backtick opener whose info string holds a backtick is no fence, so the stale record after it still counts.
    plant: (folder) =>
      plantFrameworks(folder, {
        learned: learnedRecord('acme-evals@1.2.3').replace('\n\n## Primary', '\n```js```\n- Earlier: `acme-evals@1.2.2`\n\n## Primary'),
      }),
    expect: (output) => [
      [output.includes('records acme-evals@1.2.3, acme-evals@1.2.2'), 'a span line opened a fake fence that hid the stale record'],
    ],
  },
  {
    name: 'a LEARNED.md with two installed-version sections',
    file: 'evaluator/LEARNED.md',
    rule: 'evaluator',
    plant: (folder) => plantFrameworks(folder, { learned: `${learnedRecord('acme-evals@1.2.3')}\n${learnedRecord('acme-evals@1.2.3')}` }),
    expect: (output) => [
      [output.includes('has more than one "## Framework and installed version" section'), 'the finding does not name the repeated section'],
    ],
  },
  {
    name: 'a LEARNED.md whose only heading is a deeper one',
    file: 'evaluator/LEARNED.md',
    rule: 'evaluator',
    plant: (folder) =>
      plantFrameworks(folder, {
        learned: '# Learned evaluation framework\n\n### Framework and installed version\n\n- `acme-evals@1.2.3`\n',
      }),
    expect: (output) => [
      [output.includes('has no "## Framework and installed version" section'), 'a ### heading was read as the installed-version section'],
    ],
  },
  {
    name: 'a LEARNED.md with no installed-version section',
    file: 'evaluator/LEARNED.md',
    rule: 'evaluator',
    plant: (folder) => plantFrameworks(folder, { learned: '# Learned evaluation framework\n\n`acme-evals@1.2.3`\n' }),
    expect: (output) => [[output.includes('has no "## Framework and installed version" section'), 'the finding does not name the section']],
  },
  {
    name: 'a LEARNED.md that records a framework an empty declaration omits',
    file: 'evaluator/LEARNED.md',
    rule: 'evaluator',
    plant: (folder) => {
      plantFrameworks(folder, { frameworks: [], learned: learnedRecord('acme-evals@1.2.3') });
    },
    expect: (output) => [
      [
        output.includes('records acme-evals, which evaluator/frameworks.json does not declare'),
        'the finding does not name the omitted package',
      ],
    ],
  },
];

/** Story 1.17's evaluator cases: each exits 10 naming its file and rule. */
const EVALUATOR_CASES = [
  {
    name: 'an evaluator of an unknown kind',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.evaluator = { kind: 'framework-of-the-week' })),
    expect: (output) => [[output.includes('/evaluator/kind'), 'the finding does not name evaluator.kind']],
  },
  {
    name: 'a command evaluator with no evaluator/mapping.json',
    file: 'evaluator/mapping.json',
    rule: 'evaluator',
    plant: (folder) => plantEvaluator(folder, COMMAND_EVALUATOR, { mapping: null }),
    expect: (output) => [[output.includes('has none'), 'the finding does not say the mapping is missing']],
  },
  {
    name: 'a command evaluator with no timeoutMs',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => plantEvaluator(folder, { kind: 'command', command: 'evaluator/rows.js' }),
    expect: (output) => [[output.includes('timeoutMs'), 'the finding does not name timeoutMs']],
  },
  {
    name: 'a mapping key bound to an oracle the contract does not declare',
    file: 'evaluator/mapping.json',
    rule: 'evaluator',
    plant: (folder) => plantEvaluator(folder, COMMAND_EVALUATOR, { mapping: mappingWith({ oracleId: 'O-009', behaviorId: 'B-001' }) }),
    expect: (output) => [
      [output.includes('binds oracle O-009, which the contract does not declare'), 'the finding does not name the oracle'],
    ],
  },
  {
    name: 'a mapping key bound to a behavior the contract does not declare',
    file: 'evaluator/mapping.json',
    rule: 'evaluator',
    plant: (folder) => plantEvaluator(folder, COMMAND_EVALUATOR, { mapping: mappingWith({ oracleId: 'O-001', behaviorId: 'B-009' }) }),
    expect: (output) => [
      [output.includes('binds behavior B-009, which the contract does not declare'), 'the finding does not name the behavior'],
    ],
  },
  {
    name: 'a mapping key binding an oracle to a behavior that does not declare it',
    file: 'evaluator/mapping.json',
    rule: 'evaluator',
    plant: (folder) => plantEvaluator(folder, COMMAND_EVALUATOR, { mapping: mappingWith({ oracleId: 'O-001', behaviorId: 'B-002' }) }),
    expect: (output) => [[output.includes('which does not declare that oracle'), 'the finding does not say the behavior lacks the oracle']],
  },
  {
    name: 'a mapping key bound to a rubric criterion the contract does not declare',
    file: 'evaluator/mapping.json',
    rule: 'evaluator',
    plant: (folder) =>
      plantEvaluator(folder, COMMAND_EVALUATOR, {
        rubric: true,
        mapping: { schemaVersion: 1, keys: { skipped: { rubricId: 'R-001', criterionId: 'RC-009', levels: [0, 1] } } },
      }),
    expect: (output) => [[output.includes('binds criterion RC-009'), 'the finding does not name the criterion']],
  },
  {
    name: "a rubric binding whose levels differ from the criterion's anchored levels",
    file: 'evaluator/mapping.json',
    rule: 'evaluator',
    plant: (folder) =>
      plantEvaluator(folder, COMMAND_EVALUATOR, {
        rubric: true,
        mapping: { schemaVersion: 1, keys: { skipped: { rubricId: 'R-001', criterionId: 'RC-001', levels: [0, 1, 2] } } },
      }),
    expect: (output) => [[output.includes('whose anchored scale levels are [0,1]'), 'the finding does not name the anchored levels']],
  },
  {
    name: 'a rubric criterion no mapping key binds under a command evaluator',
    file: 'evaluator/mapping.json',
    rule: 'evaluator',
    plant: (folder) => {
      plantEvaluator(folder, COMMAND_EVALUATOR);
      editJson(folder, 'contract.json', (value) => (value.rubrics = [EVALUATOR_RUBRIC]));
      plantCalibration(folder, EVALUATOR_RUBRIC);
    },
    expect: (output) => [
      [output.includes('no key binds rubric criterion R-001/RC-001'), 'the finding does not name the unbound criterion'],
    ],
  },
  {
    name: 'a mapping key off its pattern',
    file: 'evaluator/mapping.json',
    rule: 'schema',
    plant: (folder) =>
      plantEvaluator(folder, COMMAND_EVALUATOR, {
        mapping: { schemaVersion: 1, keys: { '-bad key': { oracleId: 'O-001', behaviorId: 'B-001' } } },
      }),
  },
  {
    name: 'a command evaluator whose executable is not executable',
    file: 'evaluation.json',
    rule: 'evaluator',
    plant: (folder) => {
      plantEvaluator(folder, COMMAND_EVALUATOR);
      fs.chmodSync(path.join(folder, 'evaluator', 'rows.js'), 0o644);
    },
    expect: (output) => [[output.includes('is not executable'), 'the finding does not say the executable bit is missing']],
  },
  {
    name: 'a records evaluator whose record directory is absent',
    file: 'evaluation.json',
    rule: 'evaluator',
    plant: (folder) => plantEvaluator(folder, { kind: 'records', records: 'harness-records' }, { mapping: null }),
    expect: (output) => [[output.includes('harness-records, which is not a directory'), 'the finding does not name the directory']],
  },
  ...[
    ['no judgments file', { judgments: null }, ['harness-records/calibration-judgments.json is not there']],
    ['judgments that are not JSON', { rawJudgments: 'not json' }, ['harness-records/calibration-judgments.json is not JSON']],
    [
      'judgments of another scorer configuration',
      { judgments: (value) => (value.scorerConfigurationDigest = `sha256:${'4'.repeat(64)}`) },
      [`names scorerConfigurationDigest "sha256:${'4'.repeat(64)}"`, 'so the judgments are not from the scorer that produced the records'],
    ],
    [
      'a label in the scorer input',
      { judgments: (value) => (value.items[1].scorerInput.expectedLevel = 1) },
      ['items[1].scorerInput is not the label-free observation', 'carries expectedLevel'],
    ],
    [
      'a response the scorer did not see',
      { judgments: (value) => (value.items[0].scorerInput.exitCode = 7) },
      ['items[0].scorerInput is not the label-free observation'],
    ],
    ['a judgments item missing', { judgments: (value) => value.items.pop() }, ['holds 1 items; policy/judge-calibration.json holds 2']],
    [
      'an answer off the criterion levels',
      { judgments: (value) => (value.items[0].answer = 9) },
      ['items[0].answer 9 is not null or an anchored level of R-001/RC-001'],
    ],
    [
      'a configuration with no calibration binding',
      { configuration: (value) => delete value.decodingParameters['tea.judgeCalibrationDigest'] },
      ['carries no decodingParameters["tea.judgeCalibrationDigest"]'],
      'harness-records/evaluator-configuration.json',
    ],
    [
      'a configuration binding another minimum agreement',
      { configuration: (value) => (value.decodingParameters['tea.judgeCalibrationMinimumAgreement'] = 0.9) },
      ['binds decodingParameters["tea.judgeCalibrationMinimumAgreement"] 0.9', 'judgeCalibration.minimumAgreement is 0.5'],
      'harness-records/evaluator-configuration.json',
    ],
    [
      'a configuration that is not there',
      { configuration: null },
      ['harness-records/evaluator-configuration.json cannot be read as JSON'],
      'harness-records/evaluator-configuration.json',
    ],
  ].map(([what, options, says, file = 'harness-records/calibration-judgments.json']) => ({
    name: `a records evaluator with a rubric and ${what}`,
    file,
    rule: 'judge-calibration',
    plant: (folder) => plantRecordsRubric(folder, options),
    expect: (output) => says.map((text) => [output.includes(text), `the finding does not say ${JSON.stringify(text)}`]),
  })),
  ...[
    ['a non-array interactionPlan', () => ({})],
    ['an interactionPlan with a null step', (plan) => [null, ...plan]],
  ].map(([what, shape]) => ({
    name: `a records evaluator with a rubric and ${what} in the contract`,
    file: 'contract.json',
    rule: 'engine-schema',
    plant: async (folder) => {
      await plantRecordsRubric(folder);
      editJson(folder, 'contract.json', (value) => (value.interactionPlan = shape(value.interactionPlan)));
    },
    expect: (output) => [
      [!output.includes('TypeError'), 'check crashed with a raw TypeError instead of reporting the contract'],
      [!output.includes('Cannot read properties'), 'check crashed on the contract shape'],
    ],
  })),
  ...[
    ['calibration-judgments.json', ['harness-records/calibration-judgments.json is not a regular file']],
    ['evaluator-configuration.json', ['harness-records/evaluator-configuration.json cannot be read as JSON', 'it is not a regular file']],
  ].map(([name, says]) => ({
    name: `a records evaluator with a rubric and ${name} reached through a link`,
    file: `harness-records/${name}`,
    rule: 'judge-calibration',
    plant: async (folder) => {
      await plantRecordsRubric(folder);
      // The link points at a valid copy, so only the link itself can be what check refuses.
      const file = path.join(folder, 'harness-records', name);
      const copy = path.join(folder, `linked-${name}`);
      fs.copyFileSync(file, copy);
      fs.rmSync(file);
      fs.symlinkSync(copy, file);
    },
    expect: (output) => says.map((text) => [output.includes(text), `the finding does not say ${JSON.stringify(text)}`]),
  })),
  {
    name: 'a records evaluator with a rubric and judgments carrying a top-level label',
    file: 'harness-records/calibration-judgments.json',
    rule: 'judge-calibration',
    plant: (folder) => plantRecordsRubric(folder, { judgments: (value) => (value.expectedLevel = 1) }),
    expect: (output) => [
      [
        output.includes('harness-records/calibration-judgments.json has an unknown field "expectedLevel"'),
        'the finding does not name the field',
      ],
    ],
  },
  {
    name: 'a sealed-brief agent with no evaluator model in the evaluator conditions',
    file: 'policy/evaluator-conditions.json',
    rule: 'evaluator',
    plant: (folder) => plantEvaluator(folder, AGENT_EVALUATOR),
    expect: (output) => [[output.includes('evaluator.modelSnapshot'), 'the finding does not name the snapshot']],
  },
  {
    name: 'a sealed-brief agent on an adapter with no bridged run',
    file: 'evaluation.json',
    rule: 'evaluator',
    plant: (folder) =>
      plantEvaluator(folder, { ...AGENT_EVALUATOR, agent: 'codex', agentCommand: undefined }, { conditions: AGENT_CONDITIONS }),
    expect: (output) => [[output.includes('has no bridged run'), 'the finding does not say the adapter cannot run bridged']],
  },
  {
    name: 'an evaluator model in the evaluator conditions beside the deterministic evaluator',
    file: 'policy/evaluator-conditions.json',
    rule: 'evaluator',
    plant: (folder) =>
      fs.writeFileSync(path.join(folder, 'policy', 'evaluator-conditions.json'), `${JSON.stringify(AGENT_CONDITIONS, null, 2)}\n`),
    expect: (output) => [[output.includes('declares evaluator'), 'the finding does not say the block is unused']],
  },
  {
    name: 'a judge declared beside a rubric a command evaluator scores',
    file: 'evaluation.json',
    rule: 'judge',
    plant: (folder) => {
      plantEvaluator(folder, COMMAND_EVALUATOR, { rubric: true });
      editJson(folder, 'evaluation.json', (value) => (value.judge = { agent: 'custom', agentCommand: 'stub-judge', timeoutMs: 60_000 }));
    },
    expect: (output) => [[output.includes("scores the contract's rubrics itself"), 'the finding does not say the judge is unused']],
  },
];

/** More of Story 1.17's refusals: the rest of the `evaluator` rule's branches, each exit 10. */
EVALUATOR_CASES.push(
  {
    name: 'a symbolic link under evaluator/',
    file: 'evaluator',
    rule: 'evaluator',
    plant: (folder) => {
      plantEvaluator(folder, COMMAND_EVALUATOR);
      fs.symlinkSync(path.join(folder, 'contract.json'), path.join(folder, 'evaluator', 'linked.json'));
    },
    expect: (output) => [[output.includes('evaluator/linked.json is not a regular file'), 'the finding does not name the link']],
  },
  // A FIFO is a special file only POSIX systems make; reading one would block, so it is refused before any read.
  ...(process.platform === 'win32'
    ? []
    : [
        {
          name: 'a FIFO under evaluator/',
          file: 'evaluator',
          rule: 'evaluator',
          plant: (folder) => {
            plantEvaluator(folder, COMMAND_EVALUATOR);
            const made = spawnSync('mkfifo', [path.join(folder, 'evaluator', 'pipe')]);
            if (made.status !== 0) throw new Error(`mkfifo failed: ${made.stderr}`);
          },
          expect: (output) => [
            [output.includes('evaluator/pipe is not a regular file or directory'), 'the finding does not name the FIFO'],
          ],
        },
      ]),
  {
    name: 'two mapping keys bound to one oracle',
    file: 'evaluator/mapping.json',
    rule: 'evaluator',
    plant: (folder) =>
      plantEvaluator(folder, COMMAND_EVALUATOR, {
        mapping: {
          schemaVersion: 1,
          keys: { accepted: { oracleId: 'O-001', behaviorId: 'B-001' }, again: { oracleId: 'O-001', behaviorId: 'B-001' } },
        },
      }),
    expect: (output) => [[output.includes('both bind oracle O-001'), 'the finding does not name the doubly bound oracle']],
  },
  {
    name: 'two mapping keys bound to one rubric criterion',
    file: 'evaluator/mapping.json',
    rule: 'evaluator',
    plant: (folder) =>
      plantEvaluator(folder, COMMAND_EVALUATOR, {
        rubric: true,
        mapping: {
          schemaVersion: 1,
          keys: {
            skipped: { rubricId: 'R-001', criterionId: 'RC-001', levels: [0, 1] },
            again: { rubricId: 'R-001', criterionId: 'RC-001', levels: [0, 1] },
          },
        },
      }),
    expect: (output) => [[output.includes('both bind criterion R-001/RC-001'), 'the finding does not name the doubly bound criterion']],
  },
  {
    name: 'a sealed-brief agent with no evaluator/mapping.json',
    file: 'evaluator/mapping.json',
    rule: 'evaluator',
    plant: (folder) => plantEvaluator(folder, AGENT_EVALUATOR, { mapping: null, conditions: AGENT_CONDITIONS }),
  },
  {
    name: 'a sealed-brief agent that declares no evaluatorQualification',
    file: 'evaluation.json',
    rule: 'evaluator',
    plant: (folder) => plantEvaluator(folder, AGENT_EVALUATOR, { conditions: AGENT_CONDITIONS, qualification: null }),
    expect: (output) => [[output.includes('declares no evaluatorQualification'), 'the finding does not say the qualification is missing']],
  },
  {
    name: 'a sealed-brief agent qualified on a single attempt',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) =>
      plantEvaluator(folder, AGENT_EVALUATOR, { conditions: AGENT_CONDITIONS, qualification: { attempts: 1, minimumAgreement: 0.9 } }),
    expect: (output) => [[output.includes('/evaluatorQualification/attempts'), 'the finding does not name attempts']],
  },
  {
    name: 'a sealed-brief agent whose minimum agreement is above one',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) =>
      plantEvaluator(folder, AGENT_EVALUATOR, { conditions: AGENT_CONDITIONS, qualification: { attempts: 2, minimumAgreement: 1.5 } }),
    expect: (output) => [[output.includes('/evaluatorQualification/minimumAgreement'), 'the finding does not name minimumAgreement']],
  },
  ...['deterministic', 'command', 'records'].map((kind) => ({
    name: `an evaluatorQualification beside a ${kind} evaluator`,
    file: 'evaluation.json',
    rule: 'evaluator',
    plant: (folder) => {
      if (kind === 'command') plantEvaluator(folder, COMMAND_EVALUATOR);
      else if (kind === 'records') {
        plantEvaluator(folder, { kind: 'records', records: 'harness-records' }, { mapping: null });
        fs.mkdirSync(path.join(folder, 'harness-records'));
      }
      editJson(folder, 'evaluation.json', (value) => (value.evaluatorQualification = AGENT_QUALIFICATION));
    },
    expect: (output) => [
      [output.includes(`is ${kind}, and only a sealed-brief agent is qualified`), 'the finding does not say the block is unused'],
    ],
  })),
  {
    name: 'a sealed-brief agent with no timeoutMs',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) =>
      plantEvaluator(folder, { kind: 'sealed-brief-agent', agent: 'custom', agentCommand: 'stub-agent' }, { conditions: AGENT_CONDITIONS }),
    expect: (output) => [[output.includes('timeoutMs'), 'the finding does not name timeoutMs']],
  },
  {
    name: 'a sealed-brief agent on an adapter TeA does not have',
    file: 'evaluation.json',
    rule: 'evaluator',
    plant: (folder) => plantEvaluator(folder, { ...AGENT_EVALUATOR, agent: 'constructor' }, { conditions: AGENT_CONDITIONS }),
    expect: (output) => [[output.includes('is not an agent adapter TeA has'), 'the finding does not say the adapter is unknown']],
  },
  {
    name: 'a sealed-brief agent on the custom adapter with no command',
    file: 'evaluation.json',
    rule: 'evaluator',
    plant: (folder) =>
      plantEvaluator(folder, { kind: 'sealed-brief-agent', agent: 'custom', timeoutMs: 60_000 }, { conditions: AGENT_CONDITIONS }),
    expect: (output) => [[output.includes('evaluator.agentCommand must name one'), 'the finding does not ask for agentCommand']],
  },
  {
    name: 'a sealed-brief agent with a model its adapter refuses',
    file: 'evaluation.json',
    rule: 'evaluator',
    plant: (folder) => plantEvaluator(folder, { ...AGENT_EVALUATOR, model: 'a-model' }, { conditions: AGENT_CONDITIONS }),
    expect: (output) => [[output.includes("the evaluator's model cannot run"), 'the finding does not say the model cannot run']],
  },
  {
    name: 'a sealed-brief agent whose passthrough reopens built-in tools',
    file: 'evaluation.json',
    rule: 'evaluator',
    plant: (folder) =>
      plantEvaluator(
        folder,
        { kind: 'sealed-brief-agent', agent: 'claude', agentArgs: ['--tools', 'default'], timeoutMs: 60_000 },
        { conditions: AGENT_CONDITIONS },
      ),
    expect: (output) => [[output.includes('evaluator.agentArgs carries --tools'), 'the finding does not name the flag']],
  },
  {
    name: 'a judge model in the evaluator conditions beside a rubric a command evaluator scores',
    file: 'policy/evaluator-conditions.json',
    rule: 'judge',
    plant: (folder) =>
      plantEvaluator(folder, COMMAND_EVALUATOR, {
        rubric: true,
        conditions: { schemaVersion: 1, modelSnapshot: 'none', systemPromptDigest: EMPTY_DIGEST, judge: { modelSnapshot: 'a-judge' } },
      }),
    expect: (output) => [[output.includes("scores the contract's rubrics itself"), 'the finding does not say the judge is unused']],
  },
  {
    name: 'an evaluator model in the evaluator conditions beside a records evaluator',
    file: 'policy/evaluator-conditions.json',
    rule: 'evaluator',
    plant: (folder) => {
      plantEvaluator(folder, { kind: 'records', records: 'harness-records' }, { mapping: null, conditions: AGENT_CONDITIONS });
      fs.mkdirSync(path.join(folder, 'harness-records'));
    },
    expect: (output) => [[output.includes('declares evaluator'), 'the finding does not say the block is unused']],
  },
  {
    name: 'a command outside evaluator/',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => plantEvaluator(folder, { ...COMMAND_EVALUATOR, command: 'evaluator/../contract.json' }),
    expect: (output) => [[output.includes('/evaluator/command'), 'the finding does not name evaluator.command']],
  },
  {
    name: 'a command evaluator whose executable is missing',
    file: 'evaluation.json',
    rule: 'evaluator',
    plant: (folder) => plantEvaluator(folder, { ...COMMAND_EVALUATOR, command: 'evaluator/missing.js' }),
    expect: (output) => [
      [output.includes('evaluator/missing.js, which is not a regular file'), 'the finding does not name the missing file'],
    ],
  },
  {
    name: 'a records directory reached through a link',
    file: 'evaluation.json',
    rule: 'evaluator',
    plant: (folder) => {
      plantEvaluator(folder, { kind: 'records', records: 'linked/records' }, { mapping: null });
      const outside = fs.mkdtempSync(path.join(path.dirname(folder), 'outside-'));
      fs.mkdirSync(path.join(outside, 'records'));
      fs.symlinkSync(outside, path.join(folder, 'linked'));
    },
    expect: (output) => [[output.includes('reached through no link'), 'the finding does not say the link is refused']],
  },
);

/** Story 1.17's legitimate evaluator folders: each exits 0, a rubric under a non-deterministic kind with no judge included. */
const EVALUATOR_CLEAN_CASES = [
  ...['tree', 'lockfile'].map((source) => ({
    name: `a command evaluator with a ${source} install state`,
    plant: (folder) =>
      plantFrameworks(folder, {
        frameworks: [{ ...FRAMEWORK_ENTRY, installState: { source } }],
        learned: learnedRecord('acme-evals@1.2.3'),
      }),
  })),
  ...[1, 60_000].map((probeTimeoutMs) => ({
    name: `a command evaluator with a ${probeTimeoutMs}ms probe timeout`,
    plant: (folder) =>
      plantFrameworks(folder, {
        frameworks: [{ ...FRAMEWORK_ENTRY, probe: { ...FRAMEWORK_ENTRY.probe, probeTimeoutMs } }],
        learned: learnedRecord('acme-evals@1.2.3'),
      }),
  })),
  {
    name: 'a command evaluator whose declaration and LEARNED.md agree on an installed framework',
    plant: (folder) => plantFrameworks(folder, { learned: learnedRecord('acme-evals@1.2.3') }),
  },
  {
    name: 'a command evaluator with an empty declaration and a LEARNED.md that records no framework',
    plant: (folder) => plantFrameworks(folder, { frameworks: [], learned: learnedRecord() }),
  },
  {
    name: 'a LEARNED.md that quotes the section heading inside a fenced block',
    plant: (folder) =>
      plantFrameworks(folder, {
        learned: `${learnedRecord('acme-evals@1.2.3')}\n\`\`\`md\n## Framework and installed version\n- \`other-evals@9.9.9\`\n\`\`\`\n`,
      }),
  },
  ...[
    ['a longer fence that quotes a shorter one', '\n````md\n```\n## Framework and installed version\n- `other-evals@9.9.9`\n```\n````\n'],
    ['a tilde line inside a backtick block', '\n```md\n~~~\n## Framework and installed version\n- `other-evals@9.9.9`\n```\n'],
    ['a tilde fence that quotes the heading', '\n~~~md\n## Framework and installed version\n- `other-evals@9.9.9`\n~~~\n'],
    ['an indented fence that quotes the heading', '\n   ```md\n## Framework and installed version\n- `other-evals@9.9.9`\n   ```\n'],
  ].map(([name, quoted]) => ({
    name: `a LEARNED.md with ${name}`,
    plant: (folder) => plantFrameworks(folder, { learned: `${learnedRecord('acme-evals@1.2.3')}${quoted}` }),
  })),
  {
    name: 'a LEARNED.md whose section heading has trailing spaces',
    plant: (folder) =>
      plantFrameworks(folder, {
        learned: learnedRecord('acme-evals@1.2.3').replace('## Framework and installed version', '## Framework and installed version \t '),
      }),
  },
  {
    name: 'a LEARNED.md with CRLF line endings',
    plant: (folder) => plantFrameworks(folder, { learned: learnedRecord('acme-evals@1.2.3').replaceAll('\n', '\r\n') }),
  },
  {
    name: 'a LEARNED.md whose prose holds backticked text that is no package version',
    plant: (folder) =>
      plantFrameworks(folder, {
        learned: learnedRecord('acme-evals@1.2.3').replace(
          '\n\n## Primary',
          '\n- Contact `maintainer@example.com`; track `npm@latest`.\n\n## Primary',
        ),
      }),
  },
  {
    name: 'a command evaluator that declares a scoped package',
    plant: (folder) =>
      plantFrameworks(folder, {
        frameworks: [{ ...FRAMEWORK_ENTRY, package: '@acme/evals' }],
        learned: learnedRecord('@acme/evals@1.2.3'),
      }),
  },
  { name: 'a command evaluator with its mapping and executable', plant: (folder) => plantEvaluator(folder, COMMAND_EVALUATOR) },
  {
    name: 'a command evaluator that names the model it calls',
    plant: (folder) =>
      plantEvaluator(folder, COMMAND_EVALUATOR, {
        conditions: { schemaVersion: 1, modelSnapshot: 'none', systemPromptDigest: EMPTY_DIGEST, evaluator: { modelSnapshot: 'a-grader' } },
      }),
  },
  {
    name: 'a rubric a command evaluator scores, with no judge',
    plant: (folder) => plantEvaluator(folder, COMMAND_EVALUATOR, { rubric: true }),
  },
  {
    name: 'a rubric a sealed-brief agent scores, with no judge',
    plant: (folder) => plantEvaluator(folder, AGENT_EVALUATOR, { rubric: true, conditions: AGENT_CONDITIONS }),
  },
  {
    name: 'a records evaluator whose rubric scores carry verified calibration judgments',
    plant: (folder) => plantRecordsRubric(folder),
  },
  {
    name: 'a records evaluator with no rubric, beside a judgments file it never reads',
    plant: (folder) => {
      plantEvaluator(folder, { kind: 'records', records: 'harness-records' }, { mapping: null });
      fs.mkdirSync(path.join(folder, 'harness-records'));
      fs.writeFileSync(path.join(folder, 'harness-records', 'calibration-judgments.json'), 'not json');
    },
  },
  {
    name: 'an explicit deterministic evaluator',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.evaluator = { kind: 'deterministic' })),
  },
];

/** Legitimate folders the Story 1.5 rules must leave alone: each exits 0. */
const CLEAN_CASES = [
  {
    name: 'a gameability probe with its naive oracle, its degenerate response and its arm',
    plant: (folder) => plantGameability(folder),
  },
  {
    name: 'a rubric with its judge and the judge model',
    plant: (folder) => plantRubric(folder),
  },
  {
    name: 'a historical probe with a natural defect, its arm and a fix commit named by any revision',
    plant: (folder) => {
      editJson(folder, 'probes/P-002.probe.json', (value) => {
        value.qualification = { route: 'historical', fixCommit: 'a1b2c3d' };
        value.defects[0].source = 'natural';
      });
      editJson(folder, 'evaluation.json', (value) => (value.arms = ['clean', 'historical']));
      fs.rmSync(path.join(folder, 'mutations'), { recursive: true });
    },
  },
  {
    name: 'a deployment-routed probe over a registry of one HTTP interface that names one report',
    copy: copyApi,
    plant: (folder) => plantApiHistorical(folder, DEPLOYMENTS),
  },
  {
    name: 'a deployment-routed probe over a registry of two HTTP interfaces that names a report for each',
    copy: copyApi,
    plant: (folder) => plantApiHistorical(folder, TWO_INTERFACE_DEPLOYMENTS),
  },
  {
    name: 'two entries sharing an interface with different executables',
    plant: (folder) =>
      editJson(folder, 'evaluation.json', (value) => value.registry.push({ ...value.registry[0], executable: 'tea-atdd-report' })),
  },
  {
    name: 'two entries starting one target with the same system paths',
    plant: (folder) =>
      editJson(folder, 'evaluation.json', (value) => {
        value.registry[0].systemPaths = ['/opt/verdict-rules'];
        value.registry.push({ ...value.registry[0], executable: 'tea-atdd-report' });
      }),
  },
  {
    name: 'a signature whose call-input clause sits beside an exit code only the defect produces',
    plant: (folder) =>
      setSignature(folder, {
        op: 'all',
        operands: [
          { op: 'equality', operands: [{ pointer: '/interactions/observed/call-inputs/option/agent' }, { literal: 'claude' }] },
          exitEquals(1),
        ],
      }),
  },
  {
    name: 'a signature that needs the exit code and output only the defect produces',
    plant: (folder) => {
      setInfrastructureCodes(folder, [3, 4, 5, 6]);
      setSignature(folder, {
        op: 'all',
        operands: [
          exitEquals(3),
          { op: 'equality', operands: [{ pointer: '/interactions/observed/stdout' }, { literal: 'active tests found' }] },
        ],
      });
    },
  },
  {
    name: 'a signature with two call-input clauses beside an exit code only the defect produces',
    plant: (folder) => setSignature(folder, withOptionClauses(2, exitEquals(1))),
  },
  {
    name: 'a signature with eight call-input clauses, the most the rule enumerates',
    plant: (folder) => {
      setInfrastructureCodes(folder, [3, 4, 5, 6]);
      setSignature(folder, withOptionClauses(8, exitEquals(1)));
    },
  },
  {
    name: 'a manifestation witness on an api interface, which no command registry entry serves',
    plant: (folder) => {
      const example = JSON.parse(
        fs.readFileSync(
          path.join(
            path.dirname(path.dirname(engineSchemaPath('probe.schema.json'))),
            'corpus',
            'dev',
            'compile-seal-example',
            'contract.json',
          ),
          'utf8',
        ),
      );
      const api = structuredClone(example.permittedInterfaces.find((candidate) => candidate.logicalId === 'thing-api'));
      api.operations = [api.operations[0]];
      editJson(folder, 'contract.json', (value) => value.permittedInterfaces.push(api));
      editJson(
        folder,
        'evaluation.json',
        (value) => (value.operationPhases[api.logicalId] = { [api.operations[0].operationId]: 'outcome' }),
      );
      editJson(folder, 'probes/P-002.probe.json', (value) => {
        value.defects[0].manifestationWitness = {
          legId: 'manifest-api',
          interfaceId: api.logicalId,
          operationId: api.operations[0].operationId,
          inputs: { body: { kind: 'json', value: { name: 'alpha' } }, header: {}, path: {}, query: {} },
          relation: {
            op: 'not',
            operands: [{ op: 'equality', operands: [{ pointer: '/interactions/manifest-api/response-status' }, { literal: 201 }] }],
          },
        };
      });
    },
  },
];

async function runCleanCases() {
  for (const testCase of [...CLEAN_CASES, ...EVALUATOR_CLEAN_CASES]) {
    const folder = testCase.copy?.() ?? copyValid();
    await testCase.plant(folder);
    await writeCorpusIndex(folder);
    const result = runCli(['check', '--evaluation', folder]);
    check(result.status === 0, `${testCase.name}: check exited ${result.status}; expected 0\n${result.output}`);
  }
}

async function runCases(cases) {
  for (const testCase of cases) {
    const folder = testCase.copy?.() ?? copyValid();
    await testCase.plant(folder);
    if (testCase.redigest !== false) await writeCorpusIndex(folder);
    const result = runCli(['check', '--evaluation', folder]);
    const label = `${testCase.name}: `;
    check(result.status === 10, `${label}check exited ${result.status}; expected 10\n${result.output}`);
    check(
      result.stdout.includes(`${testCase.file}: [${testCase.rule}]`),
      `${label}no finding names ${testCase.file} and rule ${testCase.rule}\n${result.output}`,
    );
    for (const [ok, message] of testCase.expect?.(result.output, result.stdout) ?? []) check(ok, `${label}${message}\n${result.output}`);
    if (testCase.digestExit !== undefined) {
      const digest = runCli(['digest', '--evaluation', folder]);
      check(
        digest.status === testCase.digestExit,
        `${label}digest exited ${digest.status}; expected ${testCase.digestExit}\n${digest.output}`,
      );
      const names = testCase.digestNames ?? `${testCase.file}: [${testCase.rule}]`;
      check(digest.stdout.includes(names), `${label}digest did not print ${names}\n${digest.output}`);
    }
  }
}

async function checkDefectCases() {
  await runCases(DEFECT_CASES);
  const covered = new Set(DEFECT_CASES.map((testCase) => testCase.rule));
  for (const rule of STORY_RULES) check(covered.has(rule), `no defect case covers the story's ${rule} rule`);
  await runCases(HARDENING_CASES);
  await runCases(EVALUATOR_CASES);
  await runCases(FRAMEWORK_CASES);
  await runCases([
    {
      name: 'held-out unknown ID',
      file: 'evaluation.json',
      rule: 'held-out',
      plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.heldOutProbes = ['P-999'])),
    },
    {
      name: 'held-out clean control',
      file: 'evaluation.json',
      rule: 'held-out',
      plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.heldOutProbes = ['P-001'])),
    },
    {
      name: 'held-out sole probe for a behavior',
      file: 'evaluation.json',
      rule: 'held-out',
      plant: (folder) => {
        editJson(folder, 'evaluation.json', (value) => (value.heldOutProbes = ['P-002']));
        editJson(folder, 'probes/P-002.probe.json', (value) => {
          value.behaviorId = 'B-002';
          value.defects[0].behaviorId = 'B-002';
        });
      },
    },
    {
      name: 'held-out malformed probe defects',
      file: 'probes/P-002.probe.json',
      rule: 'schema',
      plant: (folder) => {
        editJson(folder, 'evaluation.json', (value) => (value.heldOutProbes = ['P-002']));
        editJson(folder, 'probes/P-002.probe.json', (probe) => (probe.defects = {}));
      },
    },
    {
      name: 'rubric with no calibration criterion item',
      file: 'policy/judge-calibration.json',
      rule: 'judge-calibration',
      plant: (folder) => {
        plantRubric(folder);
        fs.writeFileSync(path.join(folder, 'policy/judge-calibration.json'), '{"items":[]}\n');
      },
    },
    {
      name: 'malformed rubric criterion beside calibration',
      file: 'contract.json',
      rule: 'engine-schema',
      plant: (folder) => {
        plantRubric(folder);
        editJson(folder, 'contract.json', (contract) => (contract.rubrics[0].criteria[0] = null));
      },
      expect: (output) => [
        [output.includes('contract rubrics must be valid before judge calibration'), 'calibration did not refuse the malformed rubric'],
      ],
    },
    {
      name: 'rubric with an anchored level missing',
      file: 'policy/judge-calibration.json',
      rule: 'judge-calibration',
      plant: (folder) => {
        plantRubric(folder);
        editJson(folder, 'policy/judge-calibration.json', (value) => value.items.pop());
      },
    },
    {
      name: 'rubric with no minimum agreement',
      file: 'policy/judge-calibration.json',
      rule: 'judge-calibration',
      plant: (folder) => {
        plantRubric(folder);
        editJson(folder, 'evaluation.json', (value) => delete value.judgeCalibration.minimumAgreement);
      },
    },
    {
      name: 'rubric calibration file reached through a link',
      file: 'policy/judge-calibration.json',
      rule: 'judge-calibration',
      redigest: false,
      plant: (folder) => {
        plantRubric(folder);
        const file = path.join(folder, 'policy/judge-calibration.json');
        fs.renameSync(file, `${file}.real`);
        fs.symlinkSync(path.basename(`${file}.real`), file);
      },
      expect: (output) => [[output.includes('regular in-folder file'), 'the finding does not refuse the link']],
    },
    {
      name: 'rubric calibration file replaced by a FIFO',
      file: 'policy/judge-calibration.json',
      rule: 'judge-calibration',
      redigest: false,
      plant: (folder) => {
        plantRubric(folder);
        const file = path.join(folder, 'policy/judge-calibration.json');
        fs.unlinkSync(file);
        const made = spawnSync('mkfifo', [file]);
        if (made.status !== 0) throw new Error(`mkfifo failed: ${made.stderr}`);
      },
      expect: (output) => [[output.includes('regular in-folder file'), 'the finding does not refuse the FIFO']],
    },
  ]);
  await runCleanCases();

  // Two defects in one copy: both are listed, not only the first.
  const folder = copyValid();
  editJson(folder, 'mutations/M-001.mutation.json', (value) => (value.operator.kind = 'regex-replace'));
  editJson(folder, 'contract.json', (value) => (value.permittedInterfaces[0].kind = 'web'));
  await writeCorpusIndex(folder);
  const both = runCli(['check', '--evaluation', folder]);
  check(both.status === 10, `two planted defects exited ${both.status}; expected 10`);
  check(
    both.stdout.includes('[mutation-operator]') && both.stdout.includes('[web-interface]'),
    `two planted defects did not both appear in the findings\n${both.output}`,
  );
}

/** A symbolic link under an indexed root is an authoring finding for both subcommands, never a crash. */
function checkSymlinkRefused() {
  const folder = copyValid();
  fs.symlinkSync(path.join(folder, 'corpus', 'reservations', 'docs', 'story.md'), path.join(folder, 'corpus', 'linked.md'));
  for (const subcommand of ['check', 'digest']) {
    const result = runCli([subcommand, '--evaluation', folder]);
    check(result.status === 10, `${subcommand} over a symbolic link in corpus/ exited ${result.status}; expected 10\n${result.output}`);
    check(result.stdout.includes('corpus/linked.md: [corpus-file]'), `${subcommand} did not name the symbolic link\n${result.output}`);
  }
}

/**
 * A file name holding a newline cannot print a finding line of its own: the
 * name is quoted and escaped, and every line either subcommand prints is a
 * finding naming the file or the summary.
 */
function checkForgedFindingLine() {
  const folder = copyValid();
  const forged = 'x\nforged.md: [schema] forged';
  fs.symlinkSync(path.join(folder, 'corpus', 'reservations', 'docs', 'story.md'), path.join(folder, 'corpus', forged));
  for (const subcommand of ['check', 'digest']) {
    const result = runCli([subcommand, '--evaluation', folder]);
    check(result.status === 10, `${subcommand} over a file name holding a newline exited ${result.status}; expected 10\n${result.output}`);
    const lines = result.stdout.split('\n').filter((line) => line.length > 0);
    check(!lines.some((line) => line.startsWith('forged.md')), `${subcommand} printed a line the file name forged\n${result.stdout}`);
    check(
      lines.some((line) => line.startsWith(`${JSON.stringify(`corpus/${forged}`)}: [corpus-file]`)),
      `${subcommand} did not print the file name quoted and escaped\n${result.stdout}`,
    );
  }
}

// ---------------------------------------------------------------------------
// digest

async function checkDigestUnit() {
  const folder = tempDir('index');
  const write = (relative, text) => {
    fs.mkdirSync(path.dirname(path.join(folder, relative)), { recursive: true });
    fs.writeFileSync(path.join(folder, relative), text);
  };
  // Written out of order, with files outside the three indexed roots beside them.
  write('probes/P-010.probe.json', '{}\n');
  write('corpus/z.txt', 'z');
  write('corpus/b/a.txt', 'nested');
  write('mutations/M-001.mutation.json', '{"m":1}\n');
  write('corpus/a.txt', 'a');
  write('evaluation.json', '{}');
  write('baseline/qualification/x.json', '{}');
  write('runs/r.json', '{}');
  const index = await buildCorpusIndex(folder);
  const expected = ['corpus/a.txt', 'corpus/b/a.txt', 'corpus/z.txt', 'mutations/M-001.mutation.json', 'probes/P-010.probe.json'];
  check(
    JSON.stringify(index.map((entry) => entry.path)) === JSON.stringify(expected),
    `buildCorpusIndex listed ${JSON.stringify(index.map((entry) => entry.path))}; expected ${JSON.stringify(expected)}`,
  );
  for (const entry of index) {
    const bytes = fs.readFileSync(path.join(folder, entry.path));
    check(entry.sha256 === sha256Hex(bytes), `buildCorpusIndex recorded the wrong sha256 for ${entry.path}`);
    check(/^[0-9a-f]{64}$/.test(entry.sha256), `buildCorpusIndex recorded a sha256 that is not 64 lowercase hex for ${entry.path}`);
    check(JSON.stringify(Object.keys(entry)) === '["path","sha256"]', `an index entry carries keys other than path and sha256`);
  }
}

async function checkDigestIntegration() {
  const engine = await loadEngine();
  const folder = copyValid();
  fs.rmSync(path.join(folder, 'corpus-index.json'));
  const first = runCli(['digest', '--evaluation', folder]);
  check(first.status === 0, `digest exited ${first.status}; expected 0\n${first.output}`);
  const written = fs.readFileSync(path.join(folder, 'corpus-index.json'), 'utf8');
  const index = JSON.parse(written);
  check(written === engine.serializeArtifact(index, 'corpus-index.json'), 'digest did not write the index through serializeArtifact');
  const expectedDigest = engine.digestArtifact(index, 'corpus-index.json');
  check(
    first.stdout.trim() === expectedDigest,
    `digest printed ${first.stdout.trim()}; digestArtifact over the index is ${expectedDigest}`,
  );
  const paths = index.map((entry) => entry.path);
  check(JSON.stringify(paths) === JSON.stringify([...paths].sort()), 'the written index is not sorted by path');
  check(
    paths.every((entry) => /^(corpus|probes|mutations)\//.test(entry)) && paths.some((entry) => entry.startsWith('corpus/')),
    `the written index does not cover exactly corpus/, probes/ and mutations/: ${JSON.stringify(paths)}`,
  );

  const clean = runCli(['check', '--evaluation', folder]);
  check(clean.status === 0, `check after digest exited ${clean.status}; expected 0\n${clean.output}`);

  // A corpus/ byte change moves the digest; a digest over probes alone would not.
  fs.appendFileSync(path.join(folder, 'corpus', 'reservations', 'src', 'reservations.js'), '\n');
  const second = runCli(['digest', '--evaluation', folder]);
  check(second.status === 0, `the second digest exited ${second.status}; expected 0`);
  check(second.stdout.trim() !== first.stdout.trim(), 'corpusDigest did not move when a corpus/ byte changed');

  // The committed fixture index is current: formatting aside, it digests to what digest computes.
  const fixtureIndex = JSON.parse(fs.readFileSync(path.join(VALID, 'corpus-index.json'), 'utf8'));
  check(engine.digestArtifact(fixtureIndex, 'corpus-index.json') === expectedDigest, 'the committed fixture corpus-index.json is stale');
}

/**
 * Story 1.115: `digest --file` prints eval-quality's `digestBytes` over one file the folder holds, writes nothing, and exits 64
 * for a path outside the folder, a link at any component, a directory, a missing file or anything that is not a regular file.
 */
async function checkDigestFile() {
  const engine = await loadEngine();
  /** Every entry under the folder, a link as itself and a file by its bytes' digest. */
  const treeOf = (directory) =>
    fs
      .readdirSync(directory, { withFileTypes: true, recursive: true })
      .map((entry) => {
        const full = path.join(entry.parentPath, entry.name);
        const label = path.relative(directory, full);
        if (entry.isSymbolicLink()) return `${label}: link`;
        return entry.isFile()
          ? `${label}: ${sha256Hex(fs.readFileSync(full))}`
          : `${label}: ${entry.isDirectory() ? 'directory' : 'other'}`;
      })
      .sort();
  const folder = copyValid();
  fs.rmSync(path.join(folder, 'corpus-index.json'));
  const statement = path.join(folder, 'requirements.md');
  const ask = (file, extra = []) => runCli(['digest', '--evaluation', folder, '--file', file, ...extra]);
  const before = treeOf(folder);

  const printed = ask('requirements.md');
  const expected = engine.digestBytes(fs.readFileSync(statement));
  check(printed.status === 0, `digest --file exited ${printed.status}; expected 0\n${printed.output}`);
  check(printed.stdout === `${expected}\n`, `digest --file printed ${JSON.stringify(printed.stdout)}; expected ${expected} and a newline`);
  check(
    /^sha256:[0-9a-f]{64}\n$/.test(printed.stdout),
    `digest --file printed ${JSON.stringify(printed.stdout)}; expected sha256: and 64 hex digits`,
  );
  check(printed.stderr === '', `digest --file wrote to stderr: ${printed.stderr}`);
  check(
    JSON.stringify(treeOf(folder)) === JSON.stringify(before) && !fs.existsSync(path.join(folder, 'corpus-index.json')),
    'digest --file changed the evaluation folder or wrote corpus-index.json',
  );

  // The digest is over the bytes: a path spelled differently, a nested file, the manifest named by evaluation.json and an empty file.
  const named = runCli(['digest', '--evaluation', path.join(folder, 'evaluation.json'), '--file', './requirements.md']);
  check(
    named.status === 0 && named.stdout === printed.stdout,
    `--evaluation naming evaluation.json with ./requirements.md printed ${named.stdout}`,
  );
  const nested = ask('corpus/reservations/src/reservations.js');
  check(
    nested.status === 0 &&
      nested.stdout.trim() === engine.digestBytes(fs.readFileSync(path.join(folder, 'corpus', 'reservations', 'src', 'reservations.js'))),
    `digest --file over a nested file printed ${nested.stdout}${nested.stderr}`,
  );
  fs.writeFileSync(path.join(folder, 'empty.md'), '');
  const empty = ask('empty.md');
  check(
    empty.status === 0 && empty.stdout.trim() === EMPTY_DIGEST,
    `digest --file over an empty file printed ${empty.stdout}; expected ${EMPTY_DIGEST}`,
  );
  fs.rmSync(path.join(folder, 'empty.md'));

  // One byte changes the digest, and it is the digest of the new bytes.
  fs.appendFileSync(statement, ' ');
  const changed = ask('requirements.md');
  check(
    changed.status === 0 && changed.stdout !== printed.stdout && changed.stdout.trim() === engine.digestBytes(fs.readFileSync(statement)),
    `digest --file after one byte changed printed ${changed.stdout}; expected a new digest of the new bytes`,
  );
  fs.writeFileSync(statement, fs.readFileSync(path.join(VALID, 'requirements.md')));

  // Each refusal exits 64, prints nothing on stdout, names the path in one line on stderr and writes nothing.
  const outside = tempDir('outside');
  fs.writeFileSync(path.join(outside, 'secret.md'), 'outside the folder\n');
  fs.mkdirSync(path.join(outside, 'directory'));
  fs.writeFileSync(path.join(outside, 'directory', 'inner.md'), 'inner\n');
  fs.symlinkSync(statement, path.join(folder, 'linked-requirements.md'));
  fs.symlinkSync(path.join(outside, 'secret.md'), path.join(folder, 'linked-outside.md'));
  fs.symlinkSync(path.join(outside, 'directory'), path.join(folder, 'linked-directory'), 'dir');
  fs.symlinkSync(path.join(folder, 'corpus'), path.join(folder, 'linked-corpus'), 'dir');
  const outsideSpelling = path.relative(folder, path.join(outside, 'secret.md')).split(path.sep).join('/');
  check(
    outsideSpelling.startsWith('../') && fs.existsSync(path.resolve(folder, outsideSpelling)),
    `the outside file is spelled ${outsideSpelling}; expected a ../ path to a file that exists`,
  );
  const refused = [
    ['a parent segment', '../outside.md', /\.\./],
    ['a parent segment that returns inside', 'corpus/../requirements.md', /\.\./],
    ['a parent segment to a file that exists outside the folder', outsideSpelling, /\.\./],
    ['an absolute path outside the folder', path.join(outside, 'secret.md'), /absolute/],
    ['an absolute path inside the folder', statement, /absolute/],
    ['a link to a file in the folder', 'linked-requirements.md', /symbolic link/],
    ['a link to a file outside the folder', 'linked-outside.md', /symbolic link/],
    ['a link to a directory outside the folder', 'linked-directory/inner.md', /symbolic link/],
    ['a link to a directory in the folder', 'linked-corpus/reservations/src/reservations.js', /symbolic link/],
    ['a directory', 'corpus', /directory/],
    ['the folder itself', '.', /directory/],
    ['a file the folder does not hold', 'absent.md', /does not exist/],
    ['a file below a file', 'requirements.md/inner.md', /not a directory/],
    ['an empty path', '', /names no file/],
  ];
  const afterLinks = treeOf(folder);
  for (const [label, file, reason] of refused) {
    const result = ask(file);
    check(result.status === 64, `digest --file over ${label} exited ${result.status}; expected 64\n${result.output}`);
    check(result.stdout === '', `digest --file over ${label} printed on stdout: ${result.stdout}`);
    check(
      result.stderr.trimEnd().split('\n').length === 1 && reason.test(result.stderr),
      `digest --file over ${label} wrote ${JSON.stringify(result.stderr)}; expected one line matching ${reason}`,
    );
    check(!fs.existsSync(path.join(folder, 'corpus-index.json')), `digest --file over ${label} wrote corpus-index.json`);
  }
  check(JSON.stringify(treeOf(folder)) === JSON.stringify(afterLinks), 'a refused digest --file changed the evaluation folder');

  if (process.platform !== 'win32') {
    const fifo = path.join(folder, 'pipe.md');
    const made = spawnSync('mkfifo', [fifo], { encoding: 'utf8' });
    check(made.status === 0, `could not create the FIFO fixture: ${made.stderr}`);
    if (made.status === 0) {
      const piped = ask('pipe.md');
      check(
        piped.status === 64 && piped.stdout === '' && /regular file/.test(piped.stderr),
        `digest --file over a FIFO exited ${piped.status}\n${piped.output}`,
      );
    }
  }

  // The two options exclude each other, and the option needs a path and an evaluation.
  const both = ask('requirements.md', ['--calibration-inputs']);
  check(
    both.status === 64 && both.stdout === '' && /cannot be combined/.test(both.stderr),
    `--file with --calibration-inputs exited ${both.status}\n${both.output}`,
  );
  const bare = runCli(['digest', '--evaluation', folder, '--file']);
  check(bare.status === 64 && bare.stdout === '', `--file with no path exited ${bare.status}; expected 64\n${bare.output}`);
  const unnamed = runCli(['digest', '--file', 'requirements.md']);
  check(
    unnamed.status === 64 && unnamed.stdout === '',
    `--file with no --evaluation exited ${unnamed.status}; expected 64\n${unnamed.output}`,
  );

  // The option is listed in the command's help, its header and the reference.
  const help = runCli(['digest', '--help']);
  check(help.status === 0 && help.stdout.includes('--file <path>'), `digest --help does not list --file\n${help.output}`);
  const header = fs.readFileSync(CLI, 'utf8').split("'use strict';")[0];
  check(
    header.includes('tea-evaluate digest --evaluation <path> [--calibration-inputs | --file <path>]'),
    "cli/evaluate.js's header does not list --file",
  );
  const page = fs.readFileSync(path.join(PROJECT_ROOT, 'docs', 'reference', 'tea-evaluate-cli.md'), 'utf8');
  for (const text of ['tea-evaluate digest --evaluation evals/my-evaluation --file requirements.md', '`digestBytes`', 'exits 64'])
    check(page.includes(text), `the reference does not say ${JSON.stringify(text)}`);
}

function checkEngineCliPath() {
  const shim = path.join(os.tmpdir(), 'tea-evaluate-engine-shim.js');
  check(engineCliPath({ [ENGINE_CLI_ENV]: shim }) === shim, `${ENGINE_CLI_ENV} does not substitute the engine CLI path`);
  const resolved = engineCliPath({});
  check(fs.existsSync(resolved), `engineCliPath resolved ${resolved}, which does not exist`);
  const version = spawnSync(process.execPath, [resolved, '--version'], { encoding: 'utf8' });
  check(version.status === 0, `the resolved engine CLI does not run (exit ${version.status})`);
}

// ---------------------------------------------------------------------------
// Packed install

function npm(args, cwd) {
  const result = spawnSync('npm', args, { cwd, encoding: 'utf8', timeout: 600_000, env: process.env });
  if (result.error) throw result.error;
  return result;
}

/**
 * npm's own registry fetch failures. The packed install resolves TeA's
 * production dependencies from the registry, so an outage fails it for a reason
 * unrelated to TeA; naming it apart keeps it from ever reading as the
 * missing-module failure this case exists to catch.
 */
const REGISTRY_FAILURE = /\b(?:code )?(ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|E5\d\d)\b/;

/** The registry failure code in npm's output, or null when the failure is something else. */
function registryFailure(output) {
  return REGISTRY_FAILURE.exec(output)?.[1] ?? null;
}

function checkRegistryClassification() {
  const cases = [
    ['npm error code ENOTFOUND\nnpm error network request to https://registry.npmjs.org/ajv failed', 'ENOTFOUND'],
    ['npm error code ETIMEDOUT', 'ETIMEDOUT'],
    ['npm error code ECONNRESET', 'ECONNRESET'],
    ['npm error code E503\nnpm error 503 Service Unavailable - GET https://registry.npmjs.org/ajv', 'E503'],
    ["Error: Cannot find module 'ajv/dist/2020'", null],
    ['npm error code ERESOLVE', null],
  ];
  for (const [output, expected] of cases) {
    check(
      registryFailure(output) === expected,
      `registryFailure read ${JSON.stringify(output)} as ${registryFailure(output)}; expected ${expected}`,
    );
  }
}

function describeNpmFailure(step, result) {
  const output = `${result.stdout}${result.stderr}`;
  const code = registryFailure(output);
  return code === null
    ? `${step} exited ${result.status}\n${output}`
    : `registry unreachable (${code}) during ${step}: this is an npm registry or network failure, not a TeA packaging defect\n${output}`;
}

function checkPackedInstall() {
  const packDirectory = tempDir('pack');
  const pack = npm(['pack', '--ignore-scripts', '--silent', '--pack-destination', packDirectory], PROJECT_ROOT);
  check(pack.status === 0, describeNpmFailure('npm pack', pack));
  if (pack.status !== 0) return;
  const tarball = path.join(packDirectory, pack.stdout.trim().split('\n').pop());

  const project = tempDir('install');
  fs.writeFileSync(
    path.join(project, 'package.json'),
    `${JSON.stringify({ name: 'tea-evaluate-packed-install', private: true }, null, 2)}\n`,
  );
  const install = npm(['install', '--omit=dev', '--prefer-offline', '--no-audit', '--no-fund', tarball], project);
  check(install.status === 0, describeNpmFailure('installing the packed tarball', install));
  if (install.status !== 0) return;

  // The optional peer is not installed by npm; the adopter installs it. Here it
  // is the repository's own engine directory, linked beside the installed TeA.
  const engineLink = path.join(project, 'node_modules', 'eval-quality');
  check(!fs.existsSync(engineLink), 'npm installed the optional eval-quality peer; peerDependenciesMeta should keep it out');
  fs.rmSync(engineLink, { recursive: true, force: true });
  fs.symlinkSync(path.join(PROJECT_ROOT, 'node_modules', 'eval-quality'), engineLink, 'dir');

  const bin = path.join(project, 'node_modules', '.bin', 'tea-evaluate');
  check(fs.existsSync(bin), 'the packed install registers no tea-evaluate bin');
  const run = spawnSync(bin, ['check', '--evaluation', VALID], { cwd: project, encoding: 'utf8' });
  check(
    run.status === 0,
    `tea-evaluate check from the packed install exited ${run.status}; expected 0\n${run.stdout}${run.stderr}${run.error ?? ''}`,
  );

  // The generic skill runner ships as a bin and runs from the tarball over the
  // repository's stub agent (Story 1.6).
  const runnerBin = path.join(project, 'node_modules', '.bin', 'tea-skill-runner');
  check(fs.existsSync(runnerBin), 'the packed install registers no tea-skill-runner bin');
  const stub = spawnSync(
    runnerBin,
    [
      '--skill-root',
      'test/fixtures/evaluate/stub-agent/skill',
      '--agent',
      'custom',
      '--agent-cmd',
      'test/fixtures/evaluate/stub-agent/agent.js',
    ],
    { cwd: PROJECT_ROOT, input: 'Say alpha.', encoding: 'utf8' },
  );
  check(
    stub.status === 0 && stub.stdout.includes('skill: stub-skill'),
    `tea-skill-runner from the packed install exited ${stub.status}; expected 0 naming the stub skill\n${stub.stdout}${stub.stderr}${stub.error ?? ''}`,
  );

  // The runtime modules no subcommand loads yet still load from the tarball,
  // with their dependencies: a registry builds a policy, a record builder
  // stamps its version, and a digest runs.
  const installed = path.join(project, 'node_modules', TEA_MANIFEST.name, 'cli', 'lib', 'evaluate');
  const script = [
    `const registry = require(${JSON.stringify(path.join(installed, 'registry.js'))});`,
    `const records = require(${JSON.stringify(path.join(installed, 'records.js'))});`,
    `const digest = require(${JSON.stringify(path.join(installed, 'digest.js'))});`,
    `const probe = require(${JSON.stringify(path.join(installed, 'bounded-probe.js'))});`,
    `const formats = require(${JSON.stringify(path.join(installed, 'formats.js'))});`,
    `const entries = require(${JSON.stringify(path.join(VALID, 'evaluation.json'))}).registry;`,
    'const policy = registry.createRegistry(entries, { root: process.cwd() }).commandTargetPolicy({ cwd: process.cwd() });',
    'if (policy.authorizations.length !== entries.length) process.exit(3);',
    'if (!Number.isInteger(records.sealedRunRecord({}).schemaVersion)) process.exit(4);',
    "if (!/^sha256:/.test(digest.digest('x')) || typeof probe.boundedProbe !== 'function') process.exit(5);",
    "if (!formats.isDateTime('2026-09-23T00:00:00Z')) process.exit(6);",
  ].join('\n');
  const modules = spawnSync(process.execPath, ['-e', script], { cwd: project, encoding: 'utf8' });
  check(modules.status === 0, `the runtime modules do not load from the packed install (exit ${modules.status})\n${modules.stderr}`);
}

async function main() {
  try {
    await checkValidFixture();
    await checkRequirementsStatement();
    await checkEveryEvaluationHasItsStatement();
    checkRegistry();
    checkEngineAbsent();
    checkUsage();
    await checkDefectCases();
    await checkWindowsRunnerBudget();
    checkOperationPhaseCoverage();
    checkReportOperationReusedAcrossInterfaces();
    await checkReportSignatureCollision();
    checkInterfaceIdentifierRepeat();
    await checkReportCollidingWithAnyOperation();
    checkSymlinkRefused();
    checkForgedFindingLine();
    await checkRuntimeUnits();
    await checkDigestUnit();
    await checkDigestIntegration();
    await checkDigestFile();
    checkEngineCliPath();
    checkRegistryClassification();
    checkPackedInstall();
  } finally {
    scratch.removeAll();
  }

  if (failures.length > 0) {
    console.error(`${colors.red}${failures.length} of ${checks} tea-evaluate check(s) failed:${colors.reset}`);
    for (const failure of failures) console.error(`  - ${failure}`);
    return 1;
  }
  console.log(`${colors.green}ok${colors.reset} all ${checks} tea-evaluate check(s) passed`);
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
