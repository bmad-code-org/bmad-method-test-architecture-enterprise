/**
 * The layering, boundary and lineage gates are wired to the right gate names,
 * and each one fails on the violation it exists to catch.
 *
 * `npm run test:direction`, `npm run test:boundary` and `npm run test:lineage`
 * are three separate `eval-quality-gates` invocations, and nothing before this
 * check asserted which gate name each script actually calls. A script
 * accidentally pointed at the wrong gate name would still be a syntactically
 * valid `eval-quality-gates` invocation and silently stop enforcing the gate
 * its name promises.
 *
 * WHAT IS CHECKED
 *
 * - Each of the three scripts calls the binary `eval-quality`'s manifest
 *   declares, over exactly the gate name its own script name promises, and
 *   `eval-quality.config.json` carries a section for that gate.
 * - `package-boundary` fails at exit 1 on a fixture tree carrying one line
 *   matching a dev-only-path pattern, naming the file and the line.
 * - `field-ownership` fails at exit 1 on a fixture where a file outside the
 *   declared `writers` list sets the owned field, naming the file and field.
 * - `dependency-direction` fails at exit 1 on a fixture where a `cli/` file
 *   reaches into `tools/`, a layer its graph does not permit `cli/` to import.
 * - `dependency-direction` stays quiet on a fixture whose only construct is a
 *   `require(name) {` method shorthand inside an object literal: this is the
 *   exact shape eval-quality's own scanner used to misread as a `require()`
 *   call before eval-quality 3.3.0's `isMethodDefinition` fix, and the story
 *   this check belongs to could not flip the gate to failing until it was
 *   confirmed gone.
 * - `dependency-direction` is proven to still be scanning the repository for
 *   real, run against the repository's own configuration and asserted to
 *   report the number of files `test:ci-coverage`'s own file-discovery would
 *   expect, so a config edit that silently narrowed its roots to nothing would
 *   be caught even though a report of zero violations over zero files reads
 *   the same as a clean pass.
 *
 * Usage:
 *   node test/test-layering-boundary-lineage.js
 *
 * Exit codes:
 *   0  every gate is wired to the right name and refused its seeded violation
 *   1  a gate is wired to the wrong name, passed a seeded violation, wrongly
 *      flagged the require-shorthand fixture, or scanned fewer files than
 *      expected against the real repository
 *   2  the binary or a fixture could not be read, so nothing was measured
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.join(__dirname, '..');
const CONFIG_PATH = path.join(PROJECT_ROOT, 'eval-quality.config.json');
const FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'layering-boundary-lineage');
const BINARY_NAME = 'eval-quality-gates';
const EXIT_GATE_FAILED = 1;

/** The scripts and the gate each one must call, exactly. */
const GATE_SCRIPTS = {
  'test:direction': 'dependency-direction',
  'test:boundary': 'package-boundary',
  'test:lineage': 'field-ownership',
};

/**
 * A floor on how many files `dependency-direction` should scan against this
 * repository's own configuration. Not a fixture: this is the live count
 * against the real configuration, so it also proves the gate is actually
 * scanning real source rather than a fixture standing in for it. Set well
 * below the true count (101 as of this writing) so ordinary file churn does
 * not make this check flaky; it exists to catch a roots list narrowed to
 * nothing, not to track the exact count.
 */
const MINIMUM_SCANNED_DIRECTION_FILES = 50;

const colors = { reset: '[0m', red: '[31m', green: '[32m' };

const failures = [];
let checks = 0;

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`${colors.red}could not read ${label} at ${filePath}: ${error.message}${colors.reset}`);
    process.exit(2);
  }
}

/** The gates binary, resolved through the package's own manifest rather than through PATH. */
function resolveBinary() {
  let manifestPath;
  try {
    manifestPath = require.resolve('eval-quality/package.json');
  } catch {
    console.error(`${colors.red}eval-quality is not installed; run npm ci${colors.reset}`);
    process.exit(2);
  }
  const manifest = readJson(manifestPath, "eval-quality's package.json");
  const relative = manifest.bin?.[BINARY_NAME];
  if (typeof relative !== 'string') {
    console.error(`${colors.red}eval-quality ${manifest.version} declares no "${BINARY_NAME}" bin entry${colors.reset}`);
    process.exit(2);
  }
  const binary = path.join(path.dirname(manifestPath), relative);
  if (!fs.existsSync(binary)) {
    console.error(`${colors.red}${binary} does not exist, though the manifest names it${colors.reset}`);
    process.exit(2);
  }
  return binary;
}

function runGate(binary, gate, configPath, cwd) {
  const result = spawnSync(process.execPath, [binary, gate, '--config', configPath], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
  if (result.error) {
    console.error(`${colors.red}could not spawn ${BINARY_NAME} ${gate}: ${result.error.message}${colors.reset}`);
    process.exit(2);
  }
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

function checkWiring(config) {
  const manifest = readJson(path.join(PROJECT_ROOT, 'package.json'), 'package.json');
  for (const [script, gate] of Object.entries(GATE_SCRIPTS)) {
    const command = manifest.scripts?.[script];
    check(command === `${BINARY_NAME} ${gate}`, `scripts.${script} is ${JSON.stringify(command)}; expected "${BINARY_NAME} ${gate}"`);
    check(
      (manifest.scripts?.test?.split('&&') ?? []).some((part) => part.trim() === `npm run ${script}`),
      `scripts.test does not chain npm run ${script}`,
    );
    check(config[gate] !== undefined, `eval-quality.config.json has no "${gate}" section, so ${script} would refuse at exit 64`);
  }
}

function checkBoundarySeed(binary) {
  const fixture = path.join(FIXTURE_ROOT, 'boundary-violation', 'eval-quality.config.json');
  const { status, output } = runGate(binary, 'package-boundary', fixture, path.join(FIXTURE_ROOT, 'boundary-violation'));
  check(
    status === EXIT_GATE_FAILED,
    `package-boundary exited ${status} on the seeded dev-path leak; expected ${EXIT_GATE_FAILED}\n${output}`,
  );
  check(output.includes('src/leaky.md'), `package-boundary did not name the seeded file\n${output}`);
  check(output.includes('test/test-knowledge-base.js'), `package-boundary did not quote the offending line\n${output}`);
}

function checkLineageSeed(binary) {
  const fixture = path.join(FIXTURE_ROOT, 'lineage-violation', 'eval-quality.config.json');
  const { status, output } = runGate(binary, 'field-ownership', fixture, path.join(FIXTURE_ROOT, 'lineage-violation'));
  check(
    status === EXIT_GATE_FAILED,
    `field-ownership exited ${status} on the seeded undeclared writer; expected ${EXIT_GATE_FAILED}\n${output}`,
  );
  check(output.includes('rogue-writer.js'), `field-ownership did not name the undeclared writer\n${output}`);
  check(output.includes('schemaVersion'), `field-ownership did not name the owned field\n${output}`);
}

function checkDirectionSeed(binary) {
  const fixture = path.join(FIXTURE_ROOT, 'direction-violation', 'eval-quality.config.json');
  const { status, output } = runGate(binary, 'dependency-direction', fixture, path.join(FIXTURE_ROOT, 'direction-violation'));
  check(
    status === EXIT_GATE_FAILED,
    `dependency-direction exited ${status} on the seeded cli/-into-tools/ reach; expected ${EXIT_GATE_FAILED}\n${output}`,
  );
  check(output.includes('reach-into-tools.js'), `dependency-direction did not name the seeded file\n${output}`);
  check(output.includes('cli/ may not import tools/'), `dependency-direction did not name the violated layer rule\n${output}`);
}

/**
 * eval-quality 3.3.0's `isMethodDefinition` fix, proven directly rather than
 * inferred from an overall clean run. Before 3.3.0 the scanner read any
 * `require(` token sequence as a call site regardless of whether it was a
 * method definition on an object literal, which is exactly the shape
 * `test/test-test-review-cli.js`'s sandboxed `require` mock carries; this
 * fixture isolates that one construct so a regression in a future
 * eval-quality release is caught here rather than read as "the repository
 * happens to report zero violations today."
 */
function checkDirectionNoRequireShorthandFalsePositive(binary) {
  const fixture = path.join(FIXTURE_ROOT, 'direction-require-shorthand', 'eval-quality.config.json');
  const { status, output } = runGate(binary, 'dependency-direction', fixture, path.join(FIXTURE_ROOT, 'direction-require-shorthand'));
  check(
    status === 0,
    `dependency-direction exited ${status} on a require(name) { method shorthand; expected 0 (no false positive)\n${output}`,
  );
  check(output.includes('0 violations'), `dependency-direction reported a violation on the require-shorthand fixture\n${output}`);
}

function checkDirectionStillScans(binary) {
  const { status, output } = runGate(binary, 'dependency-direction', CONFIG_PATH, PROJECT_ROOT);
  check(status === 0, `dependency-direction exited ${status} against the real configuration; expected 0 (0 violations)\n${output}`);
  const match = output.match(/passed, (\d+) file\(s\) scanned/);
  const scanned = match ? Number(match[1]) : 0;
  check(
    scanned >= MINIMUM_SCANNED_DIRECTION_FILES,
    `dependency-direction scanned ${scanned} file(s) against the real repository; expected at least ${MINIMUM_SCANNED_DIRECTION_FILES}\n${output}`,
  );
}

function main() {
  const binary = resolveBinary();
  const config = readJson(CONFIG_PATH, 'eval-quality.config.json');

  checkWiring(config);
  checkBoundarySeed(binary);
  checkLineageSeed(binary);
  checkDirectionSeed(binary);
  checkDirectionNoRequireShorthandFalsePositive(binary);
  checkDirectionStillScans(binary);

  if (failures.length > 0) {
    console.error(`${colors.red}${failures.length} of ${checks} check(s) failed:${colors.reset}`);
    for (const failure of failures) console.error(`  - ${failure}`);
    return 1;
  }
  console.log(`${colors.green}ok${colors.reset} all ${checks} check(s) passed`);
  return 0;
}

if (require.main === module) process.exit(main());
