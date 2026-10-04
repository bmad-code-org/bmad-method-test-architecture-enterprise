#!/usr/bin/env node
/**
 * A stub `command` evaluator for the partition-plan fixture (Story 1.107): it reads `{ sealedBrief, observations }` on stdin and
 * prints one judgment row per observation of the plan, for the key the mapping binds to that step's oracle:
 *
 *   accepted:shared-run       O-001 over the shared step
 *   accepted:development-run  O-002 over the development-only step
 *   accepted:held-out-run     O-101 over the held-out step
 *
 * A row is `pass` when the step's stdout says `verdict: accepted` and `fail` otherwise, quoting `verdict: rejected`. It answers only
 * for the steps it is handed, so a partition's evaluator input decides which keys it prints. With `--rubric` it also scores each
 * observation's rubric criterion (`score:RC-001` over the development-only step, `score:RC-002` over the shared one, `score:RC-101`
 * over the held-out one) at level 1 when the step was accepted and 0 otherwise, and a calibration observation at the level its
 * response names.
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

const STEPS = [
  ['shared-run', 'accepted:shared-run', 'RC-002'],
  ['development-run', 'accepted:development-run', 'RC-001'],
  ['held-out-run', 'accepted:held-out-run', 'RC-101'],
];
const text = (body) => (body?.kind === 'text' ? body.value : '');
const rubric = argv.includes('--rubric');
const rows = [];
const calibration = input.observations.find((observation) => observation.observationId === 'calibration');
if (calibration !== undefined) {
  const [, criterionId, level] = /calibration response (RC-[0-9]+) ([0-9])/.exec(text(calibration.stdout)) ?? [];
  rows.push({ key: `score:${criterionId}`, outcome: 'score', score: Number(level), observationIds: ['calibration'] });
} else {
  for (const observation of input.observations) {
    const step = STEPS.find(([stepId]) => observation.observationId.endsWith(`-${stepId}`));
    if (step === undefined) continue;
    const accepted = text(observation.stdout).includes('verdict: accepted');
    const cite = [observation.observationId];
    rows.push(
      accepted
        ? { key: step[1], outcome: 'pass', observationIds: cite, comment: 'The step says verdict: accepted.' }
        : {
            key: step[1],
            outcome: 'fail',
            observationIds: cite,
            quote: 'verdict: rejected',
            quoteChannel: 'stdout',
            confidence: 0.9,
            comment: 'The step rejected the request it had to accept.',
          },
    );
    if (rubric) rows.push({ key: `score:${step[2]}`, outcome: 'score', score: accepted ? 1 : 0, observationIds: cite });
  }
}
process.stdout.write(`${JSON.stringify({ rows })}\n`);
