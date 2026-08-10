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
 * manifests are also bound to the exact reviewed and context inputs, and every
 * changed test artifact the run excluded must still be named under
 * "## Excluded From Review Set": the disclosure is part of the contract, not a
 * courtesy the agent may drop.
 *
 * A third, opt-in cross-check: when the run contract carries `conventionBaseline`
 * (every real CLI run does; see cli/lib/convention-baseline.js), the report's
 * "**Convention Baseline**:" line and every "Convention: <key> (<adopted> of
 * <sampled> sampled)" citation anywhere in the text are bound to what the CLI
 * actually measured over the real sampled files — never a number the agent
 * produced on its own. This exists because a live codex run on couture-cast PR #106
 * reported "Convention: priorityMarkers (18 of 40 sampled)" against a repo with
 * zero real instances of that convention anywhere, and nothing downstream ever
 * checked the claim: no fixture in this repo's own test suite even included a
 * "Convention Baseline" line before this cross-check existed. See
 * verifyConventionBaseline.
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

const { CONVENTION_KEYS } = require('./convention-baseline');

const RECOMMENDATION_ENUM = ['Approve', 'Approve with Comments', 'Request Changes', 'Block'];
const RECOMMENDATION_LINE = /^[ \t]*(?:\*\*Recommendation\*\*:|\*\*Recommendation:\*\*|Recommendation:)[ \t]*([^\r\n]+?)[ \t]*$/m;
const CONTEXT_BASIS_ENUM = ['none', 'pr_diff', 'pr_diff_truncated'];
const CONTEXT_BASIS_LINE_SOURCE = String.raw`^[ \t]*\*\*Context Basis:?\*\*:?[ \t]*([^\r\n]+)[ \t]*$`;
const CONTEXT_WAIVERS_LINE_SOURCE = String.raw`^[ \t]*\*\*Context Waivers Applied:?\*\*:?[ \t]*([^\r\n]+)[ \t]*$`;
const SCORE_PATTERN = /\*\*Quality Score\*\*:\s*(\d+)\s*\/\s*100(?:[ \t]*\([ \t]*([A-F])(?=[ \t)-]))?/;
const VIOLATIONS_LINE = /\*\*Total Violations:?\*\*:?[ \t]*([^\n]+)/;
const VIOLATION_LEVELS = ['Critical', 'High', 'Medium', 'Low'];
// The template always prints the bonus with a leading "+" (every fixture in
// test/fixtures/test-review-cli/reports/ does, including the zero case,
// "Total Bonus:             +0"), so an unsigned "Total Bonus: 0" is already
// off the mandated format and should not silently parse.
const BONUS_TOTAL_LINE = /^[ \t]*Total Bonus[ \t]*:[ \t]*\+[ \t]*(\d+)[ \t]*$/m;
// Live codex runs reflow the ledger into a markdown table (couture-cast run
// 31048018105 published "| Total Bonus | 0 |"), which step-04's own "tables
// aligned" polish invites. Rendering is not the contract: the enclosing heading
// is already validated unique, so a row inside that section carries the same
// weight as a line, and refusing it turns a substantively complete review into a
// red gate. The cell sign is optional because no observed table rendering keeps
// it, and the label case drifts alongside the reflow.
const BONUS_TOTAL_ROW = /^[ \t]*\|[ \t]*Total Bonus[ \t]*\|[ \t]*\+?[ \t]*(\d+)[ \t]*\|?[ \t]*$/im;
// Required literal forms, matched verbatim against what build-prompt.js's
// conventionBaselinePromptLines instructs the agent to write. Anchored full-line so
// a report cannot bury an unmodeled qualifier in the one line the CLI treats as
// ground truth for the whole baseline.
const CONVENTION_BASELINE_LINE_SOURCE = String.raw`^[ \t]*\*\*Convention Baseline\*\*:[ \t]*([^\r\n]+?)[ \t]*$`;
const CONVENTION_BASELINE_AVAILABLE_PATTERN = /^(\d+)\s*test files sampled outside the review set\.?$/i;
const CONVENTION_BASELINE_UNAVAILABLE_PATTERN = /^unavailable:\s*(.+)$/i;
// Not anchored to a section: a fabricated fraction is just as much a defect
// whether it lands in the criteria table's Basis column or in prose Notes.
const CONVENTION_CITATION_PATTERN = /Convention:\s*([A-Za-z]+)\s*\(\s*(\d+)\s*of\s*(\d+)\s*sampled\s*\)/gi;
const SEVERITY_DEDUCTIONS = { critical: 10, high: 5, medium: 2, low: 1 };
const MAX_BONUS = 30; // six bonus categories, worth 0 or 5 each
// Both renderings of the two normalized ledger fields, line form first. Held as
// lists so normalization latches on the replacement that landed rather than on
// the label it recognized.
const FINAL_SCORE_PATTERNS = [
  /^([ \t]*Final Score[ \t]*:[ \t]*)\d+([ \t]*\/[ \t]*100[ \t]*\r?)$/,
  /^([ \t]*\|[ \t]*Final Score[ \t]*\|[ \t]*)\d+((?:[ \t]*\/[ \t]*100)?[ \t]*\|?[ \t]*\r?)$/i,
];
const FINAL_GRADE_PATTERNS = [
  /^([ \t]*Grade[ \t]*:[ \t]*)[A-F]([ \t]*\r?)$/,
  /^([ \t]*\|[ \t]*Grade[ \t]*\|[ \t]*)[A-F]([ \t]*\|?[ \t]*\r?)$/i,
];

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

/**
 * Parse the optional "## Excluded From Review Set" disclosure manifest.
 *
 * Entries carry a reason after the path ("path — format not scorable by the
 * ledger"), and the section closes with a prose line about --test-glob, so an
 * entry is reduced to its leading token and kept only when that token still
 * looks like a file. The section is absent whenever nothing was excluded.
 */
function parseExcludedFiles(text) {
  const section = extractSection(text, 'Excluded From Review Set');
  if (section === null) {
    return [];
  }
  const files = manifestEntries(section)
    .map((entry) => stripWrappers(entry.split(/\s+/)[0]))
    .filter((entry) => /\.[A-Za-z0-9_+-]{1,12}$/.test(entry));
  return canonicalizeManifest(files, '## Excluded From Review Set');
}

function manifestDifference(left, right) {
  const rightSet = new Set(right);
  return left.filter((file) => !rightSet.has(file));
}

/** Bind report claims to the exact evidence supplied to this run. */
function verifyRunContract({ reviewedFiles, contextBasis, contextFiles, excludedFiles }, runContract) {
  const has = (key) => Object.prototype.hasOwnProperty.call(runContract, key);

  if (has('unscorableTestArtifacts')) {
    const suppliedExcluded = canonicalizeManifest(runContract.unscorableTestArtifacts, 'supplied excluded files');
    const dropped = manifestDifference(suppliedExcluded, excludedFiles);
    if (dropped.length > 0) {
      unparseable(
        `Report "## Excluded From Review Set" omits changed test artifacts this run excluded: ${JSON.stringify(dropped.slice(0, 3))}; ` +
          'a manifest that drops one reads as though the diff held nothing else to review',
      );
    }
    // No foreign check here, unlike the context manifest. The CLI knows the
    // artifacts IT excluded; the workflow also discloses exclusions the CLI
    // cannot see (a review_files path that does not exist, a file that would
    // not parse), and rejecting those would make its own disclose-every-exclusion
    // rule unimplementable.
  }

  if (has('reviewedFiles')) {
    const suppliedReviewed = canonicalizeManifest(runContract.reviewedFiles, 'supplied reviewed files');
    const missing = manifestDifference(suppliedReviewed, reviewedFiles).filter((file) => !excludedFiles.includes(file));
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

/** Extract every "Convention: <key> (<adopted> of <sampled> sampled)" citation in the report, wherever it appears. */
function parseConventionCitations(text) {
  return [...text.matchAll(CONVENTION_CITATION_PATTERN)].map((match) => ({
    key: match[1],
    adopted: Number.parseInt(match[2], 10),
    sampled: Number.parseInt(match[3], 10),
  }));
}

/** Extract the optional, at-most-one "**Convention Baseline**:" line's raw value. */
function parseConventionBaselineLine(text) {
  const matches = [...text.matchAll(new RegExp(CONVENTION_BASELINE_LINE_SOURCE, 'gm'))];
  if (matches.length === 0) {
    return null;
  }
  if (matches.length > 1) {
    unparseable(`Report must contain at most one "**Convention Baseline**:" line; found ${matches.length}`);
  }
  return stripWrappers(matches[0][1]);
}

/**
 * Bind every "Convention: <key> (<adopted> of <sampled> sampled)" citation, and the
 * "**Convention Baseline**:" line, to what this run actually measured — never to a
 * number the agent produced on its own. See this file's header comment for why.
 *
 * Two tiers, matching cli/lib/convention-baseline.js's own two tiers of confidence:
 * - `sampled` (and the overall corpus size) is 100% mechanical, so any disagreement
 *   is unconditionally rejected: a report cannot cite a corpus this run never sampled.
 * - `adopted` is only checked one direction. The CLI's own scan over the real
 *   sampled files is high-recall by design (see convention-baseline.js's doc
 *   comment), so a report claiming a nonzero adopted count for a key the CLI found
 *   zero real occurrences of is provably fabricated and rejected. A report claiming
 *   a LOWER or equally-nonzero count than the CLI found is left to the agent's
 *   judgment — a regex cannot know intent, so it is never used to force a number up.
 *
 * @param {string} text - Fence-stripped report text.
 * @param {object} [conventionBaselineContract] - The run's cli/lib/convention-baseline.js
 *   result, or undefined when the caller supplied no ground truth (e.g. a unit test
 *   of an unrelated feature) — in that case only the cheap, contract-free sanity
 *   checks below run (unrecognized key, adopted > sampled).
 */
function verifyConventionBaseline(text, conventionBaselineContract) {
  const citations = parseConventionCitations(text);
  for (const citation of citations) {
    if (!CONVENTION_KEYS.includes(citation.key)) {
      unparseable(`Report cites an unrecognized Convention key "${citation.key}"; expected one of: ${CONVENTION_KEYS.join(', ')}`);
    }
    if (citation.adopted > citation.sampled) {
      unparseable(
        `Report Convention citation "${citation.key}" claims ${citation.adopted} adopted of only ${citation.sampled} sampled, ` +
          'which is impossible',
      );
    }
  }

  const baselineLineRaw = parseConventionBaselineLine(text);
  if (!conventionBaselineContract) {
    return;
  }

  if (conventionBaselineContract.baselineUnavailable) {
    if (citations.length > 0) {
      unparseable(
        `Report cites Convention baseline fraction(s) (e.g. "${citations[0].key} (${citations[0].adopted} of ${citations[0].sampled} sampled)") ` +
          `while this run recorded baselineUnavailable (${conventionBaselineContract.reason}); an unmeasurable baseline may never be cited as a ` +
          'specific sampled fraction',
      );
    }
    if (baselineLineRaw !== null && !CONVENTION_BASELINE_UNAVAILABLE_PATTERN.test(baselineLineRaw)) {
      unparseable(
        `Report "**Convention Baseline**:" line "${baselineLineRaw}" must read "unavailable: <reason>"; this run could not measure a ` +
          `baseline (${conventionBaselineContract.reason})`,
      );
    }
    return;
  }

  if (baselineLineRaw === null) {
    unparseable('Report is missing the "**Convention Baseline**:" line; this run measured a real baseline and the report must state it');
  }
  const availableMatch = CONVENTION_BASELINE_AVAILABLE_PATTERN.exec(baselineLineRaw);
  if (!availableMatch) {
    unparseable(
      `Report "**Convention Baseline**:" line "${baselineLineRaw}" does not match the required ` +
        '"<N> test files sampled outside the review set" form',
    );
  }
  const declaredSampled = Number.parseInt(availableMatch[1], 10);
  if (declaredSampled !== conventionBaselineContract.sampled) {
    unparseable(
      `Report "**Convention Baseline**:" declares ${declaredSampled} sampled files, but this run actually sampled ` +
        `${conventionBaselineContract.sampled} outside the review set`,
    );
  }

  for (const citation of citations) {
    if (citation.sampled !== conventionBaselineContract.sampled) {
      unparseable(
        `Report Convention citation "${citation.key}" cites ${citation.sampled} sampled files, but this run actually sampled ` +
          `${conventionBaselineContract.sampled} outside the review set; a Convention row must be judged against the corpus this run ` +
          'measured, never a different count',
      );
    }
    const measured = conventionBaselineContract.conventions && conventionBaselineContract.conventions[citation.key];
    if (measured && measured.mechanical && measured.mechanicalSignal === false && citation.adopted > 0) {
      unparseable(
        `Report Convention citation "${citation.key} (${citation.adopted} of ${citation.sampled} sampled)" claims adoption, but this run ` +
          `scanned every one of the ${conventionBaselineContract.sampled} sampled files for the recognized forms and found zero occurrences; ` +
          'a convention with no real evidence in the sampled corpus must be reported as absent (0 adopted), never a fabricated nonzero count',
      );
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
  const bonusMatch = section.match(BONUS_TOTAL_LINE) || section.match(BONUS_TOTAL_ROW);
  if (!bonusMatch) {
    unparseable(
      'Report "## Quality Score Breakdown" is missing its "Total Bonus:" line; the template prints ' +
        '"Total Bonus:             +N" inside the fenced ledger, and a "| Total Bonus | N |" table row is also read',
    );
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

/**
 * Rewrite a line with the first pattern that matches it, reporting whether one did.
 *
 * Callers latch a field as normalized on `matched`. Latching on a looser label
 * probe instead let a malformed row consume the slot: the replacement silently
 * failed, no later row could fill it, and the report published a ledger value the
 * gate disagreed with.
 */
function replaceFirstMatch(line, patterns, replacement) {
  for (const pattern of patterns) {
    if (pattern.test(line)) {
      return { line: line.replace(pattern, replacement), matched: true };
    }
  }
  return { line, matched: false };
}

/** Normalize the report's schema-owned score and grade fields to CLI arithmetic. */
function normalizeReportScore(reportText, qualityScore) {
  const grade = gradeForScore(qualityScore);
  let inFence = false;
  let section = null;
  let summaryNormalized = false;
  let finalScoreNormalized = false;
  let finalGradeNormalized = false;

  return reportText
    .split('\n')
    .map((originalLine) => {
      let line = originalLine;
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return line;
      }

      if (!inFence) {
        const heading = /^##[ \t]+([^\r\n]+?)[ \t]*\r?$/.exec(line);
        if (heading) {
          section = heading[1];
        }
        if (!summaryNormalized && /^[ \t]*\*\*Quality Score\*\*:/.test(line)) {
          line = line
            .replace(/^([ \t]*\*\*Quality Score\*\*:[ \t]*)\d+([ \t]*\/[ \t]*100)/, `$1${qualityScore}$2`)
            .replace(/^([ \t]*\*\*Quality Score\*\*:[^\r\n]*\([ \t]*)[A-F](?=[ \t)-])/, `$1${grade}`);
          summaryNormalized = true;
        }
      }

      // The score ledger is itself a fenced block. Its fields remain active
      // only inside the unique Quality Score Breakdown section validated by
      // deriveQualityScore; unrelated fenced examples stay untouched.
      // A ledger reflowed into a table row is accepted by deriveQualityScore, so
      // it has to normalize too. Left un-normalized it published the agent's own
      // Final score and Grade beside a corrected headline, which is the
      // self-contradicting report the derived score exists to prevent.
      if (section === 'Quality Score Breakdown') {
        if (!finalScoreNormalized) {
          const scored = replaceFirstMatch(line, FINAL_SCORE_PATTERNS, `$1${qualityScore}$2`);
          line = scored.line;
          finalScoreNormalized = scored.matched;
        }
        if (!finalGradeNormalized) {
          const graded = replaceFirstMatch(line, FINAL_GRADE_PATTERNS, `$1${grade}$2`);
          line = graded.line;
          finalGradeNormalized = graded.matched;
        }
      }
      return line;
    })
    .join('\n');
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
  const reportedQualityGrade = scoreMatch[2];
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
  const excludedFiles = parseExcludedFiles(text);

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
  const scoredAndExcluded = excludedFiles.filter((file) => reviewedSet.has(file));
  if (scoredAndExcluded.length > 0) {
    unparseable(
      `Report lists ${JSON.stringify(scoredAndExcluded.slice(0, 3))} in both "## Reviewed Files" and ` +
        '"## Excluded From Review Set"; a file was either scored or excluded, never both',
    );
  }

  verifyRunContract({ reviewedFiles, contextBasis, contextFiles, excludedFiles }, runContract);
  verifyConventionBaseline(text, runContract.conventionBaseline);

  const executiveSection = extractSection(text, 'Executive Summary');
  const keyStrengths = extractBullets(extractSubsection(executiveSection, 'Key Strengths'), '✅');
  const keyWeaknesses = extractBullets(extractSubsection(executiveSection, 'Key Weaknesses'), '❌');

  // Same treatment the score already gets: derive it, publish the derived value, and
  // keep what the agent said so the substitution is visible rather than silent.
  const derivedRecommendation = deriveRecommendation(violations, qualityScore);

  const parsed = {
    recommendation: derivedRecommendation,
    qualityScore,
    violations,
    reviewedFiles,
    contextBasis,
    contextFiles,
    contextWaiversApplied,
    keyStrengths,
    keyWeaknesses,
  };
  // Surfaced (not just used to gate) so a stored verdict JSON says what this run
  // actually measured, the same reasoning as attaching agent/model: a fabricated
  // baseline is invisible to a human reviewer unless the ground truth travels with
  // the verdict, not just the pass/fail outcome of checking against it.
  if (runContract.conventionBaseline) {
    parsed.conventionBaseline = runContract.conventionBaseline;
  }
  if (
    reportedQualityScore !== qualityScore ||
    (reportedQualityGrade !== undefined && reportedQualityGrade !== gradeForScore(qualityScore))
  ) {
    parsed.reportedQualityScore = reportedQualityScore;
  }
  if (derivedRecommendation !== executive) {
    parsed.reportedRecommendation = executive;
  }
  return parsed;
}

/**
 * The recommendation the violation counts require, per
 * `steps-c/step-03f-aggregate-scores.md` §3b.
 *
 * The score has always been derived here rather than trusted. The recommendation
 * beside it was not, and `--fail-on` acts on the recommendation. That asymmetry was
 * measurable: on couture-cast PR #103 two reviewers of the same four files scored 82
 * and 85, a 3-point spread that is noise, and returned "Request Changes" against
 * "meets our quality bar for merge". The half of the report the CLI did not derive
 * was the half that decided the gate.
 *
 * @param {object} violations - {critical, high, medium, low} counts.
 * @param {number} qualityScore - The derived ledger score, never the reported one.
 * @returns {string} A member of RECOMMENDATION_ENUM.
 */
function deriveRecommendation(violations, qualityScore) {
  if (violations.critical > 0) return 'Block';
  if (violations.high > 0) return 'Request Changes';
  // Volume alone can fail the bar: fifteen MEDIUM findings is a systemic problem a
  // rule keyed only on severity tiers would wave through.
  if (qualityScore < 70) return 'Request Changes';
  if (violations.medium + violations.low > 0) return 'Approve with Comments';
  return 'Approve';
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

module.exports = {
  parseReport,
  normalizeReportScore,
  deriveRecommendation,
  verdictFor,
  scoreFails,
  CONTEXT_BASIS_ENUM,
  verifyConventionBaseline,
  parseConventionCitations,
};
