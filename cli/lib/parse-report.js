/**
 * Parse the test-review.md report into a machine-readable verdict, fail closed.
 *
 * Strict, section-aware schema (every element is mandatory):
 * - YAML frontmatter declaring workflowType: testarch-test-review and a
 *   non-empty stepsCompleted list.
 * - A "Recommendation:" line, with or without Markdown bolding, in BOTH the
 *   "## Executive Summary" and the "## Decision" section; the two must agree
 *   (case-insensitively) and the value must be one of the legal enum, to which
 *   it is normalized.
 * - "**Quality Score**: N/100" with N an integer in 0-100.
 * - A "**Total Violations**:" line with all four severity counts.
 * - A "## Quality Score Breakdown" ledger from which the CLI computes the
 *   authoritative score; the skill's deduction model is the only scoring
 *   model, so agent arithmetic never controls the gate.
 * - A "## Reviewed Files" section listing every reviewed file.
 * - Exactly one "**Context Basis**:" line inside the Executive Summary, plus a
 *   "## Review Context" manifest whenever that basis is not `none`.
 * - Exactly one "**Context Waivers Applied**: 0" line inside the Executive
 *   Summary. Context can add findings and cannot exempt rubric violations.
 *
 * Consistency cross-checks. The template defines Critical as Must Fix, so a
 * report with Critical > 0 alongside an Approve / Approve with Comments
 * recommendation is a broken report, not a pass. And the two manifests are
 * disjoint by construction: context is read, never scored, so a path in both
 * means the reviewer scored something the ledger does not describe. Both are
 * rejected as REPORT_UNPARSEABLE. When a run contract is supplied, canonical
 * manifests are also bound to the exact reviewed and context inputs.
 *
 * Two more fields, `keyStrengths` and `keyWeaknesses`, are extracted best-effort
 * from the Executive Summary's "### Key Strengths" / "### Key Weaknesses"
 * bullet lists for PR-comment display. These are not part of the strict schema
 * above: a report that omits or reshapes them still parses and gates normally,
 * the fields just come back as `[]`. Never add a gating check on these without
 * also stating the requirement in build-prompt.js, per the same discipline that
 * governs everything else in this file.
 *
 * Fenced code blocks (``` ... ```) are stripped before scanning so an example
 * report quoted inside the real one can never spoof a verdict.
 */

const path = require('node:path');

const RECOMMENDATION_ENUM = ['Approve', 'Approve with Comments', 'Request Changes', 'Block'];
const RECOMMENDATION_LINE = /^[ \t]*(?:\*\*Recommendation\*\*:|\*\*Recommendation:\*\*|Recommendation:)[ \t]*([^\r\n]+?)[ \t]*$/m;
const CONTEXT_BASIS_ENUM = ['none', 'pr_diff', 'pr_diff_truncated'];
const CONTEXT_BASIS_LINE_SOURCE = String.raw`^[ \t]*\*\*Context Basis:?\*\*:?[ \t]*([^\r\n]+)[ \t]*$`;
const CONTEXT_WAIVERS_LINE_SOURCE = String.raw`^[ \t]*\*\*Context Waivers Applied:?\*\*:?[ \t]*([^\r\n]+)[ \t]*$`;
const SCORE_PATTERN = /\*\*Quality Score\*\*:\s*(\d+)\s*\/\s*100/;
const VIOLATIONS_LINE = /\*\*Total Violations:?\*\*:?[ \t]*([^\n]+)/;
const VIOLATION_LEVELS = ['Critical', 'High', 'Medium', 'Low'];
// The template always prints the bonus with a leading "+" (every fixture in
// test/fixtures/test-review-cli/reports/ does, including the zero case,
// "Total Bonus:             +0"), so an unsigned "Total Bonus: 0" is already
// off the mandated format and should not silently parse.
const BONUS_TOTAL_LINE = /^[ \t]*Total Bonus[ \t]*:[ \t]*\+[ \t]*(\d+)[ \t]*$/m;
const SEVERITY_DEDUCTIONS = { critical: 10, high: 5, medium: 2, low: 1 };
const MAX_BONUS = 30; // six bonus categories, worth 0 or 5 each

function unparseable(message) {
  const error = new Error(`${message}; a parse failure is never a silent pass.`);
  error.code = 'REPORT_UNPARSEABLE';
  throw error;
}

/** Remove fenced code blocks (fence lines included) from report text. */
function stripFencedCodeBlocks(text) {
  const kept = [];
  let inFence = false;
  for (const line of text.split('\n')) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) {
      kept.push(line);
    }
  }
  return kept.join('\n');
}

/** Extract a level-2 section's text, up to the next level-2 heading or EOF. */
function extractSection(text, heading) {
  const match = new RegExp(`^## ${heading}[ \\t]*$`, 'm').exec(text);
  if (!match) {
    return null;
  }
  const rest = text.slice(match.index + match[0].length);
  const nextHeading = rest.search(/^## /m);
  return nextHeading === -1 ? rest : rest.slice(0, nextHeading);
}

/** Extract a level-3 subsection's text within a section, up to the next level-3 heading or EOF. */
function extractSubsection(sectionText, heading) {
  if (!sectionText) {
    return null;
  }
  const match = new RegExp(`^### ${heading}[ \\t]*$`, 'm').exec(sectionText);
  if (!match) {
    return null;
  }
  const rest = sectionText.slice(match.index + match[0].length);
  const nextHeading = rest.search(/^### /m);
  return nextHeading === -1 ? rest : rest.slice(0, nextHeading);
}

/**
 * Best-effort bullet-line extraction for PR-comment enrichment (Key Strengths /
 * Key Weaknesses). Unlike the rest of this module, this never throws: these
 * fields are display enrichment, not part of the gating contract, so a report
 * that omits or reshapes them still parses and gates normally.
 *
 * @param {string|null} subsectionText - Result of extractSubsection, or null.
 * @param {string} marker - Bullet marker literal (e.g. '✅' or '❌').
 * @param {number} [maxItems] - Cap so a runaway list can't blow up comment size.
 * @returns {string[]}
 */
function extractBullets(subsectionText, marker, maxItems = 5) {
  if (!subsectionText) {
    return [];
  }
  const pattern = new RegExp(`^${marker}[ \\t]*(.+)$`, 'gm');
  const bullets = [];
  let match;
  while (bullets.length < maxItems && (match = pattern.exec(subsectionText)) !== null) {
    const line = match[1].trim();
    if (line) {
      bullets.push(line);
    }
  }
  return bullets;
}

/** Map a raw Recommendation value onto the canonical enum, or throw. */
function normalizeRecommendation(raw, sectionLabel) {
  const cleaned = raw.replaceAll(/[*_]/g, '').replaceAll(/\s+/g, ' ').trim();
  const canonical = RECOMMENDATION_ENUM.find((value) => value.toLowerCase() === cleaned.toLowerCase());
  if (!canonical) {
    unparseable(`Report ${sectionLabel} Recommendation "${cleaned}" is not one of: ${RECOMMENDATION_ENUM.join(' | ')}`);
  }
  return canonical;
}

/** Extract the Recommendation from a required section, or throw. */
function recommendationFromSection(text, heading) {
  const section = extractSection(text, heading);
  if (section === null) {
    unparseable(`Report is missing the "## ${heading}" section`);
  }
  const match = section.match(RECOMMENDATION_LINE);
  if (!match) {
    unparseable(`Report is missing the "Recommendation:" line in the "## ${heading}" section`);
  }
  return normalizeRecommendation(match[1], `"## ${heading}"`);
}

/** Validate the mandatory frontmatter; returns the frontmatter text. */
function parseFrontmatter(text) {
  const match = text.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!match) {
    unparseable("Report is missing YAML frontmatter declaring workflowType: 'testarch-test-review' and stepsCompleted");
  }
  const frontmatter = match[1];
  if (!/^workflowType\s*:\s*['"]?testarch-test-review['"]?[ \t]*$/m.test(frontmatter)) {
    unparseable("Report frontmatter must declare workflowType: 'testarch-test-review'");
  }
  if (!hasNonEmptyStepsCompleted(frontmatter)) {
    unparseable('Report frontmatter must declare a non-empty stepsCompleted list');
  }
  return frontmatter;
}

function hasNonEmptyStepsCompleted(frontmatter) {
  const match = frontmatter.match(/^stepsCompleted[ \t]*:[ \t]*(.*)$/m);
  if (!match) {
    return false;
  }
  const inline = match[1].trim();
  if (inline.startsWith('[')) {
    return flowSequenceHasEntry(inline);
  }
  if (inline.length > 0) {
    return false; // a bare scalar is not a list
  }
  const continuation = [];
  for (const line of frontmatter.slice(frontmatter.indexOf(match[0]) + match[0].length).split('\n')) {
    if (/^\S/.test(line)) {
      break; // next top-level key: the list never started
    }
    if (/^\s*-\s+\S/.test(line)) {
      return true;
    }
    continuation.push(line.trim());
  }
  // A flow sequence legally opens on the line after the key and wraps across
  // several lines, which is the shape a formatter produces once the list no
  // longer fits on one line. Every completed run lists five steps, so this is
  // the common case rather than the exotic one.
  const wrapped = continuation.join(' ').trim();
  return wrapped.startsWith('[') && flowSequenceHasEntry(wrapped);
}

function flowSequenceHasEntry(text) {
  return text.replace(/^\[/, '').replace(/]\s*$/, '').trim().length > 0;
}

/** Parse the mandatory Total Violations line into per-severity counts. */
function parseViolations(text) {
  const lineMatch = text.match(VIOLATIONS_LINE);
  if (!lineMatch) {
    unparseable('Report is missing the "**Total Violations**:" line');
  }
  const line = lineMatch[1];
  const counts = {};
  for (const level of VIOLATION_LEVELS) {
    const match = line.match(new RegExp(`(\\d+)\\s*${level}\\b`, 'i')) ?? line.match(new RegExp(`\\b${level}\\s*:?\\s*(\\d+)`, 'i'));
    if (!match) {
      unparseable(`Report "**Total Violations**:" line is missing the ${level} count`);
    }
    counts[level.toLowerCase()] = Number.parseInt(match[1], 10);
  }
  return counts;
}

/**
 * Whether a manifest entry is a file path rather than prose. Paths rarely
 * contain whitespace and prose always does, so a whitespace-bearing entry only
 * counts when it still ends in a file extension. This matters because the
 * manifest length is the evidence floor behind --min-files: a stray sentence
 * inside the section would otherwise count as a reviewed file.
 */
function looksLikeFilePath(entry) {
  return !/\s/.test(entry) || /\.[A-Za-z0-9_+-]{1,12}$/.test(entry);
}

/**
 * Remove markdown emphasis that WRAPS a value, leaving the value intact.
 *
 * Deliberately not a global strip of `` ` ``, `*`, and `_`: those characters
 * are legal inside the things this parser reads. A global strip turns the path
 * `tests/user_profile.spec.ts` into `tests/userprofile.spec.ts` in the evidence
 * manifest, and the enum value `pr_diff` into `prdiff`.
 */
function stripWrappers(value) {
  let result = value.trim();
  for (const wrapper of ['```', '**', '__', '`', '*', '_']) {
    while (result.length > 2 * wrapper.length && result.startsWith(wrapper) && result.endsWith(wrapper)) {
      result = result.slice(wrapper.length, -wrapper.length).trim();
    }
  }
  return result;
}

/**
 * Strip a manifest section down to its candidate entries: bullet markers,
 * wrapping emphasis, headings, and horizontal rules removed. A rule is dropped
 * rather than kept because "---" has no whitespace and would otherwise satisfy
 * looksLikeFilePath and inflate the evidence count.
 */
function manifestEntries(sectionText) {
  return sectionText
    .split('\n')
    .map((line) => stripWrappers(line.trim().replace(/^[-*]\s+/, '')))
    .filter((line) => line.length > 0 && !line.startsWith('#') && !/^(-{3,}|={3,})$/.test(line));
}

/** Canonicalize a report manifest path into a safe repo-relative POSIX path. */
function canonicalManifestPath(value, manifestLabel) {
  const portable = stripWrappers(value).replaceAll('\\', '/');
  if (path.posix.isAbsolute(portable) || /^[A-Za-z]:\//.test(portable)) {
    unparseable(`Report "${manifestLabel}" manifest path ${JSON.stringify(value)} must be repo-relative`);
  }
  const canonical = path.posix.normalize(portable);
  if (canonical === '.' || canonical === '..' || canonical.startsWith('../')) {
    unparseable(`Report "${manifestLabel}" manifest path ${JSON.stringify(value)} escapes or does not name a file`);
  }
  return canonical;
}

/** Canonicalize a manifest and reject aliases that collapse to duplicates. */
function canonicalizeManifest(files, manifestLabel) {
  if (!Array.isArray(files)) {
    unparseable(`Report run contract "${manifestLabel}" must be an array of repo-relative paths`);
  }
  const canonical = files.map((file) => canonicalManifestPath(file, manifestLabel));
  const seen = new Set();
  const duplicates = [];
  for (const file of canonical) {
    if (seen.has(file)) {
      duplicates.push(file);
    }
    seen.add(file);
  }
  if (duplicates.length > 0) {
    unparseable(
      `Report "${manifestLabel}" manifest contains duplicate path aliases after normalization: ${JSON.stringify(
        [...new Set(duplicates)].slice(0, 3),
      )}`,
    );
  }
  return canonical;
}

/** Parse the mandatory "## Reviewed Files" manifest into a path array. */
function parseReviewedFiles(text) {
  const section = extractSection(text, 'Reviewed Files');
  if (section === null) {
    unparseable('Report is missing the "## Reviewed Files" section');
  }
  const entries = manifestEntries(section);
  if (entries.length === 0) {
    unparseable('Report "## Reviewed Files" section is empty');
  }
  const files = entries.filter((entry) => looksLikeFilePath(entry));
  if (files.length === 0) {
    unparseable(`Report "## Reviewed Files" section lists no file paths (found only prose: ${JSON.stringify(entries.slice(0, 3))})`);
  }
  return canonicalizeManifest(files, '## Reviewed Files');
}

/** Extract one machine field, owned exclusively by the Executive Summary. */
function executiveSingleton(text, source, label) {
  const executiveSection = extractSection(text, 'Executive Summary');
  if (executiveSection === null) {
    unparseable('Report is missing the "## Executive Summary" section');
  }
  const allMatches = [...text.matchAll(new RegExp(source, 'gm'))];
  const executiveMatches = [...executiveSection.matchAll(new RegExp(source, 'gm'))];
  if (allMatches.length !== 1 || executiveMatches.length !== 1) {
    unparseable(
      `Report must contain exactly one "**${label}**:" line, and it must be inside "## Executive Summary"; ` +
        `found ${allMatches.length} total and ${executiveMatches.length} there`,
    );
  }
  return executiveMatches[0][1];
}

/** Parse the Executive Summary's unique "**Context Basis**:" line. */
function parseContextBasis(text) {
  const raw = executiveSingleton(text, CONTEXT_BASIS_LINE_SOURCE, 'Context Basis');
  const cleaned = stripWrappers(raw.replaceAll(/\s+/g, ' ')).toLowerCase();
  if (!CONTEXT_BASIS_ENUM.includes(cleaned)) {
    unparseable(`Report Context Basis "${cleaned}" is not one of: ${CONTEXT_BASIS_ENUM.join(' | ')}`);
  }
  return cleaned;
}

/** Context can add findings. A nonzero waiver declaration invalidates the report. */
function parseContextWaivers(text) {
  const raw = stripWrappers(executiveSingleton(text, CONTEXT_WAIVERS_LINE_SOURCE, 'Context Waivers Applied'));
  if (!/^\d+$/.test(raw)) {
    unparseable(`Report Context Waivers Applied ${JSON.stringify(raw)} must be the integer 0`);
  }
  const applied = Number.parseInt(raw, 10);
  if (applied !== 0) {
    unparseable(`Report declares ${applied} context waiver(s); context cannot waive rubric violations or alter the score`);
  }
  return applied;
}

/**
 * Parse the "## Review Context" manifest. Required whenever the basis is not
 * `none`; absent (or the single word `none`) otherwise. A basis of `none`
 * alongside a populated manifest is a contradiction, not a pass.
 */
function parseContextFiles(text, contextBasis) {
  const section = extractSection(text, 'Review Context');
  const entries = section === null ? [] : manifestEntries(section);
  const declaredNone = entries.length === 1 && entries[0].toLowerCase() === 'none';
  const files = declaredNone ? [] : entries.filter((entry) => looksLikeFilePath(entry));

  if (contextBasis === 'none') {
    if (files.length > 0) {
      unparseable(
        `Report declares "Context Basis: none" but its "## Review Context" section lists ${files.length} artifact(s): ` +
          JSON.stringify(files.slice(0, 3)),
      );
    }
    return [];
  }

  if (section === null) {
    unparseable(`Report declares "Context Basis: ${contextBasis}" but has no "## Review Context" section naming what it read`);
  }
  if (files.length === 0) {
    unparseable(`Report declares "Context Basis: ${contextBasis}" but its "## Review Context" section names no artifacts`);
  }
  return canonicalizeManifest(files, '## Review Context');
}

function manifestDifference(left, right) {
  const rightSet = new Set(right);
  return left.filter((file) => !rightSet.has(file));
}

/** Bind report claims to the exact evidence supplied to this run. */
function verifyRunContract({ reviewedFiles, contextBasis, contextFiles }, runContract) {
  const has = (key) => Object.prototype.hasOwnProperty.call(runContract, key);

  if (has('reviewedFiles')) {
    const suppliedReviewed = canonicalizeManifest(runContract.reviewedFiles, 'supplied reviewed files');
    const missing = manifestDifference(suppliedReviewed, reviewedFiles);
    const foreign = manifestDifference(reviewedFiles, suppliedReviewed);
    if (missing.length > 0 || foreign.length > 0) {
      unparseable(
        'Report "## Reviewed Files" manifest does not match the authoritative review set: ' +
          `missing ${JSON.stringify(missing.slice(0, 3))}, foreign ${JSON.stringify(foreign.slice(0, 3))}`,
      );
    }
  }

  let suppliedContext = null;
  if (has('contextFiles')) {
    suppliedContext = canonicalizeManifest(runContract.contextFiles, 'supplied context files');
    const foreign = manifestDifference(contextFiles, suppliedContext);
    if (foreign.length > 0) {
      unparseable(`Report "## Review Context" manifest names artifacts this run did not supply: ${JSON.stringify(foreign.slice(0, 3))}`);
    }
  }

  if (has('contextBasis')) {
    const suppliedBasis = runContract.contextBasis;
    if (!CONTEXT_BASIS_ENUM.includes(suppliedBasis)) {
      unparseable(`Report run contract Context Basis "${suppliedBasis}" is invalid`);
    }
    const rank = { none: 0, pr_diff_truncated: 1, pr_diff: 2 };
    if (rank[contextBasis] > rank[suppliedBasis]) {
      unparseable(
        `Report declares "Context Basis: ${contextBasis}" while this run supplied ${suppliedBasis}; ` +
          'a report cannot claim evidence it was never given',
      );
    }
    if (suppliedContext !== null && contextBasis === suppliedBasis) {
      const missing = manifestDifference(suppliedContext, contextFiles);
      if (missing.length > 0) {
        unparseable(
          `Report "## Review Context" manifest omits supplied artifacts while claiming ${contextBasis}: ${JSON.stringify(
            missing.slice(0, 3),
          )}`,
        );
      }
    }
  }
}

/**
 * Compute the authoritative quality score from the template's deduction
 * ledger. The agent's published score is presentation data only.
 *
 * Live runs have repeatedly published arithmetic that contradicts their own
 * ledgers. The ledger in `test-review-template.md` is the workflow's only
 * scoring model, so the CLI derives the score from the violation counts and
 * bonus instead of asking a probabilistic producer to perform gate arithmetic.
 *
 * The breakdown sits inside a fenced block, which the verdict scan strips, so
 * this reads the raw report instead and anchors on the section heading: only
 * the ledger under "## Quality Score Breakdown" is ever consulted.
 */
function deriveQualityScore(rawText, violations) {
  // extractSection's regex takes the first match; on raw (fence-intact) text
  // that is exploitable if the reviewed file's own quoted content contains a
  // second "## Quality Score Breakdown" heading earlier in the report than
  // the real one, with fabricated arithmetic crafted to pass. Counting the
  // heading first closes that: more than one is rejected outright rather than
  // silently taking whichever the regex happens to find.
  const headingCount = (rawText.match(/^## Quality Score Breakdown[ \t]*$/gm) || []).length;
  if (headingCount > 1) {
    unparseable(
      `Report has ${headingCount} "## Quality Score Breakdown" headings; expected exactly one, so quoted content cannot supply a decoy ledger`,
    );
  }
  const section = extractSection(rawText, 'Quality Score Breakdown');
  if (section === null) {
    unparseable('Report is missing the "## Quality Score Breakdown" section');
  }
  const bonusMatch = section.match(BONUS_TOTAL_LINE);
  if (!bonusMatch) {
    unparseable('Report "## Quality Score Breakdown" is missing its "Total Bonus:" line');
  }
  const bonus = Number.parseInt(bonusMatch[1], 10);
  if (bonus > MAX_BONUS || bonus % 5 !== 0) {
    unparseable(
      `Report Total Bonus +${bonus} is not a multiple of 5 within 0-${MAX_BONUS}; each of the six bonus categories is worth 0 or 5`,
    );
  }
  const deductions = VIOLATION_LEVELS.reduce((sum, level) => {
    const key = level.toLowerCase();
    return sum + violations[key] * SEVERITY_DEDUCTIONS[key];
  }, 0);
  return Math.max(0, Math.min(100, 100 - deductions + bonus));
}

function gradeForScore(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/** Normalize the report's schema-owned score and grade fields to CLI arithmetic. */
function normalizeReportScore(reportText, qualityScore) {
  const grade = gradeForScore(qualityScore);
  return reportText
    .replace(/^([ \t]*\*\*Quality Score\*\*:[ \t]*)\d+([ \t]*\/[ \t]*100)/m, `$1${qualityScore}$2`)
    .replace(/^([ \t]*\*\*Quality Score\*\*:[^\r\n]*\([ \t]*)[A-F](?=[ \t)-])/m, `$1${grade}`)
    .replace(/^([ \t]*Final Score[ \t]*:[ \t]*)\d+([ \t]*\/[ \t]*100[ \t]*)$/m, `$1${qualityScore}$2`)
    .replace(/^([ \t]*Grade[ \t]*:[ \t]*)[A-F]([ \t]*)$/m, `$1${grade}$2`);
}

/**
 * Extract the strict-schema verdict from report text.
 *
 * @param {string} reportText - Full test-review.md contents.
 * @param {object} [runContract] - Exact reviewed/context evidence supplied by the runner.
 * @returns {{recommendation: string, qualityScore: number, reportedQualityScore?: number, violations: object,
 *   reviewedFiles: string[], contextBasis: string, contextFiles: string[],
 *   contextWaiversApplied: number}}
 * @throws {Error} With code REPORT_UNPARSEABLE on any missing/invalid element.
 */
function parseReport(reportText, runContract = {}) {
  const text = stripFencedCodeBlocks(reportText);

  parseFrontmatter(text);

  const executive = recommendationFromSection(text, 'Executive Summary');
  const decision = recommendationFromSection(text, 'Decision');
  if (executive !== decision) {
    unparseable(`Report has conflicting "Recommendation:" lines (${executive} in Executive Summary vs ${decision} in Decision)`);
  }

  const scoreMatch = text.match(SCORE_PATTERN);
  if (!scoreMatch) {
    unparseable('Report is missing the "**Quality Score**: N/100" line');
  }
  const reportedQualityScore = Number.parseInt(scoreMatch[1], 10);
  if (reportedQualityScore < 0 || reportedQualityScore > 100) {
    unparseable(`Report Quality Score ${reportedQualityScore} is outside the required 0-100 range`);
  }

  const violations = parseViolations(text);
  if (violations.critical > 0 && (executive === 'Approve' || executive === 'Approve with Comments')) {
    unparseable(
      `Report declares ${violations.critical} Critical violation(s) with a "${executive}" recommendation; ` +
        'critical violations with an approve recommendation is an inconsistent verdict',
    );
  }

  const qualityScore = deriveQualityScore(reportText, violations);

  const reviewedFiles = parseReviewedFiles(text);
  const contextBasis = parseContextBasis(text);
  const contextWaiversApplied = parseContextWaivers(text);
  const contextFiles = parseContextFiles(text, contextBasis);

  // Read and scored are different jobs. An overlap means either a context
  // artifact was run through the deduction ledger or a reviewed test was
  // excused as background reading; the report cannot say which.
  const reviewedSet = new Set(reviewedFiles);
  const overlap = contextFiles.filter((file) => reviewedSet.has(file));
  if (overlap.length > 0) {
    unparseable(
      `Report lists ${JSON.stringify(overlap.slice(0, 3))} in both "## Reviewed Files" and "## Review Context"; ` +
        'context is read, never scored, so the two manifests must be disjoint',
    );
  }

  verifyRunContract({ reviewedFiles, contextBasis, contextFiles }, runContract);

  const executiveSection = extractSection(text, 'Executive Summary');
  const keyStrengths = extractBullets(extractSubsection(executiveSection, 'Key Strengths'), '✅');
  const keyWeaknesses = extractBullets(extractSubsection(executiveSection, 'Key Weaknesses'), '❌');

  const parsed = {
    recommendation: executive,
    qualityScore,
    violations,
    reviewedFiles,
    contextBasis,
    contextFiles,
    contextWaiversApplied,
    keyStrengths,
    keyWeaknesses,
  };
  if (reportedQualityScore !== qualityScore) {
    parsed.reportedQualityScore = reportedQualityScore;
  }
  return parsed;
}

/**
 * Map a recommendation and a --fail-on level to a CI verdict.
 *
 * @param {string} recommendation - Approve | Approve with Comments | Request Changes | Block.
 * @param {string} failOn - block | request-changes.
 * @returns {'pass'|'fail'} 'fail' for Block at any level, or for Request Changes
 *   when failOn is 'request-changes'; otherwise 'pass'.
 */
function verdictFor(recommendation, failOn) {
  if (recommendation === 'Block' || (recommendation === 'Request Changes' && failOn === 'request-changes')) {
    return 'fail';
  }
  return 'pass';
}

/**
 * Whether a quality score fails a --min-score floor.
 *
 * @param {number} score - Parsed report quality score (0-100).
 * @param {number} minScore - The --min-score floor.
 * @returns {boolean}
 */
function scoreFails(score, minScore) {
  return score < minScore;
}

module.exports = { parseReport, normalizeReportScore, verdictFor, scoreFails, CONTEXT_BASIS_ENUM };
