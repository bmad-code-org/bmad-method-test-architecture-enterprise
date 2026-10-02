/**
 * Shared parser for the test-design harness and its runner projection.
 * Keep one interpretation of risk tables, column order and fenced examples.
 */
'use strict';

const MarkdownIt = require('markdown-it');

const RISK_ID_PATTERN = /^R-\d{3}$/;
const RISK_REFERENCE_PATTERN = /R-\d{3}/g;
const markdown = new MarkdownIt();
/** The words that call a section or a table a reference, an example, a sample or an illustration. */
const REFERENCE_WORD_PATTERN = /^(?:references?|examples?|samples?|illustrations?|illustrative)$/i;
/** A paragraph that opens by calling the table after it a reference, an example, a sample or an illustration. */
const REFERENCE_LEAD_PATTERN = /^(?:worked\s+)?(?:references?|examples?|samples?|illustrations?|illustrative)\b/i;

/** The visible text of a heading or table cell, including inline code and link labels. */
function inlineText(token) {
  return (token.children ?? [])
    .filter((child) => ['text', 'code_inline', 'html_inline'].includes(child.type))
    .map((child) => child.content)
    .join('')
    .trim();
}

/**
 * Whether a heading names its own section a reference example: its first or its last
 * word is one of the reference words.
 *
 * The position matters because a story or feature title can mention the word without
 * being one: `### Story 1.47: Distinguish reference risk tables` sits above real
 * coverage rows.
 */
function isReferenceHeading(heading) {
  const words = String(heading ?? '')
    .split(/[^A-Za-z]+/)
    .filter(Boolean);
  return words.length > 0 && (REFERENCE_WORD_PATTERN.test(words[0]) || REFERENCE_WORD_PATTERN.test(words.at(-1)));
}

/**
 * The label that makes a table a reference example, or null when the table is part of the design.
 *
 * THE CONTEXT RULE. The scored register is the set of risk tables a design states as
 * its own, and a reference table is one the document labels as an example of something
 * else. The label is read from two places a reader would look: an enclosing heading
 * below the title that begins or ends with a reference word, or a paragraph directly
 * above the table that opens with one.
 *
 * The shipped worked example, `bmad-testarch-test-design/resources/test-design-epic-3.example.md`,
 * shows the shape this rule reads. Its register is the three band tables under
 * `## Risk Assessment` (`### High Risks: Score 6 or Greater`, `### Medium Risks: Score 3 to 4`,
 * `### Low Risks: Score 1 to 2`), none of which carries a reference word. A table is a
 * reference when `## Appendix: Scoring Reference`, `### Worked Example` or a lead-in such as
 * `**Example:** a register for a checkout epic` sits above it, and it stays one when its own
 * headings copy the register's (`### High Risks: Score 6 or Greater` under an example section),
 * because any enclosing label counts.
 *
 * The title heading is not a label. A design for a feature called "Reference Data Sync"
 * must keep its register, so only headings of level two and below are read.
 *
 * @param {string[]} headings Enclosing headings by level, index 0 being the title level.
 * @param {string} lead The text of the paragraph directly above the table, or an empty string.
 * @returns {string|null}
 */
function referenceLabelOf(headings, lead) {
  const heading = headings.slice(1).find((text) => text && isReferenceHeading(text));
  if (heading) return heading;
  return REFERENCE_LEAD_PATTERN.test(lead) ? lead : null;
}

/**
 * Every GFM table in the document, with the headings it sits under and whether the
 * document labels it a reference example (see {@link referenceLabelOf}).
 *
 * Markdown block tokens exclude fenced and indented code, including code in
 * lists. Blockquote contents are examples; list headings apply only inside their
 * item. Headings are tracked because the template seeds three risk tables and
 * four coverage tables; a run may merge, split or rename any of them. A table
 * qualifies by its column names; its headings determine the priority of its rows.
 *
 * @param {string} text
 * @returns {Array<{headings: string[], header: string[], rows: string[][], reference: string|null}>}
 */
function parseTables(text) {
  const tokens = markdown.parse(text, {});
  const tables = [];
  let headings = [];
  const listHeadings = [];
  let quoteDepth = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === 'blockquote_open') {
      quoteDepth += 1;
      continue;
    }
    if (token.type === 'blockquote_close') {
      quoteDepth -= 1;
      continue;
    }
    if (quoteDepth > 0) continue;
    if (token.type === 'list_item_open') {
      listHeadings.push([...headings]);
      continue;
    }
    if (token.type === 'list_item_close') {
      headings = listHeadings.pop();
      continue;
    }
    if (token.type === 'heading_open') {
      const level = Number.parseInt(token.tag.slice(1), 10);
      headings.length = Math.min(headings.length, level - 1);
      headings[level - 1] = inlineText(tokens[index + 1]);
      continue;
    }
    if (token.type !== 'table_open') continue;
    const lead = tokens[index - 1]?.type === 'paragraph_close' && tokens[index - 2]?.type === 'inline' ? inlineText(tokens[index - 2]) : '';
    const table = { headings: headings.filter(Boolean), header: [], rows: [], reference: referenceLabelOf(headings, lead) };
    let row = null;
    let inHeader = false;
    while (++index < tokens.length && tokens[index].type !== 'table_close') {
      const part = tokens[index];
      if (part.type === 'thead_open') inHeader = true;
      if (part.type === 'tbody_open') inHeader = false;
      if (part.type === 'tr_open') row = [];
      if (part.type === 'inline' && row) row.push(inlineText(part));
      if (part.type === 'tr_close') {
        if (inHeader) table.header = row;
        else table.rows.push(row);
        row = null;
      }
    }
    tables.push(table);
  }
  return tables;
}

/** The index of the first header cell whose text contains one of these names, or -1. */
function columnIndex(header, names) {
  const exact = header.findIndex((cell) => names.some((name) => cell.toLowerCase() === name.toLowerCase()));
  if (exact !== -1) return exact;
  // Exact equality alone lost a whole register to a decorated header: `| Score (P×I) |`
  // matched neither `Score` nor `Risk Score`, readRisks skipped the table, and the run
  // was reported as an environment failure rather than scored.
  //
  // The fallback is restricted to distinctive names and a Score prefix. A bare `ID` matched the
  // substring inside Validation, Evidence and Guidance, and a bare `Level` matched
  // `Tool / Level` on the QA template's NFR table, so a document with a Score column
  // and no exact `Risk ID` header would have had an arbitrary column read as its ids
  // and every value fail a check that gates at 1.
  const distinctive = names.filter((name) => name.trim().includes(' ') || /[A-Z].*[A-Z]/.test(name));
  return header.findIndex(
    (cell) =>
      distinctive.some((name) => cell.toLowerCase().includes(name.toLowerCase())) || (names.includes('Score') && /^score\b/i.test(cell)),
  );
}

/**
 * The score range a section heading declares, or null when it declares none.
 *
 * The epic template bands its three risk tables as `High-Priority Risks (Score ≥6)`,
 * `Medium-Priority Risks (Score 3-4)` and `Low-Priority Risks (Score 1-2)`, and the
 * shipped example spells the same three as `Score 6 or Greater`, `Score 3 to 4` and
 * `Score 1 to 2`. Both forms are read here, because the band a row is filed under is
 * the workflow's own statement about that row's score and a scorer that only read
 * the cells would never notice a score-9 risk sitting under `Score 1-2`.
 *
 * The range is read out of the heading rather than hardcoded, so a run that bands its
 * register differently is held to what it said rather than to what the template says.
 *
 * @param {string} heading
 * @returns {{min: number, max: number}|null}
 */
function scoreBandOf(heading) {
  const text = String(heading ?? '').toLowerCase();
  // A heading that opens with a risk identifier is that risk's own detail section,
  // which the template spells `### R-001: {Risk Description} (Score: 6)`. The exact
  // fallback below would read it as a one-value band and pin every row of any table
  // beneath it to that single score, and band placement gates at 1.
  if (/^\s*\**r-\d{3}\b/.test(text)) return null;
  const after = text.indexOf('score');
  if (after === -1) return null;
  // Only the run of text immediately after the word `score` is read. Scanning the
  // whole heading let any later pair of numbers outrank the declared bound, so
  // "High-Priority Risks (Score >=6) - Sprint 3-4" parsed as the range 3 to 4 and
  // reported three correctly filed risks as misfiled on a threshold of 1.
  const window = text.slice(after + 'score'.length, after + 'score'.length + 28);
  const range = /^[^0-9]{0,6}(\d+)\s*(?:-|–|—|to|through)\s*(\d+)/.exec(window);
  if (range) return { min: Number.parseInt(range[1], 10), max: Number.parseInt(range[2], 10) };
  const atLeast = /^[^0-9]{0,12}(?:>=|≥|at least|of|greater than or equal to)\s*(\d+)/.exec(window);
  if (atLeast) return { min: Number.parseInt(atLeast[1], 10), max: Number.POSITIVE_INFINITY };
  const above = /^[^0-9]{0,6}(\d+)\s*(?:\+|or\s*(?:greater|more|above|higher)|and\s*(?:above|higher|up))/.exec(window);
  if (above) return { min: Number.parseInt(above[1], 10), max: Number.POSITIVE_INFINITY };
  const strictlyAbove = /^[^0-9]{0,6}>\s*(\d+)/.exec(window);
  if (strictlyAbove) return { min: Number.parseInt(strictlyAbove[1], 10) + 1, max: Number.POSITIVE_INFINITY };
  const atMost = /^[^0-9]{0,12}(?:<=|≤|at most|or\s*(?:less|lower|fewer)|and\s*below)\s*(\d+)/.exec(window);
  if (atMost) return { min: 1, max: Number.parseInt(atMost[1], 10) };
  // A bare number after the word is an exact band, which is how "Critical (Score 9)"
  // states one. Without it that heading declared no range and every row under it
  // left the denominator instead of being checked.
  const exact = /^[^0-9]{0,6}(\d+)/.exec(window);
  if (exact) return { min: Number.parseInt(exact[1], 10), max: Number.parseInt(exact[1], 10) };
  return null;
}

/** The innermost score band any of a row's enclosing headings declares. */
function bandFor(headings) {
  for (const heading of headings.toReversed()) {
    const band = scoreBandOf(heading);
    if (band) return { band, heading };
  }
  return null;
}

/** A cell as an integer, or null when it is not one. A range or a word is not a number. */
function integerCell(value) {
  const text = String(value ?? '').trim();
  return /^-?\d+$/.test(text) ? Number.parseInt(text, 10) : null;
}

/**
 * Every risk row the document states, from every table that carries a risk register's
 * columns.
 *
 * A table qualifies when it names a risk id column and a score column. Probability
 * and impact are read when present and recorded as null when they are not, because
 * a register that dropped them is a defect the scale and arithmetic checks should
 * report rather than a table this parser should skip. A table the document labels a
 * reference example is not the register, so its rows join no count, oracle or
 * precision figure.
 */
function readRisks(tables) {
  const risks = [];
  // A table that names risks and states no score is a register this parser cannot
  // score, and skipping it silently loses the rows in it: a run that put its
  // high-priority risks in a scored table and its low-priority ones in an unscored
  // one had the second half vanish with nothing reported. They are counted so the
  // caller can fail on them.
  const unscored = [];
  for (const table of tables) {
    if (table.reference) continue;
    const idColumn = columnIndex(table.header, ['Risk ID', 'RiskID', 'ID']);
    const scoreColumn = columnIndex(table.header, ['Score', 'Risk Score']);
    if (
      idColumn !== -1 &&
      scoreColumn === -1 &&
      table.rows.some((row) => RISK_ID_PATTERN.test(String(row[idColumn] ?? '').toUpperCase()))
    ) {
      unscored.push({ headings: table.headings, rows: table.rows.length });
    }
    if (idColumn === -1 || scoreColumn === -1) continue;
    const categoryColumn = columnIndex(table.header, ['Category', 'Risk Category']);
    const descriptionColumn = columnIndex(table.header, ['Description', 'Risk', 'Summary']);
    const probabilityColumn = columnIndex(table.header, ['Probability']);
    const impactColumn = columnIndex(table.header, ['Impact']);
    for (const row of table.rows) {
      const rawId = row[idColumn] ?? '';
      // A template row still carrying its own placeholder describes nothing, and
      // counting it would make an unfilled template score as a register.
      if (rawId === '' || /^\{.*\}$/.test(rawId)) continue;
      const id = rawId.toUpperCase();
      risks.push({
        id,
        rawId,
        category: (row[categoryColumn] ?? '').toUpperCase(),
        description: row[descriptionColumn] ?? '',
        probability: integerCell(row[probabilityColumn]),
        impact: integerCell(row[impactColumn]),
        score: integerCell(row[scoreColumn]),
        headings: table.headings,
      });
    }
  }
  risks.unscoredTables = unscored;
  return risks;
}

/**
 * Every coverage row the document states, with the priority of the section it sits in.
 *
 * The priority comes from the nearest heading that opens with P0 through P3, which
 * is how both the template and the shipped example spell a priority section
 * (`### P0 (Critical)` and `### P0: Critical` respectively). A coverage table
 * outside any such section carries no priority, which is itself scored: a risk
 * covered only from there has no priority to order. A coverage table the document
 * labels a reference example maps no risk.
 */
function readCoverage(tables) {
  const rows = [];
  for (const table of tables) {
    if (table.reference) continue;
    const levelColumn = columnIndex(table.header, ['Test Level', 'Level']);
    if (levelColumn === -1) continue;
    const linkColumn = columnIndex(table.header, ['Risk Link', 'Risk', 'Risk ID']);
    const priorityHeading = table.headings.toReversed().find((heading) => /^\**P[0-3]\b/.test(heading));
    const priority = priorityHeading ? `P${/^\**P([0-3])\b/.exec(priorityHeading)[1]}` : null;
    for (const row of table.rows) {
      const level = row[levelColumn] ?? '';
      if (level === '' || /^\{.*\}$/.test(level)) continue;
      const linkCell = linkColumn === -1 ? '' : (row[linkColumn] ?? '');
      rows.push({
        level,
        priority,
        riskIds: [...String(linkCell).toUpperCase().matchAll(RISK_REFERENCE_PATTERN)].map((match) => match[0]),
        linkCell,
      });
    }
  }
  return rows;
}

/** The design a run that wrote none is scored against: no risk row and no coverage row. */
const EMPTY_DESIGN = Object.freeze({ risks: [], unscoredTables: [], coverage: [], referenceTables: [], text: '' });

/**
 * One produced document as the two collections the scorer reads.
 *
 * @param {object} artifact The tagged artifact off the observation.
 * @returns {{ok: true, design: object}|{ok: false, failureClass: string, reason: string}}
 */
function readDesign(artifact) {
  if (!artifact || artifact.kind === 'absent') {
    return { ok: false, failureClass: 'environment-missing-artifact', reason: 'no test design document was written' };
  }
  // The adapter tags a stream or file that JSON.parse accepts as `json`. A test
  // design is markdown, so a `json` tag here is a file that is not a design.
  if (artifact.kind !== 'text') {
    return { ok: false, failureClass: 'environment-parser', reason: `the design artifact is tagged ${artifact.kind}, not markdown text` };
  }
  const tables = parseTables(artifact.value);
  const risks = readRisks(tables);
  if (risks.length === 0) {
    return {
      ok: false,
      failureClass: 'environment-parser',
      reason: `the test design document carries no table with a risk id column and a score column${
        tables.some((table) => table.reference) ? ' outside the tables it labels as reference examples' : ''
      }`,
    };
  }
  return {
    ok: true,
    design: {
      risks,
      unscoredTables: risks.unscoredTables ?? [],
      coverage: readCoverage(tables),
      referenceTables: tables.filter((table) => table.reference).map((table) => ({ label: table.reference, rows: table.rows.length })),
      text: artifact.value,
    },
  };
}

/** The runner's machine-readable view of the same parsed risk rows the scorer uses. */
function scoredRiskProjection(design) {
  const scoredRiskDescriptions = design.risks.filter((risk) => risk.score > 3).map((risk) => risk.description);
  return { design: design.text, riskRowCount: design.risks.length, scoredRiskDescriptions, scoredRiskCount: scoredRiskDescriptions.length };
}

module.exports = {
  EMPTY_DESIGN,
  RISK_ID_PATTERN,
  parseTables,
  scoreBandOf,
  bandFor,
  readRisks,
  readCoverage,
  readDesign,
  scoredRiskProjection,
};
