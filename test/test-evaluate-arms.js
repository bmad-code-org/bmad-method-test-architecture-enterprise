/**
 * `tea-evaluate run`'s gameability and historical arms and its rubric judge,
 * end to end over the real installed eval-quality (Story 1.9, AD-6, AD-7,
 * AD-8, AD-9, AD-22).
 *
 * Every case builds a temp git project from `test/fixtures/evaluate/mutation/`
 * (the verdict command, `bin/verdict.js`, which judges its request by
 * `rules/policy.txt`) with `VERDICT_MARKER` set, so every launch of the
 * target appends a marker line naming the workspace it ran in and the commit
 * its checkout holds.
 *
 * - Gameability: a project whose only probe is P-003, a gameability probe on
 *   B-001 whose naive oracle is O-002 (B-002: the run prints a verdict line)
 *   and whose degenerate response, `corpus/gameability/P-003.json`, prints
 *   `verdict: pending`. The arm launches nothing (the only marker lines are the
 *   preflight's sensitivity-witness legs in the pristine workspace), `run` writes
 *   the naive-satisfied and disciplined-rejected evidence, materializes a
 *   probe eval-quality's `qualifyProbe` admits with no failure code, and seals
 *   the `gameability:P-003` arm, which `score` reduces to `caught`. A response
 *   the naive oracle rejects, and one the disciplined oracle accepts, each
 *   exit 11 under `run` and `preflight` alike, and `preflight` qualifies the
 *   good one.
 * - Historical: a three-commit project (the policy lenient, then the fix that
 *   makes it strict, then the probe) with a clean control and P-004, whose
 *   natural defect the fix removed. The fail-before arm runs at the fix's
 *   parent and fails, the pass-after arm at the fix and passes, the witness
 *   leg runs in a worktree at the parent (its observation's workspace and the
 *   marker's commit say so), the trials of `historical:<parent>` run at the
 *   parent, the probe's digests are the ones Story 1.9 names, `qualifyProbe`
 *   admits it, and `score` reduces it to `caught`. A fix commit before which
 *   the oracle already held exits 11.
 * - Historical refusals and weaknesses: an unknown fix commit, one on a side
 *   branch the evaluated commit does not contain, and a pre-fix revision with
 *   no `launch.root` are each refused beside a clean control that still runs;
 *   a fix commit that does not fix the defect exits 11 naming the pass-after
 *   arm. A controlled mutation and a historical probe share one run, each
 *   witness leg in its own workspace, both caught.
 * - One commit: a historical probe whose fix commit has no parent is refused
 *   with its reason in `run.json` and `refused/`, left out of `probes.json`
 *   and the trial sets, and the rest of the run seals and scores; a run whose
 *   every probe was refused exits 12 with nothing sealed.
 * - Rubric: a contract declaring R-101, judged by the stub judge through the
 *   `custom` agent adapter: one judge call per trial (six over two arms of
 *   three), a `judgeResults` entry per criterion in every record, the judge's
 *   model snapshot and the instruction template's digest as
 *   `judgeConfiguration`, and every prompt carrying the template, the anchors,
 *   the penalties and the evidence and none of the contract, its oracles or its
 *   `testData`; scored with the real engine. A judge that fails yields no
 *   record and exit 12, its streams kept in the trial's evidence, and one that
 *   scores off the scale or replies with no JSON reaches eval-quality as
 *   unscored results, which it reads as Invalid.
 * - No rubric: the Story 1.8 project (which `check` refuses to pair with a
 *   judge block) runs with `judgeConfiguration` null and every `judgeResults`
 *   empty, and `judgeRubrics` handed a working stub judge and a contract with
 *   no rubric never calls it.
 * - Units: the judge reply parser, the judge configuration, the synthetic
 *   port, and `createWorkspace`'s commit option.
 *
 * Usage: node test/test-evaluate-arms.js
 */

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { ENGINE_CLI_ENV, loadEngine } = require('../cli/lib/evaluate/engine');
const { syntheticPort } = require('../cli/lib/evaluate/gameability');
const { JUDGE_INSTRUCTIONS, judgeConfigurationFor, judgeResultsFrom, judgeRubrics } = require('../cli/lib/evaluate/judge');
const { createArtifactValidator } = require('../cli/lib/evaluate/records');
const { WorkspaceRefusal, createWorkspace, removeWorkspace } = require('../cli/lib/evaluate/workspace');
const { scratchDirectories } = require('./lib/scratch-directories');

const PROJECT_ROOT = path.join(__dirname, '..');
const EVALUATE = path.join(PROJECT_ROOT, 'cli', 'evaluate.js');
const FIXTURE = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'mutation');
const STUB_JUDGE = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'stub-judge.js');
const EVALUATION = path.join('evals', 'verdict');
const TRIALS = 3;
const JUDGE_SNAPSHOT = 'stub-judge-2026-09';

const BASE_ENV = Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== ENGINE_CLI_ENV && !name.startsWith('GIT_')));
const GIT_IDENTITY = ['-c', 'user.name=TeA test', '-c', 'user.email=tea-test@example.test', '-c', 'core.hooksPath=/dev/null'];
const GIT_ENV = { ...BASE_ENV, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
const SPAWN_TIMEOUT_MS = 180_000;

const colors = { reset: '\u001B[0m', red: '\u001B[31m', green: '\u001B[32m' };

const failures = [];
let checks = 0;
const scratch = scratchDirectories('tea-evaluate-arms');
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

/** A file a run should have written, parsed; a missing one is a failed check and reads as `null`. */
function written(file, what) {
  if (!fs.existsSync(file)) {
    check(false, `${what}: ${path.basename(path.dirname(file))}/${path.basename(file)} was not written`);
    return null;
  }
  return readJson(file);
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

/** P-002's signature with another predicate literal, for a probe whose defect prints `text` on stdout. */
function signatureFor(folder, text) {
  const signature = structuredClone(readJson(path.join(folder, 'probes', 'P-002.probe.json')).defectSignature);
  signature.condition.predicate = { op: 'containment', operands: [{ pointer: '/interactions/observed/stdout' }, { literal: text }] };
  return signature;
}

/** B-002 and its oracle O-002, the naive check: the run prints a verdict line and exits 0, whatever the verdict. */
function addNaiveBehavior(folder) {
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
 * A temp git repository from the fixture, `edit` applied before the first
 * commit, with a private temp directory and a marker file for its runs.
 */
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

/** Scores the newest run and returns each probe's evidence artifact by probe. */
function scoreRun(project, what, expectedExit = 0) {
  const scored = evaluate(['score', '--evaluation', project.folder], project.env);
  check(scored.status === expectedExit, `${what}: score exited ${scored.status}; expected ${expectedExit}\n${scored.output}`);
  const runDirectory = runDirectoryOf(project.folder);
  const scores = path.join(runDirectory, 'scores');
  const latest = fs.existsSync(scores) ? fs.readdirSync(scores).sort().at(-1) : undefined;
  if (latest === undefined) return {};
  const evidence = {};
  for (const probeId of fs.readdirSync(path.join(scores, latest))) {
    const file = path.join(scores, latest, probeId, 'evidence-artifact.json');
    evidence[probeId] = fs.existsSync(file) ? readJson(file) : null;
  }
  return evidence;
}

/** Each trial's vote for a probe equals `state`, over `TRIALS` trials. */
function checkVotes(what, evidence, probeId, state) {
  const votes = (evidence[probeId]?.reducedProbeOutcomes?.[0]?.trialVotes ?? []).map((vote) => vote.state);
  check(
    votes.length === TRIALS && votes.every((vote) => vote === state),
    `${what}: ${probeId}'s trial votes are ${JSON.stringify(votes)}; expected ${state} in each of ${TRIALS}`,
  );
}

/** A materialized probe admitted by eval-quality's own qualification gate with no failure code. */
function checkQualifies(engine, what, probe, contract) {
  const home = engine.resolveHomeOperation(probe.defectSignature, contract.permittedInterfaces);
  const admission = engine.qualifyProbe(probe, home);
  check(
    admission.qualified === true && admission.failures.length === 0,
    `${what}: qualifyProbe refuses ${probe.probeId}: ${JSON.stringify(admission.failures)}`,
  );
}

/** A reference's digest is the digest of the file it names, relative to the evaluation folder. */
function checkReference(what, folder, reference) {
  const file = path.join(folder, reference?.path ?? '');
  check(
    reference?.storage === 'public' && fs.existsSync(file) && reference.digest === sha256(fs.readFileSync(file)),
    `${what}: the reference ${JSON.stringify(reference)} does not name the bytes the run wrote`,
  );
}

/** The trial records of one probe's set, read from the run directory. */
function recordsOf(runDirectory, probeId) {
  const index = readJson(path.join(runDirectory, 'trial-sets.json'));
  const set = index.trialSets.find((candidate) => candidate.probeId === probeId);
  return set === undefined ? [] : set.records.map((relative) => readJson(path.join(runDirectory, relative)));
}

// ---------------------------------------------------------------- gameability

/** A project whose one probe is the gameability probe P-003, its degenerate response printing `stdout`. */
function makeGameabilityProject(label, stdout) {
  return makeProject(label, {
    edit: ({ folder }) => {
      addNaiveBehavior(folder);
      const signature = signatureFor(folder, 'verdict: pending');
      fs.rmSync(path.join(folder, 'probes'), { recursive: true });
      fs.rmSync(path.join(folder, 'mutations'), { recursive: true });
      writeJson(path.join(folder, 'probes', 'P-003.probe.json'), {
        probeId: 'P-003',
        probeClass: 'gameability',
        behaviorId: 'B-001',
        expectedClean: false,
        rationale: 'Gameability: a shortcut answer prints a verdict line without judging the request.',
        defects: [],
        defectSignature: signature,
        qualification: {
          route: 'gameability',
          degenerateResponse:
            'Prints a verdict line that names no real verdict (verdict: pending) and exits 0, without judging the request.',
          naiveOracle: 'O-002',
        },
      });
      writeJson(path.join(folder, 'corpus', 'gameability', 'P-003.json'), {
        schemaVersion: 1,
        steps: { 'judge-run': { stdout, stderr: '', exitCode: 0 } },
      });
      editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
        evaluation.arms = ['gameability'];
      });
    },
  });
}

async function checkGameability() {
  const engine = await loadEngine();
  const validate = createArtifactValidator();
  const project = makeGameabilityProject('gameability', 'request: Judge the request.\nverdict: pending\n');
  const ran = evaluate(['run', '--evaluation', project.folder], project.env);
  check(ran.status === 0, `a gameability run exited ${ran.status}; expected 0\n${ran.output}`);
  // The gameability arm launches nothing: the only launches are the preflight's sensitivity-witness legs in the
  // pristine workspace, and nothing runs the interaction plan's request, in a trial or a qualification.
  const launched = launches(project);
  check(
    launched.length > 0 && launched.every((line) => line.workspace === 'pristine' && line.request !== 'Judge the request.'),
    `the gameability arm launched the target: ${JSON.stringify(launched)}`,
  );
  const runDirectory = runDirectoryOf(project.folder);
  if (runDirectory === null) {
    check(false, 'the gameability run wrote no run directory');
    return;
  }
  const naive = written(path.join(runDirectory, 'qualification', 'P-003', 'naive-oracle-satisfied.json'), 'the naive evidence');
  const disciplined = written(
    path.join(runDirectory, 'qualification', 'P-003', 'disciplined-oracle-rejected.json'),
    'the disciplined evidence',
  );
  check(
    naive?.verdict === 'held' &&
      JSON.stringify(naive.oracles.map((oracle) => [oracle.oracleId, oracle.disposition])) === '[["O-002","held"]]',
    `the naive oracle over the degenerate response is ${JSON.stringify(naive?.oracles)}`,
  );
  check(
    disciplined?.verdict === 'violated' &&
      JSON.stringify(disciplined.oracles.map((oracle) => [oracle.oracleId, oracle.disposition])) === '[["O-001","violated"]]',
    `the disciplined oracle over the degenerate response is ${JSON.stringify(disciplined?.oracles)}`,
  );
  const responseBytes = fs.readFileSync(path.join(project.folder, 'corpus', 'gameability', 'P-003.json'));
  check(
    naive?.degenerateResponse?.digest === sha256(responseBytes) && naive?.degenerateResponse?.path === 'corpus/gameability/P-003.json',
    `the gameability evidence names the degenerate response ${JSON.stringify(naive?.degenerateResponse)}`,
  );
  const probe = written(path.join(runDirectory, 'probes', 'P-003.probe.json'), 'the materialized gameability probe');
  const contract = readJson(path.join(project.folder, 'contract.json'));
  if (probe !== null) {
    for (const problem of await validate('probe', probe)) check(false, `P-003 fails its published schema: ${problem}`);
    check(probe.qualification.route === 'gameability', `P-003 is materialized on the ${probe.qualification.route} route`);
    checkReference('the naive evidence reference', project.folder, probe.qualification.naiveOracleSatisfiedEvidence);
    checkReference('the disciplined evidence reference', project.folder, probe.qualification.disciplinedOracleRejectedEvidence);
    check(
      probe.artifactDigest === probe.implementationDigest,
      'a gameability probe records an artifactDigest other than its implementationDigest',
    );
    checkQualifies(engine, 'the gameability probe', probe, contract);
  }
  const records = recordsOf(runDirectory, 'P-003');
  check(records.length === TRIALS, `the gameability trial set holds ${records.length} records; expected ${TRIALS}`);
  for (const record of records) {
    check(record.conditionArm === 'gameability:P-003', `a gameability record carries arm ${record.conditionArm}`);
    check(
      record.observations.every(
        (observation) => observation.provenance === 'evaluator-chosen' && observation.stdout.value.includes('verdict: pending'),
      ),
      `gameability trial ${record.trialIndex}'s observations are not the degenerate response, evaluator-chosen`,
    );
    check(
      record.findings.length === 1 && record.findings[0].oracleId === 'O-001' && record.findings[0].probeId === 'P-003',
      `gameability trial ${record.trialIndex} files ${JSON.stringify(record.findings.map((finding) => finding.oracleId))}`,
    );
  }
  const manifest = readJson(path.join(runDirectory, 'trial-sets', 'P-003', 'isolation-manifest.json'));
  check(
    JSON.stringify(manifest.allowedMounts) === '[]' && JSON.stringify(manifest.observedToolCalls) === '[]',
    `the gameability arm's manifest grants ${JSON.stringify(manifest.allowedMounts)} and observed ${JSON.stringify(manifest.observedToolCalls)}`,
  );
  const evidence = scoreRun(project, 'the gameability run');
  checkVotes('the gameability run', evidence, 'P-003', 'caught');

  // A degenerate response the naive oracle rejects, and one the disciplined oracle accepts, prove nothing.
  for (const [label, stdout, named] of [
    ['gameability-naive-rejects', 'request: Judge the request.\n', 'the naive oracle O-002 is violated'],
    ['gameability-disciplined-accepts', 'request: Judge the request.\nverdict: accepted\n', 'is held where it must be violated'],
  ]) {
    const weak = makeGameabilityProject(label, stdout);
    const weakRun = evaluate(['run', '--evaluation', weak.folder], weak.env);
    check(
      weakRun.status === 11 && weakRun.output.includes(named),
      `${label}: run exited ${weakRun.status}; expected 11 saying "${named}"\n${weakRun.output}`,
    );
    const weakDirectory = runDirectoryOf(weak.folder);
    check(
      weakDirectory === null || !fs.existsSync(path.join(weakDirectory, 'trial-sets.json')),
      `${label}: a gameability probe that does not qualify was sealed`,
    );
    // preflight qualifies gameability probes in the same pipeline, so it refuses the same response.
    const weakPreflight = evaluate(['preflight', '--evaluation', weak.folder], weak.env);
    check(
      weakPreflight.status === 11 && weakPreflight.output.includes(named),
      `${label}: preflight exited ${weakPreflight.status}; expected 11 saying "${named}"\n${weakPreflight.output}`,
    );
  }
  const preflight = evaluate(['preflight', '--evaluation', project.folder], project.env);
  const preflightDirectory = runDirectoryOf(project.folder);
  check(
    preflight.status === 0 &&
      preflightDirectory !== null &&
      fs.existsSync(path.join(preflightDirectory, 'qualification', 'P-003', 'disciplined-oracle-rejected.json')) &&
      fs.existsSync(path.join(preflightDirectory, 'probes', 'P-003.probe.json')),
    `preflight over the gameability project exited ${preflight.status} without qualifying P-003\n${preflight.output}`,
  );
}

// ----------------------------------------------------------------- historical

/**
 * A three-commit project: the policy as `before`, the fix commit that makes it
 * strict, then the historical probe P-004 naming the fix, beside the clean
 * control P-001.
 */
function makeHistoricalProject(
  label,
  { before = 'mode: lenient\n', fixFile = 'rules/policy.txt', keepMutation = false, fixCommitOf = ({ fix }) => fix } = {},
) {
  const project = makeProject(label, {
    edit: ({ repository, folder }) => {
      fs.writeFileSync(path.join(repository, 'rules', 'policy.txt'), before);
      if (!keepMutation) {
        fs.rmSync(path.join(folder, 'probes', 'P-002.probe.json'));
        fs.rmSync(path.join(folder, 'mutations'), { recursive: true });
      }
      editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
        evaluation.arms = keepMutation ? ['clean', 'mutated', 'historical'] : ['clean', 'historical'];
      });
    },
  });
  const { repository, folder } = project;
  fs.writeFileSync(path.join(repository, ...fixFile.split('/')), fixFile === 'rules/policy.txt' ? 'mode: strict\n' : 'a fix elsewhere\n');
  const fix = commitAll(repository, folder, 'fix: judge by the strict policy');
  const seeded = readJson(path.join(FIXTURE, EVALUATION, 'probes', 'P-002.probe.json'));
  writeJson(path.join(folder, 'probes', 'P-004.probe.json'), historicalProbe(seeded, fixCommitOf({ fix, repository })));
  project.commit = commitAll(repository, folder, 'the historical probe');
  project.fix = fix;
  project.parent = git(repository, ['rev-parse', `${fix}^1`]).trim();
  return project;
}

/** P-004: P-002's defect, found in history instead of planted, named by the commit that fixed it. */
function historicalProbe(seeded, fixCommit) {
  const [defect] = seeded.defects;
  return {
    probeId: 'P-004',
    probeClass: 'defect',
    behaviorId: 'B-001',
    expectedClean: false,
    rationale: 'Historical defect: before its fix commit the policy was lenient, and the verdict command rejected the request on stdout.',
    defects: [
      {
        ...defect,
        summary: 'The lenient policy the fix replaced made the verdict command reject a request it must accept.',
        source: 'natural',
        manifestationWitness: {
          ...defect.manifestationWitness,
          legId: 'manifest-pre-fix',
          relation: {
            op: 'containment',
            operands: [{ pointer: '/interactions/manifest-pre-fix/stdout' }, { literal: 'verdict: rejected' }],
          },
        },
      },
    ],
    defectSignature: seeded.defectSignature,
    qualification: { route: 'historical', fixCommit },
  };
}

async function checkHistorical() {
  const engine = await loadEngine();
  const validate = createArtifactValidator();
  const project = makeHistoricalProject('historical');
  const { parent, fix, repository, folder } = project;
  const ran = evaluate(['run', '--evaluation', folder], project.env);
  check(ran.status === 0, `a historical run exited ${ran.status}; expected 0\n${ran.output}`);
  const runDirectory = runDirectoryOf(folder);
  if (runDirectory === null) {
    check(false, 'the historical run wrote no run directory');
    return;
  }
  const failBefore = written(path.join(runDirectory, 'qualification', 'P-004', 'fail-before.json'), 'the fail-before evidence');
  const passAfter = written(path.join(runDirectory, 'qualification', 'P-004', 'pass-after.json'), 'the pass-after evidence');
  check(
    failBefore?.commit === parent && failBefore?.verdict === 'violated',
    `the fail-before arm ran at ${failBefore?.commit} with verdict ${failBefore?.verdict}; expected ${parent} and violated`,
  );
  check(
    passAfter?.commit === fix && passAfter?.verdict === 'held',
    `the pass-after arm ran at ${passAfter?.commit} with verdict ${passAfter?.verdict}; expected ${fix} and held`,
  );

  // The witness leg ran in a worktree at the pre-fix revision, which its observation and the target's own checkout name.
  const observations = fs
    .readdirSync(path.join(runDirectory, 'observations'))
    .map((name) => readJson(path.join(runDirectory, 'observations', name)));
  const leg = observations.find((observation) => observation.legId === 'manifest-pre-fix');
  check(
    leg?.workspace === `historical:${parent}` && path.basename(path.dirname(leg.cwd)).startsWith(`tea-evaluate-historical-${parent}-`),
    `the witness leg ran in ${leg?.workspace} at ${leg?.cwd}; expected the pre-fix worktree at ${parent}`,
  );
  check(
    observations
      .filter((observation) => observation.legId !== 'manifest-pre-fix')
      .every((observation) => observation.workspace === 'pristine'),
    'a leg no witness names ran outside the pristine workspace',
  );
  const byWorkspace = (prefix) => launches(project).filter((line) => line.workspace?.startsWith(prefix));
  check(
    byWorkspace(`historical-${parent}`).length === 1 && byWorkspace(`historical-${parent}`)[0].head === parent,
    `the witness leg's launch reads ${JSON.stringify(byWorkspace(`historical-${parent}`))}; expected one at ${parent}`,
  );
  check(
    byWorkspace('qualify-P-004-fail-before')[0]?.head === parent && byWorkspace('qualify-P-004-pass-after')[0]?.head === fix,
    `the qualification arms launched at ${byWorkspace('qualify-P-004-fail-before')[0]?.head} and ${byWorkspace('qualify-P-004-pass-after')[0]?.head}`,
  );
  const trialLaunches = byWorkspace(`trial-historical-${parent}-`);
  check(
    trialLaunches.length === TRIALS && trialLaunches.every((line) => line.head === parent),
    `the historical trials launched at ${JSON.stringify(trialLaunches.map((line) => line.head))}; expected ${TRIALS} at ${parent}`,
  );

  const probe = written(path.join(runDirectory, 'probes', 'P-004.probe.json'), 'the qualified historical probe');
  const contract = readJson(path.join(folder, 'contract.json'));
  if (probe !== null) {
    for (const problem of await validate('probe', probe)) check(false, `P-004 fails its published schema: ${problem}`);
    const qualification = probe.qualification;
    check(qualification.route === 'historical', `P-004 is materialized on the ${qualification.route} route`);
    checkReference('the fail-before reference', folder, qualification.failBeforeEvidence);
    checkReference('the pass-after reference', folder, qualification.passAfterEvidence);
    check(
      qualification.fixCommitDigest === sha256(Buffer.from(fix, 'utf8')),
      `P-004's fixCommitDigest ${qualification.fixCommitDigest} is not the digest of ${fix}`,
    );
    check(qualification.oracleStableAcrossRevisions === true, 'P-004 records its oracle as unstable across the revisions');
    const listing = git(repository, ['ls-tree', '-r', '-z', `${parent}^{tree}`])
      .split('\u0000')
      .filter((entry) => entry.length > 0 && !entry.slice(entry.indexOf('\t') + 1).startsWith('evals/verdict/'));
    check(
      probe.artifactDigest === sha256(Buffer.from(listing.map((entry) => `${entry}\u0000`).join(''), 'utf8')),
      `P-004's artifactDigest ${probe.artifactDigest} is not the tracked tree at the pre-fix revision`,
    );
    check(probe.commitDigest === sha256(Buffer.from(project.commit, 'utf8')), 'P-004 names a commit other than the evaluated one');
    check(
      JSON.stringify(probe.defects[0].oracleEvidence) === JSON.stringify([qualification.failBeforeEvidence]),
      "P-004's defect cites evidence other than its fail-before",
    );
    checkQualifies(engine, 'the historical probe', probe, contract);
  }
  const probeList = readJson(path.join(runDirectory, 'probes.json'));
  check(
    JSON.stringify(probeList.map((entry) => entry.probeId)) === '["P-004"]',
    `the preflight's probe list is ${JSON.stringify(probeList.map((entry) => entry.probeId))}`,
  );
  const records = recordsOf(runDirectory, 'P-004');
  check(
    records.length === TRIALS && records.every((record) => record.conditionArm === `historical:${parent}`),
    `P-004's records carry arms ${JSON.stringify(records.map((record) => record.conditionArm))}; expected historical:${parent}`,
  );
  const evidence = scoreRun(project, 'the historical run');
  checkVotes('the historical run', evidence, 'P-004', 'caught');
  checkVotes('the historical run', evidence, 'P-001', 'passed-clean-control');

  // `preflight` qualifies the historical probe too, and routes its witness leg to the pre-fix worktree.
  const preflight = evaluate(['preflight', '--evaluation', folder], project.env);
  check(preflight.status === 0, `preflight over the historical project exited ${preflight.status}; expected 0\n${preflight.output}`);
  const preflightDirectory = runDirectoryOf(folder);
  const preflightLeg = fs
    .readdirSync(path.join(preflightDirectory, 'observations'))
    .map((name) => readJson(path.join(preflightDirectory, 'observations', name)))
    .find((observation) => observation.legId === 'manifest-pre-fix');
  check(
    JSON.stringify(readJson(path.join(preflightDirectory, 'probes.json')).map((entry) => entry.probeId)) === '["P-004"]' &&
      preflightLeg?.workspace === `historical:${parent}`,
    `preflight handed the CLI ${JSON.stringify(readJson(path.join(preflightDirectory, 'probes.json')).map((entry) => entry.probeId))} and ran the witness leg in ${preflightLeg?.workspace}`,
  );

  // A copy of the working tree has no revisions to address: the historical probe is refused with its reason, and the rest runs.
  const copied = evaluate(['run', '--evaluation', folder, '--from-working-tree'], project.env);
  check(copied.status === 0, `a working-tree run with a historical probe exited ${copied.status}; expected 0\n${copied.output}`);
  const copiedDirectory = runDirectoryOf(folder);
  const copiedRun = readJson(path.join(copiedDirectory, 'run.json'));
  check(
    copiedRun.refused?.length === 1 && copiedRun.refused[0].probeId === 'P-004' && /not a git worktree/.test(copiedRun.refused[0].reason),
    `a working-tree run records the refusals ${JSON.stringify(copiedRun.refused)}`,
  );
  check(
    JSON.stringify(readJson(path.join(copiedDirectory, 'trial-sets.json')).trialSets.map((set) => set.probeId)) === '["P-001"]',
    'a working-tree run sealed a trial set for the refused historical probe',
  );

  // A fix commit before which the oracle already held proves no fail-before.
  const unfixed = makeHistoricalProject('historical-holds-before', { before: 'mode: strict\n', fixFile: 'notes.txt' });
  const unfixedRun = evaluate(['run', '--evaluation', unfixed.folder], unfixed.env);
  check(
    unfixedRun.status === 11 && unfixedRun.output.includes(`the fail-before arm at ${unfixed.parent} is held`),
    `a historical probe whose oracle holds before the fix exited ${unfixedRun.status}; expected 11 naming the fail-before arm\n${unfixedRun.output}`,
  );

  // A fix commit that does not fix the defect proves no pass-after.
  const unfixing = makeHistoricalProject('historical-fails-after', { fixFile: 'notes.txt' });
  const unfixingRun = evaluate(['run', '--evaluation', unfixing.folder], unfixing.env);
  check(
    unfixingRun.status === 11 && unfixingRun.output.includes(`the pass-after arm at ${unfixing.fix} is violated`),
    `a historical probe whose fix does not fix it exited ${unfixingRun.status}; expected 11 naming the pass-after arm\n${unfixingRun.output}`,
  );
}

/** A controlled mutation and a historical probe in one run: each witness leg in its own workspace, both caught. */
async function checkMutationBesideHistorical() {
  const project = makeHistoricalProject('mutation-beside-historical', { keepMutation: true });
  const ran = evaluate(['run', '--evaluation', project.folder], project.env);
  check(ran.status === 0, `a run with a mutation beside a historical probe exited ${ran.status}; expected 0\n${ran.output}`);
  const runDirectory = runDirectoryOf(project.folder);
  if (runDirectory === null) {
    check(false, 'the mixed run wrote no run directory');
    return;
  }
  const index = readJson(path.join(runDirectory, 'trial-sets.json'));
  check(
    JSON.stringify(index.trialSets.map((set) => [set.probeId, set.conditionArm])) ===
      JSON.stringify([
        ['P-001', 'clean'],
        ['P-002', 'mutated:M-001'],
        ['P-004', `historical:${project.parent}`],
      ]),
    `the mixed run's trial sets are ${JSON.stringify(index.trialSets.map((set) => [set.probeId, set.conditionArm]))}`,
  );
  const legs = Object.fromEntries(
    fs
      .readdirSync(path.join(runDirectory, 'observations'))
      .map((name) => readJson(path.join(runDirectory, 'observations', name)))
      .map((observation) => [observation.legId, observation.workspace]),
  );
  check(
    legs['manifest-lenient'] === 'mutated:M-001' && legs['manifest-pre-fix'] === `historical:${project.parent}`,
    `the witness legs ran in ${JSON.stringify(legs)}`,
  );
  const evidence = scoreRun(project, 'the mixed run');
  checkVotes('the mixed run', evidence, 'P-002', 'caught');
  checkVotes('the mixed run', evidence, 'P-004', 'caught');
}

/** A refused historical probe beside a clean control: the reason recorded, no trial set for it, and the run exits 0. */
function checkRefusedBesideControl(project, label, reason) {
  const ran = evaluate(['run', '--evaluation', project.folder], project.env);
  check(ran.status === 0, `${label}: run exited ${ran.status}; expected 0\n${ran.output}`);
  const runDirectory = runDirectoryOf(project.folder);
  if (runDirectory === null) {
    check(false, `${label}: the run wrote no run directory`);
    return;
  }
  const [refusal] = readJson(path.join(runDirectory, 'run.json')).refused ?? [];
  const file = path.join(runDirectory, 'refused', 'P-004.json');
  check(
    refusal?.probeId === 'P-004' && reason.test(refusal.reason) && fs.existsSync(file) && readJson(file).reason === refusal.reason,
    `${label}: the refusal recorded is ${JSON.stringify(refusal)}`,
  );
  check(
    JSON.stringify(readJson(path.join(runDirectory, 'trial-sets.json')).trialSets.map((set) => set.probeId)) === '["P-001"]',
    `${label}: a trial set was sealed for the refused probe`,
  );
}

async function checkHistoricalRefusals() {
  checkRefusedBesideControl(
    makeHistoricalProject('historical-unresolved', { fixCommitOf: () => '0'.repeat(40) }),
    'an unknown fix commit',
    /does not resolve to a commit/,
  );
  // A fix committed on a side branch the evaluated commit does not contain.
  const sideFix = ({ fix, repository }) => {
    git(repository, ['checkout', '--quiet', '-b', 'side', `${fix}^1`]);
    fs.writeFileSync(path.join(repository, 'side.txt'), 'a fix the main line never took\n');
    git(repository, ['add', 'side.txt']);
    git(repository, ['commit', '--quiet', '--message', 'a side fix']);
    const side = git(repository, ['rev-parse', 'HEAD']).trim();
    git(repository, ['checkout', '--quiet', 'main']);
    return side;
  };
  checkRefusedBesideControl(
    makeHistoricalProject('historical-side-branch', { fixCommitOf: sideFix }),
    'a fix commit off the evaluated line',
    /is not an ancestor of the evaluated commit/,
  );
  checkRefusedBesideControl(makeLateRootProject(), 'a pre-fix revision without launch.root', /holds no app/);
}

/**
 * A project whose `launch.root`, `app/`, the fix commit adds: its parent holds
 * only a README, so the historical probe has no pre-fix target to run.
 */
function makeLateRootProject() {
  const directory = scratch.make('historical-late-root');
  const repository = path.join(directory, 'repository');
  fs.mkdirSync(repository);
  fs.writeFileSync(path.join(repository, 'README.txt'), 'the project arrives in the next commit\n');
  git(repository, ['init', '--quiet', '--initial-branch', 'main']);
  git(repository, ['add', '--all']);
  git(repository, ['commit', '--quiet', '--message', 'a readme']);
  const app = path.join(repository, 'app');
  fs.cpSync(FIXTURE, app, { recursive: true, filter: (from) => path.basename(from) !== 'runs' });
  fs.writeFileSync(path.join(repository, '.gitignore'), 'vendor/\n');
  const folder = path.join(app, EVALUATION);
  fs.rmSync(path.join(folder, 'probes', 'P-002.probe.json'));
  fs.rmSync(path.join(folder, 'mutations'), { recursive: true });
  editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
    evaluation.arms = ['clean', 'historical'];
  });
  const fix = commitAll(repository, folder, 'the verdict project');
  const seeded = readJson(path.join(FIXTURE, EVALUATION, 'probes', 'P-002.probe.json'));
  writeJson(path.join(folder, 'probes', 'P-004.probe.json'), historicalProbe(seeded, fix));
  commitAll(repository, folder, 'the historical probe');
  const temp = scratch.make('historical-late-root-temp');
  runtimeTemps.push({ label: 'historical-late-root', directory: temp });
  return { repository, folder, env: { TMPDIR: temp, TMP: temp, TEMP: temp } };
}

/** A historical probe in a one-commit repository is refused with its reason, and the rest of the run goes on. */
async function checkOneCommit() {
  const project = makeProject('one-commit', {
    edit: ({ folder }) => {
      const seeded = readJson(path.join(folder, 'probes', 'P-002.probe.json'));
      writeJson(path.join(folder, 'probes', 'P-004.probe.json'), historicalProbe(seeded, 'HEAD'));
      editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
        evaluation.arms = ['clean', 'mutated', 'historical'];
      });
    },
  });
  const ran = evaluate(['run', '--evaluation', project.folder], project.env);
  check(ran.status === 0, `a run with a refused historical probe exited ${ran.status}; expected 0\n${ran.output}`);
  const runDirectory = runDirectoryOf(project.folder);
  if (runDirectory === null) {
    check(false, 'the one-commit run wrote no run directory');
    return;
  }
  const run = readJson(path.join(runDirectory, 'run.json'));
  const [refusal] = run.refused ?? [];
  check(
    run.refused?.length === 1 && refusal.probeId === 'P-004' && /has no parent/.test(refusal.reason),
    `run.json records the refusals ${JSON.stringify(run.refused)}`,
  );
  const refused = written(path.join(runDirectory, 'refused', 'P-004.json'), 'the refusal');
  check(refused !== null && refused.reason === refusal?.reason, `refused/P-004.json records ${JSON.stringify(refused)}`);
  const index = readJson(path.join(runDirectory, 'trial-sets.json'));
  check(
    JSON.stringify(index.trialSets.map((set) => set.probeId)) === '["P-001","P-002"]',
    `the trial sets of a run with a refused probe are ${JSON.stringify(index.trialSets.map((set) => set.probeId))}`,
  );
  const probeList = readJson(path.join(runDirectory, 'probes.json'));
  check(
    JSON.stringify(probeList.map((entry) => entry.probeId)) === '["P-002"]',
    `the preflight's probe list holds ${JSON.stringify(probeList.map((entry) => entry.probeId))}`,
  );
  check(!fs.existsSync(path.join(runDirectory, 'probes', 'P-004.probe.json')), 'a refused probe was materialized');
  const evidence = scoreRun(project, 'the run with a refused probe');
  checkVotes('the run with a refused probe', evidence, 'P-002', 'caught');

  // A run whose every probe was refused has no arm to run and nothing to seal.
  const alone = makeProject('one-commit-alone', {
    edit: ({ folder }) => {
      const seeded = readJson(path.join(folder, 'probes', 'P-002.probe.json'));
      fs.rmSync(path.join(folder, 'probes'), { recursive: true });
      fs.rmSync(path.join(folder, 'mutations'), { recursive: true });
      writeJson(path.join(folder, 'probes', 'P-004.probe.json'), historicalProbe(seeded, 'HEAD'));
      editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
        evaluation.arms = ['historical'];
      });
    },
  });
  const aloneRun = evaluate(['run', '--evaluation', alone.folder], alone.env);
  check(
    aloneRun.status === 12 && /every probe was refused/.test(aloneRun.output) && /has no parent/.test(aloneRun.output),
    `a run whose every probe was refused exited ${aloneRun.status}; expected 12 naming the refusal\n${aloneRun.output}`,
  );
}

// ---------------------------------------------------------------------- judge

/** R-101: one criterion over the judge run's stdout, on a two-level anchored scale. */
const RUBRIC = {
  id: 'R-101',
  scaleLevels: [
    { level: 0, anchor: 'stdout names no verdict, or names more than one.' },
    { level: 1, anchor: 'stdout names exactly one verdict, accepted or rejected.' },
  ],
  failureModePenalties: [{ name: 'verdict-hedged', description: 'stdout names two verdicts, which scores as naming none.' }],
  maxLength: 200,
  criteria: [{ id: 'RC-101', text: 'Does the answer name the one verdict it reached?', evidence: '/interactions/judge-run/stdout' }],
};

/** `evaluation.json`'s `judge`: the stub judge through the custom adapter, logging each call and capturing each prompt. */
function judgeWiring(log, capture, mode = 'score') {
  return {
    agent: 'custom',
    agentCommand: process.execPath,
    agentArgs: [STUB_JUDGE, '--log', log, '--capture', capture, '--mode', mode],
    timeoutMs: 60_000,
  };
}

/** The Story 1.8 project with R-101 declared and the stub judge wired in, or, without `rubric`, neither. */
function makeJudgedProject(label, { rubric = true, mode = 'score' } = {}) {
  const log = path.join(scratch.make(`${label}-judge`), 'calls.log');
  const capture = path.join(path.dirname(log), 'prompts.jsonl');
  const project = makeProject(label, {
    edit: ({ folder }) => {
      // check refuses a judge block beside a contract with no rubric, so only a rubric brings one.
      if (rubric) {
        editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
          evaluation.judge = judgeWiring(log, capture, mode);
        });
        editJson(path.join(folder, 'contract.json'), (contract) => {
          contract.rubrics = [RUBRIC];
        });
        writeJson(path.join(folder, 'policy', 'evaluator-conditions.json'), {
          schemaVersion: 1,
          modelSnapshot: 'none',
          systemPromptDigest: sha256(Buffer.alloc(0)),
          judge: { modelSnapshot: JUDGE_SNAPSHOT },
        });
      }
    },
  });
  return { ...project, log, capture };
}

function judgeCalls(project) {
  return fs.existsSync(project.log)
    ? fs
        .readFileSync(project.log, 'utf8')
        .split('\n')
        .filter((line) => line.length > 0).length
    : 0;
}

async function checkRubric() {
  const validate = createArtifactValidator();
  const project = makeJudgedProject('rubric');
  const ran = evaluate(['run', '--evaluation', project.folder], project.env);
  check(ran.status === 0, `a run over a contract with a rubric exited ${ran.status}; expected 0\n${ran.output}`);
  check(judgeCalls(project) === 2 * TRIALS, `the judge was called ${judgeCalls(project)} times; expected one per trial, ${2 * TRIALS}`);
  const runDirectory = runDirectoryOf(project.folder);
  if (runDirectory === null) {
    check(false, 'the rubric run wrote no run directory');
    return;
  }
  const configuration = readJson(path.join(runDirectory, 'evaluator-configuration.json'));
  for (const problem of await validate('evaluator-configuration', configuration))
    check(false, `the judged run's evaluator configuration fails its published schema: ${problem}`);
  check(
    JSON.stringify(configuration.judgeConfiguration) ===
      JSON.stringify({ modelSnapshot: JUDGE_SNAPSHOT, systemPromptDigest: sha256(Buffer.from(JUDGE_INSTRUCTIONS, 'utf8')) }),
    `the judged run records judgeConfiguration ${JSON.stringify(configuration.judgeConfiguration)}`,
  );
  const run = readJson(path.join(runDirectory, 'run.json'));
  check(
    run.judge?.calls === 2 * TRIALS && run.judge?.modelSnapshot === JUDGE_SNAPSHOT && run.judge?.agent === 'custom',
    `run.json records the judge ${JSON.stringify(run.judge)}`,
  );
  for (const probeId of ['P-001', 'P-002']) {
    for (const record of recordsOf(runDirectory, probeId)) {
      check(
        record.judgeResults.length === 1 &&
          record.judgeResults[0].rubricId === 'R-101' &&
          record.judgeResults[0].criterionId === 'RC-101' &&
          record.judgeResults[0].score === 1 &&
          typeof record.judgeResults[0].note === 'string',
        `${probeId} trial ${record.trialIndex} carries judgeResults ${JSON.stringify(record.judgeResults)}`,
      );
    }
  }
  check(run.judge?.model === null, `run.json records the custom adapter's model as ${JSON.stringify(run.judge?.model)}`);
  // Every prompt carries the template, the rubric's anchors and penalties and the evidence, and nothing of the contract.
  const prompts = fs.existsSync(project.capture)
    ? fs
        .readFileSync(project.capture, 'utf8')
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line))
    : [];
  check(prompts.length === 2 * TRIALS, `the judge captured ${prompts.length} prompts; expected ${2 * TRIALS}`);
  const contract = readJson(path.join(project.folder, 'contract.json'));
  const withheldLiterals = [
    contract.contractId,
    contract.testData.setup,
    contract.testData.cleanup,
    'O-001',
    'expects-hold',
    'judge-request',
    'judge-run',
    '"op"',
  ];
  for (const [index, prompt] of prompts.entries()) {
    const which = `judge prompt ${index + 1}`;
    check(prompt.startsWith(JUDGE_INSTRUCTIONS), `${which} does not start with the instruction template`);
    check(
      prompt.includes(RUBRIC.criteria[0].text) &&
        prompt.includes(RUBRIC.scaleLevels[1].anchor) &&
        prompt.includes(RUBRIC.failureModePenalties[0].description),
      `${which} lacks the criterion, a scale anchor or a penalty description`,
    );
    check(prompt.includes('verdict: '), `${which} lacks the evidence its criterion points at`);
    for (const withheld of withheldLiterals) {
      check(!prompt.includes(withheld), `${which} carries ${JSON.stringify(withheld)}, which the judge must not see`);
    }
  }
  const evidence = scoreRun(project, 'the judged run');
  checkVotes('the judged run', evidence, 'P-001', 'passed-clean-control');
  checkVotes('the judged run', evidence, 'P-002', 'caught');

  // A judge that cannot answer yields no record, and the run exits 12.
  const failing = makeJudgedProject('rubric-judge-fails', { mode: 'fail' });
  const failed = evaluate(['run', '--evaluation', failing.folder], failing.env);
  const failedDirectory = runDirectoryOf(failing.folder);
  check(
    failed.status === 12 && /rubric judge could not answer/.test(failed.output),
    `a run whose judge fails exited ${failed.status}; expected 12\n${failed.output}`,
  );
  check(
    failedDirectory !== null &&
      !fs.existsSync(path.join(failedDirectory, 'trial-sets.json')) &&
      !fs.existsSync(path.join(failedDirectory, 'trial-sets')),
    'a run whose judge failed wrote a record',
  );
  check(judgeCalls(failing) === 1, `a failing judge was called ${judgeCalls(failing)} times; the first failure ends the run`);
  const faultFile = failedDirectory === null ? null : path.join(failedDirectory, 'trials', 'clean', 'trial-1.json');
  const fault = faultFile !== null && fs.existsSync(faultFile) ? readJson(faultFile).judge : null;
  check(
    typeof fault?.stderr === 'string' && fault.stderr.includes('asked to fail') && fault.stdout.includes('no scores'),
    `a failing judge's streams are not in the trial's evidence: ${JSON.stringify(fault)}`,
  );

  // A judge that replies with no JSON leaves every criterion unscored, which eval-quality reads as Invalid.
  const garbage = makeJudgedProject('rubric-garbage', { mode: 'garbage' });
  const garbageRun = evaluate(['run', '--evaluation', garbage.folder], garbage.env);
  check(garbageRun.status === 0, `a run whose judge replies with no JSON exited ${garbageRun.status}\n${garbageRun.output}`);
  const garbageDirectory = runDirectoryOf(garbage.folder);
  const garbageRecords = garbageDirectory === null ? [] : ['P-001', 'P-002'].flatMap((probeId) => recordsOf(garbageDirectory, probeId));
  check(
    garbageRecords.length === 2 * TRIALS &&
      garbageRecords.every((record) =>
        record.judgeResults.every((result) => result.score === null && /did not reply with a JSON object/.test(result.note)),
      ),
    `a judge reply with no JSON is recorded as ${JSON.stringify(garbageRecords.map((record) => record.judgeResults))}`,
  );
  const garbageScore = evaluate(['score', '--evaluation', garbage.folder], garbage.env);
  check(
    garbageScore.status === 3 && /judge result unscored/.test(garbageScore.output),
    `score over a judge that replied with no JSON exited ${garbageScore.status}; expected 3 (Invalid)\n${garbageScore.output}`,
  );

  // A judge that scores off the scale reaches eval-quality as an unscored result, which it reads as Invalid.
  const offScale = makeJudgedProject('rubric-off-scale', { mode: 'off-scale' });
  const offScaleRun = evaluate(['run', '--evaluation', offScale.folder], offScale.env);
  check(offScaleRun.status === 0, `a run whose judge scores off the scale exited ${offScaleRun.status}\n${offScaleRun.output}`);
  const offScaleDirectory = runDirectoryOf(offScale.folder);
  const [unscored] = offScaleDirectory === null ? [] : recordsOf(offScaleDirectory, 'P-002');
  check(
    unscored?.judgeResults?.[0]?.score === null && /not one of the rubric's levels/.test(unscored?.judgeResults?.[0]?.note ?? ''),
    `an off-scale judge score is recorded as ${JSON.stringify(unscored?.judgeResults)}`,
  );
  const offScaleScore = evaluate(['score', '--evaluation', offScale.folder], offScale.env);
  check(
    offScaleScore.status === 3 && /judge result unscored/.test(offScaleScore.output),
    `score over unscored judge results exited ${offScaleScore.status}; expected 3 (Invalid)\n${offScaleScore.output}`,
  );
}

async function checkNoRubric() {
  const project = makeJudgedProject('no-rubric', { rubric: false });
  const ran = evaluate(['run', '--evaluation', project.folder], project.env);
  check(ran.status === 0, `a run over a contract with no rubric exited ${ran.status}; expected 0\n${ran.output}`);
  check(judgeCalls(project) === 0, `a contract with no rubric called the judge ${judgeCalls(project)} times; expected none`);
  const runDirectory = runDirectoryOf(project.folder);
  if (runDirectory === null) {
    check(false, 'the no-rubric run wrote no run directory');
    return;
  }
  const configuration = readJson(path.join(runDirectory, 'evaluator-configuration.json'));
  check(
    configuration.judgeConfiguration === null,
    `a run with no rubric records judgeConfiguration ${JSON.stringify(configuration.judgeConfiguration)}`,
  );
  check(readJson(path.join(runDirectory, 'run.json')).judge === null, 'a run with no rubric records a judge in run.json');
  for (const probeId of ['P-001', 'P-002']) {
    for (const record of recordsOf(runDirectory, probeId)) {
      check(record.judgeResults.length === 0, `${probeId} trial ${record.trialIndex} carries judgeResults with no rubric declared`);
    }
  }
  const trial = readJson(path.join(runDirectory, 'trials', 'clean', 'trial-1.json'));
  check(!Object.hasOwn(trial, 'judge'), "a trial no judge scored carries a judge field, which changes the Story 1.8 evidence's bytes");
}

// ---------------------------------------------------------------------- units

async function checkUnits() {
  const engine = await loadEngine();
  const contract = { rubrics: [RUBRIC, { ...RUBRIC, id: 'R-102', criteria: [{ ...RUBRIC.criteria[0], id: 'RC-102' }] }] };
  const reply = (scores) => JSON.stringify({ scores });
  const full = [
    { rubricId: 'R-101', criterionId: 'RC-101', score: 1, note: 'named' },
    { rubricId: 'R-102', criterionId: 'RC-102', score: 0, note: '' },
  ];
  check(
    JSON.stringify(judgeResultsFrom(contract, `Here you go:\n${reply(full)}\n`)) ===
      JSON.stringify([
        { rubricId: 'R-101', criterionId: 'RC-101', score: 1, note: 'named' },
        { rubricId: 'R-102', criterionId: 'RC-102', score: 0, note: null },
      ]),
    'a reply that scores every criterion on its scale is not taken as it stands',
  );
  const cases = [
    ['a reply that is not JSON', 'I would rather not say.', /did not reply with a JSON object/],
    ['a reply with no scores list', reply(), /did not reply with a JSON object/],
    ['a criterion left out', reply(full.slice(0, 1)), /no score for this criterion/],
    ['a criterion scored twice', reply([...full, full[1]]), /scored this criterion 2 times/],
    ['a score off the scale', reply([full[0], { ...full[1], score: 2 }]), /not one of the rubric's levels \(0, 1\)/],
    ['a score that is not an integer', reply([full[0], { ...full[1], score: 0.5 }]), /not one of the rubric's levels/],
  ];
  for (const [what, text, note] of cases) {
    const [, second] = judgeResultsFrom(contract, text);
    check(second.score === null && note.test(second.note), `${what} gives ${JSON.stringify(second)}`);
  }
  const [overLong] = judgeResultsFrom(contract, reply([{ ...full[0], note: 'x'.repeat(RUBRIC.maxLength + 1) }, full[1]]));
  check(
    overLong.score === null && /past the rubric's maxLength 200/.test(overLong.note),
    `a note past the rubric's maxLength gives ${JSON.stringify(overLong)}`,
  );
  const [afterProse] = judgeResultsFrom(contract, `{not json} ${reply(full)}\nThat is all } for now.`);
  check(afterProse.score === 1, `a reply between braced prose gives ${JSON.stringify(afterProse)}`);
  check(
    /data to assess/.test(JUDGE_INSTRUCTIONS) && /never followed/.test(JUDGE_INSTRUCTIONS),
    'the judge instructions do not say the evidence is data whose instructions are never followed',
  );
  check(
    judgeConfigurationFor({ contract: { rubrics: [] }, conditions: null, digestBytes: engine.digestBytes }) === null,
    'a contract with no rubric gets a judge configuration',
  );
  // A working judge handed a contract with no rubric is never called: its log stays empty.
  const unitLog = path.join(scratch.make('unit-judge'), 'calls.log');
  const none = await judgeRubrics({
    contract: { rubrics: [] },
    stepObservations: {},
    judge: judgeWiring(unitLog, path.join(path.dirname(unitLog), 'prompts.jsonl')),
  });
  check(
    none.called === false && none.results.length === 0 && !fs.existsSync(unitLog),
    'judgeRubrics called the judge for a contract with no rubric',
  );

  const port = syntheticPort({ label: 'trial-2', steps: { 'judge-run': { stdout: 'verdict: pending\n', stderr: '', exitCode: 0 } } });
  const answered = await port.probe({ probeId: 'trial-2-judge-run', interfaceId: 'verdict', operationId: 'judge-request' });
  check(
    answered.observation.stdout.value === 'verdict: pending\n' &&
      answered.observation.exitCode === 0 &&
      answered.observation.kind === 'cli',
    `the synthetic port answers ${JSON.stringify(answered.observation)}`,
  );
  let unknown = null;
  try {
    await port.probe({ probeId: 'trial-2-other-step' });
  } catch (error) {
    unknown = error;
  }
  check(unknown !== null && /answers no plan step/.test(unknown.message), 'the synthetic port answered a step the response does not hold');

  // createWorkspace checks out the commit it is given, and only on a worktree made with no basis.
  const project = makeProject('workspace-commit');
  const first = project.commit;
  fs.writeFileSync(path.join(project.repository, 'notes.txt'), 'a second commit\n');
  const second = commitAll(project.repository, project.folder, 'a second commit');
  const temp = project.env.TMPDIR;
  const previous = process.env.TMPDIR;
  process.env.TMPDIR = temp;
  try {
    const options = { root: project.repository, kind: 'git', provision: [], exclude: [project.folder], label: 'unit' };
    const atFirst = createWorkspace({ ...options, commit: first });
    try {
      check(
        atFirst.commit === first && !fs.existsSync(path.join(atFirst.root, 'notes.txt')),
        `a workspace at ${first} holds commit ${atFirst.commit}`,
      );
    } finally {
      removeWorkspace(atFirst);
    }
    const atHead = createWorkspace(options);
    try {
      check(atHead.commit === second, `a workspace with no commit named holds ${atHead.commit}, not HEAD ${second}`);
      let refusal = null;
      try {
        removeWorkspace(createWorkspace({ ...options, basis: atHead, commit: first }));
      } catch (error) {
        refusal = error;
      }
      check(refusal instanceof WorkspaceRefusal, 'a workspace with a basis and a commit was made');
    } finally {
      removeWorkspace(atHead);
    }
    let unknownCommit = null;
    try {
      removeWorkspace(createWorkspace({ ...options, commit: '0'.repeat(40) }));
    } catch (error) {
      unknownCommit = error;
    }
    check(
      unknownCommit instanceof WorkspaceRefusal && /does not hold/.test(unknownCommit.message),
      'a workspace at a commit the repository lacks was made',
    );
  } finally {
    if (previous === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previous;
  }
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
    await runCase('the gameability arm', checkGameability);
    await runCase('the historical arm', checkHistorical);
    await runCase('the one-commit refusal', checkOneCommit);
    await runCase('a mutation beside a historical probe', checkMutationBesideHistorical);
    await runCase('the historical refusals', checkHistoricalRefusals);
    await runCase('the rubric judge', checkRubric);
    await runCase('no rubric, no judge', checkNoRubric);
    for (const { label, directory } of runtimeTemps) {
      const left = fs.readdirSync(directory);
      check(left.length === 0, `the ${label} project's runs left ${JSON.stringify(left)} in their temp directory`);
    }
  } finally {
    scratch.removeAll();
  }
  if (failures.length > 0) {
    console.error(`${colors.red}${failures.length} of ${checks} tea-evaluate arms check(s) failed:${colors.reset}`);
    for (const failure of failures) console.error(`  - ${failure}`);
    return 1;
  }
  console.log(`${colors.green}ok${colors.reset} all ${checks} tea-evaluate arms check(s) passed`);
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(`${colors.red}the tea-evaluate arms test could not run:${colors.reset} ${error.stack ?? error}`);
    process.exitCode = 2;
  },
);
