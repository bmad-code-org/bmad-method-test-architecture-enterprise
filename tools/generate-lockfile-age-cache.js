/**
 * Builds `.lockfile-age-cache.json`, the publication cache `lockfile-age`
 * reads through `eval-quality.config.json`'s `cache` setting.
 *
 * A publication time is fixed the moment a version is published, so a cache
 * entry never goes stale; the gate uses one with no request when a name@version
 * is present, and falls back to a live fetch when it is not. This script reads
 * both committed lockfiles, fetches every unique package name once against the
 * public npm registry, and writes every locked name@version's real publish
 * timestamp. The cache file's shape is all the gate reads; it has no opinion on
 * how an entry was produced.
 *
 * `fetchTimeMap` here is TEA's own, rather than the same-named function
 * `eval-quality`'s `dist/gates/audit-lockfile-age.mjs` carries: that module
 * sits outside the package's declared `exports`, so importing it would be
 * exactly the unexported-internals reach `dependency-direction` exists to
 * catch, in the gate's own package. The registry request it makes is one GET
 * per package name against a documented public endpoint, small enough that
 * duplicating it here is cheaper and more robust than depending on a path
 * `eval-quality` has not published.
 *
 * Usage:
 *   node tools/generate-lockfile-age-cache.js
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.join(__dirname, '..');
const REGISTRY_PREFIX = 'https://registry.npmjs.org/';
const FETCH_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 500;

function registryUrlForName(name) {
  const encoded = name.startsWith('@') ? `${name.split('/')[0]}/${encodeURIComponent(name.split('/')[1])}` : encodeURIComponent(name);
  return `${REGISTRY_PREFIX}${encoded}`;
}

class NonRetryableFetchError extends Error {}

async function fetchWithRetry(url, attempts = MAX_RETRIES) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (res.ok) return await res.json();
      if (res.status !== 429 && res.status < 500) throw new NonRetryableFetchError(`HTTP ${res.status}`);
      throw new Error(`HTTP ${res.status}`);
    } catch (error) {
      lastError = error;
      if (error instanceof NonRetryableFetchError) break;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_MS * attempt));
    }
  }
  throw lastError;
}

/** One registry request per unique package name; the response carries a `time` map covering every published version. */
async function fetchTimeMap(name) {
  const meta = await fetchWithRetry(registryUrlForName(name));
  return meta.time ?? {};
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

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { fetchTimeMap, registryUrlForName };
