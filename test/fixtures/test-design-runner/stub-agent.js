#!/usr/bin/env node
/**
 * A stand-in for a vendor CLI, so tea-test-design-runner and the whole test-design
 * harness can be exercised end to end with no credential, no network, and no money.
 *
 * The runner contract this honours is the custom adapter's, stated in
 * cli/lib/agent-adapters.js: read the complete prompt from stdin, operate in the
 * working directory, write the artifact the prompt names, print the final response
 * to stdout, exit nonzero on failure.
 *
 * A real test-design run leaves one document at
 * `{project-root}/test-artifacts/test-design-epic-{epic_num}.md`. This stub copies a
 * checked-in document there, chosen by the staged fixture set and by STUB_MODE. The
 * documents are the replay corpus's own, under test/replay/test-design, which
 * `npm run test:eval-replay` already pins to a scored result; a second copy here
 * would be a second thing to keep in step with the ground truth, and the whole point
 * of the defect modes is that the document is known to carry exactly one defect.
 *
 * Both placeholders come from the prompt, which is the only thing that knows which
 * set is staged: test/eval-test-design.js writes `{project-root}` and `epic_num` into
 * the run configuration block, and a real agent resolves the workflow's own
 * placeholders from those same two lines.
 *
 * STUB_MODE selects the behaviour:
 *   complete          the staged set's correct document, exit 0 (the default)
 *   nothing           exit 0 without writing it, so the caller reads `absent`
 *   mutate            the correct document plus an edit to the staged epic, which the
 *                     harness must count as a fixture mutation
 *   arithmetic-off    a document whose score cell disagrees with probability x impact
 *   band-misfiled     a document filing a score-9 risk under the Score 1-2 heading
 *   generic-register  a register of four risks the epic rules out in as many words
 *
 * The three defect documents belong to the seeded set, because each defect is scored
 * against the risks that set declares. Asking for one while the clean set is staged is
 * a caller mistake, and it is refused: answering it would hand the harness a document
 * written about another epic.
 *
 * A real vendor CLI answers --version, and every harness pre-flight probes for it
 * before it will run anything. Answering it here is what lets the whole harness be
 * driven end to end against this stub with no credential.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

if (process.argv.includes('--version')) {
  process.stdout.write('stub-agent 1.0.0\n');
  process.exit(0);
}

/** Exit 4 is the runner's parser class, which is what a stub that cannot answer is. */
function refuse(message) {
  process.stderr.write(`stub-agent: ${message}\n`);
  process.exit(4);
}

const mode = process.env.STUB_MODE || 'complete';

// Read stdin to completion first. A child that exits without draining the pipe
// makes the writer see EPIPE, which is a different failure from the one under test.
let prompt = '';
try {
  prompt = fs.readFileSync(0, 'utf8');
} catch {
  prompt = '';
}

// Unconditional, and the reason it is worth a fixture: the whole runner contract is
// "the prompt arrives on stdin". A stub that answered without one would let a broken
// stdin channel pass every check the harness makes.
if (prompt.trim().length === 0) refuse('expected the prompt on stdin and got nothing');

/** The staged project roots test/fixtures/test-design-eval/ground-truth.json declares. */
const FIXTURE_SETS = {
  'field-order-capture': 'seeded',
  'field-sync-indicator': 'clean',
};

/**
 * The stored document each mode copies, as a directory under test/replay/test-design.
 *
 * A mode returning null for the staged set has nothing to say about that set; see the
 * header.
 */
const DOCUMENT_FOR = {
  complete: (set) => `${set}-correct-run`,
  mutate: (set) => `${set}-correct-run`,
  nothing: () => null,
  'arithmetic-off': (set) => (set === 'seeded' ? 'seeded-arithmetic-off' : null),
  'band-misfiled': (set) => (set === 'seeded' ? 'seeded-band-misfiled' : null),
  'generic-register': (set) => (set === 'seeded' ? 'seeded-generic-register' : null),
};

const namedRoot = /^- `\{project-root\}`: `([^`]+)`$/m.exec(prompt)?.[1] ?? null;
const epicNum = /^- `epic_num`: `([^`]+)`$/m.exec(prompt)?.[1] ?? null;
if (namedRoot === null || epicNum === null) {
  refuse('the prompt states no {project-root} and epic_num, so there is no document to write');
}

const set = FIXTURE_SETS[namedRoot];
if (set === undefined) refuse(`no fixture set is staged under "${namedRoot}"`);

if (mode === 'nothing') {
  process.stdout.write('stub-agent: finished without writing the requested document\n');
  process.exit(0);
}

const chooseDocument = DOCUMENT_FOR[mode];
if (chooseDocument === undefined) refuse(`unknown STUB_MODE "${mode}"`);
const storedCase = chooseDocument(set);
if (storedCase === null) refuse(`STUB_MODE "${mode}" writes a seeded document and the staged set is "${set}"`);

const source = path.join(__dirname, '..', '..', 'replay', 'test-design', storedCase, 'design.md');
if (!fs.existsSync(source)) refuse(`no stored document at ${source}`);

const projectRoot = path.join(process.cwd(), namedRoot);
const artifactsDir = path.join(projectRoot, 'test-artifacts');
fs.mkdirSync(artifactsDir, { recursive: true });
const designPath = path.join(artifactsDir, `test-design-epic-${epicNum}.md`);
fs.copyFileSync(source, designPath);

if (mode === 'mutate') {
  // The one thing the prompt forbids in as many words: the workflow reads its inputs
  // and does not change them. The harness digests the staged corpus before and after
  // the run, and this edit is what that digest has to catch.
  const epicsDir = path.join(projectRoot, 'docs', 'epics');
  const epics = fs.existsSync(epicsDir) ? fs.readdirSync(epicsDir).sort((a, b) => a.localeCompare(b)) : [];
  if (epics.length === 0) refuse(`STUB_MODE "mutate" found no staged epic under ${epicsDir}`);
  fs.appendFileSync(path.join(epicsDir, epics[0]), '\n<!-- Risk R-002 confirmed with the team during this run. -->\n', 'utf8');
}

process.stdout.write(`Wrote ${path.relative(process.cwd(), designPath)}.\n`);
