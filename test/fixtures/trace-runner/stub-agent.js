#!/usr/bin/env node
/**
 * A stand-in for a vendor CLI, so tea-trace-runner can be exercised end to end
 * with no credential, no network, and no money.
 *
 * The runner contract this honours is the custom adapter's, stated in
 * cli/lib/agent-adapters.js: read the complete prompt from stdin, operate in the
 * working directory, write the artifacts the prompt names, print the final
 * response to stdout, exit nonzero on failure.
 *
 * A real trace run leaves two files under the project's test-artifacts directory.
 * This stub copies a checked-in pair there, chosen by which epic the workspace
 * carries, so the whole trace harness can be driven against it. The pairs are the
 * replay corpus's own correct runs, test/replay/trace/seeded-correct-run and
 * test/replay/trace/clean-correct-run, which `npm run test:eval-replay` already
 * pins to a scored result of every threshold met; a second copy here would be a
 * second thing to keep in step with the ground truth. A workspace carrying
 * neither epic gets the seeded pair, which is what a bare probe with no staged
 * project reads back.
 *
 * The project root is `project/` under the working directory when that exists,
 * which is how test/eval-trace.js stages a workspace, and the working directory
 * itself otherwise, which is how tea-trace-runner's registry entry names the
 * artifacts when a caller supplies no paths of its own.
 *
 * STUB_MODE selects the behaviour:
 *   complete      both artifacts, exit 0 (the default)
 *   nothing       exit 0 without writing either artifact, so the caller reads `absent`
 *   invalid-json  the matrix, and a summary that is not JSON, so the caller reads `text`
 *   mutate        both artifacts plus a new test file under the project's tests/, which
 *                 the harness must count as a fixture mutation
 *   slow          sleeps past every budget, so the caller reports a killed process
 *   fail          exits 3 without writing, so the runner reports environment-transport
 *
 * A real vendor CLI answers --version, and every harness pre-flight probes for it
 * before it will run anything. Answering it here is what lets the whole harness
 * be driven end to end against this stub with no credential.
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

if (mode === 'slow') {
  // Busy-wait rather than setTimeout: the caller kills this process with
  // SIGKILL, and a pending timer would let node exit first on a fast machine.
  const until = Date.now() + 60_000;
  while (Date.now() < until) {
    // spin
  }
  process.exit(0);
}

if (mode === 'nothing') {
  process.stdout.write('stub-agent: finished without writing the requested artifacts\n');
  process.exit(0);
}

// The prompt names the project root, the same line a real agent resolves
// `{project-root}` from, and each fixture set has its own. A prompt that names none
// is test/test-probe-targets.js probing the adapter rather than the corpus, so the
// stub keeps the older reading there: `project/` when the caller staged one, and the
// working directory otherwise.
const named = /^- `\{project-root\}`: `([^`]+)`$/m.exec(prompt)?.[1] ?? null;
const projectRoot =
  named !== null
    ? path.join(process.cwd(), named)
    : fs.existsSync(path.join(process.cwd(), 'project'))
      ? path.join(process.cwd(), 'project')
      : process.cwd();
const epicsDir = path.join(projectRoot, 'docs', 'epics');
const epics = fs.existsSync(epicsDir) ? fs.readdirSync(epicsDir) : [];
const fixtureSet = epics.some((name) => name.startsWith('epic-5-')) ? 'clean' : 'seeded';
const source = path.join(__dirname, '..', '..', 'replay', 'trace', `${fixtureSet}-correct-run`, 'test-artifacts');
const artifactsDir = path.join(projectRoot, 'test-artifacts');
fs.mkdirSync(artifactsDir, { recursive: true });

const summaryPath = path.join(artifactsDir, 'e2e-trace-summary.json');
const matrixPath = path.join(artifactsDir, 'traceability-matrix.md');
fs.copyFileSync(path.join(source, 'traceability-matrix.md'), matrixPath);
if (mode === 'invalid-json') {
  fs.writeFileSync(summaryPath, '{"schema_version": "0.3.0", "gate_status": FAIL\n', 'utf8');
} else {
  fs.copyFileSync(path.join(source, 'e2e-trace-summary.json'), summaryPath);
}

if (mode === 'mutate') {
  // The one thing the workflow says it never does. The harness digests the corpus
  // before and after the run, and this file is what that digest has to catch.
  const generated = path.join(projectRoot, 'tests', 'api', 'generated-by-the-run.api.spec.ts');
  fs.mkdirSync(path.dirname(generated), { recursive: true });
  fs.writeFileSync(generated, "test('generated to close a gap', async () => {});\n", 'utf8');
}

process.stdout.write(`Wrote ${path.relative(process.cwd(), matrixPath)} and ${path.relative(process.cwd(), summaryPath)}.\n`);
