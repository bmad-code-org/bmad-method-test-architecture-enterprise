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
 * Usage: node tools/guard-publish.js
 * Exit codes: 0 authorized, 1 refused
 */

'use strict';

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

function main() {
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

module.exports = { checkAuthorization, EXPECTED_REPOSITORY, EXPECTED_WORKFLOW };
