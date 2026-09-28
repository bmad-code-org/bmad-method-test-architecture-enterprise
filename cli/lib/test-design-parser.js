/**
 * Shared parser for the test-design harness and its runner projection.
 * Keep one interpretation of risk tables, column order and fenced examples.
 */
'use strict';

const RISK_ID_PATTERN = /^R-\d{3}$/;
const RISK_REFERENCE_PATTERN = /R-\d{3}/g;

/** One markdown table cell, with the emphasis and code fencing a template seeds stripped off. */
function cellText(value) {
  return String(value ?? '')
    .replaceAll('`', '')
    .replaceAll('**', '')
    .replace(/^\s*\|/, '')
    .trim();
}

/** Split a Markdown table row at unescaped pipes, with or without outer pipes. */
function tableCells(line) {
  const trimmed = line.trim();
  const cells = [];
  let cell = '';
  let escaped = false;
  let lastWasSeparator = false;
  for (const character of trimmed) {
    if (character === '|' && !escaped) {
      cells.push(cell);
      cell = '';
      lastWasSeparator = true;
    } else {
      cell += character;
      lastWasSeparator = false;
    }
    escaped = character === '\\' && !escaped;
  }
  cells.push(cell);
  if (trimmed.startsWith('|')) cells.shift();
  if (lastWasSeparator) cells.pop();
  return cells.map((value) => cellText(value.replaceAll(String.raw`\|`, '|')));
}

/** Is this the `| --- | --- |` or `--- | ---` separator row? */
function isSeparatorRow(line) {
  const cells = tableCells(line);
  return cells.length >= 2 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

/** Markdown indentation uses tab stops every four columns. */
function columnsThrough(value) {
  let columns = 0;
  for (const character of value) columns += character === '\t' ? 4 - (columns % 4) : 1;
  return columns;
}

/** Exclude indented code while retaining tables inside list-item content. */
function contentLines(lines) {
  const listIndents = [];
  let blankLines = 0;
  return lines.map((line) => {
    if (line.trim() === '') {
      blankLines += 1;
      // Two blank lines end containing lists, so later code uses document indentation.
      if (blankLines > 1) listIndents.length = 0;
      return '';
    }
    blankLines = 0;
    const leading = /^[ \t]*/.exec(line)[0];
    const indentation = columnsThrough(leading);
    while (listIndents.length > 0 && indentation < listIndents.at(-1)) listIndents.pop();
    const containerIndent = listIndents.at(-1) ?? 0;
    const listMarker = /^([ \t]*)(?:[-+*]|\d{1,9}[.)])([ \t]+)/.exec(line);
    if (listMarker && indentation - containerIndent <= 3) {
      listIndents.push(columnsThrough(listMarker[0]));
      return '';
    }
    const relativeIndent = indentation - containerIndent;
    // Code starts four columns beyond the current list item's content edge.
    if (relativeIndent >= 4) return '';
    return `${' '.repeat(relativeIndent)}${line.slice(leading.length)}`;
  });
}

/**
 * Every markdown table in the document, with the headings it sits under.
 *
 * Headings are tracked rather than the table located by index, because the
 * template seeds three risk tables and four coverage tables and a run may merge,
 * split or rename any of them. What a table is, is decided by its own column
 * names; where it sits decides which priority its rows carry.
 *
 * @param {string} text
 * @returns {Array<{headings: string[], header: string[], rows: string[][]}>}
 */
function parseTables(text) {
  const lines = contentLines(text.split(/\r?\n/));
  const tables = [];
  const headings = [];
  let fence = null;
  for (let index = 0; index < lines.length; index += 1) {
    // A fenced block is illustration, never the register. The workflow's own
    // knowledge fragments and its worked example are full of them, and
    // resources/test-design-epic-3.example.md is a register the agent is invited
    // to imitate, so a run that quoted one into its own document scored the
    // example's rows as its own and hard-failed three checks for quoting.
    const marker = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(lines[index]);
    // CommonMark forbids backticks in a backtick fence's info string.
    if (marker && !fence && (marker[1][0] === '~' || !marker[2].includes('`'))) {
      fence = { character: marker[1][0], width: marker[1].length };
      continue;
    }
    if (fence) {
      if (marker && marker[1][0] === fence.character && marker[1].length >= fence.width && marker[2].trim() === '') fence = null;
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(lines[index]);
    if (heading) {
      const level = heading[1].length;
      headings.length = Math.min(headings.length, level - 1);
      headings[level - 1] = cellText(heading[2]);
      continue;
    }
    if (tableCells(lines[index]).length < 2) continue;
    if (index + 1 >= lines.length || !isSeparatorRow(lines[index + 1])) continue;
    const header = tableCells(lines[index]);
    const rows = [];
    let cursor = index + 2;
    while (cursor < lines.length && tableCells(lines[cursor]).length > 1 && !/^\s{0,3}(?:`{3,}|~{3,})/.test(lines[cursor])) {
      rows.push(tableCells(lines[cursor]));
      cursor += 1;
    }
    tables.push({ headings: headings.filter(Boolean), header, rows });
    index = cursor - 1;
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
 * report rather than a table this parser should skip.
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
 * covered only from there has no priority to order.
 */
function readCoverage(tables) {
  const rows = [];
  for (const table of tables) {
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
const EMPTY_DESIGN = Object.freeze({ risks: [], unscoredTables: [], coverage: [], text: '' });

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
      reason: 'the test design document carries no table with a risk id column and a score column',
    };
  }
  return { ok: true, design: { risks, unscoredTables: risks.unscoredTables ?? [], coverage: readCoverage(tables), text: artifact.value } };
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
