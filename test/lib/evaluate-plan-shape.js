'use strict';

/**
 * The shape every entry of an Evaluate CI plan keeps, written out independently of the plan template so a template that
 * drifts fails against it: the trigger of its tier, a command that runs its check (`check`, `preflight`, or `ci` with the
 * entry's own tier), the evidence its check leaves, and `warn` exactly where the runtime allows it. The folder of
 * `--evaluation` is the one thing left free.
 */

const { WARN_ALLOWED } = require('../../cli/lib/evaluate/ci-plan');

const TRIGGER_OF = Object.freeze({
  pr: ['pull-request'],
  merge: ['merge'],
  scheduled: ['schedule', 'manual-dispatch'],
  release: ['release'],
});

/** The evidence paths a check leaves, by id; every other check leaves its stdout under its own id. */
const EVIDENCE_OF = Object.freeze({
  compile: ['runs/<invocationId>/checks/compile/eval-contract.json'],
  seal: ['runs/<invocationId>/checks/seal/sealed-evaluator-brief.json'],
  gameability: ['runs/<invocationId>/replay/scores'],
  'oracle-agreement': ['baseline/scores'],
  replay: ['runs/<invocationId>/replay/preflight-verdict.json', 'runs/<invocationId>/replay/scores'],
});

/** The problems of one plan entry, each naming `label`. */
function planEntryShapeProblems(entry, label) {
  const problems = [];
  const tier = entry.placement?.tier;
  const where = `${label} ${entry.id} on ${tier}`;
  if (JSON.stringify(entry.trigger) !== JSON.stringify(TRIGGER_OF[tier])) problems.push(`${where} has the wrong trigger`);
  const command = entry.command ?? [];
  const folder = command[3];
  const lead = entry.kind === 'gate' ? [] : ['tea-evaluate'];
  if (entry.kind === 'evaluate') {
    const expected =
      entry.id === 'check'
        ? [...lead, 'check', '--evaluation', folder]
        : entry.id === 'preflight-live'
          ? [...lead, 'preflight', '--evaluation', folder]
          : [...lead, 'ci', '--evaluation', folder, '--tier', tier];
    if (typeof folder !== 'string' || folder === '' || JSON.stringify(command) !== JSON.stringify(expected))
      problems.push(`${where} runs ${JSON.stringify(command)}, expected ${JSON.stringify(expected)}`);
  }
  const evidence = EVIDENCE_OF[entry.id] ?? [`runs/<invocationId>/checks/${entry.id}/stdout`];
  if (JSON.stringify(entry.evidence) !== JSON.stringify(evidence))
    problems.push(`${where} leaves evidence ${JSON.stringify(entry.evidence)}, expected ${JSON.stringify(evidence)}`);
  const warns = entry.kind === 'evaluate' && WARN_ALLOWED[entry.id]?.includes(tier);
  if (entry.enforcement !== (warns ? 'warn' : 'block')) problems.push(`${where} records enforcement ${entry.enforcement}`);
  return problems;
}

module.exports = { EVIDENCE_OF, TRIGGER_OF, planEntryShapeProblems };
