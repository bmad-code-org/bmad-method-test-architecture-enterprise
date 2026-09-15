/**
 * The supply-chain gates are wired, and each one fails on the violation it
 * exists to catch.
 *
 * `npm run test:lockfile-age` and `npm run test:licences` run the `lockfile-age`
 * and `licences` gates that `eval-quality` publishes as `eval-quality-gates`,
 * over both committed lockfiles, configured by `eval-quality.config.json` at the
 * repository root. Those two scripts pass when the lockfiles are clean, and a
 * script that exits 0 having executed nothing passes the same way. Nothing in a
 * green run tells the two apart, so this check seeds one violation per gate and
 * watches the installed binary refuse it by name.
 *
 * WHAT IS CHECKED
 *
 * - The two scripts call the binary `eval-quality`'s manifest declares, and each
 *   gate they name has a section in `eval-quality.config.json` covering both
 *   lockfiles. A script pointing at a renamed binary, or at a gate the
 *   configuration never opted into, would refuse at exit 64 in CI, but only
 *   after the chain reached it; this names the drift first.
 * - `licences` fails at exit 1 on a fixture lockfile carrying one GPL-3.0-only
 *   entry, naming the entry and its licence.
 * - `lockfile-age` fails at exit 1 on a fixture lockfile carrying an entry whose
 *   `resolved` is not its own registry tarball beside a name the registry does
 *   not carry, reporting the first as off-registry and the second as
 *   unfetchable. A young entry is not seeded: the binary reads the real clock
 *   and takes no `--now`, so a seeded young version would age out of the window
 *   and the seed would start passing in silence. The young path was proved on
 *   the live lockfile the day the gate was adopted, and the changelog records
 *   what it reported. The unfetchable seed depends on `@tea-fixture/` staying
 *   unclaimed on the public registry, the same assumption the licences seed
 *   makes of `gpl-violator`; a scope that specific is picked precisely so this
 *   is safe to assume.
 * - A gate invoked with no section for it refuses at exit 64 and names the
 *   section, rather than passing over nothing.
 * - `eval-quality.config.json`'s `lockfile-age.exclude` and `licences.undeclared`
 *   keys are a shape the installed release has not published yet, and both
 *   gates refuse at exit 64 on them until the pin moves; that refusal is
 *   expected. Stripped of those two keys, neither gate refuses at exit 64 for
 *   any other reason, which is what this check proves: the two known keys are
 *   the only gap between today's pin and a real verdict, not a stand-in for an
 *   unrelated configuration mistake.
 * - `.npmrc` sets `min-release-age` to 7 as npm reads it from the repository
 *   root, and `website/.npmrc` sets the same value, because npm reads a project
 *   `.npmrc` from the local prefix and never inherits the root's. The root's
 *   `min-release-age-exclude` list and the configuration's `lockfile-age.exclude`
 *   list are held equal, so the floor and the audit exempt the same names.
 *
 * Usage:
 *   node test/test-supply-chain.js
 *
 * Exit codes:
 *   0  every gate is wired and refused its seeded violation
 *   1  a gate passed a seeded violation, refused for the wrong reason, or the
 *      wiring drifted
 *   2  the binary, the configuration or a fixture could not be read, so nothing
 *      was measured
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.join(__dirname, '..');
const CONFIG_PATH = path.join(PROJECT_ROOT, 'eval-quality.config.json');
const FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'supply-chain');
const BINARY_NAME = 'eval-quality-gates';
const EXIT_GATE_FAILED = 1;
const EXIT_USAGE = 64;

/** The lockfiles every configured section has to cover, root-relative. */
const LOCKFILES = ['package-lock.json', 'website/package-lock.json'];

/** The scripts and the gate each one runs. */
const GATE_SCRIPTS = {
  'test:lockfile-age': 'lockfile-age',
  'test:licences': 'licences',
};

const colors = {
  reset: '[0m',
  red: '[31m',
  green: '[32m',
};

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

/**
 * The gates binary, resolved through the package's own manifest rather than
 * through PATH, so a direct `node test/test-supply-chain.js` runs the same file
 * `npm run` puts on PATH.
 */
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

function runGate(binary, gate, configPath) {
  const result = spawnSync(process.execPath, [binary, gate, '--config', configPath], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
  if (result.error) {
    console.error(`${colors.red}could not spawn ${BINARY_NAME} ${gate}: ${result.error.message}${colors.reset}`);
    process.exit(2);
  }
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

function npmConfigGet(key, cwd) {
  const npm = process.env.npm_execpath;
  const result = npm
    ? spawnSync(process.execPath, [npm, 'config', 'get', key], { cwd, encoding: 'utf8' })
    : spawnSync('npm', ['config', 'get', key], { cwd, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    console.error(`${colors.red}npm config get ${key} failed in ${cwd}: ${result.error?.message ?? result.stderr}${colors.reset}`);
    process.exit(2);
  }
  return result.stdout.trim();
}

/** Whether `npm run <script>` is one of the `&&`-joined steps in scripts.test. */
function isChainedIntoTest(manifest, script) {
  return (manifest.scripts?.test?.split('&&') ?? []).some((part) => part.trim() === `npm run ${script}`);
}

function checkWiring(config) {
  const manifest = readJson(path.join(PROJECT_ROOT, 'package.json'), 'package.json');
  for (const [script, gate] of Object.entries(GATE_SCRIPTS)) {
    const command = manifest.scripts?.[script];
    check(command === `${BINARY_NAME} ${gate}`, `scripts.${script} is ${JSON.stringify(command)}; expected "${BINARY_NAME} ${gate}"`);
    check(isChainedIntoTest(manifest, script), `scripts.test does not chain npm run ${script}`);
    const section = config[gate];
    check(section !== undefined, `eval-quality.config.json has no "${gate}" section, so ${script} would refuse at exit ${EXIT_USAGE}`);
    const covered = Array.isArray(section?.lockfiles) ? section.lockfiles : [];
    for (const lockfile of LOCKFILES) {
      check(covered.includes(lockfile), `the "${gate}" section does not list ${lockfile}`);
    }
  }
  // This script's own presence in the chain is not covered by the loop above,
  // since it names no gate: a dropped "&& npm run test:supply-chain" silences
  // every check in this file from local `npm test` and the pre-commit hook,
  // with only the CI job's explicit step left to notice.
  check(isChainedIntoTest(manifest, 'test:supply-chain'), 'scripts.test does not chain npm run test:supply-chain');
}

function checkLicencesSeed(binary) {
  const fixture = path.join(FIXTURE_ROOT, 'licence-violation', 'eval-quality.config.json');
  const { status, output } = runGate(binary, 'licences', fixture);
  check(status === EXIT_GATE_FAILED, `licences exited ${status} on the seeded GPL entry; expected ${EXIT_GATE_FAILED}\n${output}`);
  check(output.includes('gpl-violator@1.0.0'), `licences did not name gpl-violator@1.0.0\n${output}`);
  check(output.includes('GPL-3.0-only'), `licences did not name the GPL-3.0-only licence\n${output}`);
}

function checkLockfileAgeSeed(binary) {
  const fixture = path.join(FIXTURE_ROOT, 'lockfile-age-violation', 'eval-quality.config.json');
  const { status, output } = runGate(binary, 'lockfile-age', fixture);
  check(status === EXIT_GATE_FAILED, `lockfile-age exited ${status} on the seeded entries; expected ${EXIT_GATE_FAILED}\n${output}`);
  check(
    /do not resolve to the npm registry:\n\s+- off-registry@1\.0\.0/.test(output),
    `lockfile-age did not report off-registry@1.0.0 as an off-registry entry\n${output}`,
  );
  check(
    /could not fetch publish metadata for 1 entrie\(s\):\n\s+- @tea-fixture\/unfetchable@1\.0\.0/.test(output),
    `lockfile-age did not report @tea-fixture/unfetchable@1.0.0 as unfetchable\n${output}`,
  );
  check(/^Effective clock: \d{4}-\d{2}-\d{2}T/m.test(output), `lockfile-age printed no effective clock line\n${output}`);
}

function checkAbsentSection(binary) {
  // The lockfile-age fixture configures no licences section.
  const fixture = path.join(FIXTURE_ROOT, 'lockfile-age-violation', 'eval-quality.config.json');
  const { status, output } = runGate(binary, 'licences', fixture);
  check(status === EXIT_USAGE, `licences exited ${status} with no section configured; expected ${EXIT_USAGE}\n${output}`);
  check(output.includes('declares no "licences" section'), `the refusal did not name the missing section\n${output}`);
}

/**
 * `eval-quality.config.json`'s "lockfile-age" section names an `exclude` list
 * and its "licences" section names an `undeclared` list, both shapes the
 * installed 3.1.0 has not published yet; each gate refuses at
 * `EXIT_USAGE` on the unrecognized key until the release that adds them is
 * pinned. That refusal is expected and is not this check's concern.
 *
 * What is this check's concern: whether either key is the *only* reason a gate
 * refuses. Strip both keys from a copy of the real configuration and run both
 * gates against it. Either gate exiting `EXIT_USAGE` on the stripped copy means
 * something else in the real configuration is malformed, hidden today behind
 * the one refusal reason CI already expects and ignores.
 */
/**
 * Every occurrence of a root-relative lockfile path, anywhere in a JSON value,
 * rewritten absolute. A `licences` section names the same lockfile three ways
 * (`lockfiles`, a `policies` key, a `tolerances[].lockfiles` entry) and the
 * schema requires all three to agree, so a shallow rewrite of `lockfiles` alone
 * would leave the other two pointing at a name the rewritten section no longer
 * declares.
 */
function rewriteLockfilePathsAbsolute(value) {
  if (typeof value === 'string') {
    return LOCKFILES.includes(value) ? path.join(PROJECT_ROOT, value) : value;
  }
  if (Array.isArray(value)) return value.map(rewriteLockfilePathsAbsolute);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [rewriteLockfilePathsAbsolute(key), rewriteLockfilePathsAbsolute(entry)]),
    );
  }
  return value;
}

function checkPendingKeysAreTheOnlyGap(binary, config) {
  const stripped = rewriteLockfilePathsAbsolute(structuredClone(config));
  delete stripped['lockfile-age']?.exclude;
  delete stripped.licences?.undeclared;

  const tempPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tea-supply-chain-')), 'eval-quality.config.json');
  fs.writeFileSync(tempPath, JSON.stringify(stripped));
  try {
    for (const gate of Object.values(GATE_SCRIPTS)) {
      if (stripped[gate] === undefined) continue;
      const { status, output } = runGate(binary, gate, tempPath);
      check(
        status !== EXIT_USAGE,
        `${gate} exited ${EXIT_USAGE} even with "exclude"/"undeclared" removed, so something else in eval-quality.config.json is malformed and hidden behind the known refusal\n${output}`,
      );
    }
  } finally {
    fs.rmSync(path.dirname(tempPath), { recursive: true, force: true });
  }
}

function checkResolutionFloor(config) {
  const rootFloor = npmConfigGet('min-release-age', PROJECT_ROOT);
  const websiteFloor = npmConfigGet('min-release-age', path.join(PROJECT_ROOT, 'website'));
  check(rootFloor === '7', `npm reads min-release-age as ${JSON.stringify(rootFloor)} from the repository root; expected 7`);
  check(websiteFloor === '7', `npm reads min-release-age as ${JSON.stringify(websiteFloor)} from website/; expected 7`);

  const excluded = npmConfigGet('min-release-age-exclude', PROJECT_ROOT)
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
    .sort();
  const audited = [...(config['lockfile-age']?.exclude ?? [])].sort();
  check(
    JSON.stringify(excluded) === JSON.stringify(audited),
    `.npmrc excludes ${JSON.stringify(excluded)} from the floor and eval-quality.config.json excludes ${JSON.stringify(audited)} from the window; the two lists must be equal`,
  );
}

function main() {
  const binary = resolveBinary();
  const config = readJson(CONFIG_PATH, 'eval-quality.config.json');

  checkWiring(config);
  checkLicencesSeed(binary);
  checkLockfileAgeSeed(binary);
  checkAbsentSection(binary);
  checkPendingKeysAreTheOnlyGap(binary, config);
  checkResolutionFloor(config);

  if (failures.length > 0) {
    console.error(`${colors.red}${failures.length} of ${checks} supply-chain check(s) failed:${colors.reset}`);
    for (const failure of failures) console.error(`  - ${failure}`);
    return 1;
  }
  console.log(
    `${colors.green}ok${colors.reset} all ${checks} supply-chain check(s) passed: ${BINARY_NAME} refused both seeded violations, refused an absent section, and the resolution floor reads 7 from the root and from website/`,
  );
  return 0;
}

if (require.main === module) process.exit(main());
