/**
 * The publish authorization guard refuses outside the release workflow, even
 * with a valid npm token present, and authorizes only inside it.
 *
 * `tools/guard-publish.js` is wired as `prepublishOnly`, which npm runs before
 * `npm publish` packs anything. It is proven two ways here: the exported
 * `checkAuthorization` function against a matrix of environments, and the
 * script itself run as a real child process so the wiring (require.main,
 * process.exitCode, the printed reason) is exercised and not just the
 * function it calls.
 *
 * The `.github/workflows/publish.yaml` half of the claim, that a publish
 * through the authorized workflow still succeeds, is proven on the next real
 * release rather than asserted here: nothing short of that release actually
 * runs `npm publish`.
 *
 * Usage: node test/test-guard-publish.js
 */

'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { checkAuthorization, EXPECTED_REPOSITORY, EXPECTED_WORKFLOW } = require('../tools/guard-publish');

const GUARD_SCRIPT = path.join(__dirname, '..', 'tools', 'guard-publish.js');
const PROJECT_ROOT = path.join(__dirname, '..');

const colors = { reset: '[0m', red: '[31m', green: '[32m' };

const failures = [];
let checks = 0;

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

/** A base env stripped of every GitHub Actions marker, so the matrix starts from a clean laptop shell. */
function bareEnv(overrides = {}) {
  const env = { ...process.env };
  delete env.GITHUB_ACTIONS;
  delete env.GITHUB_WORKFLOW;
  delete env.GITHUB_REPOSITORY;
  delete env.CI;
  return { ...env, ...overrides };
}

function checkFunctionMatrix() {
  check(
    checkAuthorization(bareEnv()) !== null,
    'checkAuthorization authorizes a bare environment with none of the GitHub Actions markers set',
  );

  check(
    checkAuthorization(bareEnv({ npm_config__auth: 'shhh', NPM_TOKEN: 'shhh-too' })) !== null,
    'checkAuthorization authorizes an environment carrying an npm token but no GitHub Actions markers: a token must not be what grants authorization',
  );

  check(
    checkAuthorization(bareEnv({ GITHUB_ACTIONS: 'true' })) !== null,
    'checkAuthorization authorizes GITHUB_ACTIONS alone, with no workflow name or repository check',
  );

  check(
    checkAuthorization(bareEnv({ GITHUB_ACTIONS: 'true', GITHUB_WORKFLOW: EXPECTED_WORKFLOW })) !== null,
    'checkAuthorization authorizes the right workflow name with no repository check',
  );

  check(
    checkAuthorization(
      bareEnv({ GITHUB_ACTIONS: 'true', GITHUB_WORKFLOW: 'Some Other Workflow', GITHUB_REPOSITORY: EXPECTED_REPOSITORY }),
    ) !== null,
    'checkAuthorization authorizes a differently named workflow even in the right repository',
  );

  check(
    checkAuthorization(bareEnv({ GITHUB_ACTIONS: 'true', GITHUB_WORKFLOW: EXPECTED_WORKFLOW, GITHUB_REPOSITORY: 'someone/fork' })) !== null,
    'checkAuthorization authorizes the right workflow name in a fork rather than the canonical repository',
  );

  check(
    checkAuthorization(bareEnv({ GITHUB_ACTIONS: 'true', GITHUB_WORKFLOW: EXPECTED_WORKFLOW, GITHUB_REPOSITORY: EXPECTED_REPOSITORY })) ===
      null,
    'checkAuthorization refuses the exact environment the real release workflow sets',
  );

  check(
    checkAuthorization(
      bareEnv({
        GITHUB_ACTIONS: 'true',
        GITHUB_WORKFLOW: EXPECTED_WORKFLOW,
        GITHUB_REPOSITORY: EXPECTED_REPOSITORY,
        NPM_TOKEN: 'a-real-looking-token',
      }),
    ) === null,
    'checkAuthorization refuses the correct environment merely because an npm token is also present',
  );
}

function runGuard(env) {
  const result = spawnSync(process.execPath, [GUARD_SCRIPT], { cwd: PROJECT_ROOT, encoding: 'utf8', env });
  if (result.error) {
    console.error(`${colors.red}could not spawn tools/guard-publish.js: ${result.error.message}${colors.reset}`);
    process.exit(2);
  }
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

function checkScriptRefusesWithToken() {
  const { status, output } = runGuard(bareEnv({ NPM_TOKEN: 'a-real-looking-token', npm_config__authtoken: 'also-real-looking' }));
  check(status === 1, `tools/guard-publish.js exited ${status} outside the release workflow with a token present; expected 1\n${output}`);
  check(output.includes('publish refused:'), `the refusal did not explain itself\n${output}`);
  check(output.includes('.github/workflows/publish.yaml'), `the refusal did not name the authorized workflow\n${output}`);
}

function checkScriptAuthorizesInsideWorkflow() {
  const { status, output } = runGuard(
    bareEnv({ GITHUB_ACTIONS: 'true', GITHUB_WORKFLOW: EXPECTED_WORKFLOW, GITHUB_REPOSITORY: EXPECTED_REPOSITORY }),
  );
  check(status === 0, `tools/guard-publish.js exited ${status} inside the release workflow's own environment; expected 0\n${output}`);
  check(output.includes('publish authorized:'), `the authorization was not confirmed in the output\n${output}`);
}

function checkWiring() {
  const manifest = JSON.parse(require('node:fs').readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
  check(
    manifest.scripts?.prepublishOnly === 'node tools/guard-publish.js',
    `scripts.prepublishOnly is ${JSON.stringify(manifest.scripts?.prepublishOnly)}; expected "node tools/guard-publish.js"`,
  );
}

function main() {
  checkFunctionMatrix();
  checkScriptRefusesWithToken();
  checkScriptAuthorizesInsideWorkflow();
  checkWiring();

  if (failures.length > 0) {
    console.error(`${colors.red}${failures.length} of ${checks} publish-guard check(s) failed:${colors.reset}`);
    for (const failure of failures) console.error(`  - ${failure}`);
    return 1;
  }
  console.log(`${colors.green}ok${colors.reset} all ${checks} publish-guard check(s) passed`);
  return 0;
}

if (require.main === module) process.exitCode = main();
