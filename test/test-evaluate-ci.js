'use strict';

/**
 * `tea-evaluate ci --tier <pr|merge|scheduled|release>` (Story 2.2, AD-10, AD-11, AD-12), run through the real CLI over
 * real eval-quality, the committed fixture baselines and real clean runs of the verdict fixture.
 *
 * Every case works in a copy and mutates the copy. The revert checks the story names are each
 * one case below:
 *  - the capture of a `gate` check (a stub that prints known bytes to each stream and exits 1) fails when a stream or the
 *    code is dropped, and a `--strict` argument in any engine call fails the shim-log case,
 *  - the placement rules (a tier moved off its default with no reason, a deterministic check placed off `pr`),
 *  - the AD-10 table row by row (swapping two classes in the map fails its case), the outcome-state mapping and the
 *    tier membership,
 *  - the replay: a flipped evidence byte and a flipped observation exit code (a replay that compares a file with itself
 *    passes the first; one that copies the baseline evidence forward without re-scoring leaves the shim log empty in the
 *    second), and a differing `policy/` digest (a stale baseline: warn on `pr`, exit 11 on `release`),
 *  - oracle agreement (a disposition flipped in a baseline record and re-scored, an oracle `unreached` or
 *    `not-evaluable`) and the gameability arm (the target's launch marker stays absent),
 *  - the strength floor (warn on `scheduled`, exit 2 on `release`), judge calibration (exit 11 on both) and a baseline
 *    another engine measured (`refused`, informational).
 *
 * The replay's determinism, measured here and recorded in the story: the produced preflight verdict, each probe's
 * `evidence-artifact.json`, `strength-aggregate.json` and `strength-floors.json` equal the baseline's byte for byte, and so do
 * the call records of `score` (each probe's `score.json` and `aggregate-strength.json`), which hold neutral path forms; the
 * invocation's own `score.json` summary names the replay's invocation id and is the one file the comparison leaves out.
 */

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const yaml = require('js-yaml');

const { engineCliPath, engineVersion, loadEngine } = require('../cli/lib/evaluate/engine');
const { checkEvaluation } = require('../cli/lib/evaluate/check');
const { MAX_OUTPUT_BYTES, confine } = require('../cli/lib/evaluate/ci');
const { textNeutralizer } = require('../cli/lib/evaluate/recorded-paths');
const planModule = require('../cli/lib/evaluate/ci-plan');
const { principalMappingProblems } = require('../cli/lib/evaluate/registry');
const { EXIT_CODES } = require('../cli/evaluate');
const baselines = require('./lib/evaluate-baseline');
const { repositoryFiles, repositoryReadDigest } = require('./lib/evaluate-ci-repos');
const { planEntryShapeProblems } = require('./lib/evaluate-plan-shape');
const prTier = require('./lib/evaluate-pr-tier');
const { suite } = require('./lib/evaluate-story-121');
const {
  holdPrivateParents,
  liveHolder,
  releasePrivateParents,
  removeDeadPrivateParents,
  scratchDirectories,
} = require('./lib/scratch-directories');

const ROOT = path.join(__dirname, '..');
const CLI = path.join(ROOT, 'cli', 'evaluate.js');
const SHIM = path.join(__dirname, 'fixtures', 'evaluate', 'engine-shim.js');
const STUB_JUDGE = path.join(__dirname, 'fixtures', 'evaluate', 'stub-judge.js');
const SPINE = path.join(ROOT, '_bmad-output', 'planning-artifacts', 'evaluate', 'ARCHITECTURE-SPINE.md');
const FIXTURES = {
  verdict: { root: 'test/fixtures/evaluate/mutation', folder: 'evals/verdict-ci' },
  mcp: { root: 'test/fixtures/evaluate-mcp', folder: 'evals/grader' },
  api: { root: 'test/fixtures/evaluate-api', folder: 'evals/grader' },
};
const BASE_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_') && name !== 'TEA_EVALUATE_ENGINE_CLI'),
);
const PR_IDS = ['check', 'compile', 'seal', 'api-conformance', 'gameability', 'oracle-agreement', 'replay'];

const live = suite('tea-evaluate-ci');
const scratch = scratchDirectories('tea-evaluate-ci-copies');

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const sha = (bytes) => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;

// ---------------------------------------------------------------------------
// Helpers

/** `tea-evaluate ci` through the CLI. */
function ci(folder, tier, env = {}, extra = []) {
  const run = spawnSync(process.execPath, [CLI, 'ci', '--evaluation', folder, ...(tier === undefined ? [] : ['--tier', tier]), ...extra], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 600_000,
    env: { ...BASE_ENV, ...env },
  });
  if (run.error) throw run.error;
  return { status: run.status, stdout: run.stdout, stderr: run.stderr, output: `${run.stdout}${run.stderr}` };
}

/** A command other than `ci` through the CLI. */
function cli(folder, command, args = [], env = {}) {
  const run = spawnSync(process.execPath, [CLI, command, '--evaluation', folder, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 600_000,
    env: { ...BASE_ENV, ...env },
  });
  if (run.error) throw run.error;
  return { status: run.status, stdout: run.stdout, stderr: run.stderr, output: `${run.stdout}${run.stderr}` };
}

/** A copy of a committed fixture's project in a temp directory; its evaluation folder. */
function copyFixture(name, label = name) {
  const { root, folder } = FIXTURES[name];
  const directory = scratch.make(label);
  const project = path.join(directory, path.basename(root));
  fs.cpSync(path.join(ROOT, root), project, {
    recursive: true,
    filter: (file) => !['runs', 'node_modules'].includes(path.basename(file)),
  });
  const evaluation = path.join(project, folder);
  if (name === 'api') {
    fs.mkdirSync(path.join(evaluation, 'node_modules'));
    fs.symlinkSync(path.join(ROOT, 'node_modules', 'eval-quality'), path.join(evaluation, 'node_modules', 'eval-quality'));
    fs.symlinkSync(ROOT, path.join(evaluation, 'node_modules', 'bmad-method-test-architecture-enterprise'));
  }
  return evaluation;
}

const PLAN = 'ci/evaluation-ci-plan.json';
const planOf = (folder) => read(path.join(folder, PLAN));

/**
 * Writes the plan. Unless `syncTiers` is false, `evaluation.json` `tiers` become the tiers the plan places a check on, so a
 * case that edits a plan keeps the `tiers` rule quiet and a case about that rule sets the mismatch itself.
 */
function writePlan(folder, value, { syncTiers = true } = {}) {
  fs.mkdirSync(path.join(folder, 'ci'), { recursive: true });
  write(path.join(folder, PLAN), value);
  const manifest = path.join(folder, 'evaluation.json');
  const used = new Set((value.checks ?? []).map((item) => item.placement?.tier));
  if (syncTiers && used.size > 0 && fs.existsSync(manifest)) {
    const evaluation = read(manifest);
    evaluation.tiers = planModule.TIERS.filter((tier) => used.has(tier));
    write(manifest, evaluation);
  }
}

/** One plan check; `tier` is where it runs and `defaultTier` AD-10's default for it. */
function entry(id, tier, { defaultTier = tier, reason = 'the default placement', kind = 'evaluate', command, enforcement = 'block' } = {}) {
  const triggers = { pr: ['pull-request'], merge: ['merge'], scheduled: ['schedule', 'manual-dispatch'], release: ['release'] };
  return {
    id,
    tier,
    trigger: triggers[tier],
    kind,
    command: command ?? ['tea-evaluate', 'ci', '--evaluation', '.', '--tier', tier],
    enforcement,
    evidence: [`runs/<invocationId>/checks/${id}/stdout`],
    placement: { tier, defaultTier, reason },
  };
}

/** The newest CI invocation under `runs/`: its directory and `ci.json`. */
function latestCi(folder) {
  const runs = path.join(folder, 'runs');
  const names = fs
    .readdirSync(runs)
    .filter((name) => fs.existsSync(path.join(runs, name, 'ci.json')))
    .sort();
  assert.ok(names.length > 0, `no CI invocation under ${runs}`);
  const directory = path.join(runs, names.at(-1));
  return { directory, json: read(path.join(directory, 'ci.json')) };
}

const rowOf = (json, id) => json.checks.find((row) => row.id === id);

/** A tree digest of every regular file under `directory` (relative path and bytes), links not followed. */
function treeDigest(directory) {
  const entries = [];
  const walk = (current) => {
    for (const item of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, item.name);
      if (item.isDirectory()) walk(file);
      else entries.push(`${path.relative(directory, file)} ${sha(fs.readFileSync(file))}`);
    }
  };
  walk(directory);
  return entries.sort();
}

/** The run directory of a baseline's accepted run, from its manifest. */
const acceptedRun = (folder) => read(path.join(folder, 'baseline', 'baseline.json')).acceptedRun;
const scoreDirectory = (folder) =>
  path.join(folder, 'baseline', 'scores', read(path.join(folder, 'baseline', 'baseline.json')).scoreInvocationId);

/** The engine CLI run directly over the same inputs, which the stage exits `ci` passes through must equal. */
function engineDirect(args) {
  const run = spawnSync(process.execPath, [engineCliPath(), ...args], { encoding: 'utf8' });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

const shimEnv = (log, extra = {}) => ({ TEA_EVALUATE_ENGINE_CLI: SHIM, TEA_EVALUATE_SHIM_LOG: log, ...extra });

function shimLog(file) {
  return fs.existsSync(file)
    ? fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line))
    : [];
}

/** A private temporary directory for one case, and the environment that points a child's TMPDIR at it. */
function privateTemp(label) {
  const temp = scratch.make(label);
  return { temp, env: (extra = {}) => ({ TMPDIR: temp, TMP: temp, TEMP: temp, ...extra }) };
}

/** What the runtime's scratch directories left under `temp`. */
const scratchNames = (temp) => fs.readdirSync(temp).filter((name) => name.startsWith('tea-evaluate-'));

/** The user's private root (`workspace.js` `makePrivateParent`): `/tmp/tea-evaluate-p<uid>`, whatever the run's TMPDIR is. */
const PRIVATE_ROOT = path.join('/tmp', `tea-evaluate-p${process.getuid()}`);
const privateNames = () => (fs.existsSync(PRIVATE_ROOT) ? fs.readdirSync(PRIVATE_ROOT) : []);
/** The private parents (`run-<pid>-*`) the process `pid` holds under the private root. */
const privateParents = (pid) => privateNames().filter((name) => name.startsWith(`run-${pid}-`));
/** The replay scratch directories inside the private parents of the process `pid`. */
const replaysOf = (pid) =>
  privateParents(pid).flatMap((parent) =>
    fs
      .readdirSync(path.join(PRIVATE_ROOT, parent))
      .filter((name) => name.startsWith('tea-evaluate-replay-'))
      .map((name) => path.join(PRIVATE_ROOT, parent, name)),
  );
/** The private parents of ended processes that were not there at `before`, which a run that ended left behind. */
const strayParents = (before) =>
  privateNames().filter((name) => {
    const match = /^run-(\d+)-/.exec(name);
    return match !== null && !before.has(name) && !alive(Number(match[1]));
  });

/**
 * A stand-in for the engine CLI that runs the real one, except at the stage `KILL_AT` names (and only when an argument
 * contains `KILL_ARG`, when it is set): there it writes its pid to `KILL_MARK` and either ends by SIGKILL or, with
 * `KILL_HOW=hang`, waits to be killed. With `KILL_ONCE` it does so for the first call only.
 */
function killShim(label) {
  const wrapper = path.join(scratch.make(label), 'kill-shim.js');
  fs.writeFileSync(
    wrapper,
    `'use strict';
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const args = process.argv.slice(2);
const [stage] = args;
const matches = process.env.KILL_ARG === undefined || args.join(' ').includes(process.env.KILL_ARG);
const spent = process.env.KILL_ONCE !== undefined && fs.existsSync(process.env.KILL_MARK);
if (process.env.KILL_AT === stage && matches && !spent) {
  fs.writeFileSync(process.env.KILL_MARK, String(process.pid));
  if (process.env.KILL_HOW === 'hang') setTimeout(() => {}, 600000);
  else process.kill(process.pid, 'SIGKILL');
} else {
  const run = spawnSync(process.execPath, [${JSON.stringify(engineCliPath())}, ...args], { stdio: 'inherit' });
  process.exitCode = run.status;
}
`,
  );
  return wrapper;
}

/** Whether a process with this pid still exists. */
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== 'ESRCH';
  }
}

/** Waits until none of `pids` exists, up to `limit` milliseconds. */
async function goneWithin(pids, limit = 10_000) {
  const started = Date.now();
  while (pids.some(alive) && Date.now() - started < limit) await new Promise((resolve) => setTimeout(resolve, 50));
  return !pids.some(alive);
}

/** Waits for `file` to exist, up to `limit` milliseconds. */
async function appears(file, limit = 120_000) {
  const started = Date.now();
  while (!fs.existsSync(file) && Date.now() - started < limit) await new Promise((resolve) => setTimeout(resolve, 50));
  return fs.existsSync(file);
}

/** `ci` as a child the caller signals; its exit once it ends. */
function ciChild(folder, tier, env) {
  const child = spawn(process.execPath, [CLI, 'ci', '--evaluation', folder, '--tier', tier], {
    cwd: ROOT,
    env: { ...BASE_ENV, ...env },
    stdio: 'ignore',
  });
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
  return { child, exited };
}

// ---------------------------------------------------------------------------
// The plan: schema, fixtures and placement rules

function checkFixturePlans() {
  const schema = read(path.join(ROOT, 'cli', 'lib', 'evaluate', 'schemas', 'evaluation-ci-plan.schema.json'));
  assert.equal(planModule.PLAN_SCHEMA_VERSION, schema.properties.schemaVersion.const);
  for (const [name, { root, folder }] of Object.entries(FIXTURES)) {
    const evaluation = path.join(ROOT, root, folder);
    const read1 = planModule.readPlan(evaluation);
    assert.deepEqual(read1.findings, [], `${name}: the committed plan fails validation`);
    assert.ok(read1.plan.checks.length > 0, `${name}: the plan has no checks`);
    // Each fixture's baseline came through compare --accept over a clean run: dirty false, the installed engine.
    const manifest = read(path.join(evaluation, 'baseline', 'baseline.json'));
    const run = read(path.join(evaluation, 'baseline', 'run.json'));
    assert.equal(run.dirty, false, `${name}: the fixture baseline records a dirty run`);
    assert.equal(run.invocationId, manifest.acceptedRun);
    assert.equal(run.completed, true);
    assert.equal(
      manifest.evalQualityVersion,
      engineVersion(),
      `${name}: the baseline was recorded on another engine release; re-record it with compare --accept`,
    );
    assert.equal(run.workspace.kind, 'copy', `${name}: a fixture baseline comes from a copy workspace (AD-8)`);
  }
  // The MCP and API fixtures place the same default `pr` checks; the API one adds the port conformance only it can run.
  const ids = (name) => planOf(path.join(ROOT, FIXTURES[name].root, FIXTURES[name].folder)).checks.map((item) => item.id);
  assert.ok(ids('api').includes('api-conformance') && !ids('mcp').includes('api-conformance'));
}

function placementCase(label, edit, rule, { checkToo = true } = {}) {
  const folder = copyFixture('mcp', 'placement');
  const value = planOf(folder);
  edit(value);
  writePlan(folder, value);
  const result = ci(folder, 'pr');
  assert.equal(result.status, 10, `${label}: ci exited ${result.status}\n${result.output}`);
  assert.ok(result.stdout.includes(`[${rule}]`), `${label}: no [${rule}] finding\n${result.output}`);
  assert.equal(fs.existsSync(path.join(folder, 'runs')), false, `${label}: ci ran something over an invalid plan`);
  if (checkToo) {
    const checked = cli(folder, 'check');
    assert.equal(checked.status, 10, `${label}: check exited ${checked.status}\n${checked.output}`);
    assert.ok(checked.stdout.includes(`${PLAN}: [${rule}]`), `${label}: check lacks the [${rule}] finding\n${checked.output}`);
  }
}

function checkPlacementRules() {
  // A valid plan places a live check off its default tier when it records why: no finding.
  {
    const folder = copyFixture('mcp', 'placement');
    const value = planOf(folder);
    value.checks.push(
      entry('twin-run', 'merge', {
        defaultTier: 'scheduled',
        reason: 'The merge pipeline already has the budget for a twin run (ci.yml).',
      }),
    );
    writePlan(folder, value);
    const checked = cli(folder, 'check');
    assert.equal(checked.status, 0, checked.output);
  }
  // A tier that differs from the default with no reason fails validation (revert: deleting the rule makes this exit 0).
  placementCase(
    'a tier moved off its default with an empty reason',
    (value) => value.checks.push(entry('twin-run', 'merge', { defaultTier: 'scheduled', reason: '' })),
    'placement-reason',
  );
  placementCase(
    'a tier moved off its default with a blank reason',
    (value) => value.checks.push(entry('twin-run', 'merge', { defaultTier: 'scheduled', reason: '   ' })),
    'placement-reason',
  );
  placementCase(
    'a tier moved off its default with no reason field',
    (value) => {
      const moved = entry('twin-run', 'merge', { defaultTier: 'scheduled' });
      delete moved.placement.reason;
      value.checks.push(moved);
    },
    'placement-reason',
  );
  // A deterministic check that needs no secret off `pr` fails validation, a reason or not (revert: deleting the rule makes this exit 0).
  placementCase(
    'compile placed on scheduled with a reason',
    (value) => {
      const compile = value.checks.find((item) => item.id === 'compile');
      Object.assign(compile, entry('compile', 'scheduled', { defaultTier: 'pr', reason: 'The pull request pipeline is slow.' }));
    },
    'deterministic-off-pr',
  );
  placementCase(
    'a gate placed on release',
    (value) =>
      value.checks.push(
        entry('dependency-direction', 'release', { kind: 'gate', defaultTier: 'pr', reason: 'x', command: ['eval-quality-gates', 'x'] }),
      ),
    'deterministic-off-pr',
  );
  placementCase(
    'a live check on pr',
    (value) => value.checks.push(entry('preflight-live', 'pr', { defaultTier: 'merge', reason: 'x' })),
    'live-on-pr',
  );
  placementCase(
    'an evaluate command led by another tool',
    (value) => (value.checks[0].command = ['node', 'cli/evaluate.js', 'check']),
    'command',
  );
  placementCase(
    'a gate command led by another tool',
    (value) => value.checks.push(entry('licences', 'pr', { kind: 'gate', command: ['npx', 'eval-quality-gates'] })),
    'command',
  );
  placementCase('an unknown evaluate check id', (value) => (value.checks[0].id = 'frobnicate'), 'schema');
  placementCase('an unknown tier', (value) => (value.checks[0].placement.tier = 'nightly'), 'schema');
  placementCase('a field the schema does not know', (value) => (value.checks[0].verdict = 'pass'), 'schema');
  placementCase('an enforcement the table has no row for', (value) => (value.checks[0].enforcement = 'inform'), 'schema');
  placementCase('a tier and a placement.tier that disagree', (value) => (value.checks[0].tier = 'release'), 'tier');
  placementCase('two checks of one id on one tier', (value) => value.checks.push(structuredClone(value.checks[0])), 'duplicate');
  placementCase(
    'a default tier AD-10 does not give the check',
    (value) => (value.checks[0].placement.defaultTier = 'release'),
    'placement-default',
  );
  // The action derives from AD-10's table. A plan records warn only where AD-10 says warn for that check at that tier (a
  // strength regression on the comparison, the floor on scheduled); anywhere else the plan is refused, so it cannot demote
  // a blocking exit (revert: deleting the `enforcement` rule lets each of these through).
  for (const id of ['check', 'compile', 'seal', 'oracle-agreement', 'replay']) {
    placementCase(
      `enforcement warn on ${id}`,
      (value) => (value.checks.find((item) => item.id === id).enforcement = 'warn'),
      'enforcement',
    );
  }
  for (const [id, tier] of [
    ['twin-run', 'release'],
    ['held-out', 'release'],
    ['preflight-live', 'merge'],
    ['judge-calibration', 'scheduled'],
  ]) {
    placementCase(
      `enforcement warn on ${id} on ${tier}`,
      (value) => value.checks.push(entry(id, tier, { defaultTier: tier, enforcement: 'warn' })),
      'enforcement',
    );
  }
  for (const [id, tier] of [
    ['twin-run', 'scheduled'],
    ['held-out', 'scheduled'],
    ['strength-comparison', 'scheduled'],
    ['strength-comparison', 'release'],
  ]) {
    const folder = copyFixture('mcp', 'placement-warn');
    const value = planOf(folder);
    value.checks.push(entry(id, tier, { enforcement: 'warn' }));
    writePlan(folder, value);
    const checked = cli(folder, 'check');
    assert.equal(checked.status, 0, `enforcement warn on ${id} on ${tier}: ${checked.output}`);
  }
  // timeoutMs belongs to a gate: bounded, and refused on an evaluate check.
  placementCase('a timeoutMs on an evaluate check', (value) => (value.checks[0].timeoutMs = 5000), 'schema');
  for (const timeoutMs of [999, 3_600_001, 1.5, '5000']) {
    placementCase(
      `a gate timeoutMs of ${JSON.stringify(timeoutMs)}`,
      (value) => value.checks.push({ ...entry('timed-gate', 'pr', { kind: 'gate', command: ['eval-quality-gates', 'ok'] }), timeoutMs }),
      'schema',
    );
  }
  // A link where the plan's directory is required: ci and check both refuse it, whatever the link points at.
  {
    const folder = copyFixture('mcp', 'plan-directory-link');
    const target = path.join(path.dirname(folder), 'linked-plan-directory');
    fs.renameSync(path.join(folder, 'ci'), target);
    fs.symlinkSync(target, path.join(folder, 'ci'));
    const result = ci(folder, 'pr');
    assert.equal(result.status, 10, result.output);
    assert.match(result.stdout, /ci\/evaluation-ci-plan\.json: \[schema\] ci is a link or a file where the plan's directory is required/);
    assert.equal(fs.existsSync(path.join(folder, 'runs')), false, 'ci ran something over a linked plan directory');
    const checked = cli(folder, 'check');
    assert.equal(checked.status, 10, checked.output);
    assert.match(checked.stdout, /\[schema\] ci is a link or a file where the plan's directory is required/);
  }
}

// ---------------------------------------------------------------------------
// The derivable fields of a plan (Story 1.96): the six rules `check` and `ci` both read

/** Whether `folder`'s plan reads clean (`check` exits 0) or fails with `[rule]` from both `check` and `ci` (exit 10, `ci` runs nothing). */
function derivedProblem(
  label,
  rule,
  { folder = copyFixture('mcp', 'derived'), plan = () => {}, evaluation = () => {}, files = () => {} } = {},
) {
  const value = planOf(folder);
  plan(value);
  writePlan(folder, value);
  const manifest = path.join(folder, 'evaluation.json');
  const declared = read(manifest);
  evaluation(declared);
  write(manifest, declared);
  files(folder);
  const result = ci(folder, 'pr');
  assert.equal(result.status, 10, `${label}: ci exited ${result.status}\n${result.output}`);
  assert.ok(result.stdout.includes(`${PLAN}: [${rule}]`), `${label}: ci lacks the [${rule}] finding\n${result.output}`);
  assert.equal(fs.existsSync(path.join(folder, 'runs')), false, `${label}: ci ran something over a plan that fails ${rule}`);
  const checked = cli(folder, 'check');
  assert.equal(checked.status, 10, `${label}: check exited ${checked.status}\n${checked.output}`);
  assert.ok(checked.stdout.includes(`${PLAN}: [${rule}]`), `${label}: check lacks the [${rule}] finding\n${checked.output}`);
  return result.stdout;
}

/** The plan `edit` leaves reads clean: `check` exits 0 over the copy. */
function derivedValid(label, { folder = copyFixture('mcp', 'derived'), plan = () => {}, evaluation = () => {} } = {}) {
  const value = planOf(folder);
  plan(value);
  writePlan(folder, value);
  const manifest = path.join(folder, 'evaluation.json');
  const declared = read(manifest);
  evaluation(declared);
  write(manifest, declared);
  const checked = cli(folder, 'check');
  assert.equal(checked.status, 0, `${label}: ${checked.output}`);
}

/** A copy of the evaluation folder of a committed repository plan: no baseline run is needed, the rules read files. */
function copyEvaluation(name, label) {
  const { root, folder } = REPOSITORIES[name];
  const directory = scratch.make(label);
  const target = path.join(directory, 'evaluation');
  fs.cpSync(path.join(ROOT, root, folder), target, {
    recursive: true,
    filter: (file) => !['runs', 'node_modules'].includes(path.basename(file)),
  });
  return target;
}

const RUBRIC = {
  id: 'R-101',
  scaleLevels: [
    { level: 0, anchor: 'The response misses the verdict.' },
    { level: 1, anchor: 'The response states the verdict.' },
  ],
  failureModePenalties: [{ name: 'missing-verdict', description: 'A missing verdict scores zero.' }],
  maxLength: 200,
  criteria: [{ id: 'RC-101', text: 'Does the response state the verdict?', evidence: '/interactions/judge-run/stdout' }],
};

/** The committed verdict plan cut back to its `pr` checks, so a case names the live checks it needs itself. */
const prOnly = (value) => ({ ...value, checks: value.checks.filter((item) => item.placement.tier === 'pr') });

const rulesOf = (folder) => planModule.readPlan(folder).findings.map((found) => found.rule);

async function checkDerivableFields() {
  // trigger: each tier allows its own events (revert: deleting the rule passes every bad case below).
  for (const [label, tier, trigger] of [
    ['a pr check naming schedule', 'pr', ['schedule']],
    ['a pr check naming a pull request and a merge', 'pr', ['pull-request', 'merge']],
    ['a merge check naming a pull request', 'merge', ['pull-request']],
    ['a merge check naming a manual dispatch', 'merge', ['merge', 'manual-dispatch']],
    ['a scheduled check naming a release', 'scheduled', ['schedule', 'release']],
    ['a release check naming a schedule', 'release', ['release', 'schedule']],
  ]) {
    const message = derivedProblem(label, 'trigger', {
      plan: (value) => {
        if (tier === 'pr') value.checks[0].trigger = trigger;
        else value.checks.push({ ...entry('twin-run', tier), trigger });
      },
    });
    assert.match(message, new RegExp(`the ${tier} tier does not use`), label);
  }
  for (const [tier, trigger] of [
    ['scheduled', ['schedule']],
    ['scheduled', ['manual-dispatch']],
    ['scheduled', ['schedule', 'manual-dispatch']],
    ['release', ['release', 'manual-dispatch']],
    ['release', ['manual-dispatch']],
  ]) {
    derivedValid(`${tier} naming ${trigger}`, { plan: (value) => value.checks.push({ ...entry('twin-run', tier), trigger }) });
  }

  // tiers: evaluation.json names the tiers the plan uses, in any order (revert: deleting the rule passes both bad cases).
  const extra = derivedProblem('a declared tier the plan does not use', 'tiers', {
    evaluation: (value) => (value.tiers = ['pr', 'release']),
  });
  assert.match(extra, /remove release in evaluation\.json tiers/);
  {
    const folder = copyFixture('mcp', 'derived');
    const value = planOf(folder);
    value.checks.push(entry('twin-run', 'release'));
    writePlan(folder, value, { syncTiers: false });
    const missing = ci(folder, 'pr');
    assert.equal(missing.status, 10, missing.output);
    assert.match(missing.stdout, /\[tiers\] .*add release in evaluation\.json tiers/);
    assert.equal(cli(folder, 'check').status, 10);
  }
  derivedValid('declared tiers in another order', {
    plan: (value) => value.checks.push(entry('twin-run', 'release')),
    evaluation: (value) => (value.tiers = ['release', 'pr']),
  });

  // placeholder: `<evaluation-folder>` left in a command or an evidence path, while `<invocationId>` stays (revert: deleting the rule passes both).
  const inCommand = derivedProblem('a placeholder in a command', 'placeholder', {
    plan: (value) => (value.checks[0].command = ['tea-evaluate', 'check', '--evaluation', '<evaluation-folder>']),
  });
  assert.match(inCommand, /still holds <evaluation-folder> in command\[3\]/);
  const inEvidence = derivedProblem('a placeholder in an evidence path', 'placeholder', {
    plan: (value) => (value.checks[0].evidence = ['<evaluation-folder>/runs/<invocationId>/checks/check/stdout']),
  });
  assert.match(inEvidence, /still holds <evaluation-folder> in evidence\[0\]/);
  derivedValid('<invocationId> in an evidence path', {
    plan: (value) => value.checks[0].evidence.push('runs/<invocationId>/checks/check/stderr'),
  });

  // applicability: an HTTP conformance check needs an HTTP target; a rubric needs judge calibration on each live tier the plan uses.
  const noPort = derivedProblem('api-conformance over an evaluation with no HTTP target', 'applicability', {
    plan: (value) => value.checks.push(entry('api-conformance', 'pr')),
  });
  assert.match(noPort, /registry names no HTTP target/);
  const withRubric = (value) => {
    const contract = read(path.join(value, 'contract.json'));
    contract.rubrics = [RUBRIC];
    write(path.join(value, 'contract.json'), contract);
  };
  const liveSet = (tier) => [entry('twin-run', tier), entry('judge-calibration', tier)];
  for (const [label, checks, tiers] of [
    [
      'a rubric with no judge calibration on either live tier',
      [entry('twin-run', 'scheduled'), entry('twin-run', 'release')],
      ['scheduled', 'release'],
    ],
    ['a rubric with judge calibration on release alone', [...liveSet('release'), entry('twin-run', 'scheduled')], ['scheduled']],
    ['a rubric with judge calibration on scheduled alone', [...liveSet('scheduled'), entry('twin-run', 'release')], ['release']],
    ['a rubric over a release-only live set with no judge calibration', [entry('twin-run', 'release')], ['release']],
  ]) {
    const folder = copyFixture('verdict', 'derived-rubric');
    withRubric(folder);
    const value = prOnly(planOf(folder));
    value.checks.push(...checks);
    writePlan(folder, value);
    const found = planModule.readPlan(folder).findings.filter((item) => item.rule === 'applicability');
    assert.deepEqual(
      found.map((item) => /on (scheduled|release) with no judge-calibration/.exec(item.message)?.[1]),
      tiers,
      `${label}: ${JSON.stringify(found)}`,
    );
    const result = ci(folder, 'pr');
    assert.equal(result.status, 10, `${label}: ${result.output}`);
    assert.ok(result.stdout.includes(`${PLAN}: [applicability]`), `${label}: ${result.output}`);
    assert.ok(cli(folder, 'check').stdout.includes(`${PLAN}: [applicability]`), label);
  }
  {
    // The rule reads live tiers the plan uses and a declared rubric only.
    const rubric = copyFixture('verdict', 'derived-rubric');
    withRubric(rubric);
    const calibrated = prOnly(planOf(rubric));
    calibrated.checks.push(...liveSet('scheduled'), ...liveSet('release'));
    writePlan(rubric, calibrated);
    assert.equal(rulesOf(rubric).includes('applicability'), false, 'judge calibration on both live tiers satisfies the rule');
    writePlan(rubric, prOnly(planOf(rubric)));
    assert.equal(rulesOf(rubric).includes('applicability'), false, 'a plan with no scheduled or release check needs no calibration');
    const plain = copyFixture('verdict', 'derived-plain');
    assert.equal(rulesOf(plain).includes('applicability'), false, 'a contract with no rubric needs no calibration');
    // A rubric only the held-out plan declares counts.
    const held = copyFixture('verdict', 'derived-held-out');
    const manifest = path.join(held, 'evaluation.json');
    const declared = read(manifest);
    declared.partitionPlan = { heldOutPlan: 'corpus/held-out/plan.json', developmentOnlySteps: [] };
    write(manifest, declared);
    fs.mkdirSync(path.join(held, 'corpus', 'held-out'), { recursive: true });
    write(path.join(held, 'corpus', 'held-out', 'plan.json'), {
      schemaVersion: 1,
      interactionPlan: [],
      oracles: [],
      rubrics: [RUBRIC],
      behaviorOracles: {},
    });
    const heldPlan = prOnly(planOf(held));
    heldPlan.checks.push(entry('twin-run', 'release'));
    writePlan(held, heldPlan);
    assert.equal(rulesOf(held).includes('applicability'), true, 'a held-out rubric needs judge calibration on a live tier');
  }

  // placement-default: a live preflight's default follows the registry (revert: deleting the registry branch passes all four).
  {
    const secret = derivedProblem('a merge preflight defaulting to merge for a target with environmentKeys', 'placement-default', {
      folder: copyFixture('verdict', 'derived'),
      plan: (value) => (value.checks.find((item) => item.id === 'preflight-live' && item.tier === 'merge').placement.defaultTier = 'merge'),
    });
    assert.match(secret, /the target needs a secret/);
    const bare = copyEvaluation('tagged-release', 'derived-bare');
    assert.deepEqual(rulesOf(bare), [], 'the committed plan of a target that needs no secret reads clean');
    const moved = planOf(bare);
    moved.checks.find((item) => item.id === 'preflight-live').placement.defaultTier = 'release';
    writePlan(bare, moved);
    const noSecret = planModule.readPlan(bare).findings.filter((item) => item.rule === 'placement-default');
    assert.equal(noSecret.length, 1, JSON.stringify(noSecret));
    assert.match(noSecret[0].message, /needs no secret and AD-10 defaults its live preflight to merge/);
    const result = ci(bare, 'merge');
    assert.equal(result.status, 10, result.output);
    assert.ok(result.stdout.includes(`${PLAN}: [placement-default]`), result.output);
    assert.ok(cli(bare, 'check').stdout.includes(`${PLAN}: [placement-default]`));
    // Each way a target needs a secret turns the merge default into a finding.
    for (const [label, edit] of [
      ['a skill target', (evaluation) => (evaluation.targetKind = 'skill')],
      ['an agent target', (evaluation) => (evaluation.targetKind = 'agent')],
      ['a server key', (evaluation) => (evaluation.registry[0].server.environmentKeys = ['MODEL_KEY'])],
      ['an auth key', (evaluation) => (evaluation.registry[0].auth = { header: 'authorization', environmentKey: 'MODEL_KEY' })],
      [
        'the skill runner',
        (evaluation) =>
          evaluation.registry.push({
            interfaceId: 'runner',
            executable: 'tea-skill-runner',
            target: 'tea-skill-runner',
            subcommandPaths: [[]],
            artifacts: {},
            environmentKeys: [],
            maxElapsedMs: 1000,
            infrastructureExitCodes: [3, 4, 5, 6],
          }),
      ],
      [
        'the skill runner named by its executable beside another target',
        (evaluation) =>
          evaluation.registry.push({
            interfaceId: 'runner',
            executable: 'tea-skill-runner',
            target: 'bin/runner.js',
            subcommandPaths: [[]],
            artifacts: {},
            environmentKeys: [],
            maxElapsedMs: 1000,
            infrastructureExitCodes: [3, 4, 5, 6],
          }),
      ],
    ]) {
      const folder = copyEvaluation('tagged-release', 'derived-secret');
      const manifest = path.join(folder, 'evaluation.json');
      const evaluation = read(manifest);
      edit(evaluation);
      write(manifest, evaluation);
      const found = planModule.readPlan(folder).findings.filter((item) => item.rule === 'placement-default');
      assert.equal(found.length, 1, `${label}: ${JSON.stringify(found)}`);
      assert.match(found[0].message, /names defaultTier merge; the target needs a secret/, label);
    }
  }

  // A rule skips what it cannot read: the rules that read evaluation.json or contract.json give way to `check`'s own findings.
  {
    const folder = copyFixture('verdict', 'derived-skip');
    const value = prOnly(planOf(folder));
    value.checks.push(entry('twin-run', 'release'));
    writePlan(folder, value, { syncTiers: false });
    assert.ok(rulesOf(folder).includes('tiers'), 'the control: a pr-only evaluation.json beside a release check fails tiers');
    const manifest = path.join(folder, 'evaluation.json');
    const original = read(manifest);
    for (const [label, bytes] of [
      ['an evaluation.json that is not JSON', '{not json'],
      ['an evaluation.json that is an array', '[]'],
      ['an evaluation.json with tiers that are no array', JSON.stringify({ ...original, tiers: 'pr' })],
    ]) {
      fs.writeFileSync(manifest, bytes);
      const found = planModule.readPlan(folder).findings.map((item) => item.rule);
      assert.equal(found.includes('tiers'), false, `${label}: tiers`);
      assert.deepEqual(
        found.filter((rule) => ['applicability', 'placement-default'].includes(rule)),
        [],
        label,
      );
    }
    fs.writeFileSync(manifest, `${JSON.stringify(original, null, 2)}\n`);
    // A registry the rules cannot read leaves the preflight default with nothing to read. The target is no model kind, so
    // the registry is read (revert: deleting an entry-shape guard in ci-plan.js or registry.js throws on these inputs).
    const registryFolder = copyEvaluation('tagged-release', 'derived-registry-skip');
    const registryPlan = planOf(registryFolder);
    registryPlan.checks.find((item) => item.id === 'preflight-live').placement.defaultTier = 'release';
    writePlan(registryFolder, registryPlan);
    const registryManifest = path.join(registryFolder, 'evaluation.json');
    const registryOriginal = read(registryManifest);
    const placementDefaults = () =>
      planModule
        .readPlan(registryFolder)
        .findings.map((item) => item.rule)
        .filter((rule) => rule === 'placement-default');
    assert.deepEqual(
      placementDefaults(),
      ['placement-default'],
      'the control: a release default over a registry that needs no secret fails',
    );
    for (const [label, registry] of [
      ['a registry of null and string entries', [null, 'x']],
      ['a registry that is no array', 5],
      ['an HTTP entry with auth null and server keys that are a number', [{ kind: 'api', auth: null, server: { environmentKeys: 5 } }]],
      ['a command entry whose environmentKeys is a string', [{ environmentKeys: 'KEY' }]],
    ]) {
      fs.writeFileSync(registryManifest, JSON.stringify({ ...registryOriginal, registry }));
      assert.deepEqual(placementDefaults(), [], label);
    }
    fs.writeFileSync(registryManifest, `${JSON.stringify(registryOriginal, null, 2)}\n`);
    // The shared key reader tolerates the same entries where principal mappings read it, so `check` reports the registry schema finding.
    for (const entryShape of [{ environmentKeys: 'KEY' }, { kind: 'api', server: { environmentKeys: 5 }, auth: null }]) {
      const problems = principalMappingProblems({ operator: { interfaceId: 'x', environmentKey: 'KEY' } }, [
        { interfaceId: 'x', ...entryShape },
      ]);
      assert.equal(problems.length, 1, JSON.stringify(entryShape));
      assert.match(problems[0], /is not authorized by registry interface/);
    }
    // A contract that cannot be read leaves the rubric rule with nothing to read.
    withRubric(folder);
    assert.ok(rulesOf(folder).includes('applicability'), 'the control: a rubric with no judge calibration on release fails applicability');
    fs.writeFileSync(path.join(folder, 'contract.json'), '{not json');
    assert.equal(rulesOf(folder).includes('applicability'), false);
    // A plan with no check has no tiers to compare.
    const none = copyFixture('verdict', 'derived-empty');
    writePlan(none, { schemaVersion: planModule.PLAN_SCHEMA_VERSION, checks: [] });
    assert.equal(rulesOf(none).includes('tiers'), false);
  }
  // A development run never opens the held-out plan, the rubric rule included (Story 1.51); `check` and a both run open it.
  {
    const held = copyFixture('verdict', 'derived-open');
    const manifest = path.join(held, 'evaluation.json');
    const declared = read(manifest);
    declared.partitionPlan = { heldOutPlan: 'corpus/held-out/plan.json', developmentOnlySteps: [] };
    write(manifest, declared);
    fs.mkdirSync(path.join(held, 'corpus', 'held-out'), { recursive: true });
    write(path.join(held, 'corpus', 'held-out', 'plan.json'), {
      schemaVersion: 1,
      interactionPlan: [],
      oracles: [],
      rubrics: [RUBRIC],
      behaviorOracles: {},
    });
    const livePlan = prOnly(planOf(held));
    livePlan.checks.push(entry('twin-run', 'release'));
    writePlan(held, livePlan);
    const opened = async (partition) => {
      const seen = [];
      const real = fs.readFileSync;
      fs.readFileSync = function (file, ...rest) {
        if (String(file).includes(`${path.sep}held-out${path.sep}`)) seen.push(String(file));
        return real.call(this, file, ...rest);
      };
      try {
        await checkEvaluation(held, { partition });
      } finally {
        fs.readFileSync = real;
      }
      return seen;
    };
    assert.deepEqual(await opened('development'), [], 'a development run opened the held-out plan');
    assert.ok((await opened()).length > 0, 'the control: check opens the held-out plan');
  }

  // placement-reason: every check records one, on its default tier or off it (revert: deleting the rule passes all three).
  for (const [label, edit] of [
    ['an empty reason on a default placement', (value) => (value.checks[0].placement.reason = '')],
    ['a blank reason on a default placement', (value) => (value.checks[0].placement.reason = '  \t')],
    ['no reason field on a default placement', (value) => delete value.checks[0].placement.reason],
  ]) {
    const message = derivedProblem(label, 'placement-reason', { plan: edit });
    assert.match(message, /records no reason; name the file or the adopter's answer the placement came from/, label);
  }
}

// ---------------------------------------------------------------------------
// The gated jobs of a plan (Story 1.97): the optional `gates` list of a check

/** The jobs of `gates` entries `check` and `ci` accept, and the shapes and names they refuse with a `gates` finding. */
function checkGatedJobs() {
  // A job id is accepted wherever the plan places a check (revert: dropping `gates` from the schema fails every valid case below).
  for (const [label, gates] of [
    ['a plain id', ['publish']],
    ['an id with a hyphen and an underscore', ['deploy-to_prod']],
    ['an id that starts with an underscore', ['_deploy']],
    ['an id in upper case with digits', ['Deploy2']],
    ['two ids', ['publish', 'deploy']],
  ]) {
    derivedValid(label, { plan: (value) => (value.checks[0].gates = gates) });
  }

  // A name that is no job id exits 10 from both commands with the `gates` rule and no other (revert: removing the pattern from the
  // schema passes every name below; reporting the violation as `schema` fails the rule assertion).
  for (const name of [
    '',
    '1deploy',
    '-deploy',
    'deploy prod',
    'deploy.prod',
    'deploy/prod',
    'deploy;rm',
    'deploy\n',
    '${{ matrix.job }}',
    'déploy',
  ]) {
    const folder = copyFixture('mcp', 'gates');
    const message = derivedProblem(`the name ${JSON.stringify(name)}`, 'gates', {
      folder,
      plan: (value) => (value.checks[2].gates = ['publish', name]),
    });
    assert.match(
      message,
      /checks\[2\]\.gates\[1\] is .*, which is not a job id; name the id of a job in one of the repository's workflow files/,
      JSON.stringify(name),
    );
    assert.deepEqual(rulesOf(folder), ['gates'], `the name ${JSON.stringify(name)} reports the gates rule alone`);
  }

  // The list itself: a non-empty list of distinct strings (revert: dropping minItems, uniqueItems or the item type passes the case).
  for (const [label, gates, expected] of [
    ['a name outside a list', 'publish', /checks\[0\]\.gates must be array/],
    ['an empty list', [], /checks\[0\]\.gates must NOT have fewer than 1 items/],
    ['a repeated name in one check', ['publish', 'publish'], /checks\[0\]\.gates must NOT have duplicate items/],
    ['a number', [5], /checks\[0\]\.gates\[0\] must be string/],
  ]) {
    const folder = copyFixture('mcp', 'gates');
    const message = derivedProblem(label, 'gates', { folder, plan: (value) => (value.checks[0].gates = gates) });
    assert.match(message, expected, label);
    assert.deepEqual(rulesOf(folder), ['gates'], label);
  }

  // A violation elsewhere in the plan keeps the rule `schema` (revert: mapping every schema error to `gates` fails this).
  {
    const folder = copyFixture('mcp', 'gates');
    derivedProblem('a schema violation next to a gate', 'schema', {
      folder,
      plan: (value) => {
        value.checks[0].gates = ['publish'];
        value.checks[1].enforcement = 'optional';
      },
    });
    assert.deepEqual(rulesOf(folder), ['schema']);
  }

  // The jobs a tier gates are the union over its checks: a name on two checks of one tier is merged and no finding, and a name
  // on checks of two tiers is valid (revert: reading a repeat across checks as a duplicate fails the first two cases).
  derivedValid('one job named on two checks of a tier', {
    plan: (value) => {
      value.checks[0].gates = ['publish'];
      value.checks[1].gates = ['publish'];
    },
  });
  derivedValid('different jobs on the checks of a tier', {
    plan: (value) => {
      value.checks[0].gates = ['publish'];
      value.checks[1].gates = ['deploy'];
      value.checks[2].gates = ['publish', 'deploy'];
    },
  });
  derivedValid('one job on checks of two tiers', {
    plan: (value) => {
      value.checks[0].gates = ['publish'];
      value.checks.push({ ...entry('twin-run', 'release'), gates: ['publish'] });
    },
  });
  // A gate check takes the list too, and the plan alone validates it (the guide's tagged examples are held to `planFindings`).
  derivedValid('a gate check naming a job', {
    plan: (value) =>
      value.checks.push({
        ...entry('lockfile-age', 'pr', { kind: 'gate', command: ['eval-quality-gates', 'lockfile-age'] }),
        gates: ['publish'],
      }),
  });
  assert.deepEqual(planModule.planFindings({ schemaVersion: 1, checks: [{ ...entry('check', 'pr'), gates: ['publish'] }] }), []);
  assert.deepEqual(
    planModule.planFindings({ schemaVersion: 1, checks: [{ ...entry('check', 'pr'), gates: ['not a job'] }] }).map((found) => found.rule),
    ['gates'],
  );
}

function checkWiring() {
  const folder = copyFixture('mcp', 'wiring');
  // A tier with no checks is not an error: nothing runs, and the invocation still leaves its summary.
  const empty = ci(folder, 'merge');
  assert.equal(empty.status, 0, empty.output);
  assert.match(empty.stdout, /the merge tier has no checks in the plan/);
  assert.deepEqual(latestCi(folder).json.checks, []);
  assert.equal(latestCi(folder).json.exit, 0);
  // An unknown tier is a usage error, and so is a missing one.
  for (const [label, tier] of [
    ['an unknown tier', 'nightly'],
    ['no tier', undefined],
  ]) {
    const result = ci(folder, tier);
    assert.equal(result.status, 64, `${label}: ${result.output}`);
    assert.match(result.stderr, /--tier/, `${label}: the usage error does not name --tier`);
  }
  // No plan file: a wiring finding naming the path, and nothing ran.
  fs.rmSync(path.join(folder, 'ci'), { recursive: true });
  const before = fs.readdirSync(path.join(folder, 'runs')).length;
  const none = ci(folder, 'pr');
  assert.equal(none.status, 64, none.output);
  assert.ok(none.stdout.includes(path.join(folder, PLAN)), `the wiring finding does not name the plan path\n${none.output}`);
  assert.equal(fs.readdirSync(path.join(folder, 'runs')).length, before, 'ci with no plan wrote a run directory');
  // A plan that is not JSON is an authoring defect.
  fs.mkdirSync(path.join(folder, 'ci'));
  fs.writeFileSync(path.join(folder, PLAN), '{ not json');
  const broken = ci(folder, 'pr');
  assert.equal(broken.status, 10, broken.output);
  assert.match(broken.stdout, /\[json\]/);
  // No evaluation resolves.
  assert.equal(spawnSync(process.execPath, [CLI, 'ci', '--tier', 'pr'], { encoding: 'utf8' }).status, 64);
  // A baseline-reading check with no baseline/ is a wiring defect naming it.
  const unbaselined = copyFixture('mcp', 'unbaselined');
  fs.rmSync(path.join(unbaselined, 'baseline'), { recursive: true });
  const missing = ci(unbaselined, 'pr');
  const rows = latestCi(unbaselined).json;
  assert.equal(missing.status, 64, missing.output);
  for (const id of ['oracle-agreement', 'replay']) assert.equal(rowOf(rows, id).exit, 64, `${id} without a baseline`);
  // Every other check still ran: a failed check does not stop the rest.
  assert.deepEqual(
    rows.checks.map((row) => row.id),
    planOf(unbaselined).checks.map((item) => item.id),
  );
  assert.equal(rowOf(rows, 'compile').exit, 0);
}

// ---------------------------------------------------------------------------
// AD-10 as written

const SPINE_TEXT = fs.readFileSync(SPINE, 'utf8');
const AD10 = SPINE_TEXT.slice(SPINE_TEXT.indexOf('### AD-10'), SPINE_TEXT.indexOf('### AD-11'));

/** The rows of AD-10's enforcement table: exit, source, class cell and action cell. */
function spineRows() {
  return AD10.split('\n')
    .map((line) => /^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/.exec(line))
    .filter((match) => match !== null)
    .map(([, exit, source, kind, action]) => ({
      exit: Number(exit),
      source: source.replaceAll('`', ''),
      kind: kind.toLowerCase(),
      action: action.toLowerCase(),
    }));
}

/** The problems between a code table and AD-10's rows; none when every row agrees. */
function tableProblems(table) {
  const problems = [];
  const rows = spineRows();
  if (rows.length !== table.length) problems.push(`AD-10 has ${rows.length} rows and the table ${table.length}`);
  for (const row of rows) {
    const found = table.find((candidate) => candidate.exit === row.exit && candidate.source === row.source);
    if (found === undefined) {
      problems.push(`no row for exit ${row.exit} of ${row.source}`);
      continue;
    }
    if (!row.kind.includes(found.class))
      problems.push(`exit ${row.exit} of ${row.source} is class "${found.class}", AD-10 says "${row.kind}"`);
    const action = row.action.startsWith('block') ? 'block' : row.action.startsWith('pass') ? 'pass' : 'unknown';
    if (found.action !== action) problems.push(`exit ${row.exit} of ${row.source} is action ${found.action}, AD-10 says ${row.action}`);
  }
  return problems;
}

async function checkEnforcementTable() {
  assert.deepEqual(tableProblems(planModule.ENFORCEMENT_TABLE), []);
  // Revert check: swapping two classes in the map fails the row case.
  const swapped = planModule.ENFORCEMENT_TABLE.map((row) => ({ ...row }));
  const [two, four] = [swapped.find((row) => row.exit === 2), swapped.find((row) => row.exit === 4)];
  [two.class, four.class] = [four.class, two.class];
  assert.ok(tableProblems(swapped).length >= 2, 'swapping the classes of exits 2 and 4 did not fail the row case');
  // `classify` reads the row of the check's kind: 64 is a wiring defect from every source, exit 1 a gate's alone.
  for (const [kind, exit, expected] of [
    ['evaluate', 0, 'pass'],
    ['evaluate', 2, 'target behavior failure'],
    ['evaluate', 3, 'infrastructure or integrity'],
    ['evaluate', 4, 'contract authoring defect'],
    ['evaluate', 5, 'runtime fault'],
    ['evaluate', 10, 'authoring defect'],
    ['evaluate', 11, 'evaluation weakness'],
    ['evaluate', 12, 'infrastructure'],
    ['evaluate', 13, 'evaluation evidence drift'],
    ['evaluate', 64, 'wiring defect'],
    ['gate', 1, 'repository policy violation'],
    ['gate', 64, 'wiring defect'],
  ]) {
    assert.equal(planModule.classify(kind, exit).class, expected, `${kind} exit ${exit}`);
    assert.equal(planModule.classify(kind, exit).action, exit === 0 ? 'pass' : 'block', `${kind} exit ${exit}`);
  }
  assert.equal(planModule.classify('evaluate', 1).class, 'undocumented exit', 'exit 1 is a gate exit');
  // The final exit is the most severe blocking one, in the order AD-10 records (a coordinator decision).
  assert.deepEqual(planModule.SEVERITY, [64, 12, 5, 4, 3, 13, 11, 10, 2, 1]);
  assert.match(AD10, /64, 12, 5, 4, 3, 13, 11, 10, 2, 1/, 'AD-10 does not record the severity order');
  for (const [index, worse] of planModule.SEVERITY.entries()) {
    for (const lesser of [...planModule.SEVERITY.slice(index + 1), 0]) {
      assert.equal(planModule.mostSevere([lesser, worse, 0]), worse);
      assert.equal(planModule.mostSevere([worse, lesser]), worse);
    }
  }
  assert.equal(planModule.mostSevere([]), 0);
  // The outcome states reach CI as AD-10 says: the engine decides each state's exit, and CI reads it.
  const engine = await loadEngine();
  const schema = read(path.join(ROOT, 'node_modules', 'eval-quality', 'schemas', 'evidence-artifact.schema.json'));
  const states = JSON.stringify(schema)
    .match(/"state":\s*\{"type":\s*"string",\s*"enum":\s*\[([^\]]+)\]/)[1]
    .replaceAll('"', '')
    .split(/,\s*/);
  assert.equal(states.length, 12);
  const mapping = {
    'FAIL at or above severityFloor, CONCERNS below': ['missed', 'abstained', 'bypassed', 'false-positive'],
    'Invalid (exit 3), reported as infrastructure': ['oracle-error', 'judge-error', 'infrastructure-error'],
    'CONCERNS evidence condition (warn)': ['unreached'],
    'counted as measured': ['caught', 'confirmed', 'passed-clean-control', 'not-applicable'],
  };
  assert.deepEqual(
    Object.values(mapping).flat().sort(),
    [...states].sort(),
    'the mapping does not cover the twelve outcome states exactly once',
  );
  const paragraph = AD10.slice(AD10.indexOf('**Outcome states:**'), AD10.indexOf('**Informs:**'));
  assert.ok(
    /`missed`, `abstained`, `bypassed` and `false-positive` at or above `severityFloor` reach CI as FAIL \(exit 2\)/.test(paragraph),
    'AD-10 states the FAIL group otherwise',
  );
  assert.ok(/below it, as CONCERNS/.test(paragraph));
  assert.ok(
    /`oracle-error`, `judge-error` and `infrastructure-error` reach it as Invalid \(exit 3\), reported as infrastructure/.test(paragraph),
  );
  assert.ok(/`unreached` and below-minimum trials are CONCERNS evidence conditions: warn/.test(paragraph));
  assert.ok(typeof engine.compareDominance === 'function');
}

/** AD-10's default tiers, each check named by the words the bullet uses. */
const DEFAULT_WORDS = {
  check: 'tea-evaluate check',
  compile: '`compile`',
  seal: '`seal`',
  'api-conformance': 'API port conformance',
  gameability: 'gameability arm',
  'oracle-agreement': 'oracle-versus-scorer agreement',
  replay: 'replay of committed baseline',
  'preflight-live': 'live preflight',
  'twin-run': 'twin run',
  'held-out': 'held-out partition',
  'judge-calibration': 'judge calibration',
  'strength-comparison': 'strength comparison',
};

function checkTierMembership() {
  const bullet = (tier) => AD10.split('\n').find((line) => line.startsWith(`  - \`${tier}\`:`)) ?? '';
  const named = (tier) => Object.keys(DEFAULT_WORDS).filter((id) => bullet(tier).includes(DEFAULT_WORDS[id]));
  const fromPlan = (tier) => Object.keys(planModule.DEFAULT_TIERS).filter((id) => planModule.DEFAULT_TIERS[id].includes(tier));
  assert.deepEqual(named('pr').sort(), [...PR_IDS].sort(), 'AD-10 names other pr checks');
  assert.deepEqual(fromPlan('pr').sort(), named('pr').sort());
  // merge is `pr` plus a live preflight; scheduled adds the twin run, the held-out partition, judge calibration and the comparison; release is the scheduled set.
  assert.deepEqual(named('merge'), ['preflight-live']);
  assert.ok(fromPlan('merge').includes('preflight-live'));
  assert.deepEqual(named('scheduled').sort(), ['held-out', 'judge-calibration', 'preflight-live', 'strength-comparison', 'twin-run']);
  assert.match(bullet('release'), /the `scheduled` set/);
  for (const id of named('scheduled'))
    assert.ok(fromPlan('scheduled').includes(id) && fromPlan('release').includes(id), `${id} is not a default of scheduled and release`);
  assert.deepEqual(planModule.DETERMINISTIC_CHECKS.sort(), named('pr').sort());
  assert.deepEqual([...planModule.LIVE_CHECKS].sort(), named('scheduled').sort());
  assert.deepEqual(planModule.TIERS, ['pr', 'merge', 'scheduled', 'release']);
  // The schema's closed set of evaluate ids is exactly the twelve AD-10 members.
  const schema = read(path.join(ROOT, 'cli', 'lib', 'evaluate', 'schemas', 'evaluation-ci-plan.schema.json'));
  assert.deepEqual([...schema.$defs.EvaluateCheckId.enum].sort(), Object.keys(DEFAULT_WORDS).sort());
}

function checkStaticRules() {
  const sources = ['ci.js', 'ci-plan.js', 'schemas/evaluation-ci-plan.schema.json'].map((name) => [
    name,
    fs.readFileSync(path.join(ROOT, 'cli', 'lib', 'evaluate', name), 'utf8'),
  ]);
  const unreachable = ['evidence-over-truncated', 'evidence-unavailable', 'evidence-internally-inconsistent'];
  for (const [name, text] of sources) {
    for (const claim of unreachable)
      assert.equal(text.includes(claim), false, `${name} claims ${claim}, which the engine cannot emit through CI`);
  }
  // TeA holds no table of oracle dispositions: the engine's corroboration is read as recorded.
  assert.equal(sources.find(([name]) => name === 'ci.js')[1].includes('disposition'), false, 'ci.js holds a disposition table');
  // No runtime file and no committed plan passes `--strict`.
  const walk = (directory, found = []) => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, item.name);
      if (item.isDirectory()) walk(file, found);
      else if (item.isFile()) found.push(file);
    }
    return found;
  };
  const scanned = [
    ...walk(path.join(ROOT, 'cli')),
    ...Object.values(FIXTURES).map(({ root, folder }) => path.join(ROOT, root, folder, PLAN)),
  ];
  for (const file of scanned) {
    // The one CLI line that mentions `--strict` is a comment.
    const text = fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => !/^\s*(?:\*|\/\/|\/\*)/.test(line))
      .join('\n');
    // `--strict-mcp-config` and the like are other flags of other tools.
    assert.equal(/--strict(?![-\w])/.test(text), false, `${path.relative(ROOT, file)} passes --strict`);
  }
  // Exit 13 is written once and agrees across the CLI, its reference, AD-10 and the skill's gap table.
  assert.equal(EXIT_CODES.drift, 13);
  const header = fs.readFileSync(CLI, 'utf8').split('*/')[0];
  assert.match(header, /13\s+evaluation evidence drift/);
  assert.match(header, /tea-evaluate ci --evaluation <path> --tier/);
  const reference = fs.readFileSync(path.join(ROOT, 'docs', 'reference', 'tea-evaluate-cli.md'), 'utf8');
  assert.match(reference, /^## ci$/m);
  // The exit table is the real one, under `## Exit codes`: row 13 and the `ci` causes of every row `ci` can give. The
  // other tables (the controlled-mutation steps, the skill runner) say nothing of `ci`.
  const exitTable = reference.slice(reference.indexOf('\n## Exit codes\n'));
  assert.match(exitTable, /\n\|\s*13\s*\|[^\n]*evidence drift/i);
  for (const code of ['0', '1', '2', '3-5', '10', '11', '12', '64']) {
    assert.match(exitTable, new RegExp(`\\n\\|\\s*${code}\\s*\\|[^\\n]*\`ci\``), `the exit table's row ${code} does not name ci`);
  }
  const between = (from, to) => reference.slice(reference.indexOf(from), reference.indexOf(to));
  for (const [heading, until] of [
    ['## Controlled mutations\n', '## Historical probes\n'],
    ['## tea-skill-runner\n', '## Exit codes\n'],
  ]) {
    assert.doesNotMatch(between(heading, until), /`ci`|evidence drift/, `${heading.trim()} carries ci's exit causes`);
  }
  assert.match(AD10, /\|\s*13\s*\|[^\n]*evaluation evidence drift/);
  assert.match(AD10, /Amended 2026-10-01 in Story 2\.2/);
  const gaps = fs.readFileSync(path.join(ROOT, 'src', 'workflows', 'testarch', 'bmad-testarch-evaluate', 'references', 'gaps.md'), 'utf8');
  assert.match(gaps, /^\|\s*`tea-evaluate 13`\s*\|[^\n]*drift[^\n]*`ci --tier pr` exits 13/m);
}

// ---------------------------------------------------------------------------
// Gate checks and persistence

/** A stub `eval-quality-gates` on PATH: it logs its argv, prints known bytes to each stream and exits as its first argument says. */
function stubGates(directory) {
  const bin = path.join(directory, 'bin');
  fs.mkdirSync(bin);
  const log = path.join(directory, 'gates.log');
  const script = path.join(bin, 'eval-quality-gates');
  fs.writeFileSync(
    script,
    `#!${process.execPath}
const fs = require('node:fs');
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + '\\n');
const mode = process.argv[2];
// Known bytes on each stream: no closing newline on stdout, a byte no text decoding keeps on stderr.
const preambleOut = Buffer.from('gate stdout line 1\\ngate stdout line 2 (no newline)', 'utf8');
const preambleErr = Buffer.concat([Buffer.from('gate stderr \\u00e9\\n', 'utf8'), Buffer.from([0xff, 0xfe, 0x0a])]);
process.stdout.write(preambleOut);
process.stderr.write(preambleErr);
if (mode === 'hang') {
  // A descendant in the gate's own process group, both pids recorded for the test, then nothing more: the gate runs until it is stopped.
  const grandchild = require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 600000)'], { stdio: 'ignore' });
  fs.writeFileSync(process.argv[3], JSON.stringify({ gate: process.pid, grandchild: grandchild.pid }));
  setTimeout(() => {}, 600000);
} else if (mode === 'background') {
  // What \`(sleep 301 >/dev/null 2>&1 </dev/null &); echo done; exit 0\` leaves: a descendant in the gate's process group
  // that holds none of its streams, so they close the moment the gate exits. Its pid is recorded for the test.
  const sleeper = require('node:child_process').spawn('sleep', ['301'], { stdio: 'ignore' });
  fs.writeFileSync(process.argv[3], String(sleeper.pid));
  sleeper.unref();
} else if (mode === 'fill') {
  // Output up to a total of argv[3] bytes over both streams, preamble included, in 1 MiB writes; the last byte is a write
  // of its own, after the rest has been read, so it meets the bound as a chunk that arrives with no room left or exactly
  // filling it. The gate then exits cleanly.
  let remaining = Number(process.argv[3]) - 1 - preambleOut.length - preambleErr.length;
  const pump = () => {
    while (remaining > 0) {
      const chunk = Buffer.alloc(Math.min(1024 * 1024, remaining), 121);
      remaining -= chunk.length;
      if (!process.stdout.write(chunk)) {
        process.stdout.once('drain', pump);
        return;
      }
    }
    setTimeout(() => process.stdout.write('y'), 300);
  };
  pump();
} else if (mode === 'flood') {
  // More than the runtime's output bound, in 1 MiB writes.
  const chunk = Buffer.alloc(1024 * 1024, 120);
  let written = 0;
  const pump = () => {
    while (written < 70) {
      written += 1;
      if (!process.stdout.write(chunk)) {
        process.stdout.once('drain', pump);
        return;
      }
    }
  };
  pump();
} else {
  process.exitCode = { fail: 1, wiring: 64, ok: 0, odd: 7 }[mode] ?? 0;
}
`,
    { mode: 0o755 },
  );
  return { bin, log };
}

function checkGates() {
  const stubs = stubGates(scratch.make('gates'));
  const env = { PATH: `${stubs.bin}${path.delimiter}${process.env.PATH}` };
  const knownStdout = Buffer.from('gate stdout line 1\ngate stdout line 2 (no newline)', 'utf8');
  const knownStderr = Buffer.concat([Buffer.from('gate stderr é\n', 'utf8'), Buffer.from([0xff, 0xfe, 0x0a])]);
  const gate = (id, mode, extra = []) => entry(id, 'pr', { kind: 'gate', command: ['eval-quality-gates', mode, ...extra] });

  // The stub gate that exits 1: three captured files byte for byte, the recorded code 1, ci exit 1 (revert: dropping the
  // capture fails on a stream or on the code).
  const folder = copyFixture('mcp', 'gate');
  const marker = path.join(path.dirname(folder), 'shell-marker');
  writePlan(folder, {
    schemaVersion: planModule.PLAN_SCHEMA_VERSION,
    checks: [gate('stub-gate', 'fail', [`$(touch ${marker}); echo "x" | cat`, '--flag=a b'])],
  });
  const failed = ci(folder, 'pr', env);
  assert.equal(failed.status, 1, failed.output);
  const { directory, json } = latestCi(folder);
  const captured = path.join(directory, 'checks', 'stub-gate');
  assert.equal(fs.readFileSync(path.join(captured, 'exit-code'), 'utf8').trim(), '1');
  assert.equal(fs.readFileSync(path.join(captured, 'stdout')).equals(knownStdout), true, "the captured stdout is not the gate's bytes");
  assert.equal(fs.readFileSync(path.join(captured, 'stderr')).equals(knownStderr), true, "the captured stderr is not the gate's bytes");
  assert.equal(rowOf(json, 'stub-gate').exit, 1);
  assert.equal(rowOf(json, 'stub-gate').class, 'repository policy violation');
  assert.equal(rowOf(json, 'stub-gate').action, 'block');
  assert.equal(json.exit, 1);
  // The argv is the plan's, with no shell: metacharacters reach the gate as the text they are, and nothing ran them.
  assert.deepEqual(shimLog(stubs.log).at(-1), ['fail', `$(touch ${marker}); echo "x" | cat`, '--flag=a b']);
  assert.equal(fs.existsSync(marker), false, 'the gate command line was run through a shell');

  // Every gate runs whatever an earlier one did; the most severe exit wins (64 outranks 1), and an exit the gate's table
  // does not name passes through verbatim as an undocumented block.
  const several = copyFixture('mcp', 'gates');
  writePlan(several, {
    schemaVersion: planModule.PLAN_SCHEMA_VERSION,
    checks: [gate('first-gate', 'fail'), gate('second-gate', 'wiring'), gate('third-gate', 'ok'), gate('odd-gate', 'odd')],
  });
  const all = ci(several, 'pr', env);
  assert.equal(all.status, 64, all.output);
  const rows = latestCi(several).json;
  assert.deepEqual(
    rows.checks.map((row) => [row.id, row.exit, row.action]),
    [
      ['first-gate', 1, 'block'],
      ['second-gate', 64, 'block'],
      ['third-gate', 0, 'pass'],
      ['odd-gate', 7, 'block'],
    ],
  );
  assert.equal(rowOf(rows, 'odd-gate').class, 'undocumented exit');
  for (const id of ['first-gate', 'second-gate', 'third-gate', 'odd-gate']) {
    assert.equal(
      fs.readFileSync(path.join(latestCi(several).directory, 'checks', id, 'stdout')).equals(knownStdout),
      true,
      `${id}: stdout`,
    );
  }
  // An exit outside AD-10's table ranks after 1 in the final exit: gates that exit 1 and 7 give 1, in either order
  // (revert: ranking an undocumented exit first gives 7).
  for (const [label, modes] of [
    ['fail then odd', ['fail', 'odd']],
    ['odd then fail', ['odd', 'fail']],
  ]) {
    const ordered = copyFixture('mcp', 'gates-order');
    writePlan(ordered, {
      schemaVersion: planModule.PLAN_SCHEMA_VERSION,
      checks: modes.map((mode) => gate(`${mode}-gate`, mode)),
    });
    const outcome = ci(ordered, 'pr', env);
    assert.equal(outcome.status, 1, `${label}: ${outcome.output}`);
    assert.equal(latestCi(ordered).json.exit, 1, label);
  }
  // A gate that cannot start is infrastructure, with a message in place of output.
  const missing = copyFixture('mcp', 'gate-missing');
  writePlan(missing, { schemaVersion: planModule.PLAN_SCHEMA_VERSION, checks: [gate('absent-gate', 'ok')] });
  const absent = ci(missing, 'pr', { PATH: path.dirname(process.execPath) });
  assert.equal(absent.status, 12, absent.output);
  assert.match(
    fs.readFileSync(path.join(latestCi(missing).directory, 'checks', 'absent-gate', 'stderr'), 'utf8'),
    /could not start eval-quality-gates/,
  );
  // The action comes from AD-10's table alone, so a plan cannot record warn for a gate: validation refuses it, ci and
  // check alike, and nothing runs (revert: an `enforcement` rule that lets warn through exits the gate's own 1 or 0).
  placementCase(
    'a gate that records enforcement warn',
    (value) => value.checks.push({ ...gate('warn-gate', 'fail'), enforcement: 'warn' }),
    'enforcement',
  );
}

/** The pids a `hang` gate recorded: the gate and its descendant in the gate's process group. */
async function hangingPids(file) {
  assert.ok(await appears(file), 'the hanging gate did not start');
  return read(file);
}

async function checkGateLimits() {
  const directory = scratch.make('gate-limits');
  const stubs = stubGates(directory);
  const env = { PATH: `${stubs.bin}${path.delimiter}${process.env.PATH}` };
  const gate = (id, mode, extra = []) => entry(id, 'pr', { kind: 'gate', command: ['eval-quality-gates', mode, ...extra] });
  const knownStdout = Buffer.from('gate stdout line 1\ngate stdout line 2 (no newline)', 'utf8');

  // A gate that runs past its plan check's timeoutMs is stopped with its whole process group, exit 12, and what it printed
  // before is kept (revert: a gate with no timeout hangs this case; a kill of the child alone leaves the descendant).
  const slow = copyFixture('mcp', 'gate-timeout');
  const pids = path.join(directory, 'timeout-pids.json');
  writePlan(slow, {
    schemaVersion: planModule.PLAN_SCHEMA_VERSION,
    checks: [{ ...gate('slow-gate', 'hang', [pids]), timeoutMs: 1000 }],
  });
  const started = Date.now();
  const stopped = ci(slow, 'pr', env);
  assert.equal(stopped.status, 12, stopped.output);
  assert.ok(Date.now() - started < 60_000, 'the gate was not stopped at its timeout');
  const row = rowOf(latestCi(slow).json, 'slow-gate');
  assert.deepEqual([row.exit, row.class, row.action], [12, 'infrastructure', 'block']);
  assert.ok(
    row.notes.some((note) => /^eval-quality-gates ran past its 1000 ms limit and was stopped$/.test(note)),
    JSON.stringify(row.notes),
  );
  assert.equal(fs.readFileSync(path.join(latestCi(slow).directory, 'checks', 'slow-gate', 'stdout')).equals(knownStdout), true);
  assert.equal(fs.readFileSync(path.join(latestCi(slow).directory, 'checks', 'slow-gate', 'exit-code'), 'utf8').trim(), '12');
  const recorded = read(pids);
  assert.equal(await goneWithin([recorded.gate, recorded.grandchild]), true, 'a timed-out gate left a process behind');

  // A gate that prints past the bound is killed and exits 12, with the bytes up to the bound kept.
  const flooding = copyFixture('mcp', 'gate-flood');
  writePlan(flooding, { schemaVersion: planModule.PLAN_SCHEMA_VERSION, checks: [gate('flood-gate', 'flood')] });
  const flooded = ci(flooding, 'pr', env);
  assert.equal(flooded.status, 12, flooded.output.slice(0, 2000));
  const floodRow = rowOf(latestCi(flooding).json, 'flood-gate');
  assert.deepEqual([floodRow.exit, floodRow.class], [12, 'infrastructure']);
  assert.ok(
    floodRow.notes.some((note) => /printed more than 67108864 bytes and was stopped/.test(note)),
    JSON.stringify(floodRow.notes),
  );
  const kept = path.join(latestCi(flooding).directory, 'checks', 'flood-gate', 'stdout');
  const keptStderr = path.join(latestCi(flooding).directory, 'checks', 'flood-gate', 'stderr');
  assert.equal(fs.statSync(kept).size + fs.statSync(keptStderr).size, 64 * 1024 * 1024, 'the captured output is not cut at the bound');
  assert.equal(fs.readFileSync(kept).subarray(0, knownStdout.length).equals(knownStdout), true, 'the captured output lost its start');

  // The bound is inclusive: a gate that prints exactly MAX_OUTPUT_BYTES passes with all of it kept, and one byte more
  // stops it with exit 12 and the bytes up to the bound kept (revert: stopping at `size >= MAX_OUTPUT_BYTES` fails the
  // first; a bound that never stops fails the second).
  for (const [label, total, status] of [
    ['exactly the bound', MAX_OUTPUT_BYTES, 0],
    ['one byte over the bound', MAX_OUTPUT_BYTES + 1, 12],
  ]) {
    const bounded = copyFixture('mcp', 'gate-bound');
    writePlan(bounded, { schemaVersion: planModule.PLAN_SCHEMA_VERSION, checks: [gate('bound-gate', 'fill', [String(total)])] });
    const outcome = ci(bounded, 'pr', env);
    assert.equal(outcome.status, status, `${label}: ${outcome.output.slice(0, 2000)}`);
    const captured = path.join(latestCi(bounded).directory, 'checks', 'bound-gate');
    assert.equal(
      fs.statSync(path.join(captured, 'stdout')).size + fs.statSync(path.join(captured, 'stderr')).size,
      MAX_OUTPUT_BYTES,
      `${label}: the captured output is not the bound`,
    );
    const notes = rowOf(latestCi(bounded).json, 'bound-gate').notes;
    assert.equal(
      notes.some((note) => /printed more than/.test(note)),
      status === 12,
      `${label}: ${JSON.stringify(notes)}`,
    );
  }

  // A descendant that outlives the gate with no stream open (what `(sleep 301 >/dev/null 2>&1 </dev/null &); echo done;
  // exit 0` leaves) is killed with the gate's process group when the gate ends: the streams close at once, so nothing
  // waits for them (revert: ending the group only while a stream stays open leaves the sleeper running).
  const background = copyFixture('mcp', 'gate-background');
  const sleeperFile = path.join(directory, 'background-pid');
  writePlan(background, { schemaVersion: planModule.PLAN_SCHEMA_VERSION, checks: [gate('background-gate', 'background', [sleeperFile])] });
  const sleeping = ci(background, 'pr', env);
  const sleeper = Number(fs.readFileSync(sleeperFile, 'utf8'));
  try {
    assert.equal(sleeping.status, 0, sleeping.output);
    assert.equal(await goneWithin([sleeper], 5000), true, 'a descendant of a gate that exited outlived ci');
  } finally {
    if (alive(sleeper)) process.kill(sleeper, 'SIGKILL');
  }
}

/**
 * `ci` signalled while a gate runs: the gate and its descendant (its process group) are ended before `ci` is, and the
 * scratch directory the earlier checks made is removed (revert: dropping the forward leaves both processes running).
 */
async function checkInterruptedGate() {
  const directory = scratch.make('gate-signals');
  const stubs = stubGates(directory);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    const { temp, env } = privateTemp(`gate-signal-temp-${signal}`);
    const folder = copyFixture('mcp', `gate-${signal}`);
    const pids = path.join(directory, `${signal}-pids.json`);
    writePlan(folder, {
      schemaVersion: planModule.PLAN_SCHEMA_VERSION,
      checks: [entry('compile', 'pr'), entry('hanging-gate', 'pr', { kind: 'gate', command: ['eval-quality-gates', 'hang', pids] })],
    });
    const run = ciChild(folder, 'pr', env({ PATH: `${stubs.bin}${path.delimiter}${process.env.PATH}` }));
    const recorded = await hangingPids(pids);
    assert.ok(alive(recorded.gate) && alive(recorded.grandchild));
    assert.equal(replaysOf(run.child.pid).length, 1, `${signal}: the compile check left no scratch directory to remove`);
    run.child.kill(signal);
    const ended = await run.exited;
    assert.equal(ended.signal, signal, `${signal}: ci ended ${JSON.stringify(ended)}`);
    assert.equal(await goneWithin([recorded.gate, recorded.grandchild]), true, `${signal}: the gate outlived ci`);
    assert.deepEqual(privateParents(run.child.pid), [], `${signal}: ci left a private parent behind`);
    assert.deepEqual(scratchNames(temp), [], `${signal}: ci left ${JSON.stringify(scratchNames(temp))} behind`);
  }
}

// ---------------------------------------------------------------------------
// The pr tier over a committed baseline

function checkEngineStageExits() {
  // `compile` and `seal` pass the engine's exit through, with its own streams, over the evaluation's contract.
  const folder = copyFixture('mcp', 'stages');
  writePlan(folder, { schemaVersion: planModule.PLAN_SCHEMA_VERSION, checks: [entry('compile', 'pr'), entry('seal', 'pr')] });
  const clean = ci(folder, 'pr');
  assert.equal(clean.status, 0, clean.output);
  const { directory } = latestCi(folder);
  for (const [stage, produced] of [
    ['compile', 'eval-contract.json'],
    ['seal', 'sealed-evaluator-brief.json'],
  ]) {
    const direct = engineDirect([
      stage,
      '--in',
      path.join(folder, 'contract.json'),
      '--out',
      path.join(path.dirname(folder), `${stage}.json`),
    ]);
    assert.equal(direct.status, 0);
    assert.equal(fs.readFileSync(path.join(directory, 'checks', stage, 'stdout'), 'utf8'), direct.stdout);
    assert.equal(fs.readFileSync(path.join(directory, 'checks', stage, 'stderr'), 'utf8'), direct.stderr);
    assert.equal(
      fs
        .readFileSync(path.join(directory, 'checks', stage, produced))
        .equals(fs.readFileSync(path.join(path.dirname(folder), `${stage}.json`))),
      true,
      `${stage}: the persisted output is not the engine's`,
    );
  }
  // A contract the engine refuses: its own exit passes through for each stage, and `check` adds its own finding.
  const broken = copyFixture('mcp', 'stages-broken');
  const contract = read(path.join(broken, 'contract.json'));
  delete contract.behaviors;
  write(path.join(broken, 'contract.json'), contract);
  writePlan(broken, { schemaVersion: planModule.PLAN_SCHEMA_VERSION, checks: [entry('compile', 'pr'), entry('seal', 'pr')] });
  const refused = ci(broken, 'pr');
  const rows = latestCi(broken).json;
  for (const stage of ['compile', 'seal']) {
    const direct = engineDirect([
      stage,
      '--in',
      path.join(broken, 'contract.json'),
      '--out',
      path.join(path.dirname(broken), `${stage}-broken.json`),
    ]);
    assert.notEqual(direct.status, 0, `the engine accepts a contract with no behaviors at ${stage}`);
    assert.equal(
      rowOf(rows, stage).exit,
      direct.status,
      `${stage}: the engine exits ${direct.status} and ci says ${rowOf(rows, stage).exit}`,
    );
    assert.equal(rowOf(rows, stage).action, 'block');
  }
  assert.equal(refused.status, planModule.mostSevere([rowOf(rows, 'compile').exit, rowOf(rows, 'seal').exit]));
  // Each documented engine exit of a stage reaches its class, through a substituted CLI.
  for (const [exit, expected] of [
    [4, 'contract authoring defect'],
    [5, 'runtime fault'],
    [64, 'wiring defect'],
  ]) {
    const substituted = copyFixture('mcp', `stage-exit-${exit}`);
    writePlan(substituted, { schemaVersion: planModule.PLAN_SCHEMA_VERSION, checks: [entry('compile', 'pr')] });
    const log = path.join(path.dirname(substituted), 'shim.log');
    const result = ci(substituted, 'pr', shimEnv(log, { TEA_EVALUATE_SHIM_EXIT_COMPILE: String(exit) }));
    assert.equal(result.status, exit, result.output);
    const row = rowOf(latestCi(substituted).json, 'compile');
    assert.deepEqual([row.exit, row.class, row.action], [exit, expected, 'block']);
  }
  // An exit the CLI does not document for the stage is a stage that could not run: infrastructure, 12.
  const undocumented = copyFixture('mcp', 'stage-exit-7');
  writePlan(undocumented, { schemaVersion: planModule.PLAN_SCHEMA_VERSION, checks: [entry('compile', 'pr')] });
  const odd = ci(undocumented, 'pr', shimEnv(path.join(path.dirname(undocumented), 'shim.log'), { TEA_EVALUATE_SHIM_EXIT_COMPILE: '7' }));
  assert.equal(odd.status, 12, odd.output);
}

/**
 * `ci --tier pr` over a project under a distinctive path leaves a run directory that names no path of this machine: the
 * project's own paths, the temporary and home directories and the private root, and any path of a Unix or macOS host, are
 * absent from every file of `runs/<invocationId>/` (the directory the `chain` job uploads). The scan finds a project path
 * planted in each file in turn, so it cannot pass over a directory that holds one.
 */
function checkCiRunHoldsNoMachinePath() {
  const folder = copyFixture('verdict', 'machine-path-canary-ci-6b3e');
  const repository = path.resolve(folder, '..', '..');
  const project = { folder, repository, directory: path.dirname(repository) };
  const result = ci(folder, 'pr');
  assert.equal(result.status, 0, result.output);
  const { directory } = latestCi(folder);
  const needles = baselines.machinePaths({ project });
  assert.ok(
    needles.some((needle) => needle.includes('machine-path-canary-ci-6b3e')),
    `the scan does not look for the project's path: ${JSON.stringify(needles)}`,
  );
  assert.deepEqual(baselines.machinePathHits(directory, needles), [], 'a file of the ci run directory names a path of this machine');
  assert.deepEqual(baselines.machinePathHits(directory), [], 'a file of the ci run directory holds a path of a Unix or macOS host');
  assert.match(
    fs.readFileSync(path.join(directory, 'checks', 'check', 'stdout'), 'utf8'),
    /^tea-evaluate check: <evaluation-folder> has no authoring defects$/m,
  );
  const planted = path.join(path.dirname(directory), 'planted-ci-run');
  fs.cpSync(directory, planted, { recursive: true });
  for (const file of baselines.filesUnder(planted)) {
    const target = path.join(planted, file);
    const original = fs.readFileSync(target);
    fs.appendFileSync(target, repository);
    assert.deepEqual(
      baselines.machinePathHits(planted, needles).map((hit) => hit.file),
      [file],
      `${file}: a planted project path is not found`,
    );
    fs.writeFileSync(target, original);
  }
}

/**
 * `textNeutralizer` over strings and Buffers: the evaluation folder, the private root, the temporary directory and the home
 * directory become their forms where a path stands alone, and a path that only ends or starts like one is left as it is
 * (`/var/tmp/x` and `build/tmp/x` under a temporary directory of `/tmp`, a sibling folder of the evaluation folder). A Buffer
 * keeps every byte outside a substituted path, UTF-8 or not.
 */
function checkTextNeutralizer() {
  const saved = process.env.TMPDIR;
  process.env.TMPDIR = '/tmp';
  try {
    const folder = path.join(path.parse(process.cwd()).root, 'Users', 'ci', 'work', 'evals', 'grader');
    const neutral = textNeutralizer({ folder });
    const cases = [
      ['/var/tmp/eval', '/var/tmp/eval'],
      ['build/tmp/out.json', 'build/tmp/out.json'],
      ['/tmpfoo/x', '/tmpfoo/x'],
      [`${folder}-other/x`, `${folder}-other/x`],
      [`${folder}/runs/1`, '<evaluation-folder>/runs/1'],
      ['file:///tmp/port.mjs:24', 'file://<tmp>/port.mjs:24'],
      [
        'at run (/tmp/a/b.js:1:2) and "/tmp/c" and path=/tmp/d and /tmp.bak',
        'at run (<tmp>/a/b.js:1:2) and "<tmp>/c" and path=<tmp>/d and /tmp.bak',
      ],
      [`open '${folder}/policy/p.json'`, "open '<evaluation-folder>/policy/p.json'"],
    ];
    for (const [input, expected] of cases) assert.equal(neutral(input), expected, `neutralizing ${JSON.stringify(input)}`);
    const bytes = Buffer.concat([
      Buffer.from('caf\u00E9 '),
      Buffer.from([0xff, 0xfe, 0x00]),
      Buffer.from(` at file:///tmp/port.mjs:24 ${folder}/x\n`),
    ]);
    const recorded = neutral(bytes);
    assert.ok(Buffer.isBuffer(recorded));
    assert.deepEqual(
      recorded,
      Buffer.concat([
        Buffer.from('caf\u00E9 '),
        Buffer.from([0xff, 0xfe, 0x00]),
        Buffer.from(' at file://<tmp>/port.mjs:24 <evaluation-folder>/x\n'),
      ]),
    );
    assert.equal(neutral(7), 7);
  } finally {
    if (saved === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = saved;
  }
}

/**
 * A failing HTTP port conformance (the adopter's file throws, so its stack names the file) and a stale baseline whose reason
 * names a file under the evaluation folder leave run directories with no path of this machine: the check's streams are Buffers
 * of the child's output, and the tier records the stale reasons in `ci.json` and in its one warning.
 */
function checkCiRunHoldsNoMachinePathOnFailure() {
  const api = copyFixture('api', 'machine-path-canary-api-3e0d');
  fs.writeFileSync(path.join(api, 'adapter', 'http-probe-port.conformance.mjs'), "throw new Error('the port answers wrongly');\n");
  const failed = ci(api, 'pr');
  assert.notEqual(failed.status, 0, failed.output);
  const conformance = latestCi(api).directory;
  assert.match(fs.readFileSync(path.join(conformance, 'checks', 'api-conformance', 'stderr'), 'utf8'), /http-probe-port\.conformance\.mjs/);
  assert.deepEqual(
    baselines.machinePathHits(conformance),
    [],
    'a failing conformance port left a path of this machine in the ci run directory',
  );
  assert.deepEqual(
    baselines.machinePathHits(
      conformance,
      baselines.machinePaths({
        project: { folder: api, repository: path.resolve(api, '..', '..'), directory: path.dirname(path.resolve(api, '..', '..')) },
      }),
    ),
    [],
  );

  const stale = copyFixture('verdict', 'machine-path-canary-stale-8a15');
  fs.renameSync(path.join(stale, 'policy', 'scoring-policy.json'), path.join(path.dirname(stale), 'moved-policy.json'));
  ci(stale, 'pr');
  const { directory, json } = latestCi(stale);
  assert.equal(json.baseline.stale, true);
  assert.deepEqual(json.baseline.reasons, [
    "the scoring policy cannot be read (ENOENT: no such file or directory, open '<evaluation-folder>/policy/scoring-policy.json')",
  ]);
  const staleWarnings = json.warnings.filter((line) => line.startsWith('the baseline is stale'));
  assert.equal(
    staleWarnings.length,
    1,
    `the tier warns ${staleWarnings.length} times about the stale baseline: ${JSON.stringify(json.warnings)}`,
  );
  assert.ok(staleWarnings[0].includes('<evaluation-folder>/policy/scoring-policy.json'));
  assert.deepEqual(baselines.machinePathHits(directory), [], 'a stale baseline left a path of this machine in the ci run directory');
}

function checkPrReplay() {
  const folder = copyFixture('verdict', 'pr');
  const baselineBefore = treeDigest(path.join(folder, 'baseline'));
  const plan = planOf(folder);
  const prIds = plan.checks.filter((item) => item.placement.tier === 'pr').map((item) => item.id);

  // A clean baseline: every pr check runs, in plan order, and exactly those (a hard-coded list would diverge from a plan that omits one).
  const log = path.join(path.dirname(folder), 'shim.log');
  const clean = ci(folder, 'pr');
  assert.equal(clean.status, 0, clean.output);
  const { directory, json } = latestCi(folder);
  assert.deepEqual(
    json.checks.map((row) => row.id),
    prIds,
  );
  assert.equal(json.tier, 'pr');
  assert.equal(json.exit, 0);
  for (const row of json.checks) {
    assert.equal(fs.readFileSync(path.join(directory, 'checks', row.id, 'exit-code'), 'utf8').trim(), String(row.exit));
    assert.ok(
      fs.existsSync(path.join(directory, 'checks', row.id, 'stdout')) && fs.existsSync(path.join(directory, 'checks', row.id, 'stderr')),
    );
    assert.deepEqual(
      row.evidence,
      plan.checks.find((item) => item.id === row.id && item.placement.tier === 'pr').evidence,
      `${row.id}: the row does not carry the plan's evidence paths`,
    );
  }
  // CONCERNS is read from the evidence artifact: a warn row and a warning line, exit 0.
  const replay = rowOf(json, 'replay');
  assert.deepEqual([replay.exit, replay.class, replay.action], [0, 'pass', 'warn']);
  assert.ok(replay.warnings.length > 0 && replay.warnings.every((line) => /CONCERNS/.test(line)));
  assert.match(clean.stdout, /warning: replay P-00\d: eval-quality records CONCERNS/);
  assert.equal(
    read(path.join(scoreDirectory(folder), 'P-002', 'evidence-artifact.json')).contractVerdict,
    'CONCERNS',
    'the fixture baseline records no CONCERNS, so this case would read none',
  );
  for (const row of json.checks.filter((candidate) => candidate.id !== 'replay')) assert.equal(row.action, 'pass', row.id);

  // The replay reproduces the committed evidence byte for byte, into a fresh runs/<invocationId>/replay/, and the
  // committed baseline is not touched.
  const baselineScores = scoreDirectory(folder);
  const compared = ['P-001/evidence-artifact.json', 'P-002/evidence-artifact.json', 'strength-aggregate.json', 'strength-floors.json'];
  for (const name of compared) {
    assert.equal(
      fs.readFileSync(path.join(directory, 'replay', 'scores', name)).equals(fs.readFileSync(path.join(baselineScores, name))),
      true,
      `the replay did not reproduce ${name}`,
    );
  }
  assert.equal(
    fs
      .readFileSync(path.join(directory, 'replay', 'preflight-verdict.json'))
      .equals(fs.readFileSync(path.join(folder, 'baseline', 'preflight-verdict.json'), null)),
    true,
    'the replay did not reproduce the preflight verdict',
  );
  assert.deepEqual(treeDigest(path.join(folder, 'baseline')), baselineBefore, 'ci wrote under baseline/');
  // The call records of score hold neutral path forms (`recorded-paths.js`), so the replay writes the baseline's bytes again and the
  // comparison covers them; the invocation's own summary names this replay's invocation id and is the one file left out.
  for (const name of ['P-001/score.json', 'P-002/score.json', 'aggregate-strength.json']) {
    assert.equal(
      fs.readFileSync(path.join(directory, 'replay', 'scores', name)).equals(fs.readFileSync(path.join(baselineScores, name))),
      true,
      `the replay did not reproduce the call record ${name}`,
    );
  }
  assert.equal(
    fs
      .readFileSync(path.join(directory, 'replay', 'scores', 'score.json'))
      .equals(fs.readFileSync(path.join(baselineScores, 'score.json'))),
    false,
    'the invocation summary is deterministic after all',
  );

  // The same replay through the logging shim, which runs the real CLI beneath. The call records say the engine was substituted
  // (`substituted` and the executable differ from the baseline's), so those three files are the only drift, and the evidence is the
  // baseline's byte for byte.
  const shimmed = ci(copyFixture('verdict', 'pr-shim'), 'pr', shimEnv(log, { TEA_EVALUATE_SHIM_RUN_REAL: '1' }));
  assert.equal(shimmed.status, 13, shimmed.output);
  assert.deepEqual([...shimmed.stdout.matchAll(/replay: \[drift\] (\S+): the replay produced/g)].map((match) => match[1]).sort(), [
    'scores/P-001/score.json',
    'scores/P-002/score.json',
    'scores/aggregate-strength.json',
  ]);

  // The stage exits are the engine's: the direct CLI over the same inputs exits as the replay says, and the replay
  // re-ran preflight and score through the engine (the shim log) with no --strict anywhere.
  const stages = shimLog(log);
  const named = (stage) => stages.filter((argv) => argv[0] === stage);
  assert.ok(
    named('preflight').length === 1 && named('score').length === 2 && named('aggregate-strength').length === 1,
    `the replay's engine calls: ${JSON.stringify(stages.map((argv) => argv[0]))}`,
  );
  assert.ok(named('compile').length >= 2 && named('seal').length === 1);
  assert.equal(
    stages.some((argv) => argv.includes('--strict')),
    false,
    'a call passed --strict',
  );
  assert.equal(named('preflight')[0][named('preflight')[0].indexOf('--run-id') + 1], acceptedRun(folder));
  const direct = engineDirect([
    'preflight',
    '--contract',
    path.join(folder, 'baseline', 'contract.json'),
    '--probes',
    path.join(folder, 'baseline', 'probes.json'),
    '--observations',
    path.join(folder, 'baseline', 'observations.json'),
    '--run-id',
    acceptedRun(folder),
    '--out',
    path.join(path.dirname(folder), 'direct-verdict.json'),
  ]);
  const placed = copyFixture('verdict', 'pr-direct');
  baselines.placeBaseline(placed, acceptedRun(placed));
  const scored = cli(placed, 'score', ['--run', acceptedRun(placed)]);
  assert.match(
    fs.readFileSync(path.join(directory, 'checks', 'replay', 'stdout'), 'utf8'),
    new RegExp(`eval-quality preflight exited ${direct.status}, score exited ${scored.status};`),
  );

  // One byte of the committed evidence flipped (a digit of the scoring version): the produced evidence differs, exit 13
  // (revert: a replay that compares a file with itself passes it).
  {
    const mutated = copyFixture('verdict', 'pr-evidence');
    const file = path.join(scoreDirectory(mutated), 'P-001', 'evidence-artifact.json');
    const text = fs.readFileSync(file, 'utf8');
    const flipped = text.replace(/("scoringVersion":\s*"sha256:)(.)/, (_, head, digit) => `${head}${digit === '0' ? '1' : '0'}`);
    assert.notEqual(flipped, text);
    fs.writeFileSync(file, flipped);
    const result = ci(mutated, 'pr');
    assert.equal(result.status, 13, result.output);
    const row = rowOf(latestCi(mutated).json, 'replay');
    assert.deepEqual([row.exit, row.class, row.action], [13, 'evaluation evidence drift', 'block']);
    assert.match(result.stdout, /replay: \[drift\] scores\/P-001\/evidence-artifact\.json: the replay produced sha256:/);
    // `check` reads the same edit as a `baseline-digest` finding (Story 1.90): the baseline's bytes are no longer the ones its
    // manifest lists. The replay's drift is the other check that sees it.
    assert.equal(rowOf(latestCi(mutated).json, 'check').exit, 10, 'check after one flipped evidence byte');
    assert.match(result.stdout, /check: exit 10 \(authoring defect\), block\n\s+baseline\/[^\n]*\[baseline-digest\]/);
    for (const other of latestCi(mutated).json.checks.filter((candidate) => !['replay', 'check'].includes(candidate.id)))
      assert.equal(other.exit, 0, `${other.id} after one flipped evidence byte`);
    // A missing baseline file and an extra one are drift as well.
    const missing = copyFixture('verdict', 'pr-missing');
    fs.rmSync(path.join(scoreDirectory(missing), 'P-002', 'evidence-artifact.json'));
    const absent = ci(missing, 'pr');
    assert.equal(rowOf(latestCi(missing).json, 'replay').exit, 13, absent.output);
    assert.match(absent.stdout, /the baseline does not hold|the replay produced a file the baseline does not hold/);
    const extra = copyFixture('verdict', 'pr-extra');
    fs.writeFileSync(path.join(scoreDirectory(extra), 'P-001', 'extra.json'), '{}\n');
    const added = ci(extra, 'pr');
    assert.equal(rowOf(latestCi(extra).json, 'replay').exit, 13, added.output);
    assert.match(added.stdout, /P-001\/extra\.json: the replay produced no such file/);
  }

  // The clean-control leg's exitCode changed in one baseline observation: preflight and score are both invoked (the shim
  // log), and eval-quality's own exit passes through. The control leg is what the verdict's clean-control check reads, so
  // the engine fails it (exit 3, infrastructure or integrity) and that exit is the check's.
  {
    const mutated = copyFixture('verdict', 'pr-control');
    const file = path.join(mutated, 'baseline', 'observations.json');
    const observations = read(file);
    observations.find((item) => item.probeId === 'preflight-control-observe').exitCode = 1;
    write(file, observations);
    const shim = path.join(path.dirname(mutated), 'shim.log');
    const result = ci(mutated, 'pr', shimEnv(shim, { TEA_EVALUATE_SHIM_RUN_REAL: '1' }));
    assert.equal(result.status, 3, result.output);
    const row = rowOf(latestCi(mutated).json, 'replay');
    assert.deepEqual([row.exit, row.class], [3, 'infrastructure or integrity']);
    assert.ok(shimLog(shim).some((argv) => argv[0] === 'preflight') && shimLog(shim).some((argv) => argv[0] === 'score'));
  }
  // An observation edit that leaves the engine at its recorded exits (a witness leg's exitCode) moves the verdict's
  // fixtureDigest: both exits are 0 as recorded and the bytes differ, exit 13 (revert: copying the baseline evidence
  // forward without re-scoring exits 0 and leaves the shim log empty).
  {
    const mutated = copyFixture('verdict', 'pr-observation');
    const file = path.join(mutated, 'baseline', 'observations.json');
    const observations = read(file);
    observations.find((item) => item.probeId === 'witness-alpha').exitCode = 1;
    write(file, observations);
    const shim = path.join(path.dirname(mutated), 'shim.log');
    const result = ci(mutated, 'pr', shimEnv(shim, { TEA_EVALUATE_SHIM_RUN_REAL: '1' }));
    assert.equal(result.status, 13, result.output);
    assert.match(result.stdout, /eval-quality preflight exited 0, score exited 0;/);
    assert.match(result.stdout, /replay: \[drift\] preflight-verdict\.json:/);
    const calls = shimLog(shim).map((argv) => argv[0]);
    assert.ok(calls.includes('preflight') && calls.includes('score'), `the replay did not re-run the engine: ${JSON.stringify(calls)}`);
  }
}

/** The baseline's manifest, rewritten by `edit`, in `folder`. */
function editManifest(folder, edit) {
  const file = path.join(folder, 'baseline', 'baseline.json');
  const manifest = read(file);
  edit(manifest);
  write(file, manifest);
}

function checkBaselineIntegrity() {
  const prRows = (folder, ids) => {
    const rows = latestCi(folder).json;
    return ids.map((id) => [id, rowOf(rows, id).exit]);
  };
  // `baseline/scores/` holds the accepted score invocation alone (AD-12): a planted second subtree is refused before the
  // replay runs (revert: dropping the layout rule lets the replay run over the planted subtree). The replay's own pick of
  // the produced subtree (the one new `scores/` entry) is a second line of defence the layout rule makes unreachable from
  // a case: with `scores/` held to one entry, choosing the last entry that is not the manifest's picks the same subtree.
  {
    const folder = copyFixture('verdict', 'planted-scores');
    const accepted = scoreDirectory(folder);
    const planted = path.join(path.dirname(accepted), '29990101T000000000Z-ffffffff');
    fs.cpSync(accepted, planted, { recursive: true });
    const result = ci(folder, 'pr');
    assert.equal(result.status, 10, result.output);
    assert.deepEqual(prRows(folder, ['replay', 'oracle-agreement', 'gameability']), [
      ['replay', 10],
      ['oracle-agreement', 10],
      ['gameability', 10],
    ]);
    assert.match(
      result.stdout,
      /baseline\/scores: \[baseline-file\] holds "[^"]+", "29990101T000000000Z-ffffffff"; the baseline keeps the accepted score invocation/,
    );
    // An empty `scores/` and a `scores/<id>` that is a file are refused too.
    const empty = copyFixture('verdict', 'empty-scores');
    fs.rmSync(scoreDirectory(empty), { recursive: true });
    const hollow = ci(empty, 'pr');
    assert.equal(hollow.status, 10, hollow.output);
    assert.match(hollow.stdout, /baseline\/scores: \[baseline-file\] holds nothing/);
    const file = copyFixture('verdict', 'file-score');
    const directory = scoreDirectory(file);
    fs.rmSync(directory, { recursive: true });
    fs.writeFileSync(directory, 'not a directory\n');
    const flat = ci(file, 'pr');
    assert.equal(flat.status, 10, flat.output);
    assert.match(flat.stdout, /baseline\/scores: \[baseline-file\] .* is not a real directory/);
  }

  // The manifest's ids are path segments: one that is not an invocation id is a schema finding, and nothing is written
  // outside the scratch directory, or anywhere else (revert: deleting the id pattern from the baseline schema reaches the
  // scratch placement with `../../../escape`, which exits 12 here and writes beside the temporary directory without the guard).
  for (const [label, edit, field] of [
    ['an acceptedRun that climbs out of runs/', (manifest) => (manifest.acceptedRun = '../../../escape'), 'acceptedRun'],
    ['a scoreInvocationId that climbs out of scores/', (manifest) => (manifest.scoreInvocationId = '../../x'), 'scoreInvocationId'],
    ['an acceptedRun that is not an invocation id', (manifest) => (manifest.acceptedRun = 'latest'), 'acceptedRun'],
    ['an absolute scoreInvocationId', (manifest) => (manifest.scoreInvocationId = '/etc'), 'scoreInvocationId'],
  ]) {
    const { temp, env } = privateTemp('traversal-temp');
    const folder = copyFixture('verdict', 'traversal');
    editManifest(folder, edit);
    const root = path.resolve(folder, '..', '..');
    const outsideRuns = (line) => !line.startsWith(`${path.relative(root, folder)}${path.sep}runs${path.sep}`);
    const before = treeDigest(root).filter(outsideRuns);
    const result = ci(folder, 'pr', env());
    assert.equal(result.status, 10, `${label}: ${result.output}`);
    assert.deepEqual(
      prRows(folder, ['replay', 'oracle-agreement']),
      [
        ['replay', 10],
        ['oracle-agreement', 10],
      ],
      label,
    );
    assert.match(result.stdout, new RegExp(`baseline/baseline\\.json: \\[schema\\] /${field} must match pattern`), label);
    assert.deepEqual(fs.readdirSync(temp), [], `${label}: ci left something in the temporary directory`);
    assert.deepEqual(treeDigest(root).filter(outsideRuns), before, `${label}: ci wrote outside its run directory`);
  }
  // A manifest with its score invocation deleted is a schema finding of replay and of oracle agreement.
  {
    const folder = copyFixture('verdict', 'no-score-id');
    editManifest(folder, (manifest) => delete manifest.scoreInvocationId);
    const result = ci(folder, 'pr');
    assert.equal(result.status, 10, result.output);
    assert.deepEqual(prRows(folder, ['replay', 'oracle-agreement']), [
      ['replay', 10],
      ['oracle-agreement', 10],
    ]);
    assert.match(result.stdout, /baseline\/baseline\.json: \[schema\] \/ must have required property 'scoreInvocationId'/);
  }
  // Every path the replay builds from an id stays under the directory it is built in.
  assert.equal(confine('/a/b', 'x', 'y'), path.resolve('/a/b/x/y'));
  assert.equal(confine('/a/b'), path.resolve('/a/b'));
  for (const segments of [['..', 'c'], ['x', '..', '..', 'c'], ['/c'], ['../b2']]) {
    assert.throws(() => confine('/a/b', ...segments), /is outside/, JSON.stringify(segments));
  }
}

/** The floors edited after the baseline was accepted are a stale baseline, and the replay scores under the baseline's own. */
function checkBaselineFloors() {
  const folder = copyFixture('verdict', 'floors-edited');
  const file = path.join(folder, 'evaluation.json');
  const evaluation = read(file);
  evaluation.strengthFloor.defect = 0.5;
  write(file, evaluation);
  const result = ci(folder, 'pr');
  assert.equal(result.status, 0, result.output);
  const { directory, json } = latestCi(folder);
  const row = rowOf(json, 'replay');
  assert.deepEqual([row.exit, row.action], [0, 'warn']);
  assert.ok(
    row.warnings.some((line) =>
      /the baseline is stale \(the strength floors are \{"defect":0\.5\}, the baseline's \{"defect":1\}\)/.test(line),
    ),
    JSON.stringify(row.warnings),
  );
  // The replay scored under the baseline's floors, so the floors file it produced is the baseline's.
  assert.equal(
    fs
      .readFileSync(path.join(directory, 'replay', 'scores', 'strength-floors.json'))
      .equals(fs.readFileSync(path.join(scoreDirectory(folder), 'strength-floors.json'))),
    true,
  );
  assert.equal(json.baseline.stale, true);
  assert.match(json.baseline.reasons.join('\n'), /the strength floors are/);
}

/** One byte of `file` changed: the middle one's low bit. */
function flipByte(file) {
  const bytes = fs.readFileSync(file);
  bytes[Math.floor(bytes.length / 2)] ^= 1;
  fs.writeFileSync(file, bytes);
}

function checkReplayComparisonSet() {
  // The comparison set is eight files over the verdict fixture: the preflight verdict, two evidence artifacts, the strength
  // aggregate and its floors, and the three call records (each probe's `score.json` and `aggregate-strength.json`), which hold
  // neutral path forms. A clean replay reads all eight.
  const clean = copyFixture('verdict', 'comparison-set');
  const ok = ci(clean, 'pr');
  assert.equal(ok.status, 0, ok.output);
  assert.match(
    fs.readFileSync(path.join(latestCi(clean).directory, 'checks', 'replay', 'stdout'), 'utf8'),
    /8 baseline file\(s\) compared, 0 difference\(s\)/,
  );
  // One byte of the baseline's strength aggregate, one byte of its floors (a space become a tab: the floors still
  // parse, so the replay scores under them, and the file score writes from them differs from the baseline's bytes), and one byte
  // of each probe's call record and of the aggregate's: each is drift, named (revert: leaving any of these files out of the
  // comparison passes its case, so the case fails).
  for (const [name, edit] of [
    ['strength-aggregate.json', (file) => flipByte(file)],
    ['P-001/score.json', (file) => flipByte(file)],
    ['P-002/score.json', (file) => flipByte(file)],
    ['aggregate-strength.json', (file) => flipByte(file)],
    ['strength-floors.json', (file) => fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(': ', ':\t'))],
  ]) {
    const folder = copyFixture('verdict', `comparison-${name.replaceAll('/', '-')}`);
    const file = path.join(scoreDirectory(folder), name);
    const before = fs.readFileSync(file);
    edit(file);
    assert.equal(fs.readFileSync(file).equals(before), false, `${name} was not edited`);
    const result = ci(folder, 'pr');
    assert.equal(result.status, 13, `${name}: ${result.output}`);
    assert.match(result.stdout, new RegExp(`replay: \\[drift\\] scores/${name.replace('.', String.raw`\.`)}: the replay produced sha256:`));
    assert.deepEqual(
      [rowOf(latestCi(folder).json, 'replay').exit, rowOf(latestCi(folder).json, 'replay').class],
      [13, 'evaluation evidence drift'],
    );
  }
}

/**
 * A baseline accepted from a run whose score exits 2 (P-003 missed, a FAIL `compare --accept` admits): the replay
 * reproduces it and passes the 2 through, and a baseline byte that differs makes the same replay exit 13, which applies
 * over an exit of 2 as well as over 0 (revert: applying 13 over exit 0 alone leaves the drifted row at 2). The project
 * is built at test time: the committed fixtures hold no baseline of a failing run.
 */
function checkReplayStageExit() {
  const project = liveProject('fail-baseline', {
    accept: false,
    edit: (context) => addGateProbes(context, [2]),
    plan: [entry('replay', 'pr')],
  });
  const failing = { ...project.env, VERDICT_WHEN: 'trial-mutated-M-002-1', VERDICT_DO: 'accept' };
  const ran = cli(project.folder, 'run', [], failing);
  assert.equal(ran.status, 0, ran.output);
  const runId = path.basename(live.latest(project.folder));
  const scored = cli(project.folder, 'score', ['--run', runId], failing);
  assert.equal(scored.status, 2, scored.output);
  const accepted = cli(project.folder, 'compare', ['--accept'], failing);
  assert.equal(accepted.status, 0, accepted.output);
  baselines.commitAll(project.repository, 'accept the baseline of a failing run');
  const reproduced = ci(project.folder, 'pr', project.env);
  assert.equal(reproduced.status, 2, reproduced.output);
  assert.deepEqual(
    [rowOf(latestCi(project.folder).json, 'replay').exit, rowOf(latestCi(project.folder).json, 'replay').class],
    [2, 'target behavior failure'],
  );
  assert.match(reproduced.stdout, /eval-quality preflight exited 0, score exited 2; \d+ baseline file\(s\) compared, 0 difference\(s\)/);
  flipByte(path.join(scoreDirectory(project.folder), 'P-003', 'evidence-artifact.json'));
  const drifted = ci(project.folder, 'pr', project.env);
  assert.equal(drifted.status, 13, drifted.output);
  const row = rowOf(latestCi(project.folder).json, 'replay');
  assert.deepEqual([row.exit, row.class, row.action], [13, 'evaluation evidence drift', 'block']);
  assert.match(drifted.stdout, /eval-quality preflight exited 0, score exited 2;/);
  assert.match(drifted.stdout, /replay: \[drift\] scores\/P-003\/evidence-artifact\.json:/);
}

function checkContractDigestOnPr() {
  // A behavior reworded in contract.json with sourceSpecDigest untouched: the requirements still match, so `check` passes,
  // and the baseline is stale by its contract digest: a warning on pr (revert: dropping the contract arm of the rule passes silently).
  const folder = copyFixture('verdict', 'contract-stale');
  const file = path.join(folder, 'contract.json');
  const contract = read(file);
  contract.behaviors[0].description += ' (reworded)';
  write(file, contract);
  const result = ci(folder, 'pr');
  assert.equal(result.status, 0, result.output);
  const row = rowOf(latestCi(folder).json, 'replay');
  assert.deepEqual([row.exit, row.action], [0, 'warn']);
  assert.ok(
    row.warnings.some((line) =>
      /the baseline is stale \(the contract digest is sha256:[0-9a-f]{64}, the baseline's sha256:[0-9a-f]{64}\)/.test(line),
    ),
    JSON.stringify(row.warnings),
  );
  assert.equal(rowOf(latestCi(folder).json, 'check').exit, 0);
}

function checkBadCommittedInput() {
  const noStack = (text, label) => assert.doesNotMatch(text, /\n\s+at .*\(.*:\d+:\d+\)/, `${label}: a stack trace reached the output`);
  // A baseline probe that is not JSON: an authoring finding of the gameability check.
  const probes = copyFixture('verdict', 'bad-baseline-probe');
  writePlan(probes, { schemaVersion: planModule.PLAN_SCHEMA_VERSION, checks: [entry('gameability', 'pr')] });
  fs.writeFileSync(path.join(probes, 'baseline', 'probes', 'P-002.probe.json'), '{ not json');
  const broken = ci(probes, 'pr');
  assert.equal(broken.status, 10, broken.output);
  assert.match(broken.stdout, /baseline\/probes\/P-002\.probe\.json: \[baseline-file\] cannot be read as a regular JSON file/);
  noStack(broken.output, 'a baseline probe that is not JSON');
  noStack(fs.readFileSync(path.join(latestCi(probes).directory, 'checks', 'gameability', 'stderr'), 'utf8'), 'its persisted stderr');
  // A contract that is not JSON under judge calibration.
  const contract = copyFixture('verdict', 'bad-contract');
  writePlan(contract, {
    schemaVersion: planModule.PLAN_SCHEMA_VERSION,
    checks: [entry('judge-calibration', 'scheduled', { reason: 'AD-10 default' })],
  });
  fs.writeFileSync(path.join(contract, 'contract.json'), '{ not json');
  const garbled = ci(contract, 'scheduled');
  assert.equal(garbled.status, 10, garbled.output);
  assert.match(garbled.stdout, /contract\.json: \[json\] cannot be read as JSON/);
  noStack(garbled.output, 'a contract that is not JSON');
  noStack(
    fs.readFileSync(path.join(latestCi(contract).directory, 'checks', 'judge-calibration', 'stderr'), 'utf8'),
    'its persisted stderr',
  );
}

function checkStaleBaselineOnPr() {
  const folder = copyFixture('verdict', 'stale');
  const policy = path.join(folder, 'policy', 'scoring-policy.json');
  const edited = read(policy);
  edited.regexMatchStepBudget += 1;
  write(policy, edited);
  const result = ci(folder, 'pr');
  assert.equal(result.status, 0, result.output);
  const row = rowOf(latestCi(folder).json, 'replay');
  assert.deepEqual([row.exit, row.action], [0, 'warn']);
  assert.ok(
    row.warnings.some((line) => /the baseline is stale \(the policy digest is sha256:/.test(line)),
    JSON.stringify(row.warnings),
  );
  assert.match(result.stdout, /warning: the baseline is stale/);
  // Every check that reads the baseline says so; the replay itself ran against the baseline's own snapshot.
  for (const id of ['gameability', 'oracle-agreement']) assert.equal(rowOf(latestCi(folder).json, id).action, 'warn', id);
  // A changed corpus is stale too.
  const corpus = copyFixture('verdict', 'stale-corpus');
  const probe = path.join(corpus, 'probes', 'P-001.probe.json');
  const changed = read(probe);
  changed.rationale += ' Edited.';
  write(probe, changed);
  cli(corpus, 'digest');
  const second = ci(corpus, 'pr');
  assert.equal(second.status, 0, second.output);
  assert.ok(rowOf(latestCi(corpus).json, 'replay').warnings.some((line) => /the corpus digest is/.test(line)));
}

async function checkInterruptedReplay() {
  const { temp, env } = privateTemp('interrupt-temp');
  const wrapper = killShim('kill-shim');
  const mark = path.join(temp, 'mark');
  const folder = copyFixture('verdict', 'interrupt');
  writePlan(folder, { schemaVersion: planModule.PLAN_SCHEMA_VERSION, checks: [entry('replay', 'pr')] });

  // The engine stage is killed mid-replay, at the score stage and at the preflight stage: exit 12 on the kill path, and
  // nothing is left in the temporary directory (revert: a scratch directory kept past the run leaves it behind).
  for (const stage of ['score', 'preflight']) {
    fs.rmSync(mark, { force: true });
    const before = new Set(privateNames());
    const killed = ci(folder, 'pr', env({ TEA_EVALUATE_ENGINE_CLI: wrapper, KILL_AT: stage, KILL_MARK: mark }));
    assert.equal(killed.status, 12, `${stage}: ${killed.output}`);
    assert.ok(fs.existsSync(mark), `the ${stage} stage was not reached`);
    assert.deepEqual(scratchNames(temp), [], `a killed ${stage} stage left a scratch directory behind`);
    assert.deepEqual(strayParents(before), [], `a killed ${stage} stage left a private parent behind`);
    const row = rowOf(latestCi(folder).json, 'replay');
    assert.deepEqual([row.exit, row.class], [12, 'infrastructure'], stage);
    assert.match(fs.readFileSync(path.join(latestCi(folder).directory, 'checks', 'replay', 'stderr'), 'utf8'), /killed by SIGKILL/);
  }

  // `ci` is signalled mid-replay while the score stage hangs (the stage is killed after the signal, since a signal waits
  // for the synchronous call): the scratch directory is gone with everything the score staged in it. Until then the
  // staging directories of the replay's score sit inside the scratch directory.
  for (const signal of ['SIGINT', 'SIGTERM']) {
    fs.rmSync(mark, { force: true });
    const run = ciChild(
      folder,
      'pr',
      env({ TEA_EVALUATE_ENGINE_CLI: wrapper, KILL_AT: 'score', KILL_HOW: 'hang', KILL_ONCE: '1', KILL_MARK: mark }),
    );
    assert.ok(await appears(mark), `${signal}: the replay did not reach the score stage`);
    const pid = run.child.pid;
    // One private parent holds the scratch directory: the replay's score makes none of its own.
    assert.equal(privateParents(pid).length, 1, `${signal}: ${JSON.stringify(privateParents(pid))}`);
    assert.equal(replaysOf(pid).length, 1, `${signal}: ${JSON.stringify(privateNames())}`);
    assert.deepEqual(scratchNames(temp), [], `${signal}: the replay made a directory in the temporary directory`);
    assert.equal(
      fs.readdirSync(path.join(replaysOf(pid)[0], 'score-staging')).some((name) => name.startsWith('tea-evaluate-score-')),
      true,
      `${signal}: the replay's score staging is not inside the scratch directory`,
    );
    run.child.kill(signal);
    process.kill(Number(fs.readFileSync(mark, 'utf8')), 'SIGKILL');
    await run.exited;
    assert.deepEqual(privateParents(pid), [], `${signal} left ${JSON.stringify(privateParents(pid))} under ${PRIVATE_ROOT}`);
    assert.deepEqual(scratchNames(temp), [], `${signal} left ${JSON.stringify(scratchNames(temp))} behind`);
  }

  // `ci` itself is killed mid-replay (SIGKILL: no cleanup runs): the scratch directory is left on the pipeline's list,
  // staging included, and the next ci run over the same folder removes all of it.
  fs.rmSync(mark, { force: true });
  const killedRun = ciChild(folder, 'pr', env({ TEA_EVALUATE_ENGINE_CLI: wrapper, KILL_AT: 'score', KILL_HOW: 'hang', KILL_MARK: mark }));
  // The parent this ci makes is held before it exists: the reaper of a suite running at the same time removes the parent of
  // every dead process, which this ci is about to become, before the next ci run gets to it.
  holdPrivateParents(killedRun.child.pid);
  try {
    assert.ok(await appears(mark), 'the replay did not reach the engine stage');
    // ci first, so no cleanup runs, then the stage it was waiting on.
    killedRun.child.kill('SIGKILL');
    await killedRun.exited;
    process.kill(Number(fs.readFileSync(mark, 'utf8')), 'SIGKILL');
    const killedPid = killedRun.child.pid;
    assert.equal(replaysOf(killedPid).length, 1, `a killed ci left ${JSON.stringify(privateNames())}`);
    const [replay] = replaysOf(killedPid);
    const owner = read(path.join(replay, '.tea-evaluate-ci-owner.json'));
    assert.equal(owner.folder, fs.realpathSync.native(folder));
    assert.equal(owner.pid, killedPid);
    assert.ok(fs.readdirSync(path.join(replay, 'score-staging')).length > 0, 'the staging is not inside the scratch directory');
    const dead = spawnSync(process.execPath, ['-e', ''], { encoding: 'utf8' });
    holdPrivateParents(dead.pid);
    // A parent whose owner is another folder's, and one whose owner is alive, are not this ci's to remove.
    const planted = [];
    const plant = (parentName, name, value) => {
      const parent = path.join(PRIVATE_ROOT, parentName);
      fs.mkdirSync(path.join(parent, name), { recursive: true });
      fs.writeFileSync(path.join(parent, name, '.tea-evaluate-ci-owner.json'), `${JSON.stringify(value)}\n`);
      planted.push(parent);
      return parentName;
    };
    try {
      const live = plant(`run-${process.pid}-liveown`, 'tea-evaluate-replay-live-owner', {
        pid: process.pid,
        folder: fs.realpathSync.native(folder),
      });
      const other = plant(`run-${dead.pid}-otherfol`, 'tea-evaluate-replay-other-folder', {
        pid: dead.pid,
        folder: path.join(temp, 'some-other-evaluation'),
      });
      const again = ci(folder, 'pr', env());
      assert.equal(again.status, 0, again.output);
      assert.match(again.stderr, /removed the replay scratch directory/);
      assert.deepEqual(privateParents(killedPid), [], "the next ci run did not remove the dead owner's scratch directory of this folder");
      for (const name of [live, other]) assert.ok(privateNames().includes(name), `the next ci run removed ${name}`);
      assert.deepEqual(scratchNames(temp), [], 'the next ci run left a scratch directory in the temporary directory');
    } finally {
      for (const parent of planted) fs.rmSync(parent, { recursive: true, force: true });
    }
  } finally {
    // A case that fails before the second ci run leaves the killed ci's parent, which its hold keeps from every reaper.
    for (const name of privateParents(killedRun.child.pid)) fs.rmSync(path.join(PRIVATE_ROOT, name), { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Oracle agreement and the gameability arm

/** The baseline of `folder` placed in a scratch copy of it, with `edit` applied to the placed run directory, scored through the CLI; the produced score subtree. */
function rescored(folder, edit) {
  const copy = copyFixture('verdict', 'rescore');
  const accepted = acceptedRun(copy);
  const runDirectory = baselines.placeBaseline(copy, accepted);
  edit(runDirectory);
  const result = cli(copy, 'score', ['--run', accepted]);
  assert.equal(result.status, 0, result.output);
  const scores = fs.readdirSync(path.join(runDirectory, 'scores')).sort();
  return path.join(runDirectory, 'scores', scores.at(-1));
}

function checkOracleAgreement() {
  const folder = copyFixture('verdict', 'agreement');
  writePlan(folder, { schemaVersion: planModule.PLAN_SCHEMA_VERSION, checks: [entry('oracle-agreement', 'pr')] });
  const clean = ci(folder, 'pr');
  assert.equal(clean.status, 0, clean.output);

  // One disposition flipped in a baseline record, re-scored: the engine reports `disagrees` (revert: a check that ignores
  // corroboration passes this case), and the produced evidence is the baseline's, so the check reads it and exits 11.
  const produced = rescored(folder, (runDirectory) => {
    const file = path.join(runDirectory, 'trial-sets', 'P-002', 'record-1.json');
    const record = read(file);
    for (const disposition of record.oracleDispositions)
      disposition.disposition = disposition.disposition === 'violated' ? 'held' : 'violated';
    write(file, record);
    const index = path.join(runDirectory, 'run.json');
    const run = read(index);
    run.artifacts.records['trial-sets/P-002/record-1.json'] = sha(fs.readFileSync(file));
    write(index, run);
  });
  const rescoredEvidence = read(path.join(produced, 'P-002', 'evidence-artifact.json'));
  assert.ok(
    rescoredEvidence.outcomes.some((outcome) => outcome.corroboration === 'disagrees'),
    'the engine did not report disagrees for the flipped disposition',
  );
  const flipped = copyFixture('verdict', 'agreement-flipped');
  const target = scoreDirectory(flipped);
  for (const name of ['P-001/evidence-artifact.json', 'P-002/evidence-artifact.json', 'strength-aggregate.json', 'strength-floors.json']) {
    fs.copyFileSync(path.join(produced, name), path.join(target, name));
  }
  writePlan(flipped, { schemaVersion: planModule.PLAN_SCHEMA_VERSION, checks: [entry('oracle-agreement', 'pr')] });
  const result = ci(flipped, 'pr');
  assert.equal(result.status, 11, result.output);
  const row = rowOf(latestCi(flipped).json, 'oracle-agreement');
  assert.deepEqual([row.exit, row.class, row.action], [11, 'evaluation weakness', 'block']);
  assert.match(result.stdout, /P-002 oracle O-001: eval-quality records corroboration disagrees/);

  // A required oracle that is `unreached` or `not-evaluable` blocks; an oracle no behavior names does not (revert: ignoring
  // the outcome state passes the first case).
  for (const [label, edit, expected] of [
    ['unreached', (outcome) => (outcome.state = 'unreached'), /eval-quality records the outcome unreached/],
    ['not-evaluable', (outcome) => (outcome.corroboration = 'not-evaluable'), /corroboration not-evaluable/],
  ]) {
    const mutated = copyFixture('verdict', `agreement-${label}`);
    writePlan(mutated, { schemaVersion: planModule.PLAN_SCHEMA_VERSION, checks: [entry('oracle-agreement', 'pr')] });
    const file = path.join(scoreDirectory(mutated), 'P-002', 'evidence-artifact.json');
    const artifact = read(file);
    edit(artifact.outcomes[0]);
    write(file, artifact);
    const blocked = ci(mutated, 'pr');
    assert.equal(blocked.status, 11, `${label}: ${blocked.output}`);
    assert.match(blocked.stdout, expected);
    // The same outcome on an oracle no behavior requires is not a block.
    const contractFile = path.join(mutated, 'baseline', 'contract.json');
    const contract = read(contractFile);
    contract.behaviors[0].oracles = [];
    write(contractFile, contract);
    const optional = ci(mutated, 'pr');
    assert.equal(optional.status, 0, `${label} on an oracle no behavior requires: ${optional.output}`);
  }
}

function gameabilityProject() {
  // The arms suite's recipe (Story 1.9): the verdict project with one gameability probe, P-003, whose degenerate response
  // prints a verdict line that names no verdict; the target's launch marker records every launch.
  return live.project(
    'gameability',
    ({ folder }) => {
      const contractFile = path.join(folder, 'contract.json');
      const contract = read(contractFile);
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
      write(contractFile, contract);
      const signature = structuredClone(read(path.join(folder, 'probes', 'P-002.probe.json')).defectSignature);
      signature.condition.predicate = {
        op: 'containment',
        operands: [{ pointer: '/interactions/observed/stdout' }, { literal: 'verdict: pending' }],
      };
      fs.rmSync(path.join(folder, 'probes'), { recursive: true });
      fs.rmSync(path.join(folder, 'mutations'), { recursive: true });
      fs.mkdirSync(path.join(folder, 'probes'));
      write(path.join(folder, 'probes', 'P-003.probe.json'), {
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
      fs.mkdirSync(path.join(folder, 'corpus', 'gameability'), { recursive: true });
      write(path.join(folder, 'corpus', 'gameability', 'P-003.json'), {
        schemaVersion: 1,
        steps: { 'judge-run': { stdout: 'request: Judge the request.\nverdict: pending\n', stderr: '', exitCode: 0 } },
      });
      const manifest = path.join(folder, 'evaluation.json');
      const evaluation = read(manifest);
      evaluation.arms = ['gameability'];
      write(manifest, evaluation);
    },
    { marker: true },
  );
}

function launchesOf(project) {
  const marker = project.env.VERDICT_MARKER;
  return fs.existsSync(marker)
    ? fs
        .readFileSync(marker, 'utf8')
        .split('\n')
        .filter((line) => line.length > 0)
    : [];
}

function checkGameability() {
  const project = gameabilityProject();
  baselines.runAndScore(live, project);
  const accepted = cli(project.folder, 'compare', ['--accept'], project.env);
  assert.equal(accepted.status, 0, accepted.output);
  writePlan(project.folder, { schemaVersion: planModule.PLAN_SCHEMA_VERSION, checks: [entry('gameability', 'pr'), entry('replay', 'pr')] });
  baselines.commitAll(project.repository, 'accept the baseline and the plan');
  const launched = launchesOf(project);
  assert.ok(launched.length > 0, 'the run launched no target, so the marker proves nothing');
  const result = ci(project.folder, 'pr', project.env);
  assert.equal(result.status, 0, result.output);
  // The gameability arm is scored through score over the baseline records, and no target launches: the marker stays as the run left it.
  assert.deepEqual(launchesOf(project), launched, 'ci launched the target');
  const { directory, json } = latestCi(project.folder);
  assert.deepEqual(
    [rowOf(json, 'gameability').exit, rowOf(json, 'gameability').action === 'pass' || rowOf(json, 'gameability').action === 'warn'],
    [0, true],
  );
  const evidence = read(path.join(directory, 'replay', 'scores', 'P-003', 'evidence-artifact.json'));
  assert.equal(evidence.reducedProbeOutcomes[0].trialVotes[0].state, 'caught', 'the gameability arm was not scored to caught');
  assert.match(
    fs.readFileSync(path.join(directory, 'checks', 'gameability', 'stdout'), 'utf8'),
    /P-003: gameability arm scored through eval-quality score, exit 0/,
  );
  assert.deepEqual(launchesOf(project), launched);

  // A gameability arm that was not scored is not a pass: the engine stage for P-003 is killed, and exit 12 outranks the
  // exits of the probes that were scored (revert: `score`'s own ranking, 64, 5, 4, 3, 2, 0, reads the 12 as success).
  writePlan(project.folder, { schemaVersion: planModule.PLAN_SCHEMA_VERSION, checks: [entry('gameability', 'pr')] });
  const unscored = ci(project.folder, 'pr', {
    ...project.env,
    TEA_EVALUATE_ENGINE_CLI: killShim('gameability-kill'),
    KILL_AT: 'score',
    KILL_ARG: 'P-003',
    KILL_MARK: path.join(project.directory, 'kill-mark'),
  });
  assert.equal(unscored.status, 12, unscored.output);
  const unscoredRow = rowOf(latestCi(project.folder).json, 'gameability');
  assert.deepEqual([unscoredRow.exit, unscoredRow.class], [12, 'infrastructure']);
  assert.match(unscored.stdout, /probes\/P-003\.probe\.json: \[gameability\] the gameability arm was not scored/);
  assert.deepEqual(launchesOf(project), launched);
}

// ---------------------------------------------------------------------------
// The live tiers: merge, scheduled and release

/**
 * A committed verdict project with `edit` applied, one trial per arm, its `check` clean, a plan placing each live check, and
 * a baseline accepted from a clean run of it (so nothing is stale until a case makes it so).
 */
function liveProject(label, { edit = () => {}, plan, accept = true } = {}) {
  const project = live.project(label, ({ folder, directory, repository }) => {
    edit({ folder, directory, repository });
    writePlan(folder, { schemaVersion: planModule.PLAN_SCHEMA_VERSION, checks: plan });
  });
  if (accept) {
    baselines.runAndScore(live, project);
    const accepted = cli(project.folder, 'compare', ['--accept'], project.env);
    assert.equal(accepted.status, 0, accepted.output);
    baselines.commitAll(project.repository, 'accept the baseline');
  }
  return project;
}

const FLOOR_DEFECT_ONLY = ({ folder }) => {
  const file = path.join(folder, 'evaluation.json');
  const evaluation = read(file);
  evaluation.strengthFloor = { defect: 1 };
  write(file, evaluation);
};

async function checkLiveTiers() {
  const reason = 'AD-10 default';
  const project = liveProject('tiers', {
    edit: FLOOR_DEFECT_ONLY,
    plan: [
      entry('preflight-live', 'merge', { reason, defaultTier: 'scheduled' }),
      entry('twin-run', 'scheduled', { reason }),
      entry('strength-comparison', 'scheduled', { reason }),
      entry('twin-run', 'release', { reason }),
      // AD-10 gives a strength regression a warning; the plan records it, and nothing else about the row is demoted.
      entry('strength-comparison', 'release', { reason, enforcement: 'warn' }),
    ],
  });
  const originalPlan = planOf(project.folder);
  const planIds = (tier) =>
    planOf(project.folder)
      .checks.filter((item) => item.placement.tier === tier)
      .map((item) => item.id);

  // merge: a live preflight, and only that (exactly the plan's checks for the tier).
  const merged = ci(project.folder, 'merge', project.env);
  assert.equal(merged.status, 0, merged.output);
  const mergeRun = latestCi(project.folder);
  assert.deepEqual(
    mergeRun.json.checks.map((row) => row.id),
    planIds('merge'),
  );
  assert.equal(mergeRun.json.checks[0].runs.length, 1);
  assert.ok(fs.existsSync(path.join(project.folder, mergeRun.json.checks[0].runs[0], 'preflight-verdict.json')));

  // scheduled: the twin run (a development run at the declared trial count) and the comparison with the baseline.
  const scheduled = ci(project.folder, 'scheduled', project.env);
  assert.equal(scheduled.status, 0, scheduled.output);
  const sched = latestCi(project.folder);
  assert.deepEqual(
    sched.json.checks.map((row) => row.id),
    planIds('scheduled'),
  );
  assert.deepEqual(
    sched.json.checks.map((row) => row.exit),
    [0, 0],
  );
  assert.match(fs.readFileSync(path.join(sched.directory, 'checks', 'strength-comparison', 'stdout'), 'utf8'), /compared: 2 probe\(s\)/);
  // The CONCERNS the live run's evidence records are warnings on the rows that read it, and a comparison that found no
  // regression warns of nothing else (revert: leaving the evidence unread keeps these rows `pass`).
  assert.equal(sched.json.checks[0].action, 'warn');
  assert.ok(
    sched.json.checks[0].warnings.length > 0 &&
      sched.json.checks[0].warnings.every((line) => /^twin run P-00\d: eval-quality records CONCERNS/.test(line)),
  );
  assert.match(scheduled.stdout, /warning: twin run P-00\d: eval-quality records CONCERNS/);
  assert.ok(
    sched.json.checks[1].warnings.every((line) => /^strength comparison P-00\d: eval-quality records CONCERNS/.test(line)),
    `a green comparison warned: ${JSON.stringify(sched.json.checks[1].warnings)}`,
  );
  // The twin run is a run of the evaluation at its declared trials, scored.
  const twinRun = path.join(project.folder, sched.json.checks[0].runs[0]);
  assert.equal(read(path.join(twinRun, 'run.json')).trialCount, 1);
  assert.ok(fs.readdirSync(path.join(twinRun, 'scores')).length === 1);

  // release is the same set as a gate, and passes while no floor, digest or comparison says otherwise.
  const released = ci(project.folder, 'release', project.env);
  assert.equal(released.status, 0, released.output);
  assert.deepEqual(
    latestCi(project.folder).json.checks.map((row) => row.id),
    planIds('release'),
  );

  // A stale baseline (the policy digest differs): a warning on scheduled, blocked on release with exit 11 (revert: removing the rule passes silently).
  const policy = path.join(project.folder, 'policy', 'scoring-policy.json');
  const original = fs.readFileSync(policy);
  const edited = JSON.parse(original.toString('utf8'));
  edited.regexMatchStepBudget += 1;
  write(policy, edited);
  const staleScheduled = ci(project.folder, 'scheduled', project.env);
  assert.equal(staleScheduled.status, 0, staleScheduled.output);
  assert.ok(rowOf(latestCi(project.folder).json, 'strength-comparison').warnings.some((line) => /the baseline is stale/.test(line)));
  const staleRelease = ci(project.folder, 'release', project.env);
  assert.equal(staleRelease.status, 11, staleRelease.output);
  const staleRow = rowOf(latestCi(project.folder).json, 'strength-comparison');
  assert.deepEqual([staleRow.exit, staleRow.class, staleRow.action], [11, 'evaluation weakness', 'block']);
  assert.match(staleRelease.stdout, /\[stale-baseline\] the baseline is stale \(the policy digest is/);
  fs.writeFileSync(policy, original);

  // A baseline another engine measured: the comparison is `refused`, routed to compare --accept, and informs (exit 0).
  const recorded = path.join(project.folder, 'baseline', 'run.json');
  const run = read(recorded);
  run.evalQualityVersion = '0.0.0';
  write(recorded, run);
  // Another engine's sealed baseline: its manifest lists the bytes it holds (Story 1.90 refuses one that does not).
  const engine = await loadEngine();
  baselines.resealBaseline(project.folder, engine);
  const refused = ci(project.folder, 'scheduled', project.env);
  assert.equal(refused.status, 0, refused.output);
  const refusedRow = rowOf(latestCi(project.folder).json, 'strength-comparison');
  // The refusal informs and blocks nothing: the row's only warnings are the CONCERNS the live run's evidence records.
  assert.deepEqual([refusedRow.exit, refusedRow.action], [0, 'warn']);
  assert.ok(
    refusedRow.warnings.every((line) => /eval-quality records CONCERNS/.test(line)),
    JSON.stringify(refusedRow.warnings),
  );
  assert.ok(
    refusedRow.notes.some((note) => /^refused: .*eval-quality version differs \(0\.0\.0 vs .*compare --accept/.test(note)),
    JSON.stringify(refusedRow.notes),
  );
  write(recorded, { ...run, evalQualityVersion: engineVersion() });
  baselines.resealBaseline(project.folder, engine);

  // A check's own non-zero exit keeps the stale rule in the final exit. With P-002 missed the twin run breaches the class floor, which
  // is exit 2 on release, so a fresh baseline gives 2 and a stale one 11, which outranks it; each row carries the stale
  // finding too (revert: a twin run that skips the rule keeps the exit at 2).
  const failing = { ...project.env, VERDICT_WHEN: 'trial-mutated-M-001-1', VERDICT_DO: 'accept' };
  const fresh = ci(project.folder, 'release', failing);
  assert.equal(fresh.status, 2, fresh.output);
  assert.deepEqual(
    latestCi(project.folder).json.checks.map((row) => [row.id, row.exit]),
    [
      ['twin-run', 2],
      ['strength-comparison', 0],
    ],
  );
  assert.ok(
    rowOf(latestCi(project.folder).json, 'strength-comparison').warnings.some((line) =>
      /strength regression against the baseline: P-002/.test(line),
    ),
  );
  write(policy, edited);
  const hidden = ci(project.folder, 'release', failing);
  assert.equal(hidden.status, 11, hidden.output);
  for (const row of latestCi(project.folder).json.checks) {
    assert.deepEqual([row.exit, row.class, row.action], [11, 'evaluation weakness', 'block'], row.id);
  }
  assert.match(hidden.stdout, /\[stale-baseline\] the baseline is stale \(the policy digest is/);
  fs.writeFileSync(policy, original);

  // The rule applies once per tier, whichever checks the plan holds: a merge tier (a live preflight alone) warns, and a
  // release tier with no check that reads the baseline blocks with 11 (revert: leaving the rule to the checks that read the baseline passes both).
  writePlan(project.folder, {
    schemaVersion: planModule.PLAN_SCHEMA_VERSION,
    checks: [entry('preflight-live', 'merge', { reason, defaultTier: 'scheduled' }), entry('preflight-live', 'release', { reason })],
  });
  write(policy, edited);
  const staleMerge = ci(project.folder, 'merge', project.env);
  assert.equal(staleMerge.status, 0, staleMerge.output);
  assert.match(staleMerge.stdout, /warning: the baseline is stale \(the policy digest is/);
  assert.equal(latestCi(project.folder).json.baseline.stale, true);
  assert.equal(rowOf(latestCi(project.folder).json, 'preflight-live').action, 'pass');
  const unreadRelease = ci(project.folder, 'release', project.env);
  assert.equal(unreadRelease.status, 11, unreadRelease.output);
  assert.equal(latestCi(project.folder).json.exit, 11);
  assert.equal(rowOf(latestCi(project.folder).json, 'preflight-live').exit, 0);
  fs.writeFileSync(policy, original);
  const freshRelease = ci(project.folder, 'release', project.env);
  assert.equal(freshRelease.status, 0, freshRelease.output);
  assert.deepEqual(latestCi(project.folder).json.baseline, { stale: false, reasons: [] });
  writePlan(project.folder, originalPlan);

  // The contract and the strength floors are stale arms as well (revert: dropping either comparison passes its case).
  // The contract's digest is compared with the baseline's after a compile; a reworded behavior moves it and leaves the
  // statement digest alone.
  const contractFile = path.join(project.folder, 'contract.json');
  const originalContract = fs.readFileSync(contractFile);
  const reworded = JSON.parse(originalContract.toString('utf8'));
  reworded.behaviors[0].description += ' (reworded)';
  write(contractFile, reworded);
  const contractStale = ci(project.folder, 'release', project.env);
  assert.equal(contractStale.status, 11, contractStale.output);
  assert.match(
    contractStale.stdout,
    /\[stale-baseline\] the baseline is stale \(the contract digest is sha256:[0-9a-f]{64}, the baseline's sha256:/,
  );
  fs.writeFileSync(contractFile, originalContract);
  const evaluationFile = path.join(project.folder, 'evaluation.json');
  const originalEvaluation = fs.readFileSync(evaluationFile);
  const loosened = JSON.parse(originalEvaluation.toString('utf8'));
  loosened.strengthFloor.defect = 0.5;
  write(evaluationFile, loosened);
  const floorsStale = ci(project.folder, 'release', project.env);
  assert.equal(floorsStale.status, 11, floorsStale.output);
  assert.match(
    floorsStale.stdout,
    /\[stale-baseline\] the baseline is stale \(the strength floors are \{"defect":0\.5\}, the baseline's \{"defect":1\}\)/,
  );
  fs.writeFileSync(evaluationFile, originalEvaluation);
}

function checkStrengthFloors() {
  // A held-out partition below the declared floor: with the fixture's floors, the held-out run has no clean control, so
  // the engine's floor decision for zero-action is does-not-meet. The floor warns on scheduled and blocks on release
  // (exit 2), applied to the partition on its own (revert: removing the floor passes both).
  const reason = 'AD-10 default';
  const project = liveProject('floors', {
    accept: false,
    edit: ({ folder }) => {
      const file = path.join(folder, 'evaluation.json');
      const evaluation = read(file);
      evaluation.heldOutProbes = ['P-002'];
      write(file, evaluation);
    },
    plan: [entry('held-out', 'scheduled', { reason }), entry('held-out', 'release', { reason })],
  });
  const scheduled = ci(project.folder, 'scheduled', project.env);
  assert.equal(scheduled.status, 0, scheduled.output);
  const warn = rowOf(latestCi(project.folder).json, 'held-out');
  assert.deepEqual([warn.exit, warn.action], [0, 'warn']);
  assert.ok(
    warn.warnings.some((line) => /held-out partition: the zero-action class does not meet its strength floor 1/.test(line)),
    JSON.stringify(warn.warnings),
  );
  assert.match(scheduled.stdout, /warning: held-out partition: the zero-action class does not meet its strength floor/);
  const release = ci(project.folder, 'release', project.env);
  assert.equal(release.status, 2, release.output);
  const block = rowOf(latestCi(project.folder).json, 'held-out');
  assert.deepEqual([block.exit, block.class, block.action], [2, 'target behavior failure', 'block']);
  assert.match(release.stdout, /\[strength-floor\] held-out partition: the zero-action class does not meet its strength floor/);
  // The held-out run is its own run: partition held-out, only the held-out probes.
  const heldOut = path.join(project.folder, block.runs[0]);
  assert.equal(read(path.join(heldOut, 'run.json')).partition, 'held-out');
  assert.deepEqual(
    read(path.join(heldOut, 'trial-sets.json')).trialSets.map((set) => set.probeId),
    ['P-002'],
  );
}

/**
 * Seeded defects on the verdict command's gates, the recipe `test:evaluate-run`'s strength aggregate uses: gate `n` is
 * probe P-00(n+1) and mutation M-00n, and a trial of that mutation whose workspace label `VERDICT_WHEN` names, with
 * `VERDICT_DO=accept`, still prints the `relaxed: gate-n` line the probe's signature reads and answers `accepted`, so the
 * defect shows and the oracle misses it. The projects built from this are made at test time: no committed fixture holds a
 * probe that a run misses.
 */
function addGateProbes({ folder, repository }, gates) {
  fs.writeFileSync(path.join(repository, 'rules', 'policy.txt'), `mode: strict\n${gates.map((gate) => `gate-${gate}: strict\n`).join('')}`);
  const base = JSON.stringify(read(path.join(folder, 'probes', 'P-002.probe.json')));
  const mutation = read(path.join(folder, 'mutations', 'M-001.mutation.json'));
  for (const gate of gates) {
    const probe = JSON.parse(
      base.replaceAll('manifest-lenient', `manifest-lenient-${gate}`).replaceAll('verdict: rejected', `relaxed: gate-${gate}`),
    );
    probe.probeId = `P-00${gate + 1}`;
    probe.defects[0].defectId = `D-00${gate + 1}`;
    probe.qualification.mutation = `M-00${gate}`;
    probe.rationale = `Seeded defect: M-00${gate} relaxes gate-${gate}, and the verdict command then reports it.`;
    write(path.join(folder, 'probes', `${probe.probeId}.probe.json`), probe);
    write(path.join(folder, 'mutations', `M-00${gate}.mutation.json`), {
      ...mutation,
      mutationId: `M-00${gate}`,
      mutationSource: `rules/policy.txt: gate-${gate} relaxed to lenient`,
      operator: { ...mutation.operator, find: `gate-${gate}: strict`, replace: `gate-${gate}: lenient` },
    });
  }
}

/**
 * Edits that make a missed defect CONCERNS, so a run that misses a probe still exits 0 and the floor
 * decision, measured from a real rate, decides alone: the behavior's severity is `low`, below the policy's
 * `severityFloor`. P-003 (gate 2) is the held-out defect probe and P-004 (gate 3) a development one beside P-002, so the
 * development partition holds two eligible defect probes and the held-out partition one. The evaluation declares two
 * trials and the policy's `minimumTrialCount` is one, which tells the twin run (one trial) from the held-out run (two).
 */
function weakEdit(context) {
  const { folder } = context;
  const contractFile = path.join(folder, 'contract.json');
  const contract = read(contractFile);
  contract.behaviors[0].severity = 'low';
  write(contractFile, contract);
  addGateProbes(context, [2, 3]);
  const manifestFile = path.join(folder, 'evaluation.json');
  const evaluation = read(manifestFile);
  evaluation.heldOutProbes = ['P-003'];
  evaluation.trials = 2;
  evaluation.strengthFloor = { defect: 1 };
  write(manifestFile, evaluation);
}

function checkWeakProject() {
  const reason = 'AD-10 default';
  const pair = (tier) => [entry('twin-run', tier, { reason }), entry('held-out', tier, { reason })];
  const project = liveProject('weak', {
    edit: weakEdit,
    accept: false,
    plan: [...pair('scheduled'), ...pair('release'), entry('strength-comparison', 'scheduled', { reason })],
  });
  // The baseline is a clean run of the development partition alone, so a twin run repeats that partition.
  baselines.runAndScore(live, project, ['--partition', 'development']);
  const accepted = cli(project.folder, 'compare', ['--accept'], project.env);
  assert.equal(accepted.status, 0, accepted.output);
  baselines.commitAll(project.repository, 'accept the baseline');
  assert.equal(read(path.join(project.folder, 'baseline', 'baseline.json')).partition, 'development');
  const floorWarnings = (row, label, rate) =>
    row.warnings.filter(
      (line) => line === `${label}: the defect class does not meet its strength floor 1 (rate ${rate}, rate-below-floor)`,
    );
  const bothTiers = (env) => {
    const out = {};
    for (const tier of ['scheduled', 'release']) {
      const result = ci(project.folder, tier, env);
      out[tier] = { status: result.status, output: result.output, json: latestCi(project.folder).json };
    }
    return out;
  };

  // Only the held-out probe is missed: the held-out partition breaches its floor on its own, from a measured rate (not
  // `no-eligible-probe`), and the twin run of the development partition does not. Scheduled warns, release blocks with 2
  // (revert: dropping the floor from the held-out check passes both).
  {
    const held = bothTiers({ ...project.env, VERDICT_WHEN: 'trial-mutated-M-002-1,trial-mutated-M-002-2', VERDICT_DO: 'accept' });
    assert.equal(held.scheduled.status, 0, held.scheduled.output);
    const [twinWarn, heldWarn] = ['twin-run', 'held-out'].map((id) => rowOf(held.scheduled.json, id));
    assert.deepEqual([twinWarn.exit, floorWarnings(twinWarn, 'twin run', 1).length, twinWarn.warnings.length], [0, 0, 0]);
    assert.deepEqual([heldWarn.exit, heldWarn.action], [0, 'warn']);
    assert.equal(floorWarnings(heldWarn, 'held-out partition', 0).length, 1, JSON.stringify(heldWarn.warnings));
    assert.equal(held.release.status, 2, held.release.output);
    const [twinBlock, heldBlock] = ['twin-run', 'held-out'].map((id) => rowOf(held.release.json, id));
    assert.deepEqual([twinBlock.exit, twinBlock.action], [0, 'pass']);
    assert.deepEqual([heldBlock.exit, heldBlock.class, heldBlock.action], [2, 'target behavior failure', 'block']);
    assert.match(
      held.release.output,
      /\[strength-floor\] held-out partition: the defect class does not meet its strength floor 1 \(rate 0, rate-below-floor\)/,
    );
    // The twin run repeats the baseline's partition at the policy's minimumTrialCount; the held-out run is the held-out
    // partition at the evaluation's own trial count (revert: a twin run that ignores the policy runs two trials).
    const [twin] = twinWarn.runs.map((relative) => read(path.join(project.folder, relative, 'run.json')));
    const [heldRun] = heldWarn.runs.map((relative) => read(path.join(project.folder, relative, 'run.json')));
    assert.deepEqual([twin.partition, twin.trialCount], ['development', 1]);
    assert.deepEqual([heldRun.partition, heldRun.trialCount], ['held-out', 2]);
    assert.equal(read(path.join(project.folder, 'baseline', 'run.json')).trialCount, 2);
  }

  // Only one development probe is missed: the twin run breaches (the floor applies to it as well, at half the class), and
  // the held-out partition does not (revert: dropping the floor from the twin run passes both).
  {
    const twinMissed = bothTiers({ ...project.env, VERDICT_WHEN: 'trial-mutated-M-003-1', VERDICT_DO: 'accept' });
    assert.equal(twinMissed.scheduled.status, 0, twinMissed.scheduled.output);
    const [twinWarn, heldWarn] = ['twin-run', 'held-out'].map((id) => rowOf(twinMissed.scheduled.json, id));
    assert.deepEqual([twinWarn.exit, twinWarn.action], [0, 'warn']);
    assert.equal(floorWarnings(twinWarn, 'twin run', 0.5).length, 1, JSON.stringify(twinWarn.warnings));
    assert.deepEqual([heldWarn.exit, heldWarn.warnings.length], [0, 0]);
    assert.equal(twinMissed.release.status, 2, twinMissed.release.output);
    const [twinBlock, heldBlock] = ['twin-run', 'held-out'].map((id) => rowOf(twinMissed.release.json, id));
    assert.deepEqual([twinBlock.exit, twinBlock.class, twinBlock.action], [2, 'target behavior failure', 'block']);
    assert.deepEqual([heldBlock.exit, heldBlock.action], [0, 'pass']);
  }

  // The same weakened target against the baseline: the comparison warns that P-004 regressed, from the engine's relation
  // (`relations` on the compare outcome), and still exits 0 (revert: ignoring the relations passes it silently).
  {
    writePlan(project.folder, {
      schemaVersion: planModule.PLAN_SCHEMA_VERSION,
      checks: [entry('strength-comparison', 'scheduled', { reason })],
    });
    const regressed = ci(project.folder, 'scheduled', { ...project.env, VERDICT_WHEN: 'trial-mutated-M-003-1', VERDICT_DO: 'accept' });
    assert.equal(regressed.status, 0, regressed.output);
    const row = rowOf(latestCi(project.folder).json, 'strength-comparison');
    assert.deepEqual([row.exit, row.action], [0, 'warn']);
    assert.deepEqual(
      row.warnings.filter((line) => /strength regression/.test(line)),
      ["strength regression against the baseline: P-004 measures weaker than the baseline's (a-dominates-b)"],
    );
    assert.match(regressed.stdout, /warning: strength regression against the baseline: P-004/);
    // The comparison against the unweakened target warns of no regression.
    const steady = ci(project.folder, 'scheduled', project.env);
    assert.equal(steady.status, 0, steady.output);
    assert.equal(
      rowOf(latestCi(project.folder).json, 'strength-comparison').warnings.some((line) => /strength regression/.test(line)),
      false,
    );
  }
}

function calibrationProject() {
  return live.project(
    'calibration',
    ({ folder, directory }) => {
      const contractFile = path.join(folder, 'contract.json');
      const contract = read(contractFile);
      contract.rubrics = [
        {
          id: 'R-101',
          scaleLevels: [
            { level: 0, anchor: 'The response misses the verdict.' },
            { level: 1, anchor: 'The response states the verdict.' },
          ],
          failureModePenalties: [{ name: 'missing-verdict', description: 'A missing verdict scores zero.' }],
          maxLength: 200,
          criteria: [
            { id: 'RC-101', text: 'Does the response state the verdict?', evidence: '/interactions/judge-run/stdout' },
            { id: 'RC-102', text: 'Does the response explain the verdict?', evidence: '/interactions/judge-run/stdout' },
          ],
        },
      ];
      write(contractFile, contract);
      const manifestFile = path.join(folder, 'evaluation.json');
      const evaluation = read(manifestFile);
      evaluation.judge = {
        agent: 'custom',
        agentCommand: process.execPath,
        agentArgs: [STUB_JUDGE, '--capture', path.join(directory, 'prompts.jsonl'), '--event-log', path.join(directory, 'launches.jsonl')],
        timeoutMs: 60_000,
      };
      evaluation.judgeCalibration = { minimumAgreement: 0.9 };
      write(manifestFile, evaluation);
      write(path.join(folder, 'policy', 'evaluator-conditions.json'), {
        schemaVersion: 1,
        modelSnapshot: 'none',
        systemPromptDigest: sha(Buffer.alloc(0)),
        judge: { modelSnapshot: 'stub-judge-2026-09' },
      });
      write(path.join(folder, 'policy', 'judge-calibration.json'), {
        items: ['RC-101', 'RC-102'].flatMap((criterionId) =>
          [0, 1].map((level) => ({ rubricId: 'R-101', criterionId, response: `calibration response ${level}`, expectedLevel: level })),
        ),
      });
      const reason = 'AD-10 default';
      writePlan(folder, {
        schemaVersion: planModule.PLAN_SCHEMA_VERSION,
        checks: [entry('judge-calibration', 'scheduled', { reason }), entry('judge-calibration', 'release', { reason })],
      });
    },
    { marker: true },
  );
}

function checkJudgeCalibration() {
  // The stub judge agrees with half the labelled items, below the declared 0.9: exit 11 on both live tiers (revert: skipping calibration passes them).
  const project = calibrationProject();
  for (const tier of ['scheduled', 'release']) {
    const result = ci(project.folder, tier, project.env);
    assert.equal(result.status, 11, `${tier}: ${result.output}`);
    const row = rowOf(latestCi(project.folder).json, 'judge-calibration');
    assert.deepEqual([row.exit, row.class, row.action], [11, 'evaluation weakness', 'block'], tier);
    assert.match(result.stdout, /\[judge-calibration\] R-101\/RC-10[12]: judge agreement 0\.5 is below the minimum 0\.9/);
  }
  // A contract that declares no rubric has nothing to calibrate.
  const plain = copyFixture('verdict', 'no-rubric');
  writePlan(plain, {
    schemaVersion: planModule.PLAN_SCHEMA_VERSION,
    checks: [entry('judge-calibration', 'scheduled', { reason: 'AD-10 default' })],
  });
  const none = ci(plain, 'scheduled');
  assert.equal(none.status, 0, none.output);
  assert.ok(rowOf(latestCi(plain).json, 'judge-calibration').notes.includes('no rubric declared'));
}

// ---------------------------------------------------------------------------
// Fixtures

function checkFixtureTiers() {
  // The three fixture adopters pass their pr tier over their committed baselines, each in a copy.
  for (const name of ['verdict', 'mcp', 'api']) {
    const folder = copyFixture(name, `fixture-${name}`);
    const result = ci(folder, 'pr');
    assert.equal(result.status, 0, `${name}: ${result.output}`);
    const { json } = latestCi(folder);
    assert.deepEqual(
      json.checks.map((row) => row.id),
      planOf(folder)
        .checks.filter((item) => item.placement.tier === 'pr')
        .map((item) => item.id),
      name,
    );
    assert.ok(
      json.checks.every((row) => row.exit === 0),
      `${name}: ${JSON.stringify(json.checks.map((row) => [row.id, row.exit]))}`,
    );
    // None of the committed fixtures holds a gameability probe, and the check says so.
    const gameability = json.checks.find((row) => row.id === 'gameability');
    if (gameability !== undefined) {
      assert.ok(gameability.notes.includes('no gameability probe'), `${name}: ${JSON.stringify(gameability.notes)}`);
      assert.match(
        fs.readFileSync(path.join(latestCi(folder).directory, 'checks', 'gameability', 'stdout'), 'utf8'),
        /the baseline holds no gameability probe/,
      );
    }
    const checked = cli(folder, 'check');
    assert.equal(checked.status, 0, `${name}: ${checked.output}`);
  }
  // The API port conformance runs for an api evaluation only; on the others it is a wiring defect of the plan.
  const mcp = copyFixture('mcp', 'conformance-wiring');
  const value = planOf(mcp);
  value.checks.push(entry('api-conformance', 'pr'));
  writePlan(mcp, value);
  const wrong = ci(mcp, 'pr');
  assert.equal(wrong.status, 10, wrong.output);
  assert.match(wrong.stdout, /\[applicability\] checks\[\d+\] \(evaluate "api-conformance" on pr\)/);
  // The runtime still refuses the run when it cannot read the registry the rule reads: an evaluation.json with none exits 64.
  const manifest = path.join(mcp, 'evaluation.json');
  const evaluation = read(manifest);
  delete evaluation.registry;
  write(manifest, evaluation);
  const unread = ci(mcp, 'pr');
  assert.equal(unread.status, 64, unread.output);
  assert.equal(rowOf(latestCi(mcp).json, 'api-conformance').exit, 64);
  // A port that fails its conformance run is an authoring defect (exit 10), with the suite's own report kept.
  const api = copyFixture('api', 'conformance-broken');
  const port = path.join(api, 'adapter', 'http-probe-port.conformance.mjs');
  fs.writeFileSync(
    port,
    'console.log(\'FAIL environment-probe conformance for "http-probe-port": 3/9 assertions passed\');\nprocess.exit(1);\n',
  );
  const failed = ci(api, 'pr');
  assert.equal(failed.status, 10, failed.output);
  assert.match(
    fs.readFileSync(path.join(latestCi(api).directory, 'checks', 'api-conformance', 'stdout'), 'utf8'),
    /FAIL environment-probe conformance/,
  );
  fs.rmSync(port);
  const gone = ci(api, 'pr');
  assert.equal(gone.status, 10, gone.output);
  assert.match(gone.stdout, /http-probe-port\.conformance\.mjs: \[adapter\] is absent/);
}

function checkCommittedLiveTiers() {
  // The committed verdict-ci plan's merge, scheduled and release entries, run over the committed baseline in a copy of the
  // fixture (its copy workspace records no dirty tree): each tier holds exactly the plan's checks and exits 0.
  const folder = copyFixture('verdict', 'committed-live');
  const plan = planOf(folder);
  for (const tier of ['merge', 'scheduled', 'release']) {
    const result = ci(folder, tier);
    assert.equal(result.status, 0, `${tier}: ${result.output}`);
    const { json } = latestCi(folder);
    assert.deepEqual(
      json.checks.map((row) => row.id),
      plan.checks.filter((item) => item.placement.tier === tier).map((item) => item.id),
      tier,
    );
    assert.ok(
      json.checks.every((row) => row.exit === 0),
      `${tier}: ${JSON.stringify(json.checks.map((row) => [row.id, row.exit]))}`,
    );
    assert.equal(json.baseline.stale, false, `${tier}: the committed baseline is stale: ${JSON.stringify(json.baseline.reasons)}`);
  }
}

// ---------------------------------------------------------------------------
// The plans the ci stage wrote for two repositories (Story 2.4, R2-16)

const REPOSITORIES = {
  'tagged-release': { root: 'test/fixtures/evaluate-ci-repos/tagged-release', folder: 'evals/answer-grade' },
  'nightly-deploy': { root: 'test/fixtures/evaluate-ci-repos/nightly-deploy', folder: 'evals/answer-grade' },
};
const AI_FEATURE = 'test/fixtures/evaluate-authoring/ai-feature/evaluation';
const TEMPLATE = path.join(ROOT, 'src', 'workflows', 'testarch', 'bmad-testarch-evaluate', 'assets', 'evaluation-ci-plan.template.json');
/** The files a reason can cite to show an inspection of the repository: its pipelines, its merge rules and its release or deploy note. */
const EVIDENCE_FILE = /^(?:\.github\/workflows\/|docs\/|CONTRIBUTING\.md$)/;
const FILE_TOKEN = /[.\w/-]+\.(?:txt|yml|yaml|md|json|mjs|cjs|sh|toml|cfg|conf|lock|xml|ini)\b/g;

/** A repository as the stage read it: its relative file paths with their bytes and, for text files, their text, so a revert case can change one. */
function loadRepository(root) {
  const bytes = repositoryFiles(root);
  const files = new Map(
    [...bytes].filter(([name]) => /\.(?:txt|ya?ml|md|json|mjs|sh)$/.test(name)).map(([name, content]) => [name, content.toString('utf8')]),
  );
  return { root, files, bytes };
}

/** The `id@tier` of every live check a plan places. */
function livePlacements(plan) {
  return new Set(plan.checks.filter((item) => planModule.LIVE_CHECKS.includes(item.id)).map((item) => `${item.id}@${item.placement.tier}`));
}

/** The repository files a reason names, existing or not. Paths under `runs/` and `baseline/` are generated evidence. */
const fileTokens = (reason) => [...new Set(reason.replaceAll(/\b(?:runs|baseline)\/\S*/g, '').match(FILE_TOKEN) ?? [])];

/** The repository path a token names: the path itself, or the one file whose path ends with it (`ci.yml`, `server/grade.mjs`). */
function resolveToken(repository, token) {
  if (repository.files.has(token)) return token;
  return [...repository.files.keys()].find((name) => name.endsWith(`/${token.replace(/^\//, '')}`)) ?? null;
}

/** What the repository's pipelines can start: a schedule, a tag or release event, a deploy job, a merge queue. */
function repositoryEvents(repository) {
  const workflows = [...repository.files].filter(([name]) => name.startsWith('.github/workflows/'));
  const any = (pattern) => workflows.some(([, text]) => pattern.test(text));
  return {
    schedule: any(/^\s*schedule:/m),
    release: any(/^\s*tags:/m) || any(/^\s*release:/m) || any(/^\s*environment: production/m),
    mergeGroup: any(/^\s*merge_group:/m),
  };
}

/**
 * The facts a committed placement relies on must be true of the repository: the triggers its workflows hold, the notes
 * that exist and what they say. `facts` lists a file, a pattern and whether the pattern must match.
 */
function repositoryFactProblems(name, repository, expected) {
  const problems = [];
  const events = repositoryEvents(repository);
  for (const [fact, value] of Object.entries(expected.events))
    if (events[fact] !== value) problems.push(`${name}: the repository ${value ? 'lacks' : 'holds'} its ${fact} event`);
  for (const note of expected.notes) if (!repository.files.has(note)) problems.push(`${name}: ${note} is missing`);
  for (const [file, pattern, matches] of expected.facts) {
    const text = repository.files.get(file);
    if (text === undefined) problems.push(`${name}: ${file} is missing`);
    else if (pattern.test(text) !== matches) problems.push(`${name}: ${file} ${matches ? 'no longer says' : 'now says'} ${pattern}`);
  }
  return problems;
}

/**
 * What a plan must be for one repository: every check the guide keeps for this evaluation, every live check on every live
 * tier the plan uses, tiers whose event the repository has, and reasons whose files all exist.
 */
function planProblems(name, plan, repository, required, folder) {
  const problems = [];
  const ids = new Set(plan.checks.map((item) => item.id));
  for (const id of required) if (!ids.has(id)) problems.push(`${name}: the plan drops ${id}`);
  for (const id of ids) if (!required.includes(id)) problems.push(`${name}: the plan holds ${id}, which the evaluation cannot run`);
  const pr = new Set(plan.checks.filter((item) => item.placement.tier === 'pr').map((item) => item.id));
  for (const id of planModule.DETERMINISTIC_CHECKS) if (required.includes(id) && !pr.has(id)) problems.push(`${name}: ${id} is not on pr`);
  // The merge tier holds only the live preflight; the rest of the live set sits on scheduled and release.
  const liveTiers = new Set(
    plan.checks
      .filter((item) => planModule.LIVE_CHECKS.includes(item.id) && item.placement.tier !== 'merge')
      .map((item) => item.placement.tier),
  );
  if (!ids.has('preflight-live')) problems.push(`${name}: no live preflight is placed`);
  for (const tier of liveTiers)
    for (const id of ['held-out', 'twin-run', 'strength-comparison'])
      if (!plan.checks.some((item) => item.id === id && item.placement.tier === tier))
        problems.push(`${name}: ${id} is missing from the ${tier} tier`);
  const events = repositoryEvents(repository);
  if (liveTiers.has('scheduled') && !events.schedule) problems.push(`${name}: a scheduled tier without a schedule in the repository`);
  if (liveTiers.has('release') && !events.release) problems.push(`${name}: a release tier without a release or deploy workflow`);
  for (const item of plan.checks) {
    const where = `${name}: ${item.id} on ${item.placement.tier}`;
    problems.push(...planEntryShapeProblems(item, name, { subsetTriggers: true }));
    if (folder !== undefined && item.kind === 'evaluate' && item.command[3] !== folder)
      problems.push(`${where} runs another evaluation folder`);
    const reason = item.placement.reason?.trim() ?? '';
    if (reason === '') problems.push(`${where} records no placement.reason`);
    for (const token of fileTokens(reason))
      if (resolveToken(repository, token) === null) problems.push(`${where} cites ${token}, which the repository does not hold`);
  }
  return problems;
}

/**
 * What two repositories' plans must show (the second Story 2.4 criterion): a live check placed differently, and a reason that
 * cites a pipeline, merge-rule or release note of its own repository for every placement that differs. A stage that ignored the
 * inspection and wrote AD-10's default table for both fails the first rule; a reason that names no such file of its repository
 * fails the second.
 */
function planDifferences(sides) {
  const problems = [];
  const live = sides.map((side) => livePlacements(side.plan));
  const differing = [];
  for (const [index, mine] of live.entries())
    for (const placement of mine) if (!live[1 - index].has(placement)) differing.push([index, placement]);
  if (differing.length === 0) problems.push('the two plans place every live check alike');
  for (const [index, placement] of differing) {
    const [id, tier] = placement.split('@');
    const side = sides[index];
    const check = side.plan.checks.find((item) => item.id === id && item.placement.tier === tier);
    const cited = fileTokens(check.placement.reason ?? '')
      .map((token) => resolveToken(side.repository, token))
      .filter((resolved) => resolved !== null && EVIDENCE_FILE.test(resolved) && !sides[1 - index].repository.files.has(resolved));
    if (cited.length === 0)
      problems.push(
        `${placement} in ${side.repository.root} gives a reason that cites no pipeline, merge-rule or release file specific to that repository`,
      );
  }
  return problems;
}

/** The checks the guide keeps for this evaluation: the template's ids less the ones it deletes. */
function requiredChecks(evaluation) {
  const ids = new Set(read(TEMPLATE).checks.map((item) => item.id));
  const contract = read(path.join(evaluation, 'contract.json'));
  if (!Array.isArray(contract.rubrics) || contract.rubrics.length === 0) ids.delete('judge-calibration');
  if (read(path.join(evaluation, 'evaluation.json')).interface !== 'api') ids.delete('api-conformance');
  return [...ids];
}

/** A plan built from the template for a revert case: the live set on `tiers`, each reason citing `file`. */
function syntheticPlan(tiers, file, drop = []) {
  const template = read(TEMPLATE);
  const checks = template.checks
    .filter((item) => !['judge-calibration'].includes(item.id) && !drop.includes(item.id))
    .filter((item) => item.placement.tier === 'pr' || tiers.includes(item.placement.tier))
    .filter((item) => item.id !== 'preflight-live' || item.placement.tier === tiers[0])
    .map((item) => ({ ...structuredClone(item), placement: { ...item.placement, reason: `${file} gives the event of this tier` } }));
  return { schemaVersion: 1, checks };
}

const SKILL_ROOT = path.join(ROOT, 'src', 'workflows', 'testarch', 'bmad-testarch-evaluate');
const READ_KEYS = ['SKILL.md', 'assets/evaluation-ci-plan.template.json', 'references/ci.md'];
const WROTE_KEYS = ['evals/answer-grade/ci/evaluation-ci-plan.json', 'evals/answer-grade/evaluation.json'];
const DIGEST = /^sha256:[0-9a-f]{64}$/;

/**
 * The capture record of a repository against the tree: exactly the skill files the session read and the two files it wrote,
 * each with a digest that still matches, the digest of the repository files it read, and a model, a session and a prompt that
 * names no placement. `bytes` is the repository as committed; a revert case changes one of its entries.
 */
const EVALUATION_FILE = 'evals/answer-grade/evaluation.json';
const CONTRACT_FILE = 'evals/answer-grade/contract.json';
/** What a `migrations` entry may carry: the file, the story that moved it and the change in words. */
const MIGRATION_FIELDS = new Set(['file', 'story', 'change']);

/**
 * The bytes a live session wrote before Story 1.42 moved `evaluation.json` to schema 2: `schemaVersion` back to 1 and
 * `operationPhases` flattened from `{ interfaceId: { operationId: phase } }` to `{ operationId: phase }`, serialized as the
 * session left it. `null` when the file is not a schema 2 file with nested phases in the runtime's serialization, a phase
 * interface is not one of its registry's, a phase pair is not one the contract beside it declares (`pairs`, as JSON
 * `[interfaceId, operationId]`), or an operation ID repeats across interfaces.
 */

/** The `[interfaceId, operationId]` pairs, as JSON, the contract in `bytes` declares. */
function declaredPairs(bytes) {
  try {
    const contract = JSON.parse(bytes.get(CONTRACT_FILE).toString('utf8'));
    return new Set(
      contract.permittedInterfaces.flatMap((iface) =>
        iface.operations.map((operation) => JSON.stringify([iface.logicalId, operation.operationId])),
      ),
    );
  } catch {
    return new Set();
  }
}
function reverseSchema2Migration(buffer, pairs) {
  let value;
  try {
    value = JSON.parse(buffer.toString('utf8'));
  } catch {
    return null;
  }
  if (value?.schemaVersion !== 2 || value.operationPhases === null || typeof value.operationPhases !== 'object') return null;
  // The migrated file is the serialization the runtime writes, so any other byte (whitespace included) is an edit.
  if (buffer.toString('utf8') !== `${JSON.stringify(value, null, 2)}\n`) return null;
  // Each interface key is one the file declares, so phases re-keyed under an interface it never declared are an edit.
  const declared = new Set(Array.isArray(value.registry) ? value.registry.map((entry) => entry?.interfaceId) : []);
  const flat = {};
  for (const [interfaceId, byOperation] of Object.entries(value.operationPhases)) {
    if (!declared.has(interfaceId)) return null;
    if (byOperation === null || typeof byOperation !== 'object') return null;
    for (const [operationId, phase] of Object.entries(byOperation)) {
      // The flat map keeps no interface, so an operation moved between two declared interfaces would rebuild the same bytes;
      // each pair has to be one the file's contract declares.
      if (!pairs.has(JSON.stringify([interfaceId, operationId]))) return null;
      if (Object.hasOwn(flat, operationId)) return null;
      flat[operationId] = phase;
    }
  }
  return Buffer.from(`${JSON.stringify({ ...value, schemaVersion: 1, operationPhases: flat }, null, 2)}\n`);
}

/** The held-out gameability probe Story 1.98 added to the AI-feature evaluation. */
const STORY_98_PROBE = 'P-015';

/**
 * The bytes a live session wrote before Story 1.98 repaired the AI-feature evaluation behind `evaluation.json`: the
 * `zero-action` floor back in `strengthFloor` (after `defect`, where the session left it, since no probe of that class can be
 * eligible) and the held-out gameability probe out of `heldOutProbes`. `null` when the file is not the runtime's serialization of
 * a file that carries that repair: a floor already there, a held-out list that does not end in the probe, or other bytes.
 */
function reverseStory98Migration(buffer) {
  let value;
  try {
    value = JSON.parse(buffer.toString('utf8'));
  } catch {
    return null;
  }
  if (buffer.toString('utf8') !== `${JSON.stringify(value, null, 2)}\n`) return null;
  const floor = value?.strengthFloor;
  const held = value?.heldOutProbes;
  if (floor === null || typeof floor !== 'object' || Array.isArray(floor) || Object.hasOwn(floor, 'zero-action')) return null;
  if (!Array.isArray(held) || held.at(-1) !== STORY_98_PROBE || held.filter((id) => id === STORY_98_PROBE).length !== 1) return null;
  const restored = {};
  for (const [key, level] of Object.entries(floor)) {
    restored[key] = level;
    if (key === 'defect') restored['zero-action'] = 1;
  }
  if (!Object.hasOwn(restored, 'zero-action')) return null;
  return Buffer.from(`${JSON.stringify({ ...value, strengthFloor: restored, heldOutProbes: held.slice(0, -1) }, null, 2)}\n`);
}

/**
 * The migrations a capture record may declare for `evaluation.json`, newest first: each rebuilds the bytes the file held before
 * the story moved it, or `null` when the file is not one that story could have produced, and says what the file is then not.
 */
const REVERSALS = [
  ['1.98', (buffer) => reverseStory98Migration(buffer), 'a file that carries the Story 1.98 floor and held-out repair'],
  ['1.42', (buffer, bytes) => reverseSchema2Migration(buffer, declaredPairs(bytes)), 'a schema 2 file'],
];

function captureProblems(name, record, bytes) {
  const problems = [];
  if (!(record.model ?? '').startsWith('claude-')) problems.push(`${name}: the capture record names no model`);
  if (!(record.turns > 0 && record.durationMs > 0)) problems.push(`${name}: the capture record holds no session`);
  if (/\b(?:pr|merge|scheduled|release|tier|tiers)\b/i.test(record.prompt ?? ''))
    problems.push(`${name}: the session prompt names a placement`);
  const keys = (value) => JSON.stringify(Object.keys(value ?? {}).sort());
  if (keys(record.sessionRead) !== JSON.stringify(READ_KEYS)) problems.push(`${name}: sessionRead names ${keys(record.sessionRead)}`);
  if (keys(record.wrote) !== JSON.stringify(WROTE_KEYS)) problems.push(`${name}: wrote names ${keys(record.wrote)}`);
  for (const relative of READ_KEYS) {
    const digest = record.sessionRead?.[relative];
    if (!DIGEST.test(digest ?? '')) problems.push(`${name}: sessionRead holds no digest for ${relative}`);
    else if (sha(fs.readFileSync(path.join(SKILL_ROOT, relative))) !== digest)
      problems.push(`${name}: ${relative} changed since the live session read it; run the session again`);
  }
  // A file the session wrote and a later story migrated is held to the session's digest through the declared migrations: the
  // bytes the session wrote are rebuilt by reversing them, newest first, so the digest in `wrote` is never retyped and the
  // migrations are the only edits the file may carry.
  const declared = new Set();
  for (const migration of record.migrations ?? []) {
    const known = migration?.file === EVALUATION_FILE && REVERSALS.some(([story]) => story === migration.story);
    if (!known) problems.push(`${name}: the capture record declares a migration of ${migration?.file} the tests do not know`);
    else if (declared.has(migration.story)) problems.push(`${name}: the capture record declares the migration of ${migration.file} twice`);
    else declared.add(migration.story);
    // The rebuilt bytes are the only authority: a digest the entry names (`from`, `to`) is a second claim nothing checks.
    const claims = Object.keys(migration ?? {}).filter((key) => !MIGRATION_FIELDS.has(key));
    if (claims.length > 0)
      problems.push(
        `${name}: the migration of ${migration?.file} names ${claims.join(', ')}, which the rebuilt bytes are the only authority for`,
      );
  }
  for (const relative of WROTE_KEYS) {
    const digest = record.wrote?.[relative];
    let written = bytes.get(relative) ?? Buffer.alloc(0);
    if (relative === EVALUATION_FILE) {
      for (const [story, reverse, what] of REVERSALS) {
        if (!declared.has(story)) continue;
        const rebuilt = reverse(written, bytes);
        if (rebuilt === null) {
          problems.push(`${name}: ${relative} is not ${what} the declared migration could have produced`);
          break;
        }
        written = rebuilt;
      }
    }
    if (!DIGEST.test(digest ?? '')) problems.push(`${name}: wrote holds no digest for ${relative}`);
    else if (sha(written) !== digest) problems.push(`${name}: ${relative} is not the file the live session wrote`);
  }
  if (!DIGEST.test(record.repositoryRead ?? '')) problems.push(`${name}: the capture record digests no repository file`);
  else if (repositoryReadDigest(bytes) !== record.repositoryRead)
    problems.push(`${name}: a repository file changed since the live session read it; run the session again`);
  return problems;
}

function checkRepositoryPlans() {
  const expectations = {
    'tagged-release': {
      events: { schedule: false, release: true, mergeGroup: false },
      notes: ['CONTRIBUTING.md', 'docs/RELEASING.md'],
      facts: [
        ['.github/workflows/release.yml', /^\s*tags:/m, true],
        ['.github/workflows/release.yml', /NPM_TOKEN/, true],
        ['.github/workflows/release.yml', /GRADER_MODEL_KEY/, false],
        ['.github/workflows/ci.yml', /^\s*pull_request:/m, true],
        ['docs/RELEASING.md', /The tag is the only release gate/, true],
        ['docs/RELEASING.md', /no scheduled job/, true],
        ['CONTRIBUTING.md', /There is no merge queue/, true],
        ['CONTRIBUTING.md', /CI holds no model credentials/, true],
      ],
      liveTiers: ['release'],
    },
    'nightly-deploy': {
      events: { schedule: true, release: true, mergeGroup: true },
      notes: ['CONTRIBUTING.md', 'docs/DEPLOYING.md'],
      facts: [
        ['.github/workflows/nightly.yml', /^\s*schedule:/m, true],
        ['.github/workflows/nightly.yml', /secrets\.GRADER_MODEL_KEY/, true],
        ['.github/workflows/deploy.yml', /^\s*schedule:/m, true],
        ['.github/workflows/deploy.yml', /environment: production/, true],
        ['.github/workflows/deploy.yml', /^\s*tags:/m, false],
        ['.github/workflows/ci.yml', /^\s*merge_group:/m, true],
        ['docs/DEPLOYING.md', /every night at 03:47/, true],
        ['docs/DEPLOYING.md', /The two workflows are independent/, true],
        ['CONTRIBUTING.md', /Merges go through the merge queue/, true],
        ['CONTRIBUTING.md', /There is no merge queue/, false],
        ['CONTRIBUTING.md', /GRADER_MODEL_KEY/, true],
      ],
      liveTiers: ['scheduled', 'release'],
    },
  };
  const loaded = Object.entries(REPOSITORIES).map(([name, { root, folder }]) => {
    const evaluation = path.join(ROOT, root, folder);
    const result = planModule.readPlan(evaluation);
    if (result.absent) assert.fail(`${name}: no plan was committed at ${root}/${folder}/ci/evaluation-ci-plan.json`);
    assert.deepEqual(result.findings, [], `${name}: the committed plan fails validation`);
    // The same validation `check` runs, through the real CLI.
    const checked = cli(evaluation, 'check');
    assert.equal(checked.status, 0, `${name}: ${checked.output}`);
    // evaluation.json names the tiers the plan uses.
    const evaluationJson = read(path.join(evaluation, 'evaluation.json'));
    assert.deepEqual(
      [...evaluationJson.tiers].sort(),
      [...new Set(result.plan.checks.map((item) => item.placement.tier))].sort(),
      `${name}: evaluation.json tiers differ from the plan's tiers`,
    );
    // The repository carries the Story 1.24 AI-feature evaluation: every file but the launch root, the tiers and the keys the stage sets.
    const source = path.join(ROOT, AI_FEATURE);
    for (const relative of [
      'contract.json',
      'requirements.md',
      'corpus-index.json',
      'evaluator/mapping.json',
      'policy/scoring-policy.json',
    ]) {
      assert.deepEqual(
        fs.readFileSync(path.join(evaluation, relative)),
        fs.readFileSync(path.join(source, relative)),
        `${name}: ${relative} differs from the AI-feature evaluation`,
      );
    }
    for (const directory of ['probes', 'mutations']) {
      assert.deepEqual(
        fs.readdirSync(path.join(evaluation, directory)).sort(),
        fs.readdirSync(path.join(source, directory)).sort(),
        `${name}: ${directory}`,
      );
    }
    const strip = (value) => {
      const copy = structuredClone(value);
      delete copy.tiers;
      delete copy.launch;
      for (const entry of copy.registry) delete entry.server?.environmentKeys;
      return copy;
    };
    assert.deepEqual(
      strip(evaluationJson),
      strip(read(path.join(source, 'evaluation.json'))),
      `${name}: evaluation.json differs from the AI-feature evaluation beyond tiers, launch and keys`,
    );
    assert.equal(evaluationJson.launch.root, '../../app', `${name}: the evaluation launches the repository's own app`);
    assert.ok(fs.existsSync(path.join(ROOT, root, 'app', 'server', 'grade.mjs')), `${name}: the app is missing`);
    // The plan is what a live session wrote against the guide committed now: the record holds the digests it read and left.
    const repository = loadRepository(root);
    assert.deepEqual(
      captureProblems(name, read(path.join(ROOT, root, 'capture-record.json')), repository.bytes),
      [],
      `${name}: the capture record`,
    );
    return { name, folder, repository, plan: result.plan, required: requiredChecks(evaluation) };
  });

  // The committed plans are complete, their events exist, and every file a reason names is real.
  for (const side of loaded) {
    assert.deepEqual(repositoryFactProblems(side.name, side.repository, expectations[side.name]), [], `${side.name}: repository facts`);
    assert.deepEqual(
      planProblems(side.name, side.plan, side.repository, side.required, side.folder),
      [],
      `${side.name}: the committed plan`,
    );
    const tiers = new Set(
      side.plan.checks
        .filter((item) => planModule.LIVE_CHECKS.includes(item.id) && item.placement.tier !== 'merge')
        .map((item) => item.placement.tier),
    );
    assert.deepEqual([...tiers].sort(), [...expectations[side.name].liveTiers].sort(), `${side.name}: the tiers that hold its live checks`);
  }
  assert.deepEqual(planDifferences(loaded), [], 'the committed plans do not differ as the inspection of their repositories requires');

  // Revert cases on synthetic plans for each side, so no case rests on committed data or on one side only.
  const [tagged, nightly] = loaded;
  const taggedFile = '.github/workflows/release.yml';
  const nightlyFile = '.github/workflows/nightly.yml';
  const synthetic = () => [
    { ...tagged, plan: syntheticPlan(['release'], taggedFile) },
    { ...nightly, plan: syntheticPlan(['scheduled', 'release'], nightlyFile) },
  ];
  assert.deepEqual(planDifferences(synthetic()), [], 'the synthetic pair does not differ');
  // 1. A stage that writes the same placements for both repositories.
  const identical = synthetic();
  identical[1] = { ...identical[1], plan: structuredClone(identical[0].plan) };
  assert.ok(planDifferences(identical).includes('the two plans place every live check alike'), 'identical placements passed');
  // 2. A differing placement whose reason cites nothing, a file of the other repository, only a generic file or a file that does not exist, on each side.
  const otherFile = [nightlyFile, taggedFile];
  const citations = {
    nothing: () => 'a reason that cites nothing',
    'the other repository': (side) => `${otherFile[side]} gives the event of this tier`,
    'only package.json': () => 'package.json gives the event of this tier',
    'only README.md': () => 'README.md gives the event of this tier',
    'only a file both repositories hold': () => '.github/workflows/ci.yml gives the event of this tier',
    'a missing release note': () => 'RELEASE-NOTES.txt gives the event of this tier',
    'a file that does not exist': () => '.github/workflows/missing.yml gives the event of this tier',
  };
  for (const [label, reason] of Object.entries(citations)) {
    for (const side of [0, 1]) {
      const sides = synthetic();
      for (const item of sides[side].plan.checks) item.placement.reason = reason(side);
      assert.ok(
        planDifferences(sides).some((problem) => problem.includes('cites no pipeline')),
        `side ${side}: a reason that cites ${label} passed the difference assertion`,
      );
    }
  }
  // 3. Checks dropped from a plan, each by a case of its own.
  for (const [label, drop] of [
    ['gameability', 'gameability'],
    ['oracle-agreement', 'oracle-agreement'],
    ['held-out', 'held-out'],
    ['replay', 'replay'],
    ['api-conformance', 'api-conformance'],
    ['strength-comparison', 'strength-comparison'],
    ['compile', 'compile'],
  ]) {
    for (const side of [0, 1]) {
      const sides = synthetic();
      sides[side].plan.checks = sides[side].plan.checks.filter((item) => item.id !== drop);
      const found = planProblems(sides[side].name, sides[side].plan, sides[side].repository, sides[side].required);
      assert.ok(
        found.includes(`${sides[side].name}: the plan drops ${label}`),
        `side ${side}: dropping ${label} passed: ${JSON.stringify(found)}`,
      );
    }
  }
  // A reason that names a real file beside one the repository lacks fails the plan, on each side.
  for (const side of [0, 1]) {
    const sides = synthetic();
    sides[side].plan.checks[0].placement.reason += ' See .github/workflows/missing.yml.';
    const found = planProblems(sides[side].name, sides[side].plan, sides[side].repository, sides[side].required);
    assert.ok(
      found.some((problem) => problem.includes('cites .github/workflows/missing.yml, which the repository does not hold')),
      `side ${side}: a reason citing a missing file passed: ${JSON.stringify(found)}`,
    );
  }
  const reduced = synthetic()[0];
  reduced.plan.checks = reduced.plan.checks.filter((item) => item.placement.tier === 'pr' || item.id === 'preflight-live');
  assert.ok(
    planProblems(reduced.name, reduced.plan, reduced.repository, reduced.required).some((problem) =>
      problem.includes('is missing from the release tier'),
    ),
    'a plan cut to the pr checks and a live preflight passed',
  );
  // 4. A tier whose event the repository does not have.
  const noSchedule = synthetic()[0];
  noSchedule.plan = syntheticPlan(['scheduled', 'release'], taggedFile);
  assert.ok(
    planProblems(noSchedule.name, noSchedule.plan, noSchedule.repository, noSchedule.required).some((problem) =>
      problem.includes('without a schedule'),
    ),
    'a scheduled tier without a schedule passed',
  );
  // 5. The repository facts the reasons rely on, changed one at a time.
  const changed = (side, edit) => {
    const repository = { ...side.repository, files: new Map(side.repository.files) };
    edit(repository.files);
    return repository;
  };
  const nightlyCi = '.github/workflows/ci.yml';
  for (const [label, side, edit, name] of [
    [
      'merge_group removed from nightly',
      nightly,
      (files) => files.set(nightlyCi, files.get(nightlyCi).replace('merge_group:', 'workflow_dispatch:')),
      'nightly-deploy',
    ],
    ['merge_group added to tagged', tagged, (files) => files.set(nightlyCi, `${files.get(nightlyCi)}\n  merge_group:\n`), 'tagged-release'],
    ['CONTRIBUTING.md removed from tagged', tagged, (files) => files.delete('CONTRIBUTING.md'), 'tagged-release'],
    ['RELEASING.md removed from tagged', tagged, (files) => files.delete('docs/RELEASING.md'), 'tagged-release'],
    ['DEPLOYING.md removed from nightly', nightly, (files) => files.delete('docs/DEPLOYING.md'), 'nightly-deploy'],
    ['schedule added to tagged', tagged, (files) => files.set(nightlyCi, `on:\n  schedule:\n    - cron: '0 0 * * *'\n`), 'tagged-release'],
    [
      'the tag trigger of the release workflow replaced by a manual dispatch',
      tagged,
      (files) =>
        files.set('.github/workflows/release.yml', files.get('.github/workflows/release.yml').replace(/tags:.*\n/, 'workflow_dispatch:\n')),
      'tagged-release',
    ],
    [
      'the release workflow triggered by pull requests',
      tagged,
      (files) => files.set('.github/workflows/release.yml', 'on:\n  pull_request:\njobs: {}\n'),
      'tagged-release',
    ],
    [
      'the schedule removed from the nightly workflow',
      nightly,
      (files) =>
        files.set('.github/workflows/nightly.yml', files.get('.github/workflows/nightly.yml').replace(/schedule:\n\s+- cron:.*\n/, '')),
      'nightly-deploy',
    ],
    [
      'the deploy workflow triggered by the nightly run',
      nightly,
      (files) =>
        files.set(
          '.github/workflows/deploy.yml',
          files.get('.github/workflows/deploy.yml').replace(/schedule:\n\s+- cron:.*\n/, 'workflow_run:\n    workflows: [nightly]\n'),
        ),
      'nightly-deploy',
    ],
    [
      'the deploy note says it waits for the nightly run',
      nightly,
      (files) =>
        files.set(
          'docs/DEPLOYING.md',
          files.get('docs/DEPLOYING.md').replace('The two workflows are independent', 'The deploy waits for the nightly run'),
        ),
      'nightly-deploy',
    ],
    [
      'the release note says a scheduled job exists',
      tagged,
      (files) => files.set('docs/RELEASING.md', files.get('docs/RELEASING.md').replace('no scheduled job', 'a scheduled job')),
      'tagged-release',
    ],
    [
      'the nightly contributing note says there is no merge queue',
      nightly,
      (files) =>
        files.set('CONTRIBUTING.md', files.get('CONTRIBUTING.md').replace('Merges go through the merge queue', 'There is no merge queue')),
      'nightly-deploy',
    ],
    [
      'the model key moved to the tagged release workflow',
      tagged,
      (files) => files.set('.github/workflows/release.yml', `${files.get('.github/workflows/release.yml')}\n        GRADER_MODEL_KEY: x\n`),
      'tagged-release',
    ],
  ]) {
    const repository = changed(side, edit);
    assert.ok(repositoryFactProblems(name, repository, expectations[name]).length > 0, `${label} passed the repository facts`);
  }
  // 6. The capture record: a plan edited by hand, a record that drops what it digests, and a repository file changed since the session.
  for (const side of loaded) {
    const record = read(path.join(ROOT, side.repository.root, 'capture-record.json'));
    const planKey = 'evals/answer-grade/ci/evaluation-ci-plan.json';
    const edited = new Map(side.repository.bytes);
    edited.set(planKey, Buffer.from(`${edited.get(planKey)} `));
    assert.ok(
      captureProblems(side.name, record, edited).some((problem) => problem.includes('is not the file the live session wrote')),
      `${side.name}: an edited plan passed`,
    );
    const unrecorded = structuredClone(record);
    delete unrecorded.wrote[planKey];
    assert.ok(
      captureProblems(side.name, unrecorded, edited).some((problem) => problem.includes('wrote names')),
      `${side.name}: an edited plan with its digest deleted passed`,
    );
    const emptied = structuredClone(record);
    emptied.sessionRead = {};
    assert.ok(
      captureProblems(side.name, emptied, side.repository.bytes).some((problem) => problem.includes('sessionRead names')),
      `${side.name}: an emptied sessionRead passed`,
    );
    const blank = structuredClone(record);
    blank.sessionRead['references/ci.md'] = '';
    assert.ok(
      captureProblems(side.name, blank, side.repository.bytes).some((problem) => problem.includes('holds no digest')),
      `${side.name}: an empty digest passed`,
    );
    const changedRepository = new Map(side.repository.bytes);
    changedRepository.set('CONTRIBUTING.md', Buffer.from(`${changedRepository.get('CONTRIBUTING.md')} Changed.`));
    assert.ok(
      captureProblems(side.name, record, changedRepository).some((problem) => problem.includes('a repository file changed')),
      `${side.name}: a changed repository file passed`,
    );
    const undigested = structuredClone(record);
    delete undigested.repositoryRead;
    assert.ok(
      captureProblems(side.name, undigested, side.repository.bytes).some((problem) => problem.includes('digests no repository file')),
      `${side.name}: a record without a repository digest passed`,
    );
  }
  // 7. A committed plan entry that drifts from the shape of the template.
  for (const [label, drift] of [
    ['a dropped --tier argument', (entry) => (entry.command = entry.command.slice(0, 4))],
    ['evidence of another check', (entry) => (entry.evidence = ['runs/<invocationId>/checks/other/stdout'])],
    ['another folder', (entry) => (entry.command = [...entry.command.slice(0, 3), 'evals/other', ...entry.command.slice(4)])],
    ['a trigger from another tier', (entry) => (entry.trigger = ['pull-request'])],
  ]) {
    for (const side of loaded) {
      const plan = structuredClone(side.plan);
      drift(plan.checks.find((item) => item.id === 'twin-run' && item.placement.tier !== 'pr'));
      assert.ok(planProblems(side.name, plan, side.repository, side.required, side.folder).length > 0, `${side.name}: ${label} passed`);
    }
  }
}

/**
 * The Story 2.4 capture-record guard (Story 1.103). Each `wrote` digest is the one a live session produced. A session that ran before
 * `evaluation.json` moved to schema 2, or before Story 1.98 repaired it, declares each migration, and the guard rebuilds its bytes by
 * reversing them; the committed sessions of Story 1.96 ran after both moves and declare none, so the cases hold the record such an older session leaves, built from the
 * committed one. Every case below is a record or a tree that the guard has to refuse by the problem it names; a guard that read the
 * entry's shape alone, or compared nothing, passes the cases it names a mutant of.
 */
function checkCaptureRecordGuard() {
  for (const [name, { root }] of Object.entries(REPOSITORIES)) {
    const committed = read(path.join(ROOT, root, 'capture-record.json'));
    const { bytes } = loadRepository(root);
    assert.deepEqual(captureProblems(name, committed, bytes), [], `${name}: the committed record fails its own guard`);
    // The committed sessions (Story 1.96) ran on the tree Story 1.98 repaired, so they wrote the file as it stands and declare no
    // migration. The cases below hold the record a session that ran before Story 1.42 would have left: its `wrote` digest is that
    // of the schema 1 bytes, rebuilt here by reversing both migrations, and its `migrations` entries declare both moves.
    assert.equal(
      committed.migrations,
      undefined,
      `${name}: the committed record declares a migration, and its session wrote the file as it stands`,
    );
    const evaluationBytes = bytes.get(EVALUATION_FILE);
    const preRepairBytes = reverseStory98Migration(evaluationBytes);
    assert.notEqual(preRepairBytes, null, `${name}: the committed evaluation.json does not carry the Story 1.98 repair`);
    const sessionBytes = reverseSchema2Migration(preRepairBytes, declaredPairs(bytes));
    assert.notEqual(sessionBytes, null, `${name}: the committed evaluation.json is not a schema 2 file with nested phases`);
    const record = {
      ...structuredClone(committed),
      wrote: { ...committed.wrote, [EVALUATION_FILE]: sha(sessionBytes) },
      migrations: [
        { file: EVALUATION_FILE, story: '1.42', change: 'schemaVersion 1 to 2 and operationPhases keyed by interface' },
        {
          file: EVALUATION_FILE,
          story: '1.98',
          change: 'strengthFloor loses its zero-action floor and heldOutProbes gains the gameability probe P-015',
        },
      ],
    };
    assert.deepEqual(captureProblems(name, record, bytes), [], `${name}: the migrated record fails its own guard`);
    const wrongDigest = `sha256:${'0'.repeat(64)}`;
    const planKey = 'evals/answer-grade/ci/evaluation-ci-plan.json';
    const withMigrations = (migrations) => ({ ...structuredClone(record), migrations });
    const withEvaluation = (text) => new Map([...bytes, [EVALUATION_FILE, Buffer.from(text)]]);
    const evaluationText = evaluationBytes.toString('utf8');
    const evaluationValue = JSON.parse(evaluationText);
    const serialized = (value) => `${JSON.stringify(value, null, 2)}\n`;
    // The contract of the tree with one more interface, a copy of its first under `interfaceId` with `operationId` in place of its operation.
    const withInterface = (tree, interfaceId, operationId = null) => {
      const contract = JSON.parse(tree.get(CONTRACT_FILE).toString('utf8'));
      const added = structuredClone(contract.permittedInterfaces[0]);
      added.logicalId = interfaceId;
      if (operationId !== null) added.operations[0].operationId = operationId;
      contract.permittedInterfaces.push(added);
      return new Map([...tree, [CONTRACT_FILE, Buffer.from(serialized(contract))]]);
    };
    const cases = [
      [
        'a migration entry that names a false from digest',
        withMigrations(record.migrations.map((migration) => ({ ...migration, from: wrongDigest }))),
        bytes,
        'which the rebuilt bytes are the only authority for',
      ],
      [
        'a migration entry that names a false to digest',
        withMigrations(record.migrations.map((migration) => ({ ...migration, to: wrongDigest }))),
        bytes,
        'which the rebuilt bytes are the only authority for',
      ],
      [
        'a wrote digest retyped to the migrated file as it stands',
        { ...structuredClone(record), wrote: { ...record.wrote, [EVALUATION_FILE]: sha(evaluationBytes) } },
        bytes,
        'is not the file the live session wrote',
      ],
      [
        'a record with no migrations entry',
        (({ migrations: _migrations, ...rest }) => rest)(structuredClone(record)),
        bytes,
        'is not the file the live session wrote',
      ],
      ['a record with an empty migrations list', withMigrations([]), bytes, 'is not the file the live session wrote'],
      [
        'both migrations declared by a session that wrote the file as it stands',
        { ...structuredClone(committed), migrations: record.migrations },
        bytes,
        'is not the file the live session wrote',
      ],
      [
        'the Story 1.98 migration declared by a session that ran after the repair',
        { ...structuredClone(committed), migrations: [record.migrations[1]] },
        bytes,
        'is not the file the live session wrote',
      ],
      [
        'an evaluation.json whose tiers changed beyond the declared migration',
        record,
        withEvaluation(evaluationText.replace('"pr"', '"merge"')),
        'is not the file the live session wrote',
      ],
      [
        'an evaluation.json with a byte appended beyond the declared migration',
        record,
        withEvaluation(`${evaluationText} `),
        'declared migration could have produced',
      ],
      [
        'an evaluation.json whose operationPhases changed beyond the declared migration',
        record,
        withEvaluation(evaluationText.replace(/"(?:process|outcome)"/, (phase) => (phase === '"process"' ? '"outcome"' : '"process"'))),
        'is not the file the live session wrote',
      ],
      [
        'a migrated file that claims schema 1 beside its nested phases',
        record,
        withEvaluation(serialized({ ...evaluationValue, schemaVersion: 1 })),
        'declared migration could have produced',
      ],
      [
        'a migrated file that reuses an operation ID across two interfaces, which no flat map could have held',
        record,
        withInterface(
          withEvaluation(
            serialized({
              ...evaluationValue,
              registry: [...evaluationValue.registry, { ...structuredClone(evaluationValue.registry[0]), interfaceId: 'second-interface' }],
              operationPhases: {
                ...evaluationValue.operationPhases,
                'second-interface': structuredClone(Object.values(evaluationValue.operationPhases)[0]),
              },
            }),
          ),
          'second-interface',
        ),
        'declared migration could have produced',
      ],
      [
        'a declared migration over a file that was never migrated',
        record,
        new Map([...bytes, [EVALUATION_FILE, reverseSchema2Migration(evaluationBytes, declaredPairs(bytes))]]),
        'declared migration could have produced',
      ],
      [
        'a migration of a file the tests do not know',
        withMigrations([...record.migrations, { file: planKey, story: '1.42', change: 'none' }]),
        bytes,
        'the tests do not know',
      ],
      [
        'a migration declared twice',
        withMigrations([...record.migrations, ...record.migrations]),
        bytes,
        `declares the migration of ${EVALUATION_FILE} twice`,
      ],
      [
        'a Story 1.98 migration declared twice',
        withMigrations([...record.migrations, record.migrations.at(-1)]),
        bytes,
        `declares the migration of ${EVALUATION_FILE} twice`,
      ],
      [
        'a Story 1.98 migration over an evaluation.json that never carried the repair',
        record,
        new Map([...bytes, [EVALUATION_FILE, preRepairBytes]]),
        'declared migration could have produced',
      ],
      [
        'a Story 1.98 migration over an evaluation.json that declares the zero-action floor beside the held-out gameability probe',
        record,
        withEvaluation(serialized({ ...evaluationValue, strengthFloor: { defect: 1, 'zero-action': 1, gameability: 1 } })),
        'declared migration could have produced',
      ],
      [
        'an evaluation.json whose floors changed beyond the Story 1.98 repair',
        record,
        withEvaluation(serialized({ ...evaluationValue, strengthFloor: { ...evaluationValue.strengthFloor, gameability: 2 } })),
        'is not the file the live session wrote',
      ],
      [
        'an evaluation.json whose held-out probes changed beyond the Story 1.98 repair',
        record,
        withEvaluation(serialized({ ...evaluationValue, heldOutProbes: evaluationValue.heldOutProbes.filter((id) => id !== 'P-011') })),
        'is not the file the live session wrote',
      ],
      [
        'a migration credited to another story',
        withMigrations(record.migrations.map((migration) => ({ ...migration, story: '1.43' }))),
        bytes,
        'the tests do not know',
      ],
      [
        'a migrated file whose phases are keyed under an interface its registry never declared',
        record,
        // The contract declares the ghost interface, so only the registry can refuse it.
        withInterface(
          withEvaluation(
            serialized({ ...evaluationValue, operationPhases: { 'ghost-interface': Object.values(evaluationValue.operationPhases)[0] } }),
          ),
          'ghost-interface',
        ),
        'declared migration could have produced',
      ],
    ];
    for (const [label, candidate, tree, expected] of cases) {
      const problems = captureProblems(name, candidate, tree);
      assert.ok(
        problems.some((problem) => problem.includes(expected)),
        `${name}: ${label} did not fail with "${expected}"; the guard said ${JSON.stringify(problems)}`,
      );
    }
    // An operation moved between two interfaces the file declares rebuilds the same flat bytes, since the flat map keeps no
    // interface: the pair has to be one the contract declares. The honest file and the moved one flatten alike.
    const [operationId, phase] = Object.entries(Object.values(evaluationValue.operationPhases)[0])[0];
    const [interfaceId] = Object.keys(evaluationValue.operationPhases);
    const twoInterfaces = (phases) =>
      withInterface(
        withEvaluation(
          serialized({
            ...evaluationValue,
            registry: [...evaluationValue.registry, { ...structuredClone(evaluationValue.registry[0]), interfaceId: 'second-interface' }],
            operationPhases: phases,
          }),
        ),
        'second-interface',
        'second-operation',
      );
    const honestPhases = { [interfaceId]: { [operationId]: phase }, 'second-interface': { 'second-operation': 'process' } };
    const movedPhases = { [interfaceId]: { [operationId]: phase, 'second-operation': 'process' }, 'second-interface': {} };
    const preRepairValue = JSON.parse(preRepairBytes.toString('utf8'));
    const flatBytes = Buffer.from(
      serialized({
        ...preRepairValue,
        schemaVersion: 1,
        registry: [...evaluationValue.registry, { ...structuredClone(evaluationValue.registry[0]), interfaceId: 'second-interface' }],
        operationPhases: { [operationId]: phase, 'second-operation': 'process' },
      }),
    );
    const sessionRecord = { ...structuredClone(record), wrote: { ...record.wrote, [EVALUATION_FILE]: sha(flatBytes) } };
    const rewritten = (problems) =>
      problems.filter((problem) => problem.includes('could have produced') || problem.includes('is not the file'));
    assert.deepEqual(
      rewritten(captureProblems(name, sessionRecord, twoInterfaces(honestPhases))),
      [],
      `${name}: the honest two-interface file was refused`,
    );
    assert.ok(
      rewritten(captureProblems(name, sessionRecord, twoInterfaces(movedPhases))).some((problem) =>
        problem.includes('could have produced'),
      ),
      `${name}: an operation moved to another declared interface, keeping order, was accepted`,
    );
  }
}

/**
 * The holds of `test/lib/scratch-directories.js` (Story 1.103): the reaper of dead processes' private parents leaves a parent
 * a live suite holds, and a hold whose text names no live positive process id holds nothing.
 */
function checkScratchHolds() {
  const uid = process.getuid();
  const holdsName = `tea-evaluate-test-holds-p${uid}`;
  const gonePid = () => spawnSync(process.execPath, ['-e', ''], { encoding: 'utf8' }).pid;
  const gone = gonePid();
  for (const [text, expected] of [
    [String(process.pid), true],
    ['', false],
    ['0', false],
    ['-1', false],
    ['x', false],
    ['1.5', false],
    [String(gone), false],
  ])
    assert.equal(liveHolder(text), expected, `a hold reading ${JSON.stringify(text)} is ${expected ? 'live' : 'no hold'}`);
  const library = path.join(__dirname, 'lib', 'scratch-directories.js');
  const reapIn = (base) => `require(${JSON.stringify(library)}).removeDeadPrivateParents(${JSON.stringify(base)})`;
  const privateRootOf = (base) => {
    const root = path.join(base, `tea-evaluate-p${uid}`);
    fs.mkdirSync(root, { mode: 0o700 });
    return root;
  };

  const base = scratch.make('holds-base');
  const root = privateRootOf(base);
  const holds = path.join(base, holdsName);
  const second = gonePid();
  const third = gonePid();
  const unplanted = gonePid();
  const deadHolder = gonePid();
  holdPrivateParents(gone, base);
  for (const owner of [gone, second, third]) fs.mkdirSync(path.join(root, `run-${owner}-planted`));
  // A hold left by a suite that is gone holds nothing, and the reaper removes it whether or not a parent is named for it; so do
  // an empty hold (a hold is written whole, so it is not a write in progress), a staged file of a gone suite and a stray file.
  fs.writeFileSync(path.join(holds, String(third)), String(second));
  fs.writeFileSync(path.join(holds, String(unplanted)), String(deadHolder));
  fs.writeFileSync(path.join(holds, String(second)), '');
  fs.writeFileSync(path.join(holds, `${unplanted}.${deadHolder}.tmp`), String(deadHolder));
  fs.writeFileSync(path.join(holds, `${unplanted}.${process.pid}.tmp`), String(process.pid));
  fs.writeFileSync(path.join(holds, 'stray.txt'), 'x');
  removeDeadPrivateParents(base);
  assert.deepEqual(fs.readdirSync(root).sort(), [`run-${gone}-planted`], 'the reaper removed a held parent or kept an unheld one');
  assert.deepEqual(
    fs.readdirSync(holds).sort(),
    [`${unplanted}.${process.pid}.tmp`, String(gone)].sort(),
    'the reaper kept a hold of a gone suite, an empty hold, a staged file of a gone suite or a stray file, or removed a live one',
  );
  fs.rmSync(path.join(holds, `${unplanted}.${process.pid}.tmp`));
  // A reaper this suite started reaps what the suite holds, the cycle a holding case waits on. One that a started process
  // started in turn does not: it is another suite's reaper as far as the hold goes.
  const grandchild = spawnSync(
    process.execPath,
    ['-e', `require('node:child_process').execFileSync(process.execPath, ['-e', ${JSON.stringify(reapIn(base))}])`],
    { encoding: 'utf8' },
  );
  assert.equal(grandchild.status, 0, grandchild.stderr);
  assert.deepEqual(fs.readdirSync(root), [`run-${gone}-planted`], 'a reaper two processes down removed a parent the suite holds');
  const child = spawnSync(process.execPath, ['-e', reapIn(base)], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(fs.readdirSync(root), [], "the suite's own reaper left the parent the suite holds");
  fs.mkdirSync(path.join(root, `run-${gone}-again`));
  removeDeadPrivateParents(base);
  assert.deepEqual(fs.readdirSync(root), [`run-${gone}-again`], 'the holding process itself removed a parent it holds');

  // A release removes only a hold that still names this process.
  const guarded = gonePid();
  holdPrivateParents(guarded, base);
  fs.writeFileSync(path.join(holds, String(guarded)), String(process.ppid));
  releasePrivateParents();
  assert.equal(
    fs.readFileSync(path.join(holds, String(guarded)), 'utf8'),
    String(process.ppid),
    'a release removed a hold another process holds',
  );
  assert.equal(fs.existsSync(path.join(holds, String(gone))), false, 'a release kept a hold of this process');
  fs.rmSync(path.join(holds, String(guarded)));
  removeDeadPrivateParents(base);
  assert.deepEqual(fs.readdirSync(root), [], 'a released hold still kept its parent');

  // The holds directory is held to the private root's checks: a link is neither written through nor read.
  const linkedBase = scratch.make('holds-linked');
  const linkedRoot = privateRootOf(linkedBase);
  const elsewhere = scratch.make('holds-elsewhere');
  fs.symlinkSync(elsewhere, path.join(linkedBase, holdsName));
  assert.throws(() => holdPrivateParents(gone, linkedBase), /not a link/, 'a hold was written into a linked holds directory');
  assert.deepEqual(fs.readdirSync(elsewhere), [], 'a hold was written through the link');
  fs.mkdirSync(path.join(linkedRoot, `run-${gone}-linked`));
  // The hold behind the link names a gone suite, which holds nothing: a reaper that read it would remove the parent.
  fs.writeFileSync(path.join(elsewhere, String(gone)), String(gonePid()));
  removeDeadPrivateParents(linkedBase);
  assert.deepEqual(
    fs.readdirSync(linkedRoot),
    [`run-${gone}-linked`],
    'the reaper read holds through a linked holds directory, or reaped beside it',
  );

  // A hold that is not a regular file is never opened for reading: a FIFO would block the reaper for good.
  const fifoBase = scratch.make('holds-fifo');
  const fifoRoot = privateRootOf(fifoBase);
  const fifoHolds = path.join(fifoBase, holdsName);
  fs.mkdirSync(fifoHolds, { mode: 0o700 });
  assert.equal(spawnSync('mkfifo', [path.join(fifoHolds, String(gone))]).status, 0, 'mkfifo failed');
  fs.mkdirSync(path.join(fifoRoot, `run-${gone}-fifo`));
  const fifoReap = spawnSync(process.execPath, ['-e', reapIn(fifoBase)], { encoding: 'utf8', timeout: 20_000 });
  assert.equal(fifoReap.status, 0, `the reaper blocked or failed over a FIFO hold: ${fifoReap.error ?? fifoReap.stderr}`);
  assert.deepEqual(fs.readdirSync(fifoRoot), [], 'a FIFO hold held a parent');
  assert.equal(fs.lstatSync(path.join(fifoHolds, String(gone))).isFIFO(), true, 'the reaper removed a FIFO it does not own');

  // The staged file is made exclusively: a link planted at its name is replaced and never written through.
  const stagedBase = scratch.make('holds-staged');
  const victim = path.join(scratch.make('holds-victim'), 'victim');
  fs.writeFileSync(victim, 'keep');
  fs.mkdirSync(path.join(stagedBase, holdsName), { mode: 0o700 });
  fs.symlinkSync(victim, path.join(stagedBase, holdsName, `${gone}.${process.pid}.tmp`));
  holdPrivateParents(gone, stagedBase);
  assert.equal(fs.readFileSync(victim, 'utf8'), 'keep', 'a hold was written through a link planted at the staged name');
  assert.equal(fs.readFileSync(path.join(stagedBase, holdsName, String(gone)), 'utf8'), String(process.pid));
  releasePrivateParents();
}

// ---------------------------------------------------------------------------
// TeA's own pr tier (Story 2.5, AD-11, R2-06, R2-12)

/** The parsed `quality.yaml`, a fresh copy each call so a revert case edits its own. */
const qualityWorkflow = () => yaml.load(fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'quality.yaml'), 'utf8'));
const packageJson = () => read(path.join(ROOT, 'package.json'));
const chainJob = (workflow) => workflow.jobs.chain;
const uploadStep = (workflow) =>
  chainJob(workflow).steps.find(
    (step) =>
      typeof step.uses === 'string' &&
      step.uses.startsWith('actions/upload-artifact@') &&
      String(step.with?.name).startsWith('evaluate-runs'),
  );

/** A copy of an evaluation folder in a scratch directory (its plan and baseline, none of its runs), for a revert case to edit. */
function copyEvaluationFolder(entry, label) {
  const copy = path.join(scratch.make(label), entry.key);
  fs.cpSync(path.join(ROOT, entry.folder), copy, {
    recursive: true,
    filter: (file) => !['runs', 'node_modules'].includes(path.basename(file)),
  });
  return copy;
}

function expectProblem(problems, pattern, label) {
  assert.ok(
    problems.some((problem) => pattern.test(problem)),
    `${label}: no problem matches ${pattern}\n${JSON.stringify(problems)}`,
  );
}

function checkTeaPrTier() {
  const version = engineVersion();
  const entryOf = (key) => prTier.EVALUATIONS.find((candidate) => candidate.key === key);
  // The committed state: every evaluation's script, the chain, the upload, the eight gates' jobs and every folder at rest.
  assert.deepEqual(prTier.wiringProblems(packageJson()), []);
  assert.deepEqual(prTier.workflowProblems(qualityWorkflow()), []);
  for (const entry of prTier.EVALUATIONS)
    assert.deepEqual(prTier.folderProblems(path.join(ROOT, entry.folder), entry, version), [], entry.key);
  // The evaluations are the ones the story names, each listed once, and each folder is ignored by the fixture runs/ rule.
  assert.deepEqual(prTier.EVALUATIONS.map((entry) => entry.story).sort(), [
    '1.10',
    '1.11',
    '1.16',
    '1.18',
    '1.19',
    '1.20',
    '1.24',
    '1.24',
    '1.25',
    '1.26',
  ]);
  for (const entry of prTier.EVALUATIONS) {
    const ignored = spawnSync('git', ['check-ignore', '-q', `${entry.folder}/runs/probe/ci.json`], { cwd: ROOT });
    assert.equal(ignored.status, 0, `${entry.key}: ${entry.folder}/runs is not ignored, so a chained run would leave untracked files`);
  }
  assert.equal(new Set(prTier.EVALUATIONS.map((entry) => entry.key)).size, prTier.EVALUATIONS.length);
  assert.equal(new Set(prTier.EVALUATIONS.map((entry) => entry.folder)).size, prTier.EVALUATIONS.length);

  // The upload (R2-06): removing the step, its `always()`, an evaluation's path, the shard in its name, or letting an empty shard
  // fail the upload each fails.
  const uploadCases = [
    [
      'the upload step removed',
      (workflow) => (chainJob(workflow).steps = chainJob(workflow).steps.filter((step) => step !== uploadStep(workflow))),
      /no actions\/upload-artifact step named evaluate-runs-/,
    ],
    [
      'the upload moved to another job',
      (workflow) => {
        const step = uploadStep(workflow);
        chainJob(workflow).steps = chainJob(workflow).steps.filter((candidate) => candidate !== step);
        assert.ok(workflow.jobs.coverage, 'quality.yaml has no coverage job for the moved-upload case');
        workflow.jobs.coverage.steps.push(step);
      },
      /no actions\/upload-artifact step named evaluate-runs-/,
    ],
    ['the upload without if: always()', (workflow) => delete uploadStep(workflow).if, /must run if: always\(\)/],
    ['the upload on success only', (workflow) => (uploadStep(workflow).if = 'success()'), /must run if: always\(\)/],
    ['the upload name without the shard', (workflow) => (uploadStep(workflow).with.name = 'evaluate-runs'), /omits matrix\.shard/],
    [
      'the upload failing on a shard with no runs',
      (workflow) => (uploadStep(workflow).with['if-no-files-found'] = 'error'),
      /if-no-files-found: ignore/,
    ],
    ...prTier.EVALUATIONS.map((entry) => [
      `the upload path without ${entry.key}`,
      (workflow) => {
        const step = uploadStep(workflow);
        step.with.path = step.with.path
          .split('\n')
          .filter((line) => line.trim() !== `${entry.folder}/runs`)
          .join('\n');
      },
      new RegExp(`omits ${entry.folder.replaceAll('/', String.raw`\/`)}\\/runs`),
    ]),
    [
      'the upload path naming another directory',
      (workflow) => (uploadStep(workflow).with.path = uploadStep(workflow).with.path.replaceAll('/runs', '/out')),
      /omits test\/evaluations\/bmad-testarch-evaluate\/runs/,
    ],
  ];
  for (const [label, edit, pattern] of uploadCases) {
    const workflow = qualityWorkflow();
    edit(workflow);
    expectProblem(prTier.workflowProblems(workflow), pattern, label);
  }

  // The eight eval-quality-gates stay in their jobs: a gate step moved to another job, dropped, or added to the wrong job fails.
  for (const [job, scripts] of Object.entries(prTier.GATE_JOB_STEPS)) {
    for (const script of scripts) {
      const workflow = qualityWorkflow();
      workflow.jobs[job].steps = workflow.jobs[job].steps.filter((step) => step.run !== `npm run ${script}`);
      expectProblem(prTier.workflowProblems(workflow), new RegExp(`the ${job} job runs`), `${script} dropped from ${job}`);
    }
  }
  const moved = qualityWorkflow();
  const gateStep = moved.jobs['layering-boundary-lineage'].steps.find((step) => step.run === 'npm run test:direction');
  moved.jobs['layering-boundary-lineage'].steps = moved.jobs['layering-boundary-lineage'].steps.filter((step) => step !== gateStep);
  assert.ok(gateStep && moved.jobs.prettier, 'quality.yaml lost the layering gate step or the prettier job the move case uses');
  moved.jobs.prettier.steps.push(gateStep);
  expectProblem(prTier.workflowProblems(moved), /the layering-boundary-lineage job runs/, 'test:direction moved to the prettier job');

  // A gate switched off without leaving its job: an `if: false` or `continue-on-error: true` on the gate's step or on its job
  // keeps every `npm run` line and still stops the gate from failing the build (R2-12: the jobs stay unchanged).
  const gateStepOf = (workflow, job, script) => {
    const step = workflow.jobs[job].steps.find((candidate) => candidate.run === `npm run ${script}`);
    assert.ok(step, `quality.yaml lost ${script} in ${job}`);
    return step;
  };
  const switchedOffCases = [
    [
      'a gate step with if: false',
      (workflow) => (gateStepOf(workflow, 'supply-chain', 'test:licences').if = false),
      'supply-chain',
      /jobs\.supply-chain\.steps\[5\]\.if/,
    ],
    [
      'a gate step with continue-on-error',
      (workflow) => (gateStepOf(workflow, 'layering-boundary-lineage', 'test:direction')['continue-on-error'] = true),
      'layering-boundary-lineage',
      /jobs\.layering-boundary-lineage\.steps\[3\]\.continue-on-error/,
    ],
    [
      'a gate job with if: false',
      (workflow) => (workflow.jobs['supply-chain'].if = false),
      'supply-chain',
      /jobs\.supply-chain\.if \(added\)/,
    ],
    [
      'a gate job with continue-on-error',
      (workflow) => (workflow.jobs['layering-boundary-lineage']['continue-on-error'] = true),
      'layering-boundary-lineage',
      /jobs\.layering-boundary-lineage\.continue-on-error \(added\)/,
    ],
    [
      'a gate job that needs another job',
      (workflow) => (workflow.jobs['supply-chain'].needs = 'prettier'),
      'supply-chain',
      /jobs\.supply-chain\.needs \(added\)/,
    ],
  ];
  for (const [label, edit, job, where] of switchedOffCases) {
    const workflow = qualityWorkflow();
    edit(workflow);
    expectProblem(
      prTier.workflowProblems(workflow),
      new RegExp(`the ${job} job differs from its committed copy at ${where.source}`),
      label,
    );
  }

  // The wiring: a missing script, a script that runs another key, an evaluation out of the chain, a gate out of the chain.
  for (const entry of prTier.EVALUATIONS) {
    const script = prTier.scriptOf(entry);
    let value = packageJson();
    delete value.scripts[script];
    expectProblem(prTier.wiringProblems(value), new RegExp(`${script} is undefined`), `${script} deleted`);
    value = packageJson();
    value.scripts[script] = `node test/test-evaluate-pr-tier.js ${entry.key === 'mcp' ? 'api' : 'mcp'}`;
    expectProblem(prTier.wiringProblems(value), new RegExp(`${script} is`), `${script} runs another key`);
    value = packageJson();
    value.scripts.test = value.scripts.test.replace(` && npm run ${script}`, '');
    expectProblem(prTier.wiringProblems(value), new RegExp(`${script} is not in the npm test chain`), `${script} out of the chain`);
  }
  for (const { script } of prTier.GATES) {
    const value = packageJson();
    value.scripts.test = value.scripts.test.replace(` && npm run ${script}`, '');
    expectProblem(prTier.wiringProblems(value), new RegExp(`${script} left the npm test chain`), `${script} out of the chain`);
  }

  // The folders: a plan that drops the gameability arm or the port conformance, places a check the evaluation does not call for,
  // or carries a plan error; a baseline from another engine release, a dirty run, a git workspace, one partition, or none.
  const folderCases = [
    [
      'gameability dropped',
      'ai-feature',
      (folder) => editPlan(folder, (plan) => (plan.checks = plan.checks.filter((item) => item.id !== 'gameability'))),
      /the pr tier lacks gameability/,
    ],
    [
      'port conformance dropped',
      'ai-feature',
      (folder) => editPlan(folder, (plan) => (plan.checks = plan.checks.filter((item) => item.id !== 'api-conformance'))),
      /lacks api-conformance/,
    ],
    [
      'oracle agreement dropped',
      'mcp',
      (folder) => editPlan(folder, (plan) => (plan.checks = plan.checks.filter((item) => item.id !== 'oracle-agreement'))),
      /lacks oracle-agreement/,
    ],
    [
      'replay dropped',
      'mcp',
      (folder) => editPlan(folder, (plan) => (plan.checks = plan.checks.filter((item) => item.id !== 'replay'))),
      /lacks replay/,
    ],
    [
      'a gameability check with no gameability probe',
      'mcp',
      (folder) => editPlan(folder, (plan) => plan.checks.splice(3, 0, entryFor(plan, 'gameability'))),
      /places gameability, which this evaluation does not call for/,
    ],
    [
      'a plan copied from another evaluation',
      'mcp',
      (folder) =>
        editPlan(folder, (plan) => {
          for (const item of plan.checks) item.command = item.command.map((part) => part.replace('evaluate-mcp', 'evaluate-api'));
        }),
      /runs over "test\/fixtures\/evaluate-api\/evals\/grader", not test\/fixtures\/evaluate-mcp/,
    ],
    ['a plan error', 'workflow', (folder) => editPlan(folder, (plan) => (plan.checks[0].placement.tier = 'merge')), /plan tier:/],
    [
      'another engine release',
      'tool-use',
      (folder) => editBaseline(folder, 'baseline.json', (value) => (value.evalQualityVersion = '0.0.1')),
      /re-record it with compare --accept/,
    ],
    [
      'a dirty baseline run',
      'promptfoo',
      (folder) => editBaseline(folder, 'run.json', (value) => (value.dirty = true)),
      /records a dirty run/,
    ],
    [
      'an incomplete baseline run',
      'promptfoo',
      (folder) => editBaseline(folder, 'run.json', (value) => (value.completed = false)),
      /did not complete/,
    ],
    [
      'a git workspace baseline',
      'learn',
      (folder) => editBaseline(folder, 'run.json', (value) => (value.workspace.kind = 'git')),
      /copy workspace \(AD-8\)/,
    ],
    [
      'a fixture evaluation that declares a git workspace',
      'workflow',
      (folder) => {
        const file = path.join(folder, 'evaluation.json');
        const value = read(file);
        value.workspace.kind = 'git';
        write(file, value);
      },
      /evaluation\.json declares a git workspace/,
    ],
    [
      'one partition only',
      'gap-loop',
      (folder) => editBaseline(folder, 'baseline.json', (value) => (value.partition = 'held-out')),
      /not both/,
    ],
    [
      'another accepted run',
      'test-review',
      (folder) => editBaseline(folder, 'baseline.json', (value) => (value.acceptedRun = '20200101T000000000Z-00000000')),
      /names another run/,
    ],
    ['no baseline', 'api', (folder) => fs.rmSync(path.join(folder, 'baseline'), { recursive: true }), /no accepted baseline/],
    ['no plan', 'mcp', (folder) => fs.rmSync(path.join(folder, 'ci'), { recursive: true }), /evaluation-ci-plan\.json is absent/],
    [
      'a baseline where the suite has none yet',
      'suite',
      (folder) => {
        fs.mkdirSync(path.join(folder, 'baseline'));
        write(path.join(folder, 'baseline', 'baseline.json'), {});
      },
      /so the replay belongs in the pr tier/,
    ],
    [
      'a suite plan that drops the seal',
      'suite',
      (folder) => editPlan(folder, (plan) => (plan.checks = plan.checks.filter((item) => item.id !== 'seal'))),
      /lacks seal/,
    ],
  ];
  for (const [label, key, edit, pattern] of folderCases) {
    const entry = entryOf(key);
    const folder = copyEvaluationFolder(entry, `pr-tier-${key}`);
    edit(folder);
    expectProblem(prTier.folderProblems(folder, entry, version), pattern, label);
  }

  // The result: a non-zero exit, a check that did not run, a check that exited non-zero and a stale baseline each fail.
  const entry = entryOf('mcp');
  const folder = path.join(ROOT, entry.folder);
  const plan = planOf(folder);
  const good = { baseline: { stale: false, reasons: [] }, checks: plan.checks.map((item) => ({ id: item.id, exit: 0, class: 'pass' })) };
  assert.deepEqual(prTier.resultProblems(entry, 0, good, plan), []);
  expectProblem(prTier.resultProblems(entry, 11, good, plan), /exited 11/, 'a blocking exit');
  expectProblem(
    prTier.resultProblems(entry, 0, { ...good, checks: good.checks.slice(1) }, plan),
    /the checks that ran were/,
    'a check that did not run',
  );
  expectProblem(
    prTier.resultProblems(entry, 0, { ...good, checks: good.checks.map((row) => ({ ...row, exit: row.id === 'replay' ? 13 : 0 })) }, plan),
    /replay exited 13/,
    'a drifting replay',
  );
  expectProblem(
    prTier.resultProblems(entry, 0, { ...good, baseline: { stale: true, reasons: ['policy'] } }, plan),
    /the baseline is stale/,
    'a stale baseline',
  );
}

function editPlan(folder, edit) {
  const file = path.join(folder, PLAN);
  const value = read(file);
  edit(value);
  write(file, value);
}

function editBaseline(folder, name, edit) {
  const file = path.join(folder, 'baseline', name);
  const value = read(file);
  edit(value);
  write(file, value);
}

/** A `pr` entry of `id` shaped like the plan's others, for a case that adds a check. */
const entryFor = (plan, id) => ({ ...structuredClone(plan.checks[0]), id });

async function main() {
  const cases = [
    ['the committed plans and baselines', checkFixturePlans],
    ['the placement rules', checkPlacementRules],
    ['the derivable fields', checkDerivableFields],
    ['the gated jobs', checkGatedJobs],
    ['wiring', checkWiring],
    ['the AD-10 table', checkEnforcementTable],
    ['tier membership', checkTierMembership],
    ['static rules', checkStaticRules],
    ['gate checks', checkGates],
    ['gate limits', checkGateLimits],
    ['an interrupted gate', checkInterruptedGate],
    ['engine stage exits', checkEngineStageExits],
    ['the pr replay', checkPrReplay],
    ['the text neutralizer', checkTextNeutralizer],
    ['the ci run directory holds no machine path', checkCiRunHoldsNoMachinePath],
    ['the ci run directory after a failing port and a stale baseline', checkCiRunHoldsNoMachinePathOnFailure],
    ['the replay comparison set', checkReplayComparisonSet],
    ['a replay stage that exits 2', checkReplayStageExit],
    ['baseline integrity', checkBaselineIntegrity],
    ['baseline floors', checkBaselineFloors],
    ['a stale baseline on pr', checkStaleBaselineOnPr],
    ['the contract digest of a stale baseline', checkContractDigestOnPr],
    ['bad committed input', checkBadCommittedInput],
    ['an interrupted replay', checkInterruptedReplay],
    ['oracle agreement', checkOracleAgreement],
    ['the gameability arm', checkGameability],
    ['the fixture adopters', checkFixtureTiers],
    ['the pr tier of TeA itself', checkTeaPrTier],
    ['the committed live tiers', checkCommittedLiveTiers],
    ['the plans of two repositories', checkRepositoryPlans],
    ['the capture-record guard', checkCaptureRecordGuard],
    ['the scratch holds', checkScratchHolds],
    ['the live tiers', checkLiveTiers],
    ['the strength floor', checkStrengthFloors],
    ['a weak target', checkWeakProject],
    ['judge calibration', checkJudgeCalibration],
  ];
  const only = process.argv.find((argument) => argument.startsWith('--only='))?.slice('--only='.length);
  try {
    for (const [name, run] of cases) {
      if (only !== undefined && !name.includes(only)) continue;
      const started = Date.now();
      await run();
      process.stdout.write(`  ok ${name} (${Math.round((Date.now() - started) / 1000)}s)\n`);
    }
    process.stdout.write('Evaluate CI tiers passed.\n');
  } finally {
    live.cleanup();
    scratch.removeAll();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
