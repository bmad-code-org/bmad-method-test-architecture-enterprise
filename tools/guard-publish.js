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
 * than 8.0.0: 4.0.0 is the first engine carrying the target-policy export and
 * trial-set scoring Evaluate needs, 4.1.1 the first whose command-line adapter
 * kills the target's process group at its ceiling, 4.1.2 the first that also
 * kills it when the host dies, by `SIGKILL` included, all of which
 * `tea-evaluate preflight` relies on, 4.1.3 the first whose `score` writes
 * the reasons of an Invalid result to stderr, which `tea-evaluate score`
 * persists for AD-10 to classify, 4.1.4 the first whose record schema
 * defines `provenance` by the observation's role, the reading `tea-evaluate
 * run` records every scored trial step under, 4.2.0 the first whose
 * command-line and MCP adapters carry the policy's `reason` on a denial, which
 * `tea-evaluate` records beside the fault code, and 4.3.0 the first exporting
 * `staysOnHost`, the predicate `tea-evaluate check` holds a credential sent
 * over `http` to, 4.4.0 the first whose MCP adapter answers a tool call that
 * ended the session after the handshake with an observation carrying how it
 * ended, which `tea-evaluate` judges instead of stopping the run, 4.5.0 the
 * first exporting `parseProbeTargetPolicy`, the parser `tea-evaluate check`
 * holds an HTTP registry entry to, 4.6.0 the first whose command-line
 * adapter carries `portFailureReason` (`launch-too-large`) on a `port-failure`
 * fault, which `tea-evaluate run` reads to skip a step whose captured value is
 * too large to launch, 4.7.0 the first shipping `aggregate-strength`, the
 * stage `tea-evaluate score` calls for the run-wide class strength and floor
 * decisions, and 5.0.0 the first whose sealed observations, plan steps and
 * sibling groups name the declaring interface beside the operation, which
 * `tea-evaluate` writes into every record and reads back to give each finding
 * the phase of its own interface, and 6.0.0 the first carrying raw API bodies
 * and the required bodyEncoding marker on sealed observations, and 6.0.1 the
 * first recognizing paired process success and whole stdout checks for a
 * scalar CLI answer, and 7.0.0 the first whose `score`, `preflight` and
 * `aggregate-strength` name a stale schema stamp on every artifact they read
 * before its shape is read, and 7.0.1 the first whose `compile` and `preflight` refuse two interfaces that
 * share a `logicalId`, which `tea-evaluate check` quotes, and 7.1.0 the first whose
 * `success-indicator-separation` coverage rule counts only an oracle some behavior lists, which
 * `tea-evaluate score` records as a coverage gap, and 7.2.0 the first whose `score`
 * takes `--designated-oracle`, which `tea-evaluate` hands a both-view probe so each probe is scored against its own
 * partition's oracle, and 8.0.0 the first accepting a `*` segment in `volatilePointers` and
 * `stateResetPointers` on an operation, which the test-review evaluation's contract declares and
 * which a 7.x engine refuses to parse. Optional,
 * because npm 7 and later install a
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
const ENGINE_FLOOR = '8.0.0';

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
        'Run a release from that workflow (workflow_dispatch, or a push to main that touches skills/) rather than npm publish directly.',
    );
    return 1;
  }
  console.log(`publish authorized: running inside the "${EXPECTED_WORKFLOW}" workflow for ${EXPECTED_REPOSITORY}.`);
  return 0;
}

if (require.main === module) process.exitCode = main();

module.exports = { checkAuthorization, checkManifest, ENGINE_FLOOR, EXPECTED_REPOSITORY, EXPECTED_WORKFLOW };
