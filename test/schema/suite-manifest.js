/**
 * Zod schema for test/evals/suite-manifest.json, the versioned register of every
 * eval suite TEA can run and every skill it has agreed not to cover yet.
 *
 * The manifest is the only place that answers "what does a green eval:all
 * actually prove". Two rules give it that authority:
 *
 * 1. `evalType: behavioral` is the only kind of entry that discharges a skill's
 *    coverage obligation. Fragment selection measures which knowledge a run
 *    loads, which is a routing decision taken before the workflow produces
 *    anything, so a skill listed only there is still uncovered.
 * 2. A skill with no behavioral suite must appear in `deferred` with an owner,
 *    the evidence that is missing, and the condition that retires the entry.
 *    Silence is what lets a suite list imply coverage that does not exist.
 *
 * Thresholds live here as declared values and are checked against the harness
 * constants by tools/validate-eval-schemas.js, so neither side can drift.
 */

'use strict';

const { z } = require('zod');

const MANIFEST_VERSION = 1;

// fragment-selection is routing evidence; behavioral is end-to-end artifact
// evidence. Only the second one covers a skill.
const EVAL_TYPES = ['fragment-selection', 'behavioral'];

// The tiers in the roadmap's CI policy: deterministic runs on every pull
// request with no credentials, smoke runs one case per suite, full-matrix runs
// every suite at its declared repetition count.
const CI_TIERS = ['deterministic', 'smoke', 'full-matrix'];

// What the runner must be allowed to do. A suite that only needs to read must
// not be handed a workspace it can write, so this is a policy declaration the
// runner setup can enforce rather than a description.
const RUNNER_CAPABILITIES = ['read-only', 'scoped-artifact-writes', 'command-execution'];

const nonEmptyString = (label) => z.string().refine((value) => value.trim().length > 0, { message: `${label} must be a non-empty string` });

// Kept local so the schema module stays dependency-free apart from zod.
function isAbsoluteLike(value) {
  return value.startsWith('/') || /^[A-Za-z]:[/\\]/.test(value);
}

const repositoryPath = (label) =>
  z
    .string()
    .refine((value) => value.trim().length > 0, { message: `${label} must be a non-empty repository-relative path` })
    .refine((value) => !isAbsoluteLike(value) && !value.includes('..'), {
      message: `${label} must be a repository-relative path without ".." segments`,
    });

// Free-form provenance notes, same shape ground-truth.json already uses.
const commentSchema = z.union([z.string(), z.array(z.string())]);

const harnessOptionsSchema = z
  .object({
    // eval:all passes the repetition count through this flag, so a suite whose
    // harness spells it differently stays runnable without a code change here.
    repetitionFlag: z.string().startsWith('--'),
    // The argv that makes the harness validate without spending a model call.
    preflightArgs: z.array(z.string()),
    acceptsWorkflowFilter: z.boolean(),
  })
  .strict();

const suiteEntrySchema = z
  .object({
    $comment: commentSchema.optional(),
    id: nonEmptyString('suites[].id'),
    skill: nonEmptyString('suites[].skill').optional(),
    skills: z.array(nonEmptyString('suites[].skills[]')).min(1).optional(),
    evalType: z.enum(EVAL_TYPES),
    harness: repositoryPath('suites[].harness'),
    harnessOptions: harnessOptionsSchema,
    // The files the case feeds the agent. The result record's fixture digest is
    // computed over exactly this list.
    fixtures: z.array(repositoryPath('suites[].fixtures[]')).min(1),
    // The files that declare the expected answer. Separate from fixtures
    // because a suite whose oracle is also its input has to say so rather than
    // let a reader assume the two were written independently.
    groundTruth: z.array(repositoryPath('suites[].groundTruth[]')).min(1),
    // Null until the eval-quality contract layer exists and this suite is
    // expressed as one. Nullable rather than optional so the gap is visible.
    contract: repositoryPath('suites[].contract').nullable(),
    thresholds: z.record(z.number()),
    repetitions: z.number().int().positive(),
    caseCount: z.number().int().positive(),
    ciTier: z.enum(CI_TIERS),
    runnerCapabilities: z.array(z.enum(RUNNER_CAPABILITIES)).min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasSkill = typeof value.skill === 'string';
    const hasSkills = Array.isArray(value.skills);
    if (hasSkill === hasSkills) {
      ctx.addIssue({
        code: 'custom',
        message: 'a suite entry declares exactly one of "skill" or "skills"',
      });
    }
    if (hasSkills && new Set(value.skills).size !== value.skills.length) {
      ctx.addIssue({ code: 'custom', path: ['skills'], message: 'suites[].skills must not repeat a skill' });
    }
    if (Object.keys(value.thresholds).length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['thresholds'],
        message: 'a suite with no threshold cannot pass or fail; declare at least one',
      });
    }
  });

const deferredEntrySchema = z
  .object({
    $comment: commentSchema.optional(),
    skill: nonEmptyString('deferred[].skill'),
    owner: nonEmptyString('deferred[].owner'),
    missingEvidence: nonEmptyString('deferred[].missingEvidence'),
    exitCondition: nonEmptyString('deferred[].exitCondition'),
  })
  .strict();

const suiteManifestSchema = z
  .object({
    $comment: commentSchema.optional(),
    manifestVersion: z.literal(MANIFEST_VERSION),
    suites: z.array(suiteEntrySchema).min(1),
    deferred: z.array(deferredEntrySchema),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = new Set();
    for (const [index, suite] of value.suites.entries()) {
      if (ids.has(suite.id)) {
        ctx.addIssue({ code: 'custom', path: ['suites', index, 'id'], message: `duplicate suite id "${suite.id}"` });
      }
      ids.add(suite.id);
    }

    const deferredSkills = new Set();
    for (const [index, entry] of value.deferred.entries()) {
      if (deferredSkills.has(entry.skill)) {
        ctx.addIssue({ code: 'custom', path: ['deferred', index, 'skill'], message: `duplicate deferred skill "${entry.skill}"` });
      }
      deferredSkills.add(entry.skill);
    }

    // A skill cannot be both covered and deferred: a deferred entry means no
    // behavioral evidence exists, and a behavioral suite is that evidence.
    const covered = new Set();
    for (const suite of value.suites) {
      if (suite.evalType !== 'behavioral') continue;
      for (const skill of suite.skills ?? [suite.skill]) covered.add(skill);
    }
    for (const [index, entry] of value.deferred.entries()) {
      if (covered.has(entry.skill)) {
        ctx.addIssue({
          code: 'custom',
          path: ['deferred', index, 'skill'],
          message: `"${entry.skill}" has a behavioral suite, so it cannot also be deferred`,
        });
      }
    }
  });

/**
 * Validate a parsed suite manifest.
 *
 * @param {unknown} manifest Parsed suite-manifest.json content.
 * @returns {import('zod').SafeParseReturnType<unknown, unknown>}
 */
function validateSuiteManifest(manifest) {
  return suiteManifestSchema.safeParse(manifest);
}

module.exports = {
  validateSuiteManifest,
  suiteManifestSchema,
  MANIFEST_VERSION,
  EVAL_TYPES,
  CI_TIERS,
  RUNNER_CAPABILITIES,
};
