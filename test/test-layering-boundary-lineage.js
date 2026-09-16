/**
 * The layering, boundary and lineage gates are wired to the right gate names,
 * and the two that fail (package-boundary, field-ownership) each fail on the
 * violation they exist to catch.
 *
 * `npm run test:direction`, `npm run test:boundary` and `npm run test:lineage`
 * are three separate `eval-quality-gates` invocations, and nothing before this
 * check asserted which gate name each script actually calls. `test:direction`
 * runs `reportOnly: true` and so always exits 0 regardless of what it finds; a
 * script accidentally pointed at it instead of `package-boundary` or
 * `field-ownership` would still be a syntactically valid `eval-quality-gates`
 * invocation, still exit 0, and silently stop enforcing the gate its name
 * promises.
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
 * - `dependency-direction`, staying `reportOnly: true` on purpose (two of its
 *   three remaining first-run findings are eval-quality limits, queued
 *   upstream), is proven to still be running for real: it is run against the
 *   repository's own configuration and asserted to report at least the three
 *   known, currently-open findings, so a config edit that silently stopped it
 *   from scanning anything would be caught even though the exit code alone
 *   could not.
 *
 * Usage:
 *   node test/test-layering-boundary-lineage.js
 *
 * Exit codes:
 *   0  every gate is wired to the right name and refused its seeded violation
 *   1  a gate is wired to the wrong name, passed a seeded violation, or the
 *      direction gate reported fewer open findings than expected
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
 * The three known-open dependency-direction findings this repository's own
 * `eval-quality.config.json` reports today, traced to eval-quality rather
 * than TEA (see the story's Implementation Notes). Not a fixture: this is the
 * live count against the real configuration, so it also proves the gate is
 * actually scanning real source rather than a fixture standing in for it.
 */
const MINIMUM_KNOWN_DIRECTION_FINDINGS = 3;

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

function checkDirectionStillScans(binary) {
  const { status, output } = runGate(binary, 'dependency-direction', CONFIG_PATH, PROJECT_ROOT);
  check(status === 0, `dependency-direction exited ${status} against the real configuration; expected 0 (reportOnly)\n${output}`);
  const match = output.match(/report-only, (\d+) violation/);
  const reported = match ? Number(match[1]) : 0;
  check(
    reported >= MINIMUM_KNOWN_DIRECTION_FINDINGS,
    `dependency-direction reported ${reported} violation(s) against the real repository; expected at least ${MINIMUM_KNOWN_DIRECTION_FINDINGS} known, still-open finding(s)\n${output}`,
  );
}

function main() {
  const binary = resolveBinary();
  const config = readJson(CONFIG_PATH, 'eval-quality.config.json');

  checkWiring(config);
  checkBoundarySeed(binary);
  checkLineageSeed(binary);
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
