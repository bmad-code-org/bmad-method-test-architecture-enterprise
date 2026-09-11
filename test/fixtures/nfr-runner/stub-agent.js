#!/usr/bin/env node
/**
 * A stand-in for a vendor CLI, so tea-nfr-runner can be exercised end to end
 * with no credential, no network, and no money.
 *
 * The runner contract this honours is the custom adapter's, stated in
 * cli/lib/agent-adapters.js: read the complete prompt from stdin, operate in the
 * working directory, write the artifact the prompt names, print the final
 * response to stdout, exit nonzero on failure.
 *
 * A real NFR run leaves one file under the project's test-artifacts directory.
 * This stub copies a checked-in report there, chosen by which service the
 * workspace carries, so the runner can be driven against it. The reports are the
 * replay corpus's own correct runs, test/replay/nfr/gapped-correct-audit and
 * test/replay/nfr/clean-correct-audit, which `npm run test:eval-replay` already
 * pins to a scored result; a second copy here would be a second thing to keep in
 * step with the ground truth.
 *
 * The project root is the one the prompt names, which is how test/eval-nfr.js
 * stages a workspace, and the working directory otherwise, which is how
 * tea-nfr-runner's registry entry names the artifact when a caller supplies no
 * path of its own.
 *
 * STUB_MODE selects the behaviour:
 *   complete  the report, exit 0 (the default)
 *   nothing   exit 0 without writing the report, so the caller reads `absent`
 *   fail      exits 3 without writing, so the runner reports environment-transport
 *
 * A real vendor CLI answers --version, and every harness pre-flight probes for it
 * before it will run anything. Answering it here is what lets the runner be driven
 * end to end against this stub with no credential.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

if (process.argv.includes('--version')) {
  process.stdout.write('stub-agent 1.0.0\n');
  process.exit(0);
}

const mode = process.env.STUB_MODE || 'complete';

// Read stdin to completion first. A child that exits without draining the pipe
// makes the writer see EPIPE, which is a different failure from the one under
// test.
let prompt = '';
try {
  prompt = fs.readFileSync(0, 'utf8');
} catch {
  prompt = '';
}

// Unconditional, and the reason it is worth a fixture: the whole runner contract
// is "the prompt arrives on stdin". A stub that answered without one would let a
// broken stdin channel pass every check below.
if (prompt.trim().length === 0) {
  process.stderr.write('stub-agent: expected the prompt on stdin and got nothing\n');
  process.exit(4);
}

if (mode === 'fail') {
  process.stderr.write('stub-agent: forced failure\n');
  process.exit(3);
}

if (mode === 'nothing') {
  process.stdout.write('stub-agent: finished without writing the requested report\n');
  process.exit(0);
}

// The prompt names the project root, the same line a real agent resolves
// `{project-root}` from, and each evidence bundle has its own. A prompt that names
// none is test/test-probe-targets.js probing the adapter rather than the corpus,
// so the stub falls back to the working directory there.
const named = /^- `\{project-root\}`: `([^`]+)`$/m.exec(prompt)?.[1] ?? null;
const projectRoot = named === null ? process.cwd() : path.join(process.cwd(), named);
const bundle = /atlas/.test(named ?? '') ? 'clean' : 'gapped';
const source = path.join(__dirname, '..', '..', 'replay', 'nfr', `${bundle}-correct-audit`, 'test-artifacts', 'nfr-assessment.md');
const artifactsDir = path.join(projectRoot, 'test-artifacts');
fs.mkdirSync(artifactsDir, { recursive: true });

const reportPath = path.join(artifactsDir, 'nfr-assessment.md');
fs.copyFileSync(source, reportPath);

// The one thing the workflow says it never does. An NFR run audits evidence and
// produces none, so a run that writes into the bundle it was handed has changed
// the benchmark the next run is measured against. maxFixtureMutations is the
// ceiling that counts it, and without a stub that can do it nothing in the gate
// ever reaches that counter.
if (mode === 'mutate') {
  fs.writeFileSync(path.join(projectRoot, 'evidence', 'coverage-summary-invented.json'), '{"lines":{"pct":91.2}}\n', 'utf8');
}

process.stdout.write(`Wrote ${path.relative(process.cwd(), reportPath)}.\n`);
