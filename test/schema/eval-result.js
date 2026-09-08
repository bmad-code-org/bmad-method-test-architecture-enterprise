/**
 * Zod schema for the machine-readable eval result written by `--json <path>`.
 *
 * The record exists so a later run can be compared with an earlier one and the
 * comparison can be trusted. That needs every input that moves a score to be
 * named in the file: the commit, the fixtures and prompt by digest, the runner
 * executable and its version, the resolved model, the declared thresholds, and
 * how many of the declared repetitions actually completed. A number without
 * those is a number nobody can reproduce.
 *
 * `failureClass` carries the reason a run ended the way it did, and the exit
 * code is derived from it rather than chosen separately. An authentication
 * error, a timeout, a transport error, an unparseable reply, and a missing
 * artifact are environment failures: nothing was measured, so they exit 2 and
 * must never be reported as a lower score.
 *
 * test/schema/eval-result.schema.json is generated from this file by
 * tools/validate-eval-schemas.js and checked for drift on every `npm test`.
 */

'use strict';

const { z } = require('zod');
const { EVAL_TYPES, CI_TIERS, RUNNER_CAPABILITIES } = require('./suite-manifest');

// 1.1.0 replaced the suite record's single `contract` path and its lone
// `contractVersion` with a `contracts` list, because a suite can be expressed as
// more than one contract: fragment-selection is one suite across eight workflows.
const SCHEMA_VERSION = '1.1.0';

/**
 * Failure classes in ascending severity. `worstFailureClass` picks the highest
 * index, so the order is the policy: an environment failure always outranks a
 * measured quality failure, because a run that could not measure has nothing to
 * say about quality.
 */
const FAILURE_CLASSES = [
  'none',
  'quality',
  'environment-incomplete-repetitions',
  'environment-parser',
  'environment-missing-artifact',
  'environment-timeout',
  'environment-transport',
  'environment-authentication',
  'environment-configuration',
];

// live spends model calls; the other two validate data or readiness and measure
// nothing, so a record from those modes must never read as a passing gate.
const RUN_MODES = ['live', 'validate-only', 'preflight-only'];

const digestString = z.string().regex(/^sha256:[\da-f]{64}$/, 'digest must be "sha256:" followed by 64 lowercase hex characters');

const nonEmptyString = z.string().min(1);
const nonNegativeInteger = z.number().int().nonnegative();

const usageSchema = z
  .object({
    inputTokens: nonNegativeInteger.nullable(),
    outputTokens: nonNegativeInteger.nullable(),
    totalTokens: nonNegativeInteger.nullable(),
    costUsd: z.number().nonnegative().nullable(),
  })
  .strict();

const repositorySchema = z
  .object({
    // Null when the harness runs outside a git checkout. Naming the absence
    // beats emitting a placeholder that reads like a real commit.
    commit: z.string().nullable(),
    dirty: z.boolean(),
  })
  .strict();

const runnerParametersSchema = z
  .object({
    // Redacted before it reaches this field: a passthrough argument can carry a
    // key, and a result file is an artifact that gets uploaded.
    agentArgs: z.array(z.string()),
    // Names only. The values stay in the environment.
    envPassNames: z.array(z.string()),
    timeoutMs: z.number().int().positive(),
    promptTransport: z.enum(['stdin', 'argv']),
  })
  .strict();

const runnerResultSchema = z
  .object({
    agent: nonEmptyString,
    executable: nonEmptyString,
    // Whatever `<executable> --version` printed. Null when the probe failed.
    version: z.string().nullable(),
    model: z.string().nullable(),
    parameters: runnerParametersSchema,
    repetitions: z
      .object({ expected: nonNegativeInteger, completed: nonNegativeInteger })
      .strict()
      .refine((value) => value.completed <= value.expected, { message: 'completed repetitions cannot exceed the expected count' }),
    // Null is an unmeasurable metric, which is a failure rather than a pass.
    measurements: z.record(z.number().nullable()),
    durationMs: nonNegativeInteger,
    usage: usageSchema.nullable(),
    failureClass: z.enum(FAILURE_CLASSES),
    failures: z.array(z.string()),
  })
  .strict();

// One entry per eval contract the suite is expressed as. `version` is the
// contract's own revision once something reads one; null says nothing has.
const suiteContractSchema = z.object({ path: nonEmptyString, version: z.string().nullable() }).strict();

const suiteResultSchema = z
  .object({
    id: nonEmptyString,
    evalType: z.enum(EVAL_TYPES),
    skills: z.array(nonEmptyString).min(1),
    contracts: z.array(suiteContractSchema),
    ciTier: z.enum(CI_TIERS),
    runnerCapabilities: z.array(z.enum(RUNNER_CAPABILITIES)).min(1),
    fixtureDigest: digestString,
    // Null when the harness cannot observe the exact text it sent, which is
    // itself worth recording: the run is then not byte-reproducible.
    promptDigest: digestString.nullable(),
    caseIds: z.array(nonEmptyString),
    cases: z.array(z.object({ id: nonEmptyString, promptDigest: digestString.nullable() }).strict()),
    thresholds: z.record(z.number()),
    declaredRepetitions: nonNegativeInteger,
  })
  .strict();

const evalResultSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    kind: z.literal('suite-result'),
    generatedAt: z.string().datetime(),
    mode: z.enum(RUN_MODES),
    repository: repositorySchema,
    suite: suiteResultSchema,
    runners: z.array(runnerResultSchema),
    durationMs: nonNegativeInteger,
    failureClass: z.enum(FAILURE_CLASSES),
    exitCode: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  })
  .strict()
  .superRefine((value, ctx) => {
    const expected = exitCodeForFailureClass(value.failureClass);
    if (value.exitCode !== expected) {
      ctx.addIssue({
        code: 'custom',
        path: ['exitCode'],
        message: `failureClass "${value.failureClass}" must exit ${expected}, not ${value.exitCode}`,
      });
    }
  });

const evalRunSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    kind: z.literal('run-summary'),
    generatedAt: z.string().datetime(),
    repository: repositorySchema,
    suites: z.array(evalResultSchema),
    // Skills with neither a behavioral suite nor a deferred declaration. A
    // non-empty list is an environment failure, not a finding to read past.
    unaccountedSkills: z.array(nonEmptyString),
    durationMs: nonNegativeInteger,
    failureClass: z.enum(FAILURE_CLASSES),
    exitCode: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  })
  .strict()
  .superRefine((value, ctx) => {
    const expected = exitCodeForFailureClass(value.failureClass);
    if (value.exitCode !== expected) {
      ctx.addIssue({
        code: 'custom',
        path: ['exitCode'],
        message: `failureClass "${value.failureClass}" must exit ${expected}, not ${value.exitCode}`,
      });
    }
  });

/**
 * The exit code a failure class carries: 0 thresholds met, 1 measured quality
 * failure, 2 the environment could not measure.
 *
 * @param {string} failureClass One of FAILURE_CLASSES.
 * @returns {0|1|2}
 */
function exitCodeForFailureClass(failureClass) {
  if (failureClass === 'none') return 0;
  if (failureClass === 'quality') return 1;
  return 2;
}

/**
 * The most severe of the given failure classes, or 'none' when there are none.
 *
 * @param {Iterable<string>} classes
 * @returns {string}
 */
function worstFailureClass(classes) {
  let worst = 'none';
  for (const candidate of classes) {
    if (!FAILURE_CLASSES.includes(candidate)) throw new Error(`unknown failure class: ${candidate}`);
    if (FAILURE_CLASSES.indexOf(candidate) > FAILURE_CLASSES.indexOf(worst)) worst = candidate;
  }
  return worst;
}

/**
 * Validate one suite result record.
 *
 * @param {unknown} record
 * @returns {import('zod').SafeParseReturnType<unknown, unknown>}
 */
function validateEvalResult(record) {
  return evalResultSchema.safeParse(record);
}

/**
 * Validate one eval:all run summary.
 *
 * @param {unknown} record
 * @returns {import('zod').SafeParseReturnType<unknown, unknown>}
 */
function validateEvalRun(record) {
  return evalRunSchema.safeParse(record);
}

module.exports = {
  validateEvalResult,
  validateEvalRun,
  evalResultSchema,
  evalRunSchema,
  exitCodeForFailureClass,
  worstFailureClass,
  SCHEMA_VERSION,
  FAILURE_CLASSES,
  RUN_MODES,
};
