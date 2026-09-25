#!/usr/bin/env node
/**
 * A stand-in rubric judge for `tea-evaluate run` (Story 1.9), run through the
 * `custom` agent adapter: `judge.agentCommand` is Node and `judge.agentArgs`
 * starts with this file's path.
 *
 * It reads the whole prompt from standard input, appends one line to the file
 * `--log` names for every call (so a test counts the calls), appends every
 * prompt it receives as one JSON string per line to the file `--capture`
 * names when given, and replies with every criterion the prompt lists scored
 * at its rubric's highest level. `--mode` changes the reply:
 *
 *   fail        print a line to each stream and exit 1, a judge that cannot answer
 *   off-scale   score every criterion one above its highest level
 *   garbage     reply with text that is not JSON
 */

'use strict';

const fs = require('node:fs');

const HEADING = 'Rubrics and evidence (JSON):';

const argv = process.argv.slice(2);
const option = (name) => {
  const at = argv.indexOf(name);
  return at === -1 ? undefined : argv[at + 1];
};

const prompt = fs.readFileSync(0, 'utf8');
if (option('--log') !== undefined) fs.appendFileSync(option('--log'), 'judged\n');
if (option('--capture') !== undefined) fs.appendFileSync(option('--capture'), `${JSON.stringify(prompt)}\n`);
const mode = option('--mode') ?? 'score';
if (mode === 'fail') {
  process.stdout.write('stub judge: no scores this time\n');
  process.stderr.write('stub judge: asked to fail\n');
  process.exit(1);
}
if (mode === 'garbage') {
  process.stdout.write('I would rather not say.\n');
  process.exit(0);
}
const material = JSON.parse(prompt.slice(prompt.indexOf(HEADING) + HEADING.length));
const scores = material.rubrics.flatMap((rubric) => {
  const top = Math.max(...rubric.scaleLevels.map((level) => level.level));
  return rubric.criteria.map((criterion) => ({
    rubricId: rubric.rubricId,
    criterionId: criterion.criterionId,
    score: mode === 'off-scale' ? top + 1 : top,
    note: `the evidence meets the top anchor: ${typeof criterion.evidence === 'string' ? criterion.evidence.split('\n').at(-2) : 'structured'}`,
  }));
});
process.stdout.write(`${JSON.stringify({ scores })}\n`);
