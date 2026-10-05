'use strict';

/**
 * TeA's own `pr` tier (Story 2.5, AD-11): the evaluations TeA keeps, the wiring that runs them in the `npm test` chain and in
 * the `chain` matrix of `.github/workflows/quality.yaml`, and the checks each run is held to.
 *
 * `test/test-evaluate-pr-tier.js <key>` is the chained script of one evaluation: it runs `tea-evaluate ci --tier pr` over the
 * committed folder and fails on the problems below. `test/test-evaluate-ci.js` holds the wiring (`wiringProblems`,
 * `workflowProblems`) and the folder rules (`folderProblems`) to a revert case each.
 */

const fs = require('node:fs');
const path = require('node:path');

const { planFindings } = require('../../cli/lib/evaluate/ci-plan');
const { planEntryShapeProblems } = require('./evaluate-plan-shape');

const ROOT = path.join(__dirname, '..', '..');

/** The values the fixture targets' own tests give their servers: the API and MCP fixtures check a bearer secret and a token. */
const GRADER_ENV = Object.freeze({ GRADER_SECRET: 'grader-secret-value-0123', GRADER_TOKEN: 'grader-token-value-4567' });

/**
 * Every evaluation TeA runs on `pr`, by the Story that added it. `baseline` is false for the Evaluate-authored suite: its
 * `check`, `compile` and `seal` run now, and its replay joins them when Story H.1 accepts the clean baseline.
 */
const EVALUATIONS = Object.freeze([
  { key: 'mcp', story: '1.10', folder: 'test/fixtures/evaluate-mcp/evals/grader', env: GRADER_ENV, baseline: true },
  { key: 'api', story: '1.11', folder: 'test/fixtures/evaluate-api/evals/grader', env: GRADER_ENV, baseline: true },
  { key: 'suite', story: '1.16', folder: 'test/evaluations/bmad-testarch-evaluate', env: {}, baseline: false },
  { key: 'workflow', story: '1.18', folder: 'test/fixtures/evaluate-workflow/evals/records', env: {}, baseline: true },
  { key: 'tool-use', story: '1.19', folder: 'test/fixtures/evaluate-tool-use-agent/evals/tool-use', env: {}, baseline: true },
  { key: 'promptfoo', story: '1.20', folder: 'test/fixtures/evaluate-promptfoo/evals/summary', env: {}, baseline: true },
  { key: 'ai-feature', story: '1.24', folder: 'test/fixtures/evaluate-authoring/ai-feature/evaluation', env: {}, baseline: true },
  { key: 'test-review', story: '1.24', folder: 'test/fixtures/evaluate-authoring/test-review/evaluation', env: {}, baseline: true },
  { key: 'gap-loop', story: '1.25', folder: 'test/fixtures/evaluate-gap-loop/after/evaluation', env: {}, baseline: true },
  { key: 'learn', story: '1.26', folder: 'test/fixtures/evaluate-learn/evaluation', env: {}, baseline: true },
]);

const scriptOf = (entry) => `test:evaluate-pr-${entry.key}`;
const commandOf = (entry) => `node test/test-evaluate-pr-tier.js ${entry.key}`;

/** The `eval-quality-gates` of `eval-quality.config.json`, the script that runs each, and the `quality.yaml` job that names it (`chain` alone for a gate only the shards run). */
const GATES = Object.freeze([
  { gate: 'lockfile-age', script: 'test:lockfile-age', job: 'supply-chain' },
  { gate: 'licences', script: 'test:licences', job: 'supply-chain' },
  { gate: 'dependency-direction', script: 'test:direction', job: 'layering-boundary-lineage' },
  { gate: 'package-boundary', script: 'test:boundary', job: 'layering-boundary-lineage' },
  { gate: 'field-ownership', script: 'test:lineage', job: 'layering-boundary-lineage' },
  { gate: 'doc-invocations', script: 'test:doc-invocations', job: 'chain' },
  { gate: 'doc-counts', script: 'test:doc-counts', job: 'chain' },
  { gate: 'doc-claims', script: 'test:doc-claims', job: 'chain' },
]);

/**
 * The two dedicated jobs of `quality.yaml` the eight gates sit in, frozen from the committed jobs at origin/main (Story 2.5
 * AC: the gates stay in their current jobs, unchanged). Every key of the job and of each step is held: `if`,
 * `continue-on-error`, `needs`, `runs-on`, `timeout-minutes`, `with` and the rest, so a gate switched off without leaving the
 * job fails the comparison as surely as a dropped step.
 */
const GATE_JOBS = Object.freeze({
  'supply-chain': {
    'runs-on': 'ubuntu-latest',
    'timeout-minutes': 20,
    steps: [
      { name: 'Checkout', uses: 'actions/checkout@v5', with: { 'persist-credentials': false } },
      { name: 'Setup Node', uses: 'actions/setup-node@v6', with: { 'node-version-file': '.nvmrc', cache: 'npm' } },
      { name: 'Install dependencies', run: 'npm ci' },
      { name: 'Audit both lockfiles for publication age', run: 'npm run test:lockfile-age' },
      { name: 'Prove the lockfile-age cache generator still reads the registry correctly', run: 'npm run test:lockfile-age-cache' },
      { name: 'Hold both lockfiles to the licence allowlist', run: 'npm run test:licences' },
      { name: 'Seed one violation per gate and watch it fail', run: 'npm run test:supply-chain' },
    ],
  },
  'layering-boundary-lineage': {
    'runs-on': 'ubuntu-latest',
    steps: [
      { name: 'Checkout', uses: 'actions/checkout@v5', with: { 'persist-credentials': false } },
      { name: 'Setup Node', uses: 'actions/setup-node@v6', with: { 'node-version-file': '.nvmrc', cache: 'npm' } },
      { name: 'Install dependencies', run: 'npm ci' },
      { name: 'Report import-direction violations over cli/, tools/, test/ and skills/**/*.cjs', run: 'npm run test:direction' },
      { name: 'Hold the published tree to the package boundary', run: 'npm run test:boundary' },
      { name: 'Hold schemaVersion to its two generators', run: 'npm run test:lineage' },
      {
        name: 'Seed a token-present, workflow-absent environment and watch the publish guard refuse it',
        run: 'npm run test:guard-publish',
      },
      { name: "Verify each gate's script name and seed one violation per failing gate", run: 'npm run test:layering-boundary-lineage' },
    ],
  },
});

/** The `npm run` scripts each dedicated gate job runs, in order, read from the frozen jobs. */
const GATE_JOB_STEPS = Object.freeze(Object.fromEntries(Object.entries(GATE_JOBS).map(([name, job]) => [name, npmRunsOf(job)])));

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

/** The scripts of `npm test`, in chain order. */
function chainOf(scripts) {
  return [...scripts.test.matchAll(/npm run ([\w:-]+)/g)].map((match) => match[1]);
}

/** The problems of `package.json`: each evaluation has its script, runs the driver with its key, and sits in the `npm test` chain. */
function wiringProblems(packageJson) {
  const problems = [];
  const chain = chainOf(packageJson.scripts);
  for (const entry of EVALUATIONS) {
    const script = scriptOf(entry);
    if (packageJson.scripts[script] !== commandOf(entry))
      problems.push(`${script} is ${JSON.stringify(packageJson.scripts[script])}, expected ${JSON.stringify(commandOf(entry))}`);
    if (!chain.includes(script)) problems.push(`${script} is not in the npm test chain, so the chain matrix never runs it`);
  }
  for (const { gate, script } of GATES) {
    if (!chain.includes(script)) problems.push(`the ${gate} gate script ${script} left the npm test chain`);
  }
  return problems;
}

/** The `npm run` scripts a job's steps run, in order. */
function npmRunsOf(job) {
  return (job?.steps ?? []).flatMap((step) => {
    const match = typeof step.run === 'string' ? /^npm run ([\w:-]+)\s*$/.exec(step.run.trim()) : null;
    return match ? [match[1]] : [];
  });
}

/** The path of the first difference between two parsed YAML values, or null when they are deeply equal (every key counts). */
function firstDifference(actual, expected, at) {
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) return at;
    if (actual.length !== expected.length) return `${at}.length (${actual.length}, expected ${expected.length})`;
    for (const [index, item] of expected.entries()) {
      const found = firstDifference(actual[index], item, `${at}[${index}]`);
      if (found !== null) return found;
    }
    return null;
  }
  if (expected !== null && typeof expected === 'object') {
    if (actual === null || typeof actual !== 'object') return at;
    for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
      if (!(key in expected)) return `${at}.${key} (added)`;
      if (!(key in actual)) return `${at}.${key} (removed)`;
      const found = firstDifference(actual[key], expected[key], `${at}.${key}`);
      if (found !== null) return found;
    }
    return null;
  }
  return Object.is(actual, expected) ? null : `${at} (${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`;
}

/**
 * The problems of the parsed `quality.yaml`: the `chain` job uploads the `runs/` directory of every evaluation from the shard
 * that ran it, whatever the shard's result, and the dedicated jobs of the eight `eval-quality-gates` keep their steps.
 */
function workflowProblems(workflow) {
  const problems = [];
  const jobs = workflow?.jobs ?? {};
  const chain = jobs.chain;
  if (chain === undefined) return ['quality.yaml has no chain job'];
  const upload = (chain.steps ?? []).find(
    (step) =>
      typeof step.uses === 'string' &&
      step.uses.startsWith('actions/upload-artifact@') &&
      String(step.with?.name ?? '').startsWith('evaluate-runs'),
  );
  if (upload === undefined) {
    problems.push('the chain job has no actions/upload-artifact step named evaluate-runs-*');
  } else {
    if (upload.if !== 'always()')
      problems.push(
        `the evaluate-runs upload runs on ${JSON.stringify(upload.if)}, so a red shard uploads nothing; it must run if: always()`,
      );
    if (!String(upload.with.name).includes('${{ matrix.shard }}'))
      problems.push('the evaluate-runs artifact name omits matrix.shard, so shards overwrite one another');
    if (upload.with['if-no-files-found'] !== 'ignore')
      problems.push(
        'the evaluate-runs upload must set if-no-files-found: ignore, since a shard that ran no evaluation has no runs/ directory',
      );
    const lines = new Set(
      String(upload.with.path ?? '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    );
    for (const entry of EVALUATIONS) {
      if (!lines.has(`${entry.folder}/runs`)) problems.push(`the evaluate-runs upload path omits ${entry.folder}/runs`);
    }
  }
  for (const [name, frozen] of Object.entries(GATE_JOBS)) {
    const actual = npmRunsOf(jobs[name]);
    const expected = GATE_JOB_STEPS[name];
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      problems.push(`the ${name} job runs ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
    const where = firstDifference(jobs[name], frozen, `jobs.${name}`);
    if (where !== null) problems.push(`the ${name} job differs from its committed copy at ${where}`);
  }
  return problems;
}

/** The ids of the checks a `pr` plan must carry for the evaluation in `folder`. */
function requiredChecks(folder, entry) {
  const ids = ['check', 'compile', 'seal'];
  if (!entry.baseline) return ids;
  if (read(path.join(folder, 'evaluation.json')).interface === 'api') ids.push('api-conformance');
  const probes = path.join(folder, 'probes');
  const gameability = fs
    .readdirSync(probes)
    .filter((name) => name.endsWith('.probe.json'))
    .some((name) => read(path.join(probes, name)).qualification?.route === 'gameability');
  if (gameability) ids.push('gameability');
  ids.push('oracle-agreement', 'replay');
  return ids;
}

/**
 * The problems of an evaluation folder at rest: its plan places the `pr` checks its probes and interface call for, and its
 * baseline holds a clean (`dirty` false), completed copy-workspace run of both partitions, recorded on the installed engine
 * release, that its manifest names as `acceptedRun`, in an evaluation whose `evaluation.json` declares the copy workspace.
 *
 * @param {string} folder the evaluation folder
 * @param {{key: string, baseline: boolean}} entry
 * @param {string} engineVersion the installed eval-quality release
 */
function folderProblems(folder, entry, engineVersion) {
  const problems = [];
  const planFile = path.join(folder, 'ci', 'evaluation-ci-plan.json');
  if (!fs.existsSync(planFile)) return [`${entry.key}: ${planFile} is absent`];
  const plan = read(planFile);
  for (const finding of planFindings(plan)) problems.push(`${entry.key}: plan ${finding.rule}: ${finding.message}`);
  for (const item of plan.checks) problems.push(...planEntryShapeProblems(item, entry.key));
  // A plan describes the folder it sits in: a copy of another evaluation's plan names that evaluation.
  for (const item of plan.checks) {
    const flag = item.command.indexOf('--evaluation');
    if (item.command[flag + 1] !== entry.folder)
      problems.push(`${entry.key}: ${item.id} runs over ${JSON.stringify(item.command[flag + 1])}, not ${entry.folder}`);
  }
  const placed = plan.checks.filter((item) => item.placement.tier === 'pr').map((item) => item.id);
  const required = requiredChecks(folder, entry);
  for (const id of required) if (!placed.includes(id)) problems.push(`${entry.key}: the pr tier lacks ${id}`);
  for (const id of placed)
    if (!required.includes(id)) problems.push(`${entry.key}: the pr tier places ${id}, which this evaluation does not call for`);
  const baseline = path.join(folder, 'baseline');
  if (!entry.baseline) {
    if (fs.existsSync(path.join(baseline, 'baseline.json')))
      problems.push(`${entry.key}: a baseline exists, so the replay belongs in the pr tier`);
    return problems;
  }
  let manifest;
  let accepted;
  try {
    manifest = read(path.join(baseline, 'baseline.json'));
    accepted = read(path.join(baseline, 'run.json'));
  } catch (error) {
    return [...problems, `${entry.key}: no accepted baseline (${error.code ?? error.message}); record one with compare --accept`];
  }
  if (manifest.evalQualityVersion !== engineVersion)
    problems.push(
      `${entry.key}: the baseline was recorded on eval-quality ${manifest.evalQualityVersion}, the installed release is ${engineVersion}; re-record it with compare --accept`,
    );
  if (accepted.dirty !== false) problems.push(`${entry.key}: the baseline records a dirty run`);
  if (accepted.completed !== true) problems.push(`${entry.key}: the baseline run did not complete`);
  const declared = read(path.join(folder, 'evaluation.json')).workspace?.kind;
  if (declared !== 'copy')
    problems.push(`${entry.key}: evaluation.json declares a ${declared} workspace; a fixture target declares a copy workspace (AD-8)`);
  if (accepted.workspace?.kind !== 'copy')
    problems.push(
      `${entry.key}: the baseline came from a ${accepted.workspace?.kind} workspace; a fixture target declares a copy workspace (AD-8)`,
    );
  if (accepted.invocationId !== manifest.acceptedRun)
    problems.push(`${entry.key}: the baseline manifest names another run than the one it holds`);
  if (manifest.partition !== 'both') problems.push(`${entry.key}: the baseline records the ${manifest.partition} partition, not both`);
  return problems;
}

/** The problems of one `ci --tier pr` result: its exit, the checks that ran, and a baseline that is not stale. */
function resultProblems(entry, status, ciJson, plan) {
  const problems = [];
  if (status !== 0) problems.push(`${entry.key}: ci --tier pr exited ${status}`);
  const expected = plan.checks.filter((item) => item.placement.tier === 'pr').map((item) => item.id);
  const ran = (ciJson.checks ?? []).map((row) => row.id);
  if (JSON.stringify(ran) !== JSON.stringify(expected))
    problems.push(`${entry.key}: the checks that ran were ${JSON.stringify(ran)}, the plan places ${JSON.stringify(expected)}`);
  for (const row of ciJson.checks ?? []) if (row.exit !== 0) problems.push(`${entry.key}: ${row.id} exited ${row.exit} (${row.class})`);
  if (entry.baseline && ciJson.baseline?.stale !== false)
    problems.push(`${entry.key}: the baseline is stale: ${JSON.stringify(ciJson.baseline?.reasons)}`);
  return problems;
}

module.exports = {
  EVALUATIONS,
  GATES,
  GATE_JOB_STEPS,
  GATE_JOBS,
  ROOT,
  commandOf,
  folderProblems,
  requiredChecks,
  resultProblems,
  scriptOf,
  wiringProblems,
  workflowProblems,
};
