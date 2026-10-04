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
 * It lives beside `test-evaluate-ci.js` and not in it because its live tiers take about ten minutes: the CI shards run the two
 * scripts side by side.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { readPlan } = require('../cli/lib/evaluate/ci-plan');
const { engineVersion } = require('../cli/lib/evaluate/engine');
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

function checkRepository(name) {
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
  const planned = ['pr', 'merge', 'scheduled', 'release'].filter((tier) => plan.checks.some((item) => item.placement.tier === tier));
  assert.deepEqual(planned, REPOSITORIES[name].tiers, `${name}: the plan places other tiers than this suite runs`);
  for (const tier of planned) {
    const started = Date.now();
    const result = ci(evaluation, tier);
    assert.equal(result.status, 0, `${name} ${tier}: ci exited ${result.status}\n${result.output}`);
    const { json } = result;
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
}

function main() {
  const only = process.argv.find((argument) => argument.startsWith('--only='))?.slice('--only='.length);
  try {
    for (const name of Object.keys(REPOSITORIES)) if (only === undefined || name.includes(only)) checkRepository(name);
    process.stdout.write('Evaluate repository CI tiers passed.\n');
  } finally {
    scratch.removeAll();
  }
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
