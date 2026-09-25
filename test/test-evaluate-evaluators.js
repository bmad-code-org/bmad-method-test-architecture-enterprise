/**
 * `tea-evaluate run` and `score` over every evaluation layer AD-21 admits,
 * end to end over the real installed eval-quality (Story 1.17).
 *
 * Every end-to-end case builds a temp git project from
 * `test/fixtures/evaluate/mutation/` (the verdict command, which judges its
 * request by `rules/policy.txt`; P-001 a clean control, P-002 seeded by M-001,
 * which relaxes the policy so the command rejects) with `VERDICT_MARKER` set,
 * so every launch of the target appends a marker line.
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
 *   tree digest covers the files git tracks there, and a command evaluator
 *   runs from the run's snapshot of them, so what it writes beside itself
 *   stays out of the evaluation folder.
 * - An oracle two behaviors declare, judged through one key, catches the
 *   second behavior's probe under a command evaluator and a sealed-brief
 *   agent.
 * - Sealed-brief agent: the stub agent through the `custom` adapter, whose
 *   whole prompt and tool configuration hold the sealed brief and none of the
 *   contract's checks, plan literals, step IDs or operation IDs, acts through
 *   the bridge; its call is recorded `evaluator-chosen` beside the plan's
 *   `baseline` observation, and the clean arm resolves `passed-clean-control`
 *   and the mutated arm `caught`. An unlisted executable is denied with
 *   eval-quality's reason and never launches; an agent that fails, answers
 *   with no block, with a forged nonce or with two blocks yields exit 12; a
 *   call carrying the nonce is refused unsent and uncounted.
 * - The bridge, driven by an MCP client: one tool per interface with a
 *   kind-generic shape, an authorized call recorded with the routed working
 *   directory, an unlisted executable, an `mcp` and an `api` call denied by
 *   eval-quality with no launch, an authorized call matching no operation
 *   recorded as unmatched, and the budget held; a gameability router denying
 *   an ungranted call as the real arm does.
 * - Records: a harness's sealed records are validated and copied unchanged,
 *   `score` hands eval-quality the adopter's bytes and passes its exit
 *   through, and a record off its schema exits 10 before any `score` call.
 * - Framework neutrality: an import of an unlisted package under `cli/`
 *   fails `eval-quality-gates dependency-direction` in a copy of the tree.
 * - Units: the row conversion, the command-line call reading, the bridged
 *   run's configuration bytes, and an api operation's path template kept
 *   from the agent.
 *
 * Usage: node test/test-evaluate-evaluators.js
 */

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const { ENGINE_CLI_ENV, engineCliPath, loadEngine } = require('../cli/lib/evaluate/engine');
const { createArtifactValidator } = require('../cli/lib/evaluate/records');
const { registryFromEvaluation } = require('../cli/lib/evaluate/registry');
const { hostEnvironmentPort } = require('../cli/lib/evaluate/arm');
const { AGENT_ADAPTERS, bridgedArgsRefused } = require('../cli/lib/agent-adapters');
const { runSupervised } = require('../cli/lib/run-agent');
const { configurationFields } = require('../cli/lib/evaluate/evaluators');
const { bridgeTools, openBridge } = require('../cli/lib/evaluate/bridge');
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
const { scratchDirectories } = require('./lib/scratch-directories');

const PROJECT_ROOT = path.join(__dirname, '..');
const EVALUATE = path.join(PROJECT_ROOT, 'cli', 'evaluate.js');
const FIXTURE = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'mutation');
const EVALUATORS = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'evaluators');
const COMMAND_EVALUATOR = path.join(EVALUATORS, 'command', 'evaluator');
const STUB_AGENT = path.join(EVALUATORS, 'stub-evaluator-agent.js');
const ENGINE_SHIM = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'engine-shim.js');
const EVALUATION = path.join('evals', 'verdict');
const TRIALS = 3;
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

/** A temp git repository from the fixture, `edit` applied before the first commit, with a private temp directory and a marker file. */
function makeProject(label, { edit = () => {} } = {}) {
  const directory = scratch.make(label);
  const repository = path.join(directory, 'repository');
  fs.cpSync(FIXTURE, repository, { recursive: true, filter: (from) => path.basename(from) !== 'runs' });
  fs.writeFileSync(path.join(repository, '.gitignore'), 'vendor/\n');
  const folder = path.join(repository, EVALUATION);
  const marker = path.join(directory, 'launches.jsonl');
  const temp = scratch.make(`${label}-temp`);
  runtimeTemps.push({ label, directory: temp });
  const project = { repository, folder, marker, directory, env: { TMPDIR: temp, TMP: temp, TEMP: temp, VERDICT_MARKER: marker } };
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
  const names = fs.existsSync(runs) ? fs.readdirSync(runs).filter((name) => name !== '.gitignore') : [];
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
    for (const probeId of fs.readdirSync(path.join(scores, latest)).filter((name) => name !== 'score.json')) {
      const file = path.join(scores, latest, probeId, 'evidence-artifact.json');
      evidence[probeId] = fs.existsSync(file) ? readJson(file) : null;
    }
  }
  return { evidence, output: scored.output };
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
 * The command evaluator runs from the run's snapshot of the files git tracks
 * under evaluator/: what it writes beside itself stays out of the evaluation
 * folder, a file git does not track (ignored or not) moves no digest, and
 * `check` refuses an executable git does not track.
 */
async function checkEvaluatorSnapshot() {
  const engine = await loadEngine();
  const log = path.join(scratch.make('snapshot-log'), 'evaluator.jsonl');
  const project = makeProject('command-snapshot', {
    edit: ({ folder, repository }) => {
      useCommandEvaluator(folder, { mode: 'write-beside', args: ['--log', log] });
      fs.appendFileSync(path.join(repository, '.gitignore'), '*.pyc\n');
      fs.writeFileSync(path.join(folder, 'evaluator', 'stale.pyc'), 'an ignored file git does not track\n');
    },
  });
  const treeDigestOf = (runDirectory) =>
    readJson(path.join(runDirectory, 'evaluator-configuration.json')).decodingParameters['tea.evaluatorTreeDigest'];
  const ran = evaluate(['run', '--evaluation', project.folder], project.env);
  check(ran.status === 0, `a command evaluator writing beside itself: run exited ${ran.status}; expected 0\n${ran.output}`);
  const runDirectory = runDirectoryOf(project.folder);
  if (ran.status !== 0 || runDirectory === null) return;
  check(
    !fs.existsSync(path.join(project.folder, 'evaluator', '__pycache__')),
    'the command evaluator wrote into the evaluation folder, so it did not run from the snapshot',
  );
  const selves = fs
    .readFileSync(log, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line).self);
  check(
    selves.length === 2 * TRIALS && selves.every((self) => !self.startsWith(project.repository) && !fs.existsSync(self)),
    `the command evaluator ran from ${JSON.stringify(selves)}; expected a snapshot outside the project, removed afterwards`,
  );
  // The tree digest covers exactly the files git tracks under evaluator/, so the ignored stale.pyc is no part of it.
  const tracked = git(project.folder, ['ls-files', '-z', '--', 'evaluator'])
    .split('\0')
    .filter((relative) => relative.length > 0)
    .sort()
    .map((relative) => ({ path: relative, sha256: sha256(fs.readFileSync(path.join(project.folder, relative))).slice(7) }));
  check(
    tracked.length === 2 && treeDigestOf(runDirectory) === engine.digestArtifact(tracked, 'evaluator-tree'),
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
  // The stub wrote its pids as it started, so the run ended within the 5 s timeout, the supervisor's 2 s grace and what
  // remains of the run after it; a stop that waited far past the wall clock fails this bound.
  if (fs.existsSync(pids)) {
    const ranFor = ended - fs.statSync(pids).mtimeMs;
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
    const deadline = Date.now() + 5000;
    while ((alive(recorded.evaluator) || alive(recorded.child)) && Date.now() < deadline)
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    check(
      !alive(recorded.evaluator) && !alive(recorded.child),
      `a hung evaluator: its process group outlived the timeout (${JSON.stringify(recorded)})`,
    );
  }
}

// -------------------------------------------------------------- sealed-brief agent

/** The sealed-brief agent wired into `folder`: the stub through the `custom` adapter, its mapping, and its model snapshot. */
function useSealedBriefAgent(folder, { capture, mode = 'normal', budget = 3, rubric = false, targetModel = null }) {
  fs.mkdirSync(path.join(folder, 'evaluator'), { recursive: true });
  fs.copyFileSync(path.join(COMMAND_EVALUATOR, 'mapping.json'), path.join(folder, 'evaluator', 'mapping.json'));
  editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
    evaluation.evaluator = {
      kind: 'sealed-brief-agent',
      agent: 'custom',
      agentCommand: process.execPath,
      agentArgs: [STUB_AGENT, '--capture', capture, '--mode', mode],
      timeoutMs: 60_000,
    };
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
    edit: ({ folder }) => useSealedBriefAgent(folder, { capture, rubric: true, targetModel: 'a-target-model' }),
  });
  const ran = evaluate(['run', '--evaluation', project.folder], project.env);
  check(ran.status === 0, `a sealed-brief agent run exited ${ran.status}; expected 0\n${ran.output}`);
  const runDirectory = runDirectoryOf(project.folder);
  if (ran.status !== 0 || runDirectory === null) return;
  const brief = readJson(path.join(runDirectory, 'sealed-evaluator-brief.json'));
  const contract = readJson(path.join(project.folder, 'contract.json'));
  const calls = captures(capture);
  check(calls.length === 2 * TRIALS, `the stub agent ran ${calls.length} time(s); expected ${2 * TRIALS}`);
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
  const { evidence } = scoreRun(project, 'the sealed-brief agent run');
  checkVotes('the sealed-brief agent run', evidence, 'P-001', 'passed-clean-control');
  checkVotes('the sealed-brief agent run', evidence, 'P-002', 'caught');
}

async function checkSealedBriefAgentEdges() {
  // An executable the registry does not grant is denied by eval-quality's adapter and never launches.
  const capture = path.join(scratch.make('sealed-unlisted-capture'), 'captures.jsonl');
  const unlisted = makeProject('sealed-unlisted', { edit: ({ folder }) => useSealedBriefAgent(folder, { capture, mode: 'unlisted' }) });
  const ran = evaluate(['run', '--evaluation', unlisted.folder], unlisted.env);
  check(ran.status === 0, `a sealed-brief run with a denied call exited ${ran.status}; expected 0\n${ran.output}`);
  const runDirectory = runDirectoryOf(unlisted.folder);
  if (runDirectory !== null) {
    const evidence = readJson(path.join(runDirectory, 'evaluator', 'clean', 'trial-1.json'));
    const [denied] = evidence.calls ?? [];
    check(
      denied?.denied?.code === 'forbidden-target' && denied.denied.detail.includes('"not-registered"') && denied.observation === undefined,
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
  for (const [mode, says] of Object.entries(faults)) {
    const failCapture = path.join(scratch.make(`sealed-${mode}-capture`), 'captures.jsonl');
    const project = makeProject(`sealed-${mode}`, { edit: ({ folder }) => useSealedBriefAgent(folder, { capture: failCapture, mode }) });
    const failed = evaluate(['run', '--evaluation', project.folder], project.env);
    check(failed.status === 12, `a sealed-brief agent in mode ${mode}: run exited ${failed.status}; expected 12\n${failed.output}`);
    const directory = runDirectoryOf(project.folder);
    check(recordFiles(directory).length === 0, `a sealed-brief agent in mode ${mode} wrote a record`);
    check(
      directory !== null && fs.existsSync(path.join(directory, 'evaluator', 'clean', 'trial-1.stdout')),
      `a sealed-brief agent in mode ${mode}: its streams are not persisted`,
    );
    const fault = path.join(directory ?? '', 'evaluator', 'clean', 'trial-1.json');
    check(
      fs.existsSync(fault) && String(readJson(fault).fault).includes(says),
      `a sealed-brief agent in mode ${mode}: the persisted fault does not say "${says}"`,
    );
  }
  // A call carrying the trial's answer nonce is refused unsent and not counted: under a budget of one, the agent's
  // next call still runs and the run completes.
  const leakCapture = path.join(scratch.make('sealed-leak-capture'), 'captures.jsonl');
  const leak = makeProject('sealed-leak', {
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
      ['a second connection with the token', bridge.server.env.TEA_EVALUATE_BRIDGE_TOKEN],
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
        ['trial-1-call-5', 3, 'evaluator-chosen', 'judge-request'],
      ]),
    `the bridge recorded ${JSON.stringify(router.observations.map((observation) => [observation.observationId, observation.sequence, observation.provenance, observation.operationId]))}`,
  );
  const outcomes = router.calls.map((entry) => {
    if (entry.denied !== undefined) return `denied:${entry.denied.reason ?? entry.denied.code}`;
    if (entry.unmatched) return 'unmatched';
    if (entry.refused !== undefined) return 'refused';
    return entry.operationId;
  });
  check(
    JSON.stringify(outcomes) ===
      JSON.stringify([
        'judge-request',
        'denied:forbidden-target',
        'denied:forbidden-target',
        'denied:interface-not-authorized',
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
  commitAll(project.repository, project.folder, "the harness's records");

  const ran = evaluate(['run', '--evaluation', project.folder], project.env);
  check(ran.status === 0, `a records run exited ${ran.status}; expected 0\n${ran.output}`);
  const runDirectory = runDirectoryOf(project.folder);
  if (ran.status !== 0 || runDirectory === source) return;
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
  const { evidence } = scoreRun(project, 'a records run');
  checkVotes('a records run', evidence, 'P-001', 'passed-clean-control');
  checkVotes('a records run', evidence, 'P-002', 'caught');

  // score hands eval-quality the adopter's own bytes: the logging shim's --record files equal the harness's.
  const log = path.join(scratch.make('records-shim'), 'argv.jsonl');
  scoreRun(project, 'a records run under the shim', 0, { [ENGINE_CLI_ENV]: ENGINE_SHIM, TEA_EVALUATE_SHIM_LOG: log });
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
  const commandFields = (args) =>
    configurationFields({
      layer: { evaluator: { kind: 'command', command: 'evaluator/rows.js', args, timeoutMs: 1 }, treeDigest: 't', executableDigest: 'e' },
      conditions: { schemaVersion: 1, modelSnapshot: 'none', systemPromptDigest: 'd', evaluator: { modelSnapshot: 'a-grader' } },
      judgeConfiguration: null,
      digestBytes: engine.digestBytes,
    }).decodingParameters;
  check(
    JSON.stringify(deterministic.decodingParameters) === '{"tea.evaluatorKind":"deterministic"}' &&
      JSON.stringify(commandFields(['--a'])) !== JSON.stringify(commandFields(['--b'])) &&
      commandFields([])['tea.evaluatorModelSnapshot'] === 'a-grader',
    'the evaluator configuration does not carry the kind, the wiring and the command model',
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

/** Runs one case; an exception is a failed check, so the cases after it still run and every failure is reported. */
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
    await runCase('the direction gate', checkDirectionGate);
    await runCase('the bridge', checkBridge);
    await runCase('the command evaluator row shapes', checkCommandRowShapes);
    await runCase('an unwitnessed quote', checkUnwitnessedQuote);
    await runCase('evaluators outside the import contract', checkEvaluatorFailures);
    await runCase('a hung evaluator', checkEvaluatorTimeout);
    await runCase('the set recommendation', checkSetRecommendation);
    await runCase('the evaluator snapshot', checkEvaluatorSnapshot);
    await runCase('an oracle two behaviors declare', checkSharedOracle);
    await runCase('the sealed-brief agent', checkSealedBriefAgent);
    await runCase('the sealed-brief agent edges', checkSealedBriefAgentEdges);
    await runCase('the records evaluator', checkRecordsEvaluator);
    for (const { label, directory } of runtimeTemps) {
      const left = fs.readdirSync(directory);
      check(left.length === 0, `the ${label} project's runs left ${JSON.stringify(left)} in their temp directory`);
    }
  } finally {
    scratch.removeAll();
  }
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
