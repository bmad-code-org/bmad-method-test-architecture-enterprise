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
// 1.4.0 added one diagnostic per attempted case repetition. 1.5.0 binds the
// requested grid and every aggregate failure to explicit diagnostic evidence.
// Frozen readers retain both earlier shapes because committed results are
// historical evidence. New writers always emit 1.5.0.
const SCHEMA_VERSION = '1.5.0';
const PREVIOUS_SCHEMA_VERSION = '1.4.0';
const LEGACY_SCHEMA_VERSION = '1.3.0';

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
  'environment-harness',
  'unexpected-error',
];

const ROOT_CAUSES = ['tea-workflow-defect', 'model-instability', 'harness-defect', 'corpus-defect', 'oracle-defect'];
const OPTIONAL_VARIANCE_MEASUREMENTS = new Set(['scoreStdev', 'unstableCases']);
const OPTIONAL_NULL_MEASUREMENTS = new Set([...OPTIONAL_VARIANCE_MEASUREMENTS, 'waiverOracleAccuracy']);

// live spends model calls; the other two validate data or readiness and measure
// nothing, so a record from those modes must never read as a passing gate.
const RUN_MODES = ['live', 'validate-only', 'preflight-only'];

const digestString = z.string().regex(/^sha256:[\da-f]{64}$/, 'digest must be "sha256:" followed by 64 lowercase hex characters');

const nonEmptyString = z.string().min(1);
const nonNegativeInteger = z.number().int().nonnegative();
const positiveInteger = z.number().int().positive();

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

const diagnosticEvidenceSchema = z
  .object({
    kind: z.enum(['output-signature', 'artifact', 'summary']),
    value: nonEmptyString.max(2048),
  })
  .strict();

const diagnosticMetricMapSchema = z.record(z.string().min(1).max(128), z.number().finite()).superRefine((value, ctx) => {
  if (Object.keys(value).length > 64) {
    ctx.addIssue({ code: 'custom', message: 'a diagnostic may carry at most 64 metric contributions' });
  }
});

const diagnosticSchema = z
  .object({
    caseId: nonEmptyString,
    repetition: positiveInteger,
    completionState: z.enum(['completed', 'failed']),
    signature: nonEmptyString.max(4096).nullable(),
    metricContributions: diagnosticMetricMapSchema,
    failureClass: z.enum(FAILURE_CLASSES),
    rootCause: z.enum(ROOT_CAUSES).nullable(),
    reason: z.string().min(1).max(2048).nullable(),
    triage: z
      .array(z.object({ reason: nonEmptyString.max(2048), rootCause: z.enum(ROOT_CAUSES) }).strict())
      .max(16)
      .default([]),
    mappedFailures: z.array(nonEmptyString.max(2048)).max(64).default([]),
    mappedMeasurements: z.array(nonEmptyString.max(128)).max(64).default([]),
    evidence: z.array(diagnosticEvidenceSchema).max(32),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.completionState === 'failed') {
      if (value.signature !== null) ctx.addIssue({ code: 'custom', path: ['signature'], message: 'a failed attempt has no signature' });
      if (Object.keys(value.metricContributions).length > 0) {
        ctx.addIssue({ code: 'custom', path: ['metricContributions'], message: 'an environment failure has no metric contribution' });
      }
      if (value.failureClass === 'none' || value.failureClass === 'quality') {
        ctx.addIssue({
          code: 'custom',
          path: ['failureClass'],
          message: 'a failed attempt must carry an environment or unexpected-error class',
        });
      }
      if (value.reason === null) ctx.addIssue({ code: 'custom', path: ['reason'], message: 'a failed attempt must carry a reason' });
    } else {
      if (value.signature === null)
        ctx.addIssue({ code: 'custom', path: ['signature'], message: 'a completed attempt must carry a signature' });
      if (Object.keys(value.metricContributions).length === 0) {
        ctx.addIssue({ code: 'custom', path: ['metricContributions'], message: 'a completed attempt must carry metric contributions' });
      }
      if (value.evidence.length === 0) {
        ctx.addIssue({ code: 'custom', path: ['evidence'], message: 'a completed attempt must carry bounded evidence' });
      }
      if (value.failureClass !== 'none' && value.failureClass !== 'quality') {
        ctx.addIssue({ code: 'custom', path: ['failureClass'], message: 'a completed attempt may carry only none or quality' });
      }
      if (value.failureClass === 'quality' && value.rootCause === null) {
        ctx.addIssue({ code: 'custom', path: ['rootCause'], message: 'a quality finding must carry its triaged root cause' });
      }
      if (value.failureClass === 'quality' && value.triage.length === 0) {
        ctx.addIssue({ code: 'custom', path: ['triage'], message: 'a quality finding must carry at least one reason and root-cause pair' });
      }
      if (value.failureClass === 'quality' && value.triage[0]?.rootCause !== value.rootCause) {
        ctx.addIssue({ code: 'custom', path: ['rootCause'], message: 'root cause must match the first triage finding' });
      }
      if (value.failureClass === 'none' && value.rootCause !== null) {
        ctx.addIssue({ code: 'custom', path: ['rootCause'], message: 'a clean attempt cannot carry a root cause' });
      }
      if (value.failureClass === 'none' && value.triage.length > 0) {
        ctx.addIssue({ code: 'custom', path: ['triage'], message: 'a clean attempt cannot carry triage findings' });
      }
    }
  });

// Frozen at the shape written by 227b290. Every nested schema is copied here so
// later limits on current evidence cannot retroactively invalidate 1.4.0 data.
const previousUsageSchema = z
  .object({
    inputTokens: nonNegativeInteger.nullable(),
    outputTokens: nonNegativeInteger.nullable(),
    totalTokens: nonNegativeInteger.nullable(),
    costUsd: z.number().nonnegative().nullable(),
  })
  .strict();
const previousDiagnosticEvidenceSchema = z
  .object({
    kind: z.enum(['output-signature', 'artifact', 'summary']),
    value: nonEmptyString.max(2048),
  })
  .strict();
const previousDiagnosticMetricMapSchema = z.record(z.string().min(1).max(128), z.number().finite()).superRefine((value, ctx) => {
  if (Object.keys(value).length > 64) {
    ctx.addIssue({ code: 'custom', message: 'a diagnostic may carry at most 64 metric contributions' });
  }
});
const previousDiagnosticSchema = z
  .object({
    caseId: nonEmptyString,
    repetition: positiveInteger,
    completionState: z.enum(['completed', 'failed']),
    signature: nonEmptyString.max(4096).nullable(),
    metricContributions: previousDiagnosticMetricMapSchema,
    failureClass: z.enum(FAILURE_CLASSES),
    rootCause: z.enum(ROOT_CAUSES).nullable(),
    reason: z.string().min(1).max(2048).nullable(),
    evidence: z.array(previousDiagnosticEvidenceSchema).max(32),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.completionState === 'failed') {
      if (value.signature !== null) ctx.addIssue({ code: 'custom', path: ['signature'], message: 'a failed attempt has no signature' });
      if (Object.keys(value.metricContributions).length > 0) {
        ctx.addIssue({ code: 'custom', path: ['metricContributions'], message: 'an environment failure has no metric contribution' });
      }
      if (value.failureClass === 'none' || value.failureClass === 'quality') {
        ctx.addIssue({
          code: 'custom',
          path: ['failureClass'],
          message: 'a failed attempt must carry an environment or unexpected-error class',
        });
      }
      if (value.reason === null) ctx.addIssue({ code: 'custom', path: ['reason'], message: 'a failed attempt must carry a reason' });
    } else {
      if (value.signature === null)
        ctx.addIssue({ code: 'custom', path: ['signature'], message: 'a completed attempt must carry a signature' });
      if (value.failureClass !== 'none' && value.failureClass !== 'quality') {
        ctx.addIssue({ code: 'custom', path: ['failureClass'], message: 'a completed attempt may carry only none or quality' });
      }
      if (value.failureClass === 'quality' && value.rootCause === null) {
        ctx.addIssue({ code: 'custom', path: ['rootCause'], message: 'a quality finding must carry its triaged root cause' });
      }
      if (value.failureClass === 'none' && value.rootCause !== null) {
        ctx.addIssue({ code: 'custom', path: ['rootCause'], message: 'a clean attempt cannot carry a root cause' });
      }
    }
  });

const suiteDiagnosticSchema = z
  .object({
    failureClass: z.enum(FAILURE_CLASSES).refine((value) => value !== 'none', { message: 'a suite diagnostic must describe a failure' }),
    rootCause: z.enum(ROOT_CAUSES),
    reason: nonEmptyString.max(2048),
    evidence: z.array(diagnosticEvidenceSchema).max(32),
  })
  .strict();

const previousSuiteDiagnosticSchema = z
  .object({
    failureClass: z.enum(FAILURE_CLASSES).refine((value) => value !== 'none' && value !== 'quality', {
      message: 'a suite attempt diagnostic must describe an environment or unexpected failure',
    }),
    reason: nonEmptyString.max(2048),
    evidence: z.array(previousDiagnosticEvidenceSchema).max(32),
  })
  .strict();

const runnerResultFields = {
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
};

const runnerResultSchema = z
  .object({
    ...runnerResultFields,
    diagnostics: z.array(diagnosticSchema),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.failureClass === 'quality' && value.failures.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['failures'], message: 'a quality runner must name at least one aggregate failure' });
    }
    if (value.failureClass === 'quality' && !value.diagnostics.some((entry) => entry.failureClass === 'quality')) {
      ctx.addIssue({ code: 'custom', path: ['diagnostics'], message: 'a quality runner must identify a quality diagnostic' });
    }
    if (value.diagnostics.length !== value.repetitions.expected) {
      ctx.addIssue({
        code: 'custom',
        path: ['diagnostics'],
        message: `expected one diagnostic for each of ${value.repetitions.expected} attempted repetitions`,
      });
    }
    const completed = value.diagnostics.filter((entry) => entry.completionState === 'completed').length;
    if (completed !== value.repetitions.completed) {
      ctx.addIssue({
        code: 'custom',
        path: ['diagnostics'],
        message: `diagnostics contain ${completed} completed repetitions, runner reports ${value.repetitions.completed}`,
      });
    }
    const pairs = value.diagnostics.map((entry) => `${entry.caseId}:${entry.repetition}`);
    if (new Set(pairs).size !== pairs.length) {
      ctx.addIssue({ code: 'custom', path: ['diagnostics'], message: 'diagnostic case and repetition pairs must be unique' });
    }
    const mappedFailures = new Set(value.diagnostics.flatMap((entry) => entry.mappedFailures));
    const environmentAggregate = /\b(?:short|incomplete|completed|repetition|unmeasurable)\b/i;
    for (const [failureIndex, failure] of value.failures.entries()) {
      if (!mappedFailures.has(failure)) {
        ctx.addIssue({
          code: 'custom',
          path: ['failures', failureIndex],
          message: 'every runner failure must map to diagnostic evidence',
        });
      }
      const mappings = value.diagnostics.filter((entry) => entry.mappedFailures.includes(failure));
      const compatible =
        value.failureClass === 'quality' || !environmentAggregate.test(failure)
          ? mappings.some((entry) => entry.failureClass === 'quality')
          : mappings.some((entry) => entry.completionState === 'failed');
      if (mappings.length > 0 && !compatible) {
        ctx.addIssue({
          code: 'custom',
          path: ['failures', failureIndex],
          message: 'runner failure must map to a class-compatible diagnostic',
        });
      }
    }
    const mappedMeasurements = new Set(value.diagnostics.flatMap((entry) => entry.mappedMeasurements));
    for (const [name, measurement] of Object.entries(value.measurements)) {
      if (measurement === null && !OPTIONAL_NULL_MEASUREMENTS.has(name) && !mappedMeasurements.has(name)) {
        ctx.addIssue({
          code: 'custom',
          path: ['measurements', name],
          message: 'every non-optional unmeasurable metric must map to diagnostic evidence',
        });
      }
    }
    for (const [diagnosticIndex, entry] of value.diagnostics.entries()) {
      if (value.failureClass === 'quality' && entry.mappedFailures.length > 0 && entry.failureClass !== 'quality') {
        ctx.addIssue({
          code: 'custom',
          path: ['diagnostics', diagnosticIndex, 'mappedFailures'],
          message: 'a quality runner failure must map to a quality diagnostic',
        });
      }
      if (entry.failureClass === 'none' && entry.mappedFailures.length > 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['diagnostics', diagnosticIndex, 'mappedFailures'],
          message: 'a clean diagnostic cannot supply evidence for runner failures',
        });
      }
      if (entry.failureClass === 'none' && entry.mappedMeasurements.length > 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['diagnostics', diagnosticIndex, 'mappedMeasurements'],
          message: 'a clean diagnostic cannot supply evidence for null measurements',
        });
      }
      for (const failure of entry.mappedFailures) {
        if (!value.failures.includes(failure)) {
          ctx.addIssue({
            code: 'custom',
            path: ['diagnostics', diagnosticIndex, 'mappedFailures'],
            message: 'diagnostic failure mappings must name a runner failure',
          });
        }
      }
      for (const name of entry.mappedMeasurements) {
        if (!Object.hasOwn(value.measurements, name) || value.measurements[name] !== null) {
          ctx.addIssue({
            code: 'custom',
            path: ['diagnostics', diagnosticIndex, 'mappedMeasurements'],
            message: 'diagnostic measurement mappings must name a null runner measurement',
          });
        }
      }
    }
  });

// Frozen copies of every 1.4.0 runner dependency. Current runner fields may
// evolve without changing the historical reader for artifacts already stored.
const previousRunnerParametersSchema = z
  .object({
    agentArgs: z.array(z.string()),
    envPassNames: z.array(z.string()),
    timeoutMs: z.number().int().positive(),
    promptTransport: z.enum(['stdin', 'argv']),
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

const previousRunnerResultFields = {
  agent: nonEmptyString,
  executable: nonEmptyString,
  version: z.string().nullable(),
  model: z.string().nullable(),
  parameters: previousRunnerParametersSchema,
  repetitions: z
    .object({ expected: nonNegativeInteger, completed: nonNegativeInteger })
    .strict()
    .refine((value) => value.completed <= value.expected, { message: 'completed repetitions cannot exceed the expected count' }),
  measurements: z.record(z.number().nullable()),
  durationMs: nonNegativeInteger,
  usage: previousUsageSchema.nullable(),
  failureClass: z.enum(FAILURE_CLASSES),
  failures: z.array(z.string()),
};

const previousRunnerResultSchema = z
  .object({
    ...previousRunnerResultFields,
    diagnostics: z.array(previousDiagnosticSchema),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.diagnostics.length !== value.repetitions.expected) {
      ctx.addIssue({
        code: 'custom',
        path: ['diagnostics'],
        message: `expected one diagnostic for each of ${value.repetitions.expected} attempted repetitions`,
      });
    }
    const completed = value.diagnostics.filter((entry) => entry.completionState === 'completed').length;
    if (completed !== value.repetitions.completed) {
      ctx.addIssue({
        code: 'custom',
        path: ['diagnostics'],
        message: `diagnostics contain ${completed} completed repetitions, runner reports ${value.repetitions.completed}`,
      });
    }
    const pairs = value.diagnostics.map((entry) => `${entry.caseId}:${entry.repetition}`);
    if (new Set(pairs).size !== pairs.length) {
      ctx.addIssue({ code: 'custom', path: ['diagnostics'], message: 'diagnostic case and repetition pairs must be unique' });
    }
  });

const legacyRunnerResultSchema = z.object(runnerResultFields).strict();

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

// Frozen at the exact suite shape accepted by the 1.4.0 writer. This stays
// structurally independent of suiteResultSchema so current requirements do not
// retroactively invalidate historical evidence.
const previousSuiteContractSchema = z.object({ path: nonEmptyString, version: z.string().nullable() }).strict();
const previousSuiteResultSchema = z
  .object({
    id: nonEmptyString,
    evalType: z.enum(EVAL_TYPES),
    skills: z.array(nonEmptyString),
    contracts: z.array(previousSuiteContractSchema),
    ciTier: z.enum(CI_TIERS),
    runnerCapabilities: z.array(z.enum(RUNNER_CAPABILITIES)).min(1),
    fixtureDigest: digestString,
    promptDigest: digestString.nullable(),
    caseIds: z.array(nonEmptyString),
    cases: z.array(z.object({ id: nonEmptyString, promptDigest: digestString.nullable() }).strict()),
    thresholds: z.record(z.number()),
    declaredRepetitions: nonNegativeInteger,
  })
  .strict()
  .superRefine((value, ctx) => {
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

function resultSchemaFor(
  schemaVersion,
  runnerSchema,
  suiteDiagnosticsSchema = null,
  enforcement = 'none',
  suiteSchema = suiteResultSchema,
) {
  return z
    .object({
      schemaVersion: z.literal(schemaVersion),
      kind: z.literal('suite-result'),
      generatedAt: z.string().datetime(),
      mode: z.enum(RUN_MODES),
      repository: repositorySchema,
      suite: suiteSchema,
      runners: z.array(runnerSchema),
      ...(suiteDiagnosticsSchema ? { suiteDiagnostics: z.array(suiteDiagnosticsSchema).default([]) } : {}),
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
      if (enforcement === 'none') return;
      const caseIds = new Set(value.suite.caseIds);
      if (caseIds.size !== value.suite.caseIds.length) {
        ctx.addIssue({ code: 'custom', path: ['suite', 'caseIds'], message: 'suite case ids must be unique' });
      }
      const recordedCaseIds = value.suite.cases.map((entry) => entry.id);
      if (
        recordedCaseIds.length !== value.suite.caseIds.length ||
        recordedCaseIds.some((caseId, index) => caseId !== value.suite.caseIds[index])
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['suite', 'cases'],
          message: 'suite cases must match the declared case ids in order',
        });
      }
      if (enforcement === 'current' && value.mode === 'live' && value.runners.length === 0 && value.suiteDiagnostics.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['runners'],
          message: 'a clean live suite must include at least one runner',
        });
      }
      if (enforcement === 'current' && value.mode === 'live' && caseIds.size > 0 && value.suite.declaredRepetitions === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['suite', 'declaredRepetitions'],
          message: 'a live suite with declared cases must request at least one repetition',
        });
      }
      for (const [runnerIndex, runner] of value.runners.entries()) {
        for (const [diagnosticIndex, diagnostic] of runner.diagnostics.entries()) {
          if (!caseIds.has(diagnostic.caseId)) {
            ctx.addIssue({
              code: 'custom',
              path: ['runners', runnerIndex, 'diagnostics', diagnosticIndex, 'caseId'],
              message: 'diagnostic names an undeclared case',
            });
          }
          if (diagnostic.repetition > value.suite.declaredRepetitions) {
            ctx.addIssue({
              code: 'custom',
              path: ['runners', runnerIndex, 'diagnostics', diagnosticIndex, 'repetition'],
              message: 'diagnostic repetition exceeds the suite declaration',
            });
          }
        }
        if (caseIds.size === 0 && runner.repetitions.expected !== 0) {
          ctx.addIssue({
            code: 'custom',
            path: ['runners', runnerIndex, 'repetitions', 'expected'],
            message: 'a runner cannot declare attempts when the suite declares no cases',
          });
        }
        if (
          enforcement === 'current' &&
          caseIds.size > 0 &&
          runner.repetitions.expected !== caseIds.size * value.suite.declaredRepetitions
        ) {
          ctx.addIssue({
            code: 'custom',
            path: ['runners', runnerIndex, 'repetitions', 'expected'],
            message: 'runner attempts must cover every declared case and requested repetition',
          });
        } else if (caseIds.size > 0 && runner.repetitions.expected % caseIds.size !== 0) {
          ctx.addIssue({
            code: 'custom',
            path: ['runners', runnerIndex, 'repetitions', 'expected'],
            message: 'runner attempts must form a complete grid across every declared case',
          });
        } else if (caseIds.size > 0) {
          const effectiveRepetitions = runner.repetitions.expected / caseIds.size;
          if (enforcement === 'previous' && effectiveRepetitions > value.suite.declaredRepetitions) {
            ctx.addIssue({
              code: 'custom',
              path: ['runners', runnerIndex, 'repetitions', 'expected'],
              message: 'runner attempts exceed the suite repetition declaration',
            });
          }
          const actualPairs = new Set(runner.diagnostics.map((entry) => `${entry.caseId}:${entry.repetition}`));
          const repetitionsToVerify = enforcement === 'current' ? value.suite.declaredRepetitions : effectiveRepetitions;
          for (const caseId of caseIds) {
            for (let repetition = 1; repetition <= repetitionsToVerify; repetition += 1) {
              if (!actualPairs.has(`${caseId}:${repetition}`)) {
                ctx.addIssue({
                  code: 'custom',
                  path: ['runners', runnerIndex, 'diagnostics'],
                  message: `missing diagnostic for case "${caseId}" repetition ${repetition}`,
                });
              }
            }
          }
        }
        const failedDiagnostics = runner.diagnostics.filter((entry) => entry.completionState === 'failed');
        if (runner.failureClass === 'none' && failedDiagnostics.length > 0) {
          ctx.addIssue({
            code: 'custom',
            path: ['runners', runnerIndex, 'failureClass'],
            message: 'a clean runner cannot contain failed diagnostics',
          });
        }
        if (runner.failureClass.startsWith('environment-') && failedDiagnostics.length === 0) {
          ctx.addIssue({
            code: 'custom',
            path: ['runners', runnerIndex, 'diagnostics'],
            message: 'an environment runner must identify a failed diagnostic',
          });
        }
        const diagnosticFailureClass = worstFailureClass(runner.diagnostics.map((entry) => entry.failureClass));
        if (runner.failureClass !== diagnosticFailureClass) {
          ctx.addIssue({
            code: 'custom',
            path: ['runners', runnerIndex, 'failureClass'],
            message: `runner failure class must be derived from its diagnostics (${diagnosticFailureClass})`,
          });
        }
        if (enforcement === 'current') {
          const effectiveRepetitions = caseIds.size === 0 ? 0 : runner.repetitions.expected / caseIds.size;
          if (value.suite.declaredRepetitions >= 2) {
            const requiredVariance = [
              Object.hasOwn(value.suite.thresholds, 'maxScoreStdev') && 'scoreStdev',
              Object.hasOwn(value.suite.thresholds, 'maxUnstableCases') && 'unstableCases',
            ].filter(Boolean);
            for (const name of requiredVariance) {
              if (!Object.hasOwn(runner.measurements, name)) {
                ctx.addIssue({
                  code: 'custom',
                  path: ['runners', runnerIndex, 'measurements'],
                  message: `a repeated suite must record ${name}`,
                });
                continue;
              }
              const incomplete = runner.repetitions.completed < runner.repetitions.expected;
              if (incomplete && runner.measurements[name] !== null) {
                ctx.addIssue({
                  code: 'custom',
                  path: ['runners', runnerIndex, 'measurements', name],
                  message: `${name} must be null when requested repetitions are incomplete`,
                });
              }
              if (!incomplete && runner.measurements[name] === null) {
                ctx.addIssue({
                  code: 'custom',
                  path: ['runners', runnerIndex, 'measurements', name],
                  message: `${name} must be measured when every requested repetition completed`,
                });
              }
            }
          }
          if (effectiveRepetitions >= 2) {
            const mappedMeasurements = new Set(runner.diagnostics.flatMap((entry) => entry.mappedMeasurements));
            for (const name of OPTIONAL_VARIANCE_MEASUREMENTS) {
              if (Object.hasOwn(runner.measurements, name) && runner.measurements[name] === null && !mappedMeasurements.has(name)) {
                ctx.addIssue({
                  code: 'custom',
                  path: ['runners', runnerIndex, 'measurements', name],
                  message: `${name} must be measured across repeated runs or mapped to failure evidence`,
                });
              }
            }
          }
        }
      }
      if (enforcement !== 'current') return;
      const derivedFailureClass = worstFailureClass([
        ...value.runners.map((runner) => runner.failureClass),
        ...value.suiteDiagnostics.map((entry) => entry.failureClass),
      ]);
      if (value.failureClass !== derivedFailureClass) {
        ctx.addIssue({
          code: 'custom',
          path: ['failureClass'],
          message: `suite failure class must be derived from runner and suite diagnostics (${derivedFailureClass})`,
        });
      }
    });
}

const evalResultSchema = resultSchemaFor(SCHEMA_VERSION, runnerResultSchema, suiteDiagnosticSchema, 'current');
const previousEvalResultSchema = resultSchemaFor(
  PREVIOUS_SCHEMA_VERSION,
  previousRunnerResultSchema,
  previousSuiteDiagnosticSchema,
  'previous',
  previousSuiteResultSchema,
);
const legacyEvalResultSchema = resultSchemaFor(LEGACY_SCHEMA_VERSION, legacyRunnerResultSchema);

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
    const derivedFailureClass = worstFailureClass([
      ...value.suites.map((suite) => suite.failureClass),
      ...(value.unaccountedSkills.length > 0 ? ['environment-configuration'] : []),
    ]);
    if (value.failureClass !== derivedFailureClass) {
      ctx.addIssue({
        code: 'custom',
        path: ['failureClass'],
        message: `run failure class must be derived from suite evidence (${derivedFailureClass})`,
      });
    }
  });

const previousEvalRunSchema = z
  .object({
    schemaVersion: z.literal(PREVIOUS_SCHEMA_VERSION),
    kind: z.literal('run-summary'),
    generatedAt: z.string().datetime(),
    repository: repositorySchema,
    evalQualityVersion: nonEmptyString,
    suites: z.array(previousEvalResultSchema),
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

const legacyEvalRunSchema = z
  .object({
    schemaVersion: z.literal(LEGACY_SCHEMA_VERSION),
    kind: z.literal('run-summary'),
    generatedAt: z.string().datetime(),
    repository: repositorySchema,
    evalQualityVersion: nonEmptyString,
    suites: z.array(legacyEvalResultSchema),
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
    const failureClass = typeof candidate === 'string' ? candidate : candidate?.failureClass;
    if (!FAILURE_CLASSES.includes(failureClass)) throw new Error(`unknown failure class: ${failureClass}`);
    if (FAILURE_CLASSES.indexOf(failureClass) > FAILURE_CLASSES.indexOf(worst)) worst = failureClass;
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
  return z.union([evalResultSchema, previousEvalResultSchema, legacyEvalResultSchema]).safeParse(record);
}

/**
 * Validate one eval:all run summary.
 *
 * @param {unknown} record
 * @returns {import('zod').SafeParseReturnType<unknown, unknown>}
 */
function validateEvalRun(record) {
  return z.union([evalRunSchema, previousEvalRunSchema, legacyEvalRunSchema]).safeParse(record);
}

module.exports = {
  validateEvalResult,
  validateEvalRun,
  evalResultSchema,
  evalRunSchema,
  previousEvalResultSchema,
  previousEvalRunSchema,
  legacyEvalResultSchema,
  legacyEvalRunSchema,
  diagnosticSchema,
  exitCodeForFailureClass,
  worstFailureClass,
  SCHEMA_VERSION,
  PREVIOUS_SCHEMA_VERSION,
  LEGACY_SCHEMA_VERSION,
  FAILURE_CLASSES,
  ROOT_CAUSES,
  RUN_MODES,
};
