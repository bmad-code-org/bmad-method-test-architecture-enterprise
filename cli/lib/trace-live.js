'use strict';

const fs = require('node:fs');
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

/** Resolve the consuming working tree independently of agent-authored metadata. */
function currentSourceSha(projectRoot) {
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR']) delete env[key];
  const git = (...args) => spawnSync('git', ['-C', projectRoot, ...args], { encoding: 'utf8', env });
  const head = git('rev-parse', '--verify', 'HEAD');
  if (head.status === 0) return normalizedSha(head.stdout);
  return git('rev-parse', '--is-inside-work-tree').status === 0 ? '' : normalizedSha(process.env.GITHUB_SHA);
}

/** Hold the original manifest before the vendor runs. Invalid evidence stays unreadable. */
function captureLiveResults(file, projectRoot, enabled) {
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
  return { manifest, currentSha: currentSourceSha(projectRoot) };
}

function assertLiveSourceRevision(capture, projectRoot) {
  if (!capture) return;
  if (currentSourceSha(projectRoot) !== capture.currentSha)
    throw new Error('Trace source revision changed during the run; rerun with current live evidence.');
}

/** Mirror Steps 2-4 dispositions; the fresh-failure cap uses each record's actual SHA. */
function liveReference(capture, criterionIds) {
  if (!capture) return;
  const { manifest, currentSha } = capture;
  if (!manifest) return { present: true, freshness: 'unreadable', current_source_sha: currentSha, failed: 0, freshFailed: 0 };
  const seen = new Set();
  const records = manifest.results.map((entry) => {
    const row = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {};
    const id = asString(row.id),
      requirement = asString(row.requirement_id),
      status = asString(row.status).toLowerCase();
    const sha = normalizedSha(row.source_sha ?? manifest.source_sha);
    const duplicate = Boolean(id) && seen.has(id);
    if (id) seen.add(id);
    let disposition;
    if (!id || !requirement || !['pass', 'fail', 'blocked', 'skipped'].includes(status) || !sha || duplicate) disposition = 'invalid';
    else if (status !== 'pass') disposition = status;
    else if (!currentSha) disposition = 'unverifiable';
    else if (shaMatches(sha, currentSha)) {
      disposition = 'counted';
    } else {
      disposition = 'stale';
    }
    return { requirement, sha, disposition };
  });
  const failedRequirements = new Set(records.filter((row) => row.disposition === 'fail').map((row) => row.requirement));
  for (const row of records) {
    if (row.disposition !== 'counted') continue;
    if (!criterionIds.has(row.requirement)) row.disposition = 'unmatched';
    else if (failedRequirements.has(row.requirement)) row.disposition = 'contradicted';
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
  };
}

module.exports = { captureLiveResults, assertLiveSourceRevision, liveReference };
