#!/usr/bin/env node
/**
 * A stub `command` evaluator (Story 1.17): it reads `{ sealedBrief,
 * observations }` on stdin and prints judgment rows for the verdict fixture,
 * key `verdict-accepted` bound to O-001 and, when the mapping binds it,
 * `verdict-quality` bound to R-101/RC-101.
 *
 * The observation it judges is the first one whose stdout carries a verdict
 * line: `pass` when it says `verdict: accepted`, `fail` otherwise, quoting
 * `verdict: rejected` from its stdout. `--mode` changes what it answers:
 *
 *   rows               the pass and fail rows alone (the default)
 *   recommend          the same rows with the evaluator's own recommendation,
 *                      PASS when accepted and CONCERNS otherwise
 *   score              beside them, a score row for verdict-quality (3 when accepted, 1 otherwise)
 *   artifact           a fail row quoting the written file `residue` (artifact channel)
 *   unwitnessed        a fail row whose quote the observation does not hold
 *   crash              an uncaught error, before printing anything
 *   nonzero            the rows, then exit 2
 *   invalid            an answer whose rows are not a list
 *   no-channel         a fail row with no quoteChannel
 *   artifact-no-id     a fail row on the artifact channel with no artifactId
 *   unmapped-key       a row whose key the mapping does not declare
 *   duplicate-key      two rows for one key
 *   zero-rows          no row at all
 *   off-scale          a score row outside verdict-quality's levels
 *   score-on-oracle    a score row on verdict-accepted, an oracle key
 *   pass-on-rubric     a pass row on verdict-quality, a rubric key
 *   hang               print the start of an answer, start a child (in the
 *                      evaluator's own process group), write both pids to the
 *                      file `--pids` names, and never exit
 *
 * Every mode first writes `stub stderr <mode>` to stderr, so a test can hold
 * the persisted streams to known bytes; `--log <file>` appends one line per
 * run with its input, its working directory and the names of the
 * environment variables it received.
 */

'use strict';

const fs = require('node:fs');
const { spawn } = require('node:child_process');

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = argv.indexOf(name);
  return at === -1 ? fallback : argv[at + 1];
};
const mode = flag('--mode', 'rows');
const log = flag('--log', null);
const pids = flag('--pids', null);

process.stderr.write(`stub stderr ${mode}\n`);
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
if (log !== null) {
  fs.appendFileSync(log, `${JSON.stringify({ mode, cwd: process.cwd(), environment: Object.keys(process.env).sort(), input })}\n`);
}

if (mode === 'crash') throw new Error('the stub evaluator crashed');
if (mode === 'hang') {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  if (pids !== null) fs.writeFileSync(pids, JSON.stringify({ evaluator: process.pid, child: child.pid }));
  process.stdout.write('{"rows":[');
  setInterval(() => {}, 1000);
} else answer();

function answer() {

  const text = (body) => (body?.kind === 'text' ? body.value : body?.kind === 'json' ? JSON.stringify(body.value) : '');
  const judged = input.observations.find((observation) => text(observation.stdout).includes('verdict:')) ?? input.observations[0];
  const accepted = text(judged.stdout).includes('verdict: accepted');
  const cite = [judged.observationId];
  const passRow = { key: 'verdict-accepted', outcome: 'pass', observationIds: cite, comment: 'The run says verdict: accepted.' };
  const failRow = {
    key: 'verdict-accepted',
    outcome: 'fail',
    observationIds: cite,
    quote: 'verdict: rejected',
    quoteChannel: 'stdout',
    confidence: 0.9,
    comment: 'The run rejected the request it had to accept.',
  };
  let rows = [accepted ? passRow : failRow];
  let recommendation;
  switch (mode) {
    case 'recommend': {
      recommendation = accepted ? 'PASS' : 'CONCERNS';
      break;
    }
    case 'score': {
      rows.push({ key: 'verdict-quality', outcome: 'score', score: accepted ? 3 : 1, observationIds: cite, comment: 'Scored on the verdict line.' });
      break;
    }
    case 'artifact': {
      if (!accepted) rows = [{ ...failRow, quote: 'left behind by a lenient run', quoteChannel: 'artifact', artifactId: 'residue' }];
      break;
    }
    case 'unwitnessed': {
      rows = [{ ...failRow, quote: 'verdict: forged by the stub' }];
      break;
    }
    case 'invalid': {
      rows = 'not a list';
      break;
    }
    case 'no-channel': {
      rows = [{ ...failRow, quoteChannel: undefined }];
      break;
    }
    case 'artifact-no-id': {
      rows = [{ ...failRow, quoteChannel: 'artifact' }];
      break;
    }
    case 'unmapped-key': {
      rows = [{ ...passRow, key: 'verdict-unmapped' }];
      break;
    }
    case 'duplicate-key': {
      rows = [passRow, passRow];
      break;
    }
    case 'zero-rows': {
      rows = [];
      break;
    }
    case 'score-on-oracle': {
      rows = [{ key: 'verdict-accepted', outcome: 'score', score: 1, observationIds: cite }];
      break;
    }
    case 'pass-on-rubric': {
      rows.push({ key: 'verdict-quality', outcome: 'pass', observationIds: cite });
      break;
    }
    case 'off-scale': {
      rows.push({ key: 'verdict-quality', outcome: 'score', score: 7, observationIds: cite });
      break;
    }
    default: {
      break;
    }
  }
  process.stdout.write(`${JSON.stringify(recommendation === undefined ? { rows } : { rows, recommendation })}\n`);
  if (mode === 'nonzero') process.exitCode = 2;
}
