/**
 * `tea-evaluate` over a workflow target, end to end over the real installed
 * eval-quality (Story 1.18, AD-4, AD-7, AD-8).
 *
 * Every pipeline case copies `test/fixtures/evaluate-workflow/` (a record
 * store whose `create` operation mints a fresh identifier on every run and
 * whose `read` operation takes one back) into a temp directory outside git, so
 * its `copy` workspace (AD-8) is what every leg and trial runs in. Its
 * contract lists the `read-back` step before `create`, with `after: "create"`
 * and a `{ captured }` binding to the identifier `create` printed, and M-001
 * makes `create` store the record under another identifier than the one it
 * prints. `RECORDS_LOG` makes every run of the store append the operation, its
 * workspace and the identifier a read was given to a log the test reads.
 *
 * - The pipeline: `check`, `preflight`, `run` and `score`. Every arm issues
 *   `create` before `read-back`, whose `callInputs` carry the identifier the
 *   same trial's `create` observation printed, a fresh one in every trial, and
 *   the observations' `sequence` follows that order; preflight passes, the
 *   clean arm resolves `passed-clean-control` and the mutated arm `caught`.
 * - A missing captured value: with `RECORDS_OMIT_ID` naming the mutated trials'
 *   workspaces, `create` prints no identifier there, `read-back` is never
 *   issued and has no observation, the trial's evidence lists it as skipped,
 *   and the seeded probe's outcome in the evidence artifact is not `caught`.
 * - A cycle: a contract whose capture and `after` edges form one stops
 *   `preflight` and `run` with `eval-quality compile`'s exit 4 and its
 *   `binding-cycle` message, byte for byte what the engine prints over the
 *   same contract, before any arm runs.
 * - Units: the arm executor's order over `after` and capture edges, a captured
 *   value read from the earlier observation, a step skipped for a value its
 *   source lacks or a source that was skipped, a skipped `after` step, and the
 *   refusals.
 * - The reference: `docs/reference/tea-evaluate-cli.md` names the binding
 *   kinds the runtime sends and the steps it does not issue, each passage read
 *   under its exact heading.
 *
 * Usage: node test/test-evaluate-workflow.js
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { ENGINE_CLI_ENV, engineCliPath } = require('../cli/lib/evaluate/engine');
const { ArmError, runArm } = require('../cli/lib/evaluate/arm');
const { syntheticPort } = require('../cli/lib/evaluate/gameability');
const { createRegistry } = require('../cli/lib/evaluate/registry');
const { WorkspaceRefusal, createWorkspace, removeWorkspace } = require('../cli/lib/evaluate/workspace');
const { scratchDirectories } = require('./lib/scratch-directories');

const PROJECT_ROOT = path.join(__dirname, '..');
const EVALUATE = path.join(PROJECT_ROOT, 'cli', 'evaluate.js');
const FIXTURE = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate-workflow');
const EVALUATION = path.join('evals', 'records');
const REFERENCE = path.join(PROJECT_ROOT, 'docs', 'reference', 'tea-evaluate-cli.md');
const TRIALS = 3;
const TITLE = 'Ship the workflow';
const CAPTURE = '/interactions/create/stdout/id';
/**
 * The workspaces of the mutated arm's trials, which the runtime labels by arm and trial: the store reads its label off
 * the temp directory holding its working directory (`tea-evaluate-<label>-XXXXXX`), as the verdict stub's
 * `VERDICT_WHEN` does. A runtime that named them otherwise would leave the identifier printed, and the missing-value case
 * fails on the read-back it then records.
 */
const MUTATED_TRIALS = Array.from({ length: TRIALS }, (_, index) => `trial-mutated-M-001-${index + 1}`);

const BASE_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => name !== ENGINE_CLI_ENV && !name.startsWith('RECORDS_') && !name.startsWith('GIT_')),
);
const SPAWN_TIMEOUT_MS = 180_000;

const colors = { reset: '\u001B[0m', red: '\u001B[31m', green: '\u001B[32m' };

const failures = [];
let checks = 0;
const scratch = scratchDirectories('tea-evaluate-workflow');
/** Each project's private temp directory, which every run and score must leave empty. */
const runtimeTemps = [];

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** A file a run may not have written, parsed, or null, so a case reports what is missing and goes on. */
function readIfPresent(file) {
  return fs.existsSync(file) ? readJson(file) : null;
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function editJson(file, edit) {
  const value = readJson(file);
  edit(value);
  writeJson(file, value);
}

function evaluate(args, env = {}) {
  const result = spawnSync(process.execPath, [EVALUATE, ...args], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    env: { ...BASE_ENV, ...env },
    timeout: SPAWN_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
  if (result.error) throw new Error(`tea-evaluate ${args.join(' ')} did not finish: ${result.error.message}`);
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

/** A copy of the fixture outside git, `edit` applied and the corpus index digested again, with a private temp directory and the store's log. */
function makeProject(label, { edit = () => {} } = {}) {
  const directory = scratch.make(label);
  const root = path.join(directory, 'project');
  fs.cpSync(FIXTURE, root, { recursive: true, filter: (from) => path.basename(from) !== 'runs' });
  const folder = path.join(root, EVALUATION);
  const log = path.join(directory, 'records.jsonl');
  const temp = scratch.make(`${label}-temp`);
  runtimeTemps.push({ label, directory: temp });
  const project = { root, folder, log, directory, env: { TMPDIR: temp, TMP: temp, TEMP: temp, RECORDS_LOG: log } };
  edit(project);
  const digested = evaluate(['digest', '--evaluation', folder]);
  if (digested.status !== 0) throw new Error(`digest failed: ${digested.output}`);
  return project;
}

/** Every line the store's runs logged, in the order they ran. */
function logLines(project) {
  return fs.existsSync(project.log)
    ? fs
        .readFileSync(project.log, 'utf8')
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line))
    : [];
}

/** The newest run directory under `runs/`. */
function runDirectoryOf(folder) {
  const runs = path.join(folder, 'runs');
  const names = fs.existsSync(runs) ? fs.readdirSync(runs).filter((name) => name !== '.gitignore') : [];
  return names.length === 0 ? null : path.join(runs, names.sort().at(-1));
}

/** Scores the newest run and returns each probe's evidence artifact by probe. */
function scoreRun(project, what) {
  const scored = evaluate(['score', '--evaluation', project.folder], project.env);
  check(scored.status === 0, `${what}: score exited ${scored.status}; expected 0\n${scored.output}`);
  const scores = path.join(runDirectoryOf(project.folder) ?? '', 'scores');
  const latest = fs.existsSync(scores) ? fs.readdirSync(scores).sort().at(-1) : undefined;
  if (latest === undefined) return {};
  const evidence = {};
  for (const probeId of fs.readdirSync(path.join(scores, latest))) {
    const file = path.join(scores, latest, probeId, 'evidence-artifact.json');
    evidence[probeId] = fs.existsSync(file) ? readJson(file) : null;
  }
  return evidence;
}

/** One probe's trial votes, read from its evidence artifact. */
function votesOf(evidence, probeId) {
  return (evidence[probeId]?.reducedProbeOutcomes?.[0]?.trialVotes ?? []).map((vote) => vote.state);
}

/** The trial records of one probe's set, read from the run directory. */
function recordsOf(runDirectory, probeId) {
  const index = readJson(path.join(runDirectory, 'trial-sets.json'));
  const set = index.trialSets.find((candidate) => candidate.probeId === probeId);
  return set === undefined ? [] : set.records.map((relative) => readJson(path.join(runDirectory, relative)));
}

/** A record's observation for one plan step, by the observation ID the runtime gives it (`trial-<n>-<stepId>`). */
function observationOf(record, stepId) {
  return record.observations.find((observation) => observation.observationId === `trial-${record.trialIndex}-${stepId}`);
}

/** The identifier a create observation printed, or undefined when its stdout holds none. */
function printedId(observation) {
  return observation?.stdout?.kind === 'json' ? observation.stdout.value?.id : undefined;
}

// ---------------------------------------------------------------- units

/**
 * A port that answers each request from `answers` by step (the request's `probeId` less the arm's label) and logs what
 * it sent; a step `exitCodes` names exits with that code.
 */
function scriptedPort(label, answers, exitCodes = {}) {
  const sent = [];
  return {
    sent,
    probe: async (request) => {
      const stepId = request.probeId.slice(label.length + 1);
      sent.push({ stepId, channels: request.channels });
      const stdout = answers[stepId] ?? '';
      return {
        request,
        observation: {
          probeId: request.probeId,
          interfaceId: request.interfaceId,
          operationId: request.operationId,
          kind: 'cli',
          exitCode: exitCodes[stepId] ?? 0,
          stdout: typeof stdout === 'string' ? { kind: 'text', value: stdout } : { kind: 'json', value: stdout },
          stderr: { kind: 'text', value: '' },
          artifacts: {},
        },
      };
    },
  };
}

const UNIT_REGISTRY = { targetFor: () => ({ infrastructureExitCodes: [3] }) };

/** A plan step over the fixture's operations, `option` and `stdin` its bindings. */
function planStep(stepId, operationId, { after = null, option = null, stdin = null } = {}) {
  return { stepId, operationId, after, cardinality: 'exactly-one', inputBinding: { argument: null, option, environment: null, stdin } };
}

async function runUnitArm(plan, answers, { label = 'unit', exitCodes = {} } = {}) {
  const contract = { ...readJson(path.join(FIXTURE, EVALUATION, 'contract.json')), interactionPlan: plan };
  const port = scriptedPort(label, answers, exitCodes);
  const arm = await runArm({ contract, port, registry: UNIT_REGISTRY, label });
  return { arm, sent: port.sent };
}

async function armError(plan, answers) {
  try {
    await runUnitArm(plan, answers);
  } catch (error) {
    return error;
  }
  return null;
}

/**
 * A captured value read off an HTTP answer's body and a tool call's structured result, the channel each kind's
 * response descriptor describes, and sent in a path parameter and a tool argument; a header bound to a captured
 * value that is no string cannot be sent.
 */
async function checkOtherKinds() {
  const operation = (operationId, extra) => ({ operationId, ...extra });
  const contract = {
    permittedInterfaces: [
      {
        logicalId: 'items',
        kind: 'api',
        operations: [
          operation('post-item', { method: 'POST', pathTemplate: '/items' }),
          operation('get-item', { method: 'GET', pathTemplate: '/items/{id}' }),
        ],
      },
      { logicalId: 'tools', kind: 'mcp', operations: [operation('describe', { toolName: 'describe' })] },
    ],
  };
  const sent = [];
  const port = {
    probe: async (request) => {
      sent.push(request);
      const correlation = { probeId: request.probeId, interfaceId: request.interfaceId, operationId: request.operationId };
      if (request.kind === 'mcp') {
        return { request, observation: { ...correlation, kind: 'mcp', isError: false, result: { kind: 'json', value: { ok: true } } } };
      }
      const body = request.operationId === 'post-item' ? { id: 'item-7', count: 3 } : { ok: true };
      return { request, observation: { ...correlation, kind: 'api', status: 200, headers: {}, body: { kind: 'json', value: body } } };
    },
  };
  const apiStep = (stepId, operationId, bound) => ({
    stepId,
    operationId,
    after: null,
    cardinality: 'exactly-one',
    inputBinding: { path: null, query: null, header: null, body: null, ...bound },
  });
  const plan = [
    {
      stepId: 'describe',
      operationId: 'describe',
      after: null,
      cardinality: 'exactly-one',
      inputBinding: { arguments: { item: { captured: '/interactions/get/response-body/ok' } } },
    },
    apiStep('get', 'get-item', { path: { id: { captured: '/interactions/post/response-body/id' } } }),
    apiStep('post', 'post-item', { body: { name: { literal: 'seven' } } }),
  ];
  const arm = await runArm({ contract: { ...contract, interactionPlan: plan }, port, registry: UNIT_REGISTRY, label: 'kinds' });
  check(
    JSON.stringify(sent.map((request) => request.operationId)) === JSON.stringify(['post-item', 'get-item', 'describe']) &&
      sent[1].channels.path.id === 'item-7' &&
      sent[2].channels.arguments.item === true &&
      JSON.stringify(arm.stepObservations.get.callInputs.path) === JSON.stringify({ id: 'item-7' }) &&
      JSON.stringify(arm.stepObservations.describe.callInputs.arguments) === JSON.stringify({ item: true }),
    `the HTTP and tool-call steps sent ${JSON.stringify(sent.map((request) => request.channels))}`,
  );
  // A header value the earlier answer holds as a number cannot be sent as printed, so the step is not issued.
  const header = await runArm({
    contract: {
      ...contract,
      interactionPlan: [
        plan[2],
        apiStep('get', 'get-item', { header: { 'x-count': { captured: '/interactions/post/response-body/count' } } }),
      ],
    },
    port,
    registry: UNIT_REGISTRY,
    label: 'header',
  });
  check(
    JSON.stringify(header.steps.at(-1)) ===
      JSON.stringify({
        stepId: 'get',
        operationId: 'get-item',
        skipped: {
          reason: 'captured-value-unsendable',
          bindings: [
            {
              binding: 'header.x-count',
              pointer: '/interactions/post/response-body/count',
              reason: 'a header value is a string, and the value is 3',
            },
          ],
        },
      }) && !Object.hasOwn(header.stepObservations, 'get'),
    `a header bound to a captured number recorded ${JSON.stringify(header.steps.at(-1))}`,
  );
  // A header value holding a line break or a character past U+00FF, and a path value that is a dot segment, are values
  // the evaluation's HTTP port cannot send, so the step is not issued.
  for (const [what, printed, bound] of [
    [
      'a header holding a line break',
      { id: 'item-7\r\nx: y' },
      { header: { 'x-id': { captured: '/interactions/post/response-body/id' } } },
    ],
    ['a header past U+00FF', { id: '\u540D\u524D' }, { header: { 'x-id': { captured: '/interactions/post/response-body/id' } } }],
    ['a path dot segment', { id: '..' }, { path: { id: { captured: '/interactions/post/response-body/id' } } }],
  ]) {
    const answering = {
      probe: async (request) => ({
        request,
        observation: {
          probeId: request.probeId,
          interfaceId: request.interfaceId,
          operationId: request.operationId,
          kind: 'api',
          status: 200,
          headers: {},
          body: { kind: 'json', value: printed },
        },
      }),
    };
    const skipped = await runArm({
      contract: { ...contract, interactionPlan: [plan[2], apiStep('get', 'get-item', bound)] },
      port: answering,
      registry: UNIT_REGISTRY,
      label: 'unsendable',
    });
    check(
      skipped.steps.at(-1).skipped?.reason === 'captured-value-unsendable' && !Object.hasOwn(skipped.stepObservations, 'get'),
      `${what} recorded ${JSON.stringify(skipped.steps.at(-1))}`,
    );
  }
}

async function checkUnits() {
  const create = planStep('create', 'create', { stdin: { title: { literal: TITLE } } });
  const readBack = planStep('read-back', 'read-back', { after: 'create', option: { id: { captured: CAPTURE } } });

  // The step that reads a value runs after the step that prints it, wherever the plan lists it.
  const ran = await runUnitArm([readBack, create], { create: { id: 'rec-1', title: TITLE, path: 'store/rec-1.json' } });
  check(
    JSON.stringify(ran.sent.map((entry) => entry.stepId)) === JSON.stringify(['create', 'read-back']) &&
      ran.sent[1].channels.option.id === 'rec-1',
    `the arm sent ${JSON.stringify(ran.sent)}; expected create, then read-back with the identifier create printed`,
  );
  const observations = ran.arm.stepObservations;
  check(
    observations.create?.sequence === 1 &&
      observations['read-back']?.sequence === 2 &&
      JSON.stringify(observations['read-back'].callInputs.option) === JSON.stringify({ id: 'rec-1' }),
    `the arm recorded ${JSON.stringify(observations)}`,
  );

  // A capture orders its step on its own, with no after clause.
  const unanchored = await runUnitArm([{ ...readBack, after: null }, create], { create: { id: 'rec-2' } });
  check(
    JSON.stringify(unanchored.sent.map((entry) => `${entry.stepId}:${entry.channels.option.id ?? ''}`)) ===
      JSON.stringify(['create:', 'read-back:rec-2']),
    `a capture with no after clause sent ${JSON.stringify(unanchored.sent)}`,
  );

  // A value the earlier observation lacks, as a missing field or as output that is not JSON.
  for (const [what, answer] of [
    ['a field its output does not hold', { title: TITLE }],
    ['output that is not JSON', 'created a record\n'],
  ]) {
    const lacking = await runUnitArm([readBack, create], { create: answer });
    const skipped = lacking.arm.steps.find((entry) => entry.stepId === 'read-back');
    check(
      lacking.sent.length === 1 &&
        !Object.hasOwn(lacking.arm.stepObservations, 'read-back') &&
        JSON.stringify(skipped) ===
          JSON.stringify({
            stepId: 'read-back',
            operationId: 'read-back',
            skipped: { reason: 'captured-value-absent', bindings: [{ binding: 'option.id', pointer: CAPTURE }] },
          }),
      `a create whose output is ${what} sent ${JSON.stringify(lacking.sent)} and recorded ${JSON.stringify(lacking.arm.steps)}`,
    );
  }
  // A value the earlier observation holds is sent, a JSON null and a step that failed after printing it included.
  const failed = await runUnitArm([readBack, create], { create: { id: 'rec-3' } }, { exitCodes: { create: 1 } });
  check(
    failed.sent.length === 2 && failed.sent[1].channels.option.id === 'rec-3',
    `a create that exited 1 after printing its identifier sent ${JSON.stringify(failed.sent)}`,
  );
  const nulled = await runUnitArm([readBack, create], { create: { id: null } });
  check(
    nulled.sent.length === 2 && nulled.sent[1].channels.option.id === null,
    `a JSON null the earlier observation holds is a value, sent as it is: ${JSON.stringify(nulled.sent)}`,
  );

  // A step whose source was skipped is skipped for the value it lacks; one whose after step was skipped is skipped for that.
  const chained = await runUnitArm(
    [
      readBack,
      create,
      planStep('reread', 'read-back', { option: { id: { captured: '/interactions/read-back/stdout/id' } } }),
      planStep('after-read', 'read-back', { after: 'read-back', option: { id: { literal: 'r-alpha' } } }),
    ],
    { create: { title: TITLE } },
  );
  const reasons = Object.fromEntries(chained.arm.steps.map((entry) => [entry.stepId, entry.skipped ?? 'issued']));
  check(
    JSON.stringify(reasons) ===
      JSON.stringify({
        create: 'issued',
        'read-back': { reason: 'captured-value-absent', bindings: [{ binding: 'option.id', pointer: CAPTURE }] },
        reread: {
          reason: 'captured-value-absent',
          bindings: [{ binding: 'option.id', pointer: '/interactions/read-back/stdout/id' }],
        },
        'after-read': { reason: 'after-step-not-issued', after: 'read-back' },
      }) && chained.sent.length === 1,
    `a chain over a skipped step recorded ${JSON.stringify(chained.arm.steps)} and sent ${JSON.stringify(chained.sent)}`,
  );

  // An after clause naming no step of the plan orders nothing, as eval-quality reads it.
  const dangling = await runUnitArm(
    [planStep('read-back', 'read-back', { after: 'elsewhere', option: { id: { literal: 'r-alpha' } } })],
    {},
  );
  check(dangling.sent.length === 1, `a step whose after clause names no step was not sent: ${JSON.stringify(dangling.arm.steps)}`);

  // A cycle never reaches an arm past compile; an arm that meets one stops, naming the step.
  const cycle = await armError([planStep('loop', 'read-back', { option: { id: { captured: '/interactions/loop/stdout/id' } } })], {});
  check(
    cycle instanceof ArmError && /step loop waits for loop/.test(cycle.message) && /no order to run in/.test(cycle.message),
    `a self-capture gave ${cycle}`,
  );
  await checkOtherKinds();

  // A captured value the request cannot carry as the target printed it is not sent: one holding a __proto__ key, which
  // eval-quality's request parser drops, and an environment value that is no string.
  const polluted = await runUnitArm([readBack, create], { create: JSON.parse('{"id":{"__proto__":{"x":1}}}') });
  const environment = await runUnitArm(
    [planStep('read-env', 'read-back', { option: { id: { literal: 'r-alpha' } } }), create].map((step) =>
      step.stepId === 'read-env'
        ? {
            ...step,
            after: 'create',
            inputBinding: { ...step.inputBinding, environment: { RECORDS_LOG: { captured: '/interactions/create/stdout/count' } } },
          }
        : step,
    ),
    { create: { id: 'rec-9', count: 4 } },
  );
  check(
    polluted.sent.length === 1 &&
      polluted.arm.steps.at(-1).skipped?.reason === 'captured-value-unsendable' &&
      polluted.arm.steps.at(-1).skipped.bindings[0].reason === 'the value holds a __proto__ key' &&
      environment.sent.length === 1 &&
      environment.arm.steps.at(-1).skipped?.bindings?.[0]?.binding === 'environment.RECORDS_LOG',
    `unsendable captured values recorded ${JSON.stringify([polluted.arm.steps.at(-1), environment.arm.steps.at(-1)])}`,
  );

  // A gameability step's committed answer reads the same on every host: no host value of the registry's keys is
  // scrubbed from it, since nothing launched could have carried one.
  const previous = process.env.RECORDS_OMIT_ID;
  process.env.RECORDS_OMIT_ID = DEGENERATE_ID;
  try {
    const registry = createRegistry(readJson(path.join(FIXTURE, EVALUATION, 'evaluation.json')).registry, { root: FIXTURE });
    const degenerate = await syntheticPort({ label: 'g', steps: DEGENERATE_STEPS, registry }).probe({
      probeId: 'g-create',
      interfaceId: 'records',
      operationId: 'create',
      kind: 'cli',
      executable: 'records',
      subcommandPath: ['create'],
      channels: { argument: {}, option: {}, environment: {}, stdin: { kind: 'text', value: TITLE } },
    });
    check(
      degenerate.observation.stdout.value?.id === DEGENERATE_ID,
      `a degenerate answer holding a host value came back as ${JSON.stringify(degenerate.observation.stdout)}`,
    );
  } finally {
    if (previous === undefined) delete process.env.RECORDS_OMIT_ID;
    else process.env.RECORDS_OMIT_ID = previous;
  }

  // An argument vector holds no NUL character, so an identifier holding one is not sent.
  const nul = await runUnitArm([readBack, create], { create: { id: 'rec-a\u0000b' } });
  check(
    nul.sent.length === 1 && /cannot carry a NUL character/.test(nul.arm.steps.at(-1).skipped?.bindings?.[0]?.reason ?? ''),
    `an identifier holding a NUL character recorded ${JSON.stringify(nul.arm.steps.at(-1))}`,
  );

  // A binding the run cannot send stops the arm whatever the target printed, a skipped after step included.
  for (const unsendable of [{ matcher: 'any' }, { principal: 'reviewer' }]) {
    const refused = await armError(
      [readBack, create, planStep('after-read', 'read-back', { after: 'read-back', option: { id: unsendable } })],
      { create: { title: TITLE } },
    );
    check(
      refused instanceof ArmError && refused.message.includes('literal and captured bindings only'),
      `a step binding ${JSON.stringify(unsendable)} after a skipped step gave ${refused}`,
    );
  }
}

// ---------------------------------------------------------------- the pipeline

/** Asserts every record of `probeId` read back the identifier its own trial's create printed, after it, and returns those identifiers. */
function checkCapturedRecords(what, runDirectory, probeId) {
  const records = recordsOf(runDirectory, probeId);
  check(records.length === TRIALS, `${what}: ${probeId}'s trial set holds ${records.length} records; expected ${TRIALS}`);
  const identifiers = [];
  for (const record of records) {
    const created = observationOf(record, 'create');
    const readBack = observationOf(record, 'read-back');
    const id = printedId(created);
    identifiers.push(id);
    check(
      typeof id === 'string' &&
        readBack?.callInputs?.option?.id === id &&
        created.sequence < readBack.sequence &&
        record.observations.length === 2,
      `${what}: ${probeId} trial ${record.trialIndex} recorded ${JSON.stringify(record.observations)}; expected read-back after create, sent the identifier create printed`,
    );
  }
  return identifiers;
}

async function checkPipeline() {
  const project = makeProject('pipeline');
  const checked = evaluate(['check', '--evaluation', project.folder], project.env);
  check(checked.status === 0, `check over the workflow fixture exited ${checked.status}; expected 0\n${checked.output}`);

  const preflight = evaluate(['preflight', '--evaluation', project.folder], project.env);
  check(preflight.status === 0, `preflight over the workflow fixture exited ${preflight.status}; expected 0\n${preflight.output}`);
  const preflightRun = runDirectoryOf(project.folder);
  const verdict = readIfPresent(path.join(preflightRun ?? '', 'preflight-verdict.json'));
  check(
    verdict?.passed === true && verdict.checks.every((entry) => entry.outcome !== 'failed'),
    `the workflow preflight verdict is ${JSON.stringify(verdict?.checks)}`,
  );
  // The qualification arms bind the read-back to the identifier their own create printed, as every arm does.
  for (const phase of ['baseline-pass', 'mutated-fail']) {
    const file = path.join(preflightRun ?? '', 'qualification', 'P-002', `${phase}.json`);
    const steps = fs.existsSync(file) ? readJson(file).steps : [];
    check(
      JSON.stringify(steps.map((entry) => entry.stepId)) === JSON.stringify(['create', 'read-back']) &&
        steps[1].request?.channels?.option?.id === steps[0].observation?.stdout?.value?.id,
      `P-002's ${phase} arm ran ${JSON.stringify(steps.map((entry) => entry.request?.channels ?? entry))}`,
    );
  }

  fs.rmSync(project.log, { force: true });
  const ran = evaluate(['run', '--evaluation', project.folder], project.env);
  check(ran.status === 0, `run over the workflow fixture exited ${ran.status}; expected 0\n${ran.output}`);
  const runDirectory = runDirectoryOf(project.folder);
  if (runDirectory === null || !fs.existsSync(path.join(runDirectory, 'trial-sets.json'))) {
    check(false, 'the workflow run sealed no trial set');
    return;
  }
  const identifiers = [
    ...checkCapturedRecords('the workflow run', runDirectory, 'P-001'),
    ...checkCapturedRecords('the workflow run', runDirectory, 'P-002'),
  ];
  // Each trial minted its own identifier, so no value the contract holds could have been sent in its place.
  check(
    new Set(identifiers).size === identifiers.length && identifiers.length === 2 * TRIALS,
    `the trials' create steps printed ${JSON.stringify(identifiers)}; expected a fresh identifier in each`,
  );
  // The store saw each trial's create before its read, the read given that create's identifier.
  const trialLines = logLines(project).filter((line) => line.workspace?.startsWith('trial-'));
  const byWorkspace = Map.groupBy(trialLines, (line) => line.workspace);
  check(
    byWorkspace.size === 2 * TRIALS &&
      [...byWorkspace.values()].every(
        (lines) => lines.length === 2 && lines[0].operation === 'create' && lines[1].operation === 'read' && lines[1].id === lines[0].id,
      ),
    `the store ran ${JSON.stringify(trialLines)} in the trials; expected create, then read of its identifier, in each`,
  );

  const evidence = scoreRun(project, 'the workflow run');
  for (const [probeId, state] of [
    ['P-001', 'passed-clean-control'],
    ['P-002', 'caught'],
  ]) {
    const votes = votesOf(evidence, probeId);
    check(
      votes.length === TRIALS && votes.every((vote) => vote === state),
      `the workflow run: ${probeId}'s trial votes are ${JSON.stringify(votes)}; expected ${state} in each of ${TRIALS}`,
    );
  }
}

async function checkMissingValue() {
  const project = makeProject('missing-value');
  const env = { ...project.env, RECORDS_OMIT_ID: MUTATED_TRIALS.join(',') };
  const ran = evaluate(['run', '--evaluation', project.folder], env);
  check(ran.status === 0, `a run whose mutated trials print no identifier exited ${ran.status}; expected 0\n${ran.output}`);
  const runDirectory = runDirectoryOf(project.folder);
  if (runDirectory === null || !fs.existsSync(path.join(runDirectory, 'trial-sets.json'))) {
    check(false, 'the run whose mutated trials print no identifier sealed no trial set');
    return;
  }
  checkCapturedRecords('a run whose mutated trials print no identifier', runDirectory, 'P-001');
  const records = recordsOf(runDirectory, 'P-002');
  check(
    records.length === TRIALS &&
      records.every(
        (record) =>
          record.observations.length === 1 &&
          printedId(observationOf(record, 'create')) === undefined &&
          !observationOf(record, 'read-back'),
      ),
    `P-002's records hold ${JSON.stringify(records.map((record) => record.observations))}; expected create alone, printing no identifier`,
  );
  for (let trialIndex = 1; trialIndex <= TRIALS; trialIndex += 1) {
    const file = path.join(runDirectory, 'trials', 'mutated-M-001', `trial-${trialIndex}.json`);
    const steps = fs.existsSync(file) ? readJson(file).steps : [];
    check(
      JSON.stringify(steps.at(-1)) ===
        JSON.stringify({
          stepId: 'read-back',
          operationId: 'read-back',
          skipped: { reason: 'captured-value-absent', bindings: [{ binding: 'option.id', pointer: CAPTURE }] },
        }),
      `mutated trial ${trialIndex}'s evidence lists its steps as ${JSON.stringify(steps.map((entry) => entry.skipped ?? entry.stepId))}`,
    );
  }
  checkToolCalls('a run whose mutated trials print no identifier', runDirectory);
  const mutatedLines = logLines(project).filter((line) => MUTATED_TRIALS.includes(line.workspace));
  check(
    mutatedLines.length === TRIALS && mutatedLines.every((line) => line.operation === 'create'),
    `the store ran ${JSON.stringify(mutatedLines)} in the mutated trials; expected one create each and no read`,
  );

  const evidence = scoreRun(project, 'a run whose mutated trials print no identifier');
  const votes = votesOf(evidence, 'P-002');
  check(
    votes.length === TRIALS && votes.every((vote) => vote !== 'caught') && evidence['P-002']?.reducedProbeOutcomes?.[0]?.caught === false,
    `P-002's trial votes are ${JSON.stringify(votes)} with caught ${evidence['P-002']?.reducedProbeOutcomes?.[0]?.caught}; a step never issued must not read as caught`,
  );
  const clean = votesOf(evidence, 'P-001');
  check(
    clean.length === TRIALS && clean.every((vote) => vote === 'passed-clean-control'),
    `P-001's trial votes are ${JSON.stringify(clean)}`,
  );
}

/** A gameability probe's degenerate response for both steps: create prints an identifier, the read-back another title. */
const DEGENERATE_ID = 'rec-degenerate';
const DEGENERATE_STEPS = {
  create: {
    stdout: `${JSON.stringify({ id: DEGENERATE_ID, title: TITLE, path: `store/${DEGENERATE_ID}.json` })}\n`,
    stderr: '',
    exitCode: 0,
  },
  'read-back': { stdout: `${JSON.stringify({ found: true, id: DEGENERATE_ID, title: 'Another title' })}\n`, stderr: '', exitCode: 0 },
};

/** A copy of the fixture whose one probe, P-003, is a gameability probe answered from `DEGENERATE_STEPS`; `edit` changes the contract. */
function makeGameabilityProject(label, { edit = () => {} } = {}) {
  return makeProject(label, {
    edit: ({ folder }) => {
      editJson(path.join(folder, 'contract.json'), (contract) => {
        contract.behaviors.push({
          id: 'B-002',
          description: 'The create operation answers with the title it was given.',
          severity: 'low',
          observableSuccessCriterion: 'The create step prints the title it was sent.',
          requirementLinks: [{ scheme: 'tea-evaluate-fixture', id: 'create-echoes-the-title' }],
          riskLinks: [{ scheme: 'tea-evaluate-fixture', id: 'title-lost' }],
          oracles: ['O-002'],
        });
        contract.oracles.push({
          id: 'O-002',
          polarity: 'expects-hold',
          commentary: 'The create step printed the title it was sent and exited 0, whatever it stored.',
          direction: {
            polarity: 'expects-hold',
            relation: 'all',
            scope: 'The stdout and exit code of the create step.',
            negativeDomain: 'A create whose stdout carries another title or none, or that exited non-zero.',
            evidenceTargets: ['/interactions/create/stdout/title', '/interactions/create/exit-code'],
          },
          check: {
            op: 'all',
            operands: [
              { op: 'equality', operands: [{ pointer: '/interactions/create/stdout/title' }, { literal: TITLE }] },
              { op: 'equality', operands: [{ pointer: '/interactions/create/exit-code' }, { literal: 0 }] },
            ],
          },
        });
      });
      const signature = readJson(path.join(folder, 'probes', 'P-002.probe.json')).defectSignature;
      signature.condition.predicate = {
        op: 'all',
        operands: [
          { op: 'existence', operands: [{ pointer: '/interactions/observed/stdout/title' }] },
          { op: 'not', operands: [{ op: 'equality', operands: [{ pointer: '/interactions/observed/stdout/title' }, { literal: TITLE }] }] },
        ],
      };
      fs.rmSync(path.join(folder, 'probes'), { recursive: true });
      fs.rmSync(path.join(folder, 'mutations'), { recursive: true });
      writeJson(path.join(folder, 'probes', 'P-003.probe.json'), {
        probeId: 'P-003',
        probeClass: 'gameability',
        behaviorId: 'B-001',
        expectedClean: false,
        rationale: 'Gameability: a store that answers the read-back with a record under the created identifier, whatever its title.',
        defects: [],
        defectSignature: signature,
        qualification: {
          route: 'gameability',
          degenerateResponse: 'Prints a created identifier, then reads back a record under it that holds another title.',
          naiveOracle: 'O-002',
        },
      });
      writeJson(path.join(folder, 'corpus', 'gameability', 'P-003.json'), { schemaVersion: 1, steps: DEGENERATE_STEPS });
      editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
        evaluation.arms = ['gameability'];
      });
      editJson(path.join(folder, 'contract.json'), edit);
    },
  });
}

/**
 * A gameability arm answers the plan from the degenerate response through eval-quality's command-line adapter, so the
 * JSON create printed is JSON there too, and the read-back is sent the identifier the degenerate create printed.
 */
async function checkGameability() {
  const project = makeGameabilityProject('gameability');
  const ran = evaluate(['run', '--evaluation', project.folder], project.env);
  check(ran.status === 0, `a gameability run over the workflow exited ${ran.status}; expected 0\n${ran.output}`);
  const runDirectory = runDirectoryOf(project.folder);
  if (runDirectory === null || !fs.existsSync(path.join(runDirectory, 'trial-sets.json'))) {
    check(false, 'the gameability run over the workflow sealed no trial set');
    return;
  }
  const records = recordsOf(runDirectory, 'P-003');
  check(
    records.length === TRIALS &&
      records.every((record) => {
        const created = observationOf(record, 'create');
        const readBack = observationOf(record, 'read-back');
        return (
          printedId(created) === DEGENERATE_ID && readBack?.callInputs?.option?.id === DEGENERATE_ID && created.sequence < readBack.sequence
        );
      }),
    `P-003's gameability records hold ${JSON.stringify(records.map((record) => record.observations))}; expected the read-back sent the identifier the degenerate create printed`,
  );
  // The preflight legs run the store; the gameability trials launch nothing.
  const launched = logLines(project).filter((line) => line.workspace?.startsWith('trial-'));
  check(launched.length === 0, `a gameability trial launched the store: ${JSON.stringify(launched)}`);
  const votes = votesOf(scoreRun(project, 'the gameability run over the workflow'), 'P-003');
  check(
    votes.length === TRIALS && votes.every((vote) => vote === 'caught'),
    `P-003's trial votes are ${JSON.stringify(votes)}; expected caught in each of ${TRIALS}`,
  );
}

/**
 * A gameability plan step the registry does not authorize is denied as on a real arm: the qualification stops with
 * exit 10, and its fault records eval-quality's code and reason. The read-back sends an environment variable the
 * registry does not permit, which no preflight leg sends.
 */
async function checkGameabilityDenial() {
  const project = makeGameabilityProject('gameability-denied', {
    edit: (contract) => {
      const readBack = contract.interactionPlan.find((step) => step.stepId === 'read-back');
      readBack.inputBinding.environment = { RECORDS_OTHER: { literal: 'x' } };
      const read = contract.permittedInterfaces[0].operations.find((operation) => operation.operationId === 'read-back');
      read.requestShape.environment = { requiredKeys: [], permittedKeys: ['RECORDS_OTHER'], types: { RECORDS_OTHER: 'string' } };
    },
  });
  const ran = evaluate(['run', '--evaluation', project.folder], project.env);
  const fault = readIfPresent(path.join(runDirectoryOf(project.folder) ?? '', 'qualification', 'P-003', 'fault.json'));
  check(
    ran.status === 10 && /the registry denied a step \(environment-key-not-authorized\)/.test(ran.output),
    `a gameability run whose plan step the registry denies exited ${ran.status}; expected 10 naming the denial\n${ran.output}`,
  );
  check(
    fault?.code === 'forbidden-target' && fault.reason === 'environment-key-not-authorized',
    `the denied gameability qualification recorded the fault ${JSON.stringify(fault)}`,
  );
}

/** The plan edits compile refuses before any arm runs, each with its code: a cycle, a nested after clause, a dangling capture. */
const REFUSED_PLANS = [
  {
    code: 'binding-cycle',
    commands: ['preflight', 'run'],
    edit: (contract) => {
      const create = contract.interactionPlan.find((step) => step.stepId === 'create');
      create.inputBinding.stdin = { title: { captured: '/interactions/read-back/stdout/title' } };
    },
  },
  {
    code: 'nested-temporal-clause',
    commands: ['preflight'],
    edit: (contract) => {
      contract.interactionPlan.push({
        stepId: 'reread',
        operationId: 'read-back',
        after: 'read-back',
        cardinality: 'exactly-one',
        inputBinding: { argument: null, option: { id: { literal: 'r-alpha' } }, environment: null, stdin: null },
      });
      contract.budgets.maxToolCalls = 3;
      contract.probeStepBound = 3;
    },
  },
  {
    code: 'unreachable-check-evidence',
    commands: ['preflight'],
    edit: (contract) => {
      const readBack = contract.interactionPlan.find((step) => step.stepId === 'read-back');
      readBack.inputBinding.option = { id: { captured: '/interactions/ghost/stdout/id' } };
    },
  },
];

async function checkRefusedPlans() {
  for (const { code, commands, edit } of REFUSED_PLANS) {
    const project = makeProject(code, { edit: ({ folder }) => editJson(path.join(folder, 'contract.json'), edit) });
    const direct = spawnSync(process.execPath, [engineCliPath(), 'compile', '--in', path.join(project.folder, 'contract.json')], {
      encoding: 'utf8',
      env: BASE_ENV,
      timeout: SPAWN_TIMEOUT_MS,
      killSignal: 'SIGKILL',
    });
    check(
      direct.status === 4 && direct.stderr.includes(`eval-quality: ${code}: `),
      `eval-quality compile over the ${code} plan exited ${direct.status}: ${direct.stderr}`,
    );
    for (const command of commands) {
      fs.rmSync(project.log, { force: true });
      const before = runDirectoryOf(project.folder);
      const stopped = evaluate([command, '--evaluation', project.folder], project.env);
      // The command's own run directory, so a stop before it made one cannot pass on an earlier command's.
      const runDirectory = runDirectoryOf(project.folder);
      check(runDirectory !== null && runDirectory !== before, `${command} over the ${code} plan made no run directory of its own`);
      const compiled = runDirectory === before ? null : readIfPresent(path.join(runDirectory ?? '', 'engine', 'compile.json'));
      check(
        stopped.status === 4 && stopped.output.includes(direct.stderr.trim()),
        `${command} over the ${code} plan exited ${stopped.status}; expected eval-quality's 4 and its message\n${stopped.output}`,
      );
      check(
        compiled?.exitCode === 4 && compiled.stderr === direct.stderr,
        `${command} persisted compile's stderr over the ${code} plan as ${JSON.stringify(compiled?.stderr)}; expected ${JSON.stringify(direct.stderr)}`,
      );
      check(
        logLines(project).length === 0 && !fs.existsSync(path.join(runDirectory ?? '', 'qualification')),
        `${command} over the ${code} plan ran the store: ${JSON.stringify(logLines(project))}`,
      );
    }
  }
}

/**
 * A copy workspace made from the pristine copy holds what the pristine copy held when it was made: a file a leg wrote
 * there afterwards stays out, an absolute link into the project is contained in both, and a snapshot or provisioned
 * copy changed afterwards is refused.
 */
function checkSnapshot() {
  const directory = scratch.make('snapshot');
  const root = path.join(directory, 'project');
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data', 'victim.txt'), 'kept\n');
  fs.writeFileSync(path.join(root, 'file.txt'), 'as made\n');
  fs.symlinkSync(path.join(fs.realpathSync(root), 'data', 'victim.txt'), path.join(root, 'abs-link.txt'));
  fs.mkdirSync(path.join(root, 'vendor'));
  fs.writeFileSync(path.join(root, 'vendor', 'library.txt'), 'the library\n');
  const previous = process.env.TMPDIR;
  process.env.TMPDIR = scratch.make('snapshot-temp');
  const made = [];
  const make = (label, basis = null) => {
    const workspace = createWorkspace({ root: fs.realpathSync(root), kind: 'copy', provision: ['vendor', 'cache'], label, basis });
    made.push(workspace);
    return workspace;
  };
  try {
    const pristine = make('pristine');
    fs.writeFileSync(path.join(pristine.root, 'written.txt'), 'written by a leg\n');
    // A provisioned directory the project lacked when the copy was made, made there afterwards, is not provisioned.
    fs.mkdirSync(path.join(pristine.root, 'cache'));
    fs.writeFileSync(path.join(pristine.root, 'cache', 'planted.txt'), 'planted by a leg\n');
    const copy = make('trial', pristine);
    check(
      !fs.existsSync(path.join(pristine.snapshot, 'vendor')) &&
        fs.readFileSync(path.join(copy.root, 'vendor', 'library.txt'), 'utf8') === 'the library\n' &&
        (fs.statSync(path.join(copy.root, 'vendor', 'library.txt')).mode & 0o222) === 0 &&
        !fs.existsSync(path.join(copy.root, 'cache')),
      `the snapshot holds ${JSON.stringify(fs.readdirSync(pristine.snapshot))} and the reproduction ${JSON.stringify(fs.readdirSync(copy.root))}; expected the provisioned vendor/ read-only from the pristine copy, and no cache/`,
    );
    const link = fs.readlinkSync(path.join(copy.root, 'abs-link.txt'));
    check(
      !fs.existsSync(path.join(copy.root, 'written.txt')) &&
        copy.treeDigest === pristine.treeDigest &&
        path.resolve(copy.root, link) === path.join(copy.root, 'data', 'victim.txt'),
      `a reproduction holds ${JSON.stringify(fs.readdirSync(copy.root))} with abs-link.txt -> ${link}; expected the pristine copy as made, its link contained`,
    );
    fs.writeFileSync(path.join(pristine.snapshot, 'file.txt'), 'changed afterwards\n');
    let refused = null;
    try {
      make('changed', pristine);
    } catch (error) {
      refused = error;
    }
    check(
      refused instanceof WorkspaceRefusal && refused.message.includes('of the workspace it reproduces'),
      `a reproduction of a changed snapshot gave ${refused}`,
    );
    fs.writeFileSync(path.join(pristine.snapshot, 'file.txt'), 'as made\n');
    fs.mkdirSync(path.join(pristine.snapshot, 'empty-afterwards'));
    let emptyDirectory = null;
    try {
      make('empty-directory', pristine);
    } catch (error) {
      emptyDirectory = error;
    }
    check(
      emptyDirectory instanceof WorkspaceRefusal && emptyDirectory.message.includes('of the workspace it reproduces'),
      `a reproduction of a snapshot with an added empty directory gave ${emptyDirectory}`,
    );
    fs.rmdirSync(path.join(pristine.snapshot, 'empty-afterwards'));
    const snapshotFile = path.join(pristine.snapshot, 'file.txt');
    const snapshotMode = fs.statSync(snapshotFile).mode & 0o7777;
    fs.chmodSync(snapshotFile, snapshotMode ^ 0o100);
    let changedMode = null;
    try {
      make('changed-mode', pristine);
    } catch (error) {
      changedMode = error;
    }
    check(
      changedMode instanceof WorkspaceRefusal && changedMode.message.includes('of the workspace it reproduces'),
      `a reproduction of a snapshot with a changed executable bit gave ${changedMode}`,
    );
    fs.chmodSync(snapshotFile, snapshotMode);
    const library = path.join(pristine.root, 'vendor', 'library.txt');
    const originalMode = fs.statSync(library).mode & 0o7777;
    fs.chmodSync(library, originalMode | 0o200);
    fs.writeFileSync(library, 'changed by a leg\n');
    let changedProvision = null;
    try {
      make('changed-provision', pristine);
    } catch (error) {
      changedProvision = error;
    }
    check(
      changedProvision instanceof WorkspaceRefusal && changedProvision.message.includes('the copy it reproduces changed after it was made'),
      `a reproduction of a changed provisioned file gave ${changedProvision}`,
    );
    fs.writeFileSync(library, 'the library\n');
    fs.chmodSync(library, originalMode);
    // A provisioned directory planted in the snapshot, or the pristine copy's read-only copy moved away, is refused
    // where the digest, which leaves provisioned directories out, cannot see it.
    const refusalOf = (label) => {
      try {
        make(label, pristine);
      } catch (error) {
        return error;
      }
      return null;
    };
    fs.mkdirSync(path.join(pristine.snapshot, 'vendor'));
    fs.writeFileSync(path.join(pristine.snapshot, 'vendor', 'library.txt'), 'planted\n');
    const planted = refusalOf('planted');
    fs.rmSync(path.join(pristine.snapshot, 'vendor'), { recursive: true });
    fs.renameSync(path.join(pristine.root, 'vendor'), path.join(pristine.root, 'vendor.moved'));
    const moved = refusalOf('moved');
    check(
      planted instanceof WorkspaceRefusal &&
        planted.message.includes('planted in the snapshot') &&
        moved instanceof WorkspaceRefusal &&
        moved.message.includes('no longer holds it'),
      `a planted provisioned directory gave ${planted} and a moved one ${moved}`,
    );
  } finally {
    for (const workspace of made) removeWorkspace(workspace);
    if (previous === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previous;
  }
}

/** A command evaluator, written into a project: it passes the read-back that found the record and fails any other trial. */
const COMMAND_EVALUATOR = `#!/usr/bin/env node
'use strict';
const input = JSON.parse(require('node:fs').readFileSync(0, 'utf8'));
const of = (step) => input.observations.find((observation) => observation.observationId.endsWith('-' + step));
const readBack = of('read-back');
const found = readBack?.stdout?.kind === 'json' && readBack.stdout.value.found === true;
const row = found
  ? { key: 'read-back', outcome: 'pass', observationIds: [readBack.observationId] }
  : {
      key: 'read-back',
      outcome: 'fail',
      observationIds: [(readBack ?? of('create')).observationId],
      quote: readBack === undefined ? '"title":"${TITLE}"' : '"found":false',
      quoteChannel: 'stdout',
      confidence: 0.9,
      comment: 'The record create stored does not read back under the identifier it printed.',
    };
process.stdout.write(JSON.stringify({ rows: [row] }) + '\\n');
`;

/** Under a command evaluator, a trial whose read-back was never issued counts one tool call, the create it made. */
async function checkMissingValueUnderCommand() {
  const project = makeProject('missing-value-command', {
    edit: ({ folder }) => {
      fs.mkdirSync(path.join(folder, 'evaluator'));
      fs.writeFileSync(path.join(folder, 'evaluator', 'rows.js'), COMMAND_EVALUATOR, { mode: 0o755 });
      writeJson(path.join(folder, 'evaluator', 'mapping.json'), {
        schemaVersion: 1,
        keys: { 'read-back': { oracleId: 'O-001', behaviorId: 'B-001' } },
      });
      editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
        evaluation.evaluator = { kind: 'command', command: 'evaluator/rows.js', timeoutMs: 30_000 };
      });
    },
  });
  const ran = evaluate(['run', '--evaluation', project.folder], { ...project.env, RECORDS_OMIT_ID: MUTATED_TRIALS.join(',') });
  check(ran.status === 0, `a command-evaluated run whose mutated trials print no identifier exited ${ran.status}\n${ran.output}`);
  const runDirectory = runDirectoryOf(project.folder);
  if (runDirectory === null || !fs.existsSync(path.join(runDirectory, 'trial-sets.json'))) {
    check(false, 'the command-evaluated run sealed no trial set');
    return;
  }
  checkToolCalls('a command-evaluated run', runDirectory);
  const evidence = scoreRun(project, 'a command-evaluated run whose mutated trials print no identifier');
  const votes = votesOf(evidence, 'P-002');
  check(
    votes.length === TRIALS && votes.every((vote) => vote !== 'caught'),
    `under a command evaluator, P-002's trial votes are ${JSON.stringify(votes)}; a step never issued must not read as caught`,
  );
}

/** Each record and manifest counts the calls its trials made: two for a clean trial, one for a mutated trial that skipped its read-back. */
function checkToolCalls(what, runDirectory) {
  for (const [probeId, perTrial] of [
    ['P-001', 2],
    ['P-002', 1],
  ]) {
    const counts = recordsOf(runDirectory, probeId).map((record) => record.resourceUse.toolCalls);
    const manifest = readIfPresent(path.join(runDirectory, 'trial-sets', probeId, 'isolation-manifest.json'));
    check(
      counts.length === TRIALS &&
        counts.every((count) => count === perTrial) &&
        manifest?.actualResourceUse?.toolCalls === perTrial * TRIALS,
      `${what}: ${probeId}'s records count ${JSON.stringify(counts)} tool calls and its manifest ${manifest?.actualResourceUse?.toolCalls}; expected ${perTrial} per trial`,
    );
  }
}

// ---------------------------------------------------------------- the reference

/** The text under one heading of the reference, up to the next heading of its level or above. */
function sectionOf(text, heading) {
  const level = heading.match(/^#+/)[0].length;
  const lines = text.split('\n');
  const start = lines.indexOf(heading);
  if (start === -1) return null;
  const end = lines.findIndex((line, index) => index > start && /^#+ /.test(line) && line.match(/^#+/)[0].length <= level);
  return lines.slice(start + 1, end === -1 ? undefined : end).join('\n');
}

function checkReference() {
  const text = fs.readFileSync(REFERENCE, 'utf8');
  const plan = sectionOf(text, '## The interaction plan');
  check(plan !== null, 'the reference has no "## The interaction plan" section');
  const kinds = sectionOf(plan ?? '', '### Binding kinds');
  for (const [kind, sent] of [
    ['literal', 'the value as written'],
    ['captured', 'resolves to on the observation the named earlier step recorded in the same arm'],
  ]) {
    const bullet = kinds?.split('\n').find((line) => line.startsWith(`- \`${kind}\`: `));
    check(bullet?.includes(sent) === true, `the reference's "### Binding kinds" does not state that a ${kind} binding is sent (${sent})`);
  }
  check(
    kinds?.includes('- `matcher` and `principal`: not sent yet') === true && kinds.includes('exit 12'),
    'the reference\'s "### Binding kinds" does not state that a matcher or principal binding stops the arm with exit 12',
  );
  const order = sectionOf(plan ?? '', '### Step order');
  check(
    order?.includes('after every step its captured bindings read') === true && order.includes('`binding-cycle`'),
    'the reference\'s "### Step order" does not state that a step runs after the steps it captures from, or that compile refuses a cycle',
  );
  const skipped = sectionOf(plan ?? '', '### Steps not issued');
  check(
    skipped?.includes('or when one of its captured bindings resolves to nothing') === true &&
      skipped.includes('`captured-value-unsendable`') &&
      skipped.includes('`captured-value-absent`') &&
      skipped.includes('`not-applicable`'),
    'the reference\'s "### Steps not issued" does not state that a step whose captured value is absent is not issued, how it is recorded, and how eval-quality reads it',
  );
}

async function runCase(name, body) {
  try {
    await body();
  } catch (error) {
    check(false, `${name} could not finish: ${error.stack ?? error}`);
  }
}

async function main() {
  try {
    await runCase('the units', checkUnits);
    await runCase('the reference', checkReference);
    await runCase('the pipeline', checkPipeline);
    await runCase('the missing captured value', checkMissingValue);
    await runCase('the missing captured value under a command evaluator', checkMissingValueUnderCommand);
    await runCase('the gameability arm', checkGameability);
    await runCase('a gameability step the registry denies', checkGameabilityDenial);
    await runCase('the plans compile refuses', checkRefusedPlans);
    await runCase('the snapshot', checkSnapshot);
    for (const { label, directory } of runtimeTemps) {
      const left = fs.readdirSync(directory);
      check(left.length === 0, `the ${label} project's runs left ${JSON.stringify(left)} in their temp directory`);
    }
  } finally {
    scratch.removeAll();
  }
  if (failures.length > 0) {
    console.error(`${colors.red}${failures.length} of ${checks} tea-evaluate workflow check(s) failed:${colors.reset}`);
    for (const failure of failures) console.error(`  - ${failure}`);
    return 1;
  }
  console.log(`${colors.green}ok${colors.reset} all ${checks} tea-evaluate workflow check(s) passed`);
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(`${colors.red}the tea-evaluate workflow test could not run:${colors.reset} ${error.stack ?? error}`);
    process.exitCode = 2;
  },
);
