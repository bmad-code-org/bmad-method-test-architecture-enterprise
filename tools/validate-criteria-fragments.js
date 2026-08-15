/**
 * Criteria-registry to knowledge-fragment traceability lint.
 *
 * TEA has two halves that have to agree and nothing that made them.
 * `criteria-registry.md` is what the reviewer scores against. The knowledge
 * fragments are what the generator reads before it writes a test. A rule the
 * registry scores but no fragment teaches is a rule TEA punishes without ever
 * having explained, and a fragment whose claim drifts from the registry's pinned
 * severity teaches one number while the gate acts on another.
 *
 * `test-knowledge-base.js` already covers a different axis: index-to-disk sync,
 * copy parity across the nine workflows, and link resolution. It has nothing to
 * say about whether a registry ROW is taught anywhere, which is this file's axis.
 *
 * WHAT IT FAILS ON
 *
 *   - a registry row that is neither mapped to a fragment nor declared a gap
 *   - a mapped fragment that no longer contains its anchor token
 *   - a manifest row pointing at a fragment that does not exist
 *   - a manifest row whose severity no longer matches the registry's
 *   - a manifest or gap entry naming a row the registry does not have
 *   - a fragment that exists on disk but is not indexed in tea-index.csv, since an
 *     unindexed fragment is never selected and therefore teaches nobody
 *
 * WHAT IT REPORTS BUT DOES NOT FAIL ON
 *
 * GAPS. Fourteen registry rows currently have no fragment teaching them. Failing
 * the build on a known, itemized gap would only get the tool deleted. Failing on
 * an UNDECLARED one is the part that matters: a new registry row cannot land
 * without someone either pointing at the fragment that teaches it or writing down
 * that nothing does. The gap list is printed on every run so it stays visible
 * rather than becoming a silent allowlist.
 *
 * Usage: node tools/validate-criteria-fragments.js
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');

const PROJECT_ROOT = path.join(__dirname, '..');
const REGISTRY_PATH = path.join(
  PROJECT_ROOT,
  'src',
  'workflows',
  'testarch',
  'bmad-testarch-test-review',
  'steps-c',
  'criteria-registry.md',
);
const KNOWLEDGE_ROOT = path.join(PROJECT_ROOT, 'src', 'agents', 'bmad-tea', 'resources');
const KNOWLEDGE_DIR = path.join(KNOWLEDGE_ROOT, 'knowledge');
const INDEX_PATH = path.join(KNOWLEDGE_ROOT, 'tea-index.csv');

/**
 * Row id to the fragment(s) that teach it, and the exact substring in each that
 * carries the teaching.
 *
 * The anchor is a phrase from the fragment's own prose or an identifier from its
 * examples, chosen so that deleting or rewriting the passage breaks this lint. An
 * anchor that would survive the teaching being removed is a bad anchor: `expect`
 * appears in every fragment and would assert nothing.
 *
 * `severity` is copied from the registry so the two are compared rather than
 * assumed equal.
 */
const MANIFEST = {
  C1: {
    severity: 'CRITICAL',
    teaches: [
      { fragment: 'test-quality.md', anchor: 'A skip with a documented, still-true reason is acceptable' },
      // The row's predicate names Python and Java forms, so the fragment has to
      // show them. Anchoring on all three is what keeps that true under a rewrite.
      { fragment: 'test-quality.md', anchor: '@pytest.mark.skip(reason=' },
      { fragment: 'test-quality.md', anchor: '@Disabled("' },
    ],
  },
  C2: {
    severity: 'CRITICAL',
    teaches: [{ fragment: 'test-quality.md', anchor: 'they disable siblings silently' }],
  },
  C3: {
    severity: 'CRITICAL',
    teaches: [
      { fragment: 'test-quality.md', anchor: 'compares a value to itself' },
      { fragment: 'test-quality.md', anchor: 'assert total == total' },
    ],
  },
  C5: {
    severity: 'CRITICAL',
    teaches: [{ fragment: 'test-quality.md', anchor: 'proves the mocking library works' }],
  },
  C6: {
    severity: 'CRITICAL',
    teaches: [
      { fragment: 'test-quality.md', anchor: 'The return happens first' },
      { fragment: 'test-quality.md', anchor: 'happy path never enters the catch' },
    ],
  },
  H2: {
    severity: 'HIGH',
    teaches: [
      { fragment: 'timing-debugging.md', anchor: 'Fixtures Derived From the Live Clock' },
      { fragment: 'timing-debugging.md', anchor: 'freeze_time' },
    ],
  },
  M3: {
    severity: 'MEDIUM',
    teaches: [{ fragment: 'test-quality.md', anchor: 'Count subjects, not `expect` calls' }],
  },
  M4: {
    severity: 'MEDIUM',
    teaches: [{ fragment: 'test-quality.md', anchor: 'once a file has three or more tests' }],
  },
  M5: {
    severity: 'MEDIUM',
    teaches: [{ fragment: 'component-tdd.md', anchor: 'User-Level Interaction, Not Raw Event Dispatch' }],
  },
  M6: {
    severity: 'MEDIUM',
    teaches: [
      { fragment: 'timing-debugging.md', anchor: 'Promises Nobody Awaited' },
      { fragment: 'timing-debugging.md', anchor: 'no-floating-promises' },
    ],
  },
  M7: {
    severity: 'MEDIUM',
    teaches: [{ fragment: 'test-quality.md', anchor: 'nesting at three levels or fewer' }],
  },
  L5: {
    severity: 'LOW',
    teaches: [{ fragment: 'test-quality.md', anchor: 'Name the behavior, not the method, the selector' }],
  },
  L6: {
    severity: 'LOW',
    teaches: [
      { fragment: 'data-factories.md', anchor: 'Naming the Literals You Do Hardcode' },
      { fragment: 'data-factories.md', anchor: 'STRIPE_PERCENT_FEE' },
    ],
  },
  L7: {
    severity: 'LOW',
    teaches: [{ fragment: 'test-quality.md', anchor: 'One assertion dialect per file' }],
  },
  C4: {
    severity: 'CRITICAL',
    teaches: [
      { fragment: 'test-quality.md', anchor: 'Explicit Assertions' },
      { fragment: 'maestro-flows.md', anchor: 'assertion-bearing' },
    ],
  },
  C7: {
    severity: 'CRITICAL',
    teaches: [{ fragment: 'maestro-flows.md', anchor: 'optional: true' }],
  },
  H1: {
    severity: 'HIGH',
    teaches: [
      { fragment: 'test-quality.md', anchor: 'No Hard Waits' },
      { fragment: 'timing-debugging.md', anchor: 'Timing Anti-Patterns' },
      { fragment: 'maestro-flows.md', anchor: 'extendedWaitUntil' },
    ],
  },
  H3: {
    severity: 'HIGH',
    teaches: [{ fragment: 'test-quality.md', anchor: 'No Conditionals' }],
  },
  H4: {
    severity: 'HIGH',
    teaches: [
      { fragment: 'test-quality.md', anchor: 'Self-Cleaning' },
      { fragment: 'maestro-flows.md', anchor: 'clearState' },
    ],
  },
  H5: {
    severity: 'HIGH',
    teaches: [{ fragment: 'test-quality.md', anchor: '1000 Lines' }],
  },
  H6: {
    severity: 'HIGH',
    teaches: [{ fragment: 'pact-consumer-framework-setup.md', anchor: 'fileParallelism' }],
  },
  H7: {
    severity: 'HIGH',
    teaches: [{ fragment: 'pact-consumer-framework-setup.md', anchor: 'singleFork' }],
  },
  H8: {
    severity: 'HIGH',
    teaches: [{ fragment: 'pact-consumer-framework-setup.md', anchor: 'maxConcurrency' }],
  },
  H9: {
    severity: 'HIGH',
    teaches: [{ fragment: 'maestro-flows.md', anchor: 'ENV_VAR' }],
  },
  M1: {
    severity: 'MEDIUM',
    teaches: [{ fragment: 'network-first.md', anchor: 'Intercept Before Navigate' }],
  },
  M2: {
    severity: 'MEDIUM',
    teaches: [{ fragment: 'data-factories.md', anchor: 'faker' }],
  },
  M8: {
    severity: 'MEDIUM',
    teaches: [{ fragment: 'maestro-flows.md', anchor: 'No positional selection' }],
  },
  M9: {
    severity: 'MEDIUM',
    teaches: [{ fragment: 'playwright-utils-mandate.md', anchor: 'playwright-utils deviation' }],
  },
  M10: {
    severity: 'MEDIUM',
    teaches: [{ fragment: 'pactjs-utils-mandate.md', anchor: 'documented deviation' }],
  },
  L1: {
    severity: 'LOW',
    teaches: [{ fragment: 'selector-resilience.md', anchor: 'Selector Hierarchy' }],
  },
  L2: {
    severity: 'LOW',
    teaches: [{ fragment: 'test-priorities-matrix.md', anchor: 'P0 - Critical' }],
  },
  L3: {
    severity: 'LOW',
    teaches: [{ fragment: 'selector-resilience.md', anchor: 'data-testid' }],
  },
  L4: {
    severity: 'LOW',
    teaches: [{ fragment: 'pact-consumer-framework-setup.md', anchor: "pool: 'forks'" }],
  },
  L8: {
    severity: 'LOW',
    teaches: [{ fragment: 'maestro-flows.md', anchor: 'scoping container' }],
  },
  L9: {
    severity: 'LOW',
    teaches: [{ fragment: 'playwright-utils-mandate.md', anchor: 'merged-fixtures' }],
  },
};

/**
 * Registry rows with no fragment teaching them.
 *
 * Empty, and the empty state is the point: coverage is 35/35. It was 21/35 when
 * this tool was written, and the fourteen rows it named — a rule the reviewer
 * deducts for that the generator was never taught, so the model has to supply it
 * from prior, which is exactly what TEA exists to override — were closed in the
 * same change by extending `test-quality.md`, `timing-debugging.md`,
 * `component-tdd.md`, and `data-factories.md`.
 *
 * The mechanism stays: an entry here is a declared gap, and a row that is neither
 * mapped nor declared fails the build. The self-check in `main` proves that path
 * is still live now that there is no real gap left to exercise it.
 */
const GAPS = {};

const colors = {
  reset: '[0m',
  green: '[32m',
  red: '[31m',
  yellow: '[33m',
  cyan: '[36m',
  dim: '[2m',
};

const failures = [];

function fail(message, detail) {
  failures.push(detail ? `${message}\n    ${detail}` : message);
}

/** Criterion rows, matched on the shape of the first cell so a new table is picked up. */
function parseRegistryRows() {
  const rows = [];
  for (const line of fs.readFileSync(REGISTRY_PATH, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim());
    if (cells.length < 5) continue;
    if (!/^[CHML]\d+$/.test(cells[0])) continue;
    rows.push({ id: cells[0], criterion: cells[1], severity: cells.at(-2), gate: cells.at(-1) });
  }
  return rows;
}

/** Registry rows that are neither mapped to a fragment nor declared a gap. */
function unclassifiedRows(rows, manifest, gaps) {
  return rows.filter((row) => !Object.hasOwn(manifest, row.id) && !Object.hasOwn(gaps, row.id));
}

function main() {
  console.log(`${colors.cyan}========================================`);
  console.log('Criteria Registry → Fragment Traceability');
  console.log(`========================================${colors.reset}\n`);

  const rows = parseRegistryRows();
  if (rows.length === 0) {
    console.error(`${colors.red}no criterion rows parsed from ${REGISTRY_PATH}${colors.reset}`);
    process.exit(1);
  }
  const byId = new Map(rows.map((row) => [row.id, row]));

  const validSeverities = new Set(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
  const misparsed = rows.filter((row) => !validSeverities.has(row.severity));
  if (misparsed.length > 0) {
    fail('the registry parser is reading the wrong column', misparsed.map((row) => `${row.id}: "${row.severity}"`).join(', '));
  }

  // Which fragments are actually selectable. A fragment on disk with no index row
  // is never loaded, so teaching a rule there teaches nobody.
  let indexed = new Set();
  try {
    const records = parse(fs.readFileSync(INDEX_PATH, 'utf8'), { columns: true, skip_empty_lines: true });
    indexed = new Set(records.map((record) => String(record.fragment_file || '').replace(/^knowledge\//, '')));
  } catch (error) {
    fail(`tea-index.csv could not be read: ${error.message}`);
  }

  // ---- every row is classified -------------------------------------------
  const mapped = new Set(Object.keys(MANIFEST));
  const gapped = new Set(Object.keys(GAPS));

  // Self-check. The valuable behaviour of this tool is that an UNDECLARED row
  // fails the build. With coverage at 35/35 and GAPS empty, no real input
  // exercises that path any more, so a refactor could quietly kill it and every
  // run would still be green. Feed it a row that exists in neither map and
  // require it to be caught.
  const probe = [...rows, { id: 'Z9', criterion: 'synthetic probe row', severity: 'HIGH', gate: 'Absolute' }];
  if (!unclassifiedRows(probe, MANIFEST, GAPS).some((row) => row.id === 'Z9')) {
    fail(
      'self-check: an unmapped registry row no longer fails this tool',
      'The whole anti-rot mechanism is that a new registry row cannot land until somebody maps it or declares it a gap. That guard is dead; fix it before trusting a green run.',
    );
  }

  const unclassified = unclassifiedRows(rows, MANIFEST, GAPS);
  if (unclassified.length > 0) {
    fail(
      `${unclassified.length} registry row(s) are neither mapped to a fragment nor declared a gap`,
      `${unclassified.map((row) => `${row.id} (${row.criterion})`).join(', ')}\n    ` +
        'Add a MANIFEST entry naming the fragment that teaches it, or a GAPS entry saying nothing does.',
    );
  }

  const both = [...mapped].filter((id) => gapped.has(id));
  if (both.length > 0) fail('row(s) are both mapped and declared a gap', both.join(', '));

  for (const id of [...mapped, ...gapped]) {
    if (!byId.has(id)) fail(`manifest names ${id}, which is not a row in the registry`);
  }

  for (const [id, reason] of Object.entries(GAPS)) {
    if (typeof reason !== 'string' || reason.length < 30) fail(`GAPS.${id} does not state what is missing`);
  }

  // ---- mapped rows resolve -------------------------------------------------
  let anchorChecks = 0;
  for (const [id, entry] of Object.entries(MANIFEST)) {
    const row = byId.get(id);
    if (!row) continue;

    if (entry.severity !== row.severity) {
      fail(
        `${id}: manifest severity ${entry.severity} no longer matches the registry's ${row.severity}`,
        'Severity is read from the registry, never chosen. Update the manifest, and check whether the fragment still describes the right consequence.',
      );
    }

    if (!Array.isArray(entry.teaches) || entry.teaches.length === 0) {
      fail(`${id}: manifest entry names no fragment`);
      continue;
    }

    for (const { fragment, anchor } of entry.teaches) {
      const fragmentPath = path.join(KNOWLEDGE_DIR, fragment);
      if (!fs.existsSync(fragmentPath)) {
        fail(`${id}: mapped fragment ${fragment} does not exist`, `looked in ${path.relative(PROJECT_ROOT, KNOWLEDGE_DIR)}`);
        continue;
      }
      if (!indexed.has(fragment)) {
        fail(`${id}: ${fragment} is not indexed in tea-index.csv, so it is never selected and teaches nobody`);
      }
      anchorChecks += 1;
      const content = fs.readFileSync(fragmentPath, 'utf8');
      if (!content.includes(anchor)) {
        fail(
          `${id}: ${fragment} no longer contains its anchor "${anchor}"`,
          'Either the teaching was removed (the registry now scores a rule nothing explains) or it was reworded (pick a new anchor).',
        );
      }
    }
  }

  // ---- report --------------------------------------------------------------
  const coverage = `${mapped.size}/${rows.length}`;
  console.log(`${colors.green}✓${colors.reset} ${rows.length} registry rows parsed`);
  console.log(`${colors.green}✓${colors.reset} ${anchorChecks} anchor(s) checked across ${mapped.size} mapped row(s)`);
  console.log(`${colors.dim}  coverage: ${coverage} rows have a fragment that teaches them${colors.reset}\n`);

  if (gapped.size > 0) {
    console.log(`${colors.yellow}${gapped.size} registry row(s) have no fragment teaching them:${colors.reset}`);
    for (const [id, reason] of Object.entries(GAPS)) {
      const row = byId.get(id);
      console.log(`  ${colors.yellow}•${colors.reset} ${id} ${row ? row.criterion : ''} ${colors.dim}— ${reason}${colors.reset}`);
    }
    console.log(
      `${colors.dim}\n  These are declared, not exempt. The reviewer deducts for each of them and the\n  generator was never taught any of them. Closing one is a fragment edit plus a\n  MANIFEST line here.${colors.reset}\n`,
    );
  }

  if (failures.length > 0) {
    console.error(`${colors.red}traceability failures:${colors.reset}`);
    for (const failure of failures) console.error(`  ${colors.red}✗${colors.reset} ${failure}`);
    console.error('');
    process.exit(1);
  }

  console.log(`${colors.green}✨ Criteria registry and knowledge fragments are in sync!${colors.reset}\n`);
  process.exit(0);
}

main();
