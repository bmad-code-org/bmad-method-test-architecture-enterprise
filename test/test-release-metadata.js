/**
 * Release metadata validation for publishable builds.
 *
 * Verifies:
 * - package.json, package-lock.json, marketplace.json, and the bmod module record share the same version
 * - the package is not marked private
 * - publishConfig.access remains public
 * - the active stable-release step transports large changelog notes outside argv, posts notes that fit unchanged, and cuts notes over
 *   GitHub's 125,000 character limit at a bullet with a link to the full CHANGELOG section
 * - the release job that mints the GitHub App token and runs `git push` runs no tests, mints the token before checkout,
 *   and waits on the reused quality workflow (an installation token expires after an hour; the chain runs longer)
 * - the `tea-evaluate` bin and the optional `eval-quality` peer (floor 8.0.0)
 *   are declared, and package-lock.json's root entry carries the same
 *
 * Usage: node test/test-release-metadata.js
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const semver = require('semver');
const { parse: parseYaml } = require('yaml');
const { parse: parseToml } = require('smol-toml');

const projectRoot = path.join(__dirname, '..');
// GitHub rejects a release body longer than this many characters (HTTP 422).
const GITHUB_RELEASE_BODY_LIMIT = 125_000;
const packageJsonPath = path.join(projectRoot, 'package.json');
const packageLockPath = path.join(projectRoot, 'package-lock.json');
const marketplacePath = path.join(projectRoot, '.claude-plugin', 'marketplace.json');
const bmodPath = path.join(projectRoot, 'skills', 'bmod-tea', 'bmod.toml');
const publishWorkflowPath = path.join(projectRoot, '.github', 'workflows', 'publish.yaml');

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`Release metadata validation failed: unable to read ${label} at ${filePath}`);
    console.error(error.message);
    process.exit(1);
  }
}

function readText(filePath, label) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    console.error(`Release metadata validation failed: unable to read ${label} at ${filePath}`);
    console.error(error.message);
    process.exit(1);
  }
}

function releaseStepFrom(workflowSource) {
  try {
    const workflow = parseYaml(workflowSource);
    return workflow?.jobs?.publish?.steps?.find((step) => step?.name === 'Create GitHub Release');
  } catch (error) {
    console.error(`Release metadata validation failed: unable to parse publish.yaml at ${publishWorkflowPath}`);
    console.error(error.message);
    process.exit(1);
  }
}

/**
 * Why a workflow's release job can let its push token expire, or an empty list when it cannot.
 *
 * An installation token from `actions/create-github-app-token` lives one hour, and checkout persists it for the later `git push`.
 * The full test chain runs longer than that, so any job that mints the token or pushes must run no test itself: the tests belong in a
 * job it `needs`, and it mints the token in its first steps, before checkout.
 * The one test script allowed there is `test:release-metadata`, a few seconds long.
 */
function releaseTokenProblems(workflow) {
  const jobs = workflow?.jobs ?? {};
  const problems = [];
  const isMint = (step) => typeof step?.uses === 'string' && step.uses.startsWith('actions/create-github-app-token@');
  const isPush = (step) => typeof step?.run === 'string' && /\bgit push\b/.test(step.run);
  const isTest = (step) => {
    const run = typeof step?.run === 'string' ? step.run : '';
    if (/\bnpm\s+(?:run\s+)?test\b(?!:)/.test(run) || /\btools\/test-shards\.js\b/.test(run)) return true;
    return [...run.matchAll(/\bnpm\s+run\s+(test:[\w:-]+)/g)].some((match) => match[1] !== 'test:release-metadata');
  };
  const releaseJobs = Object.entries(jobs).filter(([, job]) => (job?.steps ?? []).some((step) => isMint(step) || isPush(step)));
  if (releaseJobs.length === 0) problems.push('no job mints the GitHub App token or runs git push, so the release cannot be checked');
  for (const [name, job] of releaseJobs) {
    const steps = job.steps ?? [];
    for (const step of steps.filter(isTest)) {
      problems.push(
        `job "${name}" mints the release token or pushes, and also runs the test step ${JSON.stringify(step.name ?? step.run)}; a long test run expires the token before the push, so run tests in a job it needs`,
      );
    }
    const mint = steps.findIndex(isMint);
    const checkout = steps.findIndex((step) => typeof step?.uses === 'string' && step.uses.startsWith('actions/checkout@'));
    if (mint === -1 || checkout === -1 || mint > checkout) {
      problems.push(
        `job "${name}" does not mint the GitHub App token before its checkout, so checkout would persist a stale or missing token`,
      );
    }
    const needs = [job.needs ?? []].flat();
    const reusesQuality = needs.some((need) => jobs[need]?.uses === './.github/workflows/quality.yaml');
    if (!reusesQuality)
      problems.push(`job "${name}" does not need a job that reuses ./.github/workflows/quality.yaml, so nothing tests the release`);
  }
  return problems;
}

const packageJson = readJson(packageJsonPath, 'package.json');
const packageLock = readJson(packageLockPath, 'package-lock.json');
const marketplace = readJson(marketplacePath, '.claude-plugin/marketplace.json');
const publishWorkflow = readText(publishWorkflowPath, 'publish.yaml');
const releaseStep = releaseStepFrom(publishWorkflow);
const marketplacePlugin = (marketplace.plugins || []).find((plugin) => plugin && plugin.name === packageJson.name);

const errors = [];

if (packageJson.private === true) {
  errors.push('package.json must not set "private": true when publishing to npm.');
}

if (packageJson.publishConfig?.access !== 'public') {
  errors.push('package.json must set publishConfig.access to "public".');
}

if (packageLock.version !== packageJson.version) {
  errors.push(`package-lock.json version ${packageLock.version} does not match package.json version ${packageJson.version}.`);
}

if (packageLock.packages?.['']?.version !== packageJson.version) {
  errors.push(
    `package-lock.json root package version ${packageLock.packages?.['']?.version} does not match package.json version ${packageJson.version}.`,
  );
}

if (!marketplacePlugin) {
  errors.push(`.claude-plugin/marketplace.json is missing the plugin entry for ${packageJson.name}.`);
} else if (marketplacePlugin.version !== packageJson.version) {
  errors.push(
    `.claude-plugin/marketplace.json version ${marketplacePlugin.version} does not match package.json version ${packageJson.version}.`,
  );
}

// The module record `bmad setup` reads carries the release version too. The publish workflow rewrites its version line and commits it
// with the other release files; running the same rewrite over the committed record has to be a no-op.
let bmodVersion = null;
try {
  bmodVersion = parseToml(readText(bmodPath, 'skills/bmod-tea/bmod.toml')).bmod?.version ?? null;
} catch (error) {
  errors.push(`skills/bmod-tea/bmod.toml does not parse: ${error.message}`);
}
if (bmodVersion !== packageJson.version) {
  errors.push(
    `skills/bmod-tea/bmod.toml [bmod] version ${JSON.stringify(bmodVersion)} does not match package.json version ${packageJson.version}.`,
  );
}
const syncStep = parseYaml(publishWorkflow)?.jobs?.publish?.steps?.find((step) => step?.name === 'Sync marketplace and bmod versions');
if (!syncStep?.run?.includes('skills/bmod-tea/bmod.toml')) {
  errors.push('publish.yaml has no step that syncs skills/bmod-tea/bmod.toml to the release version.');
}
const commitStep = parseYaml(publishWorkflow)?.jobs?.publish?.steps?.find((step) => step?.name === 'Commit version bump');
if (!commitStep?.run?.includes('skills/bmod-tea/bmod.toml')) {
  errors.push('publish.yaml does not commit skills/bmod-tea/bmod.toml with the version bump.');
}

// Evaluate's runtime: the bin, and eval-quality as an optional peer no older
// than 8.0.0. The lockfile's root entry mirrors package.json, so a manifest
// edit that skipped `npm install` is caught here too.
const EVALUATE_BIN = 'tea-evaluate';
const ENGINE_PACKAGE = 'eval-quality';
const ENGINE_FLOOR = '8.0.0';
const lockRoot = packageLock.packages?.[''] ?? {};

const evaluateBin = packageJson.bin?.[EVALUATE_BIN];
if (typeof evaluateBin !== 'string' || !fs.existsSync(path.join(projectRoot, evaluateBin))) {
  errors.push(`package.json bin["${EVALUATE_BIN}"] is ${JSON.stringify(evaluateBin ?? null)}; it must name a file the package carries.`);
}
if (lockRoot.bin?.[EVALUATE_BIN] !== evaluateBin) {
  errors.push(
    `package-lock.json root bin["${EVALUATE_BIN}"] ${JSON.stringify(lockRoot.bin?.[EVALUATE_BIN] ?? null)} does not match package.json.`,
  );
}

const peerRange = packageJson.peerDependencies?.[ENGINE_PACKAGE];
const peerFloor = typeof peerRange === 'string' && semver.validRange(peerRange) ? semver.minVersion(peerRange) : null;
if (peerFloor === null || semver.lt(peerFloor, ENGINE_FLOOR)) {
  errors.push(
    `package.json peerDependencies["${ENGINE_PACKAGE}"] is ${JSON.stringify(peerRange ?? null)}; its floor must be ${ENGINE_FLOOR} or later.`,
  );
}
if (packageJson.peerDependenciesMeta?.[ENGINE_PACKAGE]?.optional !== true) {
  errors.push(`package.json peerDependenciesMeta["${ENGINE_PACKAGE}"].optional must be true.`);
}
if (lockRoot.peerDependencies?.[ENGINE_PACKAGE] !== peerRange) {
  errors.push(`package-lock.json root peerDependencies["${ENGINE_PACKAGE}"] does not match package.json.`);
}
if (lockRoot.peerDependenciesMeta?.[ENGINE_PACKAGE]?.optional !== packageJson.peerDependenciesMeta?.[ENGINE_PACKAGE]?.optional) {
  errors.push(`package-lock.json root peerDependenciesMeta["${ENGINE_PACKAGE}"] does not match package.json.`);
}
// The lockfile pins the engine Evaluate's own suites run against, so it must resolve a release at or above the floor.
const lockedEngine = packageLock.packages?.[`node_modules/${ENGINE_PACKAGE}`]?.version;
if (typeof lockedEngine !== 'string' || !semver.valid(lockedEngine) || semver.lt(lockedEngine, ENGINE_FLOOR)) {
  errors.push(
    `package-lock.json node_modules/${ENGINE_PACKAGE} resolves ${JSON.stringify(lockedEngine ?? null)}; it must resolve ${ENGINE_FLOOR} or later.`,
  );
}

// The release job's push token must be fresh: no test step beside it, minted before checkout, behind the reused quality workflow.
{
  const workflow = parseYaml(publishWorkflow);
  for (const problem of releaseTokenProblems(workflow)) errors.push(`publish.yaml: ${problem}.`);

  // The check must be able to fail. Each mutation puts one old shape back: the chain in the pushing job, a test script beside the push,
  // the token minted after checkout, and the quality workflow no longer needed.
  const mutate = (edit) => {
    const copy = structuredClone(workflow);
    edit(copy.jobs.publish);
    return copy;
  };
  const mutations = {
    'an npm test step in the pushing job': (job) => job.steps.splice(5, 0, { name: 'Run tests', run: 'npm test' }),
    'a chained test script in the pushing job': (job) => job.steps.push({ name: 'Run a suite', run: 'npm run test:cli' }),
    'the test shards in the pushing job': (job) => job.steps.push({ name: 'Run a shard', run: 'node tools/test-shards.js --shard 1/21' }),
    'the token minted after checkout': (job) => job.steps.push(job.steps.shift()),
    'no need on the quality workflow': (job) => delete job.needs,
  };
  for (const [name, edit] of Object.entries(mutations)) {
    if (releaseTokenProblems(mutate(edit)).length === 0) errors.push(`the release token check passed a publish workflow with ${name}.`);
  }
}

if (releaseStep?.run) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-release-notes-'));
  try {
    const fakeBin = path.join(fixtureRoot, 'bin');
    const argsPath = path.join(fixtureRoot, 'gh-args.json');
    const stdinPath = path.join(fixtureRoot, 'gh-stdin.txt');
    fs.mkdirSync(fakeBin);
    const fakeGhPath = path.join(fakeBin, 'gh');
    fs.writeFileSync(
      fakeGhPath,
      `#!/usr/bin/env node\nconst fs = require('node:fs');\nconst args = process.argv.slice(2);\nfs.writeFileSync(process.env.GH_ARGS_FILE, JSON.stringify(args));\nconst index = args.findIndex((value) => value === '--notes-file' || value === '-F' || value.startsWith('--notes-file='));\nconst source = args[index]?.includes('=') ? args[index].slice(args[index].indexOf('=') + 1) : args[index + 1];\nif (!source) process.exit(2);\nif (source === '-') {\n  const chunks = [];\n  process.stdin.on('data', (chunk) => chunks.push(chunk));\n  process.stdin.on('end', () => fs.writeFileSync(process.env.GH_STDIN_FILE, Buffer.concat(chunks)));\n} else {\n  fs.writeFileSync(process.env.GH_STDIN_FILE, fs.readFileSync(source));\n}\n`,
    );
    fs.chmodSync(fakeGhPath, 0o755);

    // Runs the real release step in the fixture folder against a fake `gh` and returns what `gh` was handed.
    const runReleaseStep = (changelog) => {
      for (const file of [argsPath, stdinPath]) fs.rmSync(file, { force: true });
      fs.writeFileSync(path.join(fixtureRoot, 'package.json'), '{"version":"9.9.9"}\n');
      fs.writeFileSync(path.join(fixtureRoot, 'CHANGELOG.md'), changelog);
      // `tools/` is the real tool the step calls; the fixture folder is the step's working directory.
      fs.rmSync(path.join(fixtureRoot, 'tools'), { recursive: true, force: true });
      fs.symlinkSync(path.join(projectRoot, 'tools'), path.join(fixtureRoot, 'tools'));
      const result = spawnSync('bash', ['-e', '-c', releaseStep.run], {
        cwd: fixtureRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
          GH_ARGS_FILE: argsPath,
          GH_STDIN_FILE: stdinPath,
          GITHUB_REPOSITORY: 'owner/repo',
        },
      });
      if (result.status !== 0) return { failure: result.stderr || result.stdout };
      return { args: JSON.parse(fs.readFileSync(argsPath, 'utf8')), notes: fs.readFileSync(stdinPath, 'utf8') };
    };
    const checkGhArguments = (label, args) => {
      if (JSON.stringify(args.slice(0, 3)) !== JSON.stringify(['release', 'create', 'v9.9.9'])) {
        errors.push(`publish.yaml passed unexpected GitHub CLI arguments for ${label}: ${JSON.stringify(args)}`);
      }
      if (args.some((argument) => Buffer.byteLength(argument) > 1024)) {
        errors.push(`publish.yaml passed ${label} release-note content through a GitHub CLI argument.`);
      }
    };
    const bulletLine = `- ${'release-note '.repeat(7)}`.trimEnd();
    const bulletsBody = (count) => Array.from({ length: count }, (_, index) => `${bulletLine}${index}`).join('\n');
    const changelogWith = (notes, unreleased = '') =>
      `# Changelog\n\n## [Unreleased]${unreleased}\n\n## [9.9.9] - 2026-09-17\n\n${notes}\n\n## [9.9.8] - 2026-09-16\n`;

    // Notes within the budget reach `gh` byte for byte, through stdin.
    const fittingNotes = `### Fixed\n\n${bulletsBody(1000)}`;
    const fitting = runReleaseStep(changelogWith(fittingNotes));
    if (fitting.failure) {
      errors.push(`publish.yaml failed to create a release from large notes: ${fitting.failure}`);
    } else {
      checkGhArguments('large notes', fitting.args);
      if (fitting.notes !== `\n${fittingNotes}\n`) {
        errors.push(
          `publish.yaml changed the ${Buffer.byteLength(fittingNotes)}-byte release notes body that fits in a GitHub Release; received ${Buffer.byteLength(fitting.notes)} bytes.`,
        );
      }
    }

    // Notes over GitHub's 125,000 character limit are cut at a bullet and point at the full CHANGELOG section.
    const overlongBullets = bulletsBody(40_000);
    const overlong = runReleaseStep(changelogWith(`### Fixed\n\n${overlongBullets}`));
    if (overlong.failure) {
      errors.push(`publish.yaml failed to create a release from notes over the GitHub limit: ${overlong.failure}`);
    } else {
      checkGhArguments('notes over the limit', overlong.args);
      const link = 'https://github.com/owner/repo/blob/v9.9.9/CHANGELOG.md#999---2026-09-17';
      const pointer = `These notes are longer than a GitHub Release allows, so this page shows the first part. The full notes for 9.9.9 are in [CHANGELOG.md](${link}).\n\n`;
      const closing = `\n\n_Truncated here. Continue in [CHANGELOG.md](${link})._\n`;
      const received = overlong.notes;
      if (received.length >= GITHUB_RELEASE_BODY_LIMIT) {
        errors.push(
          `publish.yaml posted ${received.length} characters of release notes; GitHub rejects a body over ${GITHUB_RELEASE_BODY_LIMIT}.`,
        );
      }
      if (!received.startsWith(pointer))
        errors.push('publish.yaml did not start over-limit release notes with the pointer to the full CHANGELOG section.');
      if (!received.endsWith(closing))
        errors.push('publish.yaml did not end over-limit release notes with the truncation line linking the CHANGELOG section.');
      const kept = received.slice(pointer.length, received.length - closing.length);
      const original = `### Fixed\n\n${overlongBullets}`;
      if (!original.startsWith(kept) || !original.slice(kept.length).startsWith('\n- ')) {
        errors.push('publish.yaml did not cut over-limit release notes at a top-level bullet boundary.');
      }
    }
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
} else {
  errors.push('publish.yaml must define an active Create GitHub Release command.');
}

if (errors.length > 0) {
  console.error('Release metadata validation failed:\n');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Release metadata is synchronized and publishable for v${packageJson.version}.`);
