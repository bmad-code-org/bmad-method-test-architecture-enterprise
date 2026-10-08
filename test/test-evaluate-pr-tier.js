'use strict';

/**
 * `node test/test-evaluate-pr-tier.js <key>`: TeA's own pull request checks for one evaluation (Story 2.5, AD-11), each a
 * script of the `npm test` chain that the `chain` matrix of `.github/workflows/quality.yaml` runs. It runs
 * `tea-evaluate ci --tier pr` over the committed evaluation folder through the real CLI over real eval-quality, with no secret
 * and no model call, and fails when:
 *
 *  - the folder's plan omits a `pr` check its probes or interface call for (the gameability arm when a probe takes that
 *    route, the HTTP port conformance for an `api` evaluation), or places one they do not,
 *  - the baseline was recorded on another eval-quality release than the installed one, records a dirty or incomplete run or a
 *    workspace other than the one its entry names (copy for a fixture, git for the suite), names another run than the one
 *    it holds as `acceptedRun`, or records a partition other than both, or the evaluation's `evaluation.json` declares
 *    another workspace,
 *  - `ci` exits non-zero, runs other checks than the plan places, or finds the baseline stale.
 *
 * The invocation leaves `runs/<invocationId>/` in the evaluation folder, which the `chain` job uploads as a build artifact.
 * The script also scans every file of that directory for a path of this machine (`machinePathHits`).
 * The Evaluate-authored suite (`suite`) replays the baseline Story H.1 accepted from a clean live run of the skill.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { engineVersion } = require('../cli/lib/evaluate/engine');
const { machinePathHits } = require('./lib/evaluate-baseline');
const { EVALUATIONS, ROOT, folderProblems, resultProblems } = require('./lib/evaluate-pr-tier');

const CLI = path.join(ROOT, 'cli', 'evaluate.js');
/**
 * The environment of the child: the caller's, less git's own variables, the engine override and every credential-looking
 * variable (a key, token or secret), so a `pr` check that began to call a model or a service finds no runner credential and
 * fails. The fixture targets' own bearer values are added back per evaluation.
 */
const ENV = Object.fromEntries(
  Object.entries(process.env).filter(
    ([name]) => !name.startsWith('GIT_') && name !== 'TEA_EVALUATE_ENGINE_CLI' && !/KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(name),
  ),
);

function main(key) {
  const entry = EVALUATIONS.find((candidate) => candidate.key === key);
  if (entry === undefined) {
    console.error(
      `test-evaluate-pr-tier: no evaluation "${key}"; the keys are ${EVALUATIONS.map((candidate) => candidate.key).join(', ')}`,
    );
    return 64;
  }
  const folder = path.join(ROOT, entry.folder);
  const problems = folderProblems(folder, entry, engineVersion());
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    return 1;
  }
  const runs = path.join(folder, 'runs');
  const before = new Set(fs.existsSync(runs) ? fs.readdirSync(runs) : []);
  const started = Date.now();
  const run = spawnSync(process.execPath, [CLI, 'ci', '--evaluation', folder, '--tier', 'pr'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 600_000,
    env: { ...ENV, ...entry.env },
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (run.error) {
    console.error(`test-evaluate-pr-tier: ci could not run: ${run.error.message}`);
    return 1;
  }
  process.stdout.write(run.stdout ?? '');
  process.stderr.write(run.stderr ?? '');
  const invocation = (fs.existsSync(runs) ? fs.readdirSync(runs) : [])
    .filter((name) => !before.has(name) && fs.existsSync(path.join(runs, name, 'ci.json')))
    .sort()
    .at(-1);
  if (invocation === undefined) {
    console.error(`test-evaluate-pr-tier: ${key}: ci left no runs/<invocationId>/ci.json (exit ${run.status})`);
    return 1;
  }
  const ciJson = JSON.parse(fs.readFileSync(path.join(runs, invocation, 'ci.json'), 'utf8'));
  const plan = JSON.parse(fs.readFileSync(path.join(folder, 'ci', 'evaluation-ci-plan.json'), 'utf8'));
  const failures = resultProblems(entry, run.status, ciJson, plan);
  if (failures.length > 0) {
    console.error(failures.join('\n'));
    return 1;
  }
  // The directory the `chain` job uploads names no path of this machine.
  const hits = machinePathHits(path.join(runs, invocation));
  if (hits.length > 0) {
    console.error(
      `test-evaluate-pr-tier: ${key}: runs/${invocation} names a path of this machine in ${hits.map((hit) => hit.file).join(', ')}`,
    );
    return 1;
  }
  console.log(
    `ok ${key}: tea-evaluate ci --tier pr exited 0 in ${seconds}s over ${ciJson.checks.map((row) => row.id).join(', ')} (runs/${invocation}, eval-quality ${engineVersion()})`,
  );
  return 0;
}

process.exitCode = main(process.argv[2]);
