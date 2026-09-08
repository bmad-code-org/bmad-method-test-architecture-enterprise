#!/usr/bin/env node
/**
 * A stand-in for a vendor CLI, so tea-fragment-selection-runner can be exercised
 * end to end with no credential, no network, and no money.
 *
 * The runner contract this honours is the custom adapter's, stated in
 * cli/lib/agent-adapters.js: read the complete prompt from stdin, print the
 * final response to stdout, exit nonzero on failure.
 *
 * STUB_MODE is `<mode>` or `<mode>:<comma-separated fragment list>`. The modes:
 *   fragments  a bare JSON object, the shape the runner's parser prefers
 *   fenced     the same object inside a ```json fence with prose around it
 *   prose      no JSON at all, so the runner reports environment-parser
 *   slow       sleeps past every budget, so the caller reports a killed process
 *   fail       exits 3 without printing, so the runner reports environment-transport
 *
 * Mode and fragment list share one variable on purpose. eval-quality's
 * command-line adapter builds argv from a key map, so `--env-pass` cannot be
 * repeated through it and a probe can forward exactly one name. Splitting the
 * two would work from a shell and fail from the port, which is the harder
 * failure to notice.
 */

'use strict';

const fs = require('node:fs');

const [mode = 'fragments', fragmentList] = (process.env.STUB_MODE || 'fragments').split(':');
const fragments = (fragmentList || 'test-quality.md,data-factories.md').split(',').filter(Boolean);

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
