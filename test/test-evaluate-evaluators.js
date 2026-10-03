/**
 * `tea-evaluate run` and `score` over every evaluation layer AD-21 admits,
 * end to end over the real installed eval-quality (Story 1.17).
 *
 * Every end-to-end case builds a temp git project from
 * `test/fixtures/evaluate/mutation/` (the verdict command, which judges its
 * request by `rules/policy.txt`; P-001 a clean control, P-002 seeded by M-001,
 * which relaxes the policy so the command rejects). The cases that count the
 * target's launches set `VERDICT_MARKER`, so every launch appends a marker
 * line to a file outside its workspace, a write a confined run refuses, so
 * those cases opt out of file-system confinement (Story 1.31); every other
 * case runs confined, its evaluator, agent and judge processes with
 * `evaluator/` read-only.
 *
 * - Command evaluator: the stub `test/fixtures/evaluate/evaluators/command/
 *   evaluator/rows.js`, copied into the evaluation folder's `evaluator/` with
 *   its `mapping.json`, answers each row shape (pass and fail rows alone,
 *   with its own recommendation, beside a rubric score, and a fail row
 *   quoting a written file): every record meets eval-quality's published
 *   schema with the findings, dispositions and judge results the rows mean,
 *   the clean arm resolves `passed-clean-control` and the mutated arm
 *   `caught`, and no rubric judge runs.
 * - The runtime copies no ingest rule: a fail row quoting text its
 *   observation does not hold reaches `score` unchanged, and eval-quality
 *   reads the set as Invalid for the unwitnessed quotation.
 * - An evaluator outside the import contract (a crash, a non-zero exit, rows
 *   that are not a list, a fail row with no quoteChannel, an artifact quote
 *   with no artifactId, an unmapped key, a repeated key, no row at all, a
 *   score off its levels, a lone surrogate) yields no record and exit 12, its
 *   streams persisted byte for byte under `runs/<invocationId>/evaluator/`,
 *   bytes that are not UTF-8 included; a hung one has its process group
 *   killed at `timeoutMs`.
 * - A trial set records its most severe trial's recommendation.
 * - The evaluator configuration carries the kind and the executable and tree
 *   digests under `decodingParameters`, and one byte edited under
 *   `evaluator/` changes its digest, every record's
 *   `evaluatorConfigurationDigest` and the evidence's scoring version. The
 *   tree digest covers the files git tracks there. A command evaluator runs
 *   in place, so a package in the project's node_modules resolves for it and
 *   a cache it writes there must be gitignored; the run holds the layer to
 *   its digested bytes before each launch and after each trial, exit 12 on
 *   any change; `check` names a submodule under evaluator/.
 * - Every private directory a run makes is removed however it ends: after an
 *   evaluator leaves a read-only directory in its working directory, and
 *   after a signal mid-trial under a command evaluator and a sealed-brief
 *   agent, the temp directory is left empty.
 * - An oracle two behaviors declare, judged through one key, catches the
 *   second behavior's probe under a command evaluator and a sealed-brief
 *   agent.
 * - Sealed-brief agent: the stub agent through the `custom` adapter, whose
 *   whole prompt and tool configuration hold the sealed brief and none of the
 *   contract's checks, plan literals, step IDs or operation IDs, acts through
 *   the bridge; its call is recorded `evaluator-chosen` beside the plan's
 *   `baseline` observation, and the clean arm resolves `passed-clean-control`
 *   and the mutated arm `caught`. An unlisted executable is denied with
 *   eval-quality's reason code (`executable-not-authorized`) and never
 *   launches; an agent that fails, answers
 *   with no block, with a forged nonce or with two blocks yields exit 12; a
 *   call carrying the nonce is refused unsent and uncounted.
 * - The bridge, driven by an MCP client: one tool per interface with a
 *   kind-generic shape, an authorized call recorded with the routed working
 *   directory, an unlisted executable, an `mcp` and an `api` call denied by
 *   eval-quality with no launch, each recorded with its reason code, an authorized call matching no operation
 *   recorded as unmatched, and the budget held; a gameability router denying
 *   an ungranted call as the real arm does.
 * - Records: a harness's sealed records are validated and copied unchanged,
 *   `score` hands eval-quality the adopter's bytes and passes its exit
 *   through, and a record off its schema exits 10 before any `score` call.
 * - Imported rubric scores (Story 1.40): a harness over real eval-quality
 *   writes label-free calibration judgments beside its records and a
 *   configuration binding the labelled file and the minimum; verified
 *   judgments import and score, a different scorer configuration, a label in
 *   scorer input, a missing or wrong binding and judgments not 1:1 with the
 *   labelled items exit 10, agreement below the minimum exits 11, and none
 *   of them copies a record. Changing a labelled item or the minimum changes
 *   the configuration digest and the scoring version. A records evaluation
 *   with no rubric never reads a judgments file.
 * - Installed frameworks (Story 1.44): a command evaluator declares each installed
 *   framework in `evaluator/frameworks.json` (a version probe per package) and
 *   `run` observes it through the evaluator's own launch path, against an
 *   isolated package the case installs under the project's own node_modules.
 *   The observation is in `framework-versions.json`, the configuration's
 *   `tea.evaluatorFrameworks` and `run.json`; `score` of the recorded run is
 *   unchanged by a later upgrade; a package upgraded under the old declaration
 *   or removed exits 12 before any evaluator trial with no record; a
 *   declaration newer than `LEARNED.md` exits 10; the deliberate upgrade runs
 *   under another configuration digest and scoring version; a package changed
 *   by the evaluator or by a target between trials exits 12 at that trial with
 *   no record; the probe runs with the evaluator's environment and a private
 *   working directory, 1 + 2 times per trial; a configuration unit holds the
 *   tree fixed and changes only the observed version.
 * - Held attempt inputs (Story 1.69, `--group=held-attempts`): the score call of each qualification attempt.
 *   The run opted out of confinement, and the race engine (`test/fixtures/evaluate/race-engine.js`) stands over real eval-quality.
 *   An unchanged qualification scores as before.
 *   Each attempt's recorded argv reproduces its evidence byte for byte.
 *   Each of the seven inputs rewritten for the engine's read exits 12 when kept, on a later attempt and on a later probe of an arm.
 *   Each exits 12 when restored before the check, on a later attempt.
 *   So do an artifact with altered votes, reindented, with a repeated key, without its last byte or with it blanked, restaged from an earlier attempt or removed.
 *   So do an exit or an Invalid reason the held bytes do not give, including one line of an Invalid reason edited.
 *   Each names the file, with no vote and no report.
 *   A call that exits 7 or is killed still stops the run.
 *   The hold is driven over a real run directory writer.
 *   A static read fails when `scoreAttempt` names an input without `score-inputs.js`.
 * - Framework neutrality: an import of an unlisted package under `cli/`
 *   fails `eval-quality-gates dependency-direction` in a copy of the tree.
 * - Units: the row conversion, the command-line call reading, the bridged
 *   run's configuration bytes, and an api operation's path template kept
 *   from the agent.
 *
 * Usage: node test/test-evaluate-evaluators.js [--group=<name>]
 *
 * The revert checks of Story 1.69 run its cases alone with `--held-attempts-only`.
 * `--only=<text>` narrows them to the cases whose name has the text.
 */

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const { ENGINE_CLI_ENV, engineCliPath, loadEngine } = require('../cli/lib/evaluate/engine');
const { createArtifactValidator } = require('../cli/lib/evaluate/records');
const { calibrationObservation, calibrationStepPair, runCalibration } = require('../cli/lib/evaluate/calibration');
const { registryFromEvaluation } = require('../cli/lib/evaluate/registry');
const { runTrial, scoreAttempt } = require('../cli/lib/evaluate/run');
const { hostEnvironmentPort } = require('../cli/lib/evaluate/arm');
const { AGENT_ADAPTERS, AGENT_VERSION_TIMEOUT_MS, AGENT_VERSION_CEILING_MS, bridgedArgsRefused } = require('../cli/lib/agent-adapters');
const baselines = require('./lib/evaluate-baseline');
const { runSupervised } = require('../cli/lib/run-agent');
const { EvaluatorLayerError, configurationFields, readEvaluatorLayer } = require('../cli/lib/evaluate/evaluators');
const { observeFrameworks } = require('../cli/lib/evaluate/command-evaluator');
const { declarationProblems, versionsRecord } = require('../cli/lib/evaluate/frameworks');
const AjvModule = require('ajv/dist/2020');
const { MAX_SOCKET_PATH, bridgeTools, openBridge } = require('../cli/lib/evaluate/bridge');
const { makePrivateParent, makeScratchDirectory, privateRootIn, removeScratchDirectory } = require('../cli/lib/evaluate/workspace');
const {
  EVALUATOR_INSTRUCTIONS,
  bridgeRouter,
  commandCall,
  evaluatorPrompt,
  evaluatorTemplateDigest,
} = require('../cli/lib/evaluate/sealed-brief-agent');
const {
  EvaluatorError,
  judgmentFromRows,
  mappingContractProblems,
  readAnswer,
  rowsValidator,
  setRecommendationOf,
  trialRecommendation,
} = require('../cli/lib/evaluate/judgment-rows');
const { removeDeadPrivateParents, scratchDirectories } = require('./lib/scratch-directories');

const PROJECT_ROOT = path.join(__dirname, '..');
const EVALUATE = path.join(PROJECT_ROOT, 'cli', 'evaluate.js');
const FIXTURE = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'mutation');
const EVALUATORS = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'evaluators');
const COMMAND_EVALUATOR = path.join(EVALUATORS, 'command', 'evaluator');
const STUB_AGENT = path.join(EVALUATORS, 'stub-evaluator-agent.js');
const ENGINE_SHIM = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'engine-shim.js');
const RACE_ENGINE = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'race-engine.js');
const EVALUATION = path.join('evals', 'verdict');
const TRIALS = 3;
/** The user's private root directory (`workspace.js`), shared by every run of the user whatever its `TMPDIR`. */
const PRIVATE_ROOT = path.join('/tmp', `tea-evaluate-p${process.getuid?.() ?? 'w'}`);
/** Whether `directory` is in the private root, spelled as `/tmp` or as the real path a process reports (`/private/tmp` on macOS). */
function inPrivateRoot(directory) {
  let real = PRIVATE_ROOT;
  try {
    real = fs.realpathSync(PRIVATE_ROOT);
  } catch {
    // An absent root holds nothing.
  }
  return [PRIVATE_ROOT, real].includes(path.dirname(directory));
}
const AGENT_SNAPSHOT = 'stub-evaluator-2026-09';

const BASE_ENV = Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== ENGINE_CLI_ENV && !name.startsWith('GIT_')));
const GIT_IDENTITY = ['-c', 'user.name=TeA test', '-c', 'user.email=tea-test@example.test', '-c', 'core.hooksPath=/dev/null'];
const GIT_ENV = { ...BASE_ENV, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
const SPAWN_TIMEOUT_MS = 180_000;
/** A trial's answer nonce for the router units. */
const NONCE = crypto.randomBytes(16).toString('hex');

const colors = { reset: '\u001B[0m', red: '\u001B[31m', green: '\u001B[32m' };

const failures = [];
let checks = 0;
const scratch = scratchDirectories('tea-evaluate-evaluators');
/** Each project's private temp directory, which every run and score must leave empty. */
const runtimeTemps = [];

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
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

/** JSON with every object's keys sorted, so two serializations of one value compare equal. */
function canonical(value) {
  return JSON.stringify(value, (key, item) =>
    item !== null && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : 1)))
      : item,
  );
}

function sha256(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function git(repository, args) {
  const result = spawnSync('git', ['-C', repository, ...GIT_IDENTITY, ...args], {
    env: GIT_ENV,
    timeout: SPAWN_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${repository}: ${result.stderr}`);
  return result.stdout.toString('utf8');
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
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, output: `${result.stdout}${result.stderr}` };
}

/** Commits the project as it stands, after digesting its evaluation folder; returns the commit. */
function commitAll(repository, folder, message) {
  const digested = evaluate(['digest', '--evaluation', folder]);
  if (digested.status !== 0) throw new Error(`digest failed: ${digested.output}`);
  git(repository, ['add', '--all']);
  git(repository, ['commit', '--quiet', '--message', message]);
  return git(repository, ['rev-parse', 'HEAD']).trim();
}

/**
 * The private parents a case's runs made, from the working directories its command evaluator logged (`--log`, one JSON line
 * per call with its `cwd`, which sits in the parent) or from the socket paths the sealed-brief stub captured. A run's parent is
 * in the user's private root (`/tmp/tea-evaluate-p<uid>`), shared with every other run of the user, so a case names its own
 * parents by what its runs wrote and never by listing the root.
 */
function parentsOfLog(log) {
  const cwds = captures(log).map((line) => line.cwd);
  return [...new Set(cwds.map((cwd) => path.dirname(cwd)))];
}

function parentsOfCapture(capture) {
  return [
    ...new Set(
      captures(capture)
        .map((call) => call.config?.mcpServers?.[call.server]?.args?.at(-1))
        .filter((socket) => typeof socket === 'string')
        .map((socket) => path.dirname(path.dirname(socket))),
    ),
  ];
}

/** A temp git repository from the fixture, `edit` applied before the first commit, with a private temp directory and a marker file. */
function makeProject(label, { edit = () => {}, marker: marked = false, unconfined = marked } = {}) {
  const directory = scratch.make(label);
  const repository = path.join(directory, 'repository');
  fs.cpSync(FIXTURE, repository, { recursive: true, filter: (from) => path.basename(from) !== 'runs' });
  fs.writeFileSync(path.join(repository, '.gitignore'), 'vendor/\n');
  const folder = path.join(repository, EVALUATION);
  const marker = path.join(directory, 'launches.jsonl');
  const temp = scratch.make(`${label}-temp`);
  runtimeTemps.push({ label, directory: temp });
  const project = {
    repository,
    folder,
    marker,
    directory,
    env: { TMPDIR: temp, TMP: temp, TEMP: temp, ...(marked ? { VERDICT_MARKER: marker } : {}) },
  };
  if (unconfined) editJson(path.join(folder, 'evaluation.json'), (evaluation) => (evaluation.confinement = false));
  edit(project);
  git(repository, ['init', '--quiet', '--initial-branch', 'main']);
  project.commit = commitAll(repository, folder, 'the verdict project');
  return project;
}

/** Every marker line the target's launches wrote. */
function launches(project) {
  return fs.existsSync(project.marker)
    ? fs
        .readFileSync(project.marker, 'utf8')
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line))
    : [];
}

/** The newest run directory under `runs/`. */
function runDirectoryOf(folder) {
  const runs = path.join(folder, 'runs');
  const names = fs.existsSync(runs) ? fs.readdirSync(runs).filter((name) => name !== '.gitignore' && name !== '.workspace-journal') : [];
  return names.length === 0 ? null : path.join(runs, names.sort().at(-1));
}

/** Scores the newest run and returns each probe's evidence artifact by probe, and the command's output. */
function scoreRun(project, what, expectedExit = 0, env = {}) {
  const scored = evaluate(['score', '--evaluation', project.folder], { ...project.env, ...env });
  check(scored.status === expectedExit, `${what}: score exited ${scored.status}; expected ${expectedExit}\n${scored.output}`);
  const runDirectory = runDirectoryOf(project.folder);
  const scores = path.join(runDirectory, 'scores');
  const latest = fs.existsSync(scores) ? fs.readdirSync(scores).sort().at(-1) : undefined;
  const evidence = {};
  if (latest !== undefined) {
    for (const probeId of fs
      .readdirSync(path.join(scores, latest))
      .filter((name) => fs.statSync(path.join(scores, latest, name)).isDirectory())) {
      const file = path.join(scores, latest, probeId, 'evidence-artifact.json');
      evidence[probeId] = fs.existsSync(file) ? readJson(file) : null;
    }
  }
  const aggregateFile = latest === undefined ? null : path.join(scores, latest, 'strength-aggregate.json');
  const aggregate = aggregateFile !== null && fs.existsSync(aggregateFile) ? readJson(aggregateFile) : null;
  return { evidence, aggregate, output: scored.output };
}

/** Each trial's vote for a probe equals `state`, over `TRIALS` trials. */
function checkVotes(what, evidence, probeId, state) {
  const votes = (evidence[probeId]?.reducedProbeOutcomes?.[0]?.trialVotes ?? []).map((vote) => vote.state);
  check(
    votes.length === TRIALS && votes.every((vote) => vote === state),
    `${what}: ${probeId}'s trial votes are ${JSON.stringify(votes)}; expected ${state} in each of ${TRIALS}`,
  );
}

/** The trial records of one probe's set, read from the run directory. */
function recordsOf(runDirectory, probeId) {
  const index = readJson(path.join(runDirectory, 'trial-sets.json'));
  const set = index.trialSets.find((candidate) => candidate.probeId === probeId);
  return set === undefined ? [] : set.records.map((relative) => readJson(path.join(runDirectory, relative)));
}

/** Every record file a run directory holds. */
function recordFiles(runDirectory) {
  const sets = path.join(runDirectory ?? '', 'trial-sets');
  if (runDirectory === null || !fs.existsSync(sets)) return [];
  return fs.readdirSync(sets).flatMap((probeId) =>
    fs
      .readdirSync(path.join(sets, probeId))
      .filter((name) => name.startsWith('record-'))
      .map((name) => path.join(sets, probeId, name)),
  );
}

// -------------------------------------------------------------- command evaluator

/** The command evaluator wired into `folder`: the stub and its mapping copied into `evaluator/`, run with `args`. */
function useCommandEvaluator(folder, { mode = 'rows', args = [], timeoutMs = 60_000, environmentKeys } = {}) {
  fs.cpSync(COMMAND_EVALUATOR, path.join(folder, 'evaluator'), { recursive: true });
  editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
    evaluation.evaluator = { kind: 'command', command: 'evaluator/rows.js', args: ['--mode', mode, ...args], timeoutMs };
    if (environmentKeys !== undefined) evaluation.evaluator.environmentKeys = environmentKeys;
  });
}

/** R-101, one criterion scored 1 to 3, declared in the contract and bound in the mapping as verdict-quality. */
const RUBRIC = {
  id: 'R-101',
  scaleLevels: [
    { level: 1, anchor: 'The run printed no verdict it could stand behind.' },
    { level: 2, anchor: 'The run printed a verdict with no request line.' },
    { level: 3, anchor: 'The run printed the request and the verdict it reached.' },
  ],
  failureModePenalties: [{ name: 'silent', description: 'A run that prints no verdict scores the lowest level.' }],
  maxLength: 200,
  criteria: [{ id: 'RC-101', text: 'Does the run print the request and its verdict?', evidence: '/interactions/judge-run/stdout' }],
};

function addRubric(folder) {
  editJson(path.join(folder, 'contract.json'), (contract) => {
    contract.rubrics = [RUBRIC];
  });
  editJson(path.join(folder, 'evaluator', 'mapping.json'), (mapping) => {
    mapping.keys['verdict-quality'] = { rubricId: 'R-101', criterionId: 'RC-101', levels: [1, 2, 3] };
  });
  editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
    evaluation.judgeCalibration = { minimumAgreement: 1 };
  });
  fs.writeFileSync(
    path.join(folder, 'policy/judge-calibration.json'),
    `${JSON.stringify(
      {
        items: [1, 2, 3].map((level) => ({
          rubricId: 'R-101',
          criterionId: 'RC-101',
          response: `calibration example at level ${level}`,
          expectedLevel: level,
        })),
      },
      null,
      2,
    )}\n`,
  );
}

/** Two labelled anchors, with one response judged at the wrong anchor. */
function setHalfAgreement(folder) {
  editJson(path.join(folder, 'contract.json'), (contract) => {
    contract.rubrics[0].scaleLevels = contract.rubrics[0].scaleLevels.filter((level) => level.level !== 3);
  });
  editJson(path.join(folder, 'evaluator/mapping.json'), (mapping) => {
    mapping.keys['verdict-quality'].levels = [1, 2];
  });
  editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
    evaluation.judgeCalibration.minimumAgreement = 0.9;
  });
  writeJson(path.join(folder, 'policy/judge-calibration.json'), {
    items: [1, 2].map((expectedLevel) => ({
      rubricId: 'R-101',
      criterionId: 'RC-101',
      response: 'calibration example at level 2',
      expectedLevel,
    })),
  });
}

async function checkCalibrationDisagreementAcrossEvaluators() {
  for (const kind of ['command', 'sealed-brief-agent']) {
    const capture = path.join(scratch.make(`${kind}-calibration-capture`), 'calls.jsonl');
    const project = makeProject(`${kind}-calibration-disagreement`, {
      edit: ({ folder }) => {
        if (kind === 'command') {
          useCommandEvaluator(folder, { mode: 'score', args: ['--log', capture] });
          addRubric(folder);
        } else useSealedBriefAgent(folder, { capture, rubric: true });
        setHalfAgreement(folder);
      },
    });
    const ran = evaluate(['run', '--evaluation', project.folder], project.env);
    check(ran.status === 11, `${kind} calibration disagreement exited ${ran.status}; expected 11\n${ran.output}`);
    const directory = runDirectoryOf(project.folder);
    if (directory === null) continue;
    const report = readJson(path.join(directory, 'judge-calibration.json'));
    check(report.criteria[0].agreement === 0.5, `${kind} calibration agreement is ${report.criteria[0].agreement}; expected 0.5`);
    check(!fs.existsSync(path.join(directory, 'trial-sets.json')), `${kind} wrote trial sets after calibration failed`);
    check(recordFiles(directory).length === 0, `${kind} wrote trial records after calibration failed`);
    const calls = captures(capture);
    check(calls.length === 2, `${kind} scorer received ${calls.length} calibration calls; expected 2`);
    for (const call of calls) {
      const input = kind === 'command' ? JSON.stringify(call.input) : call.prompt;
      check(!input.includes('expectedLevel'), `${kind} scorer input carried a calibration label`);
      check(input.includes('calibration example at level 2'), `${kind} scorer input omitted the response`);
      if (kind === 'sealed-brief-agent') check(!input.includes('operationId'), 'sealed calibration prompt exposed an operation ID');
      if (kind === 'command') {
        const observation = call.input.observations[0];
        check(observation.principal === null, 'command calibration observation omitted its principal');
        check(
          observation.interfaceId === 'verdict' && observation.operationId === 'judge-request',
          `command calibration observation named ${observation.interfaceId}/${observation.operationId}; expected the plan step's pair verdict/judge-request`,
        );
        check(observation.callInputs?.path === null, 'command calibration observation omitted total call inputs');
        check(observation.responseHeaders === null, 'command calibration observation omitted response headers');
        check(observation.responseStatus === null, 'command calibration observation omitted response status');
        check(observation.artifacts !== undefined, 'command calibration observation omitted artifacts');
      }
    }
  }
}

function checkCalibrationFollowsEvidenceChannel() {
  const capture = path.join(scratch.make('command-stderr-calibration-capture'), 'calls.jsonl');
  const project = makeProject('command-stderr-calibration', {
    edit: ({ folder }) => {
      useCommandEvaluator(folder, { mode: 'score', args: ['--log', capture] });
      addRubric(folder);
      editJson(path.join(folder, 'contract.json'), (contract) => {
        contract.rubrics[0].criteria[0].evidence = '/interactions/judge-run/stderr';
      });
    },
  });
  const ran = evaluate(['run', '--evaluation', project.folder], project.env);
  check(ran.status === 0, `a stderr criterion calibrated through command observation exited ${ran.status}; expected 0\n${ran.output}`);
  const calls = captures(capture).filter((call) =>
    call.input.observations.some((observation) => observation.observationId === 'calibration'),
  );
  check(calls.length === 3, `the stderr criterion received ${calls.length} calibration calls; expected 3`);
  for (const call of calls) {
    const observation = call.input.observations[0];
    check(
      observation.stderr.value?.startsWith('calibration example at level '),
      'stderr calibration response missed the criterion channel',
    );
    check(observation.stdout.kind === 'absent', 'stderr calibration populated unrelated stdout');
  }
}

function checkCalibrationJsonRoot() {
  for (const kind of ['command', 'sealed-brief-agent']) {
    const capture = path.join(scratch.make(`${kind}-json-calibration-capture`), 'calls.jsonl');
    const project = makeProject(`${kind}-json-calibration`, {
      edit: ({ folder }) => {
        if (kind === 'command') {
          useCommandEvaluator(folder, { mode: 'score', args: ['--log', capture] });
          addRubric(folder);
        } else useSealedBriefAgent(folder, { capture, rubric: true });
        writeJson(path.join(folder, 'policy/judge-calibration.json'), {
          items: [1, 2, 3].map((level) => ({
            rubricId: 'R-101',
            criterionId: 'RC-101',
            response: JSON.stringify({ example: `calibration example at level ${level}` }),
            responseKind: 'json',
            expectedLevel: level,
          })),
        });
      },
    });
    const ran = evaluate(['run', '--evaluation', project.folder], project.env);
    check(ran.status === 0, `${kind} JSON-root rubric calibration exited ${ran.status}; expected 0\n${ran.output}`);
    const calls = captures(capture)
      .map((call) =>
        kind === 'command'
          ? call.input.observations.find((observation) => observation.observationId === 'calibration')
          : JSON.parse(
              call.prompt.slice(
                call.prompt.indexOf('Sealed brief and keys to judge (JSON):') + 'Sealed brief and keys to judge (JSON):'.length,
              ),
            ).observation,
      )
      .filter((observation) => observation?.observationId === 'calibration');
    check(calls.length === 3, `${kind} JSON-root rubric received ${calls.length} calibration calls; expected 3`);
    for (const observation of calls) {
      check(observation.stdout.kind === 'json', `${kind} JSON-root calibration reached the scorer as text`);
      check(
        observation.stdout.value?.example?.startsWith('calibration example at level '),
        `${kind} JSON-root calibration omitted its value`,
      );
    }
  }
}

async function checkCalibrationSnapshotGuard() {
  const engine = await loadEngine();
  const contract = {
    rubrics: [{ id: 'R-101', criteria: [{ id: 'RC-101', evidence: '/interactions/judge-run/stdout' }], scaleLevels: [{ level: 1 }] }],
  };
  let judgeCalls = 0;
  for (const calibration of [null, { value: { items: [] }, bytes: Buffer.from('{}') }]) {
    let stopped = false;
    try {
      await runCalibration({
        calibration,
        evaluation: { judgeCalibration: { minimumAgreement: 1 } },
        contract,
        engine,
        stop: (outcome) => Object.assign(new Error(outcome.message), outcome),
        writer: { writeJson: () => {} },
        judgeItem: () => {
          judgeCalls++;
          return 1;
        },
      });
    } catch (error) {
      stopped = error.exitCode === 12 && error.message.includes('judge calibration became invalid');
    }
    check(stopped, 'a missing or empty captured calibration passed into scorer execution');
  }
  check(judgeCalls === 0, `an invalid captured calibration launched ${judgeCalls} scorer call(s)`);
}

function checkCalibrationHoldsAdopterTree() {
  const project = makeProject('command-calibration-project-write', {
    edit: ({ folder, repository }) => {
      useCommandEvaluator(folder, { mode: 'write-project', args: ['--touch', path.join(repository, 'calibration-touch.txt')] });
      addRubric(folder);
      setHalfAgreement(folder);
    },
  });
  const ran = evaluate(['run', '--evaluation', project.folder], project.env);
  check(
    ran.status === 12 && ran.output.includes('changed during the calibration'),
    `a command scorer changing the adopter tree during a failed calibration exited ${ran.status}; expected integrity exit 12\n${ran.output}`,
  );
  check(recordFiles(runDirectoryOf(project.folder)).length === 0, 'a calibration scorer changing the adopter tree wrote a trial record');
}

/** The verdict command's `residue.txt`, which a lenient run leaves behind, declared as the written file `residue`. */
function addResidueArtifact(folder) {
  editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
    evaluation.registry[0].artifacts = { residue: 'residue.txt' };
  });
  editJson(path.join(folder, 'contract.json'), (contract) => {
    contract.permittedInterfaces[0].operations[0].artifacts = ['residue'];
  });
}

/** Holds a scored command run's records to what the rows mean. */
async function checkCommandRecords(
  what,
  runDirectory,
  { validate, quoteChannel = 'stdout', artifactId = null, rubric = false, recommendation = null },
) {
  for (const probeId of ['P-001', 'P-002']) {
    const records = recordsOf(runDirectory, probeId);
    check(records.length === TRIALS, `${what}: ${probeId}'s set holds ${records.length} records; expected ${TRIALS}`);
    for (const record of records) {
      for (const problem of await validate('sealed-run-record', record))
        check(false, `${what}: a ${probeId} record fails its schema: ${problem}`);
      check(
        record.observations.every((observation) => observation.provenance === 'evaluator-chosen'),
        `${what}: a ${probeId} record's observations are not evaluator-chosen`,
      );
      const disposition = record.oracleDispositions.find((entry) => entry.oracleId === 'O-001');
      const expected = probeId === 'P-001' ? 'held' : 'violated';
      check(
        disposition?.disposition === expected,
        `${what}: ${probeId}'s O-001 disposition is ${disposition?.disposition}; expected ${expected}`,
      );
      if (probeId === 'P-001') {
        check(record.findings.length === 0, `${what}: the clean control's record files ${record.findings.length} finding(s)`);
      } else {
        const [finding] = record.findings;
        check(
          record.findings.length === 1 &&
            finding.findingType === 'defect' &&
            finding.findingId === 'F-001' &&
            finding.oracleId === 'O-001' &&
            finding.probeId === 'P-002' &&
            finding.behaviorId === 'B-001' &&
            finding.severity === 'critical' &&
            finding.summary === 'The run rejected the request it had to accept.' &&
            finding.confidence === 0.9 &&
            JSON.stringify(finding.evidenceArtifacts) === '[]' &&
            JSON.stringify(finding.observationIds) === JSON.stringify([record.observations[0].observationId]) &&
            finding.quotedEvidence.length === 1 &&
            finding.quotedEvidence[0].channel === quoteChannel &&
            finding.quotedEvidence[0].artifactId === artifactId,
          `${what}: P-002's finding is ${JSON.stringify(record.findings)}`,
        );
      }
      // The clean control files no finding, so it recommends PASS unless the evaluator says otherwise, which the stub never does there.
      const want = probeId === 'P-001' ? 'PASS' : (recommendation ?? 'FAIL');
      check(record.evaluatorRecommendation === want, `${what}: ${probeId} recommends ${record.evaluatorRecommendation}; expected ${want}`);
      const scores = record.judgeResults.map((result) => [result.rubricId, result.criterionId, result.score]);
      const expectedScores = rubric ? [['R-101', 'RC-101', probeId === 'P-001' ? 3 : 1]] : [];
      check(
        JSON.stringify(scores) === JSON.stringify(expectedScores),
        `${what}: ${probeId}'s judge results are ${JSON.stringify(record.judgeResults)}`,
      );
    }
  }
}

async function checkCommandRowShapes() {
  const validate = createArtifactValidator();
  const engine = await loadEngine();
  const shapes = [
    { mode: 'rows', what: 'pass and fail rows' },
    { mode: 'recommend', what: "rows with the evaluator's own recommendation", recommendation: 'CONCERNS' },
    { mode: 'score', what: 'rows beside a rubric score', rubric: true },
    { mode: 'artifact', what: 'a fail row quoting a written file', quoteChannel: 'artifact', artifactId: 'residue' },
  ];
  const log = path.join(scratch.make('command-log'), 'evaluator.jsonl');
  for (const shape of shapes) {
    const project = makeProject(`command-${shape.mode}`, {
      edit: ({ folder }) => {
        // The first shape also logs what the evaluator received, and names one host variable it may read.
        useCommandEvaluator(
          folder,
          shape.mode === 'rows' ? { mode: 'rows', args: ['--log', log], environmentKeys: ['TEA_TEST_SHOWN'] } : { mode: shape.mode },
        );
        if (shape.rubric) addRubric(folder);
        if (shape.artifactId !== undefined) addResidueArtifact(folder);
      },
    });
    const ran = evaluate(['run', '--evaluation', project.folder], { ...project.env, TEA_TEST_SHOWN: 'shown', TEA_TEST_HIDDEN: 'hidden' });
    check(ran.status === 0, `${shape.what}: run exited ${ran.status}; expected 0\n${ran.output}`);
    const runDirectory = runDirectoryOf(project.folder);
    if (ran.status !== 0 || runDirectory === null) continue;
    await checkCommandRecords(shape.what, runDirectory, { validate, ...shape });
    if (shape.mode === 'rows') {
      checkCommandInput(project, runDirectory, log);
      // The manifest's wall-clock ceiling counts the evaluator's timeout beside the plan step's registry ceiling, per trial.
      const manifest = readJson(path.join(runDirectory, 'trial-sets', 'P-001', 'isolation-manifest.json'));
      check(
        manifest.resourceCeilings.maxWallClockMinutes === ((30_000 + 60_000) * TRIALS) / 60_000,
        `a command run's manifest allows ${manifest.resourceCeilings.maxWallClockMinutes} minutes`,
      );
    }
    const run = readJson(path.join(runDirectory, 'run.json'));
    check(
      run.evaluator?.kind === 'command' && run.evaluator.command === 'evaluator/rows.js' && run.judge === null,
      `${shape.what}: run.json records the evaluator ${JSON.stringify(run.evaluator)} and judge ${JSON.stringify(run.judge)}`,
    );
    const configuration = readJson(path.join(runDirectory, 'evaluator-configuration.json'));
    for (const problem of await validate('evaluator-configuration', configuration))
      check(false, `${shape.what}: the configuration fails its schema: ${problem}`);
    const executable = fs.readFileSync(path.join(project.folder, 'evaluator', 'rows.js'));
    check(
      configuration.decodingParameters['tea.evaluatorKind'] === 'command' &&
        configuration.decodingParameters['tea.evaluatorExecutableDigest'] === sha256(executable) &&
        /^sha256:[0-9a-f]{64}$/.test(configuration.decodingParameters['tea.evaluatorTreeDigest']) &&
        configuration.judgeConfiguration === null,
      `${shape.what}: the configuration carries ${JSON.stringify(configuration.decodingParameters)} and judge ${JSON.stringify(configuration.judgeConfiguration)}`,
    );
    const treeEntries = [];
    const walk = (directory) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(absolute);
        else
          treeEntries.push({
            path: path.relative(project.folder, absolute).split(path.sep).join('/'),
            sha256: sha256(fs.readFileSync(absolute)).slice(7),
          });
      }
    };
    walk(path.join(project.folder, 'evaluator'));
    treeEntries.sort((left, right) => (left.path < right.path ? -1 : 1));
    check(
      configuration.decodingParameters['tea.evaluatorTreeDigest'] === engine.digestArtifact(treeEntries, 'evaluator-tree'),
      `${shape.what}: the tree digest is not digestArtifact over evaluator/'s files`,
    );
    // No rubric judge runs under a command evaluator, rubric or not: no trial carries a judge's evidence.
    const trials = fs
      .readdirSync(path.join(runDirectory, 'trials', 'clean'))
      .map((name) => readJson(path.join(runDirectory, 'trials', 'clean', name)));
    check(
      trials.every((trial) => trial.judge === undefined && trial.evaluator?.kind === 'command'),
      `${shape.what}: a trial's evidence carries a judge or no evaluator answer`,
    );
    // What the stub printed is kept under evaluator/, byte for byte.
    const streams = path.join(runDirectory, 'evaluator', 'clean');
    check(
      fs.existsSync(streams) && fs.readFileSync(path.join(streams, 'trial-1.stderr'), 'utf8') === `stub stderr ${shape.mode}\n`,
      `${shape.what}: the evaluator's stderr is not persisted under evaluator/clean/`,
    );
    const { evidence } = scoreRun(project, shape.what);
    checkVotes(shape.what, evidence, 'P-001', 'passed-clean-control');
    checkVotes(shape.what, evidence, 'P-002', 'caught');
    if (shape.mode === 'rows') await checkConfigurationDigest(project, runDirectory, evidence);
  }
}

/**
 * What the command evaluator received: the run's sealed brief and the trial's
 * record observations on stdin, an empty temporary working directory outside
 * the evaluation folder that is gone afterwards, and the base environment
 * with the keys `environmentKeys` names and no other host variable.
 */
function checkCommandInput(project, runDirectory, log) {
  const calls = fs.existsSync(log)
    ? fs
        .readFileSync(log, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
    : [];
  check(calls.length === 2 * TRIALS, `the command evaluator ran ${calls.length} time(s); expected ${2 * TRIALS}`);
  const brief = readJson(path.join(runDirectory, 'sealed-evaluator-brief.json'));
  const firstRecord = recordsOf(runDirectory, 'P-001')[0];
  const [first] = calls;
  check(
    JSON.stringify(first?.input?.sealedBrief) === JSON.stringify(brief),
    'the command evaluator did not receive the sealed brief the run sealed',
  );
  check(
    canonical(first?.input?.observations) === canonical(firstRecord?.observations),
    "the command evaluator did not receive the trial's record observations",
  );
  check(
    calls.every((call) => !call.cwd.startsWith(project.repository) && !fs.existsSync(call.cwd)),
    `the command evaluator ran in ${JSON.stringify(calls.map((call) => call.cwd))}; expected a temporary directory removed afterwards`,
  );
  check(
    calls.every((call) => call.environment.includes('TEA_TEST_SHOWN') && !call.environment.includes('TEA_TEST_HIDDEN')),
    `the command evaluator's environment was ${JSON.stringify(first?.environment)}`,
  );
}

/** One byte edited under evaluator/ moves the configuration digest, every record's, and the scoring version. */
async function checkConfigurationDigest(project, firstRun, firstEvidence) {
  const before = readJson(path.join(firstRun, 'run.json')).evaluatorConfigurationDigest;
  const beforeRecords = recordFiles(firstRun).map((file) => readJson(file).evaluatorConfigurationDigest);
  fs.appendFileSync(path.join(project.folder, 'evaluator', 'mapping.json'), ' ');
  commitAll(project.repository, project.folder, 'one byte more under evaluator/');
  const ran = evaluate(['run', '--evaluation', project.folder], project.env);
  check(ran.status === 0, `the run after an evaluator edit exited ${ran.status}\n${ran.output}`);
  const secondRun = runDirectoryOf(project.folder);
  const after = readJson(path.join(secondRun, 'run.json')).evaluatorConfigurationDigest;
  const afterRecords = recordFiles(secondRun).map((file) => readJson(file).evaluatorConfigurationDigest);
  check(before !== after, 'one byte edited under evaluator/ left the evaluator configuration digest unchanged');
  check(
    afterRecords.length > 0 && afterRecords.every((digest) => digest === after) && beforeRecords.every((digest) => digest === before),
    "the records do not carry their own run's evaluator configuration digest",
  );
  const { evidence } = scoreRun(project, 'the run after an evaluator edit');
  check(
    typeof firstEvidence['P-002']?.scoringVersion === 'string' &&
      firstEvidence['P-002'].scoringVersion !== evidence['P-002']?.scoringVersion,
    'one byte edited under evaluator/ left the evidence scoring version unchanged',
  );
}

async function checkUnwitnessedQuote() {
  const project = makeProject('command-unwitnessed', { edit: ({ folder }) => useCommandEvaluator(folder, { mode: 'unwitnessed' }) });
  const ran = evaluate(['run', '--evaluation', project.folder], project.env);
  check(ran.status === 0, `an unwitnessed quote: run exited ${ran.status}; expected 0\n${ran.output}`);
  const runDirectory = runDirectoryOf(project.folder);
  if (ran.status !== 0 || runDirectory === null) return;
  // The quote reaches the record exactly as the evaluator stated it; the runtime checks nothing eval-quality's ingest checks.
  const quotes = recordsOf(runDirectory, 'P-002').flatMap((record) =>
    record.findings.flatMap((finding) => finding.quotedEvidence.map((entry) => entry.quote)),
  );
  check(
    quotes.length === TRIALS && quotes.every((quote) => quote === 'verdict: forged by the stub'),
    `an unwitnessed quote: the records quote ${JSON.stringify(quotes)}`,
  );
  const { evidence, output } = scoreRun(project, 'an unwitnessed quote', 3);
  check(evidence['P-002'] === null, 'an unwitnessed quote: eval-quality emitted evidence for an Invalid set');
  check(
    /eval-quality: invalid: .*unwitnessed/i.test(output),
    `an unwitnessed quote: score did not report eval-quality's unwitnessed-quotation reason\n${output}`,
  );
}

async function checkEvaluatorFailures() {
  const rowsLine = (rows) => `${JSON.stringify({ rows })}\n`;
  const failRow = {
    key: 'verdict-accepted',
    outcome: 'fail',
    observationIds: ['trial-1-judge-run'],
    quote: 'verdict: rejected',
    quoteChannel: 'stdout',
    confidence: 0.9,
    comment: 'The run rejected the request it had to accept.',
  };
  const passRow = {
    key: 'verdict-accepted',
    outcome: 'pass',
    observationIds: ['trial-1-judge-run'],
    comment: 'The run says verdict: accepted.',
  };
  const cases = [
    { mode: 'crash', says: 'exited 1, so', stdout: '' },
    { mode: 'nonzero', says: 'exited 2', stdout: rowsLine([passRow]) },
    { mode: 'invalid', says: 'judgment-rows schema', stdout: rowsLine('not a list') },
    { mode: 'no-channel', says: 'quoteChannel', stdout: rowsLine([{ ...failRow, quoteChannel: undefined }]) },
    { mode: 'artifact-no-id', says: 'artifactId', stdout: rowsLine([{ ...failRow, quoteChannel: 'artifact' }]) },
    { mode: 'unmapped-key', says: 'allowed values', stdout: rowsLine([{ ...passRow, key: 'verdict-unmapped' }]) },
    { mode: 'duplicate-key', says: 'no more than 1', stdout: rowsLine([passRow, passRow]) },
    { mode: 'zero-rows', says: 'no judgment row', stdout: rowsLine([]) },
    { mode: 'off-scale', says: 'not one of', stdout: null, rubric: true },
    { mode: 'score-on-oracle', says: 'is a score row, and its key binds oracle O-001', stdout: null },
    { mode: 'pass-on-rubric', says: 'is a pass row, and its key binds criterion R-101/RC-101', stdout: null, rubric: true },
    { mode: 'surrogate', says: 'is not well-formed Unicode', stdout: null },
    // Bytes that are not UTF-8 are kept as the evaluator wrote them.
    {
      mode: 'raw-bytes',
      says: 'exited 1, so',
      stdout: null,
      bytes: { stdout: Buffer.from([0x7b, 0xff, 0xfe, 0x0a]), stderr: Buffer.from('stub stderr raw-bytes\naÃ\n', 'latin1') },
    },
  ];
  for (const { mode, says, stdout, rubric, bytes } of cases) {
    const project = makeProject(`command-${mode}`, {
      edit: ({ folder }) => {
        useCommandEvaluator(folder, { mode });
        if (rubric) addRubric(folder);
      },
    });
    const ran = evaluate(['run', '--evaluation', project.folder], project.env);
    check(ran.status === 12 && ran.output.includes(says), `${mode}: run exited ${ran.status}; expected 12 saying "${says}"\n${ran.output}`);
    const runDirectory = runDirectoryOf(project.folder);
    check(recordFiles(runDirectory).length === 0, `${mode}: the run wrote a record`);
    check(runDirectory === null || !fs.existsSync(path.join(runDirectory, 'trial-sets.json')), `${mode}: the run wrote a trial-set index`);
    const streams = path.join(runDirectory ?? '', 'evaluator', 'clean');
    const persisted = (name) => (fs.existsSync(path.join(streams, name)) ? fs.readFileSync(path.join(streams, name), 'utf8') : null);
    check(
      persisted('trial-1.stderr')?.startsWith(`stub stderr ${mode}\n`) === true,
      `${mode}: the persisted stderr is ${JSON.stringify(persisted('trial-1.stderr'))}`,
    );
    if (stdout !== null)
      check(persisted('trial-1.stdout') === stdout, `${mode}: the persisted stdout is ${JSON.stringify(persisted('trial-1.stdout'))}`);
    check(persisted('trial-1.json')?.includes(says) === true, `${mode}: the persisted fault does not say "${says}"`);
    if (bytes !== undefined) {
      for (const [name, expected] of Object.entries(bytes)) {
        const file = path.join(streams, `trial-1.${name}`);
        const kept = fs.existsSync(file) ? fs.readFileSync(file) : null;
        check(
          kept?.equals(expected) === true,
          `${mode}: the persisted ${name} is ${kept?.toString('hex')}; expected ${expected.toString('hex')}`,
        );
      }
    }
  }
}

/** A trial set records the most severe of its trials' recommendations, so one trial's CONCERNS reaches every record. */
function checkSetRecommendation() {
  const project = makeProject('command-recommend-last', { edit: ({ folder }) => useCommandEvaluator(folder, { mode: 'recommend-last' }) });
  const ran = evaluate(['run', '--evaluation', project.folder], project.env);
  check(ran.status === 0, `a recommendation on the last trial only: run exited ${ran.status}; expected 0\n${ran.output}`);
  const runDirectory = runDirectoryOf(project.folder);
  if (ran.status !== 0 || runDirectory === null) return;
  for (const probeId of ['P-001', 'P-002']) {
    const recommended = recordsOf(runDirectory, probeId).map((record) => record.evaluatorRecommendation);
    check(
      recommended.length === TRIALS && recommended.every((value) => value === 'CONCERNS'),
      `${probeId}'s records recommend ${JSON.stringify(recommended)}; expected CONCERNS in each, the third trial's`,
    );
  }
}

/**
 * The command evaluator runs in place, from the evaluation folder's
 * evaluator/: in a run that opted out of confinement, a cache it writes there
 * that git ignores leaves the run whole and one git does not ignore stops it
 * at the adopter-tree check; in a confined run the write is refused (Story
 * 1.31), so the evaluator that insists fails and the run stops with exit 12
 * and nothing written beside it. The tree digest covers the files git tracks
 * there, so a file git does not track (ignored or not) moves no digest;
 * `check` refuses an executable git does not track and names a submodule
 * there.
 */
async function checkEvaluatorInPlace() {
  const engine = await loadEngine();
  const confined = makeProject('command-in-place-confined', {
    edit: ({ folder, repository }) => {
      useCommandEvaluator(folder, { mode: 'write-beside' });
      fs.appendFileSync(path.join(repository, '.gitignore'), '__pycache__/\n');
    },
  });
  const refused = evaluate(['run', '--evaluation', confined.folder], confined.env);
  const refusedDirectory = runDirectoryOf(confined.folder);
  const refusedStderr = path.join(refusedDirectory ?? '', 'evaluator', 'clean', 'trial-1.stderr');
  check(
    refused.status === 12 &&
      refused.output.includes('trial-clean-1 yields no record: the evaluator evaluator/rows.js exited 1') &&
      fs.existsSync(refusedStderr) &&
      // Seatbelt answers EPERM; under Bubblewrap's read-only bind, Node's recursive mkdir reports ENOENT.
      /EPERM|EROFS|EACCES|ENOENT/.test(fs.readFileSync(refusedStderr, 'utf8')),
    `a confined command evaluator writing beside itself: run exited ${refused.status}; expected 12 with its write refused\n${fs.existsSync(refusedStderr) ? fs.readFileSync(refusedStderr, 'utf8') : 'no stderr kept'}\n${refused.output}`,
  );
  check(
    !fs.existsSync(path.join(confined.folder, 'evaluator', '__pycache__')),
    'a confined command evaluator wrote a cache under evaluator/',
  );
  const log = path.join(scratch.make('in-place-log'), 'evaluator.jsonl');
  const project = makeProject('command-in-place', {
    unconfined: true,
    edit: ({ folder, repository }) => {
      useCommandEvaluator(folder, { mode: 'write-beside', args: ['--log', log] });
      fs.appendFileSync(path.join(repository, '.gitignore'), '*.pyc\n__pycache__/\n');
      fs.writeFileSync(path.join(folder, 'evaluator', 'stale.pyc'), 'an ignored file git does not track\n');
    },
  });
  const treeDigestOf = (runDirectory) =>
    readJson(path.join(runDirectory, 'evaluator-configuration.json')).decodingParameters['tea.evaluatorTreeDigest'];
  const ran = evaluate(['run', '--evaluation', project.folder], project.env);
  check(
    ran.status === 0,
    `a command evaluator writing an ignored cache beside itself: run exited ${ran.status}; expected 0\n${ran.output}`,
  );
  const runDirectory = runDirectoryOf(project.folder);
  if (ran.status !== 0 || runDirectory === null) return;
  const executable = path.join(project.folder, 'evaluator', 'rows.js');
  const selves = fs
    .readFileSync(log, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line).self);
  check(
    selves.length === 2 * TRIALS && selves.every((self) => self === executable),
    `the command evaluator ran from ${JSON.stringify(selves)}; expected ${executable} in each trial`,
  );
  check(
    fs.existsSync(path.join(project.folder, 'evaluator', '__pycache__', 'cache.bin')),
    'the command evaluator did not run in place: its cache is not beside it in the evaluation folder',
  );
  // The tree digest covers exactly the files git tracks under evaluator/, so neither the ignored stale.pyc nor the cache is part of it.
  const tracked = git(project.folder, ['ls-files', '-z', '--', 'evaluator'])
    .split('\0')
    .filter((relative) => relative.length > 0)
    .sort()
    .map((relative) => ({ path: relative, sha256: sha256(fs.readFileSync(path.join(project.folder, relative))).slice(7) }));
  check(
    tracked.length === 4 && treeDigestOf(runDirectory) === engine.digestArtifact(tracked, 'evaluator-tree'),
    `the tree digest is not taken over the ${tracked.length} file(s) git tracks under evaluator/`,
  );
  // A file git does not track, left there after the commit, changes no digest.
  fs.writeFileSync(path.join(project.folder, 'evaluator', 'notes.txt'), 'a note, never added\n');
  const again = evaluate(['run', '--evaluation', project.folder], project.env);
  const secondRun = runDirectoryOf(project.folder);
  check(
    again.status === 0 && secondRun !== runDirectory && treeDigestOf(secondRun) === treeDigestOf(runDirectory),
    `an untracked file under evaluator/ moved the tree digest or stopped the run (exit ${again.status})\n${again.output}`,
  );
  fs.rmSync(path.join(project.folder, 'evaluator', 'notes.txt'));
  // An executable git does not track is no part of the layer, so check refuses it.
  git(project.folder, ['rm', '--cached', '--quiet', '--', 'evaluator/rows.js']);
  const checked = evaluate(['check', '--evaluation', project.folder], project.env);
  check(
    checked.status === 10 && checked.output.includes('evaluator/rows.js, which git does not track'),
    `check over an untracked command evaluator exited ${checked.status}; expected 10 naming it\n${checked.output}`,
  );
  git(project.folder, ['add', '--', 'evaluator/rows.js']);
  // A submodule under evaluator/ holds another repository's files, and check names it as one.
  const inner = path.join(project.folder, 'evaluator', 'vendored');
  fs.mkdirSync(inner);
  fs.writeFileSync(path.join(inner, 'helper.js'), "'use strict';\n");
  git(inner, ['init', '--quiet', '--initial-branch', 'main']);
  git(inner, ['add', '--all']);
  git(inner, ['commit', '--quiet', '--message', 'a vendored helper']);
  git(project.folder, ['add', '--', 'evaluator/vendored']);
  const submodule = evaluate(['check', '--evaluation', project.folder], project.env);
  check(
    submodule.status === 10 && submodule.output.includes('evaluator/vendored is a git submodule'),
    `check over a submodule under evaluator/ exited ${submodule.status}; expected 10 naming it a submodule\n${submodule.output}`,
  );
  git(project.folder, ['rm', '--cached', '--force', '--quiet', '--', 'evaluator/vendored']);
  fs.rmSync(inner, { recursive: true, force: true });

  // A cache git does not ignore changes the adopter's tree, which stops the run.
  const unignored = makeProject('command-in-place-unignored', {
    unconfined: true,
    edit: ({ folder }) => useCommandEvaluator(folder, { mode: 'write-beside' }),
  });
  const stopped = evaluate(['run', '--evaluation', unignored.folder], unignored.env);
  check(
    stopped.status === 12 && stopped.output.includes('changed during the trials'),
    `a command evaluator writing a cache git does not ignore: run exited ${stopped.status}; expected 12 at the adopter-tree check\n${stopped.output}`,
  );
  check(
    recordFiles(runDirectoryOf(unignored.folder)).length === 0,
    'a command evaluator writing a cache git does not ignore: the run wrote a record',
  );
}

/**
 * The run holds the evaluation layer to the bytes it digested: in a run that
 * opted out of confinement, an evaluator that rewrites a tracked file of its
 * own during trial 1, and a target that writes into evaluator/ during the
 * trial's plan, each stop the run at that trial with exit 12 and no record (a
 * confined run refuses both writes, which `test-evaluate-run.js` and the
 * in-place case hold); a module the evaluator loads from the project's own
 * node_modules resolves, since it runs in place.
 */
function checkEvaluatorLayerHeld() {
  const rewritten = makeProject('command-rewrite-self', {
    unconfined: true,
    edit: ({ folder }) => useCommandEvaluator(folder, { mode: 'rewrite-self' }),
  });
  const ran = evaluate(['run', '--evaluation', rewritten.folder], rewritten.env);
  check(
    ran.status === 12 &&
      ran.output.includes(
        'trial-clean-1 yields no record: the evaluation layer changed while the evaluator ran: evaluator/rows.js no longer holds the bytes the run read at its start',
      ),
    `an evaluator rewriting its own file: run exited ${ran.status}; expected 12 at trial-clean-1 naming evaluator/rows.js\n${ran.output}`,
  );
  check(recordFiles(runDirectoryOf(rewritten.folder)).length === 0, 'an evaluator rewriting its own file: the run wrote a record');

  const touched = makeProject('command-target-touch', { unconfined: true, edit: ({ folder }) => useCommandEvaluator(folder) });
  const mapping = path.join(touched.folder, 'evaluator', 'mapping.json');
  const beforeLaunch = evaluate(['run', '--evaluation', touched.folder], {
    ...touched.env,
    VERDICT_WHEN: 'trial-clean-1',
    VERDICT_DO: 'touch',
    VERDICT_TOUCH: mapping,
  });
  check(
    beforeLaunch.status === 12 &&
      beforeLaunch.output.includes(
        "trial-clean-1 yields no record: the evaluation layer changed before the evaluator's launch: evaluator/mapping.json no longer holds",
      ),
    `a target writing into evaluator/ during a trial: run exited ${beforeLaunch.status}; expected 12 before the evaluator's launch\n${beforeLaunch.output}`,
  );
  check(
    recordFiles(runDirectoryOf(touched.folder)).length === 0,
    'a target writing into evaluator/ during a trial: the run wrote a record',
  );

  // A wrapper over a framework the project installs: the package resolves from evaluator/ upward, as outside a run.
  const answer = 'probe-dep answered from the project root';
  const wrapped = makeProject('command-require-package', {
    edit: ({ folder, repository }) => {
      useCommandEvaluator(folder, { mode: 'require-package' });
      fs.appendFileSync(path.join(repository, '.gitignore'), 'node_modules/\n');
      fs.mkdirSync(path.join(repository, 'node_modules', 'probe-dep'), { recursive: true });
      fs.writeFileSync(path.join(repository, 'node_modules', 'probe-dep', 'index.js'), `module.exports = ${JSON.stringify(answer)};\n`);
    },
  });
  const required = evaluate(['run', '--evaluation', wrapped.folder], wrapped.env);
  check(
    required.status === 0,
    `an evaluator requiring a package from the project's node_modules: run exited ${required.status}; expected 0\n${required.output}`,
  );
  const printed = path.join(runDirectoryOf(wrapped.folder) ?? '', 'evaluator', 'clean', 'trial-1.stdout');
  check(
    fs.existsSync(printed) && fs.readFileSync(printed, 'utf8').includes(answer),
    "an evaluator requiring a package from the project's node_modules: its answer does not carry the package's export",
  );
}

/**
 * A run removes every private directory it made, whatever a process left in
 * it: an evaluator that leaves a read-only directory in its working directory
 * still leaves the temp directory empty, and (on macOS) one that leaves a file
 * no chmod can free is reported by name while every workspace is still
 * removed.
 */
function checkScratchRemoval() {
  if (process.platform === 'win32') return;
  const lockedLog = path.join(scratch.make('command-lock-log'), 'calls.jsonl');
  const locked = makeProject('command-lock-cwd', {
    edit: ({ folder }) => useCommandEvaluator(folder, { mode: 'lock-cwd', args: ['--log', lockedLog] }),
  });
  const temp = locked.env.TMPDIR;
  const ran = evaluate(['run', '--evaluation', locked.folder], locked.env);
  check(ran.status === 0, `an evaluator leaving a read-only directory: run exited ${ran.status}; expected 0\n${ran.output}`);
  check(
    fs.readdirSync(temp).length === 0,
    `an evaluator leaving a read-only directory: the run left ${JSON.stringify(fs.readdirSync(temp))} in its temp directory`,
  );
  // Each trial's working directory sat in the run's private parent, which the run removed with it.
  const lockedParents = parentsOfLog(lockedLog);
  check(
    lockedParents.length === 1 && inPrivateRoot(lockedParents[0]) && !fs.existsSync(lockedParents[0]),
    `an evaluator leaving a read-only directory: its working directories sat in ${JSON.stringify(lockedParents)}; expected one parent in ${PRIVATE_ROOT}, removed`,
  );
  if (process.platform !== 'darwin') return;
  const pinnedLog = path.join(scratch.make('command-immutable-log'), 'calls.jsonl');
  const pinned = makeProject('command-immutable-cwd', {
    edit: ({ folder }) => useCommandEvaluator(folder, { mode: 'immutable-cwd', args: ['--log', pinnedLog] }),
  });
  const pinnedParents = [];
  try {
    const kept = evaluate(['run', '--evaluation', pinned.folder], pinned.env);
    pinnedParents.push(...parentsOfLog(pinnedLog));
    check(
      kept.status === 0 && /could not remove the private directory \S*tea-evaluate-command-/.test(kept.output),
      `an evaluator leaving an immutable file: run exited ${kept.status}; expected 0 naming the directory it could not remove\n${kept.output}`,
    );
    // Every private directory sits beneath the run's one private parent in the user's private root, so what stays is that
    // parent and each trial's working directory in it, and the run's temp directory holds nothing.
    const inside = pinnedParents.length === 1 && fs.existsSync(pinnedParents[0]) ? fs.readdirSync(pinnedParents[0]) : [];
    check(
      pinnedParents.length === 1 &&
        inPrivateRoot(pinnedParents[0]) &&
        inside.length === 2 * TRIALS &&
        inside.every((entry) => entry.startsWith('tea-evaluate-command-')) &&
        fs.readdirSync(pinned.env.TMPDIR).length === 0,
      `an evaluator leaving an immutable file: the run left ${JSON.stringify(pinnedParents)} holding ${JSON.stringify(inside)} and ${JSON.stringify(fs.readdirSync(pinned.env.TMPDIR))} in its temp directory; expected the private parent holding each trial's working directory alone, every workspace removed`,
    );
  } finally {
    // The parent is in the shared root, so this case removes what the run could not.
    for (const parent of pinnedParents) {
      spawnSync('chflags', ['-R', 'nouchg', parent]);
      fs.rmSync(parent, { recursive: true, force: true });
    }
  }
}

/**
 * A signal that ends a run mid-trial removes the evaluator's private
 * directories: a command evaluator's working directory, and a sealed-brief
 * agent's working directory, its bridge configuration (which holds the
 * bridge's token) and its socket's directory.
 */
async function checkSignalMidTrial() {
  if (process.platform === 'win32') return;
  const interrupt = async (project, { ready, signal, expected, parents }) => {
    const child = spawn(process.execPath, [EVALUATE, 'run', '--evaluation', project.folder], {
      cwd: PROJECT_ROOT,
      env: { ...BASE_ENV, ...project.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    const ended = new Promise((resolve) => child.on('exit', (code, name) => resolve({ code, name })));
    const deadline = Date.now() + SPAWN_TIMEOUT_MS;
    while (!fs.existsSync(ready) && Date.now() < deadline && child.exitCode === null)
      await new Promise((resolve) => setTimeout(resolve, 100));
    const top = fs.readdirSync(project.env.TMPDIR);
    // Every private directory of the run sits beneath its one private parent, in the user's private root (Story 1.58).
    const made = parents();
    const during = [...top, ...made.flatMap((parent) => (fs.existsSync(parent) ? fs.readdirSync(parent) : []))];
    child.kill(signal);
    const { code, name } = await ended;
    const after = fs.readdirSync(project.env.TMPDIR);
    check(name === signal, `${expected.join(', ')} under ${signal}: the run ended with code ${code} and signal ${name}\n${output}`);
    for (const prefix of expected) {
      check(
        during.some((entry) => entry.startsWith(prefix)),
        `under ${signal}: no ${prefix}* directory was in the temp directory mid-trial (${JSON.stringify(during)}), so the case proves nothing`,
      );
      check(
        !top.some((entry) => entry.startsWith(prefix)),
        `under ${signal}: a ${prefix}* directory sat in the temp directory itself mid-trial (${JSON.stringify(top)}), outside the run's private parent`,
      );
    }
    check(after.length === 0, `a run ended by ${signal} mid-trial left ${JSON.stringify(after)} in its temp directory`);
    check(
      made.length === 1 && inPrivateRoot(made[0]) && !fs.existsSync(made[0]),
      `a run ended by ${signal} mid-trial made the private parent(s) ${JSON.stringify(made)}; expected one in ${PRIVATE_ROOT}, removed`,
    );
    return ready;
  };

  const pids = path.join(scratch.make('signal-command-pids'), 'pids.json');
  const commandLog = path.join(scratch.make('signal-command-log'), 'calls.jsonl');
  const command = makeProject('command-signal', {
    edit: ({ folder }) => useCommandEvaluator(folder, { mode: 'hang', args: ['--pids', pids, '--log', commandLog], timeoutMs: 120_000 }),
  });
  await interrupt(command, {
    ready: pids,
    signal: 'SIGTERM',
    expected: ['tea-evaluate-command-'],
    parents: () => parentsOfLog(commandLog),
  });

  const capture = path.join(scratch.make('signal-agent-capture'), 'capture.jsonl');
  const agent = makeProject('sealed-brief-signal', { edit: ({ folder }) => useSealedBriefAgent(folder, { capture, mode: 'hang' }) });
  await interrupt(agent, {
    ready: capture,
    signal: 'SIGINT',
    expected: ['tea-evaluate-evaluator-', 'tea-evaluate-bridge-config-'],
    parents: () => parentsOfCapture(capture),
  });
  const socket = captures(capture)[0]?.config?.mcpServers?.[captures(capture)[0]?.server]?.args?.at(-1);
  check(
    typeof socket === 'string' && !fs.existsSync(path.dirname(socket)),
    `a run ended by SIGINT mid-attempt left the bridge's socket directory ${socket === undefined ? '(unknown)' : path.dirname(socket)}`,
  );

  // The same agent hanging in the fifth run, the clean arm's first trial, once the qualification's four attempts agreed.
  const trialCapture = path.join(scratch.make('signal-agent-trial-capture'), 'capture.jsonl');
  const trialAgent = makeProject('sealed-brief-signal-trial', {
    edit: ({ folder }) =>
      useSealedBriefAgent(folder, {
        capture: trialCapture,
        mode: 'hang',
        counter: path.join(scratch.make('signal-agent-trial-counter'), 'runs.txt'),
        modeFrom: 2 * QUALIFICATION.attempts + 1,
      }),
  });
  await interrupt(trialAgent, {
    ready: `${trialCapture}.hung`,
    signal: 'SIGINT',
    expected: ['tea-evaluate-evaluator-', 'tea-evaluate-bridge-config-'],
    parents: () => parentsOfCapture(trialCapture),
  });
  const hung = captures(trialCapture).at(-1);
  const trialSocket = hung?.config?.mcpServers?.[hung?.server]?.args?.at(-1);
  check(
    typeof trialSocket === 'string' && !fs.existsSync(path.dirname(trialSocket)),
    `a run ended by SIGINT mid-trial left the bridge's socket directory ${trialSocket === undefined ? '(unknown)' : path.dirname(trialSocket)}`,
  );
  check(captures(trialCapture).length === 2 * QUALIFICATION.attempts + 1, 'the hanging agent did not start in the fifth run');
}

/** Whether the process `pid` still runs. */
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

async function checkEvaluatorTimeout() {
  const pids = path.join(scratch.make('command-hang-pids'), 'pids.json');
  const project = makeProject('command-hang', {
    edit: ({ folder }) => useCommandEvaluator(folder, { mode: 'hang', args: ['--pids', pids], timeoutMs: 5000 }),
  });
  const ran = evaluate(['run', '--evaluation', project.folder], project.env);
  const ended = Date.now();
  check(
    ran.status === 12 && ran.output.includes('still running at its 5000ms timeout'),
    `a hung evaluator: run exited ${ran.status}; expected 12 naming the timeout\n${ran.output}`,
  );
  // The stub records when its process started, before it loaded anything, so the time from there to the run's end
  // holds the whole 5 s timeout less only the spawn itself, however slowly a loaded machine starts it, and ends
  // within the supervisor's 2 s grace and what remains of the run after it. A stop before the wall clock fails the
  // lower bound, and one that waited far past it the upper.
  const started = fs.existsSync(pids) ? readJson(pids).started : undefined;
  check(Number.isFinite(started), 'a hung evaluator: the stub recorded no start time');
  if (Number.isFinite(started)) {
    const ranFor = ended - started;
    check(ranFor >= 4500 && ranFor < 5000 + 2000 + 15_000, `a hung evaluator ran ${ranFor} ms from its start to the run's end`);
  }
  const runDirectory = runDirectoryOf(project.folder);
  check(recordFiles(runDirectory).length === 0, 'a hung evaluator: the run wrote a record');
  const stdout = path.join(runDirectory ?? '', 'evaluator', 'clean', 'trial-1.stdout');
  check(
    fs.existsSync(stdout) && fs.readFileSync(stdout, 'utf8') === '{"rows":[',
    'a hung evaluator: its stdout up to the timeout is not persisted',
  );
  const stderr = path.join(runDirectory ?? '', 'evaluator', 'clean', 'trial-1.stderr');
  check(
    fs.existsSync(stderr) && fs.readFileSync(stderr, 'utf8') === 'stub stderr hang\n',
    'a hung evaluator: its stderr up to the timeout is not persisted',
  );
  const recorded = fs.existsSync(pids) ? readJson(pids) : null;
  check(recorded !== null, 'a hung evaluator: the stub wrote no pids');
  if (recorded !== null) {
    // A killed process may take a moment to be reaped once its parent is gone; wait up to 5 s for both.
    // Under Bubblewrap the evaluator runs in a process-id namespace of its own, so the pids it wrote are not this side's:
    // both processes carry the pids file's path on their command line, and are found by it.
    const carrying = () =>
      spawnSync('pgrep', ['-f', pids.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)], { encoding: 'utf8' }).stdout.trim() !== '';
    const survives = process.platform === 'linux' ? carrying : () => alive(recorded.evaluator) || alive(recorded.child);
    const deadline = Date.now() + 5000;
    while (survives() && Date.now() < deadline) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    check(!survives(), `a hung evaluator: its process group outlived the timeout (${JSON.stringify(recorded)})`);
  }
}

/**
 * The evaluation layer in a confined run (Story 1.31): a command evaluator and
 * a sealed-brief agent, each calibrating R-101 and then judging every trial,
 * try to write into the evaluation folder's runs/ at every launch. A confined
 * run refuses every write, in calibration and in each trial, and nothing
 * lands; in a run that opted out the same writes land, so the refusal is the
 * confinement's and not a stub that never tried.
 */
async function checkLayerWritesRefused() {
  for (const kind of ['command', 'sealed-brief-agent']) {
    for (const confined of [true, false]) {
      const label = `${kind}-layer-write${confined ? '' : '-open'}`;
      const plantLog = path.join(scratch.make(`${label}-plants`), 'plants.jsonl');
      const capture = path.join(scratch.make(`${label}-capture`), 'calls.jsonl');
      let planted = null;
      const project = makeProject(label, {
        unconfined: !confined,
        edit: ({ folder }) => {
          planted = path.join(folder, 'runs', '.layer-planted');
          const plant = ['--plant', planted, '--plant-log', plantLog];
          if (kind === 'command') {
            useCommandEvaluator(folder, { mode: 'score', args: plant });
            addRubric(folder);
          } else {
            useSealedBriefAgent(folder, { capture, rubric: true });
            editJson(path.join(folder, 'evaluation.json'), (evaluation) => evaluation.evaluator.agentArgs.push(...plant));
          }
        },
      });
      const ran = evaluate(['run', '--evaluation', project.folder], project.env);
      check(ran.status === 0, `${label}: run exited ${ran.status}; expected 0\n${ran.output}`);
      const attempts = captures(plantLog);
      const phases = [
        ['calibration', attempts.filter((attempt) => attempt.calibration)],
        ['a trial', attempts.filter((attempt) => !attempt.calibration)],
      ];
      for (const [phase, made] of phases) {
        check(made.length > 0, `${label}: the ${kind} tried no write during ${phase}, so the case proves nothing`);
        if (confined) {
          check(
            made.every((attempt) => /^refused (EPERM|EACCES|EROFS|ENOENT)$/.test(attempt.outcome)),
            `a confined run's ${kind} wrote into the evaluation folder during ${phase}: ${JSON.stringify(made)}`,
          );
        } else {
          check(
            made.every((attempt) => attempt.outcome === 'allowed'),
            `the opted-out ${kind} could not write into the evaluation folder during ${phase}, so the confined case proves nothing: ${JSON.stringify(made)}`,
          );
        }
      }
      check(
        fs.existsSync(planted) === !confined,
        confined ? `a confined run's ${kind} planted ${planted}` : `the opted-out ${kind} left no ${planted}`,
      );
    }
  }
}

// -------------------------------------------------------------- sealed-brief agent

/** The qualification the adopter declares for a sealed-brief agent: two attempts per arm, and near-total agreement (Story 1.34). */
const QUALIFICATION = { attempts: 2, minimumAgreement: 0.9 };

/** The sealed-brief agent wired into `folder`: the stub through the `custom` adapter, its mapping, and its model snapshot. */
function useSealedBriefAgent(
  folder,
  {
    capture,
    mode = 'normal',
    budget = 3,
    rubric = false,
    targetModel = null,
    qualification = QUALIFICATION,
    counter = null,
    modeFrom = null,
    announce = null,
    versionFile = null,
    versionReadCounter = null,
    versionFlipAtRead = null,
    requireVersionEnv = null,
    versionDelayAtRead = null,
    versionDelayMs = null,
    flipVersionOnAgent = null,
    agentCommand = process.execPath,
    agentScript = STUB_AGENT,
  },
) {
  fs.mkdirSync(path.join(folder, 'evaluator'), { recursive: true });
  fs.copyFileSync(path.join(COMMAND_EVALUATOR, 'mapping.json'), path.join(folder, 'evaluator', 'mapping.json'));
  editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
    evaluation.evaluator = {
      kind: 'sealed-brief-agent',
      agent: 'custom',
      agentCommand,
      agentArgs: [
        agentScript,
        '--capture',
        capture,
        '--mode',
        mode,
        ...(counter === null ? [] : ['--counter', counter]),
        ...(modeFrom === null ? [] : ['--mode-from', String(modeFrom)]),
        ...(announce === null ? [] : ['--announce', announce]),
        ...(versionFile === null ? [] : ['--version-file', versionFile]),
        ...(versionReadCounter === null ? [] : ['--version-read-counter', versionReadCounter]),
        ...(versionFlipAtRead === null ? [] : ['--version-flip-at-read', String(versionFlipAtRead)]),
        ...(requireVersionEnv === null ? [] : ['--require-version-env', requireVersionEnv]),
        ...(versionDelayAtRead === null ? [] : ['--version-delay-at-read', String(versionDelayAtRead)]),
        ...(versionDelayMs === null ? [] : ['--version-delay-ms', String(versionDelayMs)]),
        ...(flipVersionOnAgent === null ? [] : ['--flip-version-on-agent', String(flipVersionOnAgent)]),
      ],
      timeoutMs: 60_000,
    };
    if (qualification !== null) evaluation.evaluatorQualification = qualification;
  });
  editJson(path.join(folder, 'contract.json'), (contract) => {
    contract.budgets.maxToolCalls = budget;
  });
  writeJson(path.join(folder, 'policy', 'evaluator-conditions.json'), {
    schemaVersion: 1,
    modelSnapshot: targetModel ?? 'none',
    systemPromptDigest: targetModel === null ? sha256(Buffer.alloc(0)) : TARGET_PROMPT_DIGEST,
    evaluator: { modelSnapshot: AGENT_SNAPSHOT },
  });
  if (rubric) addRubric(folder);
}

async function checkAgentVersionUpgrade() {
  const capture = path.join(scratch.make('agent-version-capture'), 'calls.jsonl');
  const versionFile = path.join(scratch.make('agent-version-file'), 'version.txt');
  const agentScript = path.join(scratch.make('agent-version-executable'), 'stub-evaluator-agent.js');
  fs.copyFileSync(STUB_AGENT, agentScript);
  fs.writeFileSync(versionFile, '1.0.0\n');
  const project = makeProject('agent-version-upgrade', {
    edit: ({ folder }) => useSealedBriefAgent(folder, { capture, versionFile, agentScript }),
  });
  const first = evaluate(['run', '--evaluation', project.folder], project.env);
  check(first.status === 0, `first agent version run exited ${first.status}: ${first.output}`);
  const firstDirectory = runDirectoryOf(project.folder);
  if (first.status !== 0 || firstDirectory === null) return;
  const firstConfiguration = readJson(path.join(firstDirectory, 'evaluator-configuration.json'));
  const firstRun = readJson(path.join(firstDirectory, 'run.json'));
  const manifest = readJson(path.join(firstDirectory, 'trial-sets', 'P-001', 'isolation-manifest.json'));
  check(
    manifest.resourceCeilings.maxWallClockMinutes === ((30_000 + 60_000 + 3 * AGENT_VERSION_CEILING_MS) * TRIALS) / 60_000,
    'the sealed-brief trial ceiling omitted a bounded agent version read',
  );
  fs.writeFileSync(versionFile, '1.0.1\n');
  const second = evaluate(['run', '--evaluation', project.folder], project.env);
  check(second.status === 0, `upgraded agent version run exited ${second.status}: ${second.output}`);
  const secondDirectory = runDirectoryOf(project.folder);
  if (second.status !== 0 || secondDirectory === null) return;
  const secondConfiguration = readJson(path.join(secondDirectory, 'evaluator-configuration.json'));
  const secondRun = readJson(path.join(secondDirectory, 'run.json'));
  check(firstConfiguration.decodingParameters['tea.evaluatorAgentVersion'] === '1.0.0', 'first installed agent version was not recorded');
  check(
    secondConfiguration.decodingParameters['tea.evaluatorAgentVersion'] === '1.0.1',
    'upgraded installed agent version was not recorded',
  );
  check(
    firstRun.evaluator?.version === '1.0.0' && secondRun.evaluator?.version === '1.0.1',
    'run.json omitted the installed agent version',
  );
  check(firstRun.evaluatorConfigurationDigest !== secondRun.evaluatorConfigurationDigest, 'agent upgrade collided on configuration digest');
  const firstScore = evaluate(['score', '--evaluation', project.folder, '--run', path.basename(firstDirectory)], project.env);
  const secondScore = evaluate(['score', '--evaluation', project.folder, '--run', path.basename(secondDirectory)], project.env);
  check(firstScore.status === 0 && secondScore.status === 0, 'both installed agent versions did not score');
  const evidenceVersion = (directory) => {
    const scores = path.join(directory, 'scores');
    const latest = fs.readdirSync(scores).sort().at(-1);
    return readJson(path.join(scores, latest, 'P-002', 'evidence-artifact.json')).scoringVersion;
  };
  if (firstScore.status === 0 && secondScore.status === 0)
    check(evidenceVersion(firstDirectory) !== evidenceVersion(secondDirectory), 'agent upgrade collided on scoring version');
  const latestEvidenceBytes = (directory) => {
    const scores = path.join(directory, 'scores');
    return fs.readFileSync(path.join(scores, fs.readdirSync(scores).sort().at(-1), 'P-002', 'evidence-artifact.json'));
  };
  const scoredBytes = latestEvidenceBytes(firstDirectory);
  const accepted = evaluate(['compare', '--accept', '--evaluation', project.folder, '--run', path.basename(firstDirectory)], project.env);
  check(accepted.status === 0, `agent version baseline was not accepted: ${accepted.output}`);
  if (accepted.status !== 0) return;
  baselines.commitAll(project.repository, 'accept the agent version baseline');
  const launchesBeforeReplay = captures(capture).length;
  fs.unlinkSync(agentScript);
  const replayed = evaluate(['score', '--evaluation', project.folder, '--run', path.basename(firstDirectory)], project.env);
  check(replayed.status === 0, `recorded score failed after the agent CLI was removed: ${replayed.output}`);
  if (replayed.status === 0)
    check(scoredBytes.equals(latestEvidenceBytes(firstDirectory)), 'recorded score evidence changed after CLI removal');
  check(captures(capture).length === launchesBeforeReplay, 'recorded score launched the removed agent CLI');
  const copies = [];
  try {
    const copiedFolder = baselines.copyOf(project, copies);
    const acceptedRun = baselines.placeBaseline(copiedFolder, path.basename(firstDirectory));
    const copiedReplay = evaluate(['score', '--evaluation', copiedFolder, '--run', path.basename(acceptedRun)], project.env);
    check(copiedReplay.status === 0, `accepted baseline replay failed without the agent CLI: ${copiedReplay.output}`);
    if (copiedReplay.status === 0)
      check(scoredBytes.equals(latestEvidenceBytes(acceptedRun)), 'copied accepted baseline replay changed the evidence bytes');
    check(captures(capture).length === launchesBeforeReplay, 'copied accepted baseline replay launched the removed agent CLI');
  } finally {
    for (const copy of copies) fs.rmSync(copy, { recursive: true, force: true });
  }
}

async function checkAgentVersionFaults() {
  for (const mode of ['missing', 'fail', 'malformed', 'hang']) {
    const capture = path.join(scratch.make(`agent-version-${mode}-capture`), 'calls.jsonl');
    const versionFile = path.join(scratch.make(`agent-version-${mode}-file`), 'version.txt');
    fs.writeFileSync(versionFile, `${mode}\n`);
    const project = makeProject(`agent-version-${mode}`, {
      edit: ({ folder }) =>
        useSealedBriefAgent(folder, {
          capture,
          versionFile,
          agentCommand: mode === 'missing' ? '/no-such-agent-version-executable' : process.execPath,
        }),
    });
    const began = Date.now();
    const result = evaluate(['run', '--evaluation', project.folder], project.env);
    check(result.status === 12, `${mode} agent version probe exited ${result.status}; expected 12: ${result.output}`);
    if (mode === 'hang') check(Date.now() - began < 12_000, 'agent version probe inherited the evaluator timeout');
    const directory = runDirectoryOf(project.folder);
    check(directory !== null && !fs.existsSync(path.join(directory, 'trial-sets.json')), `${mode} agent version sealed a trial set`);
    check(captures(capture).length === 0, `${mode} agent version launched a qualification attempt`);
  }
}

async function checkAgentVersionEnvironmentAndDelimiter() {
  const key = 'TEA_EVALUATOR_VERSION_ONLY_KEY';
  for (const declared of [false, true]) {
    const capture = path.join(scratch.make(`agent-version-env-${declared}`), 'calls.jsonl');
    const project = makeProject(`agent-version-env-${declared}`, {
      edit: ({ folder }) => {
        useSealedBriefAgent(folder, { capture, requireVersionEnv: key });
        if (declared) editJson(path.join(folder, 'evaluation.json'), (evaluation) => (evaluation.evaluator.environmentKeys = [key]));
      },
    });
    const result = evaluate(['run', '--evaluation', project.folder], { ...project.env, [key]: 'allowed' });
    check(
      result.status === (declared ? 0 : 12),
      `the ${declared ? 'declared' : 'undeclared'} version key exited ${result.status}: ${result.output}`,
    );
    if (!declared) check(captures(capture).length === 0, 'an unreadable version launched the agent before qualification');
  }
  const capture = path.join(scratch.make('agent-version-delimiter'), 'calls.jsonl');
  const project = makeProject('agent-version-delimiter', {
    edit: ({ folder }) => {
      useSealedBriefAgent(folder, { capture });
      editJson(path.join(folder, 'evaluation.json'), (evaluation) => evaluation.evaluator.agentArgs.push('--'));
    },
  });
  const result = evaluate(['run', '--evaluation', project.folder], project.env);
  check(result.status === 12 && result.output.includes('standalone --'), `a version flag behind -- was launched: ${result.output}`);
  check(captures(capture).length === 0, 'a delimiter configuration launched the agent');
}

async function checkAgentVersionPostTrialUse() {
  const capture = path.join(scratch.make('agent-version-use-capture'), 'calls.jsonl');
  const reads = path.join(scratch.make('agent-version-use-reads'), 'reads.txt');
  const project = makeProject('agent-version-use', {
    edit: ({ folder }) => useSealedBriefAgent(folder, { capture, versionReadCounter: reads, versionDelayAtRead: 16, versionDelayMs: 400 }),
  });
  const ran = evaluate(['run', '--evaluation', project.folder], project.env);
  check(ran.status === 0, `the delayed post-trial version read exited ${ran.status}: ${ran.output}`);
  const directory = runDirectoryOf(project.folder);
  if (ran.status !== 0 || directory === null) return;
  const records = fs
    .readdirSync(path.join(directory, 'trial-sets', 'P-001'))
    .filter((name) => name.startsWith('record-'))
    .map((name) => readJson(path.join(directory, 'trial-sets', 'P-001', name)));
  const evidence = records.map((record) => readJson(path.join(project.folder, record.actionsArtifact.path)));
  check(
    records.some((record, index) => record.resourceUse.wallClockSeconds * 1000 - evidence[index].elapsedMs >= 300),
    'sealed resource use omitted a delayed post-trial version read',
  );

  const attemptCapture = path.join(scratch.make('agent-version-attempt-use-capture'), 'calls.jsonl');
  const attemptReads = path.join(scratch.make('agent-version-attempt-use-reads'), 'reads.txt');
  const attemptProject = makeProject('agent-version-attempt-use', {
    edit: ({ folder }) =>
      useSealedBriefAgent(folder, {
        capture: attemptCapture,
        versionReadCounter: attemptReads,
        versionDelayAtRead: 4,
        versionDelayMs: 400,
      }),
  });
  const attempted = evaluate(['run', '--evaluation', attemptProject.folder], attemptProject.env);
  check(attempted.status === 0, `the delayed post-attempt version read exited ${attempted.status}: ${attempted.output}`);
  const attemptRun = runDirectoryOf(attemptProject.folder);
  if (attempted.status !== 0 || attemptRun === null) return;
  const attemptSet = path.join(attemptRun, attemptDirectory('clean', 1, 'P-001'));
  const attemptRecord = readJson(path.join(attemptSet, 'record-1.json'));
  const attemptEvidence = readJson(path.join(attemptProject.folder, attemptRecord.actionsArtifact.path));
  check(
    attemptRecord.resourceUse.wallClockSeconds * 1000 - attemptEvidence.elapsedMs >= 300,
    'qualification record resource use omitted a delayed post-attempt version read',
  );
}

async function checkAgentVersionMoves() {
  const selected = process.argv.find((value) => value.startsWith('--where='))?.slice('--where='.length) ?? null;
  for (const where of ['before-calibration', 'last-calibration', 'before-attempt', 'after-agent', 'after-attempt', 'after-trial']) {
    if (selected !== null && where !== selected) continue;
    const capture = path.join(scratch.make(`agent-version-${where}-capture`), 'calls.jsonl');
    const versionFile = path.join(scratch.make(`agent-version-${where}-file`), 'version.txt');
    const reads = path.join(scratch.make(`agent-version-${where}-reads`), 'reads.txt');
    const counter = path.join(scratch.make(`agent-version-${where}-agents`), 'agents.txt');
    fs.writeFileSync(versionFile, '1.0.0\n');
    const project = makeProject(`agent-version-${where}`, {
      edit: ({ folder }) => {
        useSealedBriefAgent(folder, {
          capture,
          versionFile,
          versionReadCounter: reads,
          versionFlipAtRead:
            where === 'before-calibration' || where === 'before-attempt'
              ? 2
              : where === 'last-calibration'
                ? 5
                : where === 'after-attempt'
                  ? 4
                  : where === 'after-trial'
                    ? 16
                    : null,
          counter,
          flipVersionOnAgent: where === 'after-agent' ? 1 : null,
          rubric: where === 'before-calibration' || where === 'last-calibration',
        });
        if (where === 'last-calibration') setHalfAgreement(folder);
      },
    });
    const result = evaluate(['run', '--evaluation', project.folder], project.env);
    check(result.status === 12, `${where} agent version change exited ${result.status}; expected 12: ${result.output}`);
    if (where === 'after-attempt')
      check(result.output.includes('after an evaluator attempt'), 'the changed attempt received a vote before its final version read');
    if (where === 'after-trial')
      check(result.output.includes('after a trial'), 'the changed trial was not stopped by its final version read');
    const directory = runDirectoryOf(project.folder);
    check(directory !== null && !fs.existsSync(path.join(directory, 'trial-sets.json')), `${where} change sealed a trial set`);
    if (where === 'before-attempt' || where === 'before-calibration')
      check(captures(capture).length === 0, 'changed agent launched the affected calibration or qualification attempt');
    if (where === 'after-attempt' || where === 'after-agent')
      check(!fs.existsSync(path.join(directory, 'evaluator-qualification.json')), 'changed qualification attempt received a vote');
    if (where === 'last-calibration')
      check(
        result.output.includes('during calibration') &&
          captures(capture).length === 2 &&
          !fs.existsSync(path.join(directory, 'evaluator-qualification.json')),
        'the last calibration call did not stop with exit 12 before qualification',
      );
  }
}

async function checkAgentVersionAdapterBoundary() {
  const { supervisedAgentCeilingMs } = require('../cli/lib/agent-supervisor-bounds');
  check(
    AGENT_VERSION_CEILING_MS === supervisedAgentCeilingMs(AGENT_VERSION_TIMEOUT_MS) &&
      supervisedAgentCeilingMs(AGENT_VERSION_TIMEOUT_MS, 'darwin') === 33_000 &&
      supervisedAgentCeilingMs(AGENT_VERSION_TIMEOUT_MS, 'linux') === 33_000 &&
      supervisedAgentCeilingMs(AGENT_VERSION_TIMEOUT_MS, 'win32') === 113_000,
    'the version ceiling omitted supervisor cleanup, POSIX watchdog setup, or Windows Job Object setup time',
  );
  check(
    JSON.stringify(AGENT_ADAPTERS.claude.versionArgv()) === '["--version"]' &&
      JSON.stringify(AGENT_ADAPTERS.claude.versionArgv(['--model', 'fixed'])) === '["--model","fixed","--version"]' &&
      AGENT_ADAPTERS.claude.parseVersion('2.1.282 (Claude Code)') === '2.1.282' &&
      AGENT_ADAPTERS.custom.parseVersion('stub-evaluator-agent 1.0.1') === '1.0.1' &&
      AGENT_ADAPTERS.custom.parseVersion('unknown') === null,
    'the adapters do not own their version invocation and output parsing',
  );
  for (const file of ['run.js', 'evaluators.js', 'sealed-brief-agent.js']) {
    const source = fs.readFileSync(path.join(PROJECT_ROOT, 'cli', 'lib', 'evaluate', file), 'utf8');
    check(!source.includes('--version') && !source.includes('parseInstalledVersion'), `${file} owns a vendor version flag or parser`);
  }
  let missing = null;
  try {
    configurationFields({
      layer: {
        evaluator: { kind: 'sealed-brief-agent', agent: 'custom', agentCommand: 'stub', timeoutMs: 1 },
        treeDigest: 't',
        mapping: { keys: {} },
      },
      conditions: { evaluator: { modelSnapshot: 'fixed' } },
      digestBytes: (await loadEngine()).digestBytes,
    });
  } catch (error) {
    missing = error;
  }
  check(missing instanceof TypeError, 'a sealed-brief configuration accepted an unobserved adapter version');
}

/** A target model's system prompt digest, as a target that runs a model would name it. */
const TARGET_PROMPT_DIGEST = `sha256:${'1'.repeat(64)}`;

function captures(file) {
  return fs.existsSync(file)
    ? fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line))
    : [];
}

/** Every string the contract carries that the agent must never see: oracle checks and their pointers, plan step IDs and literals, operation IDs, test data. */
function withheldStrings(contract, folder) {
  const found = new Set();
  const leaves = (value) => {
    if (typeof value === 'string') found.add(value);
    else if (Array.isArray(value)) for (const item of value) leaves(item);
    else if (value !== null && typeof value === 'object') for (const item of Object.values(value)) leaves(item);
  };
  for (const oracle of contract.oracles) {
    found.add(JSON.stringify(oracle.check));
    leaves(oracle.check);
  }
  for (const step of contract.interactionPlan) {
    found.add(step.stepId);
    leaves(step.inputBinding);
  }
  for (const iface of contract.permittedInterfaces) for (const operation of iface.operations) found.add(operation.operationId);
  leaves(contract.testData);
  // The committed probes' and mutations' own prose and operands.
  for (const name of fs.readdirSync(path.join(folder, 'probes'))) {
    const probe = readJson(path.join(folder, 'probes', name));
    found.add(probe.rationale);
    for (const defect of probe.defects) found.add(defect.summary);
  }
  for (const name of fs.readdirSync(path.join(folder, 'mutations'))) {
    const mutation = readJson(path.join(folder, 'mutations', name));
    found.add(mutation.operator.find).add(mutation.operator.replace).add(mutation.expectedObservableFailure);
  }
  // Literals the brief carries on its own (the behaviors' own prose) are the brief's, not the contract's secrets.
  for (const common of ['all', 'containment', 'equality']) found.delete(common);
  return [...found].filter((text) => typeof text === 'string' && text.length > 2);
}

async function checkSealedBriefAgent() {
  const validate = createArtifactValidator();
  const engine = await loadEngine();
  const capture = path.join(scratch.make('sealed-capture'), 'captures.jsonl');
  // The agent also scores R-101 (so its prompt carries the criterion and the configuration names it as the judge),
  // and the target names a model of its own, which the configuration keeps beside the agent's.
  const project = makeProject('sealed', {
    marker: true,
    edit: ({ folder }) => useSealedBriefAgent(folder, { capture, rubric: true, targetModel: 'a-target-model' }),
  });
  const ran = evaluate(['run', '--evaluation', project.folder], project.env);
  check(ran.status === 0, `a sealed-brief agent run exited ${ran.status}; expected 0\n${ran.output}`);
  const runDirectory = runDirectoryOf(project.folder);
  if (ran.status !== 0 || runDirectory === null) return;
  const brief = readJson(path.join(runDirectory, 'sealed-evaluator-brief.json'));
  const contract = readJson(path.join(project.folder, 'contract.json'));
  const calls = captures(capture);
  // Three calibration calls, each arm's qualification attempts, and each arm's trials.
  const expectedRuns = 3 + 2 * QUALIFICATION.attempts + 2 * TRIALS;
  check(
    calls.length === expectedRuns,
    `the stub agent ran ${calls.length} time(s); expected ${expectedRuns}: calibration, qualification and trials`,
  );
  // Every trial's prompt names a fresh nonce of its own.
  const nonces = calls.map((call) => /<judge-answer nonce="([0-9a-f]{32})">/.exec(call.prompt)?.[1]);
  check(
    nonces.every((nonce) => nonce !== undefined) && new Set(nonces).size === calls.length,
    `the agent's prompts carry the nonces ${JSON.stringify(nonces)}; expected a distinct one per trial`,
  );
  // A literal the brief itself carries (a behavior's own criterion, say) is the brief's to show.
  const withheld = withheldStrings(contract, project.folder).filter((text) => !JSON.stringify(brief).includes(text));
  for (const call of calls) {
    const material = JSON.parse(call.prompt.slice(call.prompt.indexOf('{', call.prompt.indexOf('Sealed brief and keys to judge (JSON):'))));
    check(
      JSON.stringify(material.sealedBrief) === JSON.stringify(brief),
      "the agent's prompt does not carry the sealed brief the run sealed",
    );
    check(call.prompt.startsWith(EVALUATOR_INSTRUCTIONS), "the agent's prompt does not open with the evaluator instructions");
    const seen = JSON.stringify({ prompt: call.prompt, argv: call.argv, tools: call.tools });
    const leaked = withheld.filter((text) => seen.includes(text));
    check(leaked.length === 0, `the agent's prompt or tools carry the contract's ${JSON.stringify(leaked)}`);
    check(
      JSON.stringify(call.tools?.map((tool) => tool.name)) === '["verdict"]' &&
        JSON.stringify(Object.keys(call.tools[0].inputSchema.properties)) === '["arguments","stdin"]',
      `the bridge listed ${JSON.stringify(call.tools)}`,
    );
  }
  for (const probeId of ['P-001', 'P-002']) {
    for (const record of recordsOf(runDirectory, probeId)) {
      for (const problem of await validate('sealed-run-record', record))
        check(false, `a sealed-brief ${probeId} record fails its schema: ${problem}`);
      const [plan, agent] = record.observations;
      check(
        record.observations.length === 2 &&
          plan.provenance === 'baseline' &&
          plan.operationId === 'judge-request' &&
          agent.provenance === 'evaluator-chosen' &&
          agent.operationId === 'judge-request' &&
          agent.sequence > plan.sequence &&
          JSON.stringify(agent.callInputs.stdin) === '{"prompt":"Judge a request of my own."}',
        `a sealed-brief ${probeId} record's observations are ${JSON.stringify(record.observations.map((observation) => [observation.observationId, observation.provenance, observation.operationId, observation.callInputs.stdin]))}`,
      );
      if (probeId === 'P-002') {
        check(
          JSON.stringify(record.findings.map((finding) => finding.observationIds)) === JSON.stringify([[agent.observationId]]),
          `a sealed-brief P-002 record's finding cites ${JSON.stringify(record.findings.map((finding) => finding.observationIds))}`,
        );
      }
      const scores = record.judgeResults.map((result) => [result.rubricId, result.criterionId, result.score]);
      check(
        JSON.stringify(scores) === JSON.stringify([['R-101', 'RC-101', probeId === 'P-001' ? 3 : 1]]),
        `a sealed-brief ${probeId} record's judge results are ${JSON.stringify(record.judgeResults)}`,
      );
    }
  }
  // The agent's own calls launched the target in the trial workspaces, beside the plan's steps.
  const trialLaunches = launches(project).filter((line) => line.workspace?.startsWith('trial-'));
  check(
    trialLaunches.filter((line) => line.request === 'Judge a request of my own.').length === 2 * TRIALS &&
      trialLaunches.filter((line) => line.request === 'Judge the request.').length === 2 * TRIALS,
    `the trials launched ${JSON.stringify(trialLaunches.map((line) => [line.workspace, line.request]))}`,
  );
  const configuration = readJson(path.join(runDirectory, 'evaluator-configuration.json'));
  for (const problem of await validate('evaluator-configuration', configuration))
    check(false, `the sealed-brief configuration fails its schema: ${problem}`);
  const templateDigest = evaluatorTemplateDigest(engine.digestBytes);
  const parameters = configuration.decodingParameters;
  check(
    configuration.modelSnapshot === AGENT_SNAPSHOT &&
      configuration.systemPromptDigest === templateDigest &&
      JSON.stringify(configuration.judgeConfiguration) ===
        JSON.stringify({ modelSnapshot: AGENT_SNAPSHOT, systemPromptDigest: templateDigest }) &&
      parameters['tea.evaluatorKind'] === 'sealed-brief-agent' &&
      parameters['tea.evaluatorAgent'] === 'custom' &&
      parameters['tea.evaluatorModel'] === null &&
      parameters['tea.evaluatorWiring']?.agentArgs?.[0] === STUB_AGENT &&
      parameters['tea.targetModelSnapshot'] === 'a-target-model' &&
      parameters['tea.targetSystemPromptDigest'] === TARGET_PROMPT_DIGEST &&
      parameters['tea.evaluatorTreeDigest'].startsWith('sha256:') &&
      parameters['tea.evaluatorQualificationAttempts'] === QUALIFICATION.attempts &&
      parameters['tea.evaluatorQualificationMinimumAgreement'] === QUALIFICATION.minimumAgreement &&
      configuration.toolInventory.includes('bridge:verdict'),
    `the sealed-brief configuration is ${JSON.stringify(configuration)}`,
  );
  // The prompt each trial's agent received is kept beside what it printed.
  const persistedPrompts = ['clean', 'mutated-M-001'].flatMap((arm) =>
    [1, 2, 3].map((trial) => readJson(path.join(runDirectory, 'evaluator', arm, `trial-${trial}.json`)).prompt),
  );
  check(
    persistedPrompts.every((prompt) => calls.some((call) => call.prompt === prompt)),
    'a persisted prompt is not the one the agent received',
  );
  // The isolation manifest's ceilings count the agent's budget and wall clock beside the plan's.
  const manifest = readJson(path.join(runDirectory, 'trial-sets', 'P-002', 'isolation-manifest.json'));
  check(
    manifest.resourceCeilings.maxToolCalls === (1 + 3) * TRIALS && manifest.actualResourceUse.toolCalls === 2 * TRIALS,
    `the sealed-brief manifest's tool calls are ${manifest.resourceCeilings.maxToolCalls} allowed and ${manifest.actualResourceUse.toolCalls} used`,
  );
  // A steady agent agrees with itself: every attempt of the qualification agrees, and its outcomes are the artifacts' own.
  const qualification = checkQualificationReport('the sealed-brief agent run', runDirectory, QUALIFICATION);
  check(
    qualification !== null &&
      qualification.arms.every(
        (arm) => arm.agreement === 1 && arm.probes.every((probe) => probe.attempts.every((attempt) => attempt.agrees)),
      ),
    `the steady agent's qualification is ${JSON.stringify(qualification?.arms.map((arm) => [arm.conditionArm, arm.agreement]))}; expected agreement 1`,
  );
  const { evidence } = scoreRun(project, 'the sealed-brief agent run');
  checkVotes('the sealed-brief agent run', evidence, 'P-001', 'passed-clean-control');
  checkVotes('the sealed-brief agent run', evidence, 'P-002', 'caught');
}

/**
 * Story 1.58: the run's private parent is made once, beneath the user's one private root, `/tmp/tea-evaluate-p<uid>`
 * whatever the run's `TMPDIR` is (mode 700, a real directory the user owns, which no run removes), listed first in the run's
 * scratch list, and every scratch directory is made beneath it; the bridge's socket directory, which holds the token file,
 * goes beneath the parent. The token is in that file alone. A root that is a link, or that another user owns, is not used.
 */
async function checkPrivateParent() {
  if (process.platform === 'win32') return;
  const previous = process.env.TMPDIR;
  const made = [];
  try {
    for (const [what, temp] of [
      ['a short temp directory', scratch.make('t')],
      ['a temp directory too long for a socket', fs.mkdtempSync(path.join(scratch.make('long'), `${'a'.repeat(60)}-`))],
    ]) {
      process.env.TMPDIR = temp;
      const list = [];
      const parent = makePrivateParent(list);
      made.push(parent);
      const root = path.dirname(parent);
      check(
        list[0] === parent && list.privateParent === parent && makePrivateParent(list) === parent && list.length === 1,
        `${what}: the private parent is not the first and only entry of the scratch list once`,
      );
      check(list.privateRoot === root, `${what}: the scratch list names the private root ${list.privateRoot}; expected ${root}`);
      check(root === PRIVATE_ROOT, `${what}: the private root is ${root}; expected ${PRIVATE_ROOT}, whatever the temp directory is`);
      const rootStat = fs.lstatSync(root);
      check(
        rootStat.isDirectory() && rootStat.uid === process.getuid() && (rootStat.mode & 0o777) === 0o700,
        `${what}: the private root is not a directory of yours with mode 700`,
      );
      check(
        (fs.statSync(parent).mode & 0o777) === 0o700,
        `${what}: the private parent's mode is ${(fs.statSync(parent).mode & 0o777).toString(8)}; expected 700`,
      );
      // A run that starts later makes its parent beneath the same root, so one sandbox over the root covers both.
      const second = [];
      const secondParent = makePrivateParent(second);
      made.push(secondParent);
      check(
        path.dirname(secondParent) === root && secondParent !== parent,
        `${what}: a second run's parent is ${secondParent}; expected another directory in ${root}`,
      );
      const child = makeScratchDirectory(list, 'tea-evaluate-evaluator-');
      check(
        path.dirname(child) === parent && list.includes(child),
        `${what}: a scratch directory is made in ${path.dirname(child)}; expected the private parent`,
      );
      const bridge = await openBridge({ tools: [], handle: async () => ({ text: '', isError: false }), scratch: list });
      try {
        const socket = bridge.server.args.at(-1);
        check(
          path.dirname(path.dirname(socket)) === parent && Buffer.byteLength(socket) <= MAX_SOCKET_PATH && fs.statSync(socket).isSocket(),
          `${what}: the bridge's socket ${socket} is not a socket within ${MAX_SOCKET_PATH} bytes in a directory of the private parent`,
        );
        // The token is in a file of mode 600 beside the socket; the relay's environment and argument list name the file.
        const tokenFile = bridge.server.env.TEA_EVALUATE_BRIDGE_TOKEN_FILE;
        const token = fs.readFileSync(tokenFile, 'utf8');
        check(
          path.dirname(tokenFile) === path.dirname(socket) &&
            /^[0-9a-f]{48}$/.test(token) &&
            (fs.statSync(tokenFile).mode & 0o777) === 0o600,
          `${what}: the token file ${tokenFile} is not a mode 600 file of 48 hex characters beside the socket`,
        );
        check(
          JSON.stringify(Object.keys(bridge.server.env)) === '["TEA_EVALUATE_BRIDGE_TOKEN_FILE"]' &&
            !JSON.stringify(bridge.server).includes(token),
          `${what}: the relay's environment or argument list carries the token: ${JSON.stringify(bridge.server)}`,
        );
      } finally {
        await bridge.close();
      }
      check(
        !list.some((entry) => entry !== parent && entry !== child) && fs.readdirSync(parent).length === 1,
        `${what}: the bridge left a directory in the private parent`,
      );
    }
    // A root that is a link, or one whose mode is open, is not taken as it is: a link is refused, an open mode is closed.
    const base = scratch.make('root-base');
    const target = scratch.make('root-target');
    fs.symlinkSync(target, path.join(base, path.basename(PRIVATE_ROOT)));
    check(privateRootIn(base) === null, 'a private root that is a link was used');
    check(fs.readdirSync(target).length === 0, 'a run made a directory through a linked private root');
    const open = scratch.make('root-open');
    fs.mkdirSync(path.join(open, path.basename(PRIVATE_ROOT)), { mode: 0o777 });
    fs.chmodSync(path.join(open, path.basename(PRIVATE_ROOT)), 0o777);
    check(
      privateRootIn(open) === path.join(open, path.basename(PRIVATE_ROOT)) &&
        (fs.statSync(path.join(open, path.basename(PRIVATE_ROOT))).mode & 0o777) === 0o700,
      'a private root with an open mode was not closed to mode 700',
    );
    // The suites reap the parents killed runs left (a dead pid in the name) and never follow a planted link: the reaper holds
    // the root to the production check before it lists it.
    const dead = spawnSync(process.execPath, ['-e', '']).pid;
    const rootName = path.basename(PRIVATE_ROOT);
    const reapBase = scratch.make('reap-base');
    const reapTarget = scratch.make('reap-target');
    fs.mkdirSync(path.join(reapTarget, `run-${dead}-abcdef`));
    fs.symlinkSync(reapTarget, path.join(reapBase, rootName));
    removeDeadPrivateParents(reapBase);
    check(
      fs.existsSync(path.join(reapTarget, `run-${dead}-abcdef`)),
      "the suites' reaper followed a planted link and removed what it found there",
    );
    fs.rmSync(path.join(reapBase, rootName));
    fs.mkdirSync(path.join(reapBase, rootName), { mode: 0o700 });
    for (const name of [`run-${dead}-abcdef`, `run-${process.pid}-abcdef`, 'other']) fs.mkdirSync(path.join(reapBase, rootName, name));
    removeDeadPrivateParents(reapBase);
    check(
      JSON.stringify(fs.readdirSync(path.join(reapBase, rootName)).sort()) === JSON.stringify(['other', `run-${process.pid}-abcdef`]),
      `the reaper left ${JSON.stringify(fs.readdirSync(path.join(reapBase, rootName)))}; expected the dead pid's parent removed and a live pid's and an unrelated entry kept`,
    );
  } finally {
    if (previous === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previous;
    for (const parent of made) removeScratchDirectory(parent);
  }
}

/** A listener on 127.0.0.1 that collects the lines a process left running reports (a confined process can write no file a test could read). */
async function reportListener() {
  const received = [];
  const server = net.createServer((socket) => {
    let text = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => (text += chunk));
    socket.on('end', () => received.push(...text.split('\n').filter((line) => line.length > 0)));
    socket.on('error', () => {});
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: server.address().port,
    lines: () => received,
    /** Waits until a reported line satisfies `matches`, for at most `timeoutMs`; the lines seen so far either way. */
    async until(matches, timeoutMs = 60_000) {
      const deadline = Date.now() + timeoutMs;
      while (!received.some(matches) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
      return received;
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/** The `private-<name>: <how>` lines the `probe-private` stub printed (or its leftover reported), by name. */
function privateLines(text) {
  return Object.fromEntries(
    text
      .split('\n')
      .map((line) => /^private-([a-z-]+): (.*)$/.exec(line))
      .filter((match) => match !== null)
      .map(([, name, how]) => [name, how]),
  );
}

/** The `probe-private` report of the run's agent call (the one that saw an announcement), from the stdout the records kept. */
function agentPrivateReport(runDirectory) {
  const reports = [];
  const visit = (value) => {
    if (Array.isArray(value)) for (const item of value) visit(item);
    else if (value !== null && typeof value === 'object') {
      const stdout = value.stdout?.value;
      if (typeof stdout === 'string' && stdout.includes('private-announced: ')) reports.push(privateLines(stdout));
      for (const item of Object.values(value)) visit(item);
    }
  };
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.json')) visit(readJson(full));
    }
  };
  walk(runDirectory);
  return reports.filter((report) => report.announced !== '0');
}

/**
 * How a confined target's attempt on a private path ends. Seatbelt answers `EPERM` to every one, so a path that was already
 * gone (`ENOENT`) fails the case on macOS; Bubblewrap covers the root with an empty file system, so a path there is absent or
 * lists nothing.
 */
const WITHHELD = process.platform === 'linux' ? /^(refused (EPERM|EACCES|ENOENT)|listed 0)$/ : /^refused EPERM$/;
const WITHHELD_SOCKET = process.platform === 'linux' ? /^refused (EPERM|EACCES|ENOENT|ECONNREFUSED)$/ : /^refused EPERM$/;

/**
 * Story 1.58: the bridge's configuration file, its token file, its socket and the agent's working directory are withheld
 * from a confined target and from a process it leaves running, including directories made after that process started,
 * while the agent's own connection is admitted; a run that opted out of confinement leaves them readable, so the attempts
 * are known to find them. Under Bubblewrap the leftover process ends with the target's process-id namespace, so its report
 * is optional there and the target's own attempts carry the case (`checkLeftoverProcess` in `test-evaluate-run.js`).
 */
async function checkBridgePrivateDirectories() {
  if (process.platform === 'win32') return;
  const attempts = async (label, { unconfined }) => {
    const namespaced = !unconfined && process.platform === 'linux';
    const announce = path.join(scratch.make(`${label}-announce`), 'announce.jsonl');
    const capture = path.join(scratch.make(`${label}-capture`), 'captures.jsonl');
    const listener = await reportListener();
    try {
      const project = makeProject(label, {
        unconfined,
        edit: ({ folder }) => useSealedBriefAgent(folder, { capture, announce }),
      });
      const ran = evaluate(['run', '--evaluation', project.folder], {
        ...project.env,
        VERDICT_WHEN: 'trial-clean-1',
        VERDICT_DO: 'probe-private',
        VERDICT_TOUCH: announce,
        VERDICT_REPORT: String(listener.port),
      });
      check(ran.status === 0, `${label}: the run exited ${ran.status}; expected 0\n${ran.output}`);
      const runDirectory = runDirectoryOf(project.folder);
      const reports = runDirectory === null ? [] : agentPrivateReport(runDirectory);
      // The call's report is kept in several of the run's files; it is one report.
      check(
        new Set(reports.map((one) => JSON.stringify(one))).size === 1,
        `${label}: ${new Set(reports.map((one) => JSON.stringify(one))).size} distinct private-directory report(s) found; expected 1`,
      );
      // The leftover reports on the directories made after it started: the next trial's.
      const reported = namespaced ? listener.lines() : await listener.until((line) => line.startsWith('private-leftover'));
      const leftover = privateLines(reported.join('\n'));
      // The agent's own connection was admitted in every trial: each record carries the agent's observation.
      if (runDirectory !== null) {
        for (const probeId of ['P-001', 'P-002']) {
          const records = recordsOf(runDirectory, probeId);
          check(
            records.length === TRIALS &&
              records.every((record) => record.observations.some((observation) => observation.provenance === 'evaluator-chosen')),
            `${label}: a ${probeId} record carries no observation the agent made through the bridge`,
          );
        }
      }
      const calls = captures(capture);
      check(
        calls.length === 2 * QUALIFICATION.attempts + 2 * TRIALS && calls.every((call) => call.results.length === 1),
        `${label}: the agent ran ${calls.length} time(s) with results ${JSON.stringify(calls.map((call) => call.results?.length))}; expected one call each in the qualification's ${2 * QUALIFICATION.attempts} attempts and ${2 * TRIALS} trials`,
      );
      // The token is in the token file alone: the relay's configuration (its environment and argument list) names the file.
      check(
        calls.every((call) => {
          const server = call.config?.mcpServers?.[call.server];
          return (
            !/[0-9a-f]{48}/.test(JSON.stringify(call.config)) &&
            JSON.stringify(Object.keys(server?.env ?? {})) === '["TEA_EVALUATE_BRIDGE_TOKEN_FILE"]' &&
            !JSON.stringify(server?.args ?? []).includes('TOKEN')
          );
        }),
        `${label}: the relay's environment or argument list carries more than the token file's path: ${JSON.stringify(calls[0]?.config)}`,
      );
      return { report: reports[0] ?? {}, leftover, output: ran.output, namespaced };
    } finally {
      await listener.close();
    }
  };

  const confined = await attempts('private-confined', { unconfined: false });
  const { report, leftover } = confined;
  const refused = (what, how, pattern = WITHHELD) =>
    check(pattern.test(how ?? ''), `${what} ended ${JSON.stringify(how)}; expected it withheld (${pattern})`);
  refused("a confined target's read of the bridge's configuration", report['config-read']);
  refused("a confined target's read of the bridge's token file", report['token-read']);
  refused("a confined target's listing of the agent's working directory", report['evaluator-list']);
  // Bubblewrap's empty file system over the root holds the path to the target's own home (Story 1.59) and nothing else: the
  // parent lists that home alone, and the root lists the run's own parent alone.
  const onlyPathTo = (what, how, names, prefix) =>
    refused(
      what,
      process.platform === 'linux' && how === 'listed 1' && new RegExp(`^\\["${prefix}[^"]*"\\]$`).test(names ?? '') ? 'listed 0' : how,
    );
  onlyPathTo(
    "a confined target's listing of the run's private parent",
    report['parent-list'],
    report['parent-names'],
    'tea-evaluate-target-home-',
  );
  onlyPathTo("a confined target's listing of the private root", report['root-list'], report['root-names'], 'run-');
  refused("a confined target's connection to the bridge's socket", report['socket-connect'], WITHHELD_SOCKET);
  check(
    report['temp-write'] === 'allowed',
    `a confined target's write to its own temp directory ended ${JSON.stringify(report['temp-write'])}; expected it allowed`,
  );
  // The process the target left running, which started before the directories it tries were made.
  if (confined.namespaced) {
    for (const name of ['config-read', 'token-read', 'evaluator-list', 'socket-connect']) {
      const how = leftover[`leftover-${name}`];
      check(
        how === undefined || (name === 'socket-connect' ? WITHHELD_SOCKET : WITHHELD).test(how),
        `a confined leftover process's ${name} ended ${JSON.stringify(how)}; expected no report or a refusal`,
      );
    }
  } else {
    refused("a confined leftover process's read of a later bridge configuration", leftover['leftover-config-read']);
    refused("a confined leftover process's read of a later bridge token file", leftover['leftover-token-read']);
    refused("a confined leftover process's listing of a later working directory", leftover['leftover-evaluator-list']);
    refused("a confined leftover process's listing of the private root", leftover['leftover-root-list']);
    refused("a confined leftover process's connection to a later bridge socket", leftover['leftover-socket-connect'], WITHHELD_SOCKET);
  }

  // The control: the same stub in a run that opted out finds all of it, so the attempts above can see what they are refused.
  const open = await attempts('private-open', { unconfined: true });
  const control = open.report;
  check(
    control['config-read'] === 'allowed',
    `the unconfined control's read of the bridge's configuration ended ${JSON.stringify(control['config-read'])}`,
  );
  check(
    control['token-read'] === 'token',
    `the unconfined control's read of the bridge's token file ended ${JSON.stringify(control['token-read'])}; expected the admission token`,
  );
  check(
    control['evaluator-list'] === 'listed 1',
    `the unconfined control's listing of the agent's working directory ended ${JSON.stringify(control['evaluator-list'])}`,
  );
  check(
    /^listed [1-9]\d*$/.test(control['parent-list'] ?? ''),
    `the unconfined control's listing of the private parent ended ${JSON.stringify(control['parent-list'])}; expected its entries`,
  );
  check(
    /^listed [1-9]\d*$/.test(control['root-list'] ?? ''),
    `the unconfined control's listing of the private root ended ${JSON.stringify(control['root-list'])}; expected its entries`,
  );
  check(
    control['socket-connect'] === 'allowed',
    `the unconfined control's connection to the bridge's socket ended ${JSON.stringify(control['socket-connect'])}`,
  );
  check(
    open.leftover['leftover-token-read'] === 'token',
    `the unconfined control's leftover process read ${JSON.stringify(open.leftover['leftover-token-read'])}; expected the admission token`,
  );
  check(
    open.leftover['leftover-evaluator-list'] === 'listed 1',
    `the unconfined control's leftover process listed ${JSON.stringify(open.leftover['leftover-evaluator-list'])}; expected the working directory's file`,
  );
  check(
    open.leftover['leftover-socket-connect'] === 'allowed',
    `the unconfined control's leftover process connected ${JSON.stringify(open.leftover['leftover-socket-connect'])}`,
  );
  // Neither the token nor a private path reached the run's output.
  for (const [what, output] of [
    ['the confined run', confined.output],
    ['the control run', open.output],
  ]) {
    check(!/[0-9a-f]{48}/.test(output), `${what} printed a 48-character hex value, which an admission token would be`);
  }
}

/**
 * Every attempt's outcome in `evaluator-qualification.json` equals the state its evidence artifact holds, byte for byte,
 * an Invalid attempt (no artifact) holds none, and each agreement is the fraction of attempts that equal the state the arm
 * expects (AD-1: the runtime computes no outcome). Returns what differs.
 */
function qualificationMismatches(runDirectory, report) {
  const mismatches = [];
  for (const arm of report.arms) {
    const slug = arm.conditionArm.replace(':', '-');
    for (const probe of arm.probes) {
      const at = `${arm.conditionArm}/${probe.probeId}`;
      if (probe.attempts.length !== report.attempts || probe.attempts.some((attempt, index) => attempt.attempt !== index + 1))
        mismatches.push(
          `${at}: holds attempts ${JSON.stringify(probe.attempts.map((attempt) => attempt.attempt))}, not 1 to ${report.attempts}`,
        );
      for (const attempt of probe.attempts) {
        const label = `${at}/attempt ${attempt.attempt}`;
        const artifact = `evaluator-qualification/${slug}/attempt-${attempt.attempt}/${probe.probeId}/evidence-artifact.json`;
        if (attempt.evidence === null) {
          // An Invalid attempt: the engine's exit, its invalid lines, no outcome, and no artifact on disk.
          if (
            attempt.outcome !== null ||
            attempt.exitCode !== 3 ||
            attempt.invalid.length === 0 ||
            fs.existsSync(path.join(runDirectory, artifact))
          )
            mismatches.push(`${label}: an attempt with no artifact holds an outcome, an exit other than 3, no invalid line or an artifact`);
          continue;
        }
        if (
          attempt.evidence !== artifact ||
          typeof attempt.outcome !== 'string' ||
          ![0, 2].includes(attempt.exitCode) ||
          attempt.invalid.length > 0
        ) {
          mismatches.push(
            `${label}: cites ${attempt.evidence} with exit ${attempt.exitCode} and outcome ${JSON.stringify(attempt.outcome)}`,
          );
          continue;
        }
        const votes = readJson(path.join(runDirectory, attempt.evidence)).reducedProbeOutcomes.find(
          (reduced) => reduced.probeId === probe.probeId,
        ).trialVotes;
        if (votes.length !== 1 || !Buffer.from(attempt.outcome).equals(Buffer.from(votes[0].state)))
          mismatches.push(
            `${label}: outcome ${JSON.stringify(attempt.outcome)}, the artifact holds ${JSON.stringify(votes.map((vote) => vote.state))}`,
          );
      }
      const agreeing = probe.attempts.filter((attempt) => attempt.outcome === probe.expectedOutcome).length;
      if (
        probe.agreement !== agreeing / report.attempts ||
        probe.attempts.some((attempt) => attempt.agrees !== (attempt.outcome === probe.expectedOutcome))
      )
        mismatches.push(`${at}: agreement ${probe.agreement} does not follow its attempts`);
    }
    if (arm.agreement !== Math.min(...arm.probes.map((probe) => probe.agreement)))
      mismatches.push(`${arm.conditionArm}: agreement is not its lowest probe's`);
  }
  return mismatches;
}

/** The report a run wrote, held to the runtime's own schema, its attempts to their evidence artifacts and its files to the run directory's layout. */
function checkQualificationReport(what, runDirectory, { attempts, minimumAgreement }) {
  const file = path.join(runDirectory, 'evaluator-qualification.json');
  if (!fs.existsSync(file)) {
    check(false, `${what}: the run wrote no evaluator-qualification.json`);
    return null;
  }
  const report = readJson(file);
  const schema = readJson(path.join(PROJECT_ROOT, 'cli', 'lib', 'evaluate', 'schemas', 'evaluator-qualification.schema.json'));
  const validateReport = qualificationSchema(schema);
  check(validateReport(report), `${what}: evaluator-qualification.json fails its schema: ${JSON.stringify(validateReport.errors)}`);
  check(
    report.attempts === attempts && report.minimumAgreement === minimumAgreement,
    `${what}: the report declares ${report.attempts} attempt(s) at ${report.minimumAgreement}; expected ${attempts} at ${minimumAgreement}`,
  );
  check(
    JSON.stringify(report.arms.map((arm) => arm.conditionArm)) === '["clean","mutated:M-001"]',
    `${what}: the report qualifies ${JSON.stringify(report.arms.map((arm) => arm.conditionArm))}; expected the clean and the mutated arm`,
  );
  check(
    JSON.stringify(report.arms.map((arm) => arm.probes.map((probe) => [probe.probeId, probe.expectedOutcome]))) ===
      '[[["P-001","passed-clean-control"]],[["P-002","caught"]]]',
    `${what}: the report expects ${JSON.stringify(report.arms.map((arm) => arm.probes))}`,
  );
  for (const mismatch of qualificationMismatches(runDirectory, report)) check(false, `${what}: ${mismatch}`);
  // Nothing an attempt wrote lands where a trial's does, and every attempt has files of its own.
  for (const slug of ['clean', 'mutated-M-001']) {
    const kept = fs.readdirSync(path.join(runDirectory, 'evaluator-qualification', slug)).sort();
    check(
      JSON.stringify(kept) === JSON.stringify(Array.from({ length: attempts }, (_, index) => `attempt-${index + 1}`)),
      `${what}: ${slug} kept ${JSON.stringify(kept)} of its attempts`,
    );
    // The trials keep exactly their own files: an attempt's evidence or streams leaking there would add or overwrite one.
    for (const [directory, pattern] of [
      ['trials', 'json'],
      ['evaluator', null],
    ]) {
      const where = path.join(runDirectory, directory, slug);
      if (!fs.existsSync(where)) continue;
      const expected = Array.from({ length: TRIALS }, (_, index) => `trial-${index + 1}`);
      const names = fs.readdirSync(where).sort();
      const wanted = (pattern === null ? ['json', 'stderr', 'stdout'] : [pattern]).flatMap((extension) =>
        expected.map((name) => `${name}.${extension}`),
      );
      check(
        JSON.stringify(names) === JSON.stringify(wanted.sort()),
        `${what}: ${directory}/${slug} holds ${JSON.stringify(names)}; expected only the ${TRIALS} trial(s)' own files`,
      );
    }
  }
  return report;
}

/** A compiled validator for a runtime-owned schema. */
function qualificationSchema(schema) {
  const AjvModule = require('ajv/dist/2020');
  const Ajv = AjvModule.default ?? AjvModule;
  return new Ajv({ strict: false, allErrors: true }).compile(schema);
}

/**
 * Story 1.34: a sealed-brief agent is qualified before any trial. The stub agent in its alternating mode
 * (`--counter` outside the project) sends the request on standard input on odd runs and omits it on even ones, so
 * of two attempts on an arm one matches the defect signature's stdin selector and the other does not.
 */
async function checkEvaluatorQualification() {
  // Agreement 0.5 against 0.9: the mutated arm's second attempt is Invalid, the run exits 11 and seals nothing.
  const counter = path.join(scratch.make('qualify-counter'), 'runs.txt');
  const capture = path.join(scratch.make('qualify-capture'), 'calls.jsonl');
  const weak = makeProject('qualify-disagreement', {
    marker: true,
    edit: ({ folder }) => useSealedBriefAgent(folder, { capture, mode: 'alternating-stdin', counter }),
  });
  const ran = evaluate(['run', '--evaluation', weak.folder], weak.env);
  check(ran.status === 11, `an agent that omits stdin on one attempt of two exited ${ran.status}; expected 11\n${ran.output}`);
  check(
    ran.output.includes('mutated:M-001 (0.5)') && ran.output.includes('evaluator-qualification.json'),
    `the stop does not name the arm and the report:\n${ran.output}`,
  );
  const directory = runDirectoryOf(weak.folder);
  check(directory !== null, 'a run that failed its qualification kept no run directory');
  if (directory !== null) {
    const report = checkQualificationReport('the disagreeing agent', directory, QUALIFICATION);
    if (report === null) return;
    const [clean, mutated] = report.arms;
    check(
      clean.agreement === 1,
      `the clean arm's agreement is ${clean.agreement}; the omitted stdin does not change what a clean control passes`,
    );
    check(mutated.agreement === 0.5, `the mutated arm's agreement is ${mutated.agreement}; expected 0.5`);
    const [first, second] = mutated.probes[0].attempts;
    check(
      first.outcome === 'caught' && first.exitCode !== 3 && first.evidence !== null && first.agrees,
      `the mutated arm's first attempt is ${JSON.stringify(first)}`,
    );
    check(
      second.exitCode === 3 &&
        second.evidence === null &&
        second.outcome === null &&
        !second.agrees &&
        second.invalid.length > 0 &&
        second.invalid.every((line) => line.startsWith('eval-quality: invalid:')),
      `the mutated arm's second attempt is ${JSON.stringify(second)}; expected the engine's Invalid exit with its invalid lines`,
    );
    check(!fs.existsSync(path.join(directory, 'trial-sets.json')), 'a run that failed its qualification wrote trial sets');
    check(recordFiles(directory).length === 0, 'a run that failed its qualification wrote trial records');
    check(!fs.existsSync(path.join(directory, 'trials')), 'a run that failed its qualification ran trials');
    check(!fs.existsSync(path.join(directory, 'evaluator')), 'a run that failed its qualification kept a trial evaluator stream');
    check(readJson(path.join(directory, 'run.json')).completed !== true, 'a run that failed its qualification says it completed');
  }
  // Two arms of two attempts each; the counter is outside the project, so every run advanced it.
  check(fs.readFileSync(counter, 'utf8') === '4', `the agent ran ${fs.readFileSync(counter, 'utf8')} time(s); expected 4 attempts`);
  // An attempt launches the target in a workspace whose label does not start with `trial-`, and no trial ran: the
  // launches are the preflight's, the qualifications' and the attempts' (two per attempt: the plan's step and the agent's call).
  const workspaces = launches(weak).map((line) => line.workspace);
  const attemptLaunches = workspaces.filter((workspace) => workspace?.startsWith('attempt-'));
  check(
    workspaces.every((workspace) => !workspace?.startsWith('trial-')) &&
      attemptLaunches.length === 8 &&
      attemptLaunches.some((workspace) => workspace.startsWith('attempt-clean-')) &&
      attemptLaunches.some((workspace) => workspace.startsWith('attempt-mutated-M-001-')),
    `the run launched the target in ${JSON.stringify(workspaces)}; expected eight launches in attempt- workspaces and none in a trial-`,
  );
  // An evaluation that declares no qualification never reaches the agent: `run` refuses it with the authoring exit.
  const undeclared = makeProject('qualify-undeclared', {
    edit: ({ folder }) =>
      useSealedBriefAgent(folder, {
        capture: path.join(scratch.make('qualify-undeclared-capture'), 'calls.jsonl'),
        qualification: null,
      }),
  });
  const refused = evaluate(['run', '--evaluation', undeclared.folder], undeclared.env);
  check(
    refused.status === 10 && refused.output.includes('declares no evaluatorQualification'),
    `a sealed-brief run with no evaluatorQualification exited ${refused.status}; expected 10 naming the missing block\n${refused.output}`,
  );
  // The gate is the adopter's minimum: 0.5 agrees at 0.5, so the same agent seals a run.
  const lenientCounter = path.join(scratch.make('qualify-lenient-counter'), 'runs.txt');
  const lenient = makeProject('qualify-lenient', {
    edit: ({ folder }) =>
      useSealedBriefAgent(folder, {
        capture: path.join(scratch.make('qualify-lenient-capture'), 'calls.jsonl'),
        mode: 'alternating-stdin',
        counter: lenientCounter,
        qualification: { attempts: 2, minimumAgreement: 0.5 },
      }),
  });
  const passed = evaluate(['run', '--evaluation', lenient.folder], lenient.env);
  check(passed.status === 0, `an agent at exactly the minimum agreement exited ${passed.status}; expected 0\n${passed.output}`);
  const passedDirectory = runDirectoryOf(lenient.folder);
  check(passedDirectory !== null, 'the run at the minimum agreement kept no run directory');
  if (passedDirectory !== null) {
    checkQualificationReport('the agent at the minimum', passedDirectory, { attempts: 2, minimumAgreement: 0.5 });
    check(fs.existsSync(path.join(passedDirectory, 'trial-sets.json')), 'a run that passed its qualification sealed no trial set');
    // What the gate protects against: the agent's trials 8 and 10 omit stdin, so the sealed mutated set reads as Invalid.
    const { evidence } = scoreRun(lenient, 'the run sealed at the minimum agreement', 3);
    check(evidence['P-002'] === null, 'the mutated set of an agent that omits stdin on some trials did not read as Invalid');
  }
  // The comparison can fail: each departure from the evidence artifacts and from the agreement arithmetic is a mismatch.
  const weakDirectory = runDirectoryOf(weak.folder);
  const source = readJson(path.join(weakDirectory ?? '', 'evaluator-qualification.json'));
  check(qualificationMismatches(weakDirectory, source).length === 0, 'the disagreeing report has mismatches before any forgery');
  const forgeries = [
    ['an outcome the artifact does not hold', (report) => (report.arms[1].probes[0].attempts[0].outcome = 'missed'), 'outcome "missed"'],
    [
      'an evidence path of another attempt',
      (report) => (report.arms[0].probes[0].attempts[1].evidence = report.arms[0].probes[0].attempts[0].evidence),
      'cites',
    ],
    ['an outcome on an Invalid attempt', (report) => (report.arms[1].probes[0].attempts[1].outcome = 'caught'), 'no artifact'],
    ['a probe agreement of 1', (report) => (report.arms[1].probes[0].agreement = 1), 'agreement 1 does not follow'],
    ['an arm agreement of 1', (report) => (report.arms[1].agreement = 1), 'not its lowest probe'],
    ['a missing attempt', (report) => report.arms[0].probes[0].attempts.pop(), 'holds attempts'],
  ];
  for (const [name, forge, says] of forgeries) {
    const forged = structuredClone(source);
    forge(forged);
    check(
      qualificationMismatches(weakDirectory, forged).some((mismatch) => mismatch.includes(says)),
      `the comparison did not refuse ${name}`,
    );
  }
}

/** A sealed-brief agent project whose stub runs with `--counter` outside the project, the qualification declared as given. */
function makeQualifiedProject(label, { edit = () => {}, mode, modeFrom = null, qualification = QUALIFICATION }) {
  const counter = path.join(scratch.make(`${label}-counter`), 'runs.txt');
  const capture = path.join(scratch.make(`${label}-capture`), 'calls.jsonl');
  const project = makeProject(label, {
    marker: true,
    edit: (made) => {
      useSealedBriefAgent(made.folder, { capture, mode, counter, modeFrom, qualification });
      edit(made);
    },
  });
  return { ...project, counter };
}

/**
 * Story 1.34: an attempt eval-quality scores (exit 0 or 2, an artifact) whose state is not the one the arm expects. The
 * stub answers `pass` whatever the call's stdout says from the fourth run on, which is the second attempt on the mutated
 * arm, so eval-quality reduces that attempt to `missed`. The report carries that state as the artifact holds it.
 */
async function checkQualificationUnexpectedState() {
  const project = makeQualifiedProject('qualify-missed', { mode: 'always-pass', modeFrom: 4 });
  const ran = evaluate(['run', '--evaluation', project.folder], project.env);
  check(ran.status === 11, `an agent that passes a defect on one mutated attempt exited ${ran.status}; expected 11\n${ran.output}`);
  const directory = runDirectoryOf(project.folder);
  check(directory !== null, 'the run that failed its qualification kept no run directory');
  if (directory === null) return;
  const report = readJson(path.join(directory, 'evaluator-qualification.json'));
  check(
    qualificationMismatches(directory, report).length === 0,
    `the report departs from its evidence: ${qualificationMismatches(directory, report)}`,
  );
  const mutated = report.arms.find((arm) => arm.conditionArm === 'mutated:M-001');
  const [first, second] = mutated?.probes[0].attempts ?? [];
  check(
    first?.outcome === 'caught' && first.agrees === true,
    `the mutated arm's first attempt is ${JSON.stringify(first)}; expected caught`,
  );
  check(
    second !== undefined && [0, 2].includes(second.exitCode) && second.evidence !== null,
    `the second attempt is ${JSON.stringify(second)}; expected a scored attempt with an artifact`,
  );
  if (second === undefined || second.evidence === null) return;
  const artifact = readJson(path.join(directory, second.evidence));
  const votes = artifact.reducedProbeOutcomes.find((reduced) => reduced.probeId === 'P-002').trialVotes;
  check(
    votes.length === 1 && Buffer.from(second.outcome).equals(Buffer.from(votes[0].state)),
    `the outcome ${JSON.stringify(second.outcome)} is not the artifact's vote ${JSON.stringify(votes.map((vote) => vote.state))} byte for byte`,
  );
  check(
    second.outcome !== 'caught' && second.outcome !== null,
    `the outcome of a passed defect is ${JSON.stringify(second.outcome)}; expected a state other than caught`,
  );
  check(second.agrees === false, 'an attempt whose state is not the expected one agrees');
  check(mutated.agreement === 0.5, `the mutated arm's agreement is ${mutated.agreement}; expected 0.5`);
}

/**
 * P-003, a second probe of mutation M-001 whose signature selects on no standard input, beside P-002, which selects on it.
 * Each probe's witness names the request of its own leg, so neither fires on the other's leg (eval-quality scopes them).
 */
function addSecondMutatedProbe(folder) {
  const witnessing = (probe, request) => {
    const witness = probe.defects[0].manifestationWitness;
    witness.inputs.stdin.value = request;
    witness.relation = {
      op: 'all',
      operands: [
        { op: 'containment', operands: [{ pointer: `/interactions/${witness.legId}/stdout` }, { literal: 'verdict: rejected' }] },
        { op: 'containment', operands: [{ pointer: `/interactions/${witness.legId}/stdout` }, { literal: `request: ${request}` }] },
      ],
    };
  };
  const first = readJson(path.join(folder, 'probes', 'P-002.probe.json'));
  const second = structuredClone(first);
  second.probeId = 'P-003';
  second.defects[0].defectId = 'D-002';
  second.defects[0].manifestationWitness.legId = 'manifest-lenient-3';
  second.defectSignature.condition.selector.inputBinding.stdin = null;
  witnessing(first, 'Judge the request.');
  witnessing(second, 'Judge the second request.');
  writeJson(path.join(folder, 'probes', 'P-002.probe.json'), first);
  writeJson(path.join(folder, 'probes', 'P-003.probe.json'), second);
}

/**
 * Story 1.34: an arm's agreement is the lowest among its probes. P-003 is a second probe of mutation M-001 whose
 * signature selects on no standard input, so the stub that omits stdin on every even run still trips it; P-002 selects on
 * standard input and reads as Invalid on the second attempt. The arm reports P-002's 0.5, not P-003's 1.
 */
async function checkQualificationLowestProbe() {
  const project = makeQualifiedProject('qualify-lowest-probe', {
    mode: 'alternating-stdin',
    edit: ({ folder }) => addSecondMutatedProbe(folder),
  });
  const ran = evaluate(['run', '--evaluation', project.folder], project.env);
  check(ran.status === 11, `an arm with a probe at 0.5 exited ${ran.status}; expected 11\n${ran.output}`);
  const directory = runDirectoryOf(project.folder);
  check(directory !== null, 'the run that failed its qualification kept no run directory');
  if (directory === null) return;
  const report = readJson(path.join(directory, 'evaluator-qualification.json'));
  check(
    qualificationMismatches(directory, report).length === 0,
    `the report departs from its evidence: ${qualificationMismatches(directory, report)}`,
  );
  const mutated = report.arms.find((arm) => arm.conditionArm === 'mutated:M-001');
  const agreements = Object.fromEntries((mutated?.probes ?? []).map((probe) => [probe.probeId, probe.agreement]));
  check(
    JSON.stringify(agreements) === '{"P-002":0.5,"P-003":1}',
    `the mutated arm's probe agreements are ${JSON.stringify(agreements)}; expected P-002 at 0.5 and P-003 at 1`,
  );
  check(mutated?.agreement === 0.5, `the mutated arm's agreement is ${mutated?.agreement}; expected the lower probe's 0.5`);
  check(ran.output.includes('mutated:M-001 (0.5)'), `the stop does not report the lowest agreement:\n${ran.output}`);
}

/** B-002 and its naive oracle O-002, and the gameability probe P-004 whose degenerate response prints a pending verdict. */
function addGameabilityProbe(folder) {
  editJson(path.join(folder, 'contract.json'), (contract) => {
    contract.behaviors.push({
      id: 'B-002',
      description: 'The verdict command answers every request with a verdict line and exits 0.',
      severity: 'low',
      observableSuccessCriterion: 'The run prints a verdict: line on stdout and exits 0.',
      requirementLinks: [{ scheme: 'tea-evaluate-fixture', id: 'answers-with-a-verdict' }],
      riskLinks: [{ scheme: 'tea-evaluate-fixture', id: 'silent-verdict' }],
      oracles: ['O-002'],
    });
    contract.oracles.push({
      id: 'O-002',
      polarity: 'expects-hold',
      commentary: 'The verdict command printed a verdict line, whichever verdict it names, and exited 0.',
      direction: {
        polarity: 'expects-hold',
        relation: 'all',
        scope: 'The exit code and stdout of the judge run.',
        negativeDomain: 'A run that exited non-zero, or whose stdout carries no verdict: line.',
        evidenceTargets: ['/interactions/judge-run/exit-code', '/interactions/judge-run/stdout'],
      },
      check: {
        op: 'all',
        operands: [
          { op: 'equality', operands: [{ pointer: '/interactions/judge-run/exit-code' }, { literal: 0 }] },
          { op: 'containment', operands: [{ pointer: '/interactions/judge-run/stdout' }, { literal: 'verdict:' }] },
        ],
      },
    });
  });
  const signature = readJson(path.join(folder, 'probes', 'P-002.probe.json')).defectSignature;
  signature.condition.predicate = {
    op: 'containment',
    operands: [{ pointer: '/interactions/observed/stdout' }, { literal: 'verdict: pending' }],
  };
  writeJson(path.join(folder, 'probes', 'P-004.probe.json'), {
    probeId: 'P-004',
    probeClass: 'gameability',
    behaviorId: 'B-001',
    expectedClean: false,
    rationale: 'Gameability: a shortcut answer prints a verdict line without judging the request.',
    defects: [],
    defectSignature: signature,
    qualification: {
      route: 'gameability',
      degenerateResponse: 'Prints a verdict line that names no real verdict (verdict: pending) and exits 0, without judging the request.',
      naiveOracle: 'O-002',
    },
  });
  writeJson(path.join(folder, 'corpus', 'gameability', 'P-004.json'), {
    schemaVersion: 1,
    steps: { 'judge-run': { stdout: 'request: Judge the request.\nverdict: pending\n', stderr: '', exitCode: 0 } },
  });
  editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
    evaluation.arms = ['clean', 'mutated', 'gameability'];
  });
}

/**
 * Story 1.34: historical and gameability arms are not qualified. The evaluation holds a gameability arm beside the clean
 * and the mutated one, and the agent runs on the two arms it qualifies only.
 */
async function checkQualificationSkipsOtherArms() {
  const project = makeQualifiedProject('qualify-other-arms', {
    mode: 'normal',
    edit: ({ folder }) => addGameabilityProbe(folder),
  });
  const ran = evaluate(['run', '--evaluation', project.folder], project.env);
  check(ran.status === 0, `a run over a gameability arm beside the qualified arms exited ${ran.status}; expected 0\n${ran.output}`);
  const directory = runDirectoryOf(project.folder);
  check(directory !== null, 'the run kept no run directory');
  if (directory === null) return;
  const report = readJson(path.join(directory, 'evaluator-qualification.json'));
  const armNames = report.arms.map((arm) => arm.conditionArm);
  check(
    JSON.stringify(armNames) === '["clean","mutated:M-001"]',
    `the report qualifies ${JSON.stringify(armNames)}; expected the clean and the mutated arm only`,
  );
  const kept = fs.readdirSync(path.join(directory, 'evaluator-qualification')).sort();
  check(
    JSON.stringify(kept) === '["clean","mutated-M-001"]',
    `evaluator-qualification/ holds ${JSON.stringify(kept)}; expected no attempt on the gameability arm`,
  );
  const trialSets = readJson(path.join(directory, 'trial-sets.json')).trialSets.map((set) => set.conditionArm);
  check(trialSets.includes('gameability:P-004'), `the run sealed ${JSON.stringify(trialSets)}; expected a gameability trial set`);
}

/**
 * Story 1.34: a target that writes into the adopter's project during a qualification attempt stops the run with exit 12,
 * and the stop names the qualification attempts where it writes no trial set.
 */
async function checkQualificationHoldsAdopterTree() {
  const project = makeQualifiedProject('qualify-project-write', { mode: 'normal' });
  const ran = evaluate(['run', '--evaluation', project.folder], {
    ...project.env,
    VERDICT_WHEN: 'attempt-clean-1',
    VERDICT_DO: 'touch',
    VERDICT_TOUCH: path.join(project.repository, 'attempt-touch.txt'),
  });
  check(
    ran.status === 12 && ran.output.includes('changed during the qualification attempts, so no trial set is written'),
    `a target writing into the project during a qualification attempt: run exited ${ran.status}; expected 12 naming the qualification attempts\n${ran.output}`,
  );
  check(
    !ran.output.includes('changed during the trials'),
    'a project change during a qualification attempt is reported as a change during the trials',
  );
  const directory = runDirectoryOf(project.folder);
  check(
    directory !== null && !fs.existsSync(path.join(directory, 'trial-sets.json')),
    'a run stopped in its qualification wrote trial sets',
  );
  check(directory !== null && recordFiles(directory).length === 0, 'a run stopped in its qualification wrote a trial record');
}

// ---------------------------------------------------------------------------------------------------------------------
// Story 1.69: the inputs of an evaluator attempt's score call are held

/** The attempt `evaluator-qualification/` keeps for a probe on an arm, run-relative. */
function attemptDirectory(arm, attempt, probeId) {
  return `evaluator-qualification/${arm}/attempt-${attempt}/${probeId}`;
}

/**
 * `run` over `project` with the race engine in the engine's place, so each attempt's `eval-quality score` call is logged
 * (one line per call, in order) and the attack `env` names happens around it.
 */
function raceRun(label, project, env = {}) {
  const directory = scratch.make(`${label}-race`);
  const log = path.join(directory, 'calls.jsonl');
  // The stub numbers its runs from the counter, and which attempts omit stdin follows the number: every run starts from one.
  fs.rmSync(project.counter, { force: true });
  const ran = evaluate(['run', '--evaluation', project.folder], {
    ...project.env,
    [ENGINE_CLI_ENV]: RACE_ENGINE,
    TEA_RACE_LOG: log,
    TEA_RACE_TARGET: directory,
    TEA_RACE_SENTINEL: path.join(directory, 'sentinel.txt'),
    ...env,
  });
  return { ran, calls: captures(log), runDirectory: runDirectoryOf(project.folder), directory };
}

/**
 * A call the run refused: exit 12 naming `says`, the engine called `calls` times (the refused call was the last), no
 * evidence artifact for the refused attempt, no `evaluator-qualification.json`, no trial set and no run that says it completed.
 */
function checkAttemptRefused(what, raced, { says, calls, attempt }) {
  const { ran, runDirectory } = raced;
  check(ran.status === 12, `${what}: run exited ${ran.status}; expected 12\n${ran.output}`);
  check(
    says.test(ran.output) && ran.output.includes('no vote is recorded for the call'),
    `${what}: the stop does not read ${says} and say no vote is recorded:\n${ran.output}`,
  );
  check(raced.calls.length === calls, `${what}: the engine was called ${raced.calls.length} time(s); expected ${calls}`);
  check(runDirectory !== null, `${what}: the run kept no run directory`);
  if (runDirectory === null) return;
  check(
    !fs.existsSync(path.join(runDirectory, attempt, 'evidence-artifact.json')),
    `${what}: evidence was copied for the refused attempt (${attempt})`,
  );
  check(fs.existsSync(path.join(runDirectory, attempt, 'score.json')), `${what}: the refused call left no call record in ${attempt}`);
  check(!fs.existsSync(path.join(runDirectory, 'evaluator-qualification.json')), `${what}: the run wrote a qualification report`);
  check(!fs.existsSync(path.join(runDirectory, 'trial-sets.json')), `${what}: the run wrote trial sets`);
  check(readJson(path.join(runDirectory, 'run.json')).completed !== true, `${what}: the stopped run says it completed`);
}

/** The attacks over the clean and mutated arms' fourth call: the mutated arm's second attempt of P-002, a later attempt of a later arm. */
const HELD_ATTEMPT_LATER = { arm: 'mutated-M-001', attempt: 2, probeId: 'P-002', nth: 4 };

/** The run-relative file each input kind of the later attempt's call is. */
function heldAttemptFiles({ arm, attempt, probeId }) {
  const directory = attemptDirectory(arm, attempt, probeId);
  return {
    contract: 'eval-contract.json',
    preflight: 'preflight-verdict.json',
    configuration: 'evaluator-configuration.json',
    policy: 'scoring-policy.json',
    probe: `probes/${probeId}.probe.json`,
    record: `${directory}/record-1.json`,
    manifest: `${directory}/isolation-manifest.json`,
  };
}

/** Each attempt's recorded `score` argv run again by hand with a fresh `--out` writes the evidence the run kept, byte for byte. */
function checkAttemptsReproduce(what, runDirectory) {
  let reproduced = 0;
  for (const arm of ['clean', 'mutated-M-001']) {
    for (const attempt of [1, 2]) {
      const probeId = arm === 'clean' ? 'P-001' : 'P-002';
      const directory = path.join(runDirectory, attemptDirectory(arm, attempt, probeId));
      const call = readJson(path.join(directory, 'score.json'));
      const kept = path.join(directory, 'evidence-artifact.json');
      if (!fs.existsSync(kept)) continue;
      const out = path.join(scratch.make(`${what}-reproduce`), 'evidence-artifact.json');
      const argv = [...call.argv];
      argv[argv.indexOf('--out') + 1] = out;
      const direct = spawnSync(process.execPath, [engineCliPath(BASE_ENV), ...argv], {
        encoding: 'utf8',
        timeout: SPAWN_TIMEOUT_MS,
        killSignal: 'SIGKILL',
      });
      check(
        direct.status === call.exitCode,
        `${what}: ${arm}/attempt ${attempt} run by hand exited ${direct.status}; recorded ${call.exitCode}`,
      );
      check(
        fs.existsSync(out) && fs.readFileSync(out).equals(fs.readFileSync(kept)),
        `${what}: ${arm}/attempt ${attempt} run by hand did not write the evidence the run kept`,
      );
      check(
        call.argv
          .filter((argument, at) =>
            [
              '--record',
              '--contract',
              '--probe',
              '--preflight-verdict',
              '--policy',
              '--isolation-manifest',
              '--evaluator-configuration',
            ].includes(call.argv[at - 1]),
          )
          .every((file) => file.startsWith(runDirectory)),
        `${what}: ${arm}/attempt ${attempt}'s recorded argv names a file outside the run directory`,
      );
      reproduced += 1;
    }
  }
  check(reproduced === 4, `${what}: ${reproduced} attempt(s) were reproduced by hand; expected 4`);
}

/**
 * Story 1.69: an evaluator attempt's score call is held to its inputs.
 * A qualification of a sealed-brief agent runs over a run that opted out of confinement.
 * The race engine stands in for eval-quality's CLI over the real one.
 * A clean run scores as before, and its recorded argv reproduces each attempt's evidence byte for byte.
 * Every attack on the later attempt's call (the fourth) exits 12 with the engine called four times and no vote recorded for it.
 */
async function checkHeldAttempts() {
  const project = makeQualifiedProject('held-attempts', { mode: 'normal' });
  const keep = scratch.make('held-attempts-keep');
  const clean = raceRun('held-attempts-clean', project, { TEA_RACE_KEEP: keep });
  check(
    clean.ran.status === 0,
    `an unchanged qualification under the race engine exited ${clean.ran.status}; expected 0\n${clean.ran.output}`,
  );
  check(
    clean.calls.length === 4,
    `an unchanged qualification called the engine ${clean.calls.length} time(s); expected 4 (two attempts on two arms)`,
  );
  if (clean.runDirectory !== null) {
    checkQualificationReport('the unchanged qualification', clean.runDirectory, QUALIFICATION);
    checkAttemptsReproduce('the unchanged qualification', clean.runDirectory);
  }

  const later = HELD_ATTEMPT_LATER;
  const files = heldAttemptFiles(later);
  const attempt = attemptDirectory(later.arm, later.attempt, later.probeId);
  const attack = (what, mode, extra = {}) =>
    raceRun(`held-attempts-${what}`, project, { TEA_RACE_MODE: mode, TEA_RACE_NTH: String(later.nth), TEA_RACE_KEEP: keep, ...extra });
  // Only the comparison produces these texts; the check after the call says "can no longer be read" instead.
  const comparison = /is not the one the held inputs stand behind: the (?:staged evidence artifact|call )/;
  for (const kind of Object.keys(files)) {
    // The file is rewritten before the engine's read and kept: the check after the call names it, whatever the engine made of it.
    const kept = attack(`rewrite-${kind}`, `rewrite-${kind}`);
    checkAttemptRefused(`the ${kind} rewritten and kept`, kept, {
      says: new RegExp(`${files[kind].replaceAll('.', String.raw`\.`)} can no longer be read as the file the runtime wrote`),
      calls: later.nth,
      attempt,
    });
    // The file is rewritten for the engine's read and put back before the check, so only the comparison with the held bytes refuses it.
    const restored = attack(`restore-${kind}`, `restore-${kind}`);
    checkAttemptRefused(`the ${kind} rewritten for the call and restored`, restored, { says: comparison, calls: later.nth, attempt });
  }

  // The staged artifact is another well-formed artifact, in other bytes, or one the held bytes do not give.
  checkAttemptRefused('an artifact with altered votes', attack('forge-votes', 'forge-votes'), {
    says: /differs from the one the verified inputs produce/,
    calls: later.nth,
    attempt,
  });
  checkAttemptRefused('the same artifact reformatted', attack('reformat-artifact', 'reformat-artifact'), {
    says: /differs from the one the verified inputs produce/,
    calls: later.nth,
    attempt,
  });
  checkAttemptRefused('the same artifact with a repeated last key', attack('duplicate-key-artifact', 'duplicate-key-artifact'), {
    says: /differs from the one the verified inputs produce/,
    calls: later.nth,
    attempt,
  });
  checkAttemptRefused("an earlier attempt's artifact staged", attack('stage-stashed', 'stage-stashed', { TEA_RACE_STASH_DIR: keep }), {
    says: /differs from the one the verified inputs produce/,
    calls: later.nth,
    attempt,
  });
  checkAttemptRefused('the same artifact without its final newline', attack('drop-final-newline', 'drop-final-newline'), {
    says: /differs from the one the verified inputs produce/,
    calls: later.nth,
    attempt,
  });
  checkAttemptRefused('the same artifact with its final newline blanked', attack('blank-final-newline', 'blank-final-newline'), {
    says: /differs from the one the verified inputs produce/,
    calls: later.nth,
    attempt,
  });
  checkAttemptRefused('a link staged in place of the artifact', attack('stage-link', 'stage-link'), {
    says: /is a link or a non-file entry/,
    calls: later.nth,
    attempt,
  });
  checkAttemptRefused('the staged artifact removed', attack('unstage', 'restore-and-unstage'), {
    says: /the call staged no evidence artifact, and the verified inputs produce one/,
    calls: later.nth,
    attempt,
  });
  // The artifact is the one the held bytes give; the call's own exit (3, over a rewritten preflight verdict) is not.
  checkAttemptRefused('an exit the held bytes do not give', attack('rescore', 'restore-and-rescore', { TEA_RACE_KIND: 'preflight' }), {
    says: /the call exited 3 where the verified inputs give 0/,
    calls: later.nth,
    attempt,
  });
}

/**
 * Story 1.69: the same comparison on a later probe of an arm, a later attempt and an Invalid attempt.
 * The mutated arm holds P-002 and P-003.
 * The stub's second attempt omits stdin, which leaves P-002 Invalid.
 * The calls run clean P-001 twice, then the mutated arm's P-002 and P-003 in each attempt.
 * Each of the seven inputs is rewritten and kept on the fourth call, the first attempt's P-003.
 */
async function checkHeldAttemptsLaterProbes() {
  const project = makeQualifiedProject('held-attempts-probes', {
    mode: 'alternating-stdin',
    edit: ({ folder }) => addSecondMutatedProbe(folder),
  });
  const keep = scratch.make('held-attempts-probes-keep');
  const attack = (what, mode, nth, extra = {}) =>
    raceRun(`held-attempts-probes-${what}`, project, { TEA_RACE_MODE: mode, TEA_RACE_NTH: String(nth), TEA_RACE_KEEP: keep, ...extra });
  const probe3 = heldAttemptFiles({ arm: 'mutated-M-001', attempt: 1, probeId: 'P-003' });
  const probe3Attempt = attemptDirectory('mutated-M-001', 1, 'P-003');
  for (const kind of Object.keys(probe3)) {
    checkAttemptRefused(`the ${kind} of the later probe rewritten and kept`, attack(`rewrite-${kind}`, `rewrite-${kind}`, 4), {
      says: new RegExp(`${probe3[kind].replaceAll('.', String.raw`\.`)} can no longer be read as the file the runtime wrote`),
      calls: 4,
      attempt: probe3Attempt,
    });
  }
  checkAttemptRefused('altered votes on the later probe of the later attempt', attack('votes', 'forge-votes', 6), {
    says: /differs from the one the verified inputs produce/,
    calls: 6,
    attempt: attemptDirectory('mutated-M-001', 2, 'P-003'),
  });
  // An attempt the held bytes read as Invalid has exit 3, no artifact and its invalid lines.
  // A rewrite for the engine's read that gives another Invalid reason and is put back changes only the lines.
  // The unattacked run finds which call that is.
  const unattacked = raceRun('held-attempts-probes-clean', project, { TEA_RACE_KEEP: keep });
  check(
    unattacked.ran.status === 11,
    `the unattacked run exited ${unattacked.ran.status}; expected 11 (P-002 agrees at 0.5)\n${unattacked.ran.output}`,
  );
  const report = unattacked.runDirectory === null ? null : readJson(path.join(unattacked.runDirectory, 'evaluator-qualification.json'));
  // The calls run arm by arm, attempt by attempt, and probe by probe within an attempt.
  const order = (report?.arms ?? []).flatMap((arm) =>
    Array.from({ length: report.attempts }, (_, index) => index + 1).flatMap((number) =>
      arm.probes.map((probe) => ({
        ...probe.attempts.find((attempt) => attempt.attempt === number),
        arm: arm.conditionArm.replace(':', '-'),
        probeId: probe.probeId,
      })),
    ),
  );
  const invalid = order.findIndex((attempt) => attempt.exitCode === 3);
  check(
    invalid !== -1 && order.filter((attempt) => attempt.exitCode === 3).length === 1,
    `the unattacked run has ${order.filter((attempt) => attempt.exitCode === 3).length} Invalid attempt(s); expected 1`,
  );
  if (invalid === -1) return;
  const at = order[invalid];
  checkAttemptRefused(
    'another Invalid reason for an Invalid attempt',
    attack('reason', 'restore-and-unstage', invalid + 1, { TEA_RACE_KIND: 'configuration' }),
    {
      says: /diagnostics differ from those the verified inputs give/,
      calls: invalid + 1,
      attempt: attemptDirectory(at.arm, at.attempt, at.probeId),
    },
  );
  // The call keeps its exit, its artifact and the number of its lines, and the text of its last line is edited.
  checkAttemptRefused('an Invalid reason line edited', attack('edit-diagnostic', 'edit-diagnostic', invalid + 1), {
    says: /diagnostics differ from those the verified inputs give/,
    calls: invalid + 1,
    attempt: attemptDirectory(at.arm, at.attempt, at.probeId),
  });
  // An earlier attempt's artifact staged over the Invalid call, where the held bytes give no artifact at all.
  checkAttemptRefused(
    'an artifact staged over an Invalid attempt',
    attack('invalid-stash', 'stage-stashed', invalid + 1, { TEA_RACE_STASH_DIR: keep }),
    {
      says: /not the result of the verified inputs, which produce no artifact/,
      calls: invalid + 1,
      attempt: attemptDirectory(at.arm, at.attempt, at.probeId),
    },
  );
}

/**
 * A call that exits a code the CLI does not document, or is killed, stops the run as before: exit 12, no vote.
 * Both paths end in the one `EngineStageError` catch of `scoreAttempt`.
 */
async function checkHeldAttemptsUndocumentedExit() {
  const project = makeQualifiedProject('held-attempts-exit', { mode: 'normal' });
  for (const [what, mode, says] of [
    ['exited 7', 'exit-7', /an evaluator attempt could not be scored: .*exited 7, which is no exit the CLI documents/],
    ['was killed', 'sigkill', /an evaluator attempt could not be scored: .*was killed by SIGKILL and reported no exit code/],
  ]) {
    const raced = raceRun(`held-attempts-${mode}`, project, { TEA_RACE_MODE: mode, TEA_RACE_NTH: '4' });
    const { ran, runDirectory } = raced;
    check(ran.status === 12, `an attempt whose score call ${what} stopped the run with ${ran.status}; expected 12\n${ran.output}`);
    check(says.test(ran.output), `the stop for a call that ${what} does not say the call could not be scored:\n${ran.output}`);
    check(
      raced.calls.length === 4,
      `the run called the engine ${raced.calls.length} time(s); expected 4, the last of them one that ${what}`,
    );
    check(
      runDirectory !== null &&
        !fs.existsSync(path.join(runDirectory, 'evaluator-qualification.json')) &&
        !fs.existsSync(path.join(runDirectory, attemptDirectory('mutated-M-001', 2, 'P-002'), 'evidence-artifact.json')),
      `a call that ${what} left a qualification report or evidence for its attempt`,
    );
  }
}

/**
 * The attempt's inputs are held through the run directory writer.
 * A file that is not the bytes the runtime wrote at the hold is refused by name before any call.
 * The check after a call reads each input through the same writer and names the first one that changed, whichever position it holds in the list.
 * The hold itself is driven here over a real run directory writer.
 * No call can land a rewrite there deterministically.
 * `writer.verify` runs once per attempt before its probe loop, so for a later probe of an arm the window holds the earlier probe's score call.
 * The check after that call names a rewrite it made, and `writeQualifiedProbe` reads the probe's own file back.
 * Only a delayed process that outlives the call could reach the hold itself.
 */
async function checkHeldAttemptInputsUnit() {
  const { RunDirectory } = require('../cli/lib/evaluate/run-directory');
  const { attemptProbeFile, holdAttemptInputs } = require('../cli/lib/evaluate/score-inputs');
  const engine = await loadEngine();
  const root = scratch.make('held-attempt-unit');
  const runs = path.join(root, 'runs');
  fs.mkdirSync(runs);
  const probeId = 'P-002';
  const names = {
    contract: 'eval-contract.json',
    preflight: 'preflight-verdict.json',
    configuration: 'evaluator-configuration.json',
    policy: 'scoring-policy.json',
    probe: attemptProbeFile(probeId),
    record: 'evaluator-qualification/mutated-M-001/attempt-1/P-002/record-1.json',
    manifest: 'evaluator-qualification/mutated-M-001/attempt-1/P-002/isolation-manifest.json',
  };
  check(names.probe === 'probes/P-002.probe.json', `the attempt's probe file is ${names.probe}`);
  const corpusDigest = `sha256:${'a'.repeat(64)}`;
  const hold = (writer) =>
    holdAttemptInputs({
      read: (relative) => writer.read(relative),
      engine,
      corpusDigest,
      probeId,
      set: { records: [names.record], manifestFile: names.manifest },
    });
  const make = (label) => {
    const writer = RunDirectory.create(runs, label);
    for (const [kind, relative] of Object.entries(names)) writer.write(relative, `{"kind":"${kind}"}\n`);
    return writer;
  };

  const writer = make('unit-clean');
  try {
    const held = hold(writer);
    check(
      JSON.stringify([...held.entries.keys()]) ===
        JSON.stringify([names.contract, names.preflight, names.configuration, names.policy, names.probe, names.record, names.manifest]),
      `the attempt's inputs are ${JSON.stringify([...held.entries.keys()])}`,
    );
    check(held.changedSince() === null, 'a run directory nobody wrote reads as changed');
    const [set] = held.index.trialSets;
    const args = held.scoreArguments({ pathOf: (relative) => writer.pathOf(relative), set, out: '/scratch/out.json' });
    check(
      JSON.stringify(args) ===
        JSON.stringify([
          '--record',
          writer.pathOf(names.record),
          '--contract',
          writer.pathOf(names.contract),
          '--probe',
          writer.pathOf(names.probe),
          '--preflight-verdict',
          writer.pathOf(names.preflight),
          '--policy',
          writer.pathOf(names.policy),
          '--corpus-digest',
          corpusDigest,
          '--isolation-manifest',
          writer.pathOf(names.manifest),
          '--evaluator-configuration',
          writer.pathOf(names.configuration),
          '--out',
          '/scratch/out.json',
        ]),
      `the attempt's call arguments are ${JSON.stringify(args)}`,
    );
  } finally {
    writer.close();
  }

  // Every record of the attempt's set is held and handed to the call, in order.
  const second = 'evaluator-qualification/mutated-M-001/attempt-1/P-002/record-2.json';
  const several = make('unit-several');
  try {
    several.write(second, '{"kind":"second record"}\n');
    const held = holdAttemptInputs({
      read: (relative) => several.read(relative),
      engine,
      corpusDigest,
      probeId,
      set: { records: [names.record, second], manifestFile: names.manifest },
    });
    const [set] = held.index.trialSets;
    const args = held.scoreArguments({ pathOf: (relative) => several.pathOf(relative), set, out: '/scratch/out.json' });
    check(
      JSON.stringify(args.filter((argument, at) => args[at - 1] === '--record')) ===
        JSON.stringify([several.pathOf(names.record), several.pathOf(second)]) && held.entries.has(second),
      `an attempt of two records hands the call ${JSON.stringify(args)}`,
    );
  } finally {
    several.close();
  }

  // `scoreAttempt` turns a hold the writer refuses into exit 12 before any engine call.
  const holdStops = async (writer, { probe, directory, set }, file) => {
    const calls = path.join(scratch.make('held-attempt-unit-calls'), 'shim.jsonl');
    let stopped = null;
    try {
      await scoreAttempt(
        {
          writer,
          runDirectory: writer.root,
          env: { ...BASE_ENV, [ENGINE_CLI_ENV]: ENGINE_SHIM, TEA_EVALUATE_SHIM_LOG: calls },
          log: () => {},
          scratch,
          engine,
          stop: (outcome) => Object.assign(new Error(outcome.message), outcome),
        },
        { probe, directory, set, corpusDigest },
      );
    } catch (error) {
      stopped = error;
    }
    check(
      stopped?.exitCode === 12 &&
        stopped.stage === 'trial' &&
        stopped.message.startsWith(`${probe.probeId}: ${file} is not what the runtime wrote`) &&
        stopped.message.includes('no engine call was made and no vote is recorded for the attempt'),
      `a hold the writer refuses stopped scoreAttempt with ${stopped === null ? 'nothing' : JSON.stringify({ ...stopped, message: stopped.message })}`,
    );
    check(!fs.existsSync(calls), 'scoreAttempt called the engine after the hold was refused');
  };
  const refused = make('unit-stop');
  try {
    fs.writeFileSync(refused.pathOf(names.configuration), '{"rewritten":true}\n');
    await holdStops(
      refused,
      {
        probe: { probeId },
        directory: 'evaluator-qualification/mutated-M-001/attempt-1/P-002',
        set: { records: [names.record], manifestFile: names.manifest },
      },
      names.configuration,
    );
  } finally {
    refused.close();
  }

  // A later probe of the arm: the earlier probe's files stand, and a file of the later one was rewritten after the earlier probe's call.
  const later = make('unit-later-probe');
  try {
    const directory = 'evaluator-qualification/mutated-M-001/attempt-1/P-003';
    const laterSet = { records: [`${directory}/record-1.json`], manifestFile: `${directory}/isolation-manifest.json` };
    later.write(attemptProbeFile('P-003'), '{"kind":"probe 3"}\n');
    later.write(laterSet.records[0], '{"kind":"record 3"}\n');
    later.write(laterSet.manifestFile, '{"kind":"manifest 3"}\n');
    fs.writeFileSync(later.pathOf(attemptProbeFile('P-003')), '{"rewritten":true}\n');
    await holdStops(later, { probe: { probeId: 'P-003' }, directory, set: laterSet }, attemptProbeFile('P-003'));
  } finally {
    later.close();
  }

  for (const [kind, relative] of Object.entries(names)) {
    // After the hold: the check names this file, and only this one.
    const after = make(`unit-after-${kind}`);
    try {
      const held = hold(after);
      fs.writeFileSync(after.pathOf(relative), '{"rewritten":true}\n');
      const changed = held.changedSince();
      check(
        changed?.relative === relative && /can no longer be read as the file the runtime wrote/.test(changed.message),
        `the ${kind} rewritten after the hold is reported as ${JSON.stringify(changed)}`,
      );
    } finally {
      after.close();
    }
    // Before the hold: the hold itself refuses it, naming the file, so no call is made.
    for (const [how, change] of [
      ['rewritten', (file) => fs.writeFileSync(file, '{"rewritten":true}\n')],
      [
        'swapped for a link',
        (file) => {
          fs.rmSync(file);
          fs.symlinkSync(path.join(root, 'elsewhere.json'), file);
        },
      ],
      ['removed', (file) => fs.rmSync(file)],
    ]) {
      const before = make(`unit-before-${kind}-${how.replaceAll(' ', '-')}`);
      try {
        change(before.pathOf(relative));
        let thrown = null;
        try {
          hold(before);
        } catch (error) {
          thrown = error;
        }
        check(
          thrown !== null && thrown.message.startsWith(`${relative} is not what the runtime wrote`),
          `the ${kind} ${how} before the hold: the hold ${thrown === null ? 'went through' : `threw ${JSON.stringify(thrown.message)}`}`,
        );
      } finally {
        before.close();
      }
    }
  }
}

/** The text of `scoreAttempt` in `cli/lib/evaluate/run.js`, with comments removed. */
function scoreAttemptSource(source) {
  const start = source.indexOf('\nasync function scoreAttempt(');
  const end = source.indexOf('\n}\n', start);
  if (start === -1 || end === -1) return null;
  return source
    .slice(start, end + 2)
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .replaceAll(/^\s*\/\/.*$/gm, '');
}

/** The one read of an input `scoreAttempt` may write itself: the hold's own reader, the run directory writer's `read`. */
const HOLD_READER = 'read: (relative) => writer.read(relative)';

/**
 * What `scoreAttempt` may not say, each rule a reason and the alternatives (regular expression sources) that find it.
 * Every alternative has a plant in `STATIC_READ_PLANTS`, and the case fails for one that has none.
 */
const STATIC_READ_RULES = [
  {
    reason: 'names a run input file',
    alternatives: ['eval-contract', 'preflight-verdict', 'evaluator-configuration', 'scoring-policy', 'POLICY_FILE', 'RUN_FILES'],
  },
  { reason: 'names the probe file', alternatives: [String.raw`\.probe\.json`, 'probes/'] },
  { reason: 'names a record or manifest file', alternatives: ['isolation-manifest', String.raw`record-\d`] },
  { reason: "names the attempt's records or manifest", alternatives: [String.raw`set\.records`, String.raw`set\.manifestFile`] },
  { reason: 'spells a flag of the call', alternatives: ['[\'"`]--[a-z-]+[\'"`]'] },
  { reason: 'hands the engine a path it chose', alternatives: [String.raw`writer\.pathOf\((?!relative\))`] },
  { reason: 'reads a file itself', alternatives: [String.raw`\bfs\b`, 'readFileSync', 'existsSync', 'openSync', 'regularFileBytes'] },
  { reason: 'reads an input through the writer itself', alternatives: [String.raw`writer\.read\(`, String.raw`writer\.readJson\(`] },
  { reason: 'reads the staged artifact again', alternatives: [String.raw`copyIn\(`] },
];

/** The text `scoreAttempt` may hold of the staging path: its declaration, the call's `--out` and the one read of the staged file. */
const STAGING_USES = ["const produced = path.join(staging, 'evidence-artifact.json');", 'out: produced', 'stagedArtifact(produced)'];

/**
 * Why `scoreAttempt`, as written in `source`, reads or names a score input without `score-inputs.js` (empty when it does not).
 * It must build its inputs and its call's arguments through the module.
 * It may name no input file, probe path, call flag or file system call of its own, read an input through the writer except in the hold's reader, or touch the staging path beyond one read of the staged file.
 */
function scoreAttemptProblems(source) {
  const body = scoreAttemptSource(source);
  if (body === null) return ['scoreAttempt is not found in run.js'];
  const problems = [];
  // The hold's reader is the one `writer.read(` allowed, and it is removed before the rules look.
  const withoutReader = body.replace(HOLD_READER, '');
  if (withoutReader === body) problems.push(`does not hold its inputs through ${HOLD_READER}`);
  for (const { reason, alternatives } of STATIC_READ_RULES) {
    const pattern = new RegExp(alternatives.join('|'));
    if (pattern.test(withoutReader)) problems.push(`${reason} (${pattern})`);
  }
  const withoutStaging = STAGING_USES.reduce((text, use) => text.replace(use, ''), withoutReader);
  if (/\bproduced\b/.test(withoutStaging))
    problems.push('reads the staged artifact again, or uses the staging path beyond its one read (produced)');
  const staged = withoutReader.match(/\bstagedArtifact\(/g) ?? [];
  if (staged.length !== 1) problems.push(`reads the staged artifact ${staged.length} times; expected once (stagedArtifact()`);
  for (const required of ['holdAttemptInputs(', 'held.scoreArguments(', 'heldRefusal(', 'writer.write(evidence, staged.bytes)']) {
    if (!body.includes(required)) problems.push(`does not call ${required}`);
  }
  return problems;
}

/** Each way of reading an input or the staged artifact without the module, one plant per alternative of `STATIC_READ_RULES`. */
const STATIC_READ_PLANTS = [
  ['eval-contract', "const contractFile = 'eval-contract.json';"],
  ['preflight-verdict', "const verdictFile = 'preflight-verdict.json';"],
  ['evaluator-configuration', "const configurationFile = 'evaluator-configuration.json';"],
  ['scoring-policy', "const policyFile = 'scoring-policy.json';"],
  ['POLICY_FILE', 'const policy = POLICY_FILE;'],
  ['RUN_FILES', 'const files = RUN_FILES;'],
  [String.raw`\.probe\.json`, "const probeFile = 'P-002.probe.json';"],
  ['probes/', 'const probeFile = `probes/${probe.probeId}`;'],
  ['isolation-manifest', "const manifestFile = 'x/isolation-manifest.json';"],
  [String.raw`record-\d`, "const recordFile = 'x/record-1.json';"],
  [String.raw`set\.records`, 'const [record] = set.records;'],
  [String.raw`set\.manifestFile`, 'const manifest = set.manifestFile;'],
  ['[\'"`]--[a-z-]+[\'"`]', "args.push('--record', 'x');"],
  [String.raw`writer\.pathOf\((?!relative\))`, "const file = writer.pathOf('anything');"],
  [String.raw`\bfs\b`, 'const stats = fs.statSync(file);'],
  ['readFileSync', 'const bytes = readFileSync(file);'],
  ['existsSync', 'const present = existsSync(file);'],
  ['openSync', 'const descriptor = openSync(file, 0);'],
  ['regularFileBytes', 'const bytes = regularFileBytes(file);'],
  [String.raw`writer\.read\(`, 'const bytes = writer.read(held.index.contract);'],
  [String.raw`writer\.readJson\(`, 'const contract = writer.readJson(held.index.contract);'],
  [String.raw`copyIn\(`, 'const again = writer.copyIn(`${directory}/again.json`, staging);'],
];

/** Plants that the rules with no alternatives of their own find: a second read of the staged file and another use of the staging path. */
const STAGING_PLANTS = [
  ['a second read of the staged artifact', 'const again = stagedArtifact(produced);', 'reads the staged artifact 2 times'],
  ['the staging path read another way', 'const bytes = readStaged(produced);', 'reads the staged artifact again, or uses the staging path'],
  ['a second hold reader', 'const again = (relative) => writer.read(relative);', 'reads an input through the writer itself'],
];

/** Story 1.69: a static read of `scoreAttempt`, with each way of reading an input without the module planted. */
function checkScoreAttemptRoutesThroughTheModule() {
  const source = fs.readFileSync(path.join(PROJECT_ROOT, 'cli', 'lib', 'evaluate', 'run.js'), 'utf8');
  for (const problem of scoreAttemptProblems(source)) check(false, `scoreAttempt ${problem}`);
  const plant = (line) =>
    source.replace('\nasync function scoreAttempt(context, { probe, directory, set, corpusDigest }) {', (head) => `${head}\n  ${line}`);
  // Every alternative of every rule has a plant, and the plant is refused for that rule's reason.
  for (const { reason, alternatives } of STATIC_READ_RULES) {
    for (const alternative of alternatives) {
      const planted = STATIC_READ_PLANTS.find(([planted]) => planted === alternative);
      check(planted !== undefined, `the static read of scoreAttempt has no plant for ${alternative} (${reason})`);
      if (planted === undefined) continue;
      const text = plant(planted[1]);
      check(text !== source, `the plant for ${alternative} did not land in scoreAttempt`);
      check(
        scoreAttemptProblems(text).some((problem) => problem.startsWith(reason)),
        `the static read of scoreAttempt did not refuse ${alternative} (${reason})`,
      );
    }
  }
  for (const [name, line, says] of STAGING_PLANTS) {
    check(
      scoreAttemptProblems(plant(line)).some((problem) => problem.startsWith(says)),
      `the static read of scoreAttempt did not refuse ${name}`,
    );
  }
  for (const [name, text, says] of [
    ['a call built without the module', source.replace('held.scoreArguments(', 'argumentsOf('), 'does not call held.scoreArguments('],
    [
      'a staged artifact copied by a second read',
      source.replace('writer.write(evidence, staged.bytes)', 'writer.copyIn(evidence, produced)'),
      'does not call writer.write(evidence, staged.bytes)',
    ],
    ['inputs held without the module', source.replace('holdAttemptInputs(', 'holdInputs('), 'does not call holdAttemptInputs('],
    ['no comparison', source.replace('heldRefusal(', 'noRefusal('), 'does not call heldRefusal('],
    [
      'inputs held through another reader',
      source.replace(HOLD_READER, 'read: (relative) => other(relative)'),
      'does not hold its inputs through',
    ],
    ['no read of the staged artifact', source.replace('stagedArtifact(produced)', 'undefined'), 'reads the staged artifact 0 times'],
  ]) {
    check(text !== source, `the plant for ${name} did not land in scoreAttempt`);
    check(
      scoreAttemptProblems(text).some((problem) => problem.includes(says)),
      `the static read of scoreAttempt did not refuse ${name}`,
    );
  }
}

async function checkSealedBriefAgentEdges() {
  // An executable the registry does not grant is denied by eval-quality's adapter and never launches.
  const capture = path.join(scratch.make('sealed-unlisted-capture'), 'captures.jsonl');
  const unlisted = makeProject('sealed-unlisted', {
    marker: true,
    edit: ({ folder }) => useSealedBriefAgent(folder, { capture, mode: 'unlisted' }),
  });
  const ran = evaluate(['run', '--evaluation', unlisted.folder], unlisted.env);
  check(ran.status === 0, `a sealed-brief run with a denied call exited ${ran.status}; expected 0\n${ran.output}`);
  const runDirectory = runDirectoryOf(unlisted.folder);
  if (runDirectory !== null) {
    const evidence = readJson(path.join(runDirectory, 'evaluator', 'clean', 'trial-1.json'));
    const [denied] = evidence.calls ?? [];
    check(
      denied?.denied?.code === 'forbidden-target' &&
        denied.denied.reason === 'executable-not-authorized' &&
        denied.denied.detail.includes('"not-registered"') &&
        denied.observation === undefined,
      `the denied call is recorded as ${JSON.stringify(denied)}`,
    );
    const [first] = captures(capture);
    check(first?.results?.[0]?.result?.isError === true, 'the agent was not told its call was denied');
  }
  // Each trial launched the plan's step and the one call the registry granted; the denied call launched nothing.
  const trialLaunches = launches(unlisted).filter((line) => line.workspace?.startsWith('trial-'));
  check(
    trialLaunches.length === 2 * 2 * TRIALS,
    `a sealed-brief run with a denied call launched ${trialLaunches.length} time(s) in its trials; expected ${4 * TRIALS}`,
  );
  // Calls past the contract's budget are refused unsent.
  const overCapture = path.join(scratch.make('sealed-budget-capture'), 'captures.jsonl');
  const over = makeProject('sealed-budget', {
    edit: ({ folder }) => useSealedBriefAgent(folder, { capture: overCapture, mode: 'over-budget', budget: 1 }),
  });
  const overRan = evaluate(['run', '--evaluation', over.folder], over.env);
  check(overRan.status === 0, `a sealed-brief run past its budget exited ${overRan.status}; expected 0\n${overRan.output}`);
  const [overFirst] = captures(overCapture);
  check(
    overFirst?.results?.[1]?.result?.isError === true && overFirst.results[1].result.content[0].text.includes('budget'),
    `the call past the budget was answered ${JSON.stringify(overFirst?.results?.[1])}`,
  );
  // A call refused past the budget was never sent, so the manifest's use stays within its ceiling.
  const overDirectory = runDirectoryOf(over.folder);
  if (overDirectory !== null && overRan.status === 0) {
    const overManifest = readJson(path.join(overDirectory, 'trial-sets', 'P-002', 'isolation-manifest.json'));
    check(
      overManifest.actualResourceUse.toolCalls === 2 * TRIALS &&
        overManifest.actualResourceUse.toolCalls <= overManifest.resourceCeilings.maxToolCalls,
      `a run past its budget reports ${overManifest.actualResourceUse.toolCalls} tool calls used against a ceiling of ${overManifest.resourceCeilings.maxToolCalls}`,
    );
  }
  // An agent that fails, one whose reply holds no answer block, one that answers in a block carrying another nonce
  // (a forged answer), and one that answers in two blocks yield no record, the fault kept with the streams.
  const faults = {
    fail: 'the sealed-brief evaluator could not answer',
    silent: "carries no answer block with this call's nonce",
    forged: "carries no answer block with this call's nonce",
    'two-blocks': "carries 2 answer blocks with this call's nonce",
  };
  // The qualification's first attempt exercises the agent before any trial, so a fault there keeps its streams under the
  // attempt; the same fault from the fifth run on (after two arms of two attempts) lands in the clean arm's first trial.
  for (const phase of ['an evaluator attempt', 'a trial']) {
    for (const [mode, says] of Object.entries(faults)) {
      const what = `a sealed-brief agent in mode ${mode} during ${phase}`;
      const failCapture = path.join(scratch.make(`sealed-${mode}-capture`), 'captures.jsonl');
      const options =
        phase === 'a trial'
          ? { counter: path.join(scratch.make(`sealed-${mode}-counter`), 'runs.txt'), modeFrom: 2 * QUALIFICATION.attempts + 1 }
          : {};
      const project = makeProject(`sealed-${mode}-${phase === 'a trial' ? 'trial' : 'attempt'}`, {
        edit: ({ folder }) => useSealedBriefAgent(folder, { capture: failCapture, mode, ...options }),
      });
      const failed = evaluate(['run', '--evaluation', project.folder], project.env);
      check(failed.status === 12, `${what}: run exited ${failed.status}; expected 12\n${failed.output}`);
      const directory = runDirectoryOf(project.folder);
      check(recordFiles(directory).length === 0, `${what} wrote a record`);
      const streams =
        phase === 'a trial'
          ? path.join(directory ?? '', 'evaluator', 'clean', 'trial-1')
          : path.join(directory ?? '', 'evaluator-qualification', 'clean', 'attempt-1', 'evaluator');
      check(directory !== null && fs.existsSync(`${streams}.stdout`), `${what}: its streams are not persisted`);
      const fault = `${streams}.json`;
      check(fs.existsSync(fault) && String(readJson(fault).fault).includes(says), `${what}: the persisted fault does not say "${says}"`);
      // A fault in a trial follows a qualification that agreed, so the report is there; a fault in an attempt writes none.
      check(
        fs.existsSync(path.join(directory ?? '', 'evaluator-qualification.json')) === (phase === 'a trial'),
        `${what}: the qualification report ${phase === 'a trial' ? 'is missing' : 'exists'}`,
      );
    }
  }
  // A call carrying the trial's answer nonce is refused unsent and not counted: under a budget of one, the agent's
  // next call still runs and the run completes.
  const leakCapture = path.join(scratch.make('sealed-leak-capture'), 'captures.jsonl');
  const leak = makeProject('sealed-leak', {
    marker: true,
    edit: ({ folder }) => useSealedBriefAgent(folder, { capture: leakCapture, mode: 'leak-nonce', budget: 1 }),
  });
  const leakRan = evaluate(['run', '--evaluation', leak.folder], leak.env);
  check(leakRan.status === 0, `a sealed-brief agent that sends the nonce: run exited ${leakRan.status}; expected 0\n${leakRan.output}`);
  const [leakFirst] = captures(leakCapture);
  check(
    leakFirst?.results?.[0]?.result?.isError === true && String(leakFirst.results[0].result.content?.[0]?.text).includes('nonce'),
    `the call carrying the nonce was answered ${JSON.stringify(leakFirst?.results?.[0])}`,
  );
  const leakDirectory = runDirectoryOf(leak.folder);
  if (leakDirectory !== null && leakRan.status === 0) {
    const [leakedCall] = readJson(path.join(leakDirectory, 'evaluator', 'clean', 'trial-1.json')).calls ?? [];
    check(
      leakedCall?.unsent === true && leakedCall.observation === undefined,
      `the call carrying the nonce is recorded as ${JSON.stringify(leakedCall)}`,
    );
    // Only the plan's step and the agent's second call launched; the call carrying the nonce launched nothing.
    const trialLaunches = launches(leak).filter((line) => line.workspace?.startsWith('trial-'));
    check(
      trialLaunches.length === 2 * 2 * TRIALS && trialLaunches.every((line) => !String(line.request).includes('judge-answer')),
      `a sealed-brief run whose agent sent the nonce launched ${JSON.stringify(trialLaunches.map((line) => line.request))}`,
    );
  }
}

/** B-002 declares O-001 beside B-001, and P-002 discharges B-002, so the one key bound to O-001 answers both behaviors. */
function shareOracle(folder) {
  editJson(path.join(folder, 'contract.json'), (contract) => {
    const second = structuredClone(contract.behaviors[0]);
    second.id = 'B-002';
    second.description = `A second behavior the verdict oracle answers. ${second.description}`;
    second.requirementLinks = [{ scheme: 'tea-evaluate-fixture', id: 'second-behavior' }];
    contract.behaviors.push(second);
  });
  editJson(path.join(folder, 'probes', 'P-002.probe.json'), (probe) => {
    probe.behaviorId = 'B-002';
    for (const defect of probe.defects) defect.behaviorId = 'B-002';
  });
}

/**
 * An oracle two behaviors declare, judged through one key bound to the first:
 * under a command evaluator and a sealed-brief agent alike, the probe of the
 * second behavior files its finding for that behavior and is caught, as the
 * deterministic evaluator's is.
 */
async function checkSharedOracle() {
  const validate = createArtifactValidator();
  for (const kind of ['command', 'sealed-brief-agent']) {
    const what = `an oracle two behaviors declare, under ${kind}`;
    const capture = path.join(scratch.make(`shared-${kind}-capture`), 'captures.jsonl');
    const project = makeProject(`shared-${kind}`, {
      edit: ({ folder }) => {
        if (kind === 'command') useCommandEvaluator(folder);
        else useSealedBriefAgent(folder, { capture });
        shareOracle(folder);
      },
    });
    const ran = evaluate(['run', '--evaluation', project.folder], project.env);
    check(ran.status === 0, `${what}: run exited ${ran.status}; expected 0\n${ran.output}`);
    const runDirectory = runDirectoryOf(project.folder);
    if (ran.status !== 0 || runDirectory === null) continue;
    for (const record of recordsOf(runDirectory, 'P-002')) {
      for (const problem of await validate('sealed-run-record', record))
        check(false, `${what}: a P-002 record fails its schema: ${problem}`);
      check(
        record.findings.length === 1 && record.findings[0].behaviorId === 'B-002' && record.findings[0].oracleId === 'O-001',
        `${what}: a P-002 record files ${JSON.stringify(record.findings)}`,
      );
    }
    const { evidence } = scoreRun(project, what);
    checkVotes(what, evidence, 'P-001', 'passed-clean-control');
    checkVotes(what, evidence, 'P-002', 'caught');
  }
}

// -------------------------------------------------------------------- the bridge

/** Speaks MCP to a bridge server command over its stdio. */
function mcpClient(server) {
  const child = spawn(server.command, server.args, { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...server.env } });
  // Drained, so a relay that writes errors never blocks on a full pipe.
  child.stderr.resume();
  const waiting = new Map();
  let pending = '';
  let nextId = 1;
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    pending += chunk;
    let newline;
    while ((newline = pending.indexOf('\n')) !== -1) {
      const message = JSON.parse(pending.slice(0, newline));
      pending = pending.slice(newline + 1);
      waiting.get(message.id)?.(message);
    }
  });
  return {
    request(method, params) {
      return new Promise((resolve, reject) => {
        const id = nextId++;
        // A bridge that never answers fails the case in 30 s and never stalls the file.
        const timer = setTimeout(() => reject(new Error(`the bridge did not answer ${method} within 30 s`)), 30_000);
        waiting.set(id, (message) => {
          clearTimeout(timer);
          resolve(message);
        });
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      });
    },
    close() {
      child.stdin.end();
      return new Promise((resolve) => child.once('close', resolve));
    },
  };
}

/** Connects to a bridge's socket as a stranger would: presents `token`, asks for the tool list, and reports what came back before the socket closed. */
function intrude(socketPath, token) {
  return new Promise((resolve) => {
    const socket = net.connect(socketPath);
    let data = '';
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({ closed: false, data });
    }, 5000);
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => (data += chunk));
    socket.on('error', () => {});
    socket.on('close', () => {
      clearTimeout(timer);
      resolve({ closed: true, data });
    });
    socket.on('connect', () => {
      socket.write(`${JSON.stringify({ token })}\n${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })}\n`);
    });
  });
}

async function checkBridge() {
  // A project copy whose parent directory is named as a runtime workspace, so the launch marker names it.
  const base = scratch.make('bridge');
  const root = path.join(base, 'tea-evaluate-bridgecase-Ab12Cd', 'project');
  fs.cpSync(FIXTURE, root, { recursive: true, filter: (from) => path.basename(from) !== 'runs' });
  const marker = path.join(base, 'launches.jsonl');
  const evaluation = readJson(path.join(root, EVALUATION, 'evaluation.json'));
  // A second executable the registry grants and no contract operation declares.
  evaluation.registry.push({ ...evaluation.registry[0], executable: 'verdict-admin' });
  const registry = registryFromEvaluation(evaluation, { root });
  const contract = readJson(path.join(root, EVALUATION, 'contract.json'));
  contract.permittedInterfaces.push(
    { logicalId: 'verdict-tools', kind: 'mcp', operations: [] },
    { logicalId: 'verdict-api', kind: 'api', operations: [] },
  );
  const interfaces = contract.permittedInterfaces.map((iface) => ({ logicalId: iface.logicalId, kind: iface.kind }));
  const previous = process.env.VERDICT_MARKER;
  process.env.VERDICT_MARKER = marker;
  const { port } = await registry.createProbePort({ cwd: root, projectRoot: root });
  const router = bridgeRouter({
    contract,
    registry,
    port: hostEnvironmentPort({ port, registry }),
    degenerate: null,
    label: 'trial-1',
    taken: new Set(['trial-1-judge-run']),
    firstSequence: 2,
    budget: 7,
    nonce: NONCE,
    signal: new AbortController().signal,
  });
  const tools = bridgeTools(interfaces);
  const bridge = await openBridge({ tools, handle: router.handle });
  const client = mcpClient(bridge.server);
  try {
    const initialized = await client.request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    });
    check(initialized.result?.capabilities?.tools !== undefined, `the bridge answered initialize with ${JSON.stringify(initialized)}`);
    const listed = await client.request('tools/list', {});
    const shapes = Object.fromEntries((listed.result?.tools ?? []).map((tool) => [tool.name, Object.keys(tool.inputSchema.properties)]));
    check(
      JSON.stringify(shapes) ===
        JSON.stringify({
          verdict: ['arguments', 'stdin'],
          'verdict-tools': ['tool', 'arguments'],
          'verdict-api': ['method', 'path', 'body'],
        }),
      `the bridge lists ${JSON.stringify(shapes)}`,
    );
    const described = JSON.stringify(listed.result?.tools ?? []);
    check(!described.includes('judge-request') && !described.includes('judge-run'), 'a tool description names an operation or a plan step');
    const call = (name, input) => client.request('tools/call', { name, arguments: input });
    const text = (answer) => answer.result?.content?.[0]?.text ?? '';

    const authorized = await call('verdict', { arguments: ['verdict'], stdin: 'Judge the bridge.' });
    const observed = JSON.parse(text(authorized));
    check(
      authorized.result?.isError === false && String(observed.stdout).includes('request: Judge the bridge.'),
      `the authorized call answered ${text(authorized)}`,
    );
    const denied = await call('verdict', { arguments: ['not-registered'] });
    check(
      denied.result?.isError === true && text(denied).includes('forbidden-target'),
      `the unlisted executable was answered ${text(denied)}`,
    );
    const mcpDenied = await call('verdict-tools', { tool: 'lookup', arguments: { id: 'one' } });
    check(
      mcpDenied.result?.isError === true && text(mcpDenied).includes('no authorization names interface'),
      `the mcp call was answered ${text(mcpDenied)}`,
    );
    const apiDenied = await call('verdict-api', { method: 'GET', path: '/things' });
    check(
      apiDenied.result?.isError === true && text(apiDenied).includes('interface-not-authorized'),
      `the api call was answered ${text(apiDenied)}`,
    );
    const unmatched = await call('verdict', { arguments: ['verdict-admin'], stdin: 'Judge as admin.' });
    // An unmatched call is answered with what was sent and came back, and no observation ID to cite.
    const unmatchedResult = JSON.parse(text(unmatched) || '{}');
    check(
      unmatched.result?.isError === false && unmatchedResult.recorded === false && unmatchedResult.observationId === undefined,
      `the authorized unmatched call was answered ${text(unmatched)}`,
    );
    const twice = await call('verdict', { arguments: ['verdict', '--mode=a', '--mode=b'] });
    check(twice.result?.isError === true && text(twice).includes('given twice'), `a repeated option was answered ${text(twice)}`);
    const lastInBudget = await call('verdict', { arguments: ['verdict'] });
    const spent = await call('verdict', { arguments: ['verdict'] });
    check(
      lastInBudget.result?.isError === false && spent.result?.isError === true && text(spent).includes('budget'),
      `the call past the budget was answered ${text(spent)}`,
    );
    // A second connection, even with the token, and one with a wrong token, are closed unanswered.
    const socketPath = bridge.server.args[bridge.server.args.indexOf('--socket') + 1];
    for (const [what, token] of [
      ['a second connection with the token', fs.readFileSync(bridge.server.env.TEA_EVALUATE_BRIDGE_TOKEN_FILE, 'utf8')],
      ['a connection with a wrong token', 'not-the-token'],
    ]) {
      const answered = await intrude(socketPath, token);
      check(answered.closed && answered.data === '', `${what} was answered ${JSON.stringify(answered)}`);
    }
  } finally {
    await client.close();
    await bridge.close();
    if (previous === undefined) delete process.env.VERDICT_MARKER;
    else process.env.VERDICT_MARKER = previous;
  }
  // One observation per authorized call that matched an operation, evaluator-chosen, numbered after the plan's.
  check(
    JSON.stringify(
      router.observations.map((observation) => [
        observation.observationId,
        observation.sequence,
        observation.provenance,
        observation.operationId,
      ]),
    ) ===
      JSON.stringify([
        ['trial-1-call-1', 2, 'evaluator-chosen', 'judge-request'],
        // The api call took the fourth ID: it is sent through the trial's port, as a command and a tool call are (Story 1.11).
        ['trial-1-call-6', 3, 'evaluator-chosen', 'judge-request'],
      ]),
    `the bridge recorded ${JSON.stringify(router.observations.map((observation) => [observation.observationId, observation.sequence, observation.provenance, observation.operationId]))}`,
  );
  const outcomes = router.calls.map((entry) => {
    // Every denial carries eval-quality's own reason code, for a command, a tool call and an HTTP request alike (Story 1.10).
    if (entry.denied !== undefined) return `denied:${entry.denied.code}:${entry.denied.reason}`;
    if (entry.unmatched) return 'unmatched';
    if (entry.refused !== undefined) return 'refused';
    return entry.operationId;
  });
  check(
    JSON.stringify(outcomes) ===
      JSON.stringify([
        'judge-request',
        'denied:forbidden-target:executable-not-authorized',
        'denied:forbidden-target:interface-not-authorized',
        'denied:forbidden-target:interface-not-authorized',
        'unmatched',
        'refused',
        'judge-request',
        'refused',
      ]),
    `the bridge's calls are ${JSON.stringify(outcomes)}`,
  );
  // On a gameability arm nothing launches, and every call is answered from the degenerate response (an unmatched one from the
  // plan's first step, unrecorded), so no call tells the agent which arm it is on.
  const trap = {
    probe() {
      throw new Error('a gameability router launched the target');
    },
  };
  const degenerate = bridgeRouter({
    contract,
    registry,
    port: trap,
    degenerate: { 'judge-run': { stdout: 'verdict: pending\n', stderr: '', exitCode: 0 } },
    label: 'trial-1',
    taken: new Set(),
    firstSequence: 2,
    budget: 4,
    nonce: NONCE,
  });
  const answered = await degenerate.handle({ name: 'verdict', kind: 'cli' }, { arguments: ['verdict'], stdin: 'Judge the shortcut.' });
  const other = await degenerate.handle({ name: 'verdict', kind: 'cli' }, { arguments: ['verdict-admin'] });
  check(
    answered.isError === false &&
      JSON.parse(answered.text).stdout === 'verdict: pending\n' &&
      degenerate.observations.length === 1 &&
      degenerate.observations[0].operationId === 'judge-request' &&
      other.isError === false &&
      JSON.parse(other.text).stdout === 'verdict: pending\n' &&
      JSON.parse(other.text).recorded === false,
    `the gameability router answered ${JSON.stringify([answered, other])}`,
  );
  // A call the registry does not grant is denied and recorded on a gameability arm exactly as the real arm above denied
  // it, so the answer tells the agent nothing of the arm, and nothing launches.
  const realDenial = router.calls.find((entry) => entry.denied !== undefined && entry.input.arguments?.[0] === 'not-registered');
  const ungranted = await degenerate.handle({ name: 'verdict', kind: 'cli' }, { arguments: ['not-registered'] });
  const ungrantedEntry = degenerate.calls.at(-1);
  const shell = await degenerate.handle({ name: 'verdict', kind: 'cli' }, { arguments: ['sh', '-c', 'id'] });
  const shellEntry = degenerate.calls.at(-1);
  check(
    realDenial !== undefined &&
      ungranted.isError === true &&
      JSON.stringify(ungrantedEntry?.denied) === JSON.stringify(realDenial.denied) &&
      ungrantedEntry.observation === undefined &&
      shell.isError === true &&
      shell.text.startsWith("denied by the evaluation's target policy:") &&
      shellEntry?.denied?.code === 'forbidden-target' &&
      shellEntry.observation === undefined,
    `the gameability router answered ungranted calls with ${JSON.stringify([ungranted, shell])} and recorded ${JSON.stringify([ungrantedEntry, shellEntry, realDenial])}`,
  );
  // A call carrying the trial's answer nonce is refused unsent and not counted.
  const usedBefore = degenerate.counted();
  const leaked = await degenerate.handle({ name: 'verdict', kind: 'cli' }, { arguments: ['verdict'], stdin: `echo ${NONCE}` });
  check(
    leaked.isError === true &&
      leaked.text.includes('nonce') &&
      degenerate.counted() === usedBefore &&
      degenerate.calls.at(-1)?.unsent === true,
    `a call carrying the nonce was answered ${JSON.stringify(leaked)} with ${degenerate.counted()} call(s) counted`,
  );
  // Once the agent has ended, the router runs no call.
  degenerate.stop();
  const late = await degenerate.handle({ name: 'verdict', kind: 'cli' }, { arguments: ['verdict'] });
  check(late.isError === true && late.text.includes('had ended'), `a call after the agent ended was answered ${JSON.stringify(late)}`);
  // A call whose target exits an infrastructure code marks the trial as one the target could not run.
  const broken = bridgeRouter({
    contract,
    registry,
    port: {
      probe: async (request) => ({
        request,
        observation: { kind: 'cli', exitCode: 3, stdout: { kind: 'text', value: '' }, stderr: { kind: 'text', value: '' }, artifacts: {} },
      }),
    },
    degenerate: null,
    label: 'trial-1',
    taken: new Set(),
    firstSequence: 2,
    budget: 3,
    nonce: NONCE,
  });
  await broken.handle({ name: 'verdict', kind: 'cli' }, { arguments: ['verdict'] });
  check(
    String(broken.infrastructure()).includes('infrastructure exit code'),
    `a call exiting 3 left the router reporting ${broken.infrastructure()}`,
  );
  // Only the authorized calls launched, each in the routed working directory; the gameability router launched nothing.
  const launched = fs.existsSync(marker)
    ? fs
        .readFileSync(marker, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
    : [];
  check(
    launched.length === 3 && launched.every((line) => line.workspace === 'bridgecase'),
    `the bridge launched ${JSON.stringify(launched)}; expected three launches in the routed workspace`,
  );
}

// ----------------------------------------------------------------------- records

async function checkRecordsEvaluator() {
  // A harness's records: a command run's own, copied out of its run directory as the adopter's harness would write them.
  const project = makeProject('records', { edit: ({ folder }) => useCommandEvaluator(folder) });
  const produced = evaluate(['run', '--evaluation', project.folder], project.env);
  check(produced.status === 0, `the run that produces the harness's records exited ${produced.status}\n${produced.output}`);
  const source = runDirectoryOf(project.folder);
  if (produced.status !== 0 || source === null) return;
  const records = path.join(project.folder, 'records');
  fs.mkdirSync(records);
  fs.copyFileSync(path.join(source, 'evaluator-configuration.json'), path.join(records, 'evaluator-configuration.json'));
  for (const probeId of ['P-001', 'P-002'])
    fs.cpSync(path.join(source, 'trial-sets', probeId), path.join(records, probeId), { recursive: true });
  editJson(path.join(project.folder, 'evaluation.json'), (evaluation) => {
    evaluation.evaluator = { kind: 'records', records: 'records' };
  });
  // A contract with no rubric has no use for a judgments file: it is never read, so one that is not JSON changes nothing.
  fs.writeFileSync(path.join(records, JUDGMENTS_NAME), 'not json');
  commitAll(project.repository, project.folder, "the harness's records");

  const ran = evaluate(['run', '--evaluation', project.folder], project.env);
  check(ran.status === 0, `a records run exited ${ran.status}; expected 0\n${ran.output}`);
  const runDirectory = runDirectoryOf(project.folder);
  if (ran.status !== 0 || runDirectory === source) return;
  check(!fs.existsSync(path.join(runDirectory, 'judge-calibration.json')), 'a records run with no rubric wrote a calibration report');
  const run = readJson(path.join(runDirectory, 'run.json'));
  check(run.evaluator?.kind === 'records' && run.judge === null, `a records run records the evaluator ${JSON.stringify(run.evaluator)}`);
  const index = readJson(path.join(runDirectory, 'trial-sets.json'));
  for (const set of index.trialSets) {
    for (const relative of [...set.records, set.isolationManifest]) {
      const copied = fs.readFileSync(path.join(runDirectory, relative));
      const original = fs.readFileSync(path.join(records, set.probeId, path.basename(relative)));
      check(copied.equals(original), `a records run changed ${relative} on its way into the run`);
    }
  }
  const { evidence, aggregate } = scoreRun(project, 'a records run');
  checkVotes('a records run', evidence, 'P-001', 'passed-clean-control');
  checkVotes('a records run', evidence, 'P-002', 'caught');
  // A records run aggregates too (Story 1.45): the harness's records, copied byte for byte, are scored and aggregated as any run's.
  check(
    aggregate?.inputs?.map((input) => input.probeId).join(',') === 'P-001,P-002' &&
      aggregate.classes?.defect?.caught === 1 &&
      aggregate.classes.defect.rate === 1 &&
      aggregate.inputs[0].probeClass === null,
    `a records run's aggregate is ${JSON.stringify(aggregate?.classes)}`,
  );

  // An imported observation finding is schema-valid without citations or quotes, but interpretation requires both.
  const uncitedRelative = index.trialSets.find((set) => set.probeId === 'P-002').records[0];
  const uncitedFile = path.join(runDirectory, uncitedRelative);
  const uncitedOriginal = fs.readFileSync(uncitedFile);
  const runFile = path.join(runDirectory, 'run.json');
  const runOriginal = fs.readFileSync(runFile);
  editJson(uncitedFile, (record) => {
    record.findings.push({
      findingType: 'observation',
      findingId: 'F-999',
      oracleId: null,
      probeId: 'P-002',
      behaviorId: null,
      severity: 'low',
      summary: 'Imported note with no cited evidence.',
      confidence: 1,
      observationIds: [],
      evidenceArtifacts: [],
    });
  });
  editJson(runFile, (value) => (value.artifacts.records[uncitedRelative] = sha256(fs.readFileSync(uncitedFile))));
  const noCitationLog = path.join(scratch.make('records-no-citation'), 'argv.jsonl');
  const noCitation = evaluate(['score', '--evaluation', project.folder, '--run', path.basename(runDirectory)], {
    ...project.env,
    [ENGINE_CLI_ENV]: ENGINE_SHIM,
    TEA_EVALUATE_SHIM_LOG: noCitationLog,
  });
  check(
    noCitation.status === 10 &&
      noCitation.output.includes('F-999') &&
      noCitation.output.includes('cites no observation') &&
      noCitation.output.includes('quotes no evidence'),
    `score accepted an imported finding without citations or quotes: ${noCitation.output}`,
  );
  check(!fs.existsSync(noCitationLog), 'score called eval-quality for an imported finding without citations or quotes');
  fs.writeFileSync(uncitedFile, uncitedOriginal);
  fs.writeFileSync(runFile, runOriginal);

  // score hands eval-quality the adopter's own bytes: the logging shim's --record files equal the harness's.
  const log = path.join(scratch.make('records-shim'), 'argv.jsonl');
  scoreRun(project, 'a records run under the shim', 0, { [ENGINE_CLI_ENV]: RACE_ENGINE, TEA_RACE_LOG: log });
  const scoreCalls = fs
    .readFileSync(log, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
    .filter((argv) => argv[0] === 'score');
  const passed = scoreCalls.flatMap((argv) => argv.flatMap((value, at) => (argv[at - 1] === '--record' ? [value] : [])));
  check(
    scoreCalls.length === 2 && passed.length === 2 * TRIALS,
    `the shim logged ${scoreCalls.length} score call(s) carrying ${passed.length} record(s)`,
  );
  for (const file of passed) {
    const probeId = path.basename(path.dirname(file));
    check(
      fs.readFileSync(file).equals(fs.readFileSync(path.join(records, probeId, path.basename(file)))),
      `score passed ${file}, which is not the harness's bytes`,
    );
  }

  // The index of a records run must name exactly the records the run copied.
  const indexFile = path.join(runDirectory, 'trial-sets.json');
  const indexBytes = fs.readFileSync(indexFile);
  editJson(indexFile, (value) => {
    value.trialSets.find((set) => set.probeId === 'P-002').records.pop();
  });
  const dropped = evaluate(['score', '--evaluation', project.folder, '--run', path.basename(runDirectory)], project.env);
  check(
    dropped.status === 10 && dropped.output.includes('and the run copied'),
    `score over a records run whose index drops a record exited ${dropped.status}; expected 10\n${dropped.output}`,
  );
  fs.writeFileSync(indexFile, indexBytes);

  // Records of another brief, or labelled with another arm than the run qualified the probe on, stop the run with exit 10.
  for (const [what, file, edit, says] of [
    [
      'a configuration of another brief',
      path.join(records, 'evaluator-configuration.json'),
      (value) => (value.sealedBriefDigest = `sha256:${'2'.repeat(64)}`),
      'evaluator-configuration.json carries sealedBriefDigest',
    ],
    [
      'a record of another brief',
      path.join(records, 'P-001', 'record-2.json'),
      (value) => (value.sealedBriefDigest = `sha256:${'2'.repeat(64)}`),
      'record-2.json carries sealedBriefDigest',
    ],
    [
      'a mutated probe record labelled with the clean arm',
      path.join(records, 'P-002', 'record-2.json'),
      (value) => (value.conditionArm = 'clean'),
      'and the arm mutated:M-001 the run qualified P-002 on',
    ],
    [
      'an isolation manifest off its schema',
      path.join(records, 'P-001', 'isolation-manifest.json'),
      (value) => delete value.resourceCeilings,
      "records/P-001/isolation-manifest.json does not meet eval-quality's isolation-manifest schema",
    ],
    [
      'an evaluator configuration off its schema',
      path.join(records, 'evaluator-configuration.json'),
      (value) => delete value.evaluatorIdentity,
      "records/evaluator-configuration.json does not meet eval-quality's evaluator-configuration schema",
    ],
  ]) {
    const bytes = fs.readFileSync(file);
    editJson(file, edit);
    const laundered = evaluate(['run', '--evaluation', project.folder], project.env);
    check(
      laundered.status === 10 && laundered.output.includes(says),
      `${what}: run exited ${laundered.status}; expected 10 saying "${says}"\n${laundered.output}`,
    );
    // Every file is checked before any is copied, so a refused directory leaves nothing in the run directory.
    const launderedDirectory = runDirectoryOf(project.folder);
    check(
      launderedDirectory !== runDirectory &&
        !fs.existsSync(path.join(launderedDirectory, 'trial-sets')) &&
        !fs.existsSync(path.join(launderedDirectory, 'evaluator-configuration.json')),
      `${what}: the refused run copied files into its run directory`,
    );
    fs.writeFileSync(file, bytes);
  }

  // A configuration that meets the schema and that eval-quality cannot digest (a number outside its canonical form) is an authoring defect.
  const configurationFile = path.join(records, 'evaluator-configuration.json');
  const configurationBytes = fs.readFileSync(configurationFile);
  editJson(configurationFile, (value) => (value.decodingParameters['tea.harnessScale'] = 1e21));
  const checkedUndigestible = evaluate(['check', '--evaluation', project.folder], project.env);
  check(
    checkedUndigestible.status === 0,
    `check over a configuration eval-quality cannot digest exited ${checkedUndigestible.status}; expected 0\n${checkedUndigestible.output}`,
  );
  const undigestible = evaluate(['run', '--evaluation', project.folder], project.env);
  check(
    undigestible.status === 10 &&
      undigestible.output.includes('records/evaluator-configuration.json cannot be digested as an EvaluatorConfiguration') &&
      !undigestible.output.includes('RuntimeFault'),
    `a configuration eval-quality cannot digest: run exited ${undigestible.status}; expected 10 saying it cannot be digested\n${undigestible.output}`,
  );
  const undigestibleDirectory = runDirectoryOf(project.folder);
  check(
    undigestibleDirectory !== runDirectory &&
      !fs.existsSync(path.join(undigestibleDirectory, 'trial-sets')) &&
      !fs.existsSync(path.join(undigestibleDirectory, 'evaluator-configuration.json')),
    'the run over a configuration eval-quality cannot digest copied files into its run directory',
  );
  fs.writeFileSync(configurationFile, configurationBytes);

  // A record off its schema stops the run with exit 10, before any score call.
  editJson(path.join(records, 'P-002', 'record-1.json'), (record) => {
    delete record.findings;
  });
  const refusedLog = path.join(scratch.make('records-refused-shim'), 'argv.jsonl');
  const refused = evaluate(['run', '--evaluation', project.folder], project.env);
  check(
    refused.status === 10 && refused.output.includes('records/P-002/record-1.json') && refused.output.includes('sealed-run-record'),
    `a records run with a record off its schema exited ${refused.status}; expected 10 naming it\n${refused.output}`,
  );
  const refusedDirectory = runDirectoryOf(project.folder);
  check(!fs.existsSync(path.join(refusedDirectory, 'trial-sets')), 'a refused records run copied records into its run directory');
  const after = evaluate(['score', '--evaluation', project.folder, '--run', path.basename(refusedDirectory)], {
    ...project.env,
    [ENGINE_CLI_ENV]: ENGINE_SHIM,
    TEA_EVALUATE_SHIM_LOG: refusedLog,
  });
  check(after.status === 64, `score over the refused records run exited ${after.status}; expected 64\n${after.output}`);
  check(!fs.existsSync(refusedLog), 'score over the refused records run called the engine');
}

// ------------------------------------------------- imported rubric calibration (Story 1.40)

const JUDGMENTS_NAME = 'calibration-judgments.json';
const DIGEST_BINDING = 'tea.judgeCalibrationDigest';
const MINIMUM_BINDING = 'tea.judgeCalibrationMinimumAgreement';

/** What the harness's scorer, the command stub, answers for one label-free observation. */
function harnessScore(observation) {
  const scored = spawnSync(process.execPath, [path.join(COMMAND_EVALUATOR, 'rows.js'), '--mode', 'score'], {
    input: JSON.stringify({ sealedBrief: {}, observations: [observation] }),
    encoding: 'utf8',
    env: BASE_ENV,
    timeout: SPAWN_TIMEOUT_MS,
  });
  if (scored.status !== 0) throw new Error(`the harness scorer exited ${scored.status}: ${scored.stderr}`);
  return JSON.parse(scored.stdout).rows.find((row) => row.key === 'verdict-quality')?.score ?? null;
}

/** The harness's configuration without the two calibration bindings: what its scorer ran under. */
function scorerConfigurationOf(configuration) {
  const scorer = structuredClone(configuration);
  delete scorer.decodingParameters[DIGEST_BINDING];
  delete scorer.decodingParameters[MINIMUM_BINDING];
  return scorer;
}

/**
 * Writes the judgments an adopter harness writes beside its records: its
 * scorer run over each labelled item's label-free observation, under the
 * configuration it imports. `edit` changes the file before it is written.
 */
async function writeHarnessJudgments(project, edit = () => {}) {
  const engine = await loadEngine();
  const records = path.join(project.folder, 'records');
  const configuration = readJson(path.join(records, 'evaluator-configuration.json'));
  const contract = readJson(path.join(project.folder, 'contract.json'));
  const criteria = new Map(
    contract.rubrics.flatMap((rubric) => rubric.criteria.map((criterion) => [`${rubric.id}/${criterion.id}`, criterion])),
  );
  const items = readJson(path.join(project.folder, 'policy', 'judge-calibration.json')).items.map((item) => {
    const criterion = criteria.get(`${item.rubricId}/${item.criterionId}`);
    // The harness hands its scorer the response and nothing of the label.
    const scorerInput = calibrationObservation({
      criterion,
      response: item.response,
      responseKind: item.responseKind,
      ...calibrationStepPair(contract, criterion),
    });
    return { rubricId: item.rubricId, criterionId: item.criterionId, scorerInput, answer: harnessScore(scorerInput) };
  });
  const judgments = {
    schemaVersion: 1,
    scorerConfigurationDigest: engine.digestArtifact(scorerConfigurationOf(configuration), 'EvaluatorConfiguration'),
    items,
  };
  edit(judgments);
  writeJson(path.join(records, JUDGMENTS_NAME), judgments);
}

/**
 * An adopter harness over a rubric: a command run scores the verdict
 * project, its configuration and records are copied into `records/`, its
 * judgments are written beside them, and the evaluation then names the
 * directory as a records evaluator. `half` makes the rubric two levels and
 * the labelled items judged at the wrong one half the time, at a minimum the
 * harness's own run meets (0.5) and the records evaluation then raises to 0.9
 * in `useRecords`.
 */
async function harnessProject(label, { half = false, edit = () => {} } = {}) {
  const project = makeProject(label, {
    edit: ({ folder }) => {
      useCommandEvaluator(folder, { mode: half ? 'score-two' : 'score' });
      addRubric(folder);
      if (half) {
        setHalfAgreement(folder);
        editJson(path.join(folder, 'evaluation.json'), (evaluation) => (evaluation.judgeCalibration.minimumAgreement = 0.5));
      }
      edit(folder);
      // Compact bytes, so a digest of the re-serialized value differs from the digest of the file.
      const labelledFile = path.join(folder, 'policy', 'judge-calibration.json');
      fs.writeFileSync(labelledFile, JSON.stringify(readJson(labelledFile)));
    },
  });
  const produced = evaluate(['run', '--evaluation', project.folder], project.env);
  check(produced.status === 0, `${label}: the harness's own run exited ${produced.status}\n${produced.output}`);
  const source = runDirectoryOf(project.folder);
  if (produced.status !== 0 || source === null) return null;
  project.harnessRun = source;
  const records = path.join(project.folder, 'records');
  fs.mkdirSync(records);
  fs.copyFileSync(path.join(source, 'evaluator-configuration.json'), path.join(records, 'evaluator-configuration.json'));
  for (const probeId of ['P-001', 'P-002'])
    fs.cpSync(path.join(source, 'trial-sets', probeId), path.join(records, probeId), { recursive: true });
  await writeHarnessJudgments(project);
  return project;
}

/** Names `records/` as the evaluator, with `minimum` as the evaluation's minimum agreement (and the configuration's binding) when given. */
function useRecords(project, { minimum } = {}) {
  const records = path.join(project.folder, 'records');
  editJson(path.join(project.folder, 'evaluation.json'), (evaluation) => {
    evaluation.evaluator = { kind: 'records', records: 'records' };
    if (minimum !== undefined) evaluation.judgeCalibration.minimumAgreement = minimum;
  });
  if (minimum !== undefined)
    editJson(path.join(records, 'evaluator-configuration.json'), (configuration) => {
      configuration.decodingParameters[MINIMUM_BINDING] = minimum;
    });
  commitAll(project.repository, project.folder, "the harness's records and judgments");
}

/** Edits a harness file and returns the function that puts its bytes back. */
function editHarnessFile(project, name, edit) {
  const file = path.join(project.folder, 'records', name);
  const bytes = fs.readFileSync(file);
  editJson(file, edit);
  return () => fs.writeFileSync(file, bytes);
}

/** The names under `runs/`, so a run's directory can be told from the ones before it. */
function runNames(folder) {
  const runs = path.join(folder, 'runs');
  return fs.existsSync(runs) ? fs.readdirSync(runs).filter((name) => name !== '.gitignore' && name !== '.workspace-journal') : [];
}

/**
 * A records run over a calibration that cannot be verified or does not meet
 * the minimum stops with `exitCode`, the output names each of `says`, and no
 * run directory it left holds a copied record or the harness's configuration.
 */
function checkImportRefused(project, what, exitCode, says) {
  const before = runNames(project.folder);
  const ran = evaluate(['run', '--evaluation', project.folder], project.env);
  check(ran.status === exitCode, `${what}: run exited ${ran.status}; expected ${exitCode}\n${ran.output}`);
  for (const text of says) check(ran.output.includes(text), `${what}: the output does not say ${JSON.stringify(text)}\n${ran.output}`);
  for (const name of runNames(project.folder).filter((candidate) => !before.includes(candidate))) {
    const directory = path.join(project.folder, 'runs', name);
    check(
      !fs.existsSync(path.join(directory, 'trial-sets')) &&
        !fs.existsSync(path.join(directory, 'trial-sets.json')) &&
        !fs.existsSync(path.join(directory, 'evaluator-configuration.json')),
      `${what}: the refused run copied the harness's files into ${name}`,
    );
  }
  return ran;
}

/** What the scoring-version case compares across calibrated records runs: the configuration digest, the scoring version and the two bindings. */
function scoredCalibration(runDirectory, evidence) {
  const configuration = readJson(path.join(runDirectory, 'evaluator-configuration.json'));
  return {
    digest: readJson(path.join(runDirectory, 'run.json')).evaluatorConfigurationDigest,
    version: evidence['P-002']?.scoringVersion,
    bound: [configuration.decodingParameters[DIGEST_BINDING], configuration.decodingParameters[MINIMUM_BINDING]],
  };
}

async function checkImportedRubricCalibration() {
  const project = await harnessProject('records-rubric');
  if (project === null) return;
  const judgmentsFile = path.join(project.folder, 'records', JUDGMENTS_NAME);
  const judgmentsText = fs.readFileSync(judgmentsFile, 'utf8');
  check(!judgmentsText.includes('expectedLevel'), 'the harness fixture wrote a label into its judgments');
  const configuration = readJson(path.join(project.folder, 'records', 'evaluator-configuration.json'));
  check(
    configuration.decodingParameters[DIGEST_BINDING] ===
      sha256(fs.readFileSync(path.join(project.folder, 'policy', 'judge-calibration.json'))) &&
      configuration.decodingParameters[MINIMUM_BINDING] === 1,
    `the harness configuration binds ${JSON.stringify(configuration.decodingParameters)}`,
  );
  useRecords(project);

  // Verified judgments: the report is written from the harness's answers, the records are copied byte for byte and scored.
  const ran = evaluate(['run', '--evaluation', project.folder], project.env);
  check(ran.status === 0, `a records run over verified calibration judgments exited ${ran.status}; expected 0\n${ran.output}`);
  const runDirectory = runDirectoryOf(project.folder);
  if (ran.status === 0 && (runDirectory === null || runDirectory === project.harnessRun))
    check(false, 'the records run exited 0 and left no run directory of its own');
  if (ran.status !== 0 || runDirectory === null || runDirectory === project.harnessRun) return;
  const reportFile = path.join(runDirectory, 'judge-calibration.json');
  check(fs.existsSync(reportFile), 'a calibrated records run wrote no judge-calibration.json');
  if (!fs.existsSync(reportFile)) return;
  const report = readJson(reportFile);
  check(
    report.minimumAgreement === 1 &&
      report.criteria.length === 1 &&
      report.criteria[0].rubricId === 'R-101' &&
      report.criteria[0].criterionId === 'RC-101' &&
      report.criteria[0].agreement === 1 &&
      report.criteria[0].largestLevelDistance === 0 &&
      JSON.stringify(report.criteria[0].items.map((item) => [item.expectedLevel, item.actualLevel, item.levelDistance])) ===
        '[[1,1,0],[2,2,0],[3,3,0]]',
    `the calibration report over the harness's answers is ${JSON.stringify(report)}`,
  );
  for (const set of readJson(path.join(runDirectory, 'trial-sets.json')).trialSets) {
    for (const relative of set.records) {
      check(
        fs
          .readFileSync(path.join(runDirectory, relative))
          .equals(fs.readFileSync(path.join(project.folder, 'records', set.probeId, path.basename(relative)))),
        `a calibrated records run changed ${relative} on its way into the run`,
      );
    }
  }
  const { evidence } = scoreRun(project, 'a calibrated records run');
  checkVotes('a calibrated records run', evidence, 'P-001', 'passed-clean-control');
  checkVotes('a calibrated records run', evidence, 'P-002', 'caught');

  // A scorer configuration other than the one the records name, and a label in what the scorer saw.
  const otherConfiguration = structuredClone(configuration);
  otherConfiguration.evaluatorIdentity = 'a different harness scorer';
  const engine = await loadEngine();
  const otherDigest = engine.digestArtifact(scorerConfigurationOf(otherConfiguration), 'EvaluatorConfiguration');
  const ownDigest = engine.digestArtifact(scorerConfigurationOf(configuration), 'EvaluatorConfiguration');
  let restore = editHarnessFile(project, JUDGMENTS_NAME, (value) => (value.scorerConfigurationDigest = otherDigest));
  checkImportRefused(project, 'judgments of another scorer configuration', 10, [
    otherDigest,
    ownDigest,
    'not from the scorer that produced the records',
  ]);
  restore();
  restore = editHarnessFile(project, JUDGMENTS_NAME, (value) => (value.items[1].scorerInput.expectedLevel = 2));
  checkImportRefused(project, 'a label in the scorer input', 10, ['items[1].scorerInput', 'carries expectedLevel']);
  restore();
  restore = editHarnessFile(project, JUDGMENTS_NAME, (value) => (value.items[2].scorerInput.stdout.value += ' (expected level 3)'));
  checkImportRefused(project, 'a label in the scorer input response', 10, ['items[2].scorerInput is not the label-free observation']);
  restore();
  restore = editHarnessFile(project, JUDGMENTS_NAME, (value) => (value.items[0].expectedLevel = 1));
  checkImportRefused(project, 'a label beside the scorer input', 10, ['items[0] has an unknown field "expectedLevel"']);
  restore();
  restore = editHarnessFile(project, JUDGMENTS_NAME, (value) => (value.expectedLevel = 1));
  checkImportRefused(project, 'a label beside the items', 10, [`records/${JUDGMENTS_NAME} has an unknown field "expectedLevel"`]);
  restore();

  // The configuration binds the labelled file and the minimum: absent or another value is refused.
  for (const [what, key, value, says] of [
    ['a configuration with no digest binding', DIGEST_BINDING, undefined, `carries no decodingParameters["${DIGEST_BINDING}"]`],
    ['a configuration with no minimum binding', MINIMUM_BINDING, undefined, `carries no decodingParameters["${MINIMUM_BINDING}"]`],
    ['a configuration binding another digest', DIGEST_BINDING, `sha256:${'3'.repeat(64)}`, `binds decodingParameters["${DIGEST_BINDING}"]`],
    ['a configuration binding another minimum', MINIMUM_BINDING, 0.5, `binds decodingParameters["${MINIMUM_BINDING}"] 0.5`],
  ]) {
    restore = editHarnessFile(project, 'evaluator-configuration.json', (config) => {
      if (value === undefined) delete config.decodingParameters[key];
      else config.decodingParameters[key] = value;
    });
    checkImportRefused(project, what, 10, [says]);
    restore();
  }

  // The judgments are one item per labelled item, in order, answered on the criterion's levels.
  for (const [what, edit, says] of [
    ['a missing item', (value) => value.items.pop(), 'holds 2 items; policy/judge-calibration.json holds 3'],
    ['an extra item', (value) => value.items.push(structuredClone(value.items[0])), 'holds 4 items; policy/judge-calibration.json holds 3'],
    [
      'reordered items',
      (value) => value.items.splice(0, 2, value.items[1], value.items[0]),
      'items[0].scorerInput is not the label-free observation',
    ],
    ['an answer off the levels', (value) => (value.items[1].answer = 7), 'items[1].answer 7 is not null or an anchored level'],
    ['another item for a criterion', (value) => (value.items[2].criterionId = 'RC-999'), 'items[2] names R-101/RC-999'],
    ['another schema version', (value) => (value.schemaVersion = 2), 'schemaVersion must be 1'],
  ]) {
    restore = editHarnessFile(project, JUDGMENTS_NAME, edit);
    checkImportRefused(project, what, 10, [says]);
    restore();
  }

  // No judgments at all, and a file that is not JSON.
  const bytes = fs.readFileSync(judgmentsFile);
  fs.rmSync(judgmentsFile);
  checkImportRefused(project, 'no judgments file', 10, [`records/${JUDGMENTS_NAME} is not there`]);
  fs.writeFileSync(judgmentsFile, 'not json');
  checkImportRefused(project, 'judgments that are not JSON', 10, [`records/${JUDGMENTS_NAME} is not JSON`]);
  // A link to a valid copy of the file is refused, as the records are: the judgments are read through no link.
  fs.rmSync(judgmentsFile);
  const linked = path.join(project.folder, 'linked-judgments.json');
  fs.writeFileSync(linked, bytes);
  fs.symlinkSync(linked, judgmentsFile);
  checkImportRefused(project, 'judgments reached through a link', 10, [`records/${JUDGMENTS_NAME} is not a regular file`]);
  fs.rmSync(judgmentsFile);
  fs.rmSync(linked);
  fs.writeFileSync(judgmentsFile, bytes);

  // After every refusal the original bytes verify again.
  const again = evaluate(['run', '--evaluation', project.folder], project.env);
  check(again.status === 0, `the restored harness files no longer import: exit ${again.status}\n${again.output}`);
}

/** The reference's worked scorer input is the observation the runtime derives, so the page cannot drift from the verification. */
function checkImportedCalibrationReferenceExample() {
  const page = fs.readFileSync(path.join(PROJECT_ROOT, 'docs', 'reference', 'tea-evaluate-cli.md'), 'utf8');
  const [, example] = /the response `Response at level 1` is the observation `(\{.*?\})`\./s.exec(page) ?? [];
  check(example !== undefined, 'the reference has no worked scorer input for a stdout criterion');
  if (example === undefined) return;
  const criterion = { evidence: '/interactions/judge-run/stdout' };
  const contract = readJson(path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'mutation', 'evals', 'verdict', 'contract.json'));
  const derived = calibrationObservation({
    criterion,
    response: 'Response at level 1',
    ...calibrationStepPair(contract, criterion),
  });
  check(
    derived.interfaceId === 'verdict' && derived.operationId === 'judge-request',
    `the verdict contract's plan gives step judge-run the operation ${derived.operationId} on interface ${derived.interfaceId}`,
  );
  check(
    canonical(JSON.parse(example)) === canonical(derived),
    `the reference's scorer input is ${example}; the runtime derives ${JSON.stringify(derived)}`,
  );
}

async function checkImportedCalibrationBelowMinimum() {
  // The harness judges two labelled items against one anchor, so one of the two agrees: 0.5 under a 0.9 minimum.
  const project = await harnessProject('records-rubric-half', { half: true });
  if (project === null) return;
  useRecords(project, { minimum: 0.9 });
  const before = runNames(project.folder);
  const ran = evaluate(['run', '--evaluation', project.folder], project.env);
  check(ran.status === 11, `imported rubric scores below the minimum exited ${ran.status}; expected 11\n${ran.output}`);
  const created = runNames(project.folder).filter((name) => !before.includes(name));
  check(created.length === 1, `the run below the minimum left ${created.length} run directories; expected 1`);
  if (created.length !== 1) return;
  const directory = path.join(project.folder, 'runs', created[0]);
  const reportFile = path.join(directory, 'judge-calibration.json');
  check(fs.existsSync(reportFile), 'the run below the minimum wrote no judge-calibration.json');
  if (!fs.existsSync(reportFile)) return;
  const report = readJson(reportFile);
  check(
    report.minimumAgreement === 0.9 &&
      report.criteria[0].agreement === 0.5 &&
      report.criteria[0].largestLevelDistance === 1 &&
      JSON.stringify(report.criteria[0].items.map((item) => [item.expectedLevel, item.actualLevel, item.levelDistance])) ===
        '[[1,2,1],[2,2,0]]',
    `the report below the minimum is ${JSON.stringify(report)}`,
  );
  check(recordFiles(directory).length === 0, 'the run below the minimum copied a record');
  check(
    !fs.existsSync(path.join(directory, 'trial-sets')) &&
      !fs.existsSync(path.join(directory, 'trial-sets.json')) &&
      !fs.existsSync(path.join(directory, 'evaluator-configuration.json')),
    'the run below the minimum copied the harness files',
  );
}

async function checkImportedCalibrationChangesScoringVersion() {
  // A changed labelled item and a changed minimum each give the harness another configuration, and score under another version.
  const variants = [
    { label: 'base', edit: () => {} },
    {
      label: 'item',
      edit: (folder) =>
        editJson(
          path.join(folder, 'policy', 'judge-calibration.json'),
          (value) => (value.items[2].response = 'calibration example at level 3, reworded'),
        ),
    },
    {
      label: 'minimum',
      edit: (folder) =>
        editJson(path.join(folder, 'evaluation.json'), (evaluation) => (evaluation.judgeCalibration.minimumAgreement = 0.8)),
    },
  ];
  const seen = [];
  for (const { label, edit } of variants) {
    const project = await harnessProject(`records-version-${label}`, { edit });
    if (project === null) return;
    useRecords(project);
    const ran = evaluate(['run', '--evaluation', project.folder], project.env);
    check(ran.status === 0, `${label}: the records run exited ${ran.status}\n${ran.output}`);
    const runDirectory = runDirectoryOf(project.folder);
    if (ran.status !== 0 || runDirectory === null) return;
    const { evidence } = scoreRun(project, `the ${label} records run`);
    seen.push({ label, ...scoredCalibration(runDirectory, evidence) });
  }
  for (const [at, left] of seen.entries())
    for (const right of seen.slice(at + 1)) {
      check(left.digest !== right.digest, `the ${left.label} and ${right.label} configurations share the digest ${left.digest}`);
      check(
        typeof left.version === 'string' && left.version !== right.version,
        `the ${left.label} and ${right.label} runs share the scoring version ${left.version}`,
      );
    }
  check(
    seen.every((entry) => /^sha256:[0-9a-f]{64}$/.test(entry.bound[0]) && typeof entry.bound[1] === 'number') &&
      seen[0].bound[0] !== seen[1].bound[0] &&
      seen[0].bound[0] === seen[2].bound[0] &&
      seen[0].bound[1] === 1 &&
      seen[2].bound[1] === 0.8,
    `the bindings across the variants are ${JSON.stringify(seen.map((entry) => entry.bound))}`,
  );
}

// ------------------------------------------------- the calibration inputs a harness copies (Story 1.67)

/** Every path under `directory` (links not followed) with a hash of what it holds and its modification time, so a write, a rewrite or a removal shows. */
function snapshotOf(directory) {
  const entries = {};
  const walk = (current) => {
    for (const name of fs.readdirSync(current).sort()) {
      const file = path.join(current, name);
      const stats = fs.lstatSync(file);
      const relative = path.relative(directory, file);
      // The modification time is part of what a write leaves, so a rewrite of the same bytes shows as well.
      if (stats.isDirectory()) {
        entries[relative] = `directory ${stats.mtimeMs}`;
        walk(file);
      } else
        entries[relative] = stats.isSymbolicLink()
          ? `link to ${fs.readlinkSync(file)}`
          : `${sha256(fs.readFileSync(file))} ${stats.mtimeMs}`;
    }
  };
  walk(directory);
  return entries;
}

/** The observation the runtime hands a scorer for a stdout or stderr response, written out in full and derived from nothing in the runtime. */
function literalObservation(channel, response, operationId = 'judge-request') {
  return {
    observationId: 'calibration',
    sequence: 1,
    interfaceId: 'verdict',
    operationId,
    provenance: 'evaluator-chosen',
    principal: null,
    callInputs: {
      path: null,
      query: null,
      header: null,
      body: null,
      bodyEncoding: null,
      argument: null,
      option: null,
      environment: null,
      stdin: null,
      arguments: null,
    },
    responseBody: null,
    responseHeaders: null,
    responseStatus: null,
    stdout: channel === 'stdout' ? { kind: 'text', value: response } : { kind: 'absent' },
    stderr: channel === 'stderr' ? { kind: 'text', value: response } : { kind: 'absent' },
    exitCode: null,
    artifacts: {},
  };
}

/** Asks for the calibration inputs of the project's folder; the parsed document is `inputs` when the command printed one. */
function askForInputs(project, args = []) {
  const asked = evaluate(['digest', '--evaluation', project.folder, '--calibration-inputs', ...args], project.env);
  let inputs;
  try {
    inputs = JSON.parse(asked.stdout);
  } catch {
    inputs = undefined;
  }
  return { ...asked, inputs };
}

/** The ask is refused with exit 10 and one finding under the judge-calibration rule that names `file` and says each of `says`; the folder is left as it was. */
function checkInputsRefused(project, what, file, says) {
  const before = snapshotOf(project.folder);
  const asked = askForInputs(project);
  check(asked.status === 10, `${what}: the ask exited ${asked.status}; expected 10\n${asked.output}`);
  check(asked.inputs === undefined, `${what}: the refused ask printed a document\n${asked.stdout}`);
  const lines = asked.stdout.split('\n').filter((line) => line.length > 0);
  check(
    lines.length > 0 && lines.every((line) => line.startsWith(`${file}: [judge-calibration] `)),
    `${what}: the findings are not all ${file}: [judge-calibration] lines\n${asked.stdout}`,
  );
  for (const text of says) check(asked.stdout.includes(text), `${what}: the output does not say ${JSON.stringify(text)}\n${asked.stdout}`);
  check(canonical(snapshotOf(project.folder)) === canonical(before), `${what}: the refused ask changed the evaluation folder`);
}

/** Runs `body` with `file` edited, and puts its bytes back. */
function withBytes(file, edit, body) {
  const bytes = fs.readFileSync(file);
  try {
    edit(file);
    body();
  } finally {
    // The edit may have put a link in the file's place; writing through it would change its target.
    fs.rmSync(file, { force: true });
    fs.writeFileSync(file, bytes);
  }
}

/**
 * The harness binds its calibration after it asks, so a record or isolation manifest sealed against the configuration as it
 * stood names another `evaluatorConfigurationDigest` than the one `run` computes, and `score` refuses it (exit 3) after `check`
 * and `run` exited 0. `run` holds each imported file to the imported configuration's digest instead (exit 10, nothing copied).
 */
async function checkImportedFilesSealedAgainstTheConfiguration() {
  const project = await harnessProject('records-sealed-against');
  if (project === null) return;
  const records = path.join(project.folder, 'records');
  const configurationFile = path.join(records, 'evaluator-configuration.json');
  const engine = await loadEngine();
  // The binding changes after the records were sealed: the minimum moves with evaluation.json, so check and calibration still hold.
  useRecords(project, { minimum: 0.5 });
  const checked = evaluate(['check', '--evaluation', project.folder], project.env);
  check(
    checked.status === 0,
    `check over records sealed against another configuration exited ${checked.status}; expected 0\n${checked.output}`,
  );
  const sealedAgainst = readJson(path.join(records, 'P-001', 'record-1.json')).evaluatorConfigurationDigest;
  const finalDigest = engine.digestArtifact(readJson(configurationFile), 'EvaluatorConfiguration');
  check(sealedAgainst !== finalDigest, 'the rebound configuration digests to the one the records name');
  const files = ['P-001', 'P-002'].flatMap((probeId) =>
    fs
      .readdirSync(path.join(records, probeId))
      .filter((name) => name.endsWith('.json'))
      .map((name) => path.join(records, probeId, name)),
  );
  checkImportRefused(project, 'records sealed against an earlier configuration', 10, [
    'evaluatorConfigurationDigest',
    sealedAgainst,
    finalDigest,
    'sealed against another configuration',
    'records/P-001/record-1.json carries evaluatorConfigurationDigest',
  ]);
  // Every record of a set is held, not its first alone: one later record is left behind, with every manifest and record before it fixed.
  const laterRecord = path.join(records, 'P-002', 'record-3.json');
  const manifest = path.join(records, 'P-002', 'isolation-manifest.json');
  check(files.includes(laterRecord) && files.includes(manifest), 'the second probe holds no third record or no isolation manifest');
  const staleManifest = fs.readFileSync(manifest);
  for (const file of files.filter((candidate) => candidate !== laterRecord))
    editJson(file, (value) => (value.evaluatorConfigurationDigest = finalDigest));
  checkImportRefused(project, 'a later record of the second probe sealed against an earlier configuration', 10, [
    'records/P-002/record-3.json carries evaluatorConfigurationDigest',
    sealedAgainst,
    finalDigest,
  ]);
  // Every record fixed leaves an isolation manifest behind: the manifests are held too.
  editJson(laterRecord, (record) => (record.evaluatorConfigurationDigest = finalDigest));
  fs.writeFileSync(manifest, staleManifest);
  checkImportRefused(project, 'an isolation manifest sealed against an earlier configuration', 10, [
    'records/P-002/isolation-manifest.json carries evaluatorConfigurationDigest',
    sealedAgainst,
    finalDigest,
  ]);
  // Every file sealed against the final configuration imports, and score accepts it.
  editJson(manifest, (value) => (value.evaluatorConfigurationDigest = finalDigest));
  commitAll(project.repository, project.folder, 'the records sealed against the final configuration');
  const before = runNames(project.folder);
  const ran = evaluate(['run', '--evaluation', project.folder], project.env);
  check(ran.status === 0, `run over records sealed against the final configuration exited ${ran.status}\n${ran.output}`);
  if (ran.status !== 0) return;
  if (runNames(project.folder).every((name) => before.includes(name)))
    return check(false, 'the records run exited 0 and left no run directory of its own');
  const { evidence } = scoreRun(project, 'records sealed against the final configuration');
  checkVotes('records sealed against the final configuration', evidence, 'P-001', 'passed-clean-control');
  checkVotes('records sealed against the final configuration', evidence, 'P-002', 'caught');
}

/** The reference, the CLI header and the command's own help all describe the option, so the page cannot drop it unseen. */
function checkCalibrationInputsDocumented() {
  const page = fs.readFileSync(path.join(PROJECT_ROOT, 'docs', 'reference', 'tea-evaluate-cli.md'), 'utf8');
  for (const text of [
    'npx tea-evaluate digest --evaluation evals/my-evaluation --calibration-inputs',
    '`calibrationDigest`',
    '`scorerConfigurationDigest`',
    'bind `tea.judgeCalibrationDigest` in the configuration to its `calibrationDigest`',
  ])
    check(page.includes(text), `the reference does not say ${JSON.stringify(text)}`);
  const header = fs.readFileSync(EVALUATE, 'utf8').split("'use strict';")[0];
  check(
    header.includes('tea-evaluate digest --evaluation <path> [--calibration-inputs]'),
    "cli/evaluate.js's header does not list the option",
  );
  const help = evaluate(['digest', '--help']);
  check(help.status === 0 && help.stdout.includes('--calibration-inputs'), `digest --help does not list the option\n${help.output}`);
}

async function checkCalibrationInputs() {
  const project = await harnessProject('records-inputs');
  if (project === null) return;
  const records = path.join(project.folder, 'records');
  const configurationFile = path.join(records, 'evaluator-configuration.json');
  const judgmentsFile = path.join(records, JUDGMENTS_NAME);
  const engine = await loadEngine();

  // The harness writes its configuration first, with no bindings, and asks; the judgments file is written from the answer alone.
  const handBuilt = readJson(judgmentsFile);
  const bound = readJson(configurationFile);
  const unbound = scorerConfigurationOf(bound);
  writeJson(configurationFile, unbound);
  fs.rmSync(judgmentsFile);
  editJson(path.join(project.folder, 'evaluation.json'), (evaluation) => (evaluation.evaluator = { kind: 'records', records: 'records' }));
  const before = snapshotOf(project.folder);
  const asked = askForInputs(project);
  check(asked.status === 0, `the ask exited ${asked.status}; expected 0\n${asked.output}`);
  if (asked.inputs === undefined) return check(false, `the ask printed no JSON document\n${asked.stdout}`);
  const { inputs } = asked;
  check(canonical(snapshotOf(project.folder)) === canonical(before), 'the ask changed the evaluation folder');
  // --evaluation names the folder or its evaluation.json alike.
  const named = evaluate(['digest', '--evaluation', path.join(project.folder, 'evaluation.json'), '--calibration-inputs'], project.env);
  check(
    named.status === 0 && named.stdout === asked.stdout,
    `the ask naming evaluation.json exited ${named.status}; expected the folder's answer`,
  );
  check(
    canonical(Object.keys(inputs).sort()) === canonical(['calibrationDigest', 'items', 'scorerConfigurationDigest']),
    `the document holds ${Object.keys(inputs)}; expected calibrationDigest, items and scorerConfigurationDigest only`,
  );
  check(!asked.stdout.includes('expectedLevel'), 'the output carries the label expectedLevel');
  check(
    inputs.items.every((item) => canonical(Object.keys(item).sort()) === canonical(['criterionId', 'rubricId', 'scorerInput'])),
    `an item holds more or less than rubricId, criterionId and scorerInput: ${JSON.stringify(inputs.items.map(Object.keys))}`,
  );
  check(
    inputs.calibrationDigest === sha256(fs.readFileSync(path.join(project.folder, 'policy', 'judge-calibration.json'))),
    `calibrationDigest is ${inputs.calibrationDigest}, not the digest of the labelled file's bytes`,
  );
  check(
    inputs.scorerConfigurationDigest === engine.digestArtifact(unbound, 'EvaluatorConfiguration') &&
      inputs.scorerConfigurationDigest === handBuilt.scorerConfigurationDigest,
    `scorerConfigurationDigest is ${inputs.scorerConfigurationDigest}; expected ${handBuilt.scorerConfigurationDigest}`,
  );

  // A hand-built literal, derived from nothing in the runtime, is what each scorerInput must be (a changed derivation fails here).
  const labelled = readJson(path.join(project.folder, 'policy', 'judge-calibration.json')).items;
  check(
    canonical(inputs.items) ===
      canonical(
        labelled.map((item) => ({
          rubricId: item.rubricId,
          criterionId: item.criterionId,
          scorerInput: literalObservation('stdout', item.response),
        })),
      ),
    `the emitted items are ${JSON.stringify(inputs.items)}; expected the literal observations of the labelled responses`,
  );
  check(
    canonical(inputs.items.map((item) => item.scorerInput)) === canonical(handBuilt.items.map((item) => item.scorerInput)),
    'the emitted scorer inputs differ from the ones the harness fixture derived by hand',
  );

  // The configuration carrying the bindings digests as it does without them.
  writeJson(configurationFile, bound);
  const withBindings = askForInputs(project);
  check(
    withBindings.status === 0 &&
      withBindings.inputs?.scorerConfigurationDigest === inputs.scorerConfigurationDigest &&
      withBindings.inputs?.calibrationDigest === inputs.calibrationDigest,
    `a configuration with its bindings asks ${withBindings.stdout}; expected the same digests`,
  );

  // The harness copies the values, answers, and binds the labelled file's digest: `check` accepts it, and `run` imports and scores it.
  writeJson(judgmentsFile, {
    schemaVersion: 1,
    scorerConfigurationDigest: inputs.scorerConfigurationDigest,
    items: inputs.items.map((item) => ({ ...item, answer: harnessScore(item.scorerInput) })),
  });
  writeJson(configurationFile, {
    ...unbound,
    decodingParameters: { ...unbound.decodingParameters, [DIGEST_BINDING]: inputs.calibrationDigest, [MINIMUM_BINDING]: 1 },
  });
  useRecords(project);
  const checked = evaluate(['check', '--evaluation', project.folder], project.env);
  check(checked.status === 0, `check over judgments built from the emitted inputs exited ${checked.status}\n${checked.output}`);
  const ran = evaluate(['run', '--evaluation', project.folder], project.env);
  check(ran.status === 0, `run over judgments built from the emitted inputs exited ${ran.status}\n${ran.output}`);
  const runDirectory = runDirectoryOf(project.folder);
  if (ran.status === 0 && (runDirectory === null || runDirectory === project.harnessRun))
    check(false, 'the records run exited 0 and left no run directory of its own');
  if (ran.status !== 0 || runDirectory === null || runDirectory === project.harnessRun) return;
  check(fs.existsSync(path.join(runDirectory, 'judge-calibration.json')), 'the run wrote no judge-calibration.json');
  const { evidence } = scoreRun(project, 'a records run over the emitted inputs');
  checkVotes('a records run over the emitted inputs', evidence, 'P-001', 'passed-clean-control');
  checkVotes('a records run over the emitted inputs', evidence, 'P-002', 'caught');

  // The ask names an evaluation, and says so when it does not.
  const unnamed = evaluate(['digest', '--calibration-inputs']);
  check(
    unnamed.status === 64 && unnamed.stdout === '',
    `the ask with no --evaluation exited ${unnamed.status}; expected 64\n${unnamed.output}`,
  );
  checkInputsRefusals(project);
  checkInputsKeepTheLabelledOrder(project);
}

function checkInputsRefusals(project) {
  const records = path.join(project.folder, 'records');
  const evaluationFile = path.join(project.folder, 'evaluation.json');
  const labelledFile = path.join(project.folder, 'policy', 'judge-calibration.json');
  const configurationFile = path.join(records, 'evaluator-configuration.json');
  const contractFile = path.join(project.folder, 'contract.json');
  const ok = askForInputs(project);
  check(ok.status === 0 && ok.inputs !== undefined, `the restored harness project asks with exit ${ok.status}; expected 0\n${ok.output}`);

  // Only a records evaluator has judgments to supply.
  for (const [kind, evaluator] of [
    ['deterministic', { kind: 'deterministic' }],
    ['command', { kind: 'command', command: 'evaluator/rows.js', args: [], timeoutMs: 60_000 }],
    ['sealed-brief-agent', { kind: 'sealed-brief-agent', agent: 'claude', timeoutMs: 30_000 }],
  ])
    withBytes(
      evaluationFile,
      () => editJson(evaluationFile, (evaluation) => (evaluation.evaluator = evaluator)),
      () => checkInputsRefused(project, `a ${kind} evaluator`, 'evaluation.json', [`evaluator is ${kind}`]),
    );
  withBytes(
    evaluationFile,
    () => editJson(evaluationFile, (evaluation) => delete evaluation.evaluator),
    () => checkInputsRefused(project, 'an evaluation naming no evaluator', 'evaluation.json', ['evaluator is deterministic']),
  );
  withBytes(
    evaluationFile,
    () => editJson(evaluationFile, (evaluation) => (evaluation.evaluator = 'records')),
    () => checkInputsRefused(project, 'an evaluator that is a string', 'evaluation.json', ['evaluator is "records"']),
  );
  withBytes(
    evaluationFile,
    () => editJson(evaluationFile, (evaluation) => (evaluation.evaluator = { kind: 'records', records: 'nowhere' })),
    () => checkInputsRefused(project, 'a records directory that is absent', 'evaluation.json', ['"nowhere"', 'not a directory']),
  );
  // A records directory reached through a link, one level down or at the top, is not the folder's own.
  const outside = path.join(project.directory, 'outside-records');
  fs.cpSync(records, outside, { recursive: true });
  fs.mkdirSync(path.join(project.folder, 'nested'));
  fs.symlinkSync(outside, path.join(project.folder, 'linked-records'));
  fs.symlinkSync(outside, path.join(project.folder, 'nested', 'records'));
  for (const [what, named] of [
    ['a records directory that is a link', 'linked-records'],
    ['a records directory under a link', 'linked-records/records'],
    ['a records directory that is a nested link', 'nested/records'],
  ])
    withBytes(
      evaluationFile,
      () => editJson(evaluationFile, (evaluation) => (evaluation.evaluator = { kind: 'records', records: named })),
      () => checkInputsRefused(project, what, 'evaluation.json', ['reached through no link']),
    );
  fs.rmSync(path.join(project.folder, 'linked-records'));
  fs.rmSync(path.join(project.folder, 'nested'), { recursive: true });
  // The evaluation schema's rule: no empty, "." or ".." segment, so a path out of the folder (or the folder itself) is no records directory.
  for (const [what, named] of [
    ['a records directory outside the folder', '../../../outside-records'],
    ['a records directory spelled with a parent segment', 'records/../records'],
    ['a records directory spelled empty', ''],
    ['a records directory spelled as the folder', '.'],
    ['a records directory with an empty segment', 'records//'],
  ])
    withBytes(
      evaluationFile,
      () => editJson(evaluationFile, (evaluation) => (evaluation.evaluator = { kind: 'records', records: named })),
      () => checkInputsRefused(project, what, 'evaluation.json', ['reached through no link']),
    );
  withBytes(
    evaluationFile,
    () => fs.writeFileSync(evaluationFile, '[]'),
    () => checkInputsRefused(project, 'an evaluation.json that is no object', 'evaluation.json', ['it is not a JSON object']),
  );

  // A contract with no rubric has nothing to calibrate.
  withBytes(
    contractFile,
    () => editJson(contractFile, (contract) => (contract.rubrics = [])),
    () => checkInputsRefused(project, 'a contract with no rubric', 'contract.json', ['declares no rubric']),
  );

  withBytes(
    contractFile,
    () => fs.writeFileSync(contractFile, 'not json'),
    () => checkInputsRefused(project, 'a contract that is not JSON', 'contract.json', ['cannot be read as JSON']),
  );

  // The labelled file must be one `check` and `run` accept.
  withBytes(
    labelledFile,
    () => fs.rmSync(labelledFile),
    () => checkInputsRefused(project, 'an absent labelled file', 'policy/judge-calibration.json', ['is required']),
  );
  withBytes(
    labelledFile,
    () => fs.writeFileSync(labelledFile, 'not json'),
    () => checkInputsRefused(project, 'a labelled file that is not JSON', 'policy/judge-calibration.json', ['cannot be read']),
  );
  withBytes(
    labelledFile,
    () => editJson(labelledFile, (labelled) => labelled.items.pop()),
    () =>
      checkInputsRefused(project, 'a labelled file that leaves a level uncovered', 'policy/judge-calibration.json', [
        'R-101/RC-101 has no calibration item labelled at anchored level 3',
      ]),
  );
  withBytes(
    labelledFile,
    () => editJson(labelledFile, (labelled) => (labelled.items[0].criterionId = 'RC-999')),
    () =>
      checkInputsRefused(project, 'a label naming an unknown criterion', 'policy/judge-calibration.json', [
        'unknown rubric criterion R-101/RC-999',
      ]),
  );
  withBytes(
    labelledFile,
    () => editJson(labelledFile, (labelled) => (labelled.items[0].expectedLevel = 9)),
    () => checkInputsRefused(project, 'a label off the scale', 'policy/judge-calibration.json', ['expectedLevel 9']),
  );
  withBytes(
    labelledFile,
    () =>
      editJson(labelledFile, (labelled) => {
        labelled.items.pop();
        labelled.items[0].expectedLevel = 9;
      }),
    () =>
      checkInputsRefused(project, 'a labelled file with two faults', 'policy/judge-calibration.json', [
        'expectedLevel 9',
        'R-101/RC-101 has no calibration item labelled at anchored level 3',
      ]),
  );
  const labelledTarget = path.join(project.folder, 'linked-labelled.json');
  fs.copyFileSync(labelledFile, labelledTarget);
  withBytes(
    labelledFile,
    () => {
      fs.rmSync(labelledFile);
      fs.symlinkSync(labelledTarget, labelledFile);
    },
    () =>
      checkInputsRefused(project, 'a labelled file reached through a link', 'policy/judge-calibration.json', ['regular in-folder file']),
  );
  fs.rmSync(labelledTarget);

  // The configuration is read as `check` reads it: a regular file, no link, JSON, an EvaluatorConfiguration.
  withBytes(
    configurationFile,
    () => fs.rmSync(configurationFile),
    () => checkInputsRefused(project, 'an absent configuration', 'records/evaluator-configuration.json', ['cannot be read as JSON']),
  );
  withBytes(
    configurationFile,
    () => fs.writeFileSync(configurationFile, 'not json'),
    () =>
      checkInputsRefused(project, 'a configuration that is not JSON', 'records/evaluator-configuration.json', ['cannot be read as JSON']),
  );
  const target = path.join(project.folder, 'linked-configuration.json');
  fs.copyFileSync(configurationFile, target);
  withBytes(
    configurationFile,
    () => {
      fs.rmSync(configurationFile);
      fs.symlinkSync(target, configurationFile);
    },
    () =>
      checkInputsRefused(project, 'a configuration reached through a link', 'records/evaluator-configuration.json', [
        'it is not a regular file',
      ]),
  );
  fs.rmSync(target);
  withBytes(
    configurationFile,
    () => writeJson(configurationFile, { not: 'an EvaluatorConfiguration' }),
    () =>
      checkInputsRefused(project, 'a configuration that is no EvaluatorConfiguration', 'records/evaluator-configuration.json', [
        "does not meet eval-quality's evaluator-configuration schema",
      ]),
  );

  // After every refusal the original files ask again.
  const again = askForInputs(project);
  check(
    again.status === 0 && canonical(again.inputs) === canonical(ok.inputs),
    `the restored project asks ${again.status} ${again.stdout}; expected the first answer`,
  );
}

/** Two rubrics, two interaction steps, a criterion id both rubrics use and a json item, the labelled file in compact bytes. */
function checkInputsKeepTheLabelledOrder(project) {
  const second = {
    ...RUBRIC,
    id: 'R-102',
    scaleLevels: RUBRIC.scaleLevels.slice(0, 2),
    criteria: [
      { id: 'RC-101', text: 'Is the first reading right?', evidence: '/interactions/judge-run/stderr' },
      { id: 'RC-202', text: 'Is the review reading right?', evidence: '/interactions/review-run/stdout' },
    ],
  };
  const item = (rubricId, criterionId, expectedLevel, response, responseKind) => ({
    rubricId,
    criterionId,
    response,
    ...(responseKind === undefined ? {} : { responseKind }),
    expectedLevel,
  });
  const order = [
    item('R-102', 'RC-202', 2, '{"reading":2}', 'json'),
    item('R-101', 'RC-101', 3, 'first three'),
    item('R-102', 'RC-101', 1, 'third one'),
    item('R-101', 'RC-101', 1, 'fourth one'),
    item('R-102', 'RC-202', 1, 'fifth one'),
    item('R-102', 'RC-101', 2, 'sixth two'),
    item('R-101', 'RC-101', 2, 'seventh two'),
  ];
  const expected = (labelled) => {
    if (labelled.rubricId === 'R-101') return literalObservation('stdout', labelled.response);
    if (labelled.criterionId === 'RC-101') return literalObservation('stderr', labelled.response);
    const observation = literalObservation('stdout', labelled.response, 'review-request');
    if (labelled.responseKind === 'json') observation.stdout = { kind: 'json', value: JSON.parse(labelled.response) };
    return observation;
  };
  const contractFile = path.join(project.folder, 'contract.json');
  const labelledFile = path.join(project.folder, 'policy', 'judge-calibration.json');
  withBytes(
    contractFile,
    () =>
      editJson(contractFile, (contract) => {
        contract.rubrics.push(second);
        contract.interactionPlan.push({
          ...contract.interactionPlan[0],
          stepId: 'review-run',
          operationId: 'review-request',
          after: 'judge-run',
        });
      }),
    () =>
      withBytes(
        labelledFile,
        () => fs.writeFileSync(labelledFile, JSON.stringify({ items: order })),
        () => {
          const asked = askForInputs(project);
          check(asked.status === 0 && asked.inputs !== undefined, `the ask over two rubrics exited ${asked.status}\n${asked.output}`);
          if (asked.inputs === undefined) return;
          check(
            asked.inputs.calibrationDigest === sha256(fs.readFileSync(labelledFile)),
            'calibrationDigest over compact labelled bytes is not the digest of those bytes',
          );
          check(
            canonical(asked.inputs.items) ===
              canonical(
                order.map((labelled) => ({
                  rubricId: labelled.rubricId,
                  criterionId: labelled.criterionId,
                  scorerInput: expected(labelled),
                })),
              ),
            `the items are ${JSON.stringify(asked.inputs.items)}`,
          );
        },
      ),
  );
}

// ------------------------------------------------------------------------- units

async function checkUnits() {
  const contract = readJson(path.join(FIXTURE, EVALUATION, 'contract.json'));
  contract.behaviors.push({ ...contract.behaviors[0], id: 'B-002', oracles: ['O-002'] });
  contract.oracles.push({ ...contract.oracles[0], id: 'O-002' });
  const mapping = {
    schemaVersion: 1,
    keys: { accepted: { oracleId: 'O-001', behaviorId: 'B-001' }, answered: { oracleId: 'O-002', behaviorId: 'B-002' } },
  };
  check(
    mappingContractProblems(mapping, contract).length === 0,
    `the unit mapping has problems: ${mappingContractProblems(mapping, contract)}`,
  );
  const validate = rowsValidator(mapping);
  const fail = (key) => ({
    key,
    outcome: 'fail',
    observationIds: ['o-1'],
    quote: 'q',
    quoteChannel: 'stdout',
    confidence: 0.5,
    comment: 'c',
  });
  const answer = readAnswer({ text: JSON.stringify({ rows: [fail('accepted'), fail('answered')] }), mapping, validate });
  // A fail row files a finding only against a probe that discharges its behavior; its disposition is violated either way.
  const judged = judgmentFromRows({ contract, mapping, answer, probeId: 'P-002', behaviorIds: ['B-001'] });
  check(
    JSON.stringify(judged.findings.map((finding) => finding.oracleId)) === '["O-001"]' &&
      JSON.stringify(judged.oracleDispositions.map((entry) => entry.disposition)) === '["violated","violated"]',
    `a fail row on another behavior's oracle converts to ${JSON.stringify(judged)}`,
  );
  // The row schema refuses each shape outside the import contract.
  const pass = { key: 'accepted', outcome: 'pass', observationIds: ['o-1'] };
  for (const [what, row] of [
    ['a row citing no observation', { ...pass, observationIds: [] }],
    ['a fail row with no comment', { ...fail('accepted'), comment: undefined }],
    ['a fail row with no confidence', { ...fail('accepted'), confidence: undefined }],
    ['an artifactId off the artifact channel', { ...fail('accepted'), artifactId: 'report' }],
    ['a score row with no score', { key: 'accepted', outcome: 'score', observationIds: ['o-1'] }],
    ['a pass row carrying a score', { ...pass, score: 1 }],
    ['a quote with no channel', { ...pass, quote: 'q' }],
  ]) {
    check(
      validate({ rows: [Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined))] }).length > 0,
      `the row schema admits ${what}`,
    );
  }
  // An oracle two behaviors declare is answered by one key, and its finding follows the probe under trial: the first of
  // the probe's behaviors that declares it, whichever behavior the key is described under (judgeTrial's rule).
  const shared = structuredClone(contract);
  shared.behaviors.push({ ...contract.behaviors[0], id: 'B-003', severity: 'minor', oracles: ['O-001'] });
  const sharedFinding = (behaviorIds) =>
    judgmentFromRows({ contract: shared, mapping, answer: { rows: [fail('accepted')] }, probeId: 'P-003', behaviorIds }).findings.map(
      (finding) => [finding.behaviorId, finding.severity],
    );
  check(
    JSON.stringify(sharedFinding(['B-003'])) === '[["B-003","minor"]]' &&
      JSON.stringify(sharedFinding(['B-002', 'B-003', 'B-001'])) === '[["B-003","minor"]]' &&
      JSON.stringify(sharedFinding(['B-002'])) === '[]',
    `a fail row on an oracle two behaviors declare files ${JSON.stringify([sharedFinding(['B-003']), sharedFinding(['B-002', 'B-003', 'B-001']), sharedFinding(['B-002'])])}`,
  );
  // A string holding a lone surrogate cannot reach a record, so the answer is refused.
  let surrogate = null;
  try {
    readAnswer({
      text: String.raw`{"rows":[{"key":"accepted","outcome":"pass","observationIds":["o-1"],"comment":"a lone \ud800 surrogate"}]}`,
      mapping,
      validate,
    });
  } catch (error) {
    surrogate = error;
  }
  check(
    surrogate instanceof EvaluatorError && surrogate.message.includes('at /rows/0/comment that is not well-formed Unicode'),
    `an answer with a lone surrogate was read as ${surrogate?.message ?? 'valid'}`,
  );
  // An oracle no row answers is not attempted; a trial with a mapped oracle and no row is refused.
  const partial = judgmentFromRows({ contract, mapping, answer: { rows: [fail('accepted')] }, probeId: 'P-002', behaviorIds: ['B-001'] });
  check(partial.oracleDispositions[1].disposition === 'not-attempted', 'an oracle with no row is not not-attempted');
  let refused = null;
  try {
    readAnswer({ text: '{"rows":[]}', mapping, validate });
  } catch (error) {
    refused = error;
  }
  check(refused instanceof EvaluatorError, 'a trial with mapped oracles and no row is not refused');
  // A probe's recommendation follows its own findings: a fail row on another behavior leaves a probe of B-002 at PASS.
  const other = judgmentFromRows({ contract, mapping, answer: { rows: [fail('accepted')] }, probeId: 'P-001', behaviorIds: ['B-002'] });
  check(
    trialRecommendation({ rows: [fail('accepted')] }, judged) === 'FAIL' &&
      trialRecommendation({ rows: [fail('accepted')] }, other) === 'PASS' &&
      trialRecommendation({ rows: [], recommendation: 'CONCERNS' }, other) === 'CONCERNS',
    'the trial recommendation is wrong',
  );
  // Two findings in one record take two identifiers.
  const both = judgmentFromRows({ contract, mapping, answer, probeId: 'P-002', behaviorIds: ['B-001', 'B-002'] });
  check(
    JSON.stringify(both.findings.map((finding) => finding.findingId)) === '["F-001","F-002"]',
    `two findings in one record are ${JSON.stringify(both.findings.map((finding) => finding.findingId))}`,
  );
  // A bound rubric criterion no row scores becomes an unscored judge result.
  const withRubric = { ...contract, rubrics: [RUBRIC] };
  const rubricMapping = {
    schemaVersion: 1,
    keys: { ...mapping.keys, quality: { rubricId: 'R-101', criterionId: 'RC-101', levels: [1, 2, 3] } },
  };
  const unscored = judgmentFromRows({
    contract: withRubric,
    mapping: rubricMapping,
    answer: { rows: [fail('accepted')] },
    probeId: 'P-002',
    behaviorIds: ['B-001'],
  });
  check(
    unscored.judgeResults.length === 1 && unscored.judgeResults[0].score === null && unscored.judgeResults[0].note.includes('no score row'),
    `an unscored criterion converts to ${JSON.stringify(unscored.judgeResults)}`,
  );
  check(
    setRecommendationOf(['PASS', 'CONCERNS', 'PASS']) === 'CONCERNS' && setRecommendationOf(['PASS', 'FAIL', 'CONCERNS']) === 'FAIL',
    'the set recommendation is not the most severe',
  );

  // A command line read against the contract's operation and the registry.
  const evaluation = readJson(path.join(FIXTURE, EVALUATION, 'evaluation.json'));
  const registry = registryFromEvaluation(evaluation, { root: FIXTURE });
  const read = commandCall({
    contract,
    registry,
    interfaceId: 'verdict',
    input: { arguments: ['verdict'], stdin: 'Judge it.' },
  });
  check(
    read.operation?.operationId === 'judge-request' && JSON.stringify(read.callInputs.stdin) === '{"prompt":"Judge it."}',
    `a command line reads as ${JSON.stringify(read)}`,
  );
  // Standard input goes to the target as the agent wrote it; the record reads a JSON object from it.
  const spaced = '{ "prompt" :  "Judge it." }';
  const json = commandCall({ contract, registry, interfaceId: 'verdict', input: { arguments: ['verdict'], stdin: spaced } });
  check(
    JSON.stringify(json.channels.stdin) === JSON.stringify({ kind: 'text', value: spaced }) &&
      JSON.stringify(json.callInputs.stdin) === '{"prompt":"Judge it."}',
    `a JSON standard input reads as ${JSON.stringify([json.channels.stdin, json.callInputs.stdin])}`,
  );
  // A call its one operation's declared keys do not admit (an undeclared option, more positionals than keys) matches nothing.
  const outside = commandCall({ contract, registry, interfaceId: 'verdict', input: { arguments: ['verdict', '--help', 'a', 'b'] } });
  check(
    outside.operation === undefined &&
      outside.unmatched.includes('none of the 1 operation(s)') &&
      JSON.stringify(outside.channels.option) === '{"help":true}' &&
      JSON.stringify(outside.channels.argument) === '{"argument-1":"a","argument-2":"b"}',
    `a call outside its operation's shape reads as ${JSON.stringify(outside)}`,
  );
  // Words after -- are positional, an undeclared option takes its value only as --name=value, and of two
  // operations on one command the one whose declared keys admit the call is its match.
  const terminated = commandCall({
    contract,
    registry,
    interfaceId: 'verdict',
    input: { arguments: ['verdict', '--flag', '--', '--not-an-option'] },
  });
  check(
    JSON.stringify(terminated.channels.option) === '{"flag":true}' &&
      JSON.stringify(terminated.channels.argument) === '{"argument-1":"--not-an-option"}',
    `a command line with -- reads as ${JSON.stringify(terminated.channels)}`,
  );
  const twoOperations = structuredClone(contract);
  const [base] = twoOperations.permittedInterfaces[0].operations;
  twoOperations.permittedInterfaces[0].operations.push({
    ...structuredClone(base),
    operationId: 'judge-strictly',
    requestShape: {
      ...structuredClone(base.requestShape),
      option: { requiredKeys: ['strict'], permittedKeys: ['strict'], types: { strict: 'boolean' } },
    },
  });
  const strict = commandCall({ contract: twoOperations, registry, interfaceId: 'verdict', input: { arguments: ['verdict', '--strict'] } });
  const plain = commandCall({ contract: twoOperations, registry, interfaceId: 'verdict', input: { arguments: ['verdict'] } });
  check(
    strict.operation?.operationId === 'judge-strictly' && plain.operation === undefined && plain.unmatched.includes('several'),
    `two operations on one command match ${strict.operation?.operationId} and ${plain.operation?.operationId} (${plain.unmatched})`,
  );

  // The claude adapter's bridged run: no built-in tool, the bridge alone, no settings, no saved session.
  const bridgedArgv = AGENT_ADAPTERS.claude.buildBridgedArgv([], 'haiku', { name: 'tea-evaluate', configFile: '/private/config.json' });
  const after = (flag) => bridgedArgv[bridgedArgv.indexOf(flag) + 1];
  check(
    after('--tools') === '' &&
      after('--allowedTools') === 'mcp__tea-evaluate' &&
      after('--mcp-config') === '/private/config.json' &&
      bridgedArgv.includes('--strict-mcp-config') &&
      after('--setting-sources') === '' &&
      bridgedArgv.includes('--no-session-persistence') &&
      !bridgedArgv.includes('--safe-mode'),
    `claude's bridged argv is ${JSON.stringify(bridgedArgv)}`,
  );
  // The configuration file's bytes are the adapter's: the one stdio server under mcpServers, as --mcp-config reads it.
  const server = { name: 'tea-evaluate', command: '/bin/node', args: ['relay.js'], env: { TOKEN: 't' } };
  const configured = JSON.parse(AGENT_ADAPTERS.claude.buildBridgeConfig(server));
  check(
    JSON.stringify(configured) ===
      JSON.stringify({
        mcpServers: { 'tea-evaluate': { type: 'stdio', command: '/bin/node', args: ['relay.js'], env: { TOKEN: 't' } } },
      }) &&
      AGENT_ADAPTERS.custom.buildBridgeConfig(server) === AGENT_ADAPTERS.claude.buildBridgeConfig(server) &&
      AGENT_ADAPTERS.codex.buildBridgeConfig === undefined,
    `the bridged run's configuration is ${JSON.stringify(configured)}`,
  );
  check(
    JSON.stringify(bridgedArgsRefused('claude', ['--tools', 'default', '--add-dir=/', '--model', 'haiku'])) ===
      '["--tools","--add-dir=/"]' &&
      bridgedArgsRefused('custom', ['--anything']).length === 0 &&
      AGENT_ADAPTERS.codex.buildBridgedArgv === undefined,
    'the bridged run does not refuse the passthrough flags that reopen what it closes',
  );

  // Every kind's configuration names the kind; the wiring of a row-converting evaluator is a condition of the run.
  const engine = await loadEngine();
  const deterministic = configurationFields({
    layer: { evaluator: { kind: 'deterministic' } },
    conditions: null,
    judgeConfiguration: null,
    digestBytes: engine.digestBytes,
  });
  const commandFields = (args, frameworks = []) =>
    configurationFields({
      layer: { evaluator: { kind: 'command', command: 'evaluator/rows.js', args, timeoutMs: 1 }, treeDigest: 't', executableDigest: 'e' },
      conditions: { schemaVersion: 1, modelSnapshot: 'none', systemPromptDigest: 'd', evaluator: { modelSnapshot: 'a-grader' } },
      judgeConfiguration: null,
      digestBytes: engine.digestBytes,
      frameworks,
    }).decodingParameters;
  check(
    JSON.stringify(deterministic.decodingParameters) === '{"tea.evaluatorKind":"deterministic"}' &&
      JSON.stringify(commandFields(['--a'])) !== JSON.stringify(commandFields(['--b'])) &&
      commandFields([])['tea.evaluatorModelSnapshot'] === 'a-grader',
    'the evaluator configuration does not carry the kind, the wiring and the command model',
  );

  // Story 1.44: the evaluator tree and wiring held fixed, only the observed version of an installed framework changes the
  // configuration, so the configuration digest (and with it every record's digest and the scoring version) moves with it.
  const configurationDigestOf = (frameworks) => {
    const fields = configurationFields({
      layer: {
        evaluator: { kind: 'command', command: 'evaluator/rows.js', args: [], timeoutMs: 1 },
        treeDigest: 't',
        executableDigest: 'e',
      },
      conditions: null,
      judgeConfiguration: null,
      digestBytes: engine.digestBytes,
      frameworks,
    });
    return engine.digestArtifact(
      {
        schemaVersion: 1,
        evaluatorIdentity: fields.evaluatorIdentity,
        modelSnapshot: fields.modelSnapshot,
        systemPromptDigest: fields.systemPromptDigest,
        decodingParameters: fields.decodingParameters,
      },
      'EvaluatorConfiguration',
    );
  };
  const observedA = [{ package: 'probe-fw', version: '1.0.0' }];
  check(
    JSON.stringify(commandFields([], observedA)['tea.evaluatorFrameworks']) === JSON.stringify(observedA) &&
      JSON.stringify(commandFields([])['tea.evaluatorFrameworks']) === '[]' &&
      configurationDigestOf(observedA) === configurationDigestOf([{ package: 'probe-fw', version: '1.0.0', extra: 'ignored' }]) &&
      configurationDigestOf(observedA) !== configurationDigestOf([{ package: 'probe-fw', version: '1.0.1' }]) &&
      configurationDigestOf(observedA) !== configurationDigestOf([]),
    "the command evaluator's configuration does not move with the observed framework version alone",
  );
  const installA = [{ ...observedA[0], installSource: 'tree', installDigest: `sha256:${'a'.repeat(64)}` }];
  const installB = [{ ...observedA[0], installSource: 'tree', installDigest: `sha256:${'b'.repeat(64)}` }];
  check(
    configurationDigestOf(installA) !== configurationDigestOf(installB) &&
      commandFields([], installA)['tea.evaluatorFrameworks'][0].installDigest === installA[0].installDigest,
    'the command configuration did not bind the observed install digest',
  );
  let refusedMissing = null;
  try {
    configurationFields({
      layer: { evaluator: { kind: 'command', command: 'evaluator/rows.js', timeoutMs: 1 }, treeDigest: 't', executableDigest: 'e' },
      conditions: null,
      judgeConfiguration: null,
      digestBytes: engine.digestBytes,
    });
  } catch (error) {
    refusedMissing = error;
  }
  check(refusedMissing instanceof TypeError, 'a command evaluator configuration was built with no observed framework versions');

  // Story 1.34: a sealed-brief agent's qualification is a condition of its verdicts, so it moves the scoring version.
  const agentFields = (qualification, agentVersion = '1.0.0') =>
    configurationFields({
      layer: {
        evaluator: { kind: 'sealed-brief-agent', agent: 'custom', agentCommand: 'stub', timeoutMs: 1 },
        treeDigest: 't',
        mapping: { keys: {} },
      },
      conditions: { schemaVersion: 1, modelSnapshot: 'none', systemPromptDigest: 'd', evaluator: { modelSnapshot: 'an-agent' } },
      judgeConfiguration: null,
      digestBytes: engine.digestBytes,
      qualification,
      agentVersion,
    }).decodingParameters;
  const qualified = agentFields({ attempts: 2, minimumAgreement: 0.9 });
  check(
    qualified['tea.evaluatorAgentVersion'] === '1.0.0' &&
      JSON.stringify(qualified) !== JSON.stringify(agentFields({ attempts: 2, minimumAgreement: 0.9 }, '1.0.1')),
    'the sealed-brief configuration does not change with the observed adapter version alone',
  );
  const agentConfigurationDigest = (version) =>
    engine.digestArtifact(
      {
        schemaVersion: 1,
        evaluatorIdentity: 'sealed-brief-agent',
        modelSnapshot: 'an-agent',
        systemPromptDigest: 'fixed',
        decodingParameters: agentFields({ attempts: 2, minimumAgreement: 0.9 }, version),
      },
      'EvaluatorConfiguration',
    );
  check(
    agentConfigurationDigest('1.0.0') !== agentConfigurationDigest('1.0.1'),
    'the observed agent version alone left the configuration digest unchanged',
  );
  check(
    qualified['tea.evaluatorQualificationAttempts'] === 2 &&
      qualified['tea.evaluatorQualificationMinimumAgreement'] === 0.9 &&
      JSON.stringify(qualified) !== JSON.stringify(agentFields({ attempts: 3, minimumAgreement: 0.9 })) &&
      JSON.stringify(qualified) !== JSON.stringify(agentFields({ attempts: 2, minimumAgreement: 0.5 })),
    'the evaluator configuration does not carry the qualification, or it does not change with it',
  );
  check(
    [...Object.keys(deterministic.decodingParameters), ...Object.keys(commandFields([]))].every(
      (key) => !key.startsWith('tea.evaluatorQualification'),
    ),
    'a deterministic or command configuration carries a qualification',
  );
  check(
    Object.keys(deterministic.decodingParameters).every((key) => key !== 'tea.evaluatorFrameworks') &&
      Object.keys(agentFields(null)).every((key) => key !== 'tea.evaluatorFrameworks'),
    'a deterministic or sealed-brief agent configuration carries installed framework versions',
  );

  // Output past the cap ends the command, and what is kept is a faithful prefix of the stream, never more.
  const flooded = await runSupervised({
    command: process.execPath,
    args: ['-e', 'process.stdout.write(Buffer.alloc(70 * 1024 * 1024, 97)); setInterval(() => {}, 1000);'],
    cwd: PROJECT_ROOT,
    env: { PATH: process.env.PATH },
    timeout: 60_000,
  });
  check(
    String(flooded.outcome.failure).includes('passed') &&
      flooded.stdout.length === 64 * 1024 * 1024 &&
      /^a+$/.test(flooded.stdout.slice(-16)),
    `a flooding command ended with ${JSON.stringify(flooded.outcome)} and kept ${flooded.stdout.length} bytes`,
  );

  const prompt = evaluatorPrompt({ sealedBrief: { behaviors: [] }, contract, mapping, nonce: 'abc' });
  check(
    prompt.includes('<judge-answer nonce="abc">') && prompt.includes('"key": "accepted"'),
    'the evaluator prompt names no answer block or key',
  );
  // An api operation's path template and ID stay out of what the agent sees, the brief eval-quality seals carrying the
  // interface alone (the verdict fixture declares no api operation, so this case seals one of its own).
  const empty = { requiredKeys: [], permittedKeys: [], types: {} };
  const withApi = structuredClone(readJson(path.join(FIXTURE, EVALUATION, 'contract.json')));
  withApi.permittedInterfaces.push({
    logicalId: 'verdict-api',
    kind: 'api',
    operations: [
      {
        operationId: 'fetch-latest-verdict',
        method: 'GET',
        pathTemplate: '/verdicts/latest-detail',
        stateChangeMarker: false,
        requestShape: { path: empty, query: empty, header: empty, body: empty },
        responseDescriptor: withApi.permittedInterfaces[0].operations[0].responseDescriptor,
        volatilePointers: [],
        sensitivityWitness: null,
      },
    ],
  });
  const apiBrief = engine.seal(withApi);
  const apiSeen = JSON.stringify({
    prompt: evaluatorPrompt({ sealedBrief: apiBrief, contract: withApi, mapping, nonce: 'abc' }),
    tools: bridgeTools(apiBrief.permittedInterfaces),
  });
  check(
    apiSeen.includes('verdict-api') && !apiSeen.includes('/verdicts/latest-detail') && !apiSeen.includes('fetch-latest-verdict'),
    `the agent's prompt or tools for a contract with an api operation carry its path template or ID: ${apiSeen}`,
  );
}

// ----------------------------------------------------------- framework neutrality

function checkDirectionGate() {
  const copy = scratch.make('direction');
  fs.cpSync(path.join(PROJECT_ROOT, 'cli'), path.join(copy, 'cli'), { recursive: true });
  const config = readJson(path.join(PROJECT_ROOT, 'eval-quality.config.json'));
  // The copy holds cli/ alone, so the section keeps the cli/ root and the layers over it, the rules under test.
  const section = config['dependency-direction'];
  section.roots = section.roots.filter((root) => root.path === 'cli');
  section.layers = section.layers.filter((layer) => layer.path.startsWith('cli/'));
  writeJson(path.join(copy, 'eval-quality.config.json'), { 'dependency-direction': section });
  const gates = path.join(path.dirname(engineCliPath()), '..', 'gates', 'gates-cli.js');
  const gate = () =>
    spawnSync(process.execPath, [gates, 'dependency-direction', '--config', path.join(copy, 'eval-quality.config.json')], {
      cwd: copy,
      encoding: 'utf8',
    });
  const clean = gate();
  check(clean.status === 0, `dependency-direction over a clean copy of cli/ exited ${clean.status}\n${clean.stdout}${clean.stderr}`);
  fs.writeFileSync(
    path.join(copy, 'cli', 'lib', 'evaluate', 'framework.js'),
    "'use strict';\n\nmodule.exports = require('some-evaluation-framework');\n",
  );
  const planted = gate();
  check(
    planted.status === 1 && `${planted.stdout}${planted.stderr}`.includes('some-evaluation-framework'),
    `dependency-direction over cli/ importing an unlisted package exited ${planted.status}; expected 1 naming it\n${planted.stdout}${planted.stderr}`,
  );
}

// ---------------------------------------------------------------- the reference's denial reasons

/**
 * The reference's `### Qualifying a sealed-brief agent` section (Story 1.34), read by its exact heading under `## run`,
 * names the block, the report and its attempt fields as the runtime's schema holds them, the Invalid attempt's record,
 * the exit and the decoding parameters the configuration really carries.
 */
async function checkReferenceQualifiesSealedBriefAgent() {
  const reference = fs.readFileSync(path.join(PROJECT_ROOT, 'docs', 'reference', 'tea-evaluate-cli.md'), 'utf8');
  const prose = reference.replaceAll(/^```[^\n]*\n[\s\S]*?^```[^\n]*$/gm, (fence) => fence.replaceAll(/[^\n]/g, ' '));
  const heading = '### Qualifying a sealed-brief agent';
  const start = prose.indexOf(`\n${heading}\n`);
  check(start !== -1 && !prose.includes(`\n${heading}\n`, start + 1), `the reference holds ${JSON.stringify(heading)} exactly once`);
  if (start === -1) return;
  const parent = (prose.slice(0, start).match(/^## .*$/gm) ?? []).pop();
  check(parent === '## run', `the reference's section ${JSON.stringify(heading)} sits under ${JSON.stringify(parent)}, not ## run`);
  const section = prose.slice(start + heading.length + 2).split(/\n#{1,3} /)[0];
  const schema = readJson(path.join(PROJECT_ROOT, 'cli', 'lib', 'evaluate', 'schemas', 'evaluator-qualification.schema.json'));
  const attemptFields = Object.keys(schema.properties.arms.items.properties.probes.items.properties.attempts.items.properties);
  const decodingKeys = Object.keys(
    configurationFields({
      layer: {
        evaluator: { kind: 'sealed-brief-agent', agent: 'custom', agentCommand: 'stub', timeoutMs: 1 },
        treeDigest: 't',
        mapping: { keys: {} },
      },
      conditions: { schemaVersion: 1, modelSnapshot: 'none', systemPromptDigest: 'd', evaluator: { modelSnapshot: 'an-agent' } },
      judgeConfiguration: null,
      digestBytes: (await loadEngine()).digestBytes,
      qualification: { attempts: 2, minimumAgreement: 0.9 },
      agentVersion: '1.0.0',
    }).decodingParameters,
  ).filter((key) => key.startsWith('tea.evaluatorQualification'));
  check(decodingKeys.length === 2, `the configuration carries ${JSON.stringify(decodingKeys)}; expected the qualification's two keys`);
  for (const term of [
    'evaluatorQualification',
    'attempts',
    'minimumAgreement',
    'evaluator-qualification.json',
    'exitCode: 3',
    'evidence: null',
    'outcome: null',
    '`invalid:`',
    'exits 11',
    'no trial record',
    'lowest agreement among its probes',
    'Historical and gameability arms are not qualified',
    ...attemptFields.filter((field) => field !== 'attempt').map((field) => `\`${field}\``),
    ...decodingKeys.map((key) => `\`${key}\``),
  ]) {
    check(section.includes(term), `the reference's section ${JSON.stringify(heading)} omits ${JSON.stringify(term)}`);
  }
  // The exit table and the check rule name the qualification beside their existing causes.
  check(
    /^\| 11 .*judgeCalibration\.minimumAgreement/m.test(prose) &&
      /^\| 11 .*evaluatorQualification\.minimumAgreement/m.test(prose) &&
      /^\| `evaluator` .*evaluatorQualification/m.test(prose),
    "the reference's exit 11 row or its evaluator rule does not name the calibration and the qualification",
  );
}

/** The reference names every reason code eval-quality's target policies decide, under its own heading (Story 1.33). */
async function checkReferenceNamesDenialReasons() {
  const reference = fs.readFileSync(path.join(PROJECT_ROOT, 'docs', 'reference', 'tea-evaluate-cli.md'), 'utf8');
  // The engine's own list, so a reason a later release decides fails the case until the reference names it.
  const denialReasons = (await loadEngine()).FORBIDDEN_TARGET_REASONS;
  check(Array.isArray(denialReasons) && denialReasons.length > 0, 'eval-quality exports no FORBIDDEN_TARGET_REASONS');
  // Headings inside a fenced block are examples, so they neither open nor end the section.
  const prose = reference.replaceAll(/^```[^\n]*\n[\s\S]*?^```[^\n]*$/gm, (fence) => fence.replaceAll(/[^\n]/g, ' '));
  const heading = '### Denial reasons';
  const start = prose.indexOf(`\n${heading}\n`);
  check(start !== -1 && !prose.includes(`\n${heading}\n`, start + 1), `the reference holds ${JSON.stringify(heading)} exactly once`);
  const section = start === -1 ? '' : prose.slice(start + heading.length + 2).split(/\n#{1,3} /)[0];
  const parent = start === -1 ? '' : (prose.slice(0, start).match(/^## .*$/gm) ?? []).pop();
  check(
    parent === '## The registry',
    `the reference's section ${JSON.stringify(heading)} sits under ${JSON.stringify(parent)}, not ## The registry`,
  );
  // The table's first column is the section's list of reasons; it equals the engine's, in both directions.
  const named = [...section.matchAll(/^\| `([^`]+)`/gm)].map((match) => match[1]);
  const missing = denialReasons.filter((code) => !named.includes(code));
  const unknown = named.filter((code) => !denialReasons.includes(code));
  check(
    missing.length === 0 && unknown.length === 0 && new Set(named).size === named.length,
    `the reference's section ${JSON.stringify(heading)} omits ${JSON.stringify(missing)}, names ${JSON.stringify(unknown)} which eval-quality's policies do not decide, or repeats a row`,
  );
}

/** A trial step the registry denies for a command records eval-quality's reason and names it as the run exits 10 (Story 1.33). */
async function checkCommandTrialDenial() {
  const contract = readJson(path.join(FIXTURE, EVALUATION, 'contract.json'));
  const evaluation = readJson(path.join(FIXTURE, EVALUATION, 'evaluation.json'));
  // The entry grants no subcommand path the plan's step uses, so the denial comes before anything launches.
  const registry = registryFromEvaluation(
    { ...evaluation, registry: [{ ...evaluation.registry[0], subcommandPaths: [['other']] }] },
    { root: FIXTURE },
  );
  const written = {};
  let stop = null;
  try {
    await runTrial({
      arm: { conditionArm: 'clean', slug: 'clean', mutation: null, mutatedDigest: null, probes: [] },
      trialIndex: 1,
      contract,
      registry,
      pristine: null,
      make: () => ({ kind: 'copy', root: FIXTURE, directory: FIXTURE, provisioned: [] }),
      discard: () => {},
      engine: null,
      writer: { writeJson: (file, value) => (written[file] = value) },
      stop: (fields) => Object.assign(new Error(fields.message), fields),
      signal: new AbortController().signal,
      snapshot: { layer: { evaluator: { kind: 'deterministic' } } },
    });
  } catch (error) {
    stop = error;
  }
  const fault = written['trials/clean/trial-1.json']?.fault;
  check(
    fault?.code === 'forbidden-target' &&
      fault.reason === 'subcommand-not-authorized' &&
      stop?.exitCode === 10 &&
      stop.message.startsWith('trial-clean-1 was denied by the registry (subcommand-not-authorized): '),
    `a denied command trial step recorded ${JSON.stringify(fault)} and stopped with ${stop?.exitCode}: ${stop?.message}`,
  );
}

// -------------------------------------------------------------- installed frameworks (Story 1.44)

/** The isolated package every framework case installs under the project's own node_modules (the repository's is read only). */
const FRAMEWORK = 'probe-fw';
/** The shipped version probe, copied into a case's `evaluator/` as an adopter copies it. */
const VERSION_PROBE = path.join(
  PROJECT_ROOT,
  'src',
  'workflows',
  'testarch',
  'bmad-testarch-evaluate',
  'assets',
  'evaluators',
  'installed-version.mjs',
);
const SHIPPED_PROBE = { command: 'evaluator/installed-version.mjs', args: [FRAMEWORK] };

/** The package.json the project's isolated package is installed as. */
function frameworkManifest(repository) {
  return path.join(repository, 'node_modules', FRAMEWORK, 'package.json');
}

/** Installs (or upgrades) the isolated package at `version`. */
function installFramework(repository, version) {
  writeJson(frameworkManifest(repository), { name: FRAMEWORK, version });
}

/** The tracked declaration and the `LEARNED.md` record, which a deliberate upgrade updates together. */
function declareFramework(folder, { version, learned = version, probe = SHIPPED_PROBE }) {
  writeJson(path.join(folder, 'evaluator', 'frameworks.json'), { schemaVersion: 1, frameworks: [{ package: FRAMEWORK, version, probe }] });
  fs.writeFileSync(
    path.join(folder, 'evaluator', 'LEARNED.md'),
    `# Learned evaluation framework\n\n## Framework and installed version\n\n- Installed package and version: \`${FRAMEWORK}@${learned}\`\n`,
  );
}

/** A command-evaluator project whose evaluator depends on the isolated package, declared at `declared` and installed at `installed`. */
function frameworkProject(
  label,
  { declared = '1.0.0', installed = declared, mode = 'rows', args = [], timeoutMs, unconfined = false, environmentKeys, probe, extra } = {},
) {
  return makeProject(label, {
    unconfined,
    edit: ({ folder, repository }) => {
      useCommandEvaluator(folder, { mode, args: typeof args === 'function' ? args(repository) : args, timeoutMs, environmentKeys });
      fs.copyFileSync(VERSION_PROBE, path.join(folder, 'evaluator', 'installed-version.mjs'));
      fs.chmodSync(path.join(folder, 'evaluator', 'installed-version.mjs'), 0o755);
      fs.appendFileSync(path.join(repository, '.gitignore'), 'node_modules/\n');
      installFramework(repository, installed);
      declareFramework(folder, { version: declared, probe });
      extra?.({ folder, repository });
    },
  });
}

/** A local package patch must move scoring even when package.json keeps its version. */
function checkInstalledFrameworkTreePatch() {
  const project = frameworkProject('framework-tree-patch', {
    extra: ({ folder, repository }) => {
      fs.writeFileSync(path.join(repository, 'node_modules', FRAMEWORK, 'judge.js'), 'export const judgment = 1;\n');
      const declaration = readJson(path.join(folder, 'evaluator', 'frameworks.json'));
      declaration.frameworks[0].installState = { source: 'tree' };
      declaration.frameworks[0].probe.args.push('tree');
      writeJson(path.join(folder, 'evaluator', 'frameworks.json'), declaration);
    },
  });
  const first = evaluate(['run', '--evaluation', project.folder], project.env);
  check(first.status === 0, `the first installed-tree run exited ${first.status}\n${first.output}`);
  const firstDirectory = runDirectoryOf(project.folder);
  if (first.status !== 0 || firstDirectory === null) return;
  const firstRecord = readJson(path.join(firstDirectory, 'run.json'));
  const firstDigest = readJson(path.join(firstDirectory, 'framework-versions.json')).frameworks[0].observed.installDigest;
  const firstScore = scoreRun(project, 'the original installed tree');
  fs.writeFileSync(path.join(project.repository, 'node_modules', FRAMEWORK, 'judge.js'), 'export const judgment = 2;\n');
  const second = evaluate(['run', '--evaluation', project.folder], project.env);
  check(second.status === 0, `the patched installed-tree run exited ${second.status}\n${second.output}`);
  const secondDirectory = runDirectoryOf(project.folder);
  if (second.status !== 0 || secondDirectory === null) return;
  const secondRecord = readJson(path.join(secondDirectory, 'run.json'));
  const secondDigest = readJson(path.join(secondDirectory, 'framework-versions.json')).frameworks[0].observed.installDigest;
  const secondScore = scoreRun(project, 'the patched installed tree');
  check(
    typeof firstDigest === 'string' &&
      firstDigest.startsWith('sha256:') &&
      firstDigest !== secondDigest &&
      firstRecord.evaluatorConfigurationDigest !== secondRecord.evaluatorConfigurationDigest &&
      firstScore.evidence['P-002']?.scoringVersion !== secondScore.evidence['P-002']?.scoringVersion &&
      firstRecord.evaluator.frameworks[0].installSource === 'tree' &&
      firstRecord.evaluator.frameworks[0].installDigest === firstDigest &&
      readJson(path.join(secondDirectory, 'framework-versions.json')).frameworks[0].observed.installSource === 'tree' &&
      readJson(path.join(secondDirectory, 'evaluator-configuration.json')).decodingParameters['tea.evaluatorFrameworks'][0]
        .installDigest === secondDigest &&
      readJson(path.join(secondDirectory, 'evaluator-configuration.json')).decodingParameters['tea.evaluatorFrameworks'][0]
        .installSource === 'tree',
    'a local package patch kept the same observed install digest or configuration digest',
  );
}

/** The legacy version-only declaration keeps its pre-story digest after an installed file patch. */
function checkLegacyFrameworkPatch() {
  const project = frameworkProject('framework-legacy-tree-patch', {
    extra: ({ repository }) => fs.writeFileSync(path.join(repository, 'node_modules', FRAMEWORK, 'judge.js'), 'original\n'),
  });
  const first = evaluate(['run', '--evaluation', project.folder], project.env);
  check(first.status === 0, `the legacy package run exited ${first.status}\n${first.output}`);
  const firstDirectory = runDirectoryOf(project.folder);
  if (first.status !== 0 || firstDirectory === null) return;
  const firstRecord = readJson(path.join(firstDirectory, 'run.json'));
  fs.writeFileSync(path.join(project.repository, 'node_modules', FRAMEWORK, 'judge.js'), 'patched\n');
  const second = evaluate(['run', '--evaluation', project.folder], project.env);
  check(second.status === 0, `the legacy patched package run exited ${second.status}\n${second.output}`);
  const secondDirectory = runDirectoryOf(project.folder);
  if (second.status !== 0 || secondDirectory === null) return;
  const secondRecord = readJson(path.join(secondDirectory, 'run.json'));
  check(
    firstRecord.evaluatorConfigurationDigest === secondRecord.evaluatorConfigurationDigest &&
      firstRecord.evaluator.frameworks[0].installDigest === undefined &&
      secondRecord.evaluator.frameworks[0].installDigest === undefined,
    'an undeclared install state changed the legacy framework configuration digest',
  );
}

/** A lockfile entry change is a new condition even when its package version is fixed. */
function checkInstalledFrameworkLockfile() {
  const lockfile = (repository) => path.join(repository, 'package-lock.json');
  const project = frameworkProject('framework-lockfile-entry', {
    extra: ({ folder, repository }) => {
      writeJson(lockfile(repository), {
        name: 'fixture',
        lockfileVersion: 3,
        packages: { '': { name: 'fixture' }, [`node_modules/${FRAMEWORK}`]: { version: '1.0.0', resolved: 'file:original' } },
      });
      const declaration = readJson(path.join(folder, 'evaluator', 'frameworks.json'));
      declaration.frameworks[0].installState = { source: 'lockfile' };
      declaration.frameworks[0].probe.args.push('lockfile');
      writeJson(path.join(folder, 'evaluator', 'frameworks.json'), declaration);
    },
  });
  const first = evaluate(['run', '--evaluation', project.folder], project.env);
  check(first.status === 0, `the first lockfile run exited ${first.status}\n${first.output}`);
  const firstDirectory = runDirectoryOf(project.folder);
  if (first.status !== 0 || firstDirectory === null) return;
  const firstDigest = readJson(path.join(firstDirectory, 'framework-versions.json')).frameworks[0].observed.installDigest;
  const firstRecord = readJson(path.join(firstDirectory, 'run.json'));
  const reordered = readJson(lockfile(project.repository));
  reordered.packages[`node_modules/${FRAMEWORK}`] = { resolved: 'file:original', version: '1.0.0' };
  writeJson(lockfile(project.repository), reordered);
  commitAll(project.repository, project.folder, 'reorder the lockfile entry keys');
  const equivalent = evaluate(['run', '--evaluation', project.folder], project.env);
  check(equivalent.status === 0, `the reordered lockfile run exited ${equivalent.status}\n${equivalent.output}`);
  const equivalentDirectory = runDirectoryOf(project.folder);
  if (equivalent.status !== 0 || equivalentDirectory === null) return;
  check(
    readJson(path.join(equivalentDirectory, 'framework-versions.json')).frameworks[0].observed.installDigest === firstDigest &&
      readJson(path.join(equivalentDirectory, 'run.json')).evaluatorConfigurationDigest === firstRecord.evaluatorConfigurationDigest,
    'equivalent lockfile entry key order changed the install or configuration digest',
  );
  const updated = readJson(lockfile(project.repository));
  updated.packages[`node_modules/${FRAMEWORK}`].resolved = 'file:patched';
  writeJson(lockfile(project.repository), updated);
  commitAll(project.repository, project.folder, 'change only the lockfile entry');
  const second = evaluate(['run', '--evaluation', project.folder], project.env);
  check(second.status === 0, `the changed lockfile run exited ${second.status}\n${second.output}`);
  const secondDirectory = runDirectoryOf(project.folder);
  if (second.status !== 0 || secondDirectory === null) return;
  const secondDigest = readJson(path.join(secondDirectory, 'framework-versions.json')).frameworks[0].observed.installDigest;
  check(
    firstDigest !== secondDigest &&
      firstRecord.evaluatorConfigurationDigest !== readJson(path.join(secondDirectory, 'run.json')).evaluatorConfigurationDigest,
    'editing one lockfile entry kept the old install or configuration digest',
  );
}

/** The shipped lockfile probe accepts npm generations and refuses stale or linked entries. */
function checkLockfileProbeVersions() {
  const project = frameworkProject('framework-lockfile-generations');
  const file = path.join(project.repository, 'package-lock.json');
  const probe = () =>
    spawnSync(process.execPath, [path.join(project.folder, 'evaluator', 'installed-version.mjs'), FRAMEWORK, 'lockfile'], {
      encoding: 'utf8',
    });
  writeJson(file, { lockfileVersion: 1, dependencies: { [FRAMEWORK]: { version: '1.0.0', resolved: 'file:v1' } } });
  const v1 = probe();
  check(v1.status === 0 && JSON.parse(v1.stdout).installDigest?.startsWith('sha256:'), `npm lockfile v1 failed: ${v1.stderr}`);
  writeJson(file, {
    lockfileVersion: 2,
    packages: { '': {}, [`node_modules/${FRAMEWORK}`]: { version: '1.0.0', resolved: 'file:v2' } },
  });
  const v2 = probe();
  check(
    v2.status === 0 && JSON.parse(v2.stdout).installDigest !== JSON.parse(v1.stdout).installDigest,
    `npm lockfile v2 failed: ${v2.stderr}`,
  );
  const stale = readJson(file);
  stale.packages[`node_modules/${FRAMEWORK}`].version = '9.9.9';
  writeJson(file, stale);
  const staleResult = probe();
  check(
    staleResult.status === 1 && staleResult.stderr.includes('installed package is 1.0.0'),
    `a stale lockfile entry was accepted: ${staleResult.stdout}${staleResult.stderr}`,
  );
  stale.packages[`node_modules/${FRAMEWORK}`] = { link: true, resolved: 'linked-probe' };
  writeJson(file, stale);
  const linkedEntry = probe();
  check(
    linkedEntry.status === 1 && linkedEntry.stderr.includes('is a link; use tree install state'),
    `a linked lockfile entry was accepted: ${linkedEntry.stdout}${linkedEntry.stderr}`,
  );
  stale.packages[`node_modules/${FRAMEWORK}`] = { version: '1.0.0', resolved: 'file:linked' };
  writeJson(file, stale);
  const installed = path.join(project.repository, 'node_modules', FRAMEWORK);
  fs.renameSync(installed, path.join(project.repository, 'node_modules', 'real-probe'));
  fs.symlinkSync('real-probe', installed);
  const linkedPackage = probe();
  const linkedTree = spawnSync(process.execPath, [path.join(project.folder, 'evaluator', 'installed-version.mjs'), FRAMEWORK, 'tree'], {
    encoding: 'utf8',
  });
  check(
    linkedPackage.status === 1 && linkedPackage.stderr.includes('requires tree install state') && linkedTree.status === 0,
    `a linked installed package was accepted in lockfile mode or refused in tree mode: ${linkedPackage.stderr}${linkedTree.stderr}`,
  );
}

/** Tree observation includes metadata and link identity beside file contents. */
function checkTreeProbeMetadata() {
  const project = frameworkProject('framework-tree-metadata');
  const packageRoot = path.join(project.repository, 'node_modules', FRAMEWORK);
  const modeFile = path.join(packageRoot, 'mode.txt');
  fs.writeFileSync(modeFile, 'same bytes\n');
  fs.chmodSync(modeFile, 0o644);
  fs.writeFileSync(path.join(packageRoot, 'target-a.txt'), 'same target bytes\n');
  fs.writeFileSync(path.join(packageRoot, 'target-b.txt'), 'same target bytes\n');
  const link = path.join(packageRoot, 'linked.txt');
  fs.symlinkSync('target-a.txt', link);
  const probe = () =>
    spawnSync(process.execPath, [path.join(project.folder, 'evaluator', 'installed-version.mjs'), FRAMEWORK, 'tree'], {
      encoding: 'utf8',
    });
  const observed = () => {
    const result = probe();
    check(result.status === 0, `the tree probe failed: ${result.stderr}`);
    return result.status === 0 ? JSON.parse(result.stdout).installDigest : null;
  };
  const original = observed();
  fs.chmodSync(modeFile, 0o755);
  const modeChanged = observed();
  check(original !== null && modeChanged !== original, 'changing only file mode kept the tree digest');
  fs.mkdirSync(path.join(packageRoot, 'empty'));
  const emptyAdded = observed();
  check(emptyAdded !== null && emptyAdded !== modeChanged, 'adding an empty directory kept the tree digest');
  fs.unlinkSync(link);
  fs.symlinkSync('target-b.txt', link);
  const linkChanged = observed();
  check(linkChanged !== null && linkChanged !== emptyAdded, 'changing only symlink text kept the tree digest');
  const dangling = path.join(packageRoot, 'dangling.txt');
  fs.symlinkSync('missing-a.txt', dangling);
  const missingTarget = observed();
  check(missingTarget !== null, 'a dangling symlink made the installed tree unreadable');
  fs.unlinkSync(dangling);
  fs.symlinkSync('missing-b.txt', dangling);
  const missingRetargeted = observed();
  check(missingRetargeted !== null && missingRetargeted !== missingTarget, 'retargeting a dangling symlink kept the tree digest');
  const largeFile = path.join(packageRoot, 'large.bin');
  const largeBytes = Buffer.alloc(2 * 1024 * 1024, 7);
  fs.writeFileSync(largeFile, largeBytes);
  const largeOriginal = observed();
  largeBytes[largeBytes.length - 1] = 8;
  fs.writeFileSync(largeFile, largeBytes);
  const largeChanged = observed();
  check(largeChanged !== null && largeChanged !== largeOriginal, 'a changed byte after several read chunks kept the tree digest');
  fs.symlinkSync('.', path.join(packageRoot, 'cycle'));
  const cycle = probe();
  check(cycle.status === 1 && cycle.stderr.includes('directory link cycle'), `a directory link cycle was accepted: ${cycle.stderr}`);
}

/** A declared source cannot be qualified through a probe that reports only a version. */
function checkMissingFrameworkInstallDigest() {
  check(
    schemaProblems('framework-versions')({
      schemaVersion: 1,
      frameworks: [{ package: FRAMEWORK, declaredVersion: '1.0.0', observed: { package: FRAMEWORK, version: '1.0.0' } }],
    }).length === 0,
    'the framework artifact schema rejected a historical version-only observation',
  );
  check(
    schemaProblems('framework-versions')({
      schemaVersion: 1,
      frameworks: [
        {
          package: FRAMEWORK,
          declaredVersion: '1.0.0',
          observed: { package: FRAMEWORK, version: '1.0.0', installSource: 'tree', installDigest: `sha256:${'a'.repeat(64)}` },
        },
      ],
    }).length > 0,
    'the framework artifact schema accepted an install digest without a declared source',
  );
  check(
    schemaProblems('framework-versions')({
      schemaVersion: 1,
      frameworks: [
        {
          package: FRAMEWORK,
          declaredVersion: '1.0.0',
          installState: { source: 'tree' },
          observed: { package: FRAMEWORK, version: '1.0.0', installSource: 'tree' },
        },
      ],
    }).length > 0,
    'the framework artifact schema accepted an observation without its declared install digest',
  );
  check(
    schemaProblems('framework-versions')({
      schemaVersion: 1,
      frameworks: [
        {
          package: FRAMEWORK,
          declaredVersion: '1.0.0',
          installState: { source: 'tree' },
          observed: { package: FRAMEWORK, version: '1.0.0', installSource: 'lockfile', installDigest: `sha256:${'a'.repeat(64)}` },
        },
      ],
    }).length > 0,
    'the framework artifact schema accepted a source unlike the declaration',
  );
  for (const label of ['missing', 'malformed', 'mismatched source']) {
    const project = frameworkProject(`framework-${label}-install-digest`, {
      probe:
        label === 'missing'
          ? undefined
          : { command: 'evaluator/probe.js', args: ['--mode', label === 'malformed' ? 'invalid-install-digest' : 'wrong-install-source'] },
      extra: ({ folder }) => {
        const declaration = readJson(path.join(folder, 'evaluator', 'frameworks.json'));
        declaration.frameworks[0].installState = { source: 'tree' };
        writeJson(path.join(folder, 'evaluator', 'frameworks.json'), declaration);
      },
    });
    const ran = evaluate(['run', '--evaluation', project.folder], project.env);
    const directory = runDirectoryOf(project.folder);
    check(
      ran.status === 12 && ran.output.includes(label === 'mismatched source' ? 'declared source is tree' : 'installDigest'),
      `a ${label} digest probe exited ${ran.status}\n${ran.output}`,
    );
    checkNoSealedRecord(`a ${label} digest probe`, directory);
    const artifact = directory === null ? null : readJson(path.join(directory, 'framework-versions.json'));
    check(
      artifact?.frameworks[0]?.installState?.source === 'tree' &&
        artifact.frameworks[0].observed === null &&
        schemaProblems('framework-versions')(artifact).length === 0,
      `a ${label} install digest left an invalid artifact: ${JSON.stringify(artifact)}`,
    );
  }
}

/** The first observed digest remains the hold point around every evaluator launch. */
function checkInstalledFrameworkDigestMidRun() {
  const projectWithTree = (label, options = {}) =>
    frameworkProject(label, {
      unconfined: true,
      ...options,
      extra: ({ folder, repository }) => {
        fs.writeFileSync(path.join(repository, 'node_modules', FRAMEWORK, 'judge.js'), 'original\n');
        const declaration = readJson(path.join(folder, 'evaluator', 'frameworks.json'));
        declaration.frameworks[0].installState = { source: 'tree' };
        declaration.frameworks[0].probe.args.push('tree');
        writeJson(path.join(folder, 'evaluator', 'frameworks.json'), declaration);
      },
    });
  const during = projectWithTree('framework-tree-changes-after-trial', {
    mode: 'patch-package',
    args: (repository) => ['--touch', path.join(repository, 'node_modules', FRAMEWORK, 'judge.js')],
  });
  const after = evaluate(['run', '--evaluation', during.folder], during.env);
  check(
    after.status === 12 && after.output.includes('installed probe-fw install digest changed'),
    `a package patch during a trial exited ${after.status}; expected exit 12 at the post-trial read\n${after.output}`,
  );
  checkNoSealedRecord('a package patch during a trial', runDirectoryOf(during.folder));
  const duringInitial = readJson(path.join(runDirectoryOf(during.folder), 'framework-versions.json')).frameworks[0].observed.installDigest;
  const duringCurrent = JSON.parse(
    spawnSync(process.execPath, [path.join(during.folder, 'evaluator', 'installed-version.mjs'), FRAMEWORK, 'tree'], {
      encoding: 'utf8',
    }).stdout,
  ).installDigest;
  check(
    after.output.includes(`from ${duringInitial} to ${duringCurrent}`),
    `the post-trial digest fault omitted its initial or current value: ${after.output}`,
  );

  const before = projectWithTree('framework-tree-changes-before-launch');
  const ran = evaluate(['run', '--evaluation', before.folder], {
    ...before.env,
    VERDICT_WHEN: 'trial-clean-2',
    VERDICT_DO: 'touch',
    VERDICT_TOUCH: path.join(before.repository, 'node_modules', FRAMEWORK, 'judge.js'),
  });
  check(
    ran.status === 12 && ran.output.includes('installed probe-fw install digest changed'),
    `a package patch before a launch exited ${ran.status}; expected exit 12 at the prelaunch read\n${ran.output}`,
  );
  checkNoSealedRecord('a package patch before a launch', runDirectoryOf(before.folder));
  const beforeInitial = readJson(path.join(runDirectoryOf(before.folder), 'framework-versions.json')).frameworks[0].observed.installDigest;
  const beforeCurrent = JSON.parse(
    spawnSync(process.execPath, [path.join(before.folder, 'evaluator', 'installed-version.mjs'), FRAMEWORK, 'tree'], {
      encoding: 'utf8',
    }).stdout,
  ).installDigest;
  check(
    ran.output.includes(`from ${beforeInitial} to ${beforeCurrent}`),
    `the prelaunch digest fault omitted its initial or current value: ${ran.output}`,
  );
}

/** Lockfile entry changes stop both hold positions under an unchanged package version. */
function checkLockfileDigestMidRun() {
  const projectWithLockfile = (label, options = {}) =>
    frameworkProject(label, {
      unconfined: true,
      ...options,
      extra: ({ folder, repository }) => {
        writeJson(path.join(repository, 'package-lock.json'), {
          lockfileVersion: 3,
          packages: { '': {}, [`node_modules/${FRAMEWORK}`]: { version: '1.0.0', resolved: 'file:original' } },
        });
        const declaration = readJson(path.join(folder, 'evaluator', 'frameworks.json'));
        declaration.frameworks[0].installState = { source: 'lockfile' };
        declaration.frameworks[0].probe.args.push('lockfile');
        writeJson(path.join(folder, 'evaluator', 'frameworks.json'), declaration);
      },
    });
  const during = projectWithLockfile('framework-lockfile-after-trial', {
    mode: 'patch-lockfile',
    args: (repository) => ['--touch', path.join(repository, 'package-lock.json')],
  });
  const after = evaluate(['run', '--evaluation', during.folder], during.env);
  check(
    after.status === 12 && after.output.includes('installed probe-fw install digest changed'),
    `a lockfile edit during a trial exited ${after.status}; expected the post-trial digest hold\n${after.output}`,
  );
  checkNoSealedRecord('a lockfile edit during a trial', runDirectoryOf(during.folder));
  const before = projectWithLockfile('framework-lockfile-before-launch');
  const ran = evaluate(['run', '--evaluation', before.folder], {
    ...before.env,
    VERDICT_WHEN: 'trial-clean-2',
    VERDICT_DO: 'patch-lockfile',
    VERDICT_TOUCH: path.join(before.repository, 'package-lock.json'),
  });
  check(
    ran.status === 12 && ran.output.includes('installed probe-fw install digest changed'),
    `a lockfile edit before a launch exited ${ran.status}; expected the prelaunch digest hold\n${ran.output}`,
  );
  checkNoSealedRecord('a lockfile edit before a launch', runDirectoryOf(before.folder));
}

/** Calibration holds the initial digest before and after each judgment launch. */
function checkFrameworkDigestCalibration() {
  for (const [flipAt, position] of [
    [2, 'before calibration'],
    [3, 'during calibration'],
  ]) {
    const counter = path.join(scratch.make(`framework-digest-calibration-${flipAt}`), 'reads.txt');
    const project = frameworkProject(`framework-digest-calibration-${flipAt}`, {
      probe: {
        command: 'evaluator/probe.js',
        args: ['--package', FRAMEWORK, '--digest-flip-at', String(flipAt), '--counter', counter],
      },
      extra: ({ folder }) => {
        addRubric(folder);
        const declaration = readJson(path.join(folder, 'evaluator', 'frameworks.json'));
        declaration.frameworks[0].installState = { source: 'tree' };
        writeJson(path.join(folder, 'evaluator', 'frameworks.json'), declaration);
      },
    });
    const ran = evaluate(['run', '--evaluation', project.folder], project.env);
    check(
      ran.status === 12 && ran.output.includes(`installed frameworks changed ${position}`) && ran.output.includes('install digest changed'),
      `an install digest changed ${position}: exit ${ran.status}\n${ran.output}`,
    );
    checkNoSealedRecord(`an install digest changed ${position}`, runDirectoryOf(project.folder));
  }
}

/** A hoisted contributor needs its own declaration and changes scoring when it moves. */
function checkTransitiveFrameworkDeclaration() {
  const plugin = 'probe-fw-plugin';
  const project = frameworkProject('framework-transitive-declaration', {
    extra: ({ folder, repository }) => {
      const pluginRoot = path.join(repository, 'node_modules', plugin);
      writeJson(path.join(pluginRoot, 'package.json'), { name: plugin, version: '2.0.0' });
      fs.writeFileSync(path.join(pluginRoot, 'judge.js'), 'original\n');
      const declaration = readJson(path.join(folder, 'evaluator', 'frameworks.json'));
      declaration.frameworks[0].installState = { source: 'tree' };
      declaration.frameworks[0].probe.args.push('tree');
      declaration.frameworks.push({
        package: plugin,
        version: '2.0.0',
        installState: { source: 'tree' },
        probe: { command: 'evaluator/installed-version.mjs', args: [plugin, 'tree'] },
      });
      writeJson(path.join(folder, 'evaluator', 'frameworks.json'), declaration);
      fs.writeFileSync(
        path.join(folder, 'evaluator', 'LEARNED.md'),
        `# Learned evaluation framework\n\n## Framework and installed version\n\n- Installed packages: \`${FRAMEWORK}@1.0.0\`, \`${plugin}@2.0.0\`\n`,
      );
    },
  });
  const first = evaluate(['run', '--evaluation', project.folder], project.env);
  check(first.status === 0, `a separately declared plugin run exited ${first.status}\n${first.output}`);
  const firstDirectory = runDirectoryOf(project.folder);
  if (first.status !== 0 || firstDirectory === null) return;
  const firstRecord = readJson(path.join(firstDirectory, 'run.json'));
  const firstFrameworks = firstRecord.evaluator.frameworks;
  fs.writeFileSync(path.join(project.repository, 'node_modules', plugin, 'judge.js'), 'patched\n');
  const second = evaluate(['run', '--evaluation', project.folder], project.env);
  check(second.status === 0, `a patched separately declared plugin run exited ${second.status}\n${second.output}`);
  const secondDirectory = runDirectoryOf(project.folder);
  if (second.status !== 0 || secondDirectory === null) return;
  const secondRecord = readJson(path.join(secondDirectory, 'run.json'));
  const secondFrameworks = secondRecord.evaluator.frameworks;
  check(
    firstFrameworks.find((entry) => entry.package === FRAMEWORK)?.installDigest ===
      secondFrameworks.find((entry) => entry.package === FRAMEWORK)?.installDigest &&
      firstFrameworks.find((entry) => entry.package === plugin)?.installDigest !==
        secondFrameworks.find((entry) => entry.package === plugin)?.installDigest &&
      firstRecord.evaluatorConfigurationDigest !== secondRecord.evaluatorConfigurationDigest,
    'a patched separately declared plugin kept the scoring configuration digest',
  );
}

/** Resolve a judgment dependency through the package that imports it, including deeper nesting. */
function checkNestedFrameworkResolution() {
  const outer = 'probe-outer';
  const inner = 'probe-inner';
  const nestedKey = `node_modules/${outer}/node_modules/${inner}/node_modules/${FRAMEWORK}`;
  for (const source of ['tree', 'lockfile']) {
    const project = frameworkProject(`framework-nested-${source}`, {
      extra: ({ folder, repository }) => {
        writeJson(path.join(repository, 'node_modules', outer, 'package.json'), { name: outer, version: '3.0.0' });
        writeJson(path.join(repository, 'node_modules', outer, 'node_modules', inner, 'package.json'), {
          name: inner,
          version: '4.0.0',
        });
        const nestedRoot = path.join(repository, ...nestedKey.split('/'));
        writeJson(path.join(nestedRoot, 'package.json'), { name: FRAMEWORK, version: '1.0.0' });
        fs.writeFileSync(path.join(nestedRoot, 'judge.js'), 'nested original\n');
        fs.writeFileSync(path.join(repository, 'node_modules', FRAMEWORK, 'judge.js'), 'root fixed\n');
        writeJson(path.join(repository, 'package-lock.json'), {
          lockfileVersion: 3,
          packages: {
            '': {},
            [`node_modules/${FRAMEWORK}`]: { version: '1.0.0', resolved: 'file:root' },
            [nestedKey]: { version: '1.0.0', resolved: 'file:nested-original' },
          },
        });
        const declaration = readJson(path.join(folder, 'evaluator', 'frameworks.json'));
        declaration.frameworks[0].installState = { source };
        declaration.frameworks[0].probe.args = [FRAMEWORK, source, '--importer', outer, '--importer', inner];
        writeJson(path.join(folder, 'evaluator', 'frameworks.json'), declaration);
      },
    });
    const rootProbe = () =>
      spawnSync(process.execPath, [path.join(project.folder, 'evaluator', 'installed-version.mjs'), FRAMEWORK, source], {
        encoding: 'utf8',
      });
    const originalRoot = rootProbe();
    check(originalRoot.status === 0, `the root ${source} probe failed: ${originalRoot.stderr}`);
    const first = evaluate(['run', '--evaluation', project.folder], project.env);
    check(first.status === 0, `the nested ${source} run exited ${first.status}\n${first.output}`);
    const firstDirectory = runDirectoryOf(project.folder);
    if (first.status !== 0 || firstDirectory === null || originalRoot.status !== 0) continue;
    const firstRecord = readJson(path.join(firstDirectory, 'run.json'));
    const firstDigest = firstRecord.evaluator.frameworks[0].installDigest;
    const firstScore = scoreRun(project, `the original nested ${source} run`);
    if (source === 'tree') {
      fs.writeFileSync(path.join(project.repository, ...nestedKey.split('/'), 'judge.js'), 'nested patched\n');
    } else {
      const lockfile = path.join(project.repository, 'package-lock.json');
      const lock = readJson(lockfile);
      lock.packages[nestedKey].resolved = 'file:nested-patched';
      writeJson(lockfile, lock);
      commitAll(project.repository, project.folder, 'patch only the nested lockfile entry');
    }
    const second = evaluate(['run', '--evaluation', project.folder], project.env);
    check(second.status === 0, `the patched nested ${source} run exited ${second.status}\n${second.output}`);
    const secondDirectory = runDirectoryOf(project.folder);
    if (second.status !== 0 || secondDirectory === null) continue;
    const secondRecord = readJson(path.join(secondDirectory, 'run.json'));
    const secondScore = scoreRun(project, `the patched nested ${source} run`);
    const unchangedRoot = rootProbe();
    check(
      unchangedRoot.status === 0 &&
        JSON.parse(originalRoot.stdout).installDigest === JSON.parse(unchangedRoot.stdout).installDigest &&
        firstDigest !== secondRecord.evaluator.frameworks[0].installDigest &&
        firstRecord.evaluatorConfigurationDigest !== secondRecord.evaluatorConfigurationDigest &&
        firstScore.evidence['P-002']?.scoringVersion !== secondScore.evidence['P-002']?.scoringVersion &&
        firstRecord.evaluator.frameworks[0].version === secondRecord.evaluator.frameworks[0].version,
      `a nested ${source} change missed scoring or changed the same-name root copy`,
    );
    if (source === 'tree') {
      const declarationFile = path.join(project.folder, 'evaluator', 'frameworks.json');
      const declaration = readJson(declarationFile);
      declaration.frameworks[0].probe.args = [FRAMEWORK, 'tree', '--importer', 'missing-importer'];
      writeJson(declarationFile, declaration);
      commitAll(project.repository, project.folder, 'name an importer that is absent');
      const invalid = evaluate(['run', '--evaluation', project.folder], project.env);
      check(
        invalid.status === 12 && invalid.output.includes('importer chain cannot resolve missing-importer'),
        `an invalid importer chain exited ${invalid.status}: ${invalid.output}`,
      );
      checkNoSealedRecord('an invalid importer chain', runDirectoryOf(project.folder));
    }
  }
}

/** A linked importer's real location can resolve a different same-name dependency than its symlink path. */
function checkLinkedImporterResolution() {
  const importer = 'probe-linked-importer';
  const project = frameworkProject('framework-linked-importer', {
    extra: ({ folder, repository }) => {
      const realImporter = path.join(repository, 'vendor', 'workspace', importer);
      writeJson(path.join(realImporter, 'package.json'), { name: importer, version: '3.0.0' });
      fs.writeFileSync(path.join(realImporter, 'index.js'), "module.exports = require.resolve('probe-fw/package.json');\n");
      writeJson(path.join(repository, 'vendor', 'node_modules', FRAMEWORK, 'package.json'), { name: FRAMEWORK, version: '1.0.0' });
      fs.writeFileSync(path.join(repository, 'vendor', 'node_modules', FRAMEWORK, 'judge.js'), 'vendor original\n');
      fs.writeFileSync(path.join(repository, 'node_modules', FRAMEWORK, 'judge.js'), 'root fixed\n');
      fs.symlinkSync(path.relative(path.join(repository, 'node_modules'), realImporter), path.join(repository, 'node_modules', importer));
      const declaration = readJson(path.join(folder, 'evaluator', 'frameworks.json'));
      declaration.frameworks[0].installState = { source: 'tree' };
      declaration.frameworks[0].probe.args = [FRAMEWORK, 'tree', '--importer', importer];
      writeJson(path.join(folder, 'evaluator', 'frameworks.json'), declaration);
    },
  });
  const rootProbe = () =>
    spawnSync(process.execPath, [path.join(project.folder, 'evaluator', 'installed-version.mjs'), FRAMEWORK, 'tree'], {
      encoding: 'utf8',
    });
  const originalRoot = rootProbe();
  check(originalRoot.status === 0, `the same-name root probe failed: ${originalRoot.stderr}`);
  const linkedEntry = path.join(project.repository, 'node_modules', importer, 'index.js');
  const actualResolution = spawnSync(process.execPath, ['-e', 'process.stdout.write(require(process.argv[1]))', linkedEntry], {
    encoding: 'utf8',
  });
  check(
    actualResolution.status === 0 &&
      actualResolution.stdout === path.join(project.repository, 'vendor', 'node_modules', FRAMEWORK, 'package.json'),
    `Node resolved the linked importer from the wrong location: ${actualResolution.stdout || actualResolution.stderr}`,
  );
  const first = evaluate(['run', '--evaluation', project.folder], project.env);
  check(first.status === 0, `the linked importer run exited ${first.status}\n${first.output}`);
  const firstDirectory = runDirectoryOf(project.folder);
  if (originalRoot.status !== 0 || first.status !== 0 || firstDirectory === null) return;
  const firstRecord = readJson(path.join(firstDirectory, 'run.json'));
  const firstScore = scoreRun(project, 'the linked importer run');
  fs.writeFileSync(path.join(project.repository, 'vendor', 'node_modules', FRAMEWORK, 'judge.js'), 'vendor patched\n');
  const second = evaluate(['run', '--evaluation', project.folder], project.env);
  check(second.status === 0, `the patched linked importer run exited ${second.status}\n${second.output}`);
  const secondDirectory = runDirectoryOf(project.folder);
  if (second.status !== 0 || secondDirectory === null) return;
  const secondRecord = readJson(path.join(secondDirectory, 'run.json'));
  const secondScore = scoreRun(project, 'the patched linked importer run');
  const unchangedRoot = rootProbe();
  check(
    unchangedRoot.status === 0 &&
      JSON.parse(originalRoot.stdout).installDigest === JSON.parse(unchangedRoot.stdout).installDigest &&
      firstRecord.evaluator.frameworks[0].installDigest !== secondRecord.evaluator.frameworks[0].installDigest &&
      firstRecord.evaluator.frameworks[0].version === secondRecord.evaluator.frameworks[0].version &&
      firstRecord.evaluatorConfigurationDigest !== secondRecord.evaluatorConfigurationDigest &&
      firstScore.evidence['P-002']?.scoringVersion !== secondScore.evidence['P-002']?.scoringVersion,
    'the linked importer resolved the root copy or kept scoring after its real dependency changed',
  );
}

/** Two importer trees cover distinct nested copies without repeating a package declaration. */
function checkSeparateImporterTrees() {
  const importers = ['probe-importer-alpha', 'probe-importer-beta'];
  const project = frameworkProject('framework-separate-importer-trees', {
    extra: ({ folder, repository }) => {
      for (const importer of importers) {
        const root = path.join(repository, 'node_modules', importer);
        writeJson(path.join(root, 'package.json'), { name: importer, version: '2.0.0' });
        const nested = path.join(root, 'node_modules', FRAMEWORK);
        writeJson(path.join(nested, 'package.json'), { name: FRAMEWORK, version: '1.0.0' });
        fs.writeFileSync(path.join(nested, 'judge.js'), `${importer} original\n`);
      }
      writeJson(path.join(folder, 'evaluator', 'frameworks.json'), {
        schemaVersion: 1,
        frameworks: importers.map((importer) => ({
          package: importer,
          version: '2.0.0',
          installState: { source: 'tree' },
          probe: { command: 'evaluator/installed-version.mjs', args: [importer, 'tree'] },
        })),
      });
      fs.writeFileSync(
        path.join(folder, 'evaluator', 'LEARNED.md'),
        `# Learned evaluation framework\n\n## Framework and installed version\n\n- Installed packages: ${importers.map((name) => `\`${name}@2.0.0\``).join(', ')}\n`,
      );
    },
  });
  const first = evaluate(['run', '--evaluation', project.folder], project.env);
  check(first.status === 0, `the two-importer run exited ${first.status}\n${first.output}`);
  const firstDirectory = runDirectoryOf(project.folder);
  if (first.status !== 0 || firstDirectory === null) return;
  const firstRecord = readJson(path.join(firstDirectory, 'run.json'));
  const firstScore = scoreRun(project, 'the two-importer run');
  fs.writeFileSync(path.join(project.repository, 'node_modules', importers[0], 'node_modules', FRAMEWORK, 'judge.js'), 'alpha patched\n');
  const second = evaluate(['run', '--evaluation', project.folder], project.env);
  check(second.status === 0, `the patched two-importer run exited ${second.status}\n${second.output}`);
  const secondDirectory = runDirectoryOf(project.folder);
  if (second.status !== 0 || secondDirectory === null) return;
  const secondRecord = readJson(path.join(secondDirectory, 'run.json'));
  const secondScore = scoreRun(project, 'the patched two-importer run');
  const digestOf = (record, name) => record.evaluator.frameworks.find((entry) => entry.package === name)?.installDigest;
  check(
    digestOf(firstRecord, importers[0]) !== digestOf(secondRecord, importers[0]) &&
      digestOf(firstRecord, importers[1]) === digestOf(secondRecord, importers[1]) &&
      firstRecord.evaluatorConfigurationDigest !== secondRecord.evaluatorConfigurationDigest &&
      firstScore.evidence['P-002']?.scoringVersion !== secondScore.evidence['P-002']?.scoringVersion,
    'a nested copy patch did not change its importer tree and scoring version alone',
  );
}

/** The runtime-owned schema `name` (under cli/lib/evaluate/schemas/) compiled; it returns the problems a value has against it. */
function schemaProblems(name) {
  const Ajv = AjvModule.default ?? AjvModule;
  const validate = new Ajv({ strict: false, allErrors: true }).compile(
    readJson(path.join(PROJECT_ROOT, 'cli', 'lib', 'evaluate', 'schemas', `${name}.schema.json`)),
  );
  return (value) => (validate(value) ? [] : (validate.errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message}`));
}

/**
 * The wall-clock ceiling a command trial can record holds the framework probes (Story 1.44, round 3): two passes of one
 * probe per declared framework, each bounded by the evaluator's timeout. Two frameworks at a 60 second timeout add 240
 * seconds to the 30 second plan step and the 60 second evaluator, and an empty declaration adds none.
 */
function checkProbePassesInCeiling() {
  const project = frameworkProject('framework-two-probes', {
    extra: ({ folder, repository }) => {
      installFramework(repository, '1.0.0');
      writeJson(path.join(repository, 'node_modules', 'probe-fw-two', 'package.json'), { name: 'probe-fw-two', version: '2.0.0' });
      writeJson(path.join(folder, 'evaluator', 'frameworks.json'), {
        schemaVersion: 1,
        frameworks: [
          { package: FRAMEWORK, version: '1.0.0', probe: { ...SHIPPED_PROBE, probeTimeoutMs: 25_000 } },
          { package: 'probe-fw-two', version: '2.0.0', probe: { command: 'evaluator/installed-version.mjs', args: ['probe-fw-two'] } },
        ],
      });
      fs.writeFileSync(
        path.join(folder, 'evaluator', 'LEARNED.md'),
        `# Learned evaluation framework\n\n## Framework and installed version\n\n- Installed package and version: \`${FRAMEWORK}@1.0.0\`, \`probe-fw-two@2.0.0\`\n`,
      );
    },
  });
  const ran = evaluate(['run', '--evaluation', project.folder], project.env);
  check(ran.status === 0, `a run declaring two frameworks exited ${ran.status}\n${ran.output}`);
  const runDirectory = runDirectoryOf(project.folder);
  if (ran.status !== 0 || runDirectory === null) return;
  const manifest = readJson(path.join(runDirectory, 'trial-sets', 'P-001', 'isolation-manifest.json'));
  check(
    manifest.resourceCeilings.maxWallClockMinutes === ((30_000 + 60_000 + 2 * (25_000 + 10_000)) * TRIALS) / 60_000,
    `a command run declaring two frameworks: the manifest allows ${manifest.resourceCeilings.maxWallClockMinutes} minutes; expected ${((30_000 + 60_000 + 70_000) * TRIALS) / 60_000}`,
  );

  const capped = frameworkProject('framework-capped-probe-ceiling', {
    timeoutMs: 3000,
    probe: { ...SHIPPED_PROBE, probeTimeoutMs: 60_000 },
  });
  const cappedRun = evaluate(['run', '--evaluation', capped.folder], capped.env);
  check(cappedRun.status === 0, `a successful evaluator-capped run exited ${cappedRun.status}\n${cappedRun.output}`);
  const cappedDirectory = runDirectoryOf(capped.folder);
  if (cappedRun.status !== 0 || cappedDirectory === null) return;
  const cappedManifest = readJson(path.join(cappedDirectory, 'trial-sets', 'P-001', 'isolation-manifest.json'));
  check(
    cappedManifest.resourceCeilings.maxWallClockMinutes === ((30_000 + 3000 + 2 * 3000) * TRIALS) / 60_000,
    `a successful capped run allows ${cappedManifest.resourceCeilings.maxWallClockMinutes} minutes; expected two 3,000ms probe reads per trial`,
  );
  check(
    readJson(path.join(cappedDirectory, 'framework-versions.json')).frameworks[0].effectiveProbeTimeoutMs === 3000,
    'a successful capped run did not record its 3,000ms effective probe bound',
  );
}

/** A stopped run's directory holds no sealed trial record and no trial index. */
function checkNoSealedRecord(what, runDirectory) {
  check(
    runDirectory !== null && recordFiles(runDirectory).length === 0 && !fs.existsSync(path.join(runDirectory, 'trial-sets.json')),
    `${what}: the run sealed a record or wrote a trial index`,
  );
}

/**
 * The installed version binds the evaluator configuration (Story 1.44): the
 * observation is recorded in `framework-versions.json`, the configuration and
 * `run.json`; a score of the recorded run stays byte-stable when the package
 * changes afterwards; a package upgraded under the old declaration, or
 * removed, stops the run with exit 12 before any evaluator trial; and a
 * deliberate upgrade (the declaration and `LEARNED.md` together) runs under a
 * different configuration digest and scoring version.
 */
async function checkInstalledFrameworks() {
  const project = frameworkProject('framework-versions');
  const first = evaluate(['run', '--evaluation', project.folder], project.env);
  check(first.status === 0, `a run with the declared framework installed exited ${first.status}\n${first.output}`);
  const firstRun = runDirectoryOf(project.folder);
  if (first.status !== 0 || firstRun === null) return;
  const observed = [{ package: FRAMEWORK, version: '1.0.0' }];
  check(
    canonical(readJson(path.join(firstRun, 'framework-versions.json'))) ===
      canonical({
        schemaVersion: 1,
        frameworks: [{ package: FRAMEWORK, declaredVersion: '1.0.0', effectiveProbeTimeoutMs: 10_000, observed: observed[0] }],
      }),
    `framework-versions.json is ${fs.readFileSync(path.join(firstRun, 'framework-versions.json'), 'utf8')}`,
  );
  const versionsProblems = schemaProblems('framework-versions');
  check(
    versionsProblems(readJson(path.join(firstRun, 'framework-versions.json'))).length === 0,
    "the run's framework-versions.json is off its runtime schema",
  );
  const configuration = readJson(path.join(firstRun, 'evaluator-configuration.json'));
  check(
    canonical(configuration.decodingParameters['tea.evaluatorFrameworks']) === canonical(observed),
    `the evaluator configuration records ${JSON.stringify(configuration.decodingParameters['tea.evaluatorFrameworks'])}; expected ${JSON.stringify(observed)}`,
  );
  const firstRecord = readJson(path.join(firstRun, 'run.json'));
  check(
    firstRecord.evaluatorConfigurationDigest === 'sha256:1a7fc1dbd34afbc6f7ef3c8b2dbe8790502acd1bf544c80adad1929717c26697',
    `the legacy declaration differs from the engine 6.0 configuration digest: ${firstRecord.evaluatorConfigurationDigest}`,
  );
  check(
    canonical(firstRecord.evaluator.frameworks) === canonical(observed),
    "run.json's evaluator does not record the observed frameworks",
  );
  // A trial reads the declared framework twice beside the evaluator's launch, so the manifest's wall-clock ceiling holds both probe passes.
  const probedManifest = readJson(path.join(firstRun, 'trial-sets', 'P-001', 'isolation-manifest.json'));
  check(
    probedManifest.resourceCeilings.maxWallClockMinutes === ((30_000 + 60_000 + 2 * 1 * 10_000) * TRIALS) / 60_000,
    `a command run declaring one framework: the manifest allows ${probedManifest.resourceCeilings.maxWallClockMinutes} minutes; expected the plan step, the evaluator and two probe passes per trial`,
  );
  const firstScore = scoreRun(project, 'the run with the declared framework');

  // The declaration, its probe and LEARNED.md are layer files: one git does not track is no part of the digest, so check names it.
  for (const [relative, says] of [
    ['evaluator/frameworks.json', 'evaluator/frameworks.json is not tracked by git'],
    ['evaluator/installed-version.mjs', 'the version probe of probe-fw names evaluator/installed-version.mjs, which git does not track'],
    ['evaluator/LEARNED.md', 'evaluator/LEARNED.md is not tracked by git'],
  ]) {
    git(project.folder, ['rm', '--cached', '--quiet', '--', relative]);
    const untracked = evaluate(['check', '--evaluation', project.folder], project.env);
    check(
      untracked.status === 10 && untracked.output.includes(says),
      `${relative} left out of git: check exited ${untracked.status}; expected 10 saying ${says}\n${untracked.output}`,
    );
    git(project.folder, ['add', '--', relative]);
  }

  // The package is upgraded after the run. `score` reads what the run recorded, so the evidence does not move.
  installFramework(project.repository, '2.0.0');
  const rescored = scoreRun(project, 'the recorded run after its package was upgraded');
  check(
    firstScore.evidence['P-002']?.scoringVersion === rescored.evidence['P-002']?.scoringVersion &&
      canonical(firstScore.evidence['P-002']?.reducedProbeOutcomes) === canonical(rescored.evidence['P-002']?.reducedProbeOutcomes),
    'a package upgraded after the run changed what score reads of the recorded run',
  );

  // A new run under the old declaration refuses the upgraded package before any trial.
  const upgraded = evaluate(['run', '--evaluation', project.folder], project.env);
  const upgradedRun = runDirectoryOf(project.folder);
  check(
    upgraded.status === 12 &&
      upgradedRun !== firstRun &&
      upgraded.output.includes('installed probe-fw is 2.0.0, and evaluator/frameworks.json declares 1.0.0'),
    `an upgraded package under the old declaration: run exited ${upgraded.status}; expected 12 naming both versions\n${upgraded.output}`,
  );
  checkNoSealedRecord('an upgraded package under the old declaration', upgradedRun);
  const upgradedArtifact = upgradedRun === null ? null : readJson(path.join(upgradedRun, 'framework-versions.json'));
  check(versionsProblems(upgradedArtifact).length === 0, "a refused run's framework-versions.json is off its runtime schema");
  check(
    upgradedArtifact?.frameworks[0]?.observed?.version === '2.0.0' &&
      upgradedArtifact.frameworks[0].declaredVersion === '1.0.0' &&
      upgradedArtifact.problems?.length === 1 &&
      !fs.existsSync(path.join(upgradedRun, 'evaluator')),
    `an upgraded package under the old declaration: the artifact is ${JSON.stringify(upgradedArtifact)}, or an evaluator trial ran`,
  );

  // Stale documentation: the declaration moved to the installed version and LEARNED.md still records the old one.
  declareFramework(project.folder, { version: '2.0.0', learned: '1.0.0' });
  const stale = evaluate(['check', '--evaluation', project.folder], project.env);
  check(
    stale.status === 10 &&
      stale.output.includes('evaluator/LEARNED.md records probe-fw@1.0.0, and evaluator/frameworks.json declares probe-fw@2.0.0'),
    `a declaration newer than LEARNED.md: check exited ${stale.status}; expected 10 naming both\n${stale.output}`,
  );
  commitAll(project.repository, project.folder, 'a declaration with stale learned facts');
  const staleRun = evaluate(['run', '--evaluation', project.folder], project.env);
  check(staleRun.status === 10, `a declaration newer than LEARNED.md: run exited ${staleRun.status}; expected 10\n${staleRun.output}`);

  // The deliberate upgrade: declaration and LEARNED.md together, no evaluator source or evaluation.json change.
  declareFramework(project.folder, { version: '2.0.0' });
  commitAll(project.repository, project.folder, 'upgrade the framework');
  const second = evaluate(['run', '--evaluation', project.folder], project.env);
  check(second.status === 0, `the run after a deliberate upgrade exited ${second.status}\n${second.output}`);
  const secondRun = runDirectoryOf(project.folder);
  if (second.status === 0 && secondRun !== null) {
    const secondRecord = readJson(path.join(secondRun, 'run.json'));
    check(
      secondRecord.evaluatorConfigurationDigest !== firstRecord.evaluatorConfigurationDigest &&
        canonical(readJson(path.join(secondRun, 'evaluator-configuration.json')).decodingParameters['tea.evaluatorFrameworks']) ===
          canonical([{ package: FRAMEWORK, version: '2.0.0' }]),
      'the run after a deliberate upgrade kept the old evaluator configuration digest',
    );
    const upgradedScore = scoreRun(project, 'the run after a deliberate upgrade');
    check(
      typeof firstScore.evidence['P-002']?.scoringVersion === 'string' &&
        firstScore.evidence['P-002'].scoringVersion !== upgradedScore.evidence['P-002']?.scoringVersion,
      'a deliberate upgrade left the evidence scoring version unchanged',
    );
    checkVotes('the run after a deliberate upgrade', upgradedScore.evidence, 'P-002', 'caught');
  }

  // A package that is not installed: the probe exits 1, the run stops before a trial and keeps what the probe printed.
  fs.rmSync(path.join(project.repository, 'node_modules', FRAMEWORK), { recursive: true });
  const missing = evaluate(['run', '--evaluation', project.folder], project.env);
  const missingRun = runDirectoryOf(project.folder);
  check(
    missing.status === 12 && missing.output.includes('could not read the installed probe-fw') && missing.output.includes('exited 1'),
    `a package that is not installed: run exited ${missing.status}; expected 12 naming it\n${missing.output}`,
  );
  checkNoSealedRecord('a package that is not installed', missingRun);
  const missingArtifact = missingRun === null ? null : readJson(path.join(missingRun, 'framework-versions.json'));
  check(versionsProblems(missingArtifact).length === 0, "a missing package's framework-versions.json is off its runtime schema");
  check(
    missingArtifact?.frameworks[0]?.observed === null &&
      missingArtifact.frameworks[0].stderr.includes('probe-fw is not installed') &&
      !fs.existsSync(path.join(missingRun, 'evaluator')),
    `a package that is not installed: the artifact is ${JSON.stringify(missingArtifact)}, or an evaluator trial ran`,
  );
}

/**
 * The installed version is read again before each launch of the evaluator
 * and after each trial (Story 1.44): a package that changes while the
 * evaluator runs, and one a target changes between two trials, each stop the
 * run at that trial with exit 12 and no sealed record. The probe runs with
 * the evaluator's environment keys and a working directory in the same
 * private parent, and runs 1 + 2 times per trial.
 */
function checkInstalledFrameworksMidRun() {
  const manifestArgs = (repository) => ['--touch', frameworkManifest(repository)];
  const during = frameworkProject('framework-changes-during-trial', { unconfined: true, mode: 'bump-package', args: manifestArgs });
  const duringRun = evaluate(['run', '--evaluation', during.folder], during.env);
  check(
    duringRun.status === 12 &&
      duringRun.output.includes(
        'trial-clean-1 yields no record: the installed frameworks changed while the evaluator ran: installed probe-fw is 9.9.9; the run started with 1.0.0',
      ),
    `a package changed while the evaluator ran: run exited ${duringRun.status}; expected 12 at trial-clean-1\n${duringRun.output}`,
  );
  checkNoSealedRecord('a package changed while the evaluator ran', runDirectoryOf(during.folder));

  const between = frameworkProject('framework-changes-between-trials', { unconfined: true });
  const betweenRun = evaluate(['run', '--evaluation', between.folder], {
    ...between.env,
    VERDICT_WHEN: 'trial-clean-2',
    VERDICT_DO: 'bump',
    VERDICT_TOUCH: frameworkManifest(between.repository),
  });
  const betweenDirectory = runDirectoryOf(between.folder);
  check(
    betweenRun.status === 12 &&
      betweenRun.output.includes(
        "trial-clean-2 yields no record: the installed frameworks changed before the evaluator's launch: installed probe-fw is 9.9.9; the run started with 1.0.0",
      ),
    `a package changed between two trials: run exited ${betweenRun.status}; expected 12 before trial-clean-2's evaluator\n${betweenRun.output}`,
  );
  checkNoSealedRecord('a package changed between two trials', betweenDirectory);
  // Trial 1's evaluator answered; trial 2's never launched, so what its files keep is the fault and no output.
  const keptFile = (name) => path.join(betweenDirectory ?? '', 'evaluator', 'clean', name);
  check(
    betweenDirectory !== null &&
      fs.existsSync(keptFile('trial-1.stdout')) &&
      fs.readFileSync(keptFile('trial-1.stdout'), 'utf8').includes('"rows"') &&
      fs.existsSync(keptFile('trial-2.json')) &&
      readJson(keptFile('trial-2.json')).fault.includes('the installed frameworks changed before') &&
      fs.readFileSync(keptFile('trial-2.stdout')).length === 0,
    'a package changed between two trials: the evaluator did not judge trial 1 and stop before trial 2',
  );

  // The probe is launched as the evaluator is: its environment, its private working directory, once per read, and, in a
  // confined run, under the confinement that makes `evaluator/` read-only (its attempt to write beside itself is refused).
  // The same attempt in a run that opted out succeeds, which is the positive control.
  for (const unconfined of [false, true]) {
    const label = unconfined ? 'opted out' : 'confined';
    const directory = scratch.make(`framework-probe-logs-${label.replace(' ', '-')}`);
    const evaluatorLog = path.join(directory, 'evaluator.jsonl');
    const probeLog = path.join(directory, 'probe.jsonl');
    const launched = frameworkProject(`framework-probe-launch-${label.replace(' ', '-')}`, {
      unconfined,
      environmentKeys: ['TEA_FRAMEWORK_SENTINEL'],
      args: ['--log', evaluatorLog],
      probe: { command: 'evaluator/probe.js', args: ['--package', FRAMEWORK, '--log', probeLog, '--try-write'] },
      extra: ({ repository }) => fs.appendFileSync(path.join(repository, '.gitignore'), '__pycache__/\n'),
    });
    const ran = evaluate(['run', '--evaluation', launched.folder], {
      ...launched.env,
      TEA_FRAMEWORK_SENTINEL: 'set',
      TEA_FRAMEWORK_OTHER: 'unlisted',
    });
    check(ran.status === 0, `a ${label} run with a logging probe exited ${ran.status}\n${ran.output}`);
    if (ran.status !== 0) continue;
    const probes = captures(probeLog);
    const evaluators = captures(evaluatorLog);
    const trials = 2 * TRIALS;
    check(
      evaluators.length === trials && probes.length === 1 + 2 * trials,
      `${label}: the probe ran ${probes.length} time(s) beside ${evaluators.length} evaluator launch(es); expected one read at the start and two per trial (${1 + 2 * trials})`,
    );
    const names = (line) => JSON.stringify(line.environment);
    check(
      probes.every((line) => names(line) === names(evaluators[0])) &&
        evaluators[0].environment.includes('TEA_FRAMEWORK_SENTINEL') &&
        !evaluators[0].environment.includes('TEA_FRAMEWORK_OTHER'),
      `${label}: the probe's environment is not the evaluator's (the base set and evaluator.environmentKeys)`,
    );
    const parents = new Set([...probes, ...evaluators].map((line) => path.dirname(line.cwd)));
    check(
      parents.size === 1 && inPrivateRoot([...parents][0]) && probes.every((line) => !evaluators.some((other) => other.cwd === line.cwd)),
      `${label}: the probe's working directory is not a private directory of its own in the run's private parent`,
    );
    const writes = probes.map((line) => line.write);
    check(
      unconfined
        ? writes.every((write) => write === 'allowed')
        : writes.every((write) => typeof write === 'string' && write.startsWith('refused')),
      `${label}: the probe's write beside itself under evaluator/ was ${JSON.stringify([...new Set(writes)])} in each read; expected ${unconfined ? 'allowed' : 'refused'}`,
    );
  }
}

/**
 * The installed frameworks are read around each calibration launch too (Story
 * 1.44): a command evaluator that scores a rubric is launched once per labelled
 * item before any trial, and a package that changes at the observation before
 * an item or the one after it stops the run with exit 12 and no record. The
 * stub probe flips its version at an exact launch, so each case is
 * deterministic: launch 1 is the read before the first launch of the run.
 */
function checkInstalledFrameworksCalibration() {
  for (const [flipAt, says] of [
    [
      2,
      'judge calibration could not run: the installed frameworks changed before calibration: installed probe-fw is 9.9.9; the run started with 1.0.0',
    ],
    [
      3,
      'judge calibration could not run: the installed frameworks changed during calibration: installed probe-fw is 9.9.9; the run started with 1.0.0',
    ],
  ]) {
    const counter = path.join(scratch.make(`framework-calibration-counter-${flipAt}`), 'launches.txt');
    const project = frameworkProject(`framework-changes-at-calibration-${flipAt}`, {
      probe: { command: 'evaluator/probe.js', args: ['--package', FRAMEWORK, '--flip-at', String(flipAt), '--counter', counter] },
      extra: ({ folder }) => addRubric(folder),
    });
    const ran = evaluate(['run', '--evaluation', project.folder], project.env);
    check(
      ran.status === 12 && ran.output.includes(says),
      `a package changed at the probe read ${flipAt} of a calibrating run: run exited ${ran.status}; expected 12 saying ${says}\n${ran.output}`,
    );
    checkNoSealedRecord(`a package changed at the probe read ${flipAt} of a calibrating run`, runDirectoryOf(project.folder));
  }
}

/** A hanging probe has its own wall clock at every read, including calibration; the evaluator's shorter clock still caps it. */
function checkFrameworkProbeTimeouts() {
  const versionsProblems = schemaProblems('framework-versions');
  check(
    versionsProblems({
      schemaVersion: 1,
      frameworks: [{ package: FRAMEWORK, declaredVersion: '1.0.0', observed: { package: FRAMEWORK, version: '1.0.0' } }],
    }).length === 0,
    'the version 1 framework artifact schema rejected a historical row without effectiveProbeTimeoutMs',
  );
  const reference = fs.readFileSync(path.join(PROJECT_ROOT, 'docs', 'reference', 'tea-evaluate-cli.md'), 'utf8');
  for (const marker of ['`probe.probeTimeoutMs`', '10,000 ms', '60,000 ms', '`evaluator.timeoutMs`', '`effectiveProbeTimeoutMs`'])
    check(reference.includes(marker), `the public Evaluate CLI reference omits ${marker}`);
  const only = process.argv.find((value) => value.startsWith('--only='))?.slice('--only='.length) ?? '';
  const cases = [
    ['initial', 1, false, 450, 15_000],
    ['before trial', 2, false, 450, 15_000],
    ['after trial', 3, false, 450, 15_000],
    ['before calibration', 2, true, 450, 15_000],
    ['after calibration', 3, true, 450, 15_000],
    ['evaluator cap', 1, false, 60_000, 3000],
    ['omitted field', 1, false, undefined, 30_000],
  ];
  for (const [label, hangAt, calibration, declaredTimeoutMs, evaluatorTimeoutMs] of cases) {
    if (only !== '' && label !== only) continue;
    const counter = path.join(scratch.make(`framework-timeout-${label.replaceAll(' ', '-')}`), 'reads.txt');
    const project = frameworkProject(`framework-timeout-${label.replaceAll(' ', '-')}`, {
      timeoutMs: evaluatorTimeoutMs,
      probe: {
        command: 'evaluator/probe.js',
        args: ['--package', FRAMEWORK, '--hang-at', String(hangAt), '--counter', counter],
        ...(declaredTimeoutMs === undefined ? {} : { probeTimeoutMs: declaredTimeoutMs }),
      },
      extra: calibration ? ({ folder }) => addRubric(folder) : undefined,
    });
    const started = performance.now();
    const ran = evaluate(['run', '--evaluation', project.folder], project.env);
    const elapsedMs = performance.now() - started;
    const effectiveMs = Math.min(declaredTimeoutMs ?? 10_000, evaluatorTimeoutMs);
    const runDirectory = runDirectoryOf(project.folder);
    check(
      fs.existsSync(counter) && Number(fs.readFileSync(counter, 'utf8')) === hangAt,
      `${label}: the probe did not hang at its intended read ${hangAt}`,
    );
    check(
      ran.status === 12 && ran.output.includes(`still running at its ${effectiveMs}ms probe timeout`),
      `${label}: a hanging probe exited ${ran.status}; expected 12 naming ${effectiveMs}ms\n${ran.output}`,
    );
    if (label === 'evaluator cap')
      check(ran.output.includes('capped by evaluator.timeoutMs'), `${label}: the fault omitted the evaluator cap hint\n${ran.output}`);
    check(
      elapsedMs < effectiveMs + 9000,
      `${label}: a hanging probe took ${Math.round(elapsedMs)}ms; expected its ${effectiveMs}ms bound plus 9,000ms of startup and supervisor cleanup`,
    );
    checkNoSealedRecord(`${label} probe timeout`, runDirectory);
    const artifact = runDirectory === null ? null : readJson(path.join(runDirectory, 'framework-versions.json'));
    check(
      artifact?.frameworks[0]?.effectiveProbeTimeoutMs === effectiveMs && schemaProblems('framework-versions')(artifact).length === 0,
      `${label}: framework-versions.json does not record the effective ${effectiveMs}ms bound: ${JSON.stringify(artifact)}`,
    );
    if (label === 'omitted field')
      check(
        artifact?.frameworks[0]?.observed === null &&
          artifact.frameworks[0].fault?.includes(`still running at its ${effectiveMs}ms probe timeout`),
        `${label}: the initial artifact did not keep the null observation and timeout fault: ${JSON.stringify(artifact)}`,
      );
  }

  const firstCounter = path.join(scratch.make('framework-first-fault'), 'first.txt');
  const secondCounter = path.join(scratch.make('framework-second-skipped'), 'second.txt');
  const two = frameworkProject('framework-stop-after-first-fault', {
    timeoutMs: 15_000,
    probe: {
      command: 'evaluator/probe.js',
      args: ['--package', FRAMEWORK, '--hang-at', '1', '--counter', firstCounter],
      probeTimeoutMs: 450,
    },
    extra: ({ folder, repository }) => {
      writeJson(path.join(repository, 'node_modules', 'probe-fw-two', 'package.json'), { name: 'probe-fw-two', version: '2.0.0' });
      writeJson(path.join(folder, 'evaluator', 'frameworks.json'), {
        schemaVersion: 1,
        frameworks: [
          {
            package: FRAMEWORK,
            version: '1.0.0',
            probe: {
              command: 'evaluator/probe.js',
              args: ['--package', FRAMEWORK, '--hang-at', '1', '--counter', firstCounter],
              probeTimeoutMs: 450,
            },
          },
          {
            package: 'probe-fw-two',
            version: '2.0.0',
            probe: {
              command: 'evaluator/probe.js',
              args: ['--package', 'probe-fw-two', '--hang-at', '1', '--counter', secondCounter],
              probeTimeoutMs: 800,
            },
          },
        ],
      });
      fs.writeFileSync(
        path.join(folder, 'evaluator', 'LEARNED.md'),
        `# Learned evaluation framework\n\n## Framework and installed version\n\n- Installed package and version: \`${FRAMEWORK}@1.0.0\`, \`probe-fw-two@2.0.0\`\n`,
      );
    },
  });
  const twoRun = evaluate(['run', '--evaluation', two.folder], two.env);
  const twoDirectory = runDirectoryOf(two.folder);
  const twoArtifact = twoDirectory === null ? null : readJson(path.join(twoDirectory, 'framework-versions.json'));
  check(
    twoRun.status === 12 && fs.existsSync(firstCounter) && !fs.existsSync(secondCounter),
    `a fault in the first framework still launched the second probe: exit ${twoRun.status}, second counter exists ${fs.existsSync(secondCounter)}\n${twoRun.output}`,
  );
  checkNoSealedRecord('a first framework probe fault', twoDirectory);
  check(
    schemaProblems('framework-versions')(twoArtifact).length === 0 &&
      twoArtifact?.frameworks.length === 2 &&
      twoArtifact.frameworks[0].effectiveProbeTimeoutMs === 450 &&
      twoArtifact.frameworks[1].effectiveProbeTimeoutMs === 800 &&
      twoArtifact.frameworks[1].observed === null &&
      twoArtifact.frameworks[1].fault?.includes('not probed because an earlier framework probe failed'),
    `a first probe fault left an incomplete artifact: ${JSON.stringify(twoArtifact)}`,
  );
}

/**
 * `run` reads the declaration from the layer's own bytes (`readFrameworks`), and
 * refuses what `check` refuses (Story 1.44): an absent or malformed
 * declaration, and a probe the layer lacks or cannot execute, each as an
 * `EvaluatorLayerError` (`run` exit 10).
 */
async function checkFrameworkDeclarationRefusedByRun() {
  const engine = await loadEngine();
  const contract = readJson(path.join(FIXTURE, EVALUATION, 'contract.json'));
  const root = scratch.make('framework-declaration-unit');
  fs.cpSync(COMMAND_EVALUATOR, path.join(root, 'evaluator'), { recursive: true });
  const declaration = path.join(root, 'evaluator', 'frameworks.json');
  const layer = () =>
    readEvaluatorLayer({
      folder: root,
      evaluation: { evaluator: { kind: 'command', command: 'evaluator/rows.js', timeoutMs: 1 } },
      contract,
      engine,
    });
  const refusal = (edit) => {
    const original = fs.readFileSync(declaration);
    try {
      edit();
      layer();
      return null;
    } catch (error) {
      return error instanceof EvaluatorLayerError ? error.message : `${error.name}: ${error.message}`;
    } finally {
      fs.writeFileSync(declaration, original);
      fs.chmodSync(path.join(root, 'evaluator', 'probe.js'), 0o755);
      fs.writeFileSync(path.join(root, 'evaluator', 'probe.js'), fs.readFileSync(path.join(COMMAND_EVALUATOR, 'probe.js')));
    }
  };
  check(canonical(layer().frameworks) === '[]', 'an empty declaration was not read as no framework');
  for (const [what, edit, says] of [
    ['an absent declaration', () => fs.rmSync(declaration), 'evaluator/frameworks.json cannot be read'],
    ['a declaration that is no JSON', () => fs.writeFileSync(declaration, 'not json'), 'evaluator/frameworks.json cannot be read'],
    [
      'a version range',
      () =>
        writeJson(declaration, {
          schemaVersion: 1,
          frameworks: [{ package: FRAMEWORK, version: '^1.0.0', probe: { command: 'evaluator/probe.js' } }],
        }),
      'frameworks[0].version must be the one exact version expected',
    ],
    [
      'a probe the layer lacks',
      () => {
        declareFramework(root, { version: '1.0.0', probe: { command: 'evaluator/absent.js' } });
      },
      'evaluator/absent.js is not a regular file',
    ],
    [
      'a probe that is not executable',
      () => {
        declareFramework(root, { version: '1.0.0', probe: { command: 'evaluator/probe.js' } });
        fs.chmodSync(path.join(root, 'evaluator', 'probe.js'), 0o644);
      },
      'evaluator/probe.js is not executable',
    ],
  ]) {
    const said = refusal(edit);
    check(
      said !== null && said.includes(says),
      `${what}: readEvaluatorLayer said ${JSON.stringify(said)}; expected a refusal saying ${says}`,
    );
  }

  // The same three variants committed in a project: `run` exits 10 with `check`'s finding and seals nothing.
  const project = frameworkProject('framework-declaration-run');
  const frameworksFile = path.join(project.folder, 'evaluator', 'frameworks.json');
  for (const [what, edit, says] of [
    ['frameworks.json removed', () => fs.rmSync(frameworksFile), 'evaluator/frameworks.json: [evaluator]'],
    [
      'a version range',
      () => declareFramework(project.folder, { version: '^1.0.0', learned: '1.0.0' }),
      'frameworks[0].version must be the one exact version expected',
    ],
    [
      'the probe file deleted',
      () => fs.rmSync(path.join(project.folder, 'evaluator', 'installed-version.mjs')),
      'which is not a regular file',
    ],
  ]) {
    edit();
    commitAll(project.repository, project.folder, what);
    const refused = evaluate(['run', '--evaluation', project.folder], project.env);
    check(
      refused.status === 10 && refused.output.includes(says),
      `${what}: run exited ${refused.status}; expected 10 saying ${says}\n${refused.output}`,
    );
    // A run refused at `check` may leave no run directory at all; one it left holds no record.
    const left = runDirectoryOf(project.folder);
    if (left !== null) checkNoSealedRecord(what, left);
    fs.copyFileSync(VERSION_PROBE, path.join(project.folder, 'evaluator', 'installed-version.mjs'));
    fs.chmodSync(path.join(project.folder, 'evaluator', 'installed-version.mjs'), 0o755);
    declareFramework(project.folder, { version: '1.0.0' });
    commitAll(project.repository, project.folder, `restore after ${what}`);
  }
}

/** What a probe's output can be: the observation, or a fault naming why there is none. */
async function checkFrameworkProbeShapes() {
  const root = scratch.make('framework-probe-shapes');
  fs.cpSync(COMMAND_EVALUATOR, path.join(root, 'evaluator'), { recursive: true });
  installFramework(root, '1.0.0');
  const evaluator = { kind: 'command', command: 'evaluator/rows.js', timeoutMs: 30_000 };
  const read = async (args) => {
    const [entry] = await observeFrameworks({
      folder: root,
      evaluator,
      frameworks: [{ package: FRAMEWORK, version: '1.0.0', probe: { command: 'evaluator/probe.js', args } }],
      scratch: [],
    });
    return entry;
  };
  const exact = await read([]);
  check(
    exact.fault === null && canonical(exact.observed) === canonical({ package: FRAMEWORK, version: '1.0.0' }),
    `the stub probe's observation is ${JSON.stringify(exact)}`,
  );
  for (const [args, says] of [
    [['--mode', 'wrong-package'], 'it reports the package "another-package" where probe-fw is declared'],
    [['--mode', 'garbage'], 'its output is not one JSON object'],
    [['--mode', 'extra-key'], 'its output must be an object with exactly the properties package and version'],
    [['--mode', 'empty-version'], 'its package and version must be strings, the version not empty'],
    [['--mode', 'exit-1'], 'exited 1'],
    [['--package', 'nonesuch'], 'exited 1: nonesuch is not installed'],
  ]) {
    const entry = await read(args);
    check(
      entry.observed === null && entry.fault?.includes(says),
      `a probe run with ${args.join(' ')}: the entry is ${JSON.stringify(entry)}; expected a fault saying ${says}`,
    );
  }
  // The declaration's runtime schema and the rules `check` applies agree on the shapes below.
  const declarationSchema = schemaProblems('evaluator-frameworks');
  const entry = { package: 'acme-evals', version: '1.2.3', probe: { command: 'evaluator/installed-version.mjs', args: ['acme-evals'] } };
  for (const [what, declaration, valid] of [
    ['the empty list', { schemaVersion: 1, frameworks: [] }, true],
    ['one framework', { schemaVersion: 1, frameworks: [entry] }, true],
    ['minimum probe timeout', { schemaVersion: 1, frameworks: [{ ...entry, probe: { ...entry.probe, probeTimeoutMs: 1 } }] }, true],
    ['maximum probe timeout', { schemaVersion: 1, frameworks: [{ ...entry, probe: { ...entry.probe, probeTimeoutMs: 60_000 } }] }, true],
    ...[0, 60_001, 1.5, '10000'].map((probeTimeoutMs) => [
      `invalid probe timeout ${JSON.stringify(probeTimeoutMs)}`,
      { schemaVersion: 1, frameworks: [{ ...entry, probe: { ...entry.probe, probeTimeoutMs } }] },
      false,
    ]),
    ['a scoped package', { schemaVersion: 1, frameworks: [{ ...entry, package: '@acme/evals' }] }, true],
    ['another schema version', { schemaVersion: 2, frameworks: [] }, false],
    ['a wildcard version', { schemaVersion: 1, frameworks: [{ ...entry, version: '1.x' }] }, false],
    ['a tag for a version', { schemaVersion: 1, frameworks: [{ ...entry, version: 'latest' }] }, false],
    ['a probe outside evaluator/', { schemaVersion: 1, frameworks: [{ ...entry, probe: { command: 'node' } }] }, false],
    ['an unknown property', { schemaVersion: 1, frameworks: [], note: 'x' }, false],
  ]) {
    check(
      (declarationSchema(declaration).length === 0) === valid && (declarationProblems(declaration).length === 0) === valid,
      `${what}: the declaration schema and declarationProblems disagree (expected ${valid ? 'valid' : 'refused'})`,
    );
  }
  const none = await observeFrameworks({ folder: root, evaluator, frameworks: [], scratch: [] });
  check(none.length === 0, 'a dependency-free declaration launched a probe');

  // A failed probe's output is kept whole in the entry and cut to 2000 characters in the run artifact.
  const noisy = await read(['--mode', 'noisy']);
  const recorded = versionsRecord([{ package: FRAMEWORK, version: '1.0.0' }], [noisy], ['a problem']).frameworks[0];
  check(
    noisy.stdout.length === 5000 &&
      noisy.stderr.length === 5000 &&
      recorded.stdout === 'x'.repeat(2000) &&
      recorded.stderr === 'y'.repeat(2000),
    `a probe printing 5000 characters: the entry holds ${noisy.stdout.length} and ${noisy.stderr.length}, the artifact ${recorded.stdout?.length} and ${recorded.stderr?.length}; expected 5000 and 2000`,
  );

  // A probe that never exits is stopped at the evaluator's timeout, one that is absent or not executable cannot start.
  const hung = await observeFrameworks({
    folder: root,
    evaluator: { ...evaluator, timeoutMs: 1500 },
    frameworks: [{ package: FRAMEWORK, version: '1.0.0', probe: { command: 'evaluator/probe.js', args: ['--mode', 'hang'] } }],
    scratch: [],
  });
  check(
    hung[0].observed === null && hung[0].fault?.includes('was still running at its 1500ms probe timeout'),
    `a probe that never exits: the entry is ${JSON.stringify(hung[0])}`,
  );
  fs.writeFileSync(path.join(root, 'evaluator', 'not-executable.js'), '#!/usr/bin/env node\n');
  for (const [command, code] of [
    ['evaluator/absent.js', 'ENOENT'],
    ['evaluator/not-executable.js', 'EACCES'],
  ]) {
    const [entry] = await observeFrameworks({
      folder: root,
      evaluator,
      frameworks: [{ package: FRAMEWORK, version: '1.0.0', probe: { command, args: [] } }],
      scratch: [],
    });
    check(
      entry.observed === null &&
        (entry.fault ?? '').startsWith(`the version probe of probe-fw (${command}) could not start: spawn `) &&
        entry.fault.endsWith(code),
      `a probe that cannot start (${command}): ${JSON.stringify(entry)}`,
    );
  }

  // The shipped probe: a scoped package, a manifest that is no JSON, and a name that leaves node_modules.
  fs.copyFileSync(VERSION_PROBE, path.join(root, 'evaluator', 'installed-version.mjs'));
  fs.chmodSync(path.join(root, 'evaluator', 'installed-version.mjs'), 0o755);
  writeJson(path.join(root, 'node_modules', '@acme', 'scoped', 'package.json'), { name: '@acme/scoped', version: '3.2.1' });
  fs.mkdirSync(path.join(root, 'node_modules', 'broken'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules', 'broken', 'package.json'), '{');
  for (const [name, expectObserved, says] of [
    ['@acme/scoped', { package: '@acme/scoped', version: '3.2.1' }, null],
    ['broken', null, 'does not describe broken with a version: '],
    ['..', null, 'usage: installed-version.mjs <package name>'],
  ]) {
    const [entry] = await observeFrameworks({
      folder: root,
      evaluator,
      frameworks: [{ package: name, version: '3.2.1', probe: { command: 'evaluator/installed-version.mjs', args: [name] } }],
      scratch: [],
    });
    check(
      expectObserved === null
        ? entry.observed === null && entry.fault?.includes(says)
        : entry.fault === null && canonical(entry.observed) === canonical(expectObserved),
      `the shipped probe over ${name}: the entry is ${JSON.stringify(entry)}`,
    );
  }
}

/**
 * Every case in run order with the group it belongs to.
 * CI runs the groups as five scripts so no one runner carries the whole file's wall time.
 * They are `--group=evaluators`, `--group=agents` and `--group=records`.
 * `--group=held-attempts` holds an evaluator attempt's score call to its inputs over real eval-quality (Story 1.69).
 * `--group=private` runs confined sealed-brief agents and signal-ended runs over the run's private directories (Story 1.58).
 * With no `--group` every case runs.
 */
const CASES = [
  { name: 'the units', body: checkUnits, group: 'evaluators' },
  { name: 'a framework probe reads one observation or a fault', body: checkFrameworkProbeShapes, group: 'evaluators' },
  { name: 'run refuses a bad framework declaration', body: checkFrameworkDeclarationRefusedByRun, group: 'agents' },
  { name: 'the probe passes are inside the trial ceiling', body: checkProbePassesInCeiling, group: 'agents' },
  { name: 'the installed framework versions bind the configuration', body: checkInstalledFrameworks, group: 'agents' },
  { name: 'the installed framework versions held during the run', body: checkInstalledFrameworksMidRun, group: 'agents' },
  { name: 'the installed framework versions held around calibration', body: checkInstalledFrameworksCalibration, group: 'agents' },
  { name: 'an installed package patch changes scoring', body: checkInstalledFrameworkTreePatch, group: 'agents' },
  { name: 'an undeclared package patch keeps the legacy digest', body: checkLegacyFrameworkPatch, group: 'agents' },
  { name: 'a lockfile entry changes scoring', body: checkInstalledFrameworkLockfile, group: 'agents' },
  { name: 'npm lockfile generations and linked entries', body: checkLockfileProbeVersions, group: 'agents' },
  { name: 'tree metadata changes the install digest', body: checkTreeProbeMetadata, group: 'agents' },
  { name: 'a hoisted plugin needs its own declaration', body: checkTransitiveFrameworkDeclaration, group: 'agents' },
  { name: 'a nested package resolves through its importer chain', body: checkNestedFrameworkResolution, group: 'agents' },
  { name: 'a linked importer resolves from its real path', body: checkLinkedImporterResolution, group: 'agents' },
  { name: 'separate importer trees cover same-name nested copies', body: checkSeparateImporterTrees, group: 'agents' },
  { name: 'a missing declared install digest stops the run', body: checkMissingFrameworkInstallDigest, group: 'agents' },
  { name: 'an installed package patch stops an in-flight run', body: checkInstalledFrameworkDigestMidRun, group: 'agents' },
  { name: 'a lockfile edit stops an in-flight run', body: checkLockfileDigestMidRun, group: 'agents' },
  { name: 'an install digest is held during calibration', body: checkFrameworkDigestCalibration, group: 'agents' },
  { name: 'framework probes stop at their effective timeout at every read', body: checkFrameworkProbeTimeouts, group: 'agents' },
  { name: 'the direction gate', body: checkDirectionGate, group: 'evaluators' },
  { name: 'the reference names the denial reasons', body: checkReferenceNamesDenialReasons, group: 'evaluators' },
  { name: 'the reference qualifies the sealed-brief agent', body: checkReferenceQualifiesSealedBriefAgent, group: 'evaluators' },
  { name: 'a denied command trial step', body: checkCommandTrialDenial, group: 'evaluators' },
  { name: 'the bridge', body: checkBridge, group: 'evaluators' },
  { name: "the run's private parent", body: checkPrivateParent, group: 'private' },
  { name: "the bridge and the run's private directories withheld from a target", body: checkBridgePrivateDirectories, group: 'private' },
  { name: 'the command evaluator row shapes', body: checkCommandRowShapes, group: 'evaluators' },
  { name: 'command and agent calibration disagreement', body: checkCalibrationDisagreementAcrossEvaluators, group: 'evaluators' },
  { name: 'calibration follows its evidence channel', body: checkCalibrationFollowsEvidenceChannel, group: 'evaluators' },
  { name: 'calibration preserves a JSON channel root', body: checkCalibrationJsonRoot, group: 'evaluators' },
  { name: 'calibration rejects an invalid captured snapshot', body: checkCalibrationSnapshotGuard, group: 'evaluators' },
  { name: 'calibration holds the adopter tree', body: checkCalibrationHoldsAdopterTree, group: 'evaluators' },
  { name: 'an unwitnessed quote', body: checkUnwitnessedQuote, group: 'evaluators' },
  { name: 'evaluators outside the import contract', body: checkEvaluatorFailures, group: 'evaluators' },
  { name: 'a hung evaluator', body: checkEvaluatorTimeout, group: 'evaluators' },
  { name: 'the set recommendation', body: checkSetRecommendation, group: 'evaluators' },
  { name: 'the evaluator run in place', body: checkEvaluatorInPlace, group: 'agents' },
  { name: 'the evaluation layer confined', body: checkLayerWritesRefused, group: 'evaluators' },
  { name: 'the evaluation layer held to its bytes', body: checkEvaluatorLayerHeld, group: 'agents' },
  { name: 'the scratch removal', body: checkScratchRemoval, group: 'private' },
  { name: 'a signal mid-trial', body: checkSignalMidTrial, group: 'private' },
  { name: 'an oracle two behaviors declare', body: checkSharedOracle, group: 'agents' },
  { name: 'the sealed-brief agent', body: checkSealedBriefAgent, group: 'agents' },
  { name: 'agent version knowledge stays in the adapter', body: checkAgentVersionAdapterBoundary, group: 'evaluators' },
  { name: 'installed agent version changes the run configuration', body: checkAgentVersionUpgrade, group: 'evaluators' },
  { name: 'unreadable installed agent versions stop before qualification', body: checkAgentVersionFaults, group: 'evaluators' },
  {
    name: 'an agent version probe receives only declared environment keys and refuses a delimiter',
    body: checkAgentVersionEnvironmentAndDelimiter,
    group: 'evaluators',
  },
  {
    name: 'post-trial and post-attempt agent version reads count in sealed resource use',
    body: checkAgentVersionPostTrialUse,
    group: 'evaluators',
  },
  {
    name: 'an installed agent version changing during the run stops the attempt or trial',
    body: checkAgentVersionMoves,
    group: 'evaluators',
  },
  { name: 'the sealed-brief agent qualified', body: checkEvaluatorQualification, group: 'agents' },
  { name: 'a qualification attempt in an unexpected state', body: checkQualificationUnexpectedState, group: 'agents' },
  { name: 'an arm agrees as its lowest probe', body: checkQualificationLowestProbe, group: 'agents' },
  { name: 'the other arms are not qualified', body: checkQualificationSkipsOtherArms, group: 'agents' },
  { name: 'a qualification attempt holds the adopter tree', body: checkQualificationHoldsAdopterTree, group: 'agents' },
  { name: 'the sealed-brief agent edges', body: checkSealedBriefAgentEdges, group: 'agents' },
  { name: "an evaluator attempt's call is held to its inputs", body: checkHeldAttempts, group: 'held-attempts' },
  { name: 'a later probe, a later attempt and an Invalid attempt are held', body: checkHeldAttemptsLaterProbes, group: 'held-attempts' },
  { name: 'a call with an undocumented exit still stops the run', body: checkHeldAttemptsUndocumentedExit, group: 'held-attempts' },
  { name: "an evaluator attempt's inputs are held through the writer", body: checkHeldAttemptInputsUnit, group: 'held-attempts' },
  { name: 'scoreAttempt routes its inputs through score-inputs.js', body: checkScoreAttemptRoutesThroughTheModule, group: 'held-attempts' },
  { name: 'the records evaluator', body: checkRecordsEvaluator, group: 'records' },
  { name: 'imported rubric scores calibrated', body: checkImportedRubricCalibration, group: 'records' },
  { name: 'imported rubric scores below the minimum', body: checkImportedCalibrationBelowMinimum, group: 'records' },
  { name: 'imported calibration changes the scoring version', body: checkImportedCalibrationChangesScoringVersion, group: 'records' },
  { name: 'the reference names the scorer input', body: checkImportedCalibrationReferenceExample, group: 'records' },
  { name: 'the emitted calibration inputs feed a harness', body: checkCalibrationInputs, group: 'records' },
  { name: 'the calibration inputs are documented', body: checkCalibrationInputsDocumented, group: 'records' },
  {
    name: 'imported files sealed against the final configuration',
    body: checkImportedFilesSealedAgainstTheConfiguration,
    group: 'records',
  },
];
/** Story 1.69's cases, for `--held-attempts-only` (the revert checks, which can narrow them with `--only=<text>`). */
const HELD_ATTEMPT_CASES = CASES.filter(({ group }) => group === 'held-attempts');
const GROUPS = new Set(CASES.map(({ group }) => group));

/** Runs one case; an exception is a failed check, so the cases after it still run and every failure is reported. */
async function runCase(name, body) {
  try {
    await body();
  } catch (error) {
    check(false, `${name} could not finish: ${error.stack ?? error}`);
  }
}

/** The `--group=<name>` argument's value, `null` when the flag is absent, `''` when it carries no name. */
function requestedGroup() {
  const argument = process.argv.find((value) => value === '--group' || value.startsWith('--group='));
  return argument === undefined ? null : argument.slice('--group='.length);
}

async function main() {
  const group = requestedGroup();
  if (group !== null && !GROUPS.has(group)) {
    console.error(
      `${colors.red}unknown --group ${JSON.stringify(group)}:${colors.reset} expected one of ${[...GROUPS].map((name) => `--group=${name}`).join(', ')}`,
    );
    return 2;
  }
  try {
    // `--layer-only` runs the confined evaluation layer's case alone (Story 1.31's revert checks).
    if (process.argv.includes('--layer-only')) {
      await runCase('the evaluation layer confined', checkLayerWritesRefused);
      return report();
    }
    // `--qualification-only` runs Story 1.34's cases alone (its revert checks).
    if (process.argv.includes('--qualification-only')) {
      await runCase('the sealed-brief agent qualified', checkEvaluatorQualification);
      await runCase('a qualification attempt in an unexpected state', checkQualificationUnexpectedState);
      await runCase('an arm agrees as its lowest probe', checkQualificationLowestProbe);
      await runCase('the other arms are not qualified', checkQualificationSkipsOtherArms);
      await runCase('a qualification attempt holds the adopter tree', checkQualificationHoldsAdopterTree);
      return report();
    }
    if (process.argv.includes('--agent-version-only')) {
      const only = process.argv.find((value) => value.startsWith('--only='))?.slice('--only='.length) ?? '';
      for (const { name, body } of [
        { name: 'agent version knowledge stays in the adapter', body: checkAgentVersionAdapterBoundary },
        { name: 'installed agent version changes the run configuration', body: checkAgentVersionUpgrade },
        { name: 'unreadable installed agent versions stop before qualification', body: checkAgentVersionFaults },
        {
          name: 'an agent version probe receives only declared environment keys and refuses a delimiter',
          body: checkAgentVersionEnvironmentAndDelimiter,
        },
        { name: 'post-trial and post-attempt agent version reads count in sealed resource use', body: checkAgentVersionPostTrialUse },
        { name: 'an installed agent version changing during the run stops the attempt or trial', body: checkAgentVersionMoves },
      ])
        if (name.includes(only)) await runCase(name, body);
      return report();
    }
    // `--held-attempts-only` runs Story 1.69's cases alone (its revert checks); `--only=<text>` keeps those whose name has the text.
    if (process.argv.includes('--held-attempts-only')) {
      const only = process.argv.find((value) => value.startsWith('--only='))?.slice('--only='.length) ?? '';
      for (const { name, body } of HELD_ATTEMPT_CASES) if (name.includes(only)) await runCase(name, body);
      return report();
    }
    // `--frameworks-only` runs Story 1.44's cases alone (its revert checks), the configuration unit included.
    if (process.argv.includes('--install-state-only')) {
      const only = process.argv.find((value) => value.startsWith('--only='))?.slice('--only='.length) ?? '';
      for (const { name, body } of [
        { name: 'the units', body: checkUnits },
        ...CASES.filter(
          (entry) =>
            entry.name.includes('install digest') ||
            entry.name.includes('package patch') ||
            entry.name.includes('lockfile') ||
            entry.name.includes('tree metadata') ||
            entry.name.includes('hoisted plugin') ||
            entry.name.includes('nested package') ||
            entry.name.includes('linked importer') ||
            entry.name.includes('importer trees'),
        ),
      ])
        if (name.includes(only)) await runCase(name, body);
      return report();
    }
    if (process.argv.includes('--frameworks-only')) {
      await runCase('the units', checkUnits);
      await runCase('a framework probe reads one observation or a fault', checkFrameworkProbeShapes);
      await runCase('run refuses a bad framework declaration', checkFrameworkDeclarationRefusedByRun);
      await runCase('the probe passes are inside the trial ceiling', checkProbePassesInCeiling);
      await runCase('the installed framework versions bind the configuration', checkInstalledFrameworks);
      await runCase('the installed framework versions held during the run', checkInstalledFrameworksMidRun);
      await runCase('the installed framework versions held around calibration', checkInstalledFrameworksCalibration);
      await runCase('an installed package patch changes scoring', checkInstalledFrameworkTreePatch);
      await runCase('an undeclared package patch keeps the legacy digest', checkLegacyFrameworkPatch);
      await runCase('a lockfile entry changes scoring', checkInstalledFrameworkLockfile);
      await runCase('npm lockfile generations and linked entries', checkLockfileProbeVersions);
      await runCase('tree metadata changes the install digest', checkTreeProbeMetadata);
      await runCase('a hoisted plugin needs its own declaration', checkTransitiveFrameworkDeclaration);
      await runCase('a nested package resolves through its importer chain', checkNestedFrameworkResolution);
      await runCase('a linked importer resolves from its real path', checkLinkedImporterResolution);
      await runCase('separate importer trees cover same-name nested copies', checkSeparateImporterTrees);
      await runCase('a missing declared install digest stops the run', checkMissingFrameworkInstallDigest);
      await runCase('an installed package patch stops an in-flight run', checkInstalledFrameworkDigestMidRun);
      await runCase('a lockfile edit stops an in-flight run', checkLockfileDigestMidRun);
      await runCase('an install digest is held during calibration', checkFrameworkDigestCalibration);
      return report();
    }
    if (process.argv.includes('--probe-timeouts-only')) {
      await runCase('framework probes stop at their effective timeout at every read', checkFrameworkProbeTimeouts);
      return report();
    }
    if (process.argv.includes('--probe-ceiling-only')) {
      await runCase('the probe passes are inside the trial ceiling', checkProbePassesInCeiling);
      return report();
    }
    // `--imported-calibration-only` runs Story 1.40's cases alone (its revert checks).
    if (process.argv.includes('--imported-calibration-only')) {
      await runCase('the records evaluator', checkRecordsEvaluator);
      await runCase('imported rubric scores calibrated', checkImportedRubricCalibration);
      await runCase('imported rubric scores below the minimum', checkImportedCalibrationBelowMinimum);
      await runCase('imported calibration changes the scoring version', checkImportedCalibrationChangesScoringVersion);
      await runCase('the emitted calibration inputs feed a harness', checkCalibrationInputs);
      await runCase('the calibration inputs are documented', checkCalibrationInputsDocumented);
      await runCase('imported files sealed against the final configuration', checkImportedFilesSealedAgainstTheConfiguration);
      return report();
    }
    // `--calibration-inputs-only` runs Story 1.67's case alone (its revert checks).
    if (process.argv.includes('--calibration-inputs-only')) {
      await runCase('the emitted calibration inputs feed a harness', checkCalibrationInputs);
      await runCase('the calibration inputs are documented', checkCalibrationInputsDocumented);
      await runCase('imported files sealed against the final configuration', checkImportedFilesSealedAgainstTheConfiguration);
      return report();
    }
    for (const { name, body, group: caseGroup } of CASES) {
      if (group === null || caseGroup === group) await runCase(name, body);
    }
    for (const { label, directory } of runtimeTemps) {
      const left = fs.readdirSync(directory);
      check(left.length === 0, `the ${label} project's runs left ${JSON.stringify(left)} in their temp directory`);
    }
  } finally {
    scratch.removeAll();
  }
  return report();
}

function report() {
  if (failures.length > 0) {
    console.error(`${colors.red}${failures.length} of ${checks} tea-evaluate evaluator check(s) failed:${colors.reset}`);
    for (const failure of failures) console.error(`  - ${failure}`);
    return 1;
  }
  console.log(`${colors.green}ok${colors.reset} all ${checks} tea-evaluate evaluator check(s) passed`);
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(`${colors.red}the tea-evaluate evaluators test could not run:${colors.reset} ${error.stack ?? error}`);
    process.exitCode = 2;
  },
);
