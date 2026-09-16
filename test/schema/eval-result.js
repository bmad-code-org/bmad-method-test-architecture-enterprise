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
 * must never be reported as a lower score. `unexpected-error` exits 2 for the
 * same reason and says something different: the run was lost to a throw TEA
 * cannot attribute to the environment at all.
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
// 1.2.0 let `suite.skills` be empty for an `infrastructure` suite result, which
// discharges no skill's coverage obligation and so names none; every other
// evalType still must name at least one, held by the schema's own superRefine
// rather than by `.min(1)` alone.
// 1.3.0 added `evalQualityVersion` to the run summary, so a stored run names the
// installed `eval-quality` it was measured against instead of leaving a reader
// to infer it from the commit alone.
const SCHEMA_VERSION = '1.3.0';

/**
 * Failure classes in ascending severity. `worstFailureClass` picks the highest
 * index, so the order is the policy: an environment failure always outranks a
 * measured quality failure, because a run that could not measure has nothing to
 * say about quality.
 *
 * `unexpected-error` is last, and it is the one class that is not a statement
 * about the environment. It is what `failureClassForFault` answers for a throw
 * that is neither of `eval-quality`'s two declared fault classes: an ordinary
 * Node error, a `TypeError` from TEA's own code, anything the port was never
 * supposed to raise. Every `environment-*` class names a way a run can honestly
 * be lost, and filing a defect in TEA under one of them is how a broken
 * environment came to read as a package transport fault for as long as
 * `failureClassForFault` narrowed on `error?.code`. It outranks the environment
 * classes because a failure nobody can attribute is the one a reader has to look
 * at first, and it exits 2 with them because nothing was measured either way.
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
  'unexpected-error',
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
    // The external tools a harness ran beside the vendor, each with the version
    // that answered and the flags it was given. A suite that lints its
    // deliverable is measuring the linter's opinion as much as the vendor's, so
    // two records are comparable only when both name the same tool at the same
    // version under the same flags. Optional: most suites run none.
    tools: z
      .array(
        z
          .object({
            name: nonEmptyString,
            version: z.string().nullable(),
            args: z.array(z.string()),
          })
          .strict(),
      )
      .optional(),
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
    // Empty only for an `infrastructure` suite, which discharges no skill's
    // coverage obligation and so names none; held to at least one otherwise by
    // the superRefine below, the record-side mirror of the manifest schema's
    // own rule for a suite entry.
    skills: z.array(nonEmptyString),
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
  .strict()
  .superRefine((value, ctx) => {
    // Both directions, the same invariant `suiteEntrySchema`'s own superRefine
    // in test/schema/suite-manifest.js holds the manifest entry to: an
    // `infrastructure` result names no skill, and no other evalType may name
    // zero. This is a zod-only rule; `zodToJsonSchema` cannot project a
    // superRefine's cross-field logic into the generated JSON Schema, so
    // test/schema/eval-result.schema.json carries no `minItems` for `skills`
    // at all and this check is enforced only where `validateEvalResult` runs.
    if (value.evalType !== 'infrastructure' && value.skills.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['skills'], message: `a "${value.evalType}" suite result must name at least one skill` });
    }
    if (value.evalType === 'infrastructure' && value.skills.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['skills'],
        message: 'an "infrastructure" suite result discharges no skill\'s coverage obligation, so it must name none',
      });
    }
  });

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
    // The installed `eval-quality` every suite below was scored against, read
    // from its own `VERSION` export rather than declared by a caller: a stored
    // run this old field cannot answer "is this the same eval-quality that
    // scored the earlier run I am comparing it with", which is exactly the
    // question a drift comparison across an upgrade has to ask first.
    evalQualityVersion: nonEmptyString,
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
 * failure, 2 nothing was measured. The third covers both the `environment-*`
 * classes and `unexpected-error`, which differ in what a reader should go and
 * look at rather than in whether a score exists.
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
