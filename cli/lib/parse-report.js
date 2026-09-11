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
 * Three display fields are extracted best-effort from the Executive Summary:
 * `keyStrengths`, `keyWeaknesses`, and `advisoryObservations`. A Key Weakness
 * must begin with a registry row in square brackets and that row must occur in
 * the report's scored finding blocks. This keeps free-form suggestions and
 * inapplicable checks out of the weakness digest. Reports using the old bullet
 * shape still parse and gate normally; their unverifiable weakness bullets are
 * simply omitted from display enrichment. Advisory observations remain
 * unscored. Empty and literal n/a bullets are omitted from both collections.
 *
 * The verdict also carries `findings`: one entry per finding block documented
 * under "## Critical Issues (Must Fix)" and "## Recommendations (Should Fix)",
 * each with its severity, criteria-registry row, file, and line. It exists because
 * `violations` is four severity COUNTS, so every consumer that needed to know WHICH
 * defects a review reported had to re-parse the markdown report with its own
 * regexes. The machine-readable artifact was not machine-readable enough to score,
 * which left the prose report as the real contract. See extractFindings.
 *
 * Fenced code blocks (``` ... ```) are stripped before scanning so an example
 * report quoted inside the real one can never spoof a verdict.
 */

const path = require('node:path');

const { CONVENTION_KEYS } = require('./convention-baseline');
const { SEVERITY_ENUM } = require('./registry-rows');

const RECOMMENDATION_ENUM = ['Approve', 'Approve with Comments', 'Request Changes', 'Block'];
const RECOMMENDATION_LINE = /^[ \t]*(?:\*\*Recommendation\*\*:|\*\*Recommendation:\*\*|Recommendation:)[ \t]*([^\r\n]+?)[ \t]*$/m;
const CONTEXT_BASIS_ENUM = ['none', 'pr_diff', 'pr_diff_truncated'];
// step-03-quality-evaluation.md's own three resolved modes. `auto` is a request,
// never a resolution, so it is deliberately absent: a report that says `auto` never
// ran the probe.
const EXECUTION_MODE_ENUM = ['agent-team', 'subagent', 'sequential'];
const EXECUTION_MODE_LINE_SOURCE = String.raw`^[ \t]*\*\*Execution Mode:?\*\*:?[ \t]*([^\r\n]+?)[ \t]*$`;
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
const SEVERITY_SCORE_CAPS = { critical: 69, high: 79, medium: 89, low: 99 };
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

/**
 * Every key parseReport's verdict object can carry, with the JSON type of each.
 *
 * `always` is what a parseable report always produces; `conditional` is what
 * appears only when the run supplies it or when the agent's own numbers had to
 * be corrected. The split matters because a contract's `requiredKeys` and
 * `permittedKeys` are exactly those two sets.
 *
 * parseReport builds its return value by projecting through this constant, so a
 * field cannot enter the payload without being declared here.
 * tools/generate-contracts.js derives test-review.contract.json's response
 * descriptor from it, through the VERDICT_KEYS composition in cli/test-review.js.
 * That makes the descriptor a reading of this code. The transcription it replaced
 * had already drifted: the CLI could emit twenty-two keys where the contract on
 * disk permitted fifteen. This is the idiom tools/validate-eval-schemas.js uses to
 * check a manifest's declared thresholds against the THRESHOLDS its harness
 * applies.
 *
 * Type names are eval-quality's JSON type enum. `null` means "declared, type not
 * stated", which is the spelling for a key whose value has no single JSON type.
 */
const PARSED_VERDICT_KEYS = {
  always: {
    recommendation: 'string',
    rawQualityScore: 'number',
    qualityScore: 'number',
    scoreCap: 'number',
    scoreOverrideRule: 'string',
    verdictRule: 'string',
    violations: 'object',
    findings: 'array',
    reviewedFiles: 'array',
    contextBasis: 'string',
    contextFiles: 'array',
    contextWaiversApplied: 'number',
    keyStrengths: 'array',
    keyWeaknesses: 'array',
    advisoryObservations: 'array',
  },
  conditional: {
    conventionBaseline: 'object',
    executionMode: 'string',
    reportedQualityScore: 'number',
    reportedRecommendation: 'string',
  },
};

/**
 * A programmer-error throw, carrying no REPORT_UNPARSEABLE code.
 *
 * These guards fire on a mismatch between the code and its own key declaration,
 * never on report content, so routing them through the parse-failure exit code
 * would report a CLI defect as a bad report.
 */
function undeclaredKey(message) {
  throw new Error(`parse-report: ${message}`);
}

/**
 * Build the verdict object from PARSED_VERDICT_KEYS.always, in that order.
 *
 * The projection runs in both directions: a declared key with no computed value
 * throws, and a computed value with no declaration throws. Either one alone would
 * let the declaration and the payload drift, which is the defect this constant
 * exists to close.
 */
function projectAlwaysKeys(values) {
  const parsed = {};
  for (const key of Object.keys(PARSED_VERDICT_KEYS.always)) {
    if (!Object.hasOwn(values, key)) {
      undeclaredKey(`PARSED_VERDICT_KEYS declares "${key}" and parseReport computed no value for it`);
    }
    parsed[key] = values[key];
  }
  for (const key of Object.keys(values)) {
    if (!Object.hasOwn(PARSED_VERDICT_KEYS.always, key)) {
      undeclaredKey(`parseReport computed "${key}", which PARSED_VERDICT_KEYS.always does not declare`);
    }
  }
  return parsed;
}

/** Attach one of the conditional keys, refusing any name the constant does not declare. */
function setConditionalKey(parsed, key, value) {
  if (!Object.hasOwn(PARSED_VERDICT_KEYS.conditional, key)) {
    undeclaredKey(`parseReport set "${key}", which PARSED_VERDICT_KEYS.conditional does not declare`);
  }
  parsed[key] = value;
}

function unparseable(message) {
  const error = new Error(`${message}; a parse failure is never a silent pass.`);
  error.code = 'REPORT_UNPARSEABLE';
  throw error;
}

/**
 * A fence opener or closer: any leading whitespace, then three or more backticks
 * or three or more tildes, then whatever follows on the line.
 *
 * CommonMark bounds a fence's indent at three spaces and reads four as an
 * indented code block. This admits any indent on purpose, and the reason is what
 * the function is for. It is a spoof defence: its job is to stop a quoted example
 * being read as the report's own content, so over-stripping costs a reader
 * nothing and under-stripping restores the defect. A fence indented four spaces,
 * which is what a fence takes inside a list item, is content either way under
 * CommonMark, and refusing to strip it would hand the scanner a quoted example
 * that the implementation this replaced did strip.
 *
 * The trailing `\r?` is load-bearing. JavaScript's `.` excludes a carriage
 * return, so a pattern ending `(.*)$` matched no line at all on a CRLF document
 * and stripping was silently disabled on every report written on Windows.
 */
const FENCE_LINE = /^[ \t]*(`{3,}|~{3,})([^\r\n]*?)\r?$/;

/**
 * Every line of `text` paired with the fence depth it sits at: 0 outside any
 * fenced block and 1 inside one. A fence line itself carries the depth of the
 * block it opens or closes.
 *
 * Only those two values occur, and that is the point rather than an omission.
 * Fenced blocks do not nest: inside an open block every line is literal content
 * until the matching closer, which is the same character, at least as long, with
 * nothing else on the line. So a longer opener carries a shorter fence inside it
 * as text, and a `~~~` line inside a backtick block opens nothing. The toggle
 * this replaced got both wrong, and each was the spoof the function exists to
 * prevent reached by a different spelling: a `~~~` block was not a fence at all,
 * so an example quoted that way was read as content, and a block opened with four
 * backticks was closed by its first inner ```` ``` ````, so the rest of a quoted
 * example surfaced.
 *
 * The depth is returned rather than a boolean because a caller can need to ask
 * the question per line and keep the line numbering. `test/eval-nfr.js` reads it
 * that way: it locates the run's own `## Gate YAML Snippet` heading among the
 * lines at depth 0, because a heading inside a fence is quoted content, and then
 * reads the gate scalar out of that section of the original document. Depth alone
 * would not answer it, since the report's own snippet and one quoted inside a
 * longer fence both sit at depth 1.
 *
 * @param {string} text
 * @returns {number[]} One depth per line, in order.
 */
function fenceDepths(text) {
  const depths = [];
  const open = [];
  for (const line of text.split('\n')) {
    const match = FENCE_LINE.exec(line);
    if (!match) {
      depths.push(open.length);
      continue;
    }
    const marker = match[1];
    const info = match[2];
    const enclosing = open.at(-1);
    if (enclosing) {
      // Inside an open block every line is literal content until the matching
      // closer, which is the same character, at least as long, with nothing else
      // on the line. A fence of the other character does not open anything here;
      // treating it as an opener pushed a level the real closer could not pop, and
      // the rest of the document stayed hidden at a depth it never left.
      if (marker[0] === enclosing.char && marker.length >= enclosing.length && info.trim() === '') {
        depths.push(open.length);
        open.pop();
      } else {
        depths.push(open.length);
      }
      continue;
    }
    // A backtick opener may not carry a backtick in its info string. Without
    // this an inline span such as `` `a` `` on its own line would open a block
    // that never closes.
    if (marker[0] === '`' && info.includes('`')) {
      depths.push(open.length);
      continue;
    }
    open.push({ char: marker[0], length: marker.length });
    depths.push(open.length);
  }
  return depths;
}

/** Remove fenced code blocks (fence lines included) from report text. */
function stripFencedCodeBlocks(text) {
  const depths = fenceDepths(text);
  return text
    .split('\n')
    .filter((_, index) => depths[index] === 0)
    .join('\n');
}

/** Escape a literal string for interpolation into a RegExp source. */
function escapeRegExp(literal) {
  return literal.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/**
 * Extract a level-2 section's text, up to the next level-2 heading or EOF.
 * `heading` is a literal string (escaped internally), not a regex fragment: some
 * real headings contain parens ("Critical Issues (Must Fix)").
 */
function extractSection(text, heading) {
  const match = new RegExp(`^## ${escapeRegExp(heading)}[ \\t]*$`, 'm').exec(text);
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

/** A literal placeholder is not a human-readable observation. */
function isDisplayItem(line) {
  return line.length > 0 && !/^n\s*\/?\s*a[.!]?$/i.test(line);
}

/**
 * Extract advisory bullets in either the template's ℹ️ form or ordinary
 * Markdown-list form. Advisory text is deliberately not tied to findings.
 */
function extractAdvisoryObservations(subsectionText, maxItems = 10) {
  if (!subsectionText) {
    return [];
  }
  const observations = [];
  for (const rawLine of subsectionText.split('\n')) {
    if (observations.length >= maxItems) break;
    const match = rawLine.match(/^(?:ℹ️[ \t]*|[-*][ \t]+)(.+)$/);
    if (!match) continue;
    const line = match[1].trim();
    if (isDisplayItem(line)) observations.push(line);
  }
  return observations;
}

/**
 * Return only weakness bullets attributable to a scored finding.
 *
 * The row prefix is retained in the display text so a PR comment keeps the
 * evidence link visible. Old free-form bullets are tolerated but cannot be
 * proved scored, so they are not published as Key weaknesses.
 */
function extractScoredWeaknesses(subsectionText, findings, maxItems = 5) {
  if (!subsectionText) {
    return [];
  }
  const weaknesses = [];
  const publishedFindingIndexes = new Set();
  for (const rawLine of subsectionText.split('\n')) {
    if (weaknesses.length >= maxItems) break;
    const bullet = rawLine.match(/^(?:❌[ \t]*|[-*][ \t]+)(.+)$/);
    if (!bullet) continue;
    const line = bullet[1].trim();
    if (!isDisplayItem(line)) continue;
    const row = line.match(/^\[([A-Z]\d+)\](?:[ \t]+|$)/)?.[1];
    const findingIndex = findings.findIndex((candidate, index) => candidate.row === row && !publishedFindingIndexes.has(index));
    if (findingIndex !== -1) {
      const finding = findings[findingIndex];
      weaknesses.push(`[${finding.row}] ${finding.title}`);
      publishedFindingIndexes.add(findingIndex);
    }
  }
  return weaknesses;
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

/**
 * Parse the at-most-one "**Execution Mode**:" line, required on any run that
 * measured a convention baseline.
 *
 * `step-03-quality-evaluation.md` resolves its own execution mode from a runtime
 * capability probe and prints the result to the agent's stdout, which
 * `cli/lib/run-agent.js` captures and `cli/test-review.js` reads only when the
 * report is missing. So a run that asked for parallel workers and silently got
 * `sequential` was indistinguishable, after the fact, from one that got what it
 * asked for. That made "this change made the review faster" unfalsifiable: the
 * gain could have come from anywhere. The mode is a run input the same way the
 * model and the convention baseline are, so it travels in the verdict with them.
 *
 * Required exactly when the run supplied a convention baseline, which every real
 * CLI run does. Making it unconditionally optional would have left the hole it
 * exists to close: a report that omits the line is as silent about its mode as one
 * written before the line existed, and the failure gradient would run the wrong way,
 * with an omission passing and a malformed value exiting 3. A bare `parseReport`
 * call in a unit test supplies no baseline and needs no mode.
 *
 * @param {string} text - Full report.
 * @param {boolean} required - Whether this run has to state a mode.
 * @returns {string|null} The resolved mode, or null when none is stated and none is required.
 */
function parseExecutionMode(text, required) {
  const matches = [...text.matchAll(new RegExp(EXECUTION_MODE_LINE_SOURCE, 'gm'))];
  if (matches.length === 0) {
    if (required) {
      unparseable(
        'Report is missing the "**Execution Mode**:" line; state the mode step-03 actually resolved ' +
          `(${EXECUTION_MODE_ENUM.join(' | ')}), so a run that fell back to sequential says so in its own artifact`,
      );
    }
    return null;
  }
  if (matches.length > 1) {
    unparseable(`Report must contain at most one "**Execution Mode**:" line; found ${matches.length}`);
  }
  const cleaned = stripWrappers(matches[0][1].replaceAll(/\s+/g, ' ')).toLowerCase();
  if (!EXECUTION_MODE_ENUM.includes(cleaned)) {
    unparseable(`Report Execution Mode "${cleaned}" is not one of: ${EXECUTION_MODE_ENUM.join(' | ')}`);
  }
  return cleaned;
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
          `scanned every one of the ${conventionBaselineContract.scanned ?? conventionBaselineContract.sampled} files in its scanned corpus ` +
          'for the recognized forms and found zero occurrences; a convention with no real evidence anywhere in that corpus must be ' +
          'reported as absent (0 adopted), never a fabricated nonzero count',
      );
    }
  }
}

const CRITICAL_ISSUES_HEADING = 'Critical Issues (Must Fix)';
const RECOMMENDATIONS_HEADING = 'Recommendations (Should Fix)';
const FINDING_HEADING_PATTERN = /^### /m;
const FINDING_SEVERITY_LINE = /^\*\*Severity\*\*:\s*P([0-3])\s*\(([A-Za-z]+)\)/m;
const FINDING_PROVENANCE_LINE = /^\*\*Provenance\*\*:\s*(introduced|modified|pre_existing)\s*$/im;
// Captures whatever token follows, valid-looking or not, so a fabricated ID (e.g.
// "Z9") is reported as "not a real row" rather than misread as "no Row line at all".
const FINDING_ROW_LINE = /^\*\*Row\*\*:\s*(\S+)/m;
// The template prints "**Location**: `{filename}:{line_number}`". The bold-colon
// variant and a dropped pair of backticks are the two shapes live runs drift into,
// and the value itself is read leniently (see parseFindingLocation).
const FINDING_LOCATION_LINE = /^\*\*Location:?\*\*:?[ \t]*([^\r\n]+?)[ \t]*$/m;
// A file extension, spelled the way looksLikeFilePath spells it, so the two
// places that decide "is this spaced token a path" decide it the same way.
const PATH_EXTENSION = String.raw`\.[A-Za-z0-9_+-]{1,12}`;
// A path that may contain spaces, ended by its extension. The first form needs a
// ":<line>" after it; the second needs the value to end or to continue with a
// separator. See parseFindingLocation for why each one is a fallback.
const SPACED_PATH_WITH_LINE = new RegExp(String.raw`^(.+?${PATH_EXTENSION}):(\d+)`);
const SPACED_PATH_ONLY = new RegExp(String.raw`^(.+?${PATH_EXTENSION})(?=$|[\s,;()])`);
const ROW_ID_SHAPE = /^[CHML]\d+$/;
const PRIORITY_TO_SEVERITY = { 0: 'Critical', 1: 'High', 2: 'Medium', 3: 'Low' };
const FINDING_DEDUCTIONS = { Critical: 10, High: 5, Medium: 2, Low: 1 };
// The title is display data for a human reading the verdict, so it is bounded the
// same way keyStrengths is: a runaway heading must not bloat the stored payload.
const MAX_FINDING_TITLE_LENGTH = 200;

/** Stable finding wire shape. null means the field may safely carry JSON null. */
const FINDING_KEYS = {
  criterion_id: 'string',
  severity: null,
  path: null,
  line: null,
  provenance: 'string',
  deduction: null,
  verdict_impact: 'boolean',
  row: 'string',
  file: null,
  section: 'string',
  title: 'string',
  // Added by diff-evidence.js's applyFindingProvenance for a PR review; stays
  // null for a baseline (--gate-on all, or --files) run that never classifies
  // findings against changed lines.
  changed_line_evidence: null,
};

function findingRecord(values) {
  const keys = Object.keys(values);
  if (keys.length !== Object.keys(FINDING_KEYS).length || keys.some((key) => !Object.hasOwn(FINDING_KEYS, key))) {
    undeclaredKey(`finding keys ${JSON.stringify(keys)} disagree with FINDING_KEYS`);
  }
  return Object.fromEntries(Object.keys(FINDING_KEYS).map((key) => [key, values[key]]));
}

/** Split a section's text into its "### N. Title" finding blocks (empty when none). */
function splitFindingBlocks(sectionText) {
  if (!sectionText || !FINDING_HEADING_PATTERN.test(sectionText)) {
    return [];
  }
  // The template's "No critical issues detected. ✅" / "No additional recommendations..."
  // placeholder is plain prose with no "### " heading, so it never produces a block here;
  // an empty array already represents "no findings" correctly.
  return sectionText
    .split(FINDING_HEADING_PATTERN)
    .slice(1)
    .map((body) => `### ${body}`);
}

/** The finding block's heading text, minus its positional "N." prefix, bounded. */
function findingTitle(block) {
  const heading = block.slice('### '.length).split('\n')[0];
  const title = stripWrappers(heading.trim())
    .replace(/^\d+[.)]\s*/, '')
    .trim();
  return title.length > MAX_FINDING_TITLE_LENGTH ? `${title.slice(0, MAX_FINDING_TITLE_LENGTH)}...` : title;
}

/**
 * Split a "**Location**:" value into a file path and a line number.
 *
 * Best effort, and it never throws. Location is the finding field live reports
 * reshape most (a line range, a parenthesized line, a bare path with no line), and
 * a shape this cannot read must not take an otherwise complete review down with it.
 * Each half comes back null on its own, so a consumer can tell "the report named no
 * line" from "the report said line 0".
 *
 * A path may contain a space. `looksLikeFilePath` already admits one in the
 * Reviewed Files manifest, on the rule that a spaced token is a path when it ends
 * in an extension, and the same rule applies here. Until it did, the value
 * `tests/checkout flow.spec.ts:38` published a finding against `tests/checkout`
 * with no line at all: a real file name, a real severity, a real contribution to
 * the gate, and a path nobody can open. A wrong file is worse than a missing one.
 *
 * The space-tolerant read runs only where the whitespace-free read fails, so every
 * value that already parsed still parses the same way. What it costs is a Location
 * line written as prose around a filename, which now yields the whole phrase as
 * the file where it used to yield none; that value is a malformed report either
 * way, and it reaches the verdict marked with the line it claims.
 *
 * @param {string|null} rawValue - The captured "**Location**:" value, or null.
 * @returns {{file: string|null, line: number|null}}
 */
function parseFindingLocation(rawValue) {
  if (rawValue === null) {
    return { file: null, line: null };
  }
  const value = stripWrappers(rawValue).replaceAll('\\', '/');
  // A token has to look like a path to be published as one, so a "**Location**: TBD"
  // reaches the consumer as no location rather than as a file nobody can open.
  const asPath = (token) => {
    const cleaned = stripWrappers(token);
    return /[./]/.test(cleaned) ? cleaned : null;
  };
  const pathWithLine = /^([^\s:]+):(\d+)/.exec(value) ?? SPACED_PATH_WITH_LINE.exec(value);
  if (pathWithLine) {
    return { file: asPath(pathWithLine[1]), line: Number.parseInt(pathWithLine[2], 10) };
  }
  // Backticks are stripped again here: emphasis that wraps only the path survives
  // the whole-value strip above, as in "`tests/x.spec.ts` (line 12)".
  // The extension-anchored read comes first here, because the loose one matches
  // almost anything and would never yield to it. The loose one still runs for a
  // value the anchored one cannot end, such as a path wrapped in backticks.
  const pathOnly = SPACED_PATH_ONLY.exec(value) ?? /^([^\s,;()]+)/.exec(value);
  const spelledLine = /\blines?\s*:?\s*(\d+)/i.exec(value);
  return {
    file: pathOnly ? asPath(pathOnly[1]) : null,
    line: spelledLine ? Number.parseInt(spelledLine[1], 10) : null,
  };
}

/**
 * Resolve and validate a finding's criteria-registry row, or throw.
 *
 * The registry row is the finding's identity: severity is read from it, and it is
 * what makes one reviewer's finding comparable to another's. A row that names an id
 * criteria-registry.md does not carry stays an error, and so does a declared
 * "**Severity**:" that disagrees with the row it cites.
 *
 * @returns {{row: string, severity: string|null}} The severity is the registry's,
 *   falling back to the declared value only when no registry map was supplied.
 */
function requireRow(rowMatch, sectionLabel, declaredSeverity, rawSeverity, registryRowSeverities) {
  if (!rowMatch) {
    unparseable(
      `A finding under "## ${sectionLabel}" has no "**Row**:" line; every finding there must cite the criteria-registry ` +
        'row that produced it, per the report contract',
    );
  }
  // Wrapping emphasis is stripped because a backticked "**Row**: `C1`" is a
  // rendering choice, and rendering has never been the contract in this file.
  const row = stripWrappers(rowMatch[1]);
  // Contract-free shape check: a token that isn't even <letter><digits> shaped is
  // fabricated regardless of whether registry data is available to check further.
  if (!ROW_ID_SHAPE.test(row)) {
    unparseable(
      `A finding under "## ${sectionLabel}" cites Row "${row}", which is not a criteria-registry row ID ` +
        '(expected a shape like "C1", "H5", "M3", "L2")',
    );
  }
  if (!registryRowSeverities) {
    return { row, severity: declaredSeverity };
  }
  const rowSeverity = registryRowSeverities[row];
  if (!rowSeverity) {
    unparseable(`A finding under "## ${sectionLabel}" cites Row "${row}", which is not a row in criteria-registry.md`);
  }
  // A finding that declares nothing is judged by its row alone, which is the rule
  // criteria-registry.md states. A finding that declares something else is rejected
  // rather than corrected, so relabelling a Critical row as a Low fails the report
  // instead of quietly publishing the registry value beside contradicting prose.
  if (rawSeverity !== null && rowSeverity !== declaredSeverity) {
    unparseable(
      `A finding under "## ${sectionLabel}" cites Row "${row}" (registry severity ${rowSeverity}) but declares Severity ` +
        `${declaredSeverity ?? rawSeverity ?? '(unrecognized)'}; severity is read from the row, never chosen`,
    );
  }
  return { row, severity: rowSeverity };
}

/**
 * Parse one "### N. Title" block into a finding entry, or null when it is prose.
 *
 * @param {string} block - The block text, "### " prefix included.
 * @param {string} sectionLabel - The level-2 heading the block was found under.
 * @param {object|null} registryRowSeverities - See extractFindings.
 * @returns {object|null}
 */
function parseFindingBlock(block, sectionLabel, registryRowSeverities) {
  const severityMatch = block.match(FINDING_SEVERITY_LINE);
  const rowMatch = block.match(FINDING_ROW_LINE);
  const isCriticalSection = sectionLabel === CRITICAL_ISSUES_HEADING;

  // "## Critical Issues (Must Fix)" is findings-only by contract, so every block
  // there is one. The same heading level under "## Recommendations (Should Fix)"
  // also carries prose (naming notes, a closing paragraph), and a block with
  // neither finding line is that prose. Skipping it keeps a real report parsing;
  // a paragraph has no registry row to cite.
  if (!isCriticalSection && !severityMatch && !rowMatch) {
    return null;
  }

  let declaredSeverity = null;
  if (severityMatch) {
    const word = severityMatch[2];
    const canonical = SEVERITY_ENUM.find((candidate) => candidate.toLowerCase() === word.toLowerCase());
    // Only trust a P-number/word pair that agree with each other (per the template,
    // P0 is always "(Critical)", never "(High)" attached to a P0 by mistake).
    declaredSeverity = canonical && PRIORITY_TO_SEVERITY[severityMatch[1]] === canonical ? canonical : null;
  }
  const rawSeverity = severityMatch ? severityMatch[0].replace(/^\*\*Severity\*\*:\s*/, '') : null;

  if (isCriticalSection && declaredSeverity !== 'Critical') {
    unparseable(
      `A finding under "## ${CRITICAL_ISSUES_HEADING}" declares Severity ${rawSeverity ?? '(missing)'} instead of ` +
        `P0 (Critical); "## ${CRITICAL_ISSUES_HEADING}" is Critical-only by contract`,
    );
  }

  const { row, severity } = requireRow(rowMatch, sectionLabel, declaredSeverity, rawSeverity, registryRowSeverities);
  const locationMatch = block.match(FINDING_LOCATION_LINE);
  // A finding with no readable "**Location**:" is kept, with a null file and line.
  // Dropping it would make the verdict document fewer findings than the report and
  // than its own summary line counted, so a formatting slip would read downstream as
  // a defect nobody found. The entry still counts toward its severity; only the
  // place to look is missing, and the null says so.
  const { file, line } = parseFindingLocation(locationMatch ? locationMatch[1] : null);
  const provenance = block.match(FINDING_PROVENANCE_LINE)?.[1].toLowerCase() ?? 'unknown';
  const deduction = severity === null ? null : FINDING_DEDUCTIONS[severity];

  return findingRecord({
    // Stable automation fields. `unknown` is deliberate when an older report
    // has no changed-line classification; inferring one from a file-level diff
    // would fabricate evidence.
    criterion_id: row,
    severity,
    path: file,
    line,
    provenance,
    deduction,
    verdict_impact: true,
    // Compatibility aliases and display data used by existing consumers.
    row,
    file,
    section: sectionLabel,
    title: findingTitle(block),
    // Set for real by applyFindingProvenance on a PR review; parseReport itself
    // never sees a diff, so this stays null until that later enrichment step.
    changed_line_evidence: null,
  });
}

/**
 * Extract every finding documented under the two finding sections, once.
 *
 * This is the single parse of the finding blocks: the severity-count cross-check
 * below and the verdict's own `findings` array both read this list, so the verdict
 * can never publish something other than what the report was gated on.
 *
 * Findings are never deduplicated here. Identity — `(file, line, row)`, with
 * file-level rows dropping the line — is applied by the workflow's own aggregation
 * step (steps-c/step-03f-aggregate-scores.md §2), which runs before the report
 * exists, so this parser reads an already-deduplicated list. Collapsing duplicates a
 * second time would leave the verdict documenting fewer findings than the report it
 * came from, and would hide a run whose aggregation never deduplicated at all.
 *
 * @param {string} text - Fence-stripped report text, so a finding block quoted
 *   inside a fenced example report can never reach the verdict.
 * @param {object|null} registryRowSeverities - cli/lib/registry-rows.js's row→severity
 *   map, or null when unavailable (e.g. a bare test-fixture skill root with no
 *   criteria-registry.md) — row IDs are still required and shape-validated, but the
 *   "does this row really exist, and is its real severity what the finding claims"
 *   cross-check is skipped without it, and severity falls back to the declared value.
 * @returns {Array<{criterion_id: string, severity: string|null, path: string|null,
 *   line: number|null, provenance: string, deduction: number|null,
 *   verdict_impact: boolean, row: string, file: string|null, section: string,
 *   title: string}>}
 */
function extractFindings(text, registryRowSeverities) {
  const findings = [];
  for (const heading of [CRITICAL_ISSUES_HEADING, RECOMMENDATIONS_HEADING]) {
    for (const block of splitFindingBlocks(extractSection(text, heading))) {
      const finding = parseFindingBlock(block, heading, registryRowSeverities);
      if (finding !== null) {
        findings.push(finding);
      }
    }
  }
  return findings;
}

/** Documented findings per severity; one with no resolvable severity counts in none. */
function findingCountsBySeverity(findings) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const finding of findings) {
    if (finding.severity) {
      counts[finding.severity.toLowerCase()] += 1;
    }
  }
  return counts;
}

/**
 * Bind the extracted findings to the report's own "**Total Violations**:" line.
 *
 * Why this exists: nothing here was ever checked before. A report could — and, in the
 * defect this fixes, would — document a real, row-cited Critical finding in prose
 * while its "**Total Violations**:" line claimed zero, and the CLI computed Approve
 * at 100/100 from the summary line alone, never reading the finding it sat beside.
 *
 * Critical and High are exact in both directions. They are the two severities that
 * change the CI verdict (`deriveRecommendation`: any Critical → Block, any High →
 * Request Changes), and build-prompt.js states the equality to the agent verbatim.
 *
 * Medium and Low are bounded in one direction only: a report may document fewer than
 * it counted, and may never document more. The asymmetry is deliberate. Summarizing
 * a counted Medium in prose is the shape live reports actually take. Every fixture
 * in test/fixtures/test-review-cli/reports/ that declares a Medium or Low count
 * writes no block for it, and the prompt has never forbidden that, so rejecting it
 * would fail substantively complete reviews over a presentation choice. Over-
 * documentation is a different thing: the ledger deducted for fewer findings than
 * the report describes, so the published score is higher than its own findings
 * support. That is the same class of defect as a miscounted Critical, and it is
 * rejected the same way.
 *
 * @param {Array} findings - extractFindings' result.
 * @param {{critical: number, high: number, medium: number, low: number}} violations
 */
function assertFindingCountsAgree(findings, violations) {
  const documented = findingCountsBySeverity(findings);
  if (documented.critical !== violations.critical) {
    unparseable(
      `Report "**Total Violations**:" declares ${violations.critical} Critical, but "## ${CRITICAL_ISSUES_HEADING}" documents ` +
        `${documented.critical} finding(s); the two must agree exactly`,
    );
  }
  if (documented.high !== violations.high) {
    unparseable(
      `Report "**Total Violations**:" declares ${violations.high} High, but "## ${RECOMMENDATIONS_HEADING}" documents ` +
        `${documented.high} High-severity finding(s); the two must agree exactly`,
    );
  }
  for (const level of ['Medium', 'Low']) {
    const key = level.toLowerCase();
    if (documented[key] > violations[key]) {
      unparseable(
        `Report "**Total Violations**:" declares ${violations[key]} ${level}, but "## ${RECOMMENDATIONS_HEADING}" documents ` +
          `${documented[key]} ${level}-severity finding(s); a report may summarize findings it counted, never count fewer ` +
          'than it documents, which deducts less than its own findings require',
      );
    }
  }
}

/**
 * Extract every documented finding and bind it to the report's summary counts.
 *
 * @param {string} text - Fence-stripped report text.
 * @param {{critical: number, high: number, medium: number, low: number}} violations -
 *   Parsed Total Violations counts.
 * @param {object|null} registryRowSeverities - See extractFindings.
 * @returns {Array} The extracted findings, for the verdict payload.
 */
function verifyFindingSeverityCounts(text, violations, registryRowSeverities) {
  const findings = extractFindings(text, registryRowSeverities);
  assertFindingCountsAgree(findings, violations);
  return findings;
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
  return Math.max(0, Math.min(100, 100 - deductionsFor(violations) + bonus));
}

/** Sum of severity deductions for a {critical, high, medium, low} count. */
function deductionsFor(violations) {
  return VIOLATION_LEVELS.reduce((sum, level) => {
    const key = level.toLowerCase();
    return sum + violations[key] * SEVERITY_DEDUCTIONS[key];
  }, 0);
}

/**
 * Recompute the raw deduction score for a smaller violation count than the one
 * a report's own ledger describes (e.g. after excluding pre-existing findings
 * from a PR gate), using only what the ledger already proves.
 *
 * `rawQualityScore` is floor/ceiling-clamped to 0-100, so the bonus behind it
 * is exactly recoverable unless it was floor-clamped (`rawQualityScore === 0`):
 * a clamped 0 could mean "exactly 0" or "-400 before clamping", and only the
 * true bonus tells them apart. When it is floor-clamped the true bonus is
 * unrecoverable, so 0 is assumed instead: the smallest legal bonus, which
 * never scores the reduced violation count more leniently than the evidence
 * supports.
 *
 * @param {number} rawQualityScore - This report's own clamped raw score.
 * @param {object} fullViolations - The {critical, high, medium, low} counts rawQualityScore was computed from.
 * @param {object} targetViolations - The smaller counts to recompute a raw score for.
 * @returns {number} A raw score in 0-100, clamped the same way rawQualityScore was.
 */
function rawScoreForViolations(rawQualityScore, fullViolations, targetViolations) {
  const bonus = rawQualityScore > 0 ? rawQualityScore - 100 + deductionsFor(fullViolations) : 0;
  return Math.max(0, Math.min(100, 100 - deductionsFor(targetViolations) + bonus));
}

function gradeForScore(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function effectiveScoreFor(rawQualityScore, violations) {
  const highestSeverity = Object.keys(SEVERITY_SCORE_CAPS).find((severity) => violations[severity] > 0);
  if (!highestSeverity) {
    return {
      qualityScore: rawQualityScore,
      scoreCap: 100,
      scoreOverrideRule: `No severity cap: no findings; effective score equals raw deduction score ${rawQualityScore}.`,
    };
  }

  const scoreCap = SEVERITY_SCORE_CAPS[highestSeverity];
  const qualityScore = Math.min(rawQualityScore, scoreCap);
  const severity = highestSeverity[0].toUpperCase() + highestSeverity.slice(1);
  return {
    qualityScore,
    scoreCap,
    scoreOverrideRule: `Highest severity ${severity} caps effective score at ${scoreCap}: min(raw deduction score ${rawQualityScore}, ${scoreCap}) = ${qualityScore}.`,
  };
}

/**
 * @param {object} violations - {critical, high, medium, low} the rule is judged against.
 * @param {number} qualityScore - The effective score paired with `violations`.
 * @param {number} [excludedAdvisoryCount] - Findings this call's `violations` deliberately
 *   excludes (advisory, non-gating). Only changes the zero-violations wording: "No findings"
 *   would misstate a run under --gate-on introduced that excluded a real pre-existing finding,
 *   which is exactly the self-contradiction a derived, machine-checked rule exists to prevent.
 */
function verdictRuleFor(violations, qualityScore, excludedAdvisoryCount = 0) {
  if (violations.critical > 0) {
    return `Critical > 0 => Block (${violations.critical} Critical).`;
  }
  if (violations.high > 0) {
    return `Critical = 0 and High > 0 => Request Changes (${violations.high} High).`;
  }
  if (qualityScore < 70) {
    return `Critical = 0, High = 0, and effective score < 70 => Request Changes (${qualityScore}).`;
  }
  if (violations.medium + violations.low > 0) {
    return `No Critical or High, effective score >= 70, and findings remain => Approve with Comments.`;
  }
  return excludedAdvisoryCount > 0
    ? `No Critical or High and no gating findings (${excludedAdvisoryCount} pre-existing, advisory) => Approve.`
    : 'No findings => Approve.';
}

function assessmentForRecommendation(recommendation, qualityScore) {
  if (recommendation === 'Block') return 'Critical Issues';
  if (recommendation === 'Request Changes') return 'Needs Improvement';
  if (recommendation === 'Approve with Comments') return 'Acceptable';
  return qualityScore >= 90 ? 'Excellent' : 'Good';
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
function normalizeReportScore(reportText, parsed) {
  const { recommendation, qualityScore, rawQualityScore, scoreCap, scoreOverrideRule, verdictRule } = parsed;
  const grade = gradeForScore(qualityScore);
  const assessment = assessmentForRecommendation(recommendation, qualityScore);
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
        if (/^[ \t]*\*\*(?:Raw Deduction Score|Score Cap|Score Override Rule|Verdict Rule)\*\*:/.test(line)) {
          return null;
        }
        const heading = /^##[ \t]+([^\r\n]+?)[ \t]*\r?$/.exec(line);
        if (heading) {
          section = heading[1];
        }
        if (!summaryNormalized && /^[ \t]*\*\*Quality Score\*\*:/.test(line)) {
          line = line
            .replace(/^([ \t]*\*\*Quality Score\*\*:[ \t]*)\d+([ \t]*\/[ \t]*100)/, `$1${qualityScore}$2`)
            .replace(/^([ \t]*\*\*Quality Score\*\*:[^\r\n]*\([ \t]*)[A-F](?=[ \t)-])/, `$1${grade}`)
            .replace(/^([ \t]*\*\*Quality Score\*\*:[^\r\n]*\([ \t]*[A-F][ \t]*-[ \t]*)[^)]*(\))/, `$1${assessment}$2`);
          line +=
            `\n**Raw Deduction Score**: ${rawQualityScore}/100\n` +
            `**Score Cap**: ${scoreCap}/100\n` +
            `**Score Override Rule**: ${scoreOverrideRule}\n` +
            `**Verdict Rule**: ${verdictRule}`;
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
          const scored = replaceFirstMatch(line, FINAL_SCORE_PATTERNS, `$1${rawQualityScore}$2`);
          line = scored.matched
            ? scored.line
                .replace(/^([ \t]*)Final Score[ \t]*:[ \t]*/i, '$1Raw Deduction Score:     ')
                .replace(/(\|[ \t]*)Final Score([ \t]*\|)/i, '$1Raw Deduction Score$2')
            : scored.line;
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
    .filter((line) => line !== null)
    .join('\n');
}

/**
 * Extract the strict-schema verdict from report text.
 *
 * @param {string} reportText - Full test-review.md contents.
 * @param {object} [runContract] - Exact reviewed/context evidence supplied by the runner.
 * @returns {object} The verdict object, whose keys are exactly PARSED_VERDICT_KEYS.always
 *   plus whichever of PARSED_VERDICT_KEYS.conditional this run produced.
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
  const findings = verifyFindingSeverityCounts(text, violations, runContract.registryRowSeverities ?? null);

  const rawQualityScore = deriveQualityScore(reportText, violations);
  const { qualityScore, scoreCap, scoreOverrideRule } = effectiveScoreFor(rawQualityScore, violations);

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
  const executionMode = parseExecutionMode(text, Boolean(runContract.conventionBaseline));

  const executiveSection = extractSection(text, 'Executive Summary');
  const keyStrengths = extractBullets(extractSubsection(executiveSection, 'Key Strengths'), '✅');
  const keyWeaknesses = extractScoredWeaknesses(extractSubsection(executiveSection, 'Key Weaknesses'), findings);
  const advisoryObservations = extractAdvisoryObservations(extractSubsection(executiveSection, 'Advisory Observations'));

  // Same treatment the score already gets: derive it, publish the derived value, and
  // keep what the agent said so the substitution is visible rather than silent.
  const derivedRecommendation = deriveRecommendation(violations, qualityScore);
  const verdictRule = verdictRuleFor(violations, qualityScore);

  const parsed = projectAlwaysKeys({
    recommendation: derivedRecommendation,
    rawQualityScore,
    qualityScore,
    scoreCap,
    scoreOverrideRule,
    verdictRule,
    violations,
    findings,
    reviewedFiles,
    contextBasis,
    contextFiles,
    contextWaiversApplied,
    keyStrengths,
    keyWeaknesses,
    advisoryObservations,
  });
  // Surfaced (not just used to gate) so a stored verdict JSON says what this run
  // actually measured, the same reasoning as attaching agent/model: a fabricated
  // baseline is invisible to a human reviewer unless the ground truth travels with
  // the verdict, not just the pass/fail outcome of checking against it.
  if (runContract.conventionBaseline) {
    setConditionalKey(parsed, 'conventionBaseline', runContract.conventionBaseline);
  }
  if (executionMode !== null) {
    setConditionalKey(parsed, 'executionMode', executionMode);
  }
  if (
    reportedQualityScore !== qualityScore ||
    (reportedQualityGrade !== undefined && reportedQualityGrade !== gradeForScore(qualityScore))
  ) {
    setConditionalKey(parsed, 'reportedQualityScore', reportedQualityScore);
  }
  if (derivedRecommendation !== executive) {
    setConditionalKey(parsed, 'reportedRecommendation', executive);
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
  // Exported because test/eval-nfr.js reads a different markdown deliverable and
  // needs the same answer to "is this line the report's own content". A second
  // implementation there would be a fourth parser with its own opinion about what
  // a fence is, which is the class of defect this function exists to close.
  // `fenceDepths` is the same reading one level finer: the nfr report's own gate
  // scalar sits inside a fence and a quoted example's sits inside a fence within
  // a fence, so that reader needs the depth and not only the boolean.
  fenceDepths,
  stripFencedCodeBlocks,
  normalizeReportScore,
  deriveRecommendation,
  effectiveScoreFor,
  verdictRuleFor,
  verdictFor,
  scoreFails,
  PARSED_VERDICT_KEYS,
  CONTEXT_BASIS_ENUM,
  verifyConventionBaseline,
  parseConventionCitations,
  parseExecutionMode,
  EXECUTION_MODE_ENUM,
  verifyFindingSeverityCounts,
  extractFindings,
  FINDING_KEYS,
  rawScoreForViolations,
};
