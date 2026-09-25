#!/usr/bin/env node
/**
 * A stand-in rubric judge for `tea-evaluate run` (Story 1.9), run through the
 * `custom` agent adapter: `judge.agentCommand` is Node and `judge.agentArgs`
 * starts with this file's path.
 *
 * It reads the whole prompt from standard input, appends one line to the file
 * `--log` names for every call (so a test counts the calls), appends every
 * prompt it receives as one JSON string per line to the file `--capture`
 * names, appends `{ cwd, entries }` (its working directory and what that
 * directory held when it started) to the file `--cwd-log` names, and replies
 * with every criterion the prompt lists scored at its rubric's highest level,
 * inside the one `<judge-answer nonce="...">` block the prompt's answer line
 * names, the nonce read from that line. `--mode` changes what it does:
 *
 *   fail        print a line to each stream and exit 1, a judge that cannot answer
 *   off-scale   score every criterion one above its highest level
 *   garbage     reply with text that is not JSON
 *   echo        print each criterion's evidence, as a judge quoting it would,
 *               then its answer
 *   quote       print each criterion's evidence and give no answer of its own
 *   untagged    reply with the scores object bare, in no answer block
 *   wrong-nonce reply in an answer block carrying another nonce
 *   two-blocks  reply with two answer blocks carrying this call's nonce
 *   write       write a file into its working directory, then answer
 *   hang        wait a minute before answering, past any short timeoutMs
 *   sleep       write its pid to the file `--pid` names (a temp file renamed
 *               into place, so a reader never sees it empty), wait 5 s, then
 *               answer (a case that signals the run while the judge runs)
 */

'use strict';

const fs = require('node:fs');

const HEADING = 'Rubrics and evidence (JSON):';

const argv = process.argv.slice(2);
const option = (name) => {
  const at = argv.indexOf(name);
  return at === -1 ? undefined : argv[at + 1];
};
const wait = (milliseconds) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);

const prompt = fs.readFileSync(0, 'utf8');
if (option('--log') !== undefined) fs.appendFileSync(option('--log'), 'judged\n');
if (option('--capture') !== undefined) fs.appendFileSync(option('--capture'), `${JSON.stringify(prompt)}\n`);
if (option('--cwd-log') !== undefined) {
  fs.appendFileSync(option('--cwd-log'), `${JSON.stringify({ cwd: process.cwd(), entries: fs.readdirSync('.') })}\n`);
}
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
if (mode === 'write') fs.writeFileSync('scratch.txt', 'a judge that writes\n');
if (mode === 'hang') wait(60_000);
if (mode === 'sleep') {
  fs.writeFileSync(`${option('--pid')}.partial`, String(process.pid));
  fs.renameSync(`${option('--pid')}.partial`, option('--pid'));
  wait(5000);
}
const material = JSON.parse(prompt.slice(prompt.indexOf(HEADING) + HEADING.length));
if (mode === 'echo' || mode === 'quote') {
  for (const rubric of material.rubrics) {
    for (const criterion of rubric.criteria) process.stdout.write(`The evidence reads:\n${criterion.evidence}\n`);
  }
  if (mode === 'quote') {
    process.stdout.write('I will not score this.\n');
    process.exit(0);
  }
}
const nonce = /Answer block for this call: .*?<judge-answer nonce="([0-9a-f]+)">/.exec(prompt)?.[1] ?? '';
const scores = material.rubrics.flatMap((rubric) => {
  const top = Math.max(...rubric.scaleLevels.map((level) => level.level));
  return rubric.criteria.map((criterion) => ({
    rubricId: rubric.rubricId,
    criterionId: criterion.criterionId,
    score: mode === 'off-scale' ? top + 1 : top,
    note: `the evidence meets the top anchor: ${typeof criterion.evidence === 'string' ? criterion.evidence.split('\n').at(-2) : 'structured'}`,
  }));
});
const answer = JSON.stringify({ scores });
const block = (value) => `<judge-answer nonce="${value}">${answer}</judge-answer>\n`;
if (mode === 'untagged') process.stdout.write(`${answer}\n`);
else if (mode === 'wrong-nonce') process.stdout.write(block('0'.repeat(32)));
else if (mode === 'two-blocks') process.stdout.write(`${block(nonce)}${block(nonce)}`);
else process.stdout.write(block(nonce));
