#!/usr/bin/env node
/**
 * A stub `command` evaluator for the partition-plan fixture (Story 1.107). It reads `{ sealedBrief, observations }` on stdin and
 * prints one judgment row per plan step it is handed, keyed by the step it reads from the observation's ID (`<label>-<stepId>`):
 *
 *   accepted:<stepId>   the oracle `evaluator/mapping.json` or the held-out plan binds to that key
 *
 * A row is `pass` when the step's stdout says `verdict: accepted` and `fail` otherwise, quoting `verdict: rejected`. The file spells
 * no step, oracle or criterion, because the development partition reads this directory and a held-out ID in it would reach every
 * development run: a partition's evaluator input decides which keys it prints, and the mapping of its view names them. With
 * `--rubric` it also scores the criterion bound to `score:<stepId>` at level 1 when the step was accepted and 0 otherwise, and a
 * calibration observation at the level its response names, under the key the response spells (`calibration response <key> <level>`).
 *
 * `--labels <pattern>` is the run-label pattern an observation's ID starts with (`RUN_LABELS` of `cli/lib/evaluate/records.js`, the one
 * place those forms are written); the case that runs this file passes it, because the file is copied into an evaluation folder and
 * cannot require the package.
 *
 * `--log <file>` appends the stdin it received, as one JSON line `{ "stdin": "<the bytes read>" }`, so a case reads the real stdin of a
 * real run.
 */

'use strict';

const fs = require('node:fs');

const argv = process.argv.slice(2);
const flag = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null);
const stdin = fs.readFileSync(0, 'utf8');
const input = JSON.parse(stdin);
const log = flag('--log');
if (log !== null) fs.appendFileSync(log, `${JSON.stringify({ stdin })}\n`);

const RUN_LABELLED = new RegExp(`^${flag('--labels')}-(.+)$`);
const text = (body) => (body?.kind === 'text' ? body.value : '');
const rubric = argv.includes('--rubric');
const rows = [];
const calibration = input.observations.find((observation) => observation.observationId === 'calibration');
if (calibration !== undefined) {
  const [, key, level] = /calibration response (\S+) ([0-9])/.exec(text(calibration.stdout)) ?? [];
  rows.push({ key, outcome: 'score', score: Number(level), observationIds: ['calibration'] });
} else {
  for (const observation of input.observations) {
    const step = RUN_LABELLED.exec(observation.observationId)?.[1];
    if (step === undefined) continue;
    const accepted = text(observation.stdout).includes('verdict: accepted');
    const cite = [observation.observationId];
    rows.push(
      accepted
        ? { key: `accepted:${step}`, outcome: 'pass', observationIds: cite, comment: 'The step says verdict: accepted.' }
        : {
            key: `accepted:${step}`,
            outcome: 'fail',
            observationIds: cite,
            quote: 'verdict: rejected',
            quoteChannel: 'stdout',
            confidence: 0.9,
            comment: 'The step rejected the request it had to accept.',
          },
    );
    if (rubric) rows.push({ key: `score:${step}`, outcome: 'score', score: accepted ? 1 : 0, observationIds: cite });
  }
}
process.stdout.write(`${JSON.stringify({ rows })}\n`);
