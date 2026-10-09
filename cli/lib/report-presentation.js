'use strict';

/**
 * What a reader of the published report sees, stated by the CLI.
 *
 * parse-report.js validates the report the agent wrote. This module then makes the
 * published copy say only what the run established, whatever the agent wrote:
 *
 * - interactive resume state leaves the frontmatter (a CI report is not resumable);
 * - the reviewer is the agent and model the CLI recorded;
 * - Test Duration is "not measured", because a static read cannot time a run, and Test
 *   Length is the line count the CLI took;
 * - criteria rows that do not apply to the repository are left out;
 * - sentences about how the rubric decided (a row that fired, a registry gap, a closed
 *   gate) are removed from the summary and the criteria notes, and a test or assertion
 *   count the agent stated is labelled an estimate;
 * - the pull request decision sits at the top of the artifact.
 *
 * Every edit is outside fenced code and outside the finding blocks. The edits that
 * remove text (rows and sentences) are the ones that could touch a line the parser
 * reads, so the caller parses the result again and publishes it only when it agrees
 * with the verdict that was gated.
 */

const { fenceDepths } = require('./parse-report');

const RESUME_KEYS = ['stepsCompleted', 'lastStep', 'lastSaved', 'workflowStatus', 'inputDocuments'];
const CRITERIA_SECTION = 'Quality Criteria Assessment';
// Prose is only the summary and the criteria notes; findings and every machine-read line are left alone.
const PROSE_SECTIONS = new Set(['Executive Summary', CRITERIA_SECTION]);
// Sentences that narrate rubric internals, each anchored to a row id or to the rubric's own words.
const RUBRIC_MECHANICS = [
  /\bregistry (?:has no row|gap)\b/i,
  /\b[CHML]\d+\b[^.]*\b(?:does|did|do) not fire\b/,
  /\brows? [CHML]\d+(?:(?:,| and) [CHML]\d+)* (?:does|do) not exist for this run\b/i,
  /\b[CHML]\d+ gate (?:is |was )?(?:closed|open)\b/,
  /\bthe gate (?:is |was )?closed\b/i,
];
// A count the agent states about tests or assertions, which nothing in a static review measured.
const UNMEASURED_COUNT = /\b(\d[\d,]*)\s+(test functions?|test cases?|tests|assertions?)\b(?!\s*\(estimate\))/gi;
const FIELD_LINE = /^\s*(?:[-*+]\s+)?\*\*[^*]+?(?::\*\*|\*\*\s*:)/;
const SEPARATOR_ROW = /^\s*\|[\s:|-]+\|\s*\r?$/;

function splitCells(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split(/(?<!\\)\|/).map((cell) => cell.trim());
}

function joinCells(original, cells) {
  const lead = /^\s*/.exec(original)[0];
  const trail = /\r?$/.exec(original)[0];
  return `${lead}| ${cells.join(' | ')} |${trail}`;
}

/** The index of the line after the frontmatter block, or 0 when there is none. */
function bodyStart(lines) {
  if (!/^---[ \t]*\r?$/.test(lines[0] ?? '')) return 0;
  const close = lines.findIndex((line, index) => index > 0 && /^---[ \t]*\r?$/.test(line));
  return close === -1 ? 0 : close + 1;
}

/** Remove interactive resume state from the frontmatter. */
function stripResumeState(report) {
  const lines = report.split('\n');
  if (!/^---[ \t]*\r?$/.test(lines[0] ?? '')) return report;
  const close = lines.findIndex((line, index) => index > 0 && /^---[ \t]*\r?$/.test(line));
  if (close === -1) return report;
  const kept = [];
  let skipping = false;
  for (const [index, line] of lines.entries()) {
    if (index === 0 || index >= close) {
      kept.push(line);
      continue;
    }
    // A key starts at column 0. A compact sequence item (`- value` at column 0) and any indented line belong to the key above.
    if (/^\S/.test(line) && !/^-(?:\s|$)/.test(line)) skipping = RESUME_KEYS.some((key) => new RegExp(`^${key}[ \\t]*:`).test(line));
    if (!skipping) kept.push(line);
  }
  return kept.join('\n');
}

/** State the reviewer the CLI recorded. */
function stampReviewer(report, { agent, model }) {
  const reviewer = [agent, model].filter((part) => typeof part === 'string' && part.length > 0).join(' / ') || 'unknown';
  const line = `**Reviewer**: ${reviewer}`;
  const existing = /^[ \t]*\*\*Reviewer\*\*:[^\r\n]*(\r?)$/;
  const lines = report.split('\n');
  const depths = fenceDepths(report);
  const isReviewer = (entry, index) => depths[index] === 0 && existing.test(entry);
  const first = lines.findIndex(isReviewer);
  if (first !== -1) {
    return lines
      .flatMap((entry, index) => {
        if (index === first) return [entry.replace(existing, `${line}$1`)];
        return isReviewer(entry, index) ? [] : [entry];
      })
      .join('\n');
  }
  const anchor = lines.findIndex((entry, index) => depths[index] === 0 && /^\*\*Review Mode\*\*:/.test(entry));
  if (anchor === -1) return report;
  const eol = lines[anchor].endsWith('\r') ? '\r' : '';
  lines.splice(anchor + 1, 0, `${line}${eol}`);
  return lines.join('\n');
}

/** The criteria table: its header cells and its data rows as [lineIndex, cells] pairs, outside fences. */
function criteriaTable(lines, depths) {
  const heading = lines.findIndex((line, index) => depths[index] === 0 && new RegExp(`^## ${CRITERIA_SECTION}[ \\t]*\\r?$`).test(line));
  if (heading === -1) return null;
  const rows = [];
  for (let index = heading + 1; index < lines.length; index += 1) {
    if (depths[index] === 0 && lines[index].startsWith('## ')) break;
    if (depths[index] === 0 && /^\s*\|/.test(lines[index]) && !SEPARATOR_ROW.test(lines[index])) {
      rows.push([index, splitCells(lines[index])]);
    }
  }
  if (rows.length === 0) return null;
  return { header: rows[0][1].map((cell) => cell.toLowerCase()), rows: rows.slice(1) };
}

/** A criteria row with the named columns set and the rest as the agent wrote them. */
function restated(header, cells, values) {
  return header.map((name, position) => {
    if (position === 0) return cells[0];
    if (name in values) return values[name];
    return cells[position] ?? '-';
  });
}

/**
 * Restate the claims a static review cannot make. Test Duration is always "not
 * measured". Test Length is the line count the CLI took. A row whose Status says it
 * does not apply is left out of the table.
 *
 * @param {string} report
 * @param {Record<string, number>} [fileStats] - Exact line count per review file.
 * @param {Array<{row: string}>} [findings] - The findings the verdict counts; Test Length fails when it counts an H5.
 */
function presentCriteriaRows(report, fileStats = {}, findings = []) {
  const lines = report.split('\n');
  const depths = fenceDepths(report);
  const table = criteriaTable(lines, depths);
  if (!table) return report;
  const statusColumn = table.header.includes('status') ? table.header.indexOf('status') : 1;
  const counts = Object.values(fileStats);
  const dropped = new Set();
  for (const [index, cells] of table.rows) {
    const label = cells[0] ?? '';
    if (/\bn\/a\b|\bnot applicable\b/i.test(cells[statusColumn] ?? '')) {
      dropped.add(index);
    } else if (/^Test Duration\b/i.test(label)) {
      const values = { status: '➖ Not measured', violations: '-', basis: 'Not measured', notes: 'A static read cannot time a run' };
      lines[index] = joinCells(lines[index], restated(table.header, cells, values));
    } else if (/^Test Length\b/i.test(label) && counts.length > 0) {
      const largest = Math.max(...counts);
      const counted = findings.filter((finding) => finding.row === 'H5').length;
      const size = counts.length === 1 ? `${largest} lines` : `Largest of ${counts.length} files: ${largest} lines`;
      const values = {
        status: counted > 0 ? '❌ FAIL' : '✅ PASS',
        violations: String(counted),
        basis: 'Absolute',
        notes: largest > 1000 && counted === 0 ? `${size}; over the limit, and not scored in this review` : size,
      };
      lines[index] = joinCells(lines[index], restated(table.header, cells, values));
    }
  }
  return lines.filter((_, index) => !dropped.has(index)).join('\n');
}

function tidyProse(text) {
  const kept = text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !RUBRIC_MECHANICS.some((pattern) => pattern.test(sentence)))
    .join(' ');
  return kept.replaceAll(UNMEASURED_COUNT, '$1 $2 (estimate)');
}

/**
 * Remove sentences that narrate how the rubric decided from the summary and the
 * criteria notes, and label a test or assertion count the agent stated as an
 * estimate. Labelled field lines (`**Severity**: ...`), findings, manifests, HTML
 * comments and fenced code are never touched.
 */
function tidyProseSections(report) {
  const lines = report.split('\n');
  const depths = fenceDepths(report);
  const out = [];
  let section = null;
  let inComment = false;
  for (const [index, line] of lines.entries()) {
    if (depths[index] === 0 && line.startsWith('## ')) section = line.slice(3).replace(/\r$/, '').trim();
    const insideComment = inComment || line.includes('<!--');
    if (line.includes('<!--') && !line.includes('-->')) inComment = true;
    if (line.includes('-->')) inComment = false;
    const touchable =
      depths[index] === 0 && PROSE_SECTIONS.has(section) && !insideComment && !line.startsWith('#') && !FIELD_LINE.test(line);
    if (!touchable) {
      out.push(line);
      continue;
    }
    if (/^\s*\|/.test(line)) {
      if (SEPARATOR_ROW.test(line)) {
        out.push(line);
        continue;
      }
      const cells = splitCells(line);
      out.push(
        joinCells(
          line,
          cells.map((cell, position) => (position === 0 ? cell : tidyProse(cell) || '-')),
        ),
      );
      continue;
    }
    const prefix = /^\s*(?:[-*+]\s+|\d+[.)]\s+)?/.exec(line)[0];
    const eol = line.endsWith('\r') ? '\r' : '';
    const body = line.slice(prefix.length).replace(/\r$/, '');
    const rest = tidyProse(body);
    if (rest.trim() !== '' || body.trim() === '') out.push(`${prefix}${rest}${eol}`);
  }
  return out.join('\n');
}

/**
 * The pull request decision, at the top of the artifact, so a reader (or an agent
 * reading the file) meets it before any finding.
 */
function renderPullRequestGate(report, { recommendation, qualityScore, excluded, headSha }) {
  const cr = report.includes('\r\n') ? '\r' : '';
  const reviewed = headSha ? ` Reviewed commit \`${headSha.slice(0, 8)}\`.` : '';
  const left =
    excluded > 0
      ? ` ${excluded} finding${excluded === 1 ? '' : 's'} on lines this pull request did not change ${excluded === 1 ? 'was' : 'were'} left out of this report.`
      : '';
  const block = `> **Pull request gate**: ${recommendation}, ${qualityScore}/100.${reviewed}${left}`;
  const lines = report.split('\n');
  const depths = fenceDepths(report);
  const start = bodyStart(lines);
  const title = lines.findIndex((line, index) => index >= start && depths[index] === 0 && line.startsWith('# '));
  if (title !== -1) {
    lines.splice(title + 1, 0, cr, `${block}${cr}`);
    return lines.join('\n');
  }
  const summary = lines.findIndex((line, index) => index >= start && depths[index] === 0 && /^## Executive Summary[ \t]*\r?$/.test(line));
  lines.splice(summary === -1 ? start : summary, 0, `${block}${cr}`, cr);
  return lines.join('\n');
}

/**
 * The first presentation of a report that still reads as the verdict that was gated.
 *
 * @param {Array<{label: string, build: () => string}>} candidates - From most to least edited.
 * @param {(text: string) => boolean} agrees - Whether a text still parses to the gated verdict.
 * @returns {{text: string, label: string|null, skipped: string[]}} `label` is null when none agreed and the last text is returned.
 */
function firstThatAgrees(candidates, agrees) {
  const skipped = [];
  for (const { label, build } of candidates) {
    const text = build();
    if (agrees(text)) return { text, label, skipped };
    skipped.push(label);
  }
  return { text: candidates.at(-1).build(), label: null, skipped };
}

module.exports = {
  firstThatAgrees,
  stripResumeState,
  stampReviewer,
  presentCriteriaRows,
  tidyProseSections,
  renderPullRequestGate,
};
