/** Verify promptfoo's optional Claude SDK terms, then run the SPDX licence gate. */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SDK = '@anthropic-ai/claude-agent-sdk';
const LEGAL = 'https://code.claude.com/docs/en/legal-and-compliance';
const PROMPTFOO_TOLERANCES = [
  'big-integer',
  'binaryextensions',
  'editions',
  'fast-sha256',
  'istextorbinary',
  'textextensions',
  'url-template',
  'version-range',
];

function packageName(lockPath) {
  return lockPath.slice(lockPath.lastIndexOf('node_modules/') + 'node_modules/'.length);
}

function verifyPromptfooToleranceScope(lock, config) {
  for (const prefix of PROMPTFOO_TOLERANCES) {
    const tolerances = config.licences.tolerances.filter((entry) => entry.prefix === prefix);
    if (
      tolerances.length !== 1 ||
      JSON.stringify(tolerances[0].lockfiles) !== JSON.stringify(['package-lock.json']) ||
      tolerances[0].marker?.contains !== '"promptfoo": "latest"'
    ) {
      throw new Error(`promptfoo licence tolerance ${prefix} changed scope`);
    }
    const matches = Object.keys(lock.packages).filter((name) => packageName(name).startsWith(prefix));
    if (matches.length !== 1 || matches[0] !== `node_modules/${prefix}`) {
      throw new Error(`promptfoo licence tolerance ${prefix} matches an additional or missing lockfile package: ${matches.join(', ')}`);
    }
  }
}

function omitVerifiedOptionalSdk(lock, installedRoot = ROOT) {
  const promptfoo = lock.packages['node_modules/promptfoo'];
  if (lock.packages[''].devDependencies?.promptfoo !== 'latest' || !promptfoo) {
    throw new Error('promptfoo must remain an installed floating devDependency');
  }
  const sdkVersion = promptfoo.optionalDependencies?.[SDK];
  const entries = Object.entries(lock.packages).filter(([name]) => packageName(name).startsWith(SDK));
  if (sdkVersion === undefined) {
    if (entries.length > 0) throw new Error('unexpected Claude SDK entries without a promptfoo optional dependency');
    return [];
  }
  const base = entries.filter(([name]) => packageName(name) === SDK);
  if (base.length !== 1) throw new Error(`promptfoo's optional Claude SDK has ${base.length} lock entries, expected one`);
  const [basePath, basePackage] = base[0];
  if (basePackage.optional !== true || basePackage.version !== sdkVersion || basePackage.license !== 'SEE LICENSE IN README.md') {
    throw new Error('promptfoo Claude SDK metadata changed; review its licence before excluding it from the SPDX gate');
  }
  const baseLicense = path.join(installedRoot, basePath, 'LICENSE.md');
  const readme = path.join(installedRoot, basePath, 'README.md');
  if (!fs.readFileSync(baseLicense, 'utf8').includes(LEGAL) || !fs.readFileSync(readme, 'utf8').includes('Commercial Terms of Service')) {
    throw new Error('the installed Claude SDK no longer names the verified Anthropic terms');
  }
  const expected = new Set([SDK, ...Object.keys(basePackage.optionalDependencies ?? {})]);
  if (entries.length !== expected.size) throw new Error('the optional Claude SDK lock graph differs from its declared platform packages');
  for (const [name, entry] of entries) {
    const packageId = packageName(name);
    if (!expected.delete(packageId)) throw new Error(`unexpected Claude SDK package ${packageId}`);
    if (packageId === SDK) continue;
    if (
      entry.optional !== true ||
      entry.version !== basePackage.optionalDependencies[packageId] ||
      entry.license !== 'SEE LICENSE IN LICENSE.md'
    ) {
      throw new Error(`the optional ${packageId} licence metadata changed`);
    }
    const installedLicense = path.join(installedRoot, name, 'LICENSE.md');
    if (
      fs.existsSync(path.join(installedRoot, name)) &&
      (!fs.existsSync(installedLicense) || !fs.readFileSync(installedLicense, 'utf8').includes(LEGAL))
    ) {
      throw new Error(`the installed ${packageId} no longer names the verified Anthropic terms`);
    }
  }
  const removed = entries.map(([name]) => name);
  for (const name of removed) delete lock.packages[name];
  return removed;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length > 0 && (args.length !== 2 || args[0] !== '--lockfile')) {
    throw new Error('usage: node tools/check-licences.js [--lockfile path]');
  }
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-licences-'));
  try {
    const lock = JSON.parse(fs.readFileSync(args.length === 2 ? path.resolve(args[1]) : path.join(ROOT, 'package-lock.json'), 'utf8'));
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'eval-quality.config.json'), 'utf8'));
    verifyPromptfooToleranceScope(lock, config);
    const excluded = omitVerifiedOptionalSdk(lock);
    fs.writeFileSync(path.join(temporary, 'package-lock.json'), `${JSON.stringify(lock)}\n`);
    fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(temporary, 'package.json'));
    fs.mkdirSync(path.join(temporary, 'website'));
    for (const file of ['package.json', 'package-lock.json']) {
      fs.copyFileSync(path.join(ROOT, 'website', file), path.join(temporary, 'website', file));
    }
    fs.writeFileSync(path.join(temporary, 'eval-quality.config.json'), `${JSON.stringify({ licences: config.licences })}\n`);
    const result = spawnSync(
      path.join(ROOT, 'node_modules', '.bin', 'eval-quality-gates'),
      ['licences', '--config', path.join(temporary, 'eval-quality.config.json')],
      { cwd: ROOT, encoding: 'utf8', timeout: 30_000 },
    );
    process.stdout.write(`Verified ${excluded.length} optional Claude SDK lock entries against installed licence evidence.\n`);
    process.stdout.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    if (result.error) throw result.error;
    if (!Number.isInteger(result.status)) throw new Error(`the licence gate ended without an exit status: ${result.signal}`);
    process.exitCode = result.status;
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

if (require.main === module) main();

module.exports = { omitVerifiedOptionalSdk };
