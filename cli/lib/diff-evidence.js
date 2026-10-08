/**
 * Build deterministic, local git evidence for finding provenance.
 *
 * A PR review uses the same <base>...HEAD comparison as changed-tests.js.
 * Added files and pure additions are "introduced". Replacement lines are
 * "modified". Findings on every other line are "pre_existing", with these
 * exceptions, all for rows that judge whether an assertion can still fail:
 *
 * - a finding whose symptom sits on an unchanged line, where a changed line
 *   defines something the symptom reads, is attributed to that changed line;
 * - a finding in a test the PR changed is PR-owned for the rows that describe the
 *   whole test (no assertion, mock-only assertion, shape-only assertion);
 * - a finding in a test that lost an assertion is PR-owned;
 * - a finding whose Location is a range touching a changed line is PR-owned.
 *
 * A finding with no usable line, or a line outside the file, stays PR-owned so
 * missing evidence cannot bypass the gate.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const {
  enclosingFunction,
  identifiersOf,
  definedIdentifiers,
  functionName,
  isCommentLine,
  isSetupBlock,
  isContainerBlock,
  statementHead,
  wordsOf,
} = require('./enclosing-block');

// Rows that ask whether an assertion can still fail. Only these can be broken by a line the
// PR changed elsewhere, so only these are attributed away from their own line.
const ASSERTION_ROWS = new Set(['C3', 'C4', 'C5', 'C6', 'H3', 'H10']);
// Rows that describe a whole test: the PR owns them when it changed that test.
const TEST_LEVEL_ROWS = new Set(['C4', 'C5', 'H10']);
// A row that judges how a file is grouped. A pull request owns it only by adding the file
// or by changing a grouping construct.
const GROUPING_ROWS = new Set(['M4']);
const GROUPING_LINE = /^[+-]\s*(?:(?:\w+\.)*(?:describe|context|suite)(?:\.\w+)*\s*\(|(?:class|module)\s+\w)/;
// A row about file size, owned only by the pull request that takes a file over the limit.
const SIZE_ROW = 'H5';
const SIZE_LIMIT = 1000;
const ASSERTION_TEXT = /\b(?:assert\w*|expect|should|verify)\b/i;
// Files that set up what tests read: fixtures, hooks, helpers, factories.
const SUPPORT_FILE =
  /(?:conftest|fixtures?|helpers?|support|setup|factor(?:y|ies)|mocks?|stubs?|test[-_]?utils?)\b|(?:^|\/)(?:tests?|specs?|__tests__|e2e|cypress|playwright)\//i;
const CODE_FILE = /\.(?:py|js|jsx|mjs|cjs|ts|tsx|java|kt|rb|go|cs|php|swift|rs)$/;

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

function runGit(args, { base, projectRoot }) {
  assertBase(base);
  const result = spawnSync('git', ['-c', 'core.quotePath=false', ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  if (result.error || result.status !== 0) {
    const detail = ((result.stderr || '').trim() || (result.error && result.error.message) || 'unknown git error').trim();
    throw gitDiffError(base, projectRoot, detail);
  }
  return result.stdout;
}

function runGitDiff(args, context) {
  return runGit(['diff', ...args], context);
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

/** The hunks of a patch with their head-side start and the text each side carries. */
function hunksOf(patch) {
  const hunks = [];
  let hunk = null;
  for (const line of patch.split(/\r?\n/)) {
    const match = HUNK_HEADER.exec(line);
    if (match) {
      hunk = {
        oldCount: match[2] === undefined ? 1 : Number.parseInt(match[2], 10),
        start: Number.parseInt(match[3], 10),
        count: match[4] === undefined ? 1 : Number.parseInt(match[4], 10),
        removed: [],
        added: [],
      };
      hunks.push(hunk);
    } else if (hunk && line.startsWith('-') && !line.startsWith('---')) {
      hunk.removed.push(line.slice(1));
    } else if (hunk && line.startsWith('+') && !line.startsWith('+++')) {
      hunk.added.push(line.slice(1));
    }
  }
  return hunks;
}

/** Head-side lines where the patch removed an assertion without adding one back. */
function removedAssertionPoints(patch) {
  return hunksOf(patch)
    .filter(
      (hunk) =>
        hunk.removed.filter((text) => ASSERTION_TEXT.test(text)).length > hunk.added.filter((text) => ASSERTION_TEXT.test(text)).length,
    )
    .map((hunk) => Math.max(1, hunk.start));
}

/** Whether the patch adds or removes a grouping construct (describe, context, suite, class). */
function touchesGrouping(patch) {
  return patch.split(/\r?\n/).some((line) => !line.startsWith('+++') && !line.startsWith('---') && GROUPING_LINE.test(line));
}

function readSource(topLevel, file) {
  try {
    return fs.readFileSync(path.join(topLevel, file), 'utf8').split(/\r?\n/);
  } catch {
    return null;
  }
}

/** Whether a changed file sets up what tests read, so a change in it can break an assertion. */
function isTestSupportFile(file) {
  return CODE_FILE.test(file) && SUPPORT_FILE.test(file);
}

/**
 * @returns {Map<string, {fileStatus: 'added'|'modified',
 *   changedRanges: Array<{start:number,end:number,provenance:'introduced'|'modified'}>,
 *   deletedAfter: number[], groupingTouched: boolean, lineDelta: number,
 *   source: string[]|null}> & {contexts: Map<string, object>}}
 *   `contexts` carries the same evidence for changed test-support files outside the review set.
 */
function getDiffEvidence({ base, projectRoot, files, contextFiles = [] }) {
  // Paths come back from git relative to the repository root, and the project root can be a
  // subdirectory of it, so every pathspec and file read is anchored at the top level.
  const topLevel = runGit(['rev-parse', '--show-toplevel'], { base, projectRoot }).trim() || projectRoot;
  const addedOutput = runGitDiff(['--name-only', '--diff-filter=A', '-z', `${base}...HEAD`, '--'], {
    base,
    projectRoot,
  });
  const addedFiles = new Set(addedOutput.split('\0').filter(Boolean));

  const evidenceFor = (file) => {
    const patch = runGitDiff(
      ['--unified=0', '--no-color', '--no-ext-diff', '--diff-filter=d', `${base}...HEAD`, '--', `:(top,literal)${file}`],
      {
        base,
        projectRoot,
      },
    );
    return {
      fileStatus: addedFiles.has(file) ? 'added' : 'modified',
      changedRanges: changedRanges(patch),
      deletedAfter: removedAssertionPoints(patch),
      groupingTouched: touchesGrouping(patch),
      lineDelta: hunksOf(patch).reduce((sum, hunk) => sum + hunk.count - hunk.oldCount, 0),
      // Per changed range, the words the patch took out: a header or decorator word that was already there is not new.
      removedWords: hunksOf(patch)
        .filter((hunk) => hunk.count > 0)
        .map((hunk) => wordsOf(hunk.removed.join(' '))),
      source: readSource(topLevel, file),
    };
  };

  const evidence = new Map();
  for (const file of files) evidence.set(file, evidenceFor(file));
  evidence.contexts = new Map();
  for (const file of contextFiles) {
    if (!evidence.has(file) && isTestSupportFile(file)) evidence.contexts.set(file, evidenceFor(file));
  }
  return evidence;
}

function lineInRanges(line, ranges) {
  return Number.isInteger(line) && ranges.some((range) => line >= range.start && line <= range.end);
}

/** The block enclosing a line, remembered per file so a run of changed lines in one test costs one scan. */
function blockCache(source) {
  const cache = { last: null };
  return (line) => {
    if (cache.last && line >= cache.last.start && line <= cache.last.end) return cache.last;
    const block = enclosingFunction(source, line);
    if (block) cache.last = block;
    return block;
  };
}

/**
 * The changed lines of a file that can set up what a test in another place reads: module-level
 * definitions, the bodies of fixtures and setup hooks, and a function named for what it provides.
 * The locals of another test are never included.
 */
function setupCauses(fileEvidence) {
  if (fileEvidence.setupCauses) return fileEvidence.setupCauses;
  const { source, changedRanges: ranges } = fileEvidence;
  const causes = [];
  if (source) {
    const blockAt = blockCache(source);
    for (const range of ranges) {
      for (let line = range.start; line <= Math.min(range.end, source.length); line += 1) {
        if (isCommentLine(source[line - 1] ?? '')) continue;
        const block = blockAt(line);
        const inContainer = block && isContainerBlock(source, block);
        const words = new Set();
        if (!block || inContainer || isSetupBlock(source, block)) {
          for (const word of definedIdentifiers(source[statementHead(source, line) - 1] ?? '')) words.add(word);
        }
        if (block && !inContainer) {
          const name = functionName(source[block.header - 1]);
          if (name) words.add(name);
        }
        if (words.size > 0) causes.push({ line, provenance: range.provenance, words, block: block ?? null });
      }
    }
  }
  fileEvidence.setupCauses = causes;
  return causes;
}

/**
 * Tie a finding on an unchanged line to the changed line that caused it. New
 * setup can make an assertion it never touched ineffective (`expected = 18.0`
 * becoming `expected = apply_discount(...)`): the symptom is on the assert, the
 * defect is on the line the PR wrote.
 *
 * A cause is a changed line that defines something the symptom reads, directly
 * or through the test's own assignments: an assignment or declaration, a mock or
 * patch, a fixture or function of that name, a Ruby `let`, or a changed parameter
 * list or parametrize table naming it. A name the symptom's own test defines is
 * local, so only a change inside that test, above the symptom, counts. Any other
 * name is looked up in module-level lines, fixtures and setup hooks of the file,
 * then in the changed test-support files. A comment, a rename, or a line that
 * merely shares a name with the symptom is never a cause. Returns null when no
 * cause is found.
 */
function attributeToChangedLine(finding, fileEvidence, evidence) {
  const { source, changedRanges: ranges } = fileEvidence;
  const symptom = source?.[finding.line - 1];
  if (symptom === undefined) return null;
  const block = enclosingFunction(source, finding.line);
  if (!block) return null;

  const isChanged = (line) => ranges.find((range) => line >= range.start && line <= range.end);
  const definesAt = (line) => definedIdentifiers(source[statementHead(source, line) - 1] ?? '');

  // What the symptom reads, followed back through the test's own assignments.
  const reads = identifiersOf(symptom);
  const localDefinitions = new Set();
  for (let line = finding.line - 1; line > block.header; line -= 1) {
    if (isCommentLine(source[line - 1] ?? '')) continue;
    const defined = definesAt(line);
    for (const word of defined) localDefinitions.add(word);
    if ([...defined].some((word) => reads.has(word))) for (const word of identifiersOf(source[line - 1])) reads.add(word);
  }

  const shared = (words, local) => [...words].filter((word) => reads.has(word) && (local || !localDefinitions.has(word))).sort();
  const pick = (candidates) => {
    const before = candidates.filter((candidate) => candidate.line < finding.line);
    return before.length > 0 ? before.at(-1) : (candidates[0] ?? null);
  };

  const local = [];
  for (let line = block.header + 1; line < finding.line; line += 1) {
    const range = isChanged(line);
    if (!range || isCommentLine(source[line - 1] ?? '')) continue;
    const words = shared(definesAt(line), true);
    if (words.length > 0) local.push({ file: finding.file, line, provenance: range.provenance, shared: words });
  }
  const nearLocal = pick(local);
  if (nearLocal) return nearLocal;

  // A changed decorator or parameter list names what the test receives. The test's own name and title are not part of it.
  const received = [];
  const headerName = functionName(source[block.header - 1]);
  for (let line = block.start; line <= block.header; line += 1) {
    const range = isChanged(line);
    const text = source[line - 1] ?? '';
    if (!range || isCommentLine(text)) continue;
    const removed = fileEvidence.removedWords?.[ranges.indexOf(range)] ?? new Set();
    const words = new Set(identifiersOf(text));
    if (line < block.header)
      for (const match of text.matchAll(/(["'`])([^"'`]*)\1/g)) for (const word of wordsOf(match[2])) words.add(word);
    for (const word of [
      'test',
      'it',
      'describe',
      'context',
      'specify',
      'def',
      'function',
      headerName,
      ...(line === block.header ? removed : []),
    ])
      words.delete(word);
    const sharedWords = shared(words, false);
    if (sharedWords.length > 0) received.push({ file: finding.file, line, provenance: range.provenance, shared: sharedWords });
  }
  if (received.length > 0) return received[0];

  const outer = [];
  for (const cause of setupCauses(fileEvidence)) {
    if (cause.line >= block.start && cause.line <= block.end) continue;
    const words = shared(cause.words, false);
    if (words.length > 0) outer.push({ file: finding.file, line: cause.line, provenance: cause.provenance, shared: words });
  }
  const nearOuter = pick(outer);
  if (nearOuter) return nearOuter;

  const contexts = [];
  const supportEntries = [...evidence].filter(([file]) => file !== finding.file && isTestSupportFile(file));
  for (const [file, contextEvidence] of [...supportEntries, ...(evidence.contexts ?? [])]) {
    for (const cause of setupCauses(contextEvidence)) {
      const words = shared(cause.words, false);
      if (words.length > 0) contexts.push({ file, line: cause.line, provenance: cause.provenance, shared: words });
    }
  }
  return contexts[0] ?? null;
}

/** Whether the PR changed the test a finding sits in: a non-comment changed line in it, or an assertion it removed there. */
function testChangedBy(finding, fileEvidence) {
  const { source, deletedAfter, changedRanges: ranges } = fileEvidence;
  if (!source) return null;
  const block = enclosingFunction(source, finding.line);
  if (!block) return null;
  for (const range of ranges) {
    for (let line = Math.max(range.start, block.start); line <= Math.min(range.end, block.end); line += 1) {
      if (!isCommentLine(source[line - 1] ?? '') && (source[line - 1] ?? '').trim() !== '') return { line, kind: 'changed' };
    }
  }
  const removed = deletedAfter.find((point) => point >= block.header && point <= block.end);
  return removed === undefined ? null : { line: removed, kind: 'removed' };
}

function conservative(finding, fileEvidence, reason) {
  return {
    ...finding,
    provenance: 'modified',
    changed_line_evidence: {
      fileStatus: 'modified',
      changed: null,
      ranges: fileEvidence.changedRanges,
      reason,
    },
  };
}

/**
 * @param {object} finding
 * @param {Map} evidence
 * @param {number|null} [lineEnd] - The end of a range Location (`path:4-8`), when the report gave one.
 */
function classifyFinding(finding, evidence, lineEnd = null) {
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
    return conservative(finding, fileEvidence, 'no usable line was reported; conservatively treated as PR-owned');
  }
  if (fileEvidence.source && (finding.line < 1 || finding.line > fileEvidence.source.length)) {
    return conservative(
      finding,
      fileEvidence,
      `the reported line ${finding.line} is outside the file's ${fileEvidence.source.length} lines; conservatively treated as PR-owned`,
    );
  }

  if (GROUPING_ROWS.has(finding.row)) {
    if (fileEvidence.groupingTouched) {
      return conservative(finding, fileEvidence, `the pull request changed a grouping construct, which row ${finding.row} judges`);
    }
    return {
      ...finding,
      provenance: 'pre_existing',
      changed_line_evidence: {
        fileStatus: 'modified',
        changed: false,
        ranges: fileEvidence.changedRanges,
        reason: `row ${finding.row} judges how the file is grouped, and the pull request modified a file it did not add without changing a grouping construct`,
      },
    };
  }

  if (finding.row === SIZE_ROW && fileEvidence.source) {
    const headLength = fileEvidence.source.length;
    if (headLength > SIZE_LIMIT && headLength - fileEvidence.lineDelta <= SIZE_LIMIT) {
      return conservative(finding, fileEvidence, `the pull request took the file over ${SIZE_LIMIT} lines`);
    }
    return {
      ...finding,
      provenance: 'pre_existing',
      changed_line_evidence: {
        fileStatus: 'modified',
        changed: false,
        ranges: fileEvidence.changedRanges,
        reason: `row ${finding.row} judges the file's size, and the file was already over ${SIZE_LIMIT} lines before the pull request`,
      },
    };
  }

  const last = Number.isInteger(lineEnd) && lineEnd > finding.line ? lineEnd : finding.line;
  const changedRange = fileEvidence.changedRanges.find((range) => range.start <= last && range.end >= finding.line);
  if (changedRange) {
    return {
      ...finding,
      provenance: changedRange.provenance ?? 'modified',
      changed_line_evidence: {
        fileStatus: 'modified',
        changed: true,
        ranges: fileEvidence.changedRanges,
        reason: 'the reported line is in an added-side diff hunk',
      },
    };
  }

  if (ASSERTION_ROWS.has(finding.row)) {
    const cause = attributeToChangedLine(finding, fileEvidence, evidence);
    if (cause) {
      const elsewhere = cause.file === finding.file ? '' : ` in ${cause.file}`;
      return {
        ...finding,
        file: cause.file,
        ...(finding.path === undefined ? {} : { path: cause.file }),
        line: cause.line,
        provenance: cause.provenance ?? 'modified',
        changed_line_evidence: {
          fileStatus: 'modified',
          changed: true,
          ranges: fileEvidence.changedRanges,
          symptomFile: finding.file,
          symptomLine: finding.line,
          reason: `the reported line ${finding.line} is unchanged, but changed line ${cause.line}${elsewhere} defines ${cause.shared.join(', ')}, which it reads; the finding is attributed to the changed line`,
        },
      };
    }
    const test = testChangedBy(finding, fileEvidence);
    if (test && (test.kind === 'removed' || TEST_LEVEL_ROWS.has(finding.row))) {
      return conservative(
        finding,
        fileEvidence,
        test.kind === 'removed'
          ? `the pull request removed an assertion near line ${test.line} in the same test; conservatively treated as PR-owned`
          : `row ${finding.row} describes the whole test, and the pull request changed line ${test.line} in it`,
      );
    }
  }

  return {
    ...finding,
    provenance: 'pre_existing',
    changed_line_evidence: {
      fileStatus: 'modified',
      changed: false,
      ranges: fileEvidence.changedRanges,
      reason: 'the reported line is outside every added-side diff hunk',
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

/**
 * @param {Array} findings
 * @param {Map} evidence
 * @param {'introduced'|'all'} gateOn
 * @param {Array<number|null>} [lineEnds] - Per finding, the end of a range Location.
 */
function applyFindingProvenance(findings, evidence, gateOn, lineEnds = []) {
  return findings.map((finding, index) => {
    const result = classifyFinding(finding, evidence, lineEnds[index] ?? null);
    // A whole-file review keeps the agent's own location; the attribution stays in the evidence.
    if (gateOn === 'all') {
      result.line = finding.line;
      result.file = finding.file;
      if (finding.path !== undefined) result.path = finding.path;
    }
    return { ...result, verdict_impact: gateOn === 'all' || result.provenance !== 'pre_existing' };
  });
}

module.exports = {
  getDiffEvidence,
  changedRanges,
  removedAssertionPoints,
  isTestSupportFile,
  lineInRanges,
  classifyFinding,
  applyFindingProvenance,
  subtractCounts,
};
