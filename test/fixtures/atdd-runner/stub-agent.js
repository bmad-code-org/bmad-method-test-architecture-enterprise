#!/usr/bin/env node
/**
 * A stand-in for a vendor CLI, so tea-atdd-runner can be exercised end to end
 * with no credential, no network, and no money.
 *
 * The runner contract this honours is the custom adapter's, stated in
 * cli/lib/agent-adapters.js: read the complete prompt from stdin, operate in the
 * working directory, write the artifact the prompt names, print the final
 * response to stdout, exit nonzero on failure.
 *
 * A real ATDD generation run writes scaffolds under the project's own test
 * directory. This stub copies one of the hand-authored scaffold sets under
 * test/fixtures/atdd-eval/cases/ there, chosen by STUB_MODE, so
 * cli/atdd-red-check.js and the whole harness can be driven end to end against
 * it with no model call.
 *
 * The project root is the one the prompt names, and the test directory is the
 * one the prompt names too, both under `{project-root}`/`{test_dir}` resolution
 * the same way test/eval-atdd.js's buildPrompt states them.
 *
 * STUB_MODE selects the behaviour:
 *   correct-run       the scaffold set where all five criteria fail as the
 *                      story states (the default)
 *   vacuous-pass       AC-5's scaffold asserts only the status code
 *   wrong-reason-red   AC-1's scaffold asserts the wrong expected value
 *   load-error         a spec file with a syntax error
 *   still-skipped      AC-4 uses test.fixme() instead of test.skip()
 *   not-mapped         every criterion, plus one scaffold naming none
 *   mutate             the correct-run set, plus an edit to a file under src/
 *   nothing            exit 0 without writing any scaffold
 *   fail               exit 3 without writing anything
 *
 * A real vendor CLI answers --version, and every harness pre-flight probes for
 * it before it will run anything. Answering it here is what lets the runner be
 * driven end to end against this stub with no credential.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

if (process.argv.includes('--version')) {
  process.stdout.write('stub-agent 1.0.0\n');
  process.exit(0);
}

const mode = process.env.STUB_MODE || 'correct-run';

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
  process.stdout.write('stub-agent: finished without writing any scaffold\n');
  process.exit(0);
}

const projectRootMatch = /^- `\{project-root\}`: `([^`]+)`$/m.exec(prompt);
const testDirMatch = /^- `\{test_dir\}`: `([^`]+)`$/m.exec(prompt);
const projectRoot = projectRootMatch ? path.join(process.cwd(), projectRootMatch[1]) : process.cwd();
const testDirAbsolute = testDirMatch ? path.join(process.cwd(), testDirMatch[1]) : path.join(projectRoot, 'tests');

const caseId = mode === 'mutate' ? 'correct-run' : mode;
const sourceRoot = path.join(__dirname, '..', 'atdd-eval', 'cases', caseId, 'tests');
if (!fs.existsSync(sourceRoot)) {
  process.stderr.write(`stub-agent: no scaffold set for STUB_MODE=${mode} at ${sourceRoot}\n`);
  process.exit(3);
}

function copyRecursive(from, to) {
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(target, { recursive: true });
      copyRecursive(source, target);
    } else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
    }
  }
}

fs.mkdirSync(testDirAbsolute, { recursive: true });
copyRecursive(sourceRoot, testDirAbsolute);

let fileCount = 0;
const countFiles = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) countFiles(path.join(directory, entry.name));
    else fileCount += 1;
  }
};
countFiles(testDirAbsolute);

// The one thing the workflow says it never does. A run that edits a file
// outside the scaffold directory has moved the benchmark, which this suite
// names as a negative control.
if (mode === 'mutate') {
  fs.appendFileSync(path.join(projectRoot, 'src', 'server.js'), '\n// stub-mode "mutate": an edit outside tests/\n', 'utf8');
}

process.stdout.write(`Wrote ${fileCount} test file(s) under ${path.relative(process.cwd(), testDirAbsolute)}.\n`);
