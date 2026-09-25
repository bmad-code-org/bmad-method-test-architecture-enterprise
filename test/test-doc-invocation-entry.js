/**
 * The doc-invocation entry's comment-to-script lookup, held against the
 * literal `npm run <script>` text the pages that drive it actually carry.
 *
 * WHY THIS FILE EXISTS
 *
 * `test/lib/doc-invocation-entry.js` identifies which of its allowlisted
 * scripts a documented line names by looking up the line's trailing comment
 * in a hardcoded table, because the doc-invocations gate hands it only that
 * comment (see the entry's own header comment for why). `npm run
 * test:doc-invocations` proves every documented line resolves to a script
 * that still runs; it does not prove the table itself still agrees with what
 * each line literally spells out. Swap two adjacent lines' trailing comments
 * and rename the first line's script, and the gate still passes: the swapped
 * comment still resolves to *some* working script, so the mismatch between
 * what the line says and what actually ran is invisible to it. This file
 * reads the `npm run <script>  # <comment>` lines straight out of every page
 * the gate scans and asserts, line by line, that the entry's lookup returns
 * exactly the script the line spells out -- so a swap, a typo in either half,
 * or a comment that stops matching any known script fails here even when
 * `npm run <script>` itself would still exit 0.
 *
 * Usage: node test/test-doc-invocation-entry.js
 */

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.join(__dirname, '..');
const { ALLOWLIST_BY_COMMENT, ALLOWLISTED_SCRIPTS } = require('./lib/doc-invocation-entry.js');

/** The pages `eval-quality.config.json`'s `doc-invocations` section names under `pages`. */
const PAGES = ['README.md', 'docs/explanation/eval-quality-adoption-guide.md', 'test/README.md'];

/** Every `npm run <script>  # <comment>` line in one page, script and comment paired exactly as the line spells them. */
function documentedLines(relative) {
  const text = fs.readFileSync(path.join(PROJECT_ROOT, relative), 'utf8');
  const found = [];
  for (const [index, line] of text.split('\n').entries()) {
    const match = line.trim().match(/^npm run (\S+)\s+#\s*(.+)$/);
    if (match) found.push({ file: relative, line: index + 1, script: match[1], comment: match[2] });
  }
  return found;
}

const failures = [];

function check(name, fn) {
  try {
    fn();
    console.log(`  ok    ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.error(`  FAIL  ${name}`);
  }
}

const lines = PAGES.flatMap(documentedLines);

check('at least one documented "npm run <script>  # <comment>" line was found on each page', () => {
  for (const page of PAGES) {
    assert.ok(
      lines.some((entry) => entry.file === page),
      `no "npm run <script>  # <comment>" line matched on ${page}`,
    );
  }
});

check("every documented line's comment resolves, through the entry's lookup, to the script that same line literally spells out", () => {
  for (const entry of lines) {
    const resolved = ALLOWLIST_BY_COMMENT.get(entry.comment);
    assert.strictEqual(
      resolved,
      entry.script,
      `${entry.file}:${entry.line} spells out "npm run ${entry.script}" beside the comment "${entry.comment}", but the entry's lookup resolves that comment to ${JSON.stringify(resolved)}`,
    );
  }
});

check('every allowlisted script is reached by at least one documented line', () => {
  const reached = new Set(lines.map((entry) => entry.script));
  for (const script of ALLOWLISTED_SCRIPTS) {
    assert.ok(reached.has(script), `no documented "npm run <script>  # <comment>" line resolves to allowlisted script "${script}"`);
  }
});

if (failures.length > 0) {
  console.error('\ndoc-invocation-entry validation failed:\n');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `doc-invocation-entry's lookup agrees with all ${lines.length} documented "npm run <script>  # <comment>" line(s) across ${PAGES.length} page(s).`,
);
