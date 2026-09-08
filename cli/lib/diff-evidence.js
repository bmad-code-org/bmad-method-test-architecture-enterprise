/**
 * Build deterministic, local git evidence for finding provenance.
 *
 * A PR review uses the same <base>...HEAD comparison as changed-tests.js.
 * Added files and pure additions are "introduced". Replacement lines are
 * "modified". Findings on every other line are "pre_existing".
 */

const { spawnSync } = require('node:child_process');

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function gitDiffError(base, projectRoot, detail) {
  const error = new Error(`git diff ${base}...HEAD failed in ${projectRoot}:\n${detail}`);
  error.code = 'GIT_DIFF_FAILED';
  return error;
}

function assertBase(base) {
  if (typeof base !== 'string' || base.length === 0 || base.startsWith('-')) {
    const error = new Error(`git base ref ${JSON.stringify(base)} is empty or looks like a git option; refusing to run git diff with it.`);
    error.code = 'BASE_UNRESOLVABLE';
    throw error;
  }
}

function runGitDiff(args, { base, projectRoot }) {
  assertBase(base);
  const result = spawnSync('git', ['-c', 'core.quotePath=false', 'diff', ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  if (result.error || result.status !== 0) {
    const detail = ((result.stderr || '').trim() || (result.error && result.error.message) || 'unknown git error').trim();
    throw gitDiffError(base, projectRoot, detail);
  }
  return result.stdout;
}

function changedRanges(patch) {
  const ranges = [];
  for (const line of patch.split(/\r?\n/)) {
    const match = HUNK_HEADER.exec(line);
    if (!match) continue;
    const oldCount = match[2] === undefined ? 1 : Number.parseInt(match[2], 10);
    const start = Number.parseInt(match[3], 10);
    const count = match[4] === undefined ? 1 : Number.parseInt(match[4], 10);
    if (count > 0) {
      ranges.push({ start, end: start + count - 1, provenance: oldCount === 0 ? 'introduced' : 'modified' });
    }
  }
  return ranges;
}

/**
 * @returns {Map<string, {fileStatus: 'added'|'modified',
 *   changedRanges: Array<{start:number,end:number,provenance:'introduced'|'modified'}>}>}
 */
function getDiffEvidence({ base, projectRoot, files }) {
  const addedOutput = runGitDiff(['--name-only', '--diff-filter=A', '-z', `${base}...HEAD`, '--'], {
    base,
    projectRoot,
  });
  const addedFiles = new Set(addedOutput.split('\0').filter(Boolean));
  const evidence = new Map();

  for (const file of files) {
    const patch = runGitDiff(['--unified=0', '--no-color', '--no-ext-diff', '--diff-filter=d', `${base}...HEAD`, '--', file], {
      base,
      projectRoot,
    });
    evidence.set(file, {
      fileStatus: addedFiles.has(file) ? 'added' : 'modified',
      changedRanges: changedRanges(patch),
    });
  }
  return evidence;
}

function lineInRanges(line, ranges) {
  return Number.isInteger(line) && ranges.some((range) => line >= range.start && line <= range.end);
}

function classifyFinding(finding, evidence) {
  const fileEvidence = finding.file === null ? null : evidence.get(finding.file);

  if (!fileEvidence) {
    return {
      ...finding,
      provenance: evidence.size === 0 ? 'unknown' : 'modified',
      changed_line_evidence: {
        fileStatus: evidence.size === 0 ? 'baseline' : 'unresolved',
        changed: null,
        ranges: [],
        reason: evidence.size === 0 ? 'no PR diff was requested' : 'finding location does not resolve to a changed review file',
      },
    };
  }

  if (fileEvidence.fileStatus === 'added') {
    return {
      ...finding,
      provenance: 'introduced',
      changed_line_evidence: {
        fileStatus: 'added',
        changed: Number.isInteger(finding.line) ? true : null,
        ranges: fileEvidence.changedRanges,
        reason: 'the file did not exist at the base revision',
      },
    };
  }

  if (!Number.isInteger(finding.line)) {
    return {
      ...finding,
      provenance: 'modified',
      changed_line_evidence: {
        fileStatus: 'modified',
        changed: null,
        ranges: fileEvidence.changedRanges,
        reason: 'no usable line was reported; conservatively treated as PR-owned',
      },
    };
  }

  const changedRange = fileEvidence.changedRanges.find((range) => finding.line >= range.start && finding.line <= range.end);
  const changed = changedRange !== undefined;
  return {
    ...finding,
    provenance: changed ? (changedRange.provenance ?? 'modified') : 'pre_existing',
    changed_line_evidence: {
      fileStatus: 'modified',
      changed,
      ranges: fileEvidence.changedRanges,
      reason: changed ? 'the reported line is in an added-side diff hunk' : 'the reported line is outside every added-side diff hunk',
    },
  };
}

function subtractCounts(all, advisoryFindings) {
  const result = { ...all };
  for (const finding of advisoryFindings) {
    if (finding.severity) {
      const key = finding.severity.toLowerCase();
      result[key] = Math.max(0, result[key] - 1);
    }
  }
  return result;
}

function applyFindingProvenance(findings, evidence, gateOn) {
  const classified = findings.map((finding) => {
    const result = classifyFinding(finding, evidence);
    return { ...result, verdict_impact: gateOn === 'all' || result.provenance !== 'pre_existing' };
  });
  return classified;
}

module.exports = {
  getDiffEvidence,
  changedRanges,
  lineInRanges,
  classifyFinding,
  applyFindingProvenance,
  subtractCounts,
};
