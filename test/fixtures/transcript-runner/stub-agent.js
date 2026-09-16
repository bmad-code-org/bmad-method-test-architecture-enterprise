#!/usr/bin/env node
/**
 * A stand-in for a vendor CLI, so tea-transcript-runner and
 * test/lib/transcript-harness.js can be exercised end to end with no
 * credential, no network, and no money.
 *
 * The runner contract this honours is the custom adapter's, stated in
 * cli/lib/agent-adapters.js: read the complete prompt from stdin, operate in
 * the working directory, print the final response to stdout, exit nonzero on
 * failure.
 *
 * TURN-AWARE, WITH NO MEMORY OF ITS OWN
 *
 * Each turn of a session is a fresh process, so this stub tracks which turn it
 * is answering the only way a fresh process can: a counter file
 * (.tea-transcript-turn-count) in the workspace the harness keeps persistent
 * across every turn of one session. It reads the counter, advances it, and
 * that is this turn's number.
 *
 * SCRIPTS is the reply table, keyed by STUB_TRANSCRIPT_MODE and then by turn
 * number. `consistent` states the same fact in every turn; `contradictory`
 * changes it on the last turn on purpose, so test/test-transcript-harness.js
 * can prove the cross-turn check actually fires rather than only ever seeing a
 * happy path; `fail-turn-2` exits nonzero on turn 2 with no reply at all, so
 * the same test can prove a session stops rather than running its last turn
 * blind. SCRIPTS is exported so a caller — test/eval-transcript.js's static
 * `--validate-only` check — can hold its own ground truth to what this stub
 * actually says, the same way a change to a real fixture is caught elsewhere
 * in this repository, without spawning a process to ask it.
 *
 * A real vendor CLI answers --version, and every harness pre-flight probes for
 * it before it will run anything. Answering it here is what lets the runner be
 * driven end to end against this stub with no credential.
 */

'use strict';

const SCRIPTS = {
  consistent: {
    1: "Established fact: the vault's access code is 4471.",
    2: "Confirmed: the vault's access code is 4471, same as turn 1.",
    3: "Final answer: the vault's access code is 4471, unchanged since turn 1.",
  },
  contradictory: {
    1: "Established fact: the vault's access code is 4471.",
    2: "Confirmed: the vault's access code is 4471, same as turn 1.",
    // Deliberately not 4471: proves the cross-turn check actually fires.
    3: "Final answer: the vault's access code is 9902.",
  },
  'fail-turn-2': {
    1: "Established fact: the vault's access code is 4471.",
    // No entry for turn 2: this mode exits nonzero there instead of replying.
  },
};

const COUNTER_FILE_NAME = '.tea-transcript-turn-count';

function main() {
  const fs = require('node:fs');
  const path = require('node:path');

  if (process.argv.includes('--version')) {
    process.stdout.write('stub-agent 1.0.0\n');
    process.exit(0);
  }

  const mode = process.env.STUB_TRANSCRIPT_MODE || 'consistent';

  // Read stdin to completion first. A child that exits without draining the
  // pipe makes the writer see EPIPE, which is a different failure from the one
  // under test.
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

  const counterPath = path.join(process.cwd(), COUNTER_FILE_NAME);
  let turn = 1;
  try {
    turn = Number.parseInt(fs.readFileSync(counterPath, 'utf8'), 10) + 1;
    if (!Number.isInteger(turn) || turn < 1) turn = 1;
  } catch {
    turn = 1;
  }
  try {
    fs.writeFileSync(counterPath, String(turn), 'utf8');
  } catch (error) {
    process.stderr.write(`stub-agent: could not write the turn counter to ${counterPath}: ${error.message}\n`);
    process.exit(4);
  }

  if (mode === 'fail-turn-2' && turn === 2) {
    process.stderr.write('stub-agent: forced failure on turn 2\n');
    process.exit(3);
  }

  const script = SCRIPTS[mode];
  if (!script) {
    process.stderr.write(`stub-agent: unknown STUB_TRANSCRIPT_MODE "${mode}"\n`);
    process.exit(4);
  }
  const reply = script[turn];
  if (reply === undefined) {
    process.stderr.write(`stub-agent: mode "${mode}" scripts no reply for turn ${turn}\n`);
    process.exit(4);
  }

  process.stdout.write(`${reply}\n`);
}

// Guarded so test/eval-transcript.js can read SCRIPTS to hold its own ground
// truth against it, without spawning a process or blocking on a stdin read
// that will never come from a require() call. Every other stub-agent.js in
// this repository is spawned only, never required, and runs unconditionally;
// this one is required by its own harness's --validate-only check, which is
// why it needs the guard the others do not.
if (require.main === module) {
  main();
}

module.exports = { SCRIPTS, COUNTER_FILE_NAME };
