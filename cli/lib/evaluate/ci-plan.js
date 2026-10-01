/**
 * The CI plan of an evaluation, `ci/evaluation-ci-plan.json`: its schema, its placement rules and the
 * enforcement table `tea-evaluate ci` applies (AD-10, AD-11, CAP-11).
 *
 * The plan is the only definition of tier membership. This file reads it, validates it against the runtime-owned
 * schema (`schemas/evaluation-ci-plan.schema.json`) and holds the placement rules, so `tea-evaluate ci` and
 * `tea-evaluate check` report the same findings:
 *
 *   - `schema`: a violation of the schema, an unknown `evaluate` check id included;
 *   - `tier`: a check whose `tier` and `placement.tier` disagree, so the plan would name two tiers for one check;
 *   - `duplicate`: two checks with one id on one tier;
 *   - `command`: an `evaluate` command not led by `tea-evaluate`, or a `gate` command not led by
 *     `eval-quality-gates`;
 *   - `placement-default`: a `defaultTier` AD-10's default table does not give the check;
 *   - `placement-reason`: a check placed off its `defaultTier` with no `reason`, so the repository inspection
 *     that moved it is not on record;
 *   - `deterministic-off-pr` (CAP-11): a deterministic check that needs no secret placed off `pr`; every such check
 *     runs on every pull request;
 *   - `live-on-pr` (AD-20): a check that drives a live target placed on `pr`, which needs no secret and calls no model;
 *   - `enforcement`: `enforcement: "warn"` on a check or tier where AD-10 gives no warn (`WARN_ALLOWED`). The
 *     field records AD-10's class and the action comes from AD-10's table, so a plan cannot demote a blocking exit.
 *
 * Which exits belong to which class is AD-10's table, kept here as `ENFORCEMENT_TABLE`, and `classify` reads it.
 * No verdict is computed from evidence here: a class is looked up by the exit a stage already gave.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const AjvModule = require('ajv/dist/2020');

const Ajv = AjvModule.default ?? AjvModule;

const PLAN_PATH = 'ci/evaluation-ci-plan.json';
const PLAN_SCHEMA = JSON.parse(fs.readFileSync(path.join(__dirname, 'schemas', 'evaluation-ci-plan.schema.json'), 'utf8'));
/** The plan's `schemaVersion`, read from its schema so the two cannot disagree. */
const PLAN_SCHEMA_VERSION = PLAN_SCHEMA.properties.schemaVersion.const;

const TIERS = ['pr', 'merge', 'scheduled', 'release'];

/** The deterministic checks that need no secret: AD-10's `pr` members. */
const DETERMINISTIC_CHECKS = ['check', 'compile', 'seal', 'api-conformance', 'gameability', 'oracle-agreement', 'replay'];
/** The checks that drive a live target or compare live results: never on `pr` (AD-20). */
const LIVE_CHECKS = ['preflight-live', 'twin-run', 'held-out', 'judge-calibration', 'strength-comparison'];

/**
 * AD-10's default table: for each `evaluate` check id, the tiers a plan may name as its `defaultTier`. A live
 * preflight defaults to `merge` when the target needs no secret and to `scheduled` and `release` otherwise; the
 * rest of the live set defaults to `scheduled` and, as the release gate, to `release`.
 */
const DEFAULT_TIERS = Object.freeze(
  Object.fromEntries([
    // The stage names are strings: `test:evaluate-boundaries` keeps them out of identifiers anywhere under `cli/`.
    ['check', ['pr']],
    ['compile', ['pr']],
    ['seal', ['pr']],
    ['api-conformance', ['pr']],
    ['gameability', ['pr']],
    ['oracle-agreement', ['pr']],
    ['replay', ['pr']],
    ['preflight-live', ['merge', 'scheduled', 'release']],
    ['twin-run', ['scheduled', 'release']],
    ['held-out', ['scheduled', 'release']],
    ['judge-calibration', ['scheduled', 'release']],
    ['strength-comparison', ['scheduled', 'release']],
  ]),
);

/**
 * Where AD-10 says a check's failing result is a warning, so where a plan may record `enforcement: "warn"`: a strength
 * regression against the baseline is a warning (`strength-comparison`), and the strength floor warns on `scheduled`
 * (the checks that apply it, `twin-run` and `held-out`). Every other check blocks, whatever it records.
 */
const WARN_ALLOWED = Object.freeze({
  'strength-comparison': ['scheduled', 'release'],
  'twin-run': ['scheduled'],
  'held-out': ['scheduled'],
});

/** The tiers a `gate` check defaults to: a repository-policy gate is deterministic and needs no secret. */
const GATE_DEFAULT_TIERS = ['pr'];

const COMMAND_LEADS = Object.freeze({ evaluate: 'tea-evaluate', gate: 'eval-quality-gates' });

/**
 * AD-10's enforcement table: the class of each exit by the source that gives it. `ci` looks a class up by the exit
 * a stage gave and never rewrites the exit. `action` is what the pipeline does with it.
 */
const ENFORCEMENT_TABLE = Object.freeze([
  { exit: 0, source: 'eval-quality', class: 'pass', action: 'pass' },
  { exit: 2, source: 'eval-quality', class: 'target behavior failure', action: 'block' },
  { exit: 3, source: 'eval-quality', class: 'infrastructure or integrity', action: 'block' },
  { exit: 4, source: 'eval-quality', class: 'contract authoring defect', action: 'block' },
  { exit: 5, source: 'eval-quality', class: 'runtime fault', action: 'block' },
  { exit: 10, source: 'tea-evaluate', class: 'authoring defect', action: 'block' },
  { exit: 11, source: 'tea-evaluate', class: 'evaluation weakness', action: 'block' },
  { exit: 12, source: 'tea-evaluate', class: 'infrastructure', action: 'block' },
  { exit: 13, source: 'tea-evaluate', class: 'evaluation evidence drift', action: 'block' },
  { exit: 64, source: 'tea-evaluate', class: 'wiring defect', action: 'block' },
  { exit: 64, source: 'eval-quality', class: 'wiring defect', action: 'block' },
  { exit: 1, source: 'eval-quality-gates', class: 'repository policy violation', action: 'block' },
  { exit: 64, source: 'eval-quality-gates', class: 'wiring defect', action: 'block' },
]);

/** The class of an exit no row of the table names, such as a gate's own crash. It blocks like every other non-zero exit. */
const UNDOCUMENTED = Object.freeze({ class: 'undocumented exit', action: 'block' });

/**
 * The final exit of a tier is the most severe blocking exit among its checks, in this order (a coordinator decision,
 * recorded in AD-10): infrastructure (12) outranks an engine fault because the run cannot be trusted, drift (13)
 * outranks weakness (11) and authoring (10), and a policy violation (1) is lowest. An exit outside the list ranks
 * after 1 and before success.
 */
const SEVERITY = Object.freeze([64, 12, 5, 4, 3, 13, 11, 10, 2, 1]);

/** The sources a check's exit may come from, by kind: an evaluate check passes engine and `tea-evaluate` exits, a gate its own. */
const SOURCES = Object.freeze({
  evaluate: ['eval-quality', 'tea-evaluate'],
  gate: ['eval-quality-gates'],
});

/**
 * The AD-10 class and action of `exit` for a check of `kind`.
 *
 * @param {'evaluate'|'gate'} kind
 * @param {number} exit
 * @param {string} [source] the tool that gave the exit when it is not the one the kind runs: `tea-evaluate` for an
 *   exit the runtime made itself (a gate that could not start, ran past its timeout or printed past its bound)
 * @returns {{ class: string, action: 'pass'|'block' }}
 */
function classify(kind, exit, source) {
  // Success is success whichever tool gave it: AD-10's pass row names the engine, and a gate's pass is the same row.
  if (exit === 0) return { class: 'pass', action: 'pass' };
  const sources = source === undefined ? SOURCES[kind] : [source];
  const row = ENFORCEMENT_TABLE.find((entry) => entry.exit === exit && sources.includes(entry.source));
  return row === undefined ? UNDOCUMENTED : { class: row.class, action: row.action };
}

/** The most severe of `exits` by `SEVERITY`; 0 when none blocks. An exit outside the list outranks only success. */
function mostSevere(exits) {
  const blocking = exits.filter((exit) => exit !== 0);
  if (blocking.length === 0) return 0;
  const rank = (exit) => {
    const at = SEVERITY.indexOf(exit);
    return at === -1 ? SEVERITY.length : at;
  };
  return blocking.reduce((worst, exit) => (rank(exit) < rank(worst) ? exit : worst));
}

const ajv = new Ajv({ strict: false, allErrors: true });
const validatePlan = ajv.compile(PLAN_SCHEMA);

function finding(rule, message) {
  return { file: PLAN_PATH, rule, message };
}

/** The placement rules over a plan that already meets the schema. */
function placementFindings(plan) {
  const findings = [];
  const seen = new Set();
  for (const [index, entry] of plan.checks.entries()) {
    const label = `checks[${index}] (${entry.kind} ${JSON.stringify(entry.id)} on ${entry.placement.tier})`;
    const key = `${entry.id}:${entry.placement.tier}`;
    if (seen.has(key))
      findings.push(finding('duplicate', `${label} repeats a check of the same id on the same tier; give each tier one entry`));
    seen.add(key);
    if (entry.tier !== entry.placement.tier) {
      findings.push(
        finding(
          'tier',
          `${label} names tier ${entry.tier} and placement.tier ${entry.placement.tier}; a check sits on one tier, so make them agree`,
        ),
      );
    }
    const lead = COMMAND_LEADS[entry.kind];
    if (entry.command[0] !== lead) {
      findings.push(
        finding('command', `${label} is led by ${JSON.stringify(entry.command[0])}; a ${entry.kind} check's command is led by ${lead}`),
      );
    }
    const defaults = entry.kind === 'evaluate' ? DEFAULT_TIERS[entry.id] : GATE_DEFAULT_TIERS;
    if (defaults !== undefined && !defaults.includes(entry.placement.defaultTier)) {
      findings.push(
        finding(
          'placement-default',
          `${label} names defaultTier ${entry.placement.defaultTier}; AD-10's default table gives ${entry.id} ${defaults.join(', ')}`,
        ),
      );
    }
    const reason = typeof entry.placement.reason === 'string' ? entry.placement.reason.trim() : '';
    if (entry.placement.tier !== entry.placement.defaultTier && reason === '') {
      findings.push(
        finding(
          'placement-reason',
          `${label} moves the check off its default tier ${entry.placement.defaultTier} and records no reason; name what the repository inspection found`,
        ),
      );
    }
    if (entry.enforcement === 'warn' && !(entry.kind === 'evaluate' && WARN_ALLOWED[entry.id]?.includes(entry.placement.tier))) {
      findings.push(
        finding(
          'enforcement',
          `${label} records enforcement warn, and AD-10 gives no warn to ${entry.kind === 'gate' ? 'a gate' : `${entry.id} on ${entry.placement.tier}`}; the action comes from AD-10's table, so record block`,
        ),
      );
    }
    const deterministic = entry.kind === 'gate' || DETERMINISTIC_CHECKS.includes(entry.id);
    if (deterministic && entry.placement.tier !== 'pr') {
      findings.push(
        finding(
          'deterministic-off-pr',
          `${label} is deterministic and needs no secret, so it runs on every pull request (CAP-11); place it on pr`,
        ),
      );
    }
    if (entry.kind === 'evaluate' && LIVE_CHECKS.includes(entry.id) && entry.placement.tier === 'pr') {
      findings.push(
        finding(
          'live-on-pr',
          `${label} drives a live target, and the pr tier needs no secret and calls no model (AD-20); place it on merge, scheduled or release`,
        ),
      );
    }
  }
  return findings;
}

/**
 * The findings of a parsed plan: schema violations, and only when there are none, the placement rules.
 *
 * @param {unknown} plan
 * @returns {Array<{ file: string, rule: string, message: string }>}
 */
function planFindings(plan) {
  if (!validatePlan(plan)) {
    return [...new Set(validatePlan.errors.map((error) => `${error.instancePath || '/'} ${error.message}`))].map((message) =>
      finding('schema', message),
    );
  }
  return placementFindings(plan);
}

/**
 * Reads the plan of an evaluation folder.
 *
 * @param {string} folder
 * @returns {{ absent: true, path: string } | { absent?: false, plan?: object, findings: Array<{ file: string, rule: string, message: string }> }}
 */
function readPlan(folder) {
  const file = path.join(folder, ...PLAN_PATH.split('/'));
  let text;
  try {
    // The plan's directory is held to `lstat` as well: a link there is followed by every plain read of the file below it.
    if (!fs.lstatSync(path.dirname(file)).isDirectory())
      return {
        findings: [finding('schema', `${path.posix.dirname(PLAN_PATH)} is a link or a file where the plan's directory is required`)],
      };
    if (!fs.lstatSync(file).isFile()) return { findings: [finding('schema', `${PLAN_PATH} is not a regular file`)] };
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return { absent: true, path: file };
    return { findings: [finding('schema', `${PLAN_PATH} cannot be read: ${error.code ?? error.message}`)] };
  }
  let plan;
  try {
    plan = JSON.parse(text);
  } catch (error) {
    return { findings: [finding('json', `${PLAN_PATH} cannot be read as JSON: ${error.message}`)] };
  }
  const findings = planFindings(plan);
  return findings.length === 0 ? { plan, findings } : { findings };
}

module.exports = {
  DEFAULT_TIERS,
  DETERMINISTIC_CHECKS,
  ENFORCEMENT_TABLE,
  GATE_DEFAULT_TIERS,
  LIVE_CHECKS,
  PLAN_PATH,
  PLAN_SCHEMA,
  PLAN_SCHEMA_VERSION,
  SEVERITY,
  TIERS,
  WARN_ALLOWED,
  classify,
  mostSevere,
  planFindings,
  readPlan,
};
