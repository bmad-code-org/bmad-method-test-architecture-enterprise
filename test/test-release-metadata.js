/**
 * Release metadata validation for publishable builds.
 *
 * Verifies:
 * - package.json, package-lock.json, and marketplace.json share the same version
 * - the package is not marked private
 * - publishConfig.access remains public
 * - the active stable-release step transports large changelog notes outside argv
 * - the `tea-evaluate` bin and the optional `eval-quality` peer (floor 4.1.4)
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

const projectRoot = path.join(__dirname, '..');
const packageJsonPath = path.join(projectRoot, 'package.json');
const packageLockPath = path.join(projectRoot, 'package-lock.json');
const marketplacePath = path.join(projectRoot, '.claude-plugin', 'marketplace.json');
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

// Evaluate's runtime: the bin, and eval-quality as an optional peer no older
// than 4.1.4. The lockfile's root entry mirrors package.json, so a manifest
// edit that skipped `npm install` is caught here too.
const EVALUATE_BIN = 'tea-evaluate';
const ENGINE_PACKAGE = 'eval-quality';
const ENGINE_FLOOR = '4.1.4';
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

if (releaseStep?.run) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-release-notes-'));
  try {
    const fakeBin = path.join(fixtureRoot, 'bin');
    const argsPath = path.join(fixtureRoot, 'gh-args.json');
    const stdinPath = path.join(fixtureRoot, 'gh-stdin.txt');
    const line = `- ${'release-note '.repeat(7)}`.trimEnd();
    const largeBody = Array.from({ length: 40_000 }, (_, index) => `${line}${index}`).join('\n');
    const expectedNotes = `### Fixed\n\n${largeBody}`;
    fs.mkdirSync(fakeBin);
    fs.writeFileSync(path.join(fixtureRoot, 'package.json'), '{"version":"9.9.9"}\n');
    fs.writeFileSync(
      path.join(fixtureRoot, 'CHANGELOG.md'),
      `# Changelog\n\n## [Unreleased]\n\n## [9.9.9] - 2026-09-17\n\n${expectedNotes}\n\n## [9.9.8] - 2026-09-16\n`,
    );
    const fakeGhPath = path.join(fakeBin, 'gh');
    fs.writeFileSync(
      fakeGhPath,
      `#!/usr/bin/env node\nconst fs = require('node:fs');\nconst args = process.argv.slice(2);\nfs.writeFileSync(process.env.GH_ARGS_FILE, JSON.stringify(args));\nconst index = args.findIndex((value) => value === '--notes-file' || value === '-F' || value.startsWith('--notes-file='));\nconst source = args[index]?.includes('=') ? args[index].slice(args[index].indexOf('=') + 1) : args[index + 1];\nif (!source) process.exit(2);\nif (source === '-') {\n  const chunks = [];\n  process.stdin.on('data', (chunk) => chunks.push(chunk));\n  process.stdin.on('end', () => fs.writeFileSync(process.env.GH_STDIN_FILE, Buffer.concat(chunks)));\n} else {\n  fs.writeFileSync(process.env.GH_STDIN_FILE, fs.readFileSync(source));\n}\n`,
    );
    fs.chmodSync(fakeGhPath, 0o755);

    const result = spawnSync('bash', ['-e', '-c', releaseStep.run], {
      cwd: fixtureRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
        GH_ARGS_FILE: argsPath,
        GH_STDIN_FILE: stdinPath,
      },
    });
    if (result.status === 0) {
      const args = JSON.parse(fs.readFileSync(argsPath, 'utf8'));
      const receivedNotes = fs.readFileSync(stdinPath, 'utf8');
      if (JSON.stringify(args.slice(0, 3)) !== JSON.stringify(['release', 'create', 'v9.9.9'])) {
        errors.push(`publish.yaml passed unexpected GitHub CLI arguments: ${JSON.stringify(args)}`);
      }
      if (args.some((argument) => Buffer.byteLength(argument) > 1024)) {
        errors.push('publish.yaml passed release-note content through a GitHub CLI argument.');
      }
      if (receivedNotes !== `\n${expectedNotes}\n`) {
        errors.push(
          `publish.yaml truncated or changed the ${Buffer.byteLength(expectedNotes)}-byte release notes body; received ${Buffer.byteLength(receivedNotes)} bytes.`,
        );
      }
    } else {
      errors.push(`publish.yaml failed to create a release from large notes: ${result.stderr || result.stdout}`);
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
