/**
 * Builds `.lockfile-age-cache.json`, the publication cache `lockfile-age`
 * reads through `eval-quality.config.json`'s `cache` setting.
 *
 * A publication time is fixed the moment a version is published, so a cache
 * entry never goes stale; the gate uses one with no request when a name@version
 * is present, and falls back to a live fetch when it is not. This script reads
 * both committed lockfiles, fetches every unique package name once through the
 * same `fetchTimeMap` the gate itself calls, and writes every locked
 * name@version's real publish timestamp.
 *
 * Usage:
 *   node tools/generate-lockfile-age-cache.js
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const PROJECT_ROOT = path.join(__dirname, '..');

/**
 * `fetchTimeMap`, resolved through the package's own manifest rather than a
 * subpath export: the gates' internal modules carry no public export, the same
 * reason `test/test-supply-chain.js` resolves the `eval-quality-gates` binary
 * this way rather than importing it.
 */
async function loadFetchTimeMap() {
  const manifestPath = require.resolve('eval-quality/package.json');
  const auditModulePath = path.join(path.dirname(manifestPath), 'dist', 'gates', 'audit-lockfile-age.mjs');
  const module_ = await import(pathToFileURL(auditModulePath).href);
  return module_.fetchTimeMap;
}
const LOCKFILES = ['package-lock.json', 'website/package-lock.json'];
const CACHE_PATH = path.join(PROJECT_ROOT, '.lockfile-age-cache.json');
const CONCURRENCY = 8;

function collectEntries(lockfile) {
  const packages = lockfile.packages;
  if (packages === null || typeof packages !== 'object' || Array.isArray(packages)) {
    throw new Error('lockfile carries no "packages" object');
  }
  return Object.entries(packages)
    .filter(([pkgPath, meta]) => pkgPath !== '' && meta.version && !meta.link)
    .map(([pkgPath, meta]) => ({
      name: meta.name ?? pkgPath.split('node_modules/').pop().replace(/\/$/, ''),
      version: meta.version,
    }));
}

async function mapWithConcurrency(items, limit, fn) {
  const results = Array.from({ length: items.length });
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const current = cursor++;
      results[current] = await fn(items[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function main() {
  const fetchTimeMap = await loadFetchTimeMap();
  const allEntries = [];
  for (const relative of LOCKFILES) {
    const lockfile = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, relative), 'utf8'));
    allEntries.push(...collectEntries(lockfile));
  }

  const uniqueNames = [...new Set(allEntries.map((entry) => entry.name))];
  console.log(`Fetching publish times for ${uniqueNames.length} unique package name(s)...`);

  const timeMaps = new Map();
  const failures = [];
  await mapWithConcurrency(uniqueNames, CONCURRENCY, async (name) => {
    try {
      timeMaps.set(name, await fetchTimeMap(name));
    } catch (error) {
      failures.push(`${name}: ${error.message}`);
    }
  });

  if (failures.length > 0) {
    console.error(`Could not fetch ${failures.length} name(s):`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }

  const cache = {};
  let missing = 0;
  for (const { name, version } of allEntries) {
    const publishedAt = timeMaps.get(name)?.[version];
    if (!publishedAt) {
      console.error(`no publish time found for ${name}@${version}`);
      missing += 1;
      continue;
    }
    cache[`${name}@${version}`] = publishedAt;
  }

  if (missing > 0) {
    console.error(`${missing} entrie(s) had no publish time; cache not written`);
    process.exitCode = 1;
    return;
  }

  const sorted = Object.fromEntries(Object.entries(cache).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(CACHE_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`Wrote ${Object.keys(sorted).length} entrie(s) to ${path.relative(PROJECT_ROOT, CACHE_PATH)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
