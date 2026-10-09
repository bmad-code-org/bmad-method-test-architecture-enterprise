/**
 * actionlint over this repository's own GitHub Actions workflows.
 *
 * `test/eval-ci.js` lints the workflows an agent writes; nothing linted the ones this repository runs. A reference to a step that does
 * not exist (`steps.run-review.outcome` after the step that declares it was commented out) passed `npm test` and failed only when
 * someone ran `actionlint` by hand.
 *
 * This lints every `*.yaml` and `*.yml` under `.github/workflows/`, plus the shipped copy-paste template
 * `cli/examples/pr-test-review.yml`, in one actionlint run and fails on any finding. The flags are pinned the way `test/eval-ci.js` pins
 * them: `-shellcheck=` and `-pyflakes=` turn off the two integrations that only run when their binary happens to be installed, so a
 * runner with shellcheck and a laptop without it give the same answer on the same files. The version floats with the installer, as it does
 * for the eval-ci suite.
 *
 * With no actionlint on PATH the check fails and names `tools/install-actionlint.sh`; it never skips. Each chain shard of quality.yaml
 * installs actionlint before it runs the chain; publish.yaml runs that workflow before its release job.
 *
 * It then proves that it can fail, so a linter that quietly stopped checking cannot leave it green:
 *  - a copy of `tea-test-review.yaml` lints clean,
 *  - the same copy with the `run-review` step's id removed (the verdict step then reads a step that does not exist) is refused with a
 *    finding that names `run-review`, and
 *  - the check itself run with an empty PATH exits non-zero and names the installer.
 *
 * Usage: node test/test-workflows-lint.js
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.join(__dirname, '..');
const WORKFLOW_ROOT = path.join(PROJECT_ROOT, '.github', 'workflows');
const TEMPLATES = [path.join(PROJECT_ROOT, 'cli', 'examples', 'pr-test-review.yml')];
const DORMANT_WORKFLOW = path.join(WORKFLOW_ROOT, 'tea-test-review.yaml');

const ACTIONLINT_ARGS = ['-no-color', '-shellcheck=', '-pyflakes='];
const LINT_TIMEOUT_MS = 60_000;
const INSTALLER = 'tools/install-actionlint.sh';

const colors = { reset: '\u001B[0m', red: '\u001B[31m', green: '\u001B[32m' };

const failures = [];
let checks = 0;

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

/** Every workflow file under `.github/workflows/`, sorted, then the templates, as paths relative to the repository root. */
function workflowFiles() {
  const names = fs.readdirSync(WORKFLOW_ROOT).filter((name) => /\.ya?ml$/.test(name));
  return [...names.map((name) => path.join(WORKFLOW_ROOT, name)).sort(), ...TEMPLATES].map((file) => path.relative(PROJECT_ROOT, file));
}

/** Runs actionlint over `files` from `cwd`; `output` is stdout and stderr together, `error` is set when it could not be started. */
function lint(files, cwd) {
  const run = spawnSync('actionlint', [...ACTIONLINT_ARGS, ...files], { cwd, encoding: 'utf8', timeout: LINT_TIMEOUT_MS });
  return { status: run.status, signal: run.signal, error: run.error, output: `${run.stdout ?? ''}${run.stderr ?? ''}`.trim() };
}

function missingActionlintMessage(detail) {
  return `actionlint is not usable (${detail}); install it with \`bash ${INSTALLER} <directory>\` and put that directory on PATH, or \`brew install actionlint\``;
}

/** The reason actionlint cannot be used, or null when `actionlint -version` answers. */
function actionlintProblem() {
  const probe = spawnSync('actionlint', ['-version'], { encoding: 'utf8', timeout: LINT_TIMEOUT_MS });
  if (probe.error) return missingActionlintMessage(probe.error.code ?? probe.error.message);
  if (probe.status !== 0) return missingActionlintMessage(`\`actionlint -version\` exited ${probe.status ?? probe.signal}`);
  return null;
}

function checkRepositoryWorkflows() {
  const files = workflowFiles();
  check(
    files.length > TEMPLATES.length,
    `no workflow was found under ${path.relative(PROJECT_ROOT, WORKFLOW_ROOT)}, so nothing was linted`,
  );
  const result = lint(files, PROJECT_ROOT);
  check(
    result.error === undefined && result.status === 0,
    `actionlint found problems in ${files.length} file(s) (${files.join(', ')}); exit ${result.status ?? result.signal ?? result.error?.message}:\n${result.output}`,
  );
  return files.length;
}

function checkMutant() {
  const original = fs.readFileSync(DORMANT_WORKFLOW, 'utf8');
  const stepId = /^ +id: run-review\n/m;
  check(
    stepId.test(original),
    'tea-test-review.yaml no longer declares a step with `id: run-review`, so the mutant below has nothing to remove',
  );

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-workflows-lint-'));
  try {
    const control = path.join(directory, 'control.yaml');
    const mutant = path.join(directory, 'mutant.yaml');
    fs.writeFileSync(control, original);
    fs.writeFileSync(mutant, original.replace(stepId, ''));

    const controlRun = lint([control], directory);
    check(
      controlRun.error === undefined && controlRun.status === 0,
      `an unmodified copy of tea-test-review.yaml is not lint clean (exit ${controlRun.status ?? controlRun.signal}):\n${controlRun.output}`,
    );

    const mutantRun = lint([mutant], directory);
    check(
      mutantRun.error === undefined && mutantRun.status === 1 && mutantRun.output.includes('run-review'),
      `a copy of tea-test-review.yaml whose verdict step reads the undefined step run-review was not refused (exit ${mutantRun.status ?? mutantRun.signal}):\n${mutantRun.output || '(no output)'}`,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function checkMissingActionlint() {
  const emptyPath = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-workflows-lint-path-'));
  try {
    const run = spawnSync(process.execPath, [__filename], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      env: { ...process.env, PATH: emptyPath },
      timeout: LINT_TIMEOUT_MS,
    });
    check(run.status === 1, `with no actionlint on PATH the check exited ${run.status ?? run.signal} instead of 1`);
    check(
      `${run.stderr}`.includes(INSTALLER),
      `with no actionlint on PATH the check did not name ${INSTALLER}:\n${run.stderr}${run.stdout}`,
    );
    check(!`${run.stdout}`.includes('passed'), 'with no actionlint on PATH the check printed a pass line');
  } finally {
    fs.rmSync(emptyPath, { recursive: true, force: true });
  }
}

function main() {
  const problem = actionlintProblem();
  if (problem !== null) {
    console.error(`${colors.red}${problem}${colors.reset}`);
    process.exit(1);
  }

  const linted = checkRepositoryWorkflows();
  checkMutant();
  checkMissingActionlint();

  if (failures.length > 0) {
    console.error(`${colors.red}${failures.length} of ${checks} workflow lint check(s) failed:${colors.reset}`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(
    `${colors.green}ok${colors.reset} actionlint is clean over ${linted} workflow file(s); ${checks} workflow lint check(s) passed`,
  );
}

main();
