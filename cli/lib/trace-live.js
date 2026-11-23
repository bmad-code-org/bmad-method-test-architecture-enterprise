'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const normalizedSha = (value) => {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const text = String(value).trim().toLowerCase();
  return /^[0-9a-f]{7,64}$/.test(text) ? text : '';
};
const shaMatches = (left, right) => {
  const a = normalizedSha(left),
    b = normalizedSha(right);
  return Boolean(a && b && (a.startsWith(b) || b.startsWith(a)));
};
const asString = (value) => (typeof value === 'string' ? value.trim() : '');

const REPOSITORY_ENV = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR'];

/**
 * The `safe.directory` entries of the user's system and global Git config, in the order Git reads them. Git honors
 * this key only from protected config, so a checkout owned by another user (a container job, where
 * `actions/checkout` adds the entry globally) is refused once that config is hidden. Read in the user's normal
 * environment, outside any repository, so the repository's own config cannot add one, and through the files those
 * scopes include, as Git reads them.
 */
function safeDirectories() {
  const env = { ...process.env };
  for (const key of REPOSITORY_ENV) delete env[key];
  const values = [];
  for (const scope of ['--system', '--global']) {
    // --includes: a scoped read skips include.path files unless asked, and plain Git reads them. -z: a value may hold
    // a newline, so values are NUL-terminated; an empty value (which resets the list) is kept.
    const result = spawnSync('git', ['config', scope, '--includes', '-z', '--get-all', 'safe.directory'], {
      encoding: 'utf8',
      env,
      cwd: os.tmpdir(),
    });
    if (result.status === 0 && result.stdout) values.push(...result.stdout.split('\0').slice(0, -1));
  }
  return values;
}

function git(projectRoot, ...args) {
  // The user's config stays out (aliases, hooks and the like), except `safe.directory`, passed on the command line,
  // which Git also honors, so Trace reads HEAD wherever plain `git` can.
  const trusted = safeDirectories().flatMap((value) => ['-c', `safe.directory=${value}`]);
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  for (const key of REPOSITORY_ENV) delete env[key];
  return spawnSync('git', [...trusted, '-C', projectRoot, ...args], { encoding: 'utf8', env });
}

/** The project's own full Git object ID for HEAD, or '' when Git does not resolve one. */
function gitHead(projectRoot) {
  const head = git(projectRoot, 'rev-parse', '--verify', 'HEAD');
  const sha = head.status === 0 ? normalizedSha(head.stdout) : '';
  return sha.length === 40 || sha.length === 64 ? sha : '';
}

/** Resolve the consuming working tree independently of agent-authored metadata; outside Git, the CI revision. */
function currentSourceSha(projectRoot) {
  const head = gitHead(projectRoot);
  if (head) return head;
  const location = git(projectRoot, 'rev-parse', '--is-inside-work-tree');
  // An unreadable or untrusted checkout is not a source archive. Refuse the
  // CI fallback if Git failed or if checkout metadata is still present.
  if (location.error || location.status !== 128) return '';
  let directory;
  try {
    directory = fs.realpathSync(projectRoot);
  } catch {
    return '';
  }
  for (; ; directory = path.dirname(directory)) {
    try {
      fs.lstatSync(path.join(directory, '.git'));
      return '';
    } catch (error) {
      if (error.code !== 'ENOENT') return '';
    }
    if (directory === path.dirname(directory)) break;
  }
  return normalizedSha(process.env.GITHUB_SHA);
}

/**
 * Hold the original manifest before the vendor runs. Invalid evidence stays unreadable. Pass
 * currentSha when the caller already sampled the revision, so every check reuses one snapshot.
 */
function captureLiveResults(file, projectRoot, enabled, currentSha = currentSourceSha(projectRoot)) {
  if (!enabled || !fs.existsSync(file)) return;
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (
      !manifest ||
      typeof manifest !== 'object' ||
      Array.isArray(manifest) ||
      !Array.isArray(manifest.results) ||
      String(manifest.schema_version ?? '').split('.')[0] !== '0'
    )
      manifest = null;
  } catch {
    manifest = null;
  }
  return { manifest, currentSha };
}

/** Fail when HEAD moved since capture; pass head when the caller already read it. */
function assertLiveSourceRevision(capture, projectRoot, head) {
  if (!capture) return;
  if ((head ?? currentSourceSha(projectRoot)) !== capture.currentSha)
    throw new Error('Trace source revision changed during the run; rerun with current live evidence.');
}

/** The local part of a qualified id: `AC-1` of `shop--e1-s2--AC-1`, `R1` of `shop--e1--R1`. */
const localId = (id) => id.slice(id.lastIndexOf('--') + 2);

/**
 * Requirement-oracle live identity, the rule Trace Step 3 states: a qualified criterion id
 * (`<story key>--<criterion id>`) maps to itself; a local id (`AC-1`) maps to the one criterion
 * carrying it. A local id two criteria carry, or a requirement row's id (qualified or local `R<n>`),
 * maps to an unmatched reason. Entries are set in that order and never overwritten. Ids absent from
 * the map are unknown.
 */
function liveAliasMap(criterionIds, requirementIds = []) {
  const aliases = new Map();
  const carriers = new Map();
  for (const id of criterionIds) {
    aliases.set(id, { id });
    carriers.set(localId(id), [...(carriers.get(localId(id)) ?? []), id]);
  }
  for (const id of requirementIds) if (!aliases.has(id)) aliases.set(id, { reason: 'requirement-row' });
  for (const [key, ids] of carriers)
    if (!aliases.has(key)) aliases.set(key, ids.length === 1 ? { id: ids[0] } : { reason: 'ambiguous-local-id', carriers: ids });
  for (const id of requirementIds) if (!aliases.has(localId(id))) aliases.set(localId(id), { reason: 'requirement-row' });
  return aliases;
}

/**
 * Mirror Steps 2-4 dispositions; the fresh-failure cap uses each record's actual SHA. Records are
 * normalized through `aliases` before failure grouping, so a pass and a fail for one criterion meet
 * whichever spelling each used; the supplied id stays on the record for diagnostics.
 */
function liveReference(capture, aliases) {
  if (!capture) return;
  const { manifest, currentSha } = capture;
  if (!manifest) return { present: true, freshness: 'unreadable', current_source_sha: currentSha, failed: 0, freshFailed: 0 };
  const seen = new Set();
  const records = manifest.results.map((entry) => {
    const row = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {};
    const id = asString(row.id),
      supplied = asString(row.requirement_id),
      status = asString(row.status).toLowerCase();
    const sha = normalizedSha(row.source_sha ?? manifest.source_sha);
    const duplicate = Boolean(id) && seen.has(id);
    if (id) seen.add(id);
    let disposition;
    if (!id || !supplied || !['pass', 'fail', 'blocked', 'skipped'].includes(status) || !sha || duplicate) disposition = 'invalid';
    else if (status !== 'pass') disposition = status;
    else if (!currentSha) disposition = 'unverifiable';
    else if (shaMatches(sha, currentSha)) {
      disposition = 'counted';
    } else {
      disposition = 'stale';
    }
    const resolved = aliases.get(supplied);
    return { id, supplied, requirement: resolved?.id ?? supplied, resolved, sha, disposition, reason: null };
  });
  const failedRequirements = new Set(records.filter((row) => row.disposition === 'fail').map((row) => row.requirement));
  for (const row of records) {
    if (row.disposition !== 'counted') continue;
    if (!row.resolved?.id) {
      row.disposition = 'unmatched';
      row.reason = row.resolved?.reason ?? 'unknown-id';
    } else if (failedRequirements.has(row.requirement)) row.disposition = 'contradicted';
  }
  const count = (status) => records.filter((row) => row.disposition === status).length;
  return {
    present: true,
    current_source_sha: currentSha,
    failed: count('fail'),
    freshness: currentSha
      ? count('stale') + count('unverifiable') === 0
        ? 'fresh'
        : count('counted') > 0
          ? 'mixed'
          : 'stale'
      : 'unverifiable',
    freshFailed: records.filter((row) => row.disposition === 'fail' && shaMatches(row.sha, currentSha)).length,
    records: records.map((row) => ({
      id: row.id,
      supplied_requirement_id: row.supplied,
      requirement_id: row.requirement,
      disposition: row.disposition,
      reason: row.reason,
    })),
  };
}

module.exports = {
  normalizedSha,
  gitHead,
  currentSourceSha,
  safeDirectories,
  captureLiveResults,
  assertLiveSourceRevision,
  liveAliasMap,
  liveReference,
  localId,
};
