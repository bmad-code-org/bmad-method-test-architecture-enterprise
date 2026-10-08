'use strict';

/**
 * Cut a report down to the findings a pull request owns.
 *
 * A pull request review tells the agent to write up only what the PR introduced
 * or worsened. When a finding still lands on a line the PR did not change
 * (diff-evidence.js classifies it pre_existing), the report would carry old code
 * under a PR verdict. This removes those finding blocks and every parser-read
 * number that counted them, drops the list items and table rows that name them,
 * and points a finding attributed to a changed line at that line. The caller
 * re-parses the result with the same strict parser, so the published report
 * parses to the verdict the CLI gates on. Sentences of prose that name old code
 * are the prompt's to keep out.
 */

const { fenceDepths } = require('./parse-report');

const SECTION_PLACEHOLDERS = {
  'Critical Issues (Must Fix)': 'No critical issues detected in the lines this pull request changed. ✅',
  'Recommendations (Should Fix)': 'No additional recommendations for the lines this pull request changed.',
};
// `Critical Violations:     -1 × 10 = -10`, in the fenced ledger or as a table row.
const LEDGER_LINE = /^(\s*(?:\|\s*)?)(Critical|High|Medium|Low) Violations(\s*[:|]\s*)-?\d+(\s*[×x*]\s*)(\d+)(\s*=\s*)-?\d+/i;
// `| High deductions (2 x 5) | -10 |`
const DEDUCTION_ROW = /^(\s*\|\s*)(Critical|High|Medium|Low) deductions\s*\(\s*\d+(\s*[×x*]\s*)(\d+)\s*\)(\s*\|\s*)-?\d+/i;
const WEAKNESS_ROW = /^\s*(?:[-*]\s*)?(?:❌\s*)?\[([A-Za-z]\d+)\]/;
const LIST_OR_TABLE_ITEM = /^\s*(?:[-*+]\s|\d+[.)]\s|\|)/;
const MIN_TITLE_LENGTH = 12;
const VERDICT_SECTIONS = new Set(['Executive Summary', 'Decision']);
const RESTATING_SUBSECTION = /^(?:Immediate Actions|Re-Review Needed)/i;

function escapeRegExp(text) {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function highestSeverity(violations) {
  const found = ['critical', 'high', 'medium', 'low'].find((level) => violations[level] > 0);
  return found ? found[0].toUpperCase() + found.slice(1) : 'none';
}

function locationOf(finding) {
  return finding.file && Number.isInteger(finding.line) ? new RegExp(`${escapeRegExp(finding.file)}:${finding.line}(?!\\d)`) : null;
}

function namesFinding(line, finding) {
  const location = locationOf(finding);
  if (location?.test(line)) return true;
  return finding.title?.length >= MIN_TITLE_LENGTH && line.toLowerCase().includes(finding.title.toLowerCase());
}

/** Whether a table row has a cell for the finding's row id and a cell for its line. */
function tableRowNames(line, finding, criteria = false) {
  if (!/^\s*\|/.test(line) || !Number.isInteger(finding.line)) return false;
  const cells = line.split('|').map((cell) => cell.replaceAll(/[`*]/g, '').trim().toLowerCase());
  if (
    cells.includes(String(finding.row).toLowerCase()) &&
    cells.some((cell) => cell === String(finding.line) || cell === `l${finding.line}`)
  ) {
    return true;
  }
  // A criteria-table note that cites the line ("Fixed 2-second timer at line 37") or the row ("Same H1 timer").
  return (
    new RegExp(`\\blines?\\s+${finding.line}\\b`, 'i').test(line) ||
    (criteria && new RegExp(`\\b${escapeRegExp(String(finding.row))}\\b`).test(line))
  );
}

/**
 * @param {string} reportText - The report as the agent wrote it.
 * @param {object} scope
 * @param {Array<{section: string, start: number, end: number}>} scope.spans - findingBlockSpans(reportText).
 * @param {Array<object>} scope.findings - The classified findings in span order.
 * @param {boolean[]} scope.drop - Per finding, whether to cut it.
 * @param {{critical: number, high: number, medium: number, low: number}} scope.violations - Counts after the cut.
 * @param {string} scope.recommendation - The recommendation those counts require.
 * @returns {string}
 */
function scopeReportToPullRequest(reportText, { spans, findings, drop, violations, recommendation, scores }) {
  if (spans.length !== findings.length || drop.length !== findings.length) {
    const error = new Error(
      `The report's finding blocks (${spans.length}) and the parsed findings (${findings.length}) disagree, so a finding cannot be cut safely`,
    );
    error.code = 'REPORT_UNPARSEABLE';
    throw error;
  }
  const lines = reportText.split('\n');
  const depths = fenceDepths(reportText);
  const eol = reportText.includes('\r\n') ? '\r' : '';
  const removed = Array.from({ length: lines.length }, () => false);
  const inserts = new Map();
  const relocated = new Map();

  const kept = findings.filter((_, index) => !drop[index]);
  const dropped = findings.filter((_, index) => drop[index]);
  const remainingBySection = new Map();

  for (const [index, span] of spans.entries()) {
    remainingBySection.set(span.section, (remainingBySection.get(span.section) ?? 0) + (drop[index] ? 0 : 1));
    if (!drop[index]) {
      const evidence = findings[index].changed_line_evidence;
      if (Number.isInteger(evidence?.symptomLine)) {
        relocated.set(span, {
          symptom: evidence.symptomLine,
          symptomFile: evidence.symptomFile ?? findings[index].file,
          line: findings[index].line,
          file: findings[index].file,
        });
      }
      continue;
    }
    // The rule and blank lines that close a block separate it from the next
    // section, so they stay.
    let contentEnd = span.end;
    while (contentEnd - 1 > span.start && (lines[contentEnd - 1].trim() === '' || lines[contentEnd - 1].trim() === '---')) {
      contentEnd -= 1;
    }
    for (let line = span.start; line < contentEnd; line += 1) removed[line] = true;
  }

  for (const [section, remaining] of remainingBySection) {
    if (remaining > 0 || !SECTION_PLACEHOLDERS[section]) continue;
    const heading = lines.findIndex(
      (line, index) => depths[index] === 0 && new RegExp(`^## ${escapeRegExp(section)}[ \\t]*\\r?$`).test(line),
    );
    if (heading !== -1) inserts.set(heading, [eol, `${SECTION_PLACEHOLDERS[section]}${eol}`]);
  }

  // A finding attributed to a changed line is cited there, with the assertion it affects as context.
  for (const [span, { symptom, symptomFile, line, file }] of relocated) {
    for (let index = span.start; index < span.end; index += 1) {
      if (depths[index] !== 0 || !/^\*\*Location:?\*\*/.test(lines[index])) continue;
      const moved = lines[index].replace(new RegExp(`${escapeRegExp(symptomFile)}:${symptom}(?!\\d)`), `${file}:${line}`);
      if (moved !== lines[index]) {
        lines[index] = `${moved.replace(/\r$/, '')}${eol}\n**Affects**: the unchanged assertion at ${symptomFile}:${symptom}${eol}`;
      }
      break;
    }
  }

  let section = null;
  let subsection = null;
  let skipping = false;
  const output = [];
  for (const [index, original] of lines.entries()) {
    let line = original;
    if (depths[index] === 0 && !removed[index]) {
      const heading = /^(#{2,3}) (.+?)\s*$/.exec(line);
      if (heading) {
        // Merge instructions restate the findings the pull request gate now decides on its own.
        skipping = dropped.length > 0 && heading[1] === '###' && RESTATING_SUBSECTION.test(heading[2]);
        if (skipping) continue;
        if (heading[1] === '##') {
          section = heading[2];
          subsection = null;
        } else subsection = heading[2];
      } else if (skipping) {
        continue;
      } else {
        const weakness = subsection === 'Key Weaknesses' ? WEAKNESS_ROW.exec(line) : null;
        const staleItem =
          (LIST_OR_TABLE_ITEM.test(line) || weakness || /^\s*\*\*Rationale/i.test(line) || /Re-Review Needed/i.test(line)) &&
          !kept.some((finding) => namesFinding(line, finding)) &&
          (dropped.some(
            (finding) =>
              namesFinding(line, finding) ||
              tableRowNames(line, finding, section === 'Quality Criteria Assessment' && !kept.some((other) => other.row === finding.row)),
          ) ||
            (dropped.length > 0 && /Re-Review Needed/i.test(line)) ||
            (/^\s*\*\*Rationale/i.test(line) && dropped.length > 0) ||
            (weakness && dropped.some((finding) => finding.row === weakness[1]) && !kept.some((finding) => finding.row === weakness[1])));
        if (staleItem) continue;
        if (/\*\*Total Violations:?\*\*/.test(line)) {
          line = line.replace(
            /(\*\*Total Violations:?\*\*:?[ \t]*)[^\r\n]+/,
            `$1${violations.critical} Critical, ${violations.high} High, ${violations.medium} Medium, ${violations.low} Low`,
          );
        }
        if (VERDICT_SECTIONS.has(section)) {
          line = line.replace(/^([ \t]*\*\*Recommendation\*\*:[ \t]*)[^\r\n]+?([ \t]*\r?)$/, `$1${recommendation}$2`);
        }
      }
    }
    // The ledger sits in a fenced block, so it is matched by section.
    if (!removed[index] && section === 'Quality Score Breakdown' && scores) {
      line = line
        .replace(/^([ \t]*Raw Deduction Score:[ \t]*)\d+(\/100)/, `$1${scores.raw}$2`)
        .replace(/^([ \t]*Score Cap:[ \t]*)\d+(\/100)(?:[ \t]*\([^)]*\))?/, `$1${scores.cap}$2 (${highestSeverity(violations)})`)
        .replace(/^([ \t]*Effective Score:[ \t]*)\d+(\/100)/, `$1${scores.effective}$2`);
    }
    if (!removed[index] && section === 'Quality Score Breakdown') {
      line = line
        .replace(LEDGER_LINE, (_, lead, name, separator, times, weight, equals) => {
          const count = violations[name.toLowerCase()];
          return `${lead}${name} Violations${separator}-${count}${times}${weight}${equals}-${count * Number(weight)}`;
        })
        .replace(DEDUCTION_ROW, (_, lead, name, times, weight, close) => {
          const count = violations[name.toLowerCase()];
          return `${lead}${name} deductions (${count}${times}${weight})${close}-${count * Number(weight)}`;
        });
    }
    if (removed[index]) continue;
    output.push(line);
    if (inserts.has(index)) output.push(...inserts.get(index));
  }
  return dropEmptySubsections(output);
}

/** Remove a "### " heading left with nothing under it but blank lines and rules. */
function dropEmptySubsections(lines) {
  const depths = fenceDepths(lines.join('\n'));
  const result = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (depths[index] === 0 && /^### (?!\d+[.)])/.test(lines[index])) {
      let next = index + 1;
      while (next < lines.length && (lines[next].trim() === '' || lines[next].trim() === '---')) next += 1;
      if (next >= lines.length || (depths[next] === 0 && /^#{1,3} /.test(lines[next]))) {
        index = next - 1;
        continue;
      }
    }
    result.push(lines[index]);
  }
  return result.join('\n');
}

/**
 * Restate the lines that name the verdict (the Recommendation lines and the
 * Overall Assessment) from the values the strict parser derived.
 */
function restateVerdictLines(reportText, { recommendation, assessment }) {
  const depths = fenceDepths(reportText);
  let section = null;
  return reportText
    .split('\n')
    .map((line, index) => {
      if (depths[index] !== 0) return line;
      const heading = /^## (.+?)\s*$/.exec(line);
      if (heading) section = heading[1];
      if (!VERDICT_SECTIONS.has(section)) return line;
      return line
        .replace(/^([ \t]*\*\*Recommendation\*\*:[ \t]*)[^\r\n]+?([ \t]*\r?)$/, `$1${recommendation}$2`)
        .replace(/^([ \t]*\*\*Overall Assessment\*\*:[ \t]*)[^\r\n]+?([ \t]*\r?)$/, `$1${assessment}$2`);
    })
    .join('\n');
}

module.exports = { scopeReportToPullRequest, restateVerdictLines };
