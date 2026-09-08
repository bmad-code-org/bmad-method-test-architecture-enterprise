#!/usr/bin/env node
/**
 * A stand-in for a vendor CLI, so tea-fragment-selection-runner can be exercised
 * end to end with no credential, no network, and no money.
 *
 * The runner contract this honours is the custom adapter's, stated in
 * cli/lib/agent-adapters.js: read the complete prompt from stdin, print the
 * final response to stdout, exit nonzero on failure.
 *
 * STUB_MODE selects the behaviour and STUB_FRAGMENTS carries the comma-separated
 * list the answering modes return. The modes:
 *   fragments  a bare JSON object, the shape the runner's parser prefers
 *   fenced     the same object inside a ```json fence with prose around it
 *   prose      no JSON at all, so the runner reports environment-parser
 *   slow       sleeps past every budget, so the caller reports a killed process
 *   fail       exits 3 without printing, so the runner reports environment-transport
 *
 * Two variables rather than one packed value, which is the point of the fixture
 * beyond the modes themselves: reaching both means `--env-pass` arrived twice,
 * so the probe path really does carry a repeated option through to the child.
 */

'use strict';

const fs = require('node:fs');

const mode = process.env.STUB_MODE || 'fragments';
const fragments = (process.env.STUB_FRAGMENTS || 'test-quality.md,data-factories.md').split(',').filter(Boolean);

// A real vendor CLI answers --version, and every harness pre-flight probes for
// it before it will run anything. Answering it here is what lets the whole
// harness be driven end to end against this stub with no credential: without it
// the probe reads the empty stdin below and reports the vendor as broken.
if (process.argv.includes('--version')) {
  process.stdout.write('stub-agent 1.0.0\n');
  process.exit(0);
}

// Read stdin to completion first. A child that exits without draining the pipe
// makes the writer see EPIPE, which is a different failure from the one under
// test.
let prompt = '';
try {
  prompt = fs.readFileSync(0, 'utf8');
} catch {
  prompt = '';
}

// Unconditional, and the reason it is worth a fixture: the whole runner
// contract is "the prompt arrives on stdin". A stub that answered without one
// would let a broken stdin channel pass every check below.
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

if (mode === 'prose') {
  process.stdout.write('I looked at the index and I think the core set is what this run needs.\n');
  process.exit(0);
}

const payload = JSON.stringify({ fragments });
process.stdout.write(mode === 'fenced' ? `Here is the selection.\n\n\`\`\`json\n${payload}\n\`\`\`\n` : `${payload}\n`);
