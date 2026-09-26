/** Verify promptfoo's optional Claude SDK terms, then run the SPDX licence gate. */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { isDeepStrictEqual } = require('node:util');

const ROOT = path.join(__dirname, '..');
const SDK = '@anthropic-ai/claude-agent-sdk';
const LEGAL = 'https://code.claude.com/docs/en/legal-and-compliance';
const TERMS_SHA256 = '8ce94b9478bb9868f9641f818e06cd722fbe55d4c22e2d2ed11971b20146173a';
const README_SHA256 = 'a923405f92c474ca40c62d0b5ffb2897aba56f779a7ea36807555b1553d0cdab';
const PROMPTFOO_MARKER = { file: 'package.json', contains: '"promptfoo": "latest"' };
const PROMPTFOO_TOLERANCES = {
  'big-integer': { license: 'Unlicense', optional: true },
  binaryextensions: { license: 'Artistic-2.0', optional: false },
  editions: { license: 'Artistic-2.0', optional: false },
  'fast-sha256': { license: 'Unlicense', optional: false },
  istextorbinary: { license: 'Artistic-2.0', optional: false },
  textextensions: { license: 'Artistic-2.0', optional: false },
  'url-template': { license: 'BSD', optional: true },
  'version-range': { license: 'Artistic-2.0', optional: false },
};
const PROMPTFOO_UNDECLARED = {
  sylvester: {
    lockfiles: ['package-lock.json'],
    prefix: 'sylvester',
    readAs: 'MIT',
    evidence: 'The installed sylvester 0.0.21 LICENSE.txt contains the MIT permission grant and copyright notice.',
    reason: 'Promptfoo reaches sylvester through natural; its published package metadata omits a license field.',
  },
  'xmlhttprequest-ssl': {
    lockfiles: ['package-lock.json'],
    prefix: 'xmlhttprequest-ssl',
    readAs: 'MIT',
    evidence:
      'The installed xmlhttprequest-ssl 2.1.2 LICENSE contains the MIT permission grant and copyright notice; its README also identifies MIT.',
    reason: 'Promptfoo reaches xmlhttprequest-ssl through socket.io-client; its published package metadata omits a license field.',
  },
};
const PROMPTFOO_UNDECLARED_LOCK = {
  sylvester: {
    version: '0.0.21',
    resolved: 'https://registry.npmjs.org/sylvester/-/sylvester-0.0.21.tgz',
    licenseFile: 'LICENSE.txt',
    licenseSha256: '8bea0903547780c013d4a7117692eb130c014abc5d61fadcf12625473a6908da',
  },
  'xmlhttprequest-ssl': {
    version: '2.1.2',
    resolved: 'https://registry.npmjs.org/xmlhttprequest-ssl/-/xmlhttprequest-ssl-2.1.2.tgz',
    licenseFile: 'LICENSE',
    licenseSha256: 'a5f35901ee8b2039a7431144c23dd10bd47c1d07bcee0cd3a536421d86412214',
  },
};

function packageName(lockPath) {
  return lockPath.slice(lockPath.lastIndexOf('node_modules/') + 'node_modules/'.length);
}

function verifyPromptfooToleranceScope(lock, config) {
  const scoped = config.licences.tolerances.filter(
    (entry) => Object.hasOwn(PROMPTFOO_TOLERANCES, entry.prefix) || entry.marker?.contains === PROMPTFOO_MARKER.contains,
  );
  if (scoped.length !== Object.keys(PROMPTFOO_TOLERANCES).length) {
    throw new Error('the approved promptfoo licence tolerance set changed');
  }
  for (const [prefix, terms] of Object.entries(PROMPTFOO_TOLERANCES)) {
    const tolerances = scoped.filter((entry) => entry.prefix === prefix);
    const entry = tolerances[0];
    if (
      !entry ||
      tolerances.length !== 1 ||
      !isDeepStrictEqual(
        { prefix: entry.prefix, license: entry.license, optional: entry.optional, lockfiles: entry.lockfiles, marker: entry.marker },
        { prefix, ...terms, lockfiles: ['package-lock.json'], marker: PROMPTFOO_MARKER },
      )
    )
      throw new Error(`promptfoo licence tolerance ${prefix} changed its approved tuple`);
    const matches = Object.keys(lock.packages).filter((name) => packageName(name).startsWith(prefix));
    if (matches.length !== 1 || matches[0] !== `node_modules/${prefix}`) {
      throw new Error(`promptfoo licence tolerance ${prefix} matches an additional or missing lockfile package: ${matches.join(', ')}`);
    }
  }
}

function verifyPromptfooUndeclaredScope(lock, config, installedRoot = ROOT) {
  const scoped = config.licences.undeclared.filter(
    (entry) =>
      Object.keys(PROMPTFOO_UNDECLARED).some((prefix) => entry.prefix?.startsWith(prefix)) ||
      entry.reason?.startsWith('Promptfoo reaches '),
  );
  if (scoped.length !== Object.keys(PROMPTFOO_UNDECLARED).length) {
    throw new Error('the approved promptfoo undeclared licence set changed');
  }
  for (const [prefix, approved] of Object.entries(PROMPTFOO_UNDECLARED)) {
    const entries = scoped.filter((entry) => entry.prefix === prefix);
    if (entries.length !== 1 || !isDeepStrictEqual(entries[0], approved)) {
      throw new Error(`promptfoo undeclared licence ${prefix} changed its approved tuple`);
    }
    const matches = Object.keys(lock.packages).filter((name) => packageName(name).startsWith(prefix));
    if (matches.length !== 1 || matches[0] !== `node_modules/${prefix}`) {
      throw new Error(`promptfoo undeclared licence ${prefix} matches an additional or missing lockfile package: ${matches.join(', ')}`);
    }
    const approvedLock = PROMPTFOO_UNDECLARED_LOCK[prefix];
    const locked = lock.packages[matches[0]];
    if (locked.version !== approvedLock.version || locked.resolved !== approvedLock.resolved) {
      throw new Error(`promptfoo undeclared licence ${prefix} changed its approved locked version or registry tarball`);
    }
    const licenseFile = path.join(installedRoot, matches[0], approvedLock.licenseFile);
    if (!fs.existsSync(licenseFile)) throw new Error(`the installed ${prefix} is missing ${approvedLock.licenseFile}`);
    const licenseDigest = createHash('sha256').update(fs.readFileSync(licenseFile)).digest('hex');
    if (licenseDigest !== approvedLock.licenseSha256) {
      throw new Error(`the installed ${prefix} licence file no longer matches the approved evidence`);
    }
  }
}

function verifyInstalledTerms(file, packageId) {
  if (!fs.existsSync(file)) throw new Error(`the installed ${packageId} is missing LICENSE.md`);
  const terms = fs.readFileSync(file, 'utf8');
  const digest = createHash('sha256').update(terms).digest('hex');
  if (!terms.includes(LEGAL) || digest !== TERMS_SHA256) {
    throw new Error(`the installed ${packageId} no longer matches the verified Anthropic terms`);
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
  verifyInstalledTerms(baseLicense, SDK);
  if (!fs.existsSync(readme)) throw new Error(`the installed ${SDK} is missing README.md`);
  const readmeText = fs.readFileSync(readme, 'utf8');
  if (!readmeText.includes('Commercial Terms of Service') || createHash('sha256').update(readmeText).digest('hex') !== README_SHA256) {
    throw new Error('the installed Claude SDK README.md no longer matches the verified Anthropic terms');
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
    if (fs.existsSync(path.join(installedRoot, name))) verifyInstalledTerms(installedLicense, packageId);
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
    verifyPromptfooUndeclaredScope(lock, config);
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

module.exports = { omitVerifiedOptionalSdk, verifyPromptfooToleranceScope, verifyPromptfooUndeclaredScope };
