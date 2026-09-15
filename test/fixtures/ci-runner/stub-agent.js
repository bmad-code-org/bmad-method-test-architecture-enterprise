#!/usr/bin/env node
/**
 * A stand-in for a vendor CLI, so tea-ci-runner can be exercised end to end
 * with no credential, no network, and no money.
 *
 * The runner contract this honours is the custom adapter's, stated in
 * cli/lib/agent-adapters.js: read the complete prompt from stdin, operate in the
 * working directory, write the artifact the prompt names, print the final
 * response to stdout, exit nonzero on failure.
 *
 * A real CI run leaves a workflow file under the project's
 * .github/workflows/ directory. This stub copies a checked-in workflow there,
 * chosen by which project the workspace carries, so the runner can be driven
 * against it. The workflows are the replay corpus's own correct runs,
 * test/replay/ci/full-correct-pipeline and test/replay/ci/minimal-correct-pipeline,
 * which `npm run test:eval-replay` already pins to a scored result; a second copy
 * here would be a second thing to keep in step with the ground truth.
 *
 * The project root is the one the prompt names, which is how test/eval-ci.js
 * stages a workspace, and the working directory otherwise, which is how
 * tea-ci-runner's registry entry names the artifact when a caller supplies no
 * path of its own.
 *
 * STUB_MODE selects the behaviour:
 *   complete    the correct workflow for the named project, exit 0 (the default)
 *   nothing     exit 0 without writing the workflow, so the caller reads `absent`
 *   fail        exits 3 without writing, so the runner reports environment-transport
 *   mutate      write the workflow, add a file under the project's evidence/, and
 *               change a byte of package.json, so the caller must count a mutation
 *   unparseable write the file with a syntax error, so the caller reads a parse failure
 *   unrequested write the full-request template regardless of which project was named,
 *               so the caller reads unrequested elements on a minimal request
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

if (prompt.trim().length === 0) {
  process.stderr.write('stub-agent: expected the prompt on stdin and got nothing\n');
  process.exit(4);
}

if (mode === 'fail') {
  process.stderr.write('stub-agent: forced failure\n');
  process.exit(3);
}

if (mode === 'nothing') {
  process.stdout.write('stub-agent: finished without writing the requested workflow\n');
  process.exit(0);
}

// The prompt names the project root, the same line a real agent resolves
// `{project-root}` from, and each project has its own. A prompt that names none
// is test/test-probe-targets.js probing the adapter rather than the corpus, so
// the stub falls back to the working directory there.
const named = /^- `\{project-root\}`: `([^`]+)`$/m.exec(prompt)?.[1] ?? null;
const projectRoot = named === null ? process.cwd() : path.join(process.cwd(), named);
const minimal = /lantern/.test(named ?? '');
const replaySource = mode === 'unrequested' ? 'full-correct-pipeline' : minimal ? 'minimal-correct-pipeline' : 'full-correct-pipeline';
const source = path.join(__dirname, '..', '..', 'replay', 'ci', replaySource, '.github', 'workflows', 'test.yml');
const workflowDir = path.join(projectRoot, '.github', 'workflows');
fs.mkdirSync(workflowDir, { recursive: true });

const workflowPath = path.join(workflowDir, 'test.yml');
if (mode === 'unparseable') {
  fs.writeFileSync(workflowPath, 'on:\n  push:\n    branches: [main\njobs: {}\n', 'utf8');
} else {
  fs.copyFileSync(source, workflowPath);
}

// The one thing the workflow says it never does. A CI run scaffolds a pipeline
// and does not edit the project it was handed, so a run that changed a project
// file has changed the benchmark the next run is measured against.
// maxFixtureMutations is the ceiling that counts it, and without a stub that can
// do it nothing in the gate ever reaches that counter.
if (mode === 'mutate') {
  const packageJsonPath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    pkg.description = `${pkg.description ?? ''} (edited by a run that should not touch this file)`;
    fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  }
}

process.stdout.write(`Wrote ${path.relative(process.cwd(), workflowPath)}.\n`);
