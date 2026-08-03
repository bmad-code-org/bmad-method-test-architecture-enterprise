/**
 * Parse the test-review.md report into a machine-readable verdict, fail closed.
 *
 * Strict, section-aware schema (every element is mandatory):
 * - YAML frontmatter declaring workflowType: testarch-test-review and a
 *   non-empty stepsCompleted list.
 * - A "**Recommendation**:" line in BOTH the "## Executive Summary" and the
 *   "## Decision" section; the two must agree (case-insensitively) and the
 *   value must be one of the legal enum, to which it is normalized.
 * - "**Quality Score**: N/100" with N an integer in 0-100.
 * - A "**Total Violations**:" line with all four severity counts.
 * - A "## Quality Score Breakdown" ledger whose arithmetic reproduces the
 *   published score; the skill's deduction model is the only scoring model, so
 *   a score that contradicts its own breakdown is rejected rather than gated on.
 * - A final "## Reviewed Files" section listing every reviewed file.
 *
 * Consistency cross-check: the template defines Critical as Must Fix, so a
 * report with Critical > 0 alongside an Approve / Approve with Comments
 * recommendation is a broken report, not a pass; it is rejected as
 * REPORT_UNPARSEABLE.
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

const RECOMMENDATION_ENUM = ['Approve', 'Approve with Comments', 'Request Changes', 'Block'];
const RECOMMENDATION_LINE = /\*\*Recommendation:?\*\*:?[ \t]*([^\n]+)/;
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
    unparseable(`Report is missing the "**Recommendation**:" line in the "## ${heading}" section`);
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

/** Parse the mandatory "## Reviewed Files" manifest into a path array. */
function parseReviewedFiles(text) {
  const section = extractSection(text, 'Reviewed Files');
  if (section === null) {
    unparseable('Report is missing the "## Reviewed Files" section');
  }
  const entries = section
    .split('\n')
    .map((line) =>
      line
        .trim()
        .replace(/^[-*]\s+/, '')
        .replaceAll(/[`*_]/g, '')
        .trim(),
    )
    .filter((line) => line.length > 0 && !line.startsWith('#'));
  if (entries.length === 0) {
    unparseable('Report "## Reviewed Files" section is empty');
  }
  const files = entries.filter((entry) => looksLikeFilePath(entry));
  if (files.length === 0) {
    unparseable(`Report "## Reviewed Files" section lists no file paths (found only prose: ${JSON.stringify(entries.slice(0, 3))})`);
  }
  return files;
}

/**
 * Recompute the template's deduction ledger and reject a report whose
 * arithmetic disagrees with the score it published.
 *
 * Two live runs over an identical four-file set returned 83/100 and 92/100, and
 * the lower one printed a breakdown that summed to 92, so a published score
 * cannot be trusted on its face. The ledger in `test-review-template.md` is the
 * workflow's only scoring model, which makes it recomputable here from the
 * violation counts the report already declares.
 *
 * The breakdown sits inside a fenced block, which the verdict scan strips, so
 * this reads the raw report instead and anchors on the section heading: only
 * the ledger under "## Quality Score Breakdown" is ever consulted.
 */
function verifyScoreLedger(rawText, qualityScore, violations) {
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
  const expected = Math.max(0, Math.min(100, 100 - deductions + bonus));
  if (expected !== qualityScore) {
    unparseable(
      `Report Quality Score ${qualityScore} contradicts its own breakdown: ` +
        `100 - ${deductions} deductions + ${bonus} bonus = ${expected}`,
    );
  }
}

/**
 * Extract the strict-schema verdict from report text.
 *
 * @param {string} reportText - Full test-review.md contents.
 * @returns {{recommendation: string, qualityScore: number, violations: object, reviewedFiles: string[]}}
 * @throws {Error} With code REPORT_UNPARSEABLE on any missing/invalid element.
 */
function parseReport(reportText) {
  const text = stripFencedCodeBlocks(reportText);

  parseFrontmatter(text);

  const executive = recommendationFromSection(text, 'Executive Summary');
  const decision = recommendationFromSection(text, 'Decision');
  if (executive !== decision) {
    unparseable(`Report has conflicting "**Recommendation**:" lines (${executive} in Executive Summary vs ${decision} in Decision)`);
  }

  const scoreMatch = text.match(SCORE_PATTERN);
  if (!scoreMatch) {
    unparseable('Report is missing the "**Quality Score**: N/100" line');
  }
  const qualityScore = Number.parseInt(scoreMatch[1], 10);
  if (qualityScore < 0 || qualityScore > 100) {
    unparseable(`Report Quality Score ${qualityScore} is outside the required 0-100 range`);
  }

  const violations = parseViolations(text);
  if (violations.critical > 0 && (executive === 'Approve' || executive === 'Approve with Comments')) {
    unparseable(
      `Report declares ${violations.critical} Critical violation(s) with a "${executive}" recommendation; ` +
        'critical violations with an approve recommendation is an inconsistent verdict',
    );
  }

  verifyScoreLedger(reportText, qualityScore, violations);

  const executiveSection = extractSection(text, 'Executive Summary');
  const keyStrengths = extractBullets(extractSubsection(executiveSection, 'Key Strengths'), '✅');
  const keyWeaknesses = extractBullets(extractSubsection(executiveSection, 'Key Weaknesses'), '❌');

  return {
    recommendation: executive,
    qualityScore,
    violations,
    reviewedFiles: parseReviewedFiles(text),
    keyStrengths,
    keyWeaknesses,
  };
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

module.exports = { parseReport, verdictFor, scoreFails };
