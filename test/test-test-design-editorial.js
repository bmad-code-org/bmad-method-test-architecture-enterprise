/**
 * Deterministic guard for the test-design Editorial Contract.
 *
 * - The instructions: Create mode applies the contract while populating and
 *   polishing, validates the saved outputs after the last edit, and reruns the
 *   checks a validation fix touches. The checklist's Document Quality section
 *   covers epic and system outputs. Validate and Edit modes leave unrequested
 *   wording alone.
 * - The fixtures: each hand-written before and after pair in
 *   `test/fixtures/test-design-editorial/` parses to the same risks, bands,
 *   coverage priorities, levels and risk links, keeps every non-prose table
 *   cell (IDs, owners, counts, mitigations, timelines), keeps every protected
 *   literal, adds the wording its edit claims and drops the filler it names.
 *   The system-level after files agree on risk IDs, categories and scores
 *   across the architecture document, the QA document and the handoff.
 * - The negative controls: broken edits of the epic pair (a renamed priority
 *   heading, an `Example:` label over the register, a dropped score band, a
 *   changed score, a weakened operator, an invented threshold, a planned test
 *   reported as passed, a changed owner, a changed test count, an inverted
 *   negation, a dropped negative case) each produce the problem that names it.
 *
 * The pairs are hand-written, so they validate the contract's checks and say
 * nothing about how well a model follows it.
 *
 * Usage: node test/test-test-design-editorial.js
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { bandFor, parseTables, readCoverage, readRisks } = require('../cli/lib/test-design-parser');

const SKILL_ROOT = path.join(__dirname, '..', 'skills', 'bmad-tea-test-design');
const FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'test-design-editorial');
const read = (...parts) => fs.readFileSync(path.join(...parts), 'utf8');

const step5 = read(SKILL_ROOT, 'steps-c', 'step-05-generate-output.md');
const checklist = read(SKILL_ROOT, 'checklist.md');
const validateStep = read(SKILL_ROOT, 'steps-v', 'step-01-validate.md');
const editStep = read(SKILL_ROOT, 'steps-e', 'step-02-apply-edit.md');

/** The text of one `## ` section, up to the next `## ` heading. */
function section(text, heading) {
  const start = text.indexOf(`\n${heading}\n`);
  assert.notEqual(start, -1, `missing section ${heading}`);
  const next = text.indexOf('\n## ', start + heading.length + 2);
  return text.slice(start, next === -1 ? undefined : next);
}

// Create mode: contract first, then populate, handoff, polish, and validation last.
const order = [
  '## Editorial Contract',
  '## 2. Populate Templates',
  '## 3. Generate BMAD Handoff Document (System-Level Mode Only)',
  '## 4. Polish Output',
  '## 5. Validate Final Outputs',
  '## 6. Completion Report',
];
const positions = order.map((heading) => step5.indexOf(`\n${heading}\n`));
for (const [index, heading] of order.entries()) assert.notEqual(positions[index], -1, `step 5 is missing ${heading}`);
for (let index = 1; index < positions.length; index += 1) {
  assert.ok(positions[index - 1] < positions[index], `step 5 places ${order[index - 1]} after ${order[index]}`);
}
assert.equal(step5.match(/\n## \d\. Validat/g)?.length, 1, 'step 5 validates in more than one place');

const contract = section(step5, '## Editorial Contract');
for (const rule of [
  /every Create-mode output: the epic document, both system-level documents, and the handoff/,
  /needs no separate prompt or extra pass from the user/,
  /keep the values steps 3 and 4 decided/,
  /return to the step that owns that decision/,
  /technical correctness and evidence, then the template and parser contracts, then reviewer comprehension, then style/,
  /actor, action, condition, and expected result/,
  /keep the gap visible as `UNKNOWN`/,
  /Put prerequisites, conditions, and warnings before the action they govern/,
  /A test that has not run never reads as run, verified, or passing/,
  /Thresholds, units, comparison operators, timeouts, retry counts, quantifiers, and negations/,
  /Priority section headings open with `P0`, `P1`, `P2`, or `P3`/,
  /Risk-band headings state their score range/,
  /Never place a scored risk table or coverage table under such a label/,
  /no banned-word or punctuation list/,
]) {
  assert.match(contract, rule, `the Editorial Contract lost the rule ${rule}`);
}
assert.match(section(step5, '## 2. Populate Templates'), /Editorial Contract applied from the start/);
assert.match(section(step5, '## 4. Polish Output'), /including the handoff in system-level mode, and finish all edits before section 5/);
const validation = section(step5, '## 5. Validate Final Outputs');
assert.match(validation, /Validate after the last edit to every output/);
assert.match(validation, /both system-level documents and the handoff in system-level mode/);
assert.match(validation, /reopens validation for the content it touched/);
assert.match(validation, /Completion waits until the last rerun passes with no further edits/);

// The checklist's quality section covers every output, ahead of the system-only sections.
const quality = checklist.indexOf('\n## Document Quality (All Outputs)\n');
assert.notEqual(quality, -1, 'the checklist has no Document Quality (All Outputs) section');
assert.ok(
  quality < checklist.indexOf('\n## System-Level Mode: Two-Document Validation\n'),
  'Document Quality sits inside the system-level section',
);
const qualitySection = section(checklist, '## Document Quality (All Outputs)');
assert.match(qualitySection, /the epic document in epic-level mode, and both documents plus the handoff in system-level mode/);
assert.match(qualitySection, /no planned test is described as run, verified, or passing/);
assert.match(qualitySection, /Validation ran on the saved files after the last edit/);
assert.doesNotMatch(checklist, /"absolutely", "excellent", "fantastic"/, 'the checklist still carries a banned-word list');
assert.match(checklist, /Final validation ran after the last edit to every output/);

// Validate and Edit modes do not run the Create-mode cleanup.
assert.match(validateStep, /Report Document Quality findings without rewriting any validated output/);
assert.match(editStep, /Leave text the user did not ask to change exactly as it is; the Create-mode editorial polish does not run here/);

/** Columns whose wording the contract may edit; every other cell is a decision and stays exact. */
const PROSE_COLUMNS = new Set(['Description', 'Notes', 'QA Test Coverage']);

/** What the scorer reads from one document, every non-prose table cell, and every risk ID the text mentions. */
function structure(text) {
  const tables = parseTables(text);
  const risks = readRisks(tables);
  return {
    risks: risks.map((risk) => ({
      id: risk.id,
      category: risk.category,
      probability: risk.probability,
      impact: risk.impact,
      score: risk.score,
      band: bandFor(risk.headings)?.band ?? null,
    })),
    unscoredTables: risks.unscoredTables.length,
    coverage: readCoverage(tables).map((row) => ({ level: row.level, priority: row.priority, riskIds: row.riskIds })),
    referenceTables: tables.filter((table) => table.reference).length,
    cells: tables.map((table) => ({
      header: table.header,
      rows: table.rows.map((row) => row.filter((_, column) => !PROSE_COLUMNS.has(table.header[column]))),
    })),
    mentionedRiskIds: [...new Set(text.match(/R-\d{3}/g) ?? [])].toSorted(),
  };
}

const words = (text) => text.split(/\s+/).filter(Boolean).length;

/** Every way an edited document breaks its case's contract, as readable problems. */
function problems(spec, before, after) {
  const found = [];
  const was = structure(before);
  const is = structure(after);
  for (const key of Object.keys(was)) {
    if (JSON.stringify(was[key]) !== JSON.stringify(is[key])) found.push(`${spec.id}: parsed ${key} changed`);
  }
  for (const literal of spec.protected) {
    if (!before.includes(literal)) found.push(`${spec.id}: the before file lacks protected ${literal}`);
    if (!after.includes(literal)) found.push(`${spec.id}: the edit lost protected ${literal}`);
  }
  for (const phrase of spec.afterContains) if (!after.includes(phrase)) found.push(`${spec.id}: the edit lacks ${phrase}`);
  for (const phrase of spec.removed) {
    if (!before.includes(phrase)) found.push(`${spec.id}: the before file lacks filler ${phrase}`);
    if (after.includes(phrase)) found.push(`${spec.id}: the edit kept filler ${phrase}`);
  }
  if (words(after) >= words(before)) found.push(`${spec.id}: the edit is not shorter than the draft`);
  return found;
}

const manifest = JSON.parse(read(FIXTURE_ROOT, 'cases.json'));
const cases = new Map(
  manifest.cases.map((spec) => [spec.id, { spec, before: read(FIXTURE_ROOT, spec.before), after: read(FIXTURE_ROOT, spec.after) }]),
);
for (const { spec, before, after } of cases.values()) {
  assert.deepEqual(problems(spec, before, after), [], `${spec.id} breaks the Editorial Contract`);
  assert.ok(structure(after).risks.length > 0 || spec.id === 'handoff', `${spec.id} parses to no scored risk`);
}

// The system-level outputs agree with each other after the edit.
const system = Object.fromEntries(Object.entries(manifest.system).map(([role, id]) => [role, cases.get(id).after]));
const architectureRisks = structure(system.architecture).risks;
const scores = new Map(architectureRisks.map((risk) => [risk.id, risk.score]));
const categories = new Map(architectureRisks.map((risk) => [risk.id, risk.category]));
const qa = structure(system.qa);
assert.deepEqual(
  qa.risks.map((risk) => [risk.id, risk.score]),
  architectureRisks.map((risk) => [risk.id, risk.score]),
  'the QA document and the architecture document disagree on risk IDs or scores',
);
for (const row of qa.coverage) for (const id of row.riskIds) assert.ok(scores.has(id), `QA coverage links unknown risk ${id}`);
const mapping = parseTables(system.handoff).find((table) => table.headings.at(-1) === 'Risk-to-Story Mapping');
assert.ok(mapping, 'the handoff has no Risk-to-Story Mapping table');
const column = (name) => {
  const index = mapping.header.indexOf(name);
  assert.notEqual(index, -1, `the handoff mapping has no ${name} column`);
  return index;
};
const [idColumn, categoryColumn, productColumn] = ['Risk ID', 'Category', 'P×I'].map(column);
for (const row of mapping.rows) {
  const id = row[idColumn];
  assert.equal(Number(row[productColumn]), scores.get(id), `the handoff scores ${id} differently`);
  assert.equal(row[categoryColumn], categories.get(id), `the handoff categorizes ${id} differently`);
}
for (const id of structure(system.handoff).mentionedRiskIds) assert.ok(scores.has(id), `the handoff names unknown risk ${id}`);

const epic = cases.get('epic');
// Broken edits of the epic pair are caught, each by the check that owns it.
const breaks = {
  'renamed priority heading': [(text) => text.replace('### P1 (High)', '### High Priority'), 'parsed coverage changed'],
  'Example label over the register': [
    (text) => text.replace('### High-Priority Risks (Score ≥6)\n', '### High-Priority Risks (Score ≥6)\n\nExample: the register below.\n'),
    'parsed referenceTables changed',
  ],
  'dropped score band': [(text) => text.replace('### High-Priority Risks (Score ≥6)', '### High-Priority Risks'), 'parsed risks changed'],
  'changed score': [(text) => text.replace(/(\| R-001 .*?\| 3 +\| 3 +\| )9( )/, '$16$2'), 'parsed risks changed'],
  'weakened operator': [(text) => text.replace('P1 pass rate ≥ 95%', 'P1 pass rate > 95%'), 'lost protected P1 pass rate ≥ 95%'],
  'invented threshold': [(text) => text.replaceAll('UNKNOWN', '800 ms'), 'lost protected UNKNOWN'],
  'planned test reported as passed': [
    (text) => text.replace('Planned. The threshold is UNKNOWN', 'Passed. The threshold is UNKNOWN'),
    'lacks Planned. The threshold is UNKNOWN',
  ],
  'changed owner': [(text) => text.replace(/(\| R-001 .*?\| )Payments( \|)/, '$1Platform$2'), 'parsed cells changed'],
  'changed test count': [(text) => text.replace(/(\| P0-001 .*?\| +)3( \|)/, '$11$2'), 'parsed cells changed'],
  'inverted negation': [(text) => text.replace('does not check ownership', 'checks ownership'), 'lacks does not check ownership'],
  'dropped negative case': [(text) => text.replace(' Expect `403`, and expect no refund row.', ''), 'lost protected `403`'],
};
for (const [name, [mutate, expected]] of Object.entries(breaks)) {
  const broken = mutate(epic.after);
  assert.notEqual(broken, epic.after, `the ${name} mutation did not apply`);
  const found = problems(epic.spec, epic.before, broken);
  assert.ok(
    found.some((problem) => problem.endsWith(expected)),
    `the ${name} edit was not caught as "${expected}": ${found.join('; ') || 'no problem'}`,
  );
}

console.log(`test-design Editorial Contract holds across ${cases.size} fixture pairs and ${Object.keys(breaks).length} broken edits`);
