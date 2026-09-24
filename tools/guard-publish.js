/**
 * Publish authorization guard.
 *
 * TEA has no publish lifecycle hook today, so a laptop holding a valid npm
 * token can run `npm publish` directly, entirely outside
 * `.github/workflows/publish.yaml`: no version bump, no changelog stamp, no
 * test run, no provenance, no marketplace sync, and no record of who did it or
 * why. Wired as `prepublishOnly` in `package.json`, this runs before `npm
 * publish` packs anything and refuses unless it is running inside that exact
 * workflow.
 *
 * Holding an npm token is deliberately not what authorizes a publish: the
 * release workflow itself publishes through OIDC trusted publishing and
 * stores no token at all, so a token's presence proves nothing about where the
 * command is running. What is checked instead is the ambient environment
 * GitHub Actions sets and a local shell does not: `GITHUB_ACTIONS`, the
 * running workflow's own `name:` field, and the repository slug. A caller
 * happening to set all three by hand has decided to reproduce the one
 * environment this guard exists to require, so treating that as authorized is
 * the same call the workflow itself makes; the guard's job is to refuse the
 * ordinary case, a publish attempted from anywhere else, not to resist someone
 * deliberately forging a CI runner.
 *
 * It also refuses a manifest that would ship Evaluate broken: the
 * `tea-evaluate` bin must point at a file the package carries, and
 * `eval-quality` must be an optional peer whose range admits no release older
 * than 4.1.2: 4.0.0 is the first engine carrying the target-policy export and
 * trial-set scoring Evaluate needs, 4.1.1 the first whose command-line adapter
 * kills the target's process group at its ceiling, and 4.1.2 the first that
 * also kills it when the host dies, by `SIGKILL` included, all of which
 * `tea-evaluate preflight` relies on. Optional, because npm 7 and later install a
 * required peer automatically and would pull the engine into every project that
 * installs TeA for its other workflows.
 *
 * Usage: node tools/guard-publish.js
 * Exit codes: 0 authorized, 1 refused
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const semver = require('semver');

const PROJECT_ROOT = path.join(__dirname, '..');
const EVALUATE_BIN = 'tea-evaluate';
const ENGINE_PACKAGE = 'eval-quality';
const ENGINE_FLOOR = '4.1.2';

const EXPECTED_REPOSITORY = 'bmad-code-org/bmad-method-test-architecture-enterprise';
const EXPECTED_WORKFLOW = 'Publish';

/**
 * Why `env` refuses authorization, or null when it grants it.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {string|null}
 */
function checkAuthorization(env) {
  if (env.GITHUB_ACTIONS !== 'true') {
    return 'GITHUB_ACTIONS is not "true", so this is not running inside a GitHub Actions job';
  }
  if (env.GITHUB_WORKFLOW !== EXPECTED_WORKFLOW) {
    return `GITHUB_WORKFLOW is ${JSON.stringify(env.GITHUB_WORKFLOW ?? null)}; expected ${JSON.stringify(EXPECTED_WORKFLOW)}`;
  }
  if (env.GITHUB_REPOSITORY !== EXPECTED_REPOSITORY) {
    return `GITHUB_REPOSITORY is ${JSON.stringify(env.GITHUB_REPOSITORY ?? null)}; expected ${JSON.stringify(EXPECTED_REPOSITORY)}`;
  }
  return null;
}

/**
 * Why `manifest` would publish Evaluate broken, as a list of reasons; empty when it would not.
 *
 * @param {Record<string, any>} manifest the parsed package.json
 * @param {string} [projectRoot] where the bin's path is resolved
 * @returns {string[]}
 */
function checkManifest(manifest, projectRoot = PROJECT_ROOT) {
  const problems = [];
  const bin = manifest?.bin?.[EVALUATE_BIN];
  if (typeof bin !== 'string' || bin.length === 0) {
    problems.push(`bin["${EVALUATE_BIN}"] is missing`);
  } else if (!fs.existsSync(path.join(projectRoot, bin)) || !fs.statSync(path.join(projectRoot, bin)).isFile()) {
    problems.push(`bin["${EVALUATE_BIN}"] points at ${JSON.stringify(bin)}, which is not a file in the package`);
  }

  const range = manifest?.peerDependencies?.[ENGINE_PACKAGE];
  if (typeof range === 'string') {
    let floor = null;
    try {
      floor = semver.minVersion(range);
    } catch {
      floor = null;
    }
    if (floor === null) {
      problems.push(`peerDependencies["${ENGINE_PACKAGE}"] is ${JSON.stringify(range)}, which is not a valid semver range`);
    } else if (semver.lt(floor, ENGINE_FLOOR)) {
      problems.push(
        `peerDependencies["${ENGINE_PACKAGE}"] is ${JSON.stringify(range)}, which admits ${floor.version}; Evaluate needs ${ENGINE_FLOOR} or later`,
      );
    }
  } else {
    problems.push(`peerDependencies["${ENGINE_PACKAGE}"] is missing`);
  }

  if (manifest?.peerDependenciesMeta?.[ENGINE_PACKAGE]?.optional !== true) {
    problems.push(
      `peerDependenciesMeta["${ENGINE_PACKAGE}"].optional is not true, so npm would install the engine into every project that installs TeA`,
    );
  }
  return problems;
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
  const problems = checkManifest(manifest);
  if (problems.length > 0) {
    console.error(`publish refused: package.json would ship Evaluate broken:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
    return 1;
  }
  const reason = checkAuthorization(process.env);
  if (reason) {
    console.error(
      `publish refused: ${reason}.\n` +
        'Publishing happens only through .github/workflows/publish.yaml. ' +
        'Run a release from that workflow (workflow_dispatch, or a push to main that touches src/) rather than npm publish directly.',
    );
    return 1;
  }
  console.log(`publish authorized: running inside the "${EXPECTED_WORKFLOW}" workflow for ${EXPECTED_REPOSITORY}.`);
  return 0;
}

if (require.main === module) process.exitCode = main();

module.exports = { checkAuthorization, checkManifest, ENGINE_FLOOR, EXPECTED_REPOSITORY, EXPECTED_WORKFLOW };
