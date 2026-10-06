'use strict';

/**
 * The two repositories of Story 2.4 pass the CI tiers their own plans place (Story 1.98). Each is the Story 1.24 AI-feature
 * evaluation in a repository with a workflow set, a committed plan and a committed baseline. A copy of each runs every tier
 * of its plan through the real CLI over real eval-quality: `pr` replays the baseline, and `merge`, `scheduled` and `release`
 * run the live checks against the repository's own app. Each tier exits 0 with no warning, so a red tier means a regression.
 *
 * What each repair of the story keeps from regressing, by the check that names it:
 *  - an oracle that disagrees with the evidence (a probe whose one mutation violates the oracles of two behaviors declares a
 *    defect for each, and the degenerate answer of P-009 matches the correct server on every step but the one it games):
 *    `oracle-agreement` on `pr`,
 *  - a floor for a class with no eligible probe (the zero-action floor is gone, and the held-out partition holds a
 *    gameability probe): `twin-run` and `held-out` on `scheduled` and `release`, whose strength aggregates are read here.
 *
 * It lives beside `test-evaluate-ci.js` and not in it because its live tiers are slow, and it runs one adopter x tier per
 * process so the CI shard planner can spread it: `--only=<adopter>:<tier>` runs exactly one tier of one repository, in a copy of
 * its own, and `--only=<adopter>` runs every tier of the adopter named. With no `--only` every tier of both runs, serially.
 * The package scripts `test:evaluate-ci-repositories:<adopter>-<tier>` are one process each, and each is weighted in
 * tools/test-shard-weights.json. A selector that selects nothing fails, so a misspelt one cannot pass. Every run holds the
 * adopter-level assertions (plan findings, manifest and accepted baseline, the tiers the plan places), so a selected tier still
 * fails when the plan places tiers the suite does not list. Before any tier runs, every invocation also holds `select` to its
 * contract and holds the seven package scripts to the suite's adopter x tier pairs (each script runs its pair, sits in the
 * `npm test` chain once and carries a shard weight), so a rewired, dropped or unweighted script fails in each of them.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { readPlan } = require('../cli/lib/evaluate/ci-plan');
const { engineVersion } = require('../cli/lib/evaluate/engine');
const baselines = require('./lib/evaluate-baseline');
const { scratchDirectories } = require('./lib/scratch-directories');

const ROOT = path.join(__dirname, '..');
const CLI = path.join(ROOT, 'cli', 'evaluate.js');
const REPOSITORIES = {
  'tagged-release': { root: 'test/fixtures/evaluate-ci-repos/tagged-release', tiers: ['pr', 'merge', 'release'] },
  'nightly-deploy': { root: 'test/fixtures/evaluate-ci-repos/nightly-deploy', tiers: ['pr', 'merge', 'scheduled', 'release'] },
};
const FOLDER = 'evals/answer-grade';
const ENV = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_') && name !== 'TEA_EVALUATE_ENGINE_CLI'),
);

const scratch = scratchDirectories('tea-evaluate-ci-repositories');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

/** A copy of a repository in a scratch directory, the packages its adapter imports linked into its evaluation folder; that folder. */
function copyRepository(name) {
  const directory = scratch.make(name);
  const repository = path.join(directory, name);
  fs.cpSync(path.join(ROOT, REPOSITORIES[name].root), repository, {
    recursive: true,
    filter: (file) => !['runs', 'node_modules'].includes(path.basename(file)),
  });
  const evaluation = path.join(repository, FOLDER);
  fs.mkdirSync(path.join(evaluation, 'node_modules'));
  fs.symlinkSync(path.join(ROOT, 'node_modules', 'eval-quality'), path.join(evaluation, 'node_modules', 'eval-quality'));
  fs.symlinkSync(ROOT, path.join(evaluation, 'node_modules', 'bmad-method-test-architecture-enterprise'));
  return evaluation;
}

/** `tea-evaluate ci --tier <tier>` through the CLI, and the `ci.json` of the invocation it left. */
function ci(evaluation, tier) {
  const run = spawnSync(process.execPath, [CLI, 'ci', '--evaluation', evaluation, '--tier', tier], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 600_000,
    env: ENV,
  });
  if (run.error) throw run.error;
  const runs = path.join(evaluation, 'runs');
  const invocation = fs
    .readdirSync(runs)
    .filter((entry) => fs.existsSync(path.join(runs, entry, 'ci.json')))
    .sort()
    .at(-1);
  return {
    status: run.status,
    output: `${run.stdout}${run.stderr}`,
    directory: path.join(runs, invocation),
    json: read(path.join(runs, invocation, 'ci.json')),
  };
}

/** The strength aggregate of the run a check's note names (`twin run: run <id>`, `held-out partition: run <id>`). */
function aggregateOf(evaluation, row, prefix) {
  const note = row.notes.find((line) => line.startsWith(`${prefix}: run `));
  assert.ok(note, `${row.id}: no note names its ${prefix} run: ${JSON.stringify(row.notes)}`);
  const scores = path.join(evaluation, 'runs', note.slice(`${prefix}: run `.length), 'scores');
  const [score] = fs.readdirSync(scores).sort().slice(-1);
  return read(path.join(scores, score, 'strength-aggregate.json'));
}

/** The floors of an aggregate as `class: decision` pairs. */
const decisions = (aggregate) => Object.fromEntries(Object.entries(aggregate.floorDecisions).map(([key, value]) => [key, value.decision]));

/** One tier of one adopter, in a copy of its own: the adopter-level assertions, then the tier's run and what it must hold. */
function checkTier(name, tier) {
  const evaluation = copyRepository(name);
  const plan = read(path.join(evaluation, 'ci', 'evaluation-ci-plan.json'));
  assert.deepEqual(readPlan(evaluation).findings, [], `${name}: the committed plan fails validation`);
  // The baseline came through `compare --accept` over a clean copy-workspace run on the installed engine release.
  const manifest = read(path.join(evaluation, 'baseline', 'baseline.json'));
  const accepted = read(path.join(evaluation, 'baseline', 'run.json'));
  assert.equal(
    manifest.evalQualityVersion,
    engineVersion(),
    `${name}: the baseline was recorded on another engine release; re-record it with compare --accept`,
  );
  assert.deepEqual(
    [accepted.dirty, accepted.completed, accepted.workspace.kind, manifest.partition],
    [false, true, 'copy', 'both'],
    `${name}: the baseline is not a clean copy-workspace run of both partitions`,
  );
  const planned = ['pr', 'merge', 'scheduled', 'release'].filter((item) => plan.checks.some((check) => check.placement.tier === item));
  assert.deepEqual(planned, REPOSITORIES[name].tiers, `${name}: the plan places other tiers than this suite runs`);
  const started = Date.now();
  const result = ci(evaluation, tier);
  assert.equal(result.status, 0, `${name} ${tier}: ci exited ${result.status}\n${result.output}`);
  const { json } = result;
  // The run directories the tier left (the ci invocation's and the live runs it made) name no path of this machine: `runs/` is uploaded as a CI artifact.
  for (const entry of fs.readdirSync(path.join(evaluation, 'runs')).filter((item) => !item.startsWith('.'))) {
    const hits = baselines.machinePathHits(path.join(evaluation, 'runs', entry));
    assert.deepEqual(hits, [], `${name} ${tier}: runs/${entry} names a path of this machine`);
  }
  assert.deepEqual(
    json.checks.map((row) => row.id),
    plan.checks.filter((item) => item.placement.tier === tier).map((item) => item.id),
    `${name} ${tier}: the checks that ran`,
  );
  assert.ok(
    json.checks.every((row) => row.exit === 0 && row.warnings.length === 0),
    `${name} ${tier}: ${JSON.stringify(json.checks.map((row) => [row.id, row.exit, row.warnings]))}`,
  );
  assert.deepEqual(json.warnings, [], `${name} ${tier}: the tier warns`);
  assert.equal(json.baseline.stale, false, `${name} ${tier}: the committed baseline is stale: ${JSON.stringify(json.baseline.reasons)}`);
  if (tier === 'pr') {
    const agreement = json.checks.find((row) => row.id === 'oracle-agreement');
    assert.match(
      fs.readFileSync(path.join(result.directory, 'checks', 'oracle-agreement', 'stdout'), 'utf8'),
      /\b0 oracle outcome\(s\) that disagree or cannot be evaluated/,
      `${name}: oracle-agreement reads a disagreement (${JSON.stringify(agreement.notes)})`,
    );
  }
  if (tier === 'scheduled' || tier === 'release') {
    // The twin run and the held-out partition each meet every floor they declare, and each holds an eligible probe of the
    // classes whose floors the evaluation declares: defect in both, gameability in the held-out partition too.
    const twin = aggregateOf(
      evaluation,
      json.checks.find((row) => row.id === 'twin-run'),
      'twin run',
    );
    const held = aggregateOf(
      evaluation,
      json.checks.find((row) => row.id === 'held-out'),
      'held-out partition',
    );
    for (const [label, aggregate] of [
      ['twin run', twin],
      ['held-out partition', held],
    ]) {
      for (const [probeClass, decision] of Object.entries(decisions(aggregate)))
        assert.notEqual(
          decision,
          'does-not-meet',
          `${name} ${tier}: the ${label} does not meet its ${probeClass} floor: ${JSON.stringify(aggregate.floorDecisions)}`,
        );
      assert.equal(aggregate.floorDecisions.defect.decision, 'meets', `${name} ${tier}: the ${label} defect floor`);
      assert.equal(
        aggregate.floorDecisions['zero-action'].decision,
        'undeclared',
        `${name} ${tier}: the ${label} declares a zero-action floor`,
      );
    }
    assert.equal(twin.floorDecisions.gameability.decision, 'meets', `${name} ${tier}: the twin run holds no eligible gameability probe`);
    assert.equal(
      held.floorDecisions.gameability.decision,
      'meets',
      `${name} ${tier}: the held-out partition holds no eligible gameability probe`,
    );
    assert.ok(held.classes.gameability?.eligible >= 1, `${name} ${tier}: the held-out partition has no gameability probe`);
  }
  process.stdout.write(`  ok ${name} ${tier} (${Math.round((Date.now() - started) / 1000)}s)\n`);
}

/** The adopter x tier pairs a `--only` selector names: `<adopter>` for every tier of the adopter named, `<adopter>:<tier>` for one. */
function select(only) {
  if (only === undefined) return Object.entries(REPOSITORIES).flatMap(([name, { tiers }]) => tiers.map((tier) => [name, tier]));
  const [adopter, tier, ...extra] = only.split(':');
  assert.ok(adopter && tier !== '' && extra.length === 0, `--only=${only}: expected <adopter> or <adopter>:<tier>`);
  const selected = Object.entries(REPOSITORIES).flatMap(([name, { tiers }]) =>
    name === adopter ? tiers.filter((item) => tier === undefined || item === tier).map((item) => [name, item]) : [],
  );
  assert.ok(
    selected.length > 0,
    `--only=${only} selects no adopter x tier; the suite runs ${Object.entries(REPOSITORIES)
      .flatMap(([name, { tiers }]) => tiers.map((item) => `${name}:${item}`))
      .join(', ')}`,
  );
  return selected;
}

/** `select` held to its contract: the pairs each selector form names, and the selectors that must throw. */
function checkSelect() {
  const all = Object.entries(REPOSITORIES).flatMap(([name, { tiers }]) => tiers.map((tier) => [name, tier]));
  assert.equal(all.length, 7, 'select: the suite runs seven adopter x tier pairs');
  assert.deepEqual(select(), all, 'select: no selector selects every pair');
  for (const [name, { tiers }] of Object.entries(REPOSITORIES)) {
    assert.deepEqual(
      select(name),
      tiers.map((tier) => [name, tier]),
      `select: --only=${name} selects the tiers of that adopter only`,
    );
    for (const tier of tiers)
      assert.deepEqual(select(`${name}:${tier}`), [[name, tier]], `select: --only=${name}:${tier} selects exactly that pair`);
  }
  for (const [only, why] of [
    ['nope', 'an unknown adopter'],
    ['tagged-release:nope', 'an unknown tier'],
    ['tagged-release:scheduled', 'a tier the adopter lacks'],
    ['tagged-release:', 'an empty tier'],
    ['', 'an empty selector'],
    ['a:b:c', 'three parts'],
    ['tagged-release:pr:merge', 'an extra part after a valid pair'],
    [':pr', 'an empty adopter'],
    ['release', 'a part of an adopter name'],
    ['tagged:pr', 'a part of an adopter name with a tier'],
  ])
    assert.throws(() => select(only), /--only=/, `select: --only=${only} (${why}) must throw`);
}

/** The seven `test:evaluate-ci-repositories:<adopter>-<tier>` scripts held to the pairs the suite runs. */
function checkScripts() {
  const { scripts } = read(path.join(ROOT, 'package.json'));
  const weights = read(path.join(ROOT, 'tools', 'test-shard-weights.json'));
  const prefix = 'test:evaluate-ci-repositories:';
  const pairs = select();
  assert.deepEqual(
    Object.keys(scripts)
      .filter((name) => name.startsWith(prefix))
      .sort(),
    pairs.map(([name, tier]) => `${prefix}${name}-${tier}`).sort(),
    'package.json: the test:evaluate-ci-repositories:<adopter>-<tier> scripts are not exactly the suite adopter x tier pairs',
  );
  const chain = scripts.test.split(' && ');
  for (const [name, tier] of pairs) {
    const script = `${prefix}${name}-${tier}`;
    assert.equal(
      scripts[script],
      `node test/test-evaluate-ci-repositories.js --only=${name}:${tier}`,
      `package.json: ${script} does not run exactly ${name}:${tier}`,
    );
    assert.equal(
      chain.filter((item) => item === `npm run ${script}`).length,
      1,
      `package.json: ${script} is not in the npm test chain exactly once`,
    );
    assert.equal(typeof weights[script], 'number', `tools/test-shard-weights.json: ${script} has no weight`);
  }
}

function main() {
  const only = process.argv.find((argument) => argument.startsWith('--only='))?.slice('--only='.length);
  try {
    checkSelect();
    checkScripts();
    const selected = select(only);
    for (const [name, tier] of selected) checkTier(name, tier);
    process.stdout.write('Evaluate repository CI tiers passed.\n');
  } finally {
    scratch.removeAll();
  }
}

module.exports = { select };

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
