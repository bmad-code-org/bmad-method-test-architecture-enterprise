'use strict';

/**
 * `node test/test-docs-tutorial.js`: the commands of `docs/tutorials/evaluate-your-first-skill.md`, run for real.
 *
 * The check copies nothing by hand. It parses the page (`test/lib/docs-tutorial.js` says which markup it reads), runs every
 * `bash` block in page order in one shell session from the repository root, and holds each block to its exit and to the key
 * lines of the `text` block under it. The page's blocks copy the tutorial fixture to a scratch directory, so the run writes
 * `runs/` and `baseline/` there and leaves the checkout untouched. Every `tea-evaluate` command is `node cli/evaluate.js` over
 * the installed eval-quality, with no secret and no model call, so the environment of the session carries no credential.
 *
 * It fails when:
 *
 *  * a command of the page exits non-zero, or a key line the page shows is missing from that command's output,
 *  * the page leaves out a command of the walkthrough (`check`, `digest`, `preflight`, `run`, `score`, `compare`,
 *    `compare --accept`, `ci --tier pr`) or runs a bare `tea-evaluate` that no checkout provides,
 *  * the page quotes `SKILL.md`, `requirements.md` or the registry entry of `evaluation.json` in a form the fixture no longer holds,
 *  * a command that runs the evaluation shows no key lines.
 *
 * Revert cases run in this file: a flag changed in a command, a subcommand misspelled, a key line changed, a key line the
 * output lacks, a key block relabelled or emptied, a page that drops the `ci` command, a page with no command, and a quoted
 * file or registry entry edited. Each must make the check fail.
 *
 * The run shares `/tmp/tea-evaluate-p<uid>` with every other Evaluate suite, so it must not run beside one.
 */

const fs = require('node:fs');

const { scratchDirectories } = require('./lib/scratch-directories');
const { TUTORIAL, missingLines, pageProblems, quotedFileProblems, runProblems, runSteps, tutorialSteps } = require('./lib/docs-tutorial');

/**
 * The environment of the session: the caller's, less git's own variables, the engine override and every credential-looking
 * variable, so a command that began to call a model or a service finds no credential and fails.
 */
const BASE_ENV = Object.fromEntries(
  Object.entries(process.env).filter(
    ([name]) => !name.startsWith('GIT_') && name !== 'TEA_EVALUATE_ENGINE_CLI' && !/KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(name),
  ),
);

const failures = [];
let checks = 0;

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

/** Replaces the first occurrence of `from` in `text` with `to`, and fails the check itself when `from` is absent. */
function edited(text, from, to) {
  if (!text.includes(from)) throw new Error(`the revert case edits ${JSON.stringify(from)}, which the page does not hold`);
  return text.replace(from, to);
}

/** The steps of `markdown` up to and including the first one whose command holds `marker`. */
function stepsThrough(markdown, marker) {
  const steps = tutorialSteps(markdown);
  const last = steps.findIndex((step) => step.command.includes(marker));
  if (last === -1) throw new Error(`no step of the page holds ${JSON.stringify(marker)}`);
  return steps.slice(0, last + 1);
}

function main() {
  const page = fs.readFileSync(TUTORIAL, 'utf8');
  const steps = tutorialSteps(page);
  const scratch = scratchDirectories('tea-docs-tutorial');
  try {
    const env = { ...BASE_ENV, TMPDIR: scratch.make('session') };
    const shape = [...pageProblems(steps), ...quotedFileProblems(page)];
    for (const problem of shape) check(false, problem);
    check(
      steps.some((step) => step.expected !== null),
      'no step of the page shows key lines',
    );

    const started = Date.now();
    const real = runSteps(steps, { env });
    if (real.error) check(false, `the session could not run: ${real.error.message}`);
    const problems = runProblems(steps, real.outputs);
    for (const problem of problems) check(false, problem);
    check(problems.length === 0 && shape.length === 0, 'the page runs clean');
    const seconds = ((Date.now() - started) / 1000).toFixed(1);

    // Revert cases. Each edits the page text and must produce a problem; the ones that run a command run only the steps up to it.
    const reverts = [
      {
        name: 'a flag changed in the check command',
        run: () => {
          const text = edited(page, 'check --evaluation "$PROJECT/evaluation"', 'check --evalution "$PROJECT/evaluation"');
          const through = stepsThrough(text, 'evalution');
          return runProblems(through, runSteps(through, { env: { ...BASE_ENV, TMPDIR: scratch.make('revert-flag') } }).outputs);
        },
      },
      {
        name: 'a subcommand misspelled',
        run: () => {
          const text = edited(page, 'node cli/evaluate.js check', 'node cli/evaluate.js chek');
          const through = stepsThrough(text, 'evaluate.js chek');
          return runProblems(through, runSteps(through, { env: { ...BASE_ENV, TMPDIR: scratch.make('revert-subcommand') } }).outputs);
        },
      },
      {
        name: 'a key line changed',
        run: () => {
          const text = edited(page, 'has no authoring defects', 'has no authoring problems');
          const changed = tutorialSteps(text);
          return runProblems(changed, real.outputs);
        },
      },
      {
        name: 'a key line absent from the output',
        run: () => {
          const text = edited(page, 'check: exit 0 (pass), pass', 'check: exit 0 (pass), pass\nreplay-twice: exit 0 (pass), pass');
          return runProblems(tutorialSteps(text), real.outputs);
        },
      },
      {
        name: 'a page that drops the ci command',
        run: () =>
          pageProblems(tutorialSteps(edited(page, 'node cli/evaluate.js ci --evaluation "$PROJECT/evaluation" --tier pr', 'echo skipped'))),
      },
      {
        name: 'a key block relabelled so the parser no longer reads it',
        run: () => pageProblems(tutorialSteps(edited(page, '```text\ntea-evaluate score: P-001', '```console\ntea-evaluate score: P-001'))),
      },
      {
        name: 'a key block emptied of its lines',
        run: () =>
          pageProblems(tutorialSteps(edited(page, '```text\ntea-evaluate check: … has no authoring defects\n```', '```text\n```'))),
      },
      {
        name: 'the registry entry quoted with another target',
        run: () => quotedFileProblems(edited(page, '"target": "node_modules/.bin/tea-skill-runner"', '"target": "tea-skill-runner"')),
      },
      { name: 'a page with no command', run: () => pageProblems(tutorialSteps('# A page\n\nNo block.\n')) },
      {
        name: 'a page that runs a bare tea-evaluate',
        run: () => pageProblems(tutorialSteps(edited(page, 'node cli/evaluate.js digest', 'tea-evaluate digest'))),
      },
      {
        name: 'a quoted file edited',
        run: () =>
          quotedFileProblems(
            edited(
              page,
              'Approve a refund when its amount is at or below the limit.',
              'Approve a refund when its amount is below the limit.',
            ),
          ),
      },
      {
        name: 'a wildcard line that no longer matches',
        run: () => missingLines('tea-evaluate check: /tmp/x has no authoring defects', ['tea-evaluate check: … has no authoring problems']),
      },
    ];
    for (const revert of reverts) {
      const found = revert.run();
      check(found.length > 0, `revert case "${revert.name}" produced no problem, so the check would pass over it`);
    }

    if (failures.length > 0) {
      console.error(failures.map((failure) => `test-docs-tutorial: ${failure}`).join('\n'));
      return 1;
    }
    const lines = steps.reduce((sum, step) => sum + (step.expected?.length ?? 0), 0);
    console.log(
      `ok docs-tutorial: ${steps.length} commands of docs/tutorials/evaluate-your-first-skill.md ran, ${lines} key lines held, ${reverts.length} revert cases failed as they must (${checks} checks, ${seconds}s)`,
    );
    return 0;
  } finally {
    scratch.removeAll();
  }
}

process.exitCode = main();
