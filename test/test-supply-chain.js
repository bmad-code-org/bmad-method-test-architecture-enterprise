/**
 * The supply-chain gates are wired, and each one fails on the violation it
 * exists to catch.
 *
 * `npm run test:lockfile-age` runs eval-quality's gate directly. The licence
 * script verifies promptfoo's optional Claude SDK entries, then runs the
 * published licence gate over the remaining entries in a temporary lock view.
 * Both gates use `eval-quality.config.json` and cover both committed lockfiles.
 * Those two scripts pass when the lockfiles are clean, and a
 * script that exits 0 having executed nothing passes the same way. Nothing in a
 * green run tells the two apart, so this check seeds one violation per gate and
 * watches the installed binary refuse it by name.
 *
 * WHAT IS CHECKED
 *
 * - The lockfile-age script calls `eval-quality-gates`, and the licence script
 *   calls the scoped verifier. Each gate has a section in
 *   `eval-quality.config.json` covering both lockfiles. A missing section
 *   would refuse at exit 64 in CI, but only after the chain reached it.
 * - The licence verifier removes exactly the nine optional Claude SDK entries
 *   after checking their declared terms; it refuses a nonoptional entry and
 *   preserves an unrelated GPL entry for the gate to reject.
 * - The licence wrapper fails at exit 1 on a seeded copy of the root lockfile
 *   carrying one GPL-3.0-only entry, naming the entry and its licence.
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
const { omitVerifiedOptionalSdk, verifyPromptfooToleranceScope, verifyPromptfooUndeclaredScope } = require('../tools/check-licences');

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

/**
 * Every gate here now runs in the default chain: `lockfile-age` read from the
 * public npm registry once per unique locked package name until a committed
 * publication cache (`eval-quality.config.json`'s `lockfile-age.cache`) made
 * that a local, offline lookup instead, which is what let it rejoin `licences`
 * here rather than being confined to the CI-only `supply-chain` job.
 */
const CI_ONLY_SCRIPTS = new Set();

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
    const expected = script === 'test:licences' ? 'node tools/check-licences.js' : `${BINARY_NAME} ${gate}`;
    check(command === expected, `scripts.${script} is ${JSON.stringify(command)}; expected "${expected}"`);
    if (CI_ONLY_SCRIPTS.has(script)) {
      check(
        !isChainedIntoTest(manifest, script),
        `scripts.test chains npm run ${script}, which is meant to stay CI-only (see CI_ONLY_SCRIPTS)`,
      );
    } else {
      check(isChainedIntoTest(manifest, script), `scripts.test does not chain npm run ${script}`);
    }
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

function runLicenceWrapper(lock) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-licence-seed-'));
  try {
    const lockfile = path.join(temporary, 'package-lock.json');
    fs.writeFileSync(lockfile, JSON.stringify(lock));
    const result = spawnSync(process.execPath, [path.join(PROJECT_ROOT, 'tools', 'check-licences.js'), '--lockfile', lockfile], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1' },
    });
    if (result.error) throw result.error;
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function checkLicencesSeed() {
  const seed = readJson(path.join(FIXTURE_ROOT, 'licence-violation', 'package-lock.json'), 'GPL licence seed');
  const lock = readJson(path.join(PROJECT_ROOT, 'package-lock.json'), 'package-lock.json');
  lock.packages['node_modules/gpl-violator'] = seed.packages['node_modules/gpl-violator'];
  const { status, output } = runLicenceWrapper(lock);
  check(status === EXIT_GATE_FAILED, `licence wrapper exited ${status} on the seeded GPL entry; expected ${EXIT_GATE_FAILED}\n${output}`);
  check(output.includes('gpl-violator@1.0.0'), `licence wrapper did not name gpl-violator@1.0.0\n${output}`);
  check(output.includes('GPL-3.0-only'), `licence wrapper did not name the GPL-3.0-only licence\n${output}`);
}

function checkPromptfooLicenceScope(config) {
  const original = readJson(path.join(PROJECT_ROOT, 'package-lock.json'), 'package-lock.json');
  verifyPromptfooToleranceScope(original, config);
  verifyPromptfooUndeclaredScope(original, config);
  for (const prefix of ['sylvester', 'xmlhttprequest-ssl']) {
    for (const [label, change] of [
      [
        'prefix',
        (entry) => {
          entry.prefix += '-other';
        },
      ],
      [
        'lockfile',
        (entry) => {
          entry.lockfiles = ['website/package-lock.json'];
        },
      ],
      [
        'readAs',
        (entry) => {
          entry.readAs = 'Apache-2.0';
        },
      ],
      [
        'evidence',
        (entry) => {
          entry.evidence = 'unverified';
        },
      ],
      [
        'reason',
        (entry) => {
          entry.reason = 'unverified';
        },
      ],
    ]) {
      const changedConfig = structuredClone(config);
      change(changedConfig.licences.undeclared.find((entry) => entry.prefix === prefix));
      let rejected = false;
      try {
        verifyPromptfooUndeclaredScope(original, changedConfig);
      } catch (error) {
        rejected = error.message.includes('promptfoo undeclared licence');
      }
      check(rejected, `promptfoo undeclared licence guard accepted changed ${prefix} ${label}`);
    }
  }
  const extraUndeclared = structuredClone(config);
  const sidecarReading = structuredClone(extraUndeclared.licences.undeclared.find((entry) => entry.prefix === 'sylvester'));
  sidecarReading.prefix = 'sylvester-sidecar';
  sidecarReading.reason = 'unrelated';
  extraUndeclared.licences.undeclared.push(sidecarReading);
  let extraReadingRejected = false;
  try {
    verifyPromptfooUndeclaredScope(original, extraUndeclared);
  } catch (error) {
    extraReadingRejected = error.message.includes('approved promptfoo undeclared licence set changed');
  }
  check(extraReadingRejected, 'promptfoo licence guard accepted an extra same-prefix undeclared reading');
  const licenceFiles = { sylvester: 'LICENSE.txt', 'xmlhttprequest-ssl': 'LICENSE' };
  for (const prefix of Object.keys(licenceFiles)) {
    const changedLock = structuredClone(original);
    const entry = changedLock.packages[`node_modules/${prefix}`];
    entry.version = '99.0.0';
    entry.resolved = `https://registry.npmjs.org/${prefix}/-/${prefix}-99.0.0.tgz`;
    const changedResult = runLicenceWrapper(changedLock);
    check(
      changedResult.status !== 0 && changedResult.output.includes(`${prefix} changed its approved locked version or registry tarball`),
      `promptfoo licence wrapper accepted ${prefix} version and tarball drift: ${changedResult.output}`,
    );
    const changedUrl = structuredClone(original);
    changedUrl.packages[`node_modules/${prefix}`].resolved = `https://registry.npmjs.org/${prefix}/-/${prefix}-99.0.0.tgz`;
    let urlRejected = false;
    try {
      verifyPromptfooUndeclaredScope(changedUrl, config);
    } catch (error) {
      urlRejected = error.message.includes(`${prefix} changed its approved locked version or registry tarball`);
    }
    check(urlRejected, `promptfoo licence guard accepted ${prefix} tarball drift with its version unchanged`);
  }
  const licenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-undeclared-terms-'));
  try {
    for (const [prefix, file] of Object.entries(licenceFiles)) {
      const packageRoot = path.join(licenceRoot, 'node_modules', prefix);
      fs.mkdirSync(packageRoot, { recursive: true });
      fs.copyFileSync(path.join(PROJECT_ROOT, 'node_modules', prefix, file), path.join(packageRoot, file));
    }
    for (const [prefix, file] of Object.entries(licenceFiles)) {
      const installed = path.join(licenceRoot, 'node_modules', prefix, file);
      fs.appendFileSync(installed, '\nchanged terms\n');
      let termsRejected = false;
      try {
        verifyPromptfooUndeclaredScope(original, config, licenceRoot);
      } catch (error) {
        termsRejected = error.message.includes(`${prefix} licence file no longer matches the approved evidence`);
      }
      check(termsRejected, `promptfoo licence guard accepted changed ${prefix} licence text`);
      fs.copyFileSync(path.join(PROJECT_ROOT, 'node_modules', prefix, file), installed);
    }
  } finally {
    fs.rmSync(licenceRoot, { recursive: true, force: true });
  }
  for (const [label, change] of [
    [
      'licence',
      (entry) => {
        entry.license = 'MIT';
      },
    ],
    [
      'optional flag',
      (entry) => {
        entry.optional = false;
      },
    ],
    [
      'lockfile',
      (entry) => {
        entry.lockfiles = ['website/package-lock.json'];
      },
    ],
    [
      'marker file',
      (entry) => {
        entry.marker.file = 'website/package.json';
      },
    ],
    [
      'marker text',
      (entry) => {
        entry.marker.contains = '"promptfoo": "0.123.1"';
      },
    ],
  ]) {
    const changedConfig = structuredClone(config);
    change(changedConfig.licences.tolerances.find((entry) => entry.prefix === 'big-integer'));
    let rejected = false;
    try {
      verifyPromptfooToleranceScope(original, changedConfig);
    } catch (error) {
      rejected = error.message.includes('big-integer');
    }
    check(rejected, `promptfoo licence guard accepted a changed ${label} tolerance tuple`);
  }
  const extraTolerance = structuredClone(config);
  const added = structuredClone(extraTolerance.licences.tolerances.find((entry) => entry.prefix === 'big-integer'));
  added.prefix = 'big-integer-extra';
  extraTolerance.licences.tolerances.push(added);
  let extraRejected = false;
  try {
    verifyPromptfooToleranceScope(original, extraTolerance);
  } catch (error) {
    extraRejected = error.message.includes('tolerance set changed');
  }
  check(extraRejected, 'promptfoo licence guard accepted an extra scoped tolerance');
  const filtered = structuredClone(original);
  const removed = omitVerifiedOptionalSdk(filtered);
  check(removed.length === 9, `promptfoo licence check excluded ${removed.length} Claude SDK entries, expected nine`);
  check(
    removed.every((name) => name.includes('/@anthropic-ai/claude-agent-sdk')),
    `promptfoo licence check excluded an unrelated entry: ${removed.join(', ')}`,
  );
  check(
    Object.keys(filtered.packages).length === Object.keys(original.packages).length - removed.length,
    'promptfoo licence check filtered more entries than the verified optional SDK set',
  );
  const changed = structuredClone(original);
  const base = removed.find((name) => name.endsWith('/@anthropic-ai/claude-agent-sdk'));
  changed.packages[base].optional = false;
  let refused = false;
  try {
    omitVerifiedOptionalSdk(changed);
  } catch {
    refused = true;
  }
  check(refused, 'promptfoo licence check accepted a nonoptional Claude SDK entry');
  const changedLicence = structuredClone(original);
  changedLicence.packages[base].license = 'MIT';
  let licenceRefused = false;
  try {
    omitVerifiedOptionalSdk(changedLicence);
  } catch {
    licenceRefused = true;
  }
  check(licenceRefused, 'promptfoo licence check accepted changed Claude SDK licence metadata');
  const extra = structuredClone(original);
  extra.packages['node_modules/gate-seed'] = { version: '1.0.0', license: 'GPL-3.0-only' };
  omitVerifiedOptionalSdk(extra);
  check(extra.packages['node_modules/gate-seed']?.license === 'GPL-3.0-only', 'promptfoo licence check removed an unrelated GPL package');
  const samePrefix = structuredClone(original);
  samePrefix.packages['node_modules/big-integer-extra'] = { version: '1.0.0', license: 'Unlicense', optional: true };
  const samePrefixResult = runLicenceWrapper(samePrefix);
  check(
    samePrefixResult.status !== 0 &&
      samePrefixResult.output.includes('matches an additional or missing lockfile package') &&
      samePrefixResult.output.includes('big-integer-extra'),
    `promptfoo licence wrapper accepted an additional same-prefix package: ${samePrefixResult.output}`,
  );
  const undeclaredSidecar = structuredClone(original);
  undeclaredSidecar.packages['node_modules/sylvester-sidecar'] = { version: '1.0.0' };
  const sidecarResult = runLicenceWrapper(undeclaredSidecar);
  check(
    sidecarResult.status !== 0 &&
      sidecarResult.output.includes('promptfoo undeclared licence sylvester matches an additional') &&
      sidecarResult.output.includes('sylvester-sidecar'),
    `promptfoo licence wrapper borrowed sylvester evidence for a sidecar: ${sidecarResult.output}`,
  );

  const platform = removed.find((name) => name !== base && fs.existsSync(path.join(PROJECT_ROOT, name)));
  check(platform !== undefined, 'no installed optional Claude SDK platform package is available for licence evidence');
  if (platform) {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-sdk-terms-'));
    try {
      fs.mkdirSync(path.join(temporary, base), { recursive: true });
      const baseLicence = path.join(temporary, base, 'LICENSE.md');
      const baseReadme = path.join(temporary, base, 'README.md');
      fs.copyFileSync(path.join(PROJECT_ROOT, base, 'README.md'), baseReadme);
      const rejectsTerms = (message) => {
        try {
          omitVerifiedOptionalSdk(structuredClone(original), temporary);
          return false;
        } catch (error) {
          return error.message.includes(message);
        }
      };
      check(rejectsTerms('missing LICENSE.md'), 'promptfoo licence check accepted a missing base SDK LICENSE.md');
      fs.copyFileSync(path.join(PROJECT_ROOT, base, 'LICENSE.md'), baseLicence);
      fs.rmSync(baseReadme);
      check(rejectsTerms('missing README.md'), 'promptfoo licence check accepted a missing base SDK README.md');
      fs.copyFileSync(path.join(PROJECT_ROOT, base, 'README.md'), baseReadme);
      fs.appendFileSync(baseReadme, '\nchanged terms\n');
      check(rejectsTerms('README.md no longer matches'), 'promptfoo licence check accepted changed SDK README terms');
      fs.copyFileSync(path.join(PROJECT_ROOT, base, 'README.md'), baseReadme);
      fs.mkdirSync(path.join(temporary, platform), { recursive: true });
      check(rejectsTerms('missing LICENSE.md'), 'promptfoo licence check excluded an installed platform SDK without LICENSE.md');
      const platformLicence = path.join(temporary, platform, 'LICENSE.md');
      fs.copyFileSync(path.join(PROJECT_ROOT, platform, 'LICENSE.md'), platformLicence);
      fs.appendFileSync(platformLicence, '\nchanged terms\n');
      check(rejectsTerms('no longer matches the verified Anthropic terms'), 'promptfoo licence check accepted changed SDK terms');
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  }
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
  const audited = (config['lockfile-age']?.exclude ?? []).map((entry) => entry.name).sort();
  check(
    JSON.stringify(excluded) === JSON.stringify(audited),
    `.npmrc excludes ${JSON.stringify(excluded)} from the floor and eval-quality.config.json excludes ${JSON.stringify(audited)} from the window; the two lists must be equal`,
  );
}

function main() {
  const binary = resolveBinary();
  const config = readJson(CONFIG_PATH, 'eval-quality.config.json');

  checkWiring(config);
  checkLicencesSeed();
  checkPromptfooLicenceScope(config);
  checkLockfileAgeSeed(binary);
  checkAbsentSection(binary);
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
