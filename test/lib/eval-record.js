/**
 * Shared machinery behind `--json <path>`: one digest helper, the run identity
 * the record needs, and the record builders themselves.
 *
 * There is exactly one digest function here and every caller uses it. Two
 * digest implementations produce two answers for the same bytes, and the whole
 * point of carrying a digest is that a later run can decide whether it looked
 * at the same input.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const { boundedProbe } = require('./bounded-probe');

const {
  validateEvalResult,
  validateEvalRun,
  worstFailureClass,
  exitCodeForFailureClass,
  SCHEMA_VERSION,
} = require('../schema/eval-result');

// A passthrough argument can carry a credential, and a result file is meant to
// be uploaded from CI. Flags whose name says "secret" get their value dropped,
// and any value shaped like a known token is dropped wherever it appears.
const SECRET_FLAG_PATTERN = /key|token|secret|password|credential|auth/i;
// The token prefix is searched for anywhere in the value, not only at its start.
// A start-anchored pattern read `--extra=https://example.test?token=ghp_x` and
// `Authorization: Bearer ghp_x` as ordinary text and published both.
//
// The boundary in front is what keeps the search from redacting real
// configuration. A prefix counts only where it is not preceded by a letter or a
// digit, which is where a credential actually sits: at the start of the value, or
// after `=`, `:`, `?`, `&`, `/` or a space. Without it, `sk-` alone would match
// inside "risk-based" and "task-runner" and erase the runner arguments the record
// exists to report. `-` and `_` are deliberately outside the boundary set, so
// `prefix_github_pat_x` is still caught.
const SECRET_VALUE_PATTERN = /(?<![A-Za-z0-9])(sk-|sk_|ghp_|gho_|ghs_|github_pat_|xox[abprs]-|AIza|AKIA|ya29\.)/;
const REDACTED = '[redacted]';

/**
 * sha256 over canonical bytes.
 *
 * Each part is length-prefixed before it is hashed, so ['ab', 'c'] and
 * ['a', 'bc'] cannot collide. That matters because the callers hash lists of
 * path/content pairs, where a collision would silently claim two different
 * fixture sets were the same input.
 *
 * The length and the bytes are separated by a NUL, spelled as a unicode escape.
 * It was a raw NUL byte in this source until now, which made git treat the whole
 * file as binary and print "Binary files differ" where a reviewer needed a diff.
 * The escape hashes to the same byte, so no recorded digest moves.
 *
 * @param {string|Buffer|Array<string|Buffer>} parts
 * @returns {string} `sha256:<hex>`
 */
function digest(parts) {
  const list = Array.isArray(parts) ? parts : [parts];
  const hash = createHash('sha256');
  for (const part of list) {
    const bytes = Buffer.isBuffer(part) ? part : Buffer.from(String(part), 'utf8');
    hash.update(`${bytes.length}\u0000`);
    hash.update(bytes);
  }
  return `sha256:${hash.digest('hex')}`;
}

/**
 * Digest over a set of repository files: sorted by path, each contributing its
 * relative path and then its bytes, so a rename changes the digest.
 *
 * A missing file contributes a marker instead of throwing. This is called on the
 * way out of a run that may already have failed because that file is missing,
 * and a reporting path that crashes on the condition it is reporting is worse
 * than a digest that says the file was not there.
 *
 * @param {string} projectRoot
 * @param {string[]} relativePaths
 * @returns {string}
 */
function digestFiles(projectRoot, relativePaths) {
  const parts = [];
  for (const relative of [...relativePaths].sort()) {
    const absolute = path.join(projectRoot, relative);
    parts.push(relative, fs.existsSync(absolute) ? fs.readFileSync(absolute) : '<missing>');
  }
  return digest(parts);
}

/**
 * Digest over the case prompts of a whole suite, keyed by case id so a
 * reordering of the cases does not change the answer.
 *
 * @param {Array<{id: string, prompt: string}>} cases
 * @returns {string}
 */
function digestPrompts(cases) {
  const parts = [];
  for (const item of [...cases].sort((left, right) => left.id.localeCompare(right.id))) {
    parts.push(item.id, item.prompt);
  }
  return digest(parts);
}

/**
 * The commit the run measured, and whether the tree was clean.
 *
 * A dirty tree is recorded rather than rejected: local debugging runs are the
 * normal case, and the flag is what stops a later comparison from treating the
 * result as a property of the commit.
 *
 * @param {string} projectRoot
 * @returns {{commit: string|null, dirty: boolean}}
 */
function repositoryState(projectRoot) {
  const rev = boundedProbe('git', ['rev-parse', 'HEAD'], { cwd: projectRoot });
  if (!rev.ok) return { commit: null, dirty: false };
  const status = boundedProbe('git', ['status', '--porcelain'], { cwd: projectRoot });
  return {
    commit: rev.stdout.trim(),
    dirty: status.ok && status.stdout.trim().length > 0,
  };
}

/**
 * What `<executable> --version` printed, or null when the probe failed.
 *
 * @param {string} executable
 * @returns {string|null}
 */
function probeVersion(executable) {
  if (!executable) return null;
  const probe = boundedProbe(executable, ['--version']);
  if (!probe.ok) return null;
  const line = String(probe.stdout || probe.stderr || '')
    .trim()
    .split('\n')[0];
  return line.length > 0 ? line : null;
}

/**
 * Passthrough argv with anything credential-shaped removed.
 *
 * @param {string[]} args
 * @returns {string[]}
 */
function redactArgs(args = []) {
  const redacted = [];
  let dropNextValue = false;
  for (const argument of args) {
    if (dropNextValue) {
      redacted.push(REDACTED);
      dropNextValue = false;
      continue;
    }
    const separator = argument.indexOf('=');
    if (argument.startsWith('-') && separator > 0) {
      const flag = argument.slice(0, separator);
      // The value half is tested too. `--extra=sk-live-abc` names nothing
      // credential-shaped, so the flag test alone let a real token through into a
      // file CI uploads, which is the one thing this function exists to stop.
      const leaks = SECRET_FLAG_PATTERN.test(flag) || SECRET_VALUE_PATTERN.test(argument.slice(separator + 1));
      redacted.push(leaks ? `${flag}=${REDACTED}` : argument);
      continue;
    }
    if (argument.startsWith('-') && SECRET_FLAG_PATTERN.test(argument)) {
      redacted.push(argument);
      dropNextValue = true;
      continue;
    }
    redacted.push(SECRET_VALUE_PATTERN.test(argument) ? REDACTED : argument);
  }
  return redacted;
}

/**
 * The failure class of a runAgent error.
 *
 * Everything here is an environment failure: the model never answered, so there
 * is no quality to report. Returning a lower score for one of these is the
 * exact confusion this classification exists to prevent.
 *
 * @param {Error & {code?: string}} error
 * @returns {string}
 */
function classifyAgentError(error) {
  const code = String(error?.code ?? '');
  if (code === 'AGENT_UNKNOWN' || code === 'AGENT_COMMAND_REQUIRED' || code.startsWith('MODEL_')) return 'environment-configuration';
  if (code === 'AGENT_NOT_FOUND') return 'environment-transport';
  if (/timed out/i.test(error?.message ?? '')) return 'environment-timeout';
  return 'environment-transport';
}

/** A metric that could not be measured is null in the record, never NaN. */
function measured(value) {
  return Number.isFinite(value) ? value : null;
}

/**
 * Assemble one suite result record. The failure class is derived from the
 * runners plus any suite-level environment failure, and the exit code is
 * derived from that, so the three can never disagree.
 *
 * @param {object} input
 * @returns {object} A record shaped for evalResultSchema.
 */
function suiteResultRecord({
  mode,
  suite,
  repository,
  fixtureDigest,
  promptDigest,
  cases,
  runners,
  durationMs,
  suiteFailureClasses = [],
  contractVersions = {},
}) {
  const failureClass = worstFailureClass([...runners.map((runner) => runner.failureClass), ...suiteFailureClasses]);
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'suite-result',
    generatedAt: new Date().toISOString(),
    mode,
    repository,
    suite: {
      id: suite.id,
      evalType: suite.evalType,
      skills: suite.skills ?? [suite.skill],
      // Every contract the manifest links for this suite, so a reader of the
      // result file can open what the run claims to have been measured against.
      contracts: (suite.contracts ?? []).map((contractPath) => ({ path: contractPath, version: contractVersions[contractPath] ?? null })),
      ciTier: suite.ciTier,
      runnerCapabilities: suite.runnerCapabilities,
      fixtureDigest,
      promptDigest,
      caseIds: cases.map((item) => item.id),
      cases: cases.map((item) => ({ id: item.id, promptDigest: item.promptDigest ?? null })),
      thresholds: suite.thresholds,
      declaredRepetitions: suite.repetitions,
    },
    runners,
    durationMs,
    failureClass,
    exitCode: exitCodeForFailureClass(failureClass),
  };
}

/**
 * Assemble the eval:all run summary from the suite records its children wrote.
 *
 * @param {object} input
 * @returns {object} A record shaped for evalRunSchema.
 */
function runSummaryRecord({ repository, suites, unaccountedSkills, durationMs, runFailureClasses = [] }) {
  const failureClass = worstFailureClass([...suites.map((suite) => suite.failureClass), ...runFailureClasses]);
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'run-summary',
    generatedAt: new Date().toISOString(),
    repository,
    suites,
    unaccountedSkills,
    durationMs,
    failureClass,
    exitCode: exitCodeForFailureClass(failureClass),
  };
}

function formatIssues(issues) {
  return issues.map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`).join('\n');
}

/**
 * Validate then write. A record that does not validate is a defect in the
 * harness that produced it, so it throws rather than reaching disk: an invalid
 * result file would be read later by something that trusts the schema.
 *
 * @param {string} jsonPath
 * @param {object} record
 * @param {(record: unknown) => {success: boolean, error?: {issues: Array<object>}}} validator
 */
function writeRecord(jsonPath, record, validator) {
  const result = validator(record);
  if (!result.success) {
    throw new Error(`eval result record does not match its schema (harness bug):\n${formatIssues(result.error.issues)}`);
  }
  fs.mkdirSync(path.dirname(path.resolve(jsonPath)), { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
}

/**
 * @param {string} jsonPath
 * @param {object} record
 */
function writeSuiteResult(jsonPath, record) {
  writeRecord(jsonPath, record, validateEvalResult);
}

/**
 * @param {string} jsonPath
 * @param {object} record
 */
function writeRunSummary(jsonPath, record) {
  writeRecord(jsonPath, record, validateEvalRun);
}

module.exports = {
  digest,
  digestFiles,
  digestPrompts,
  repositoryState,
  probeVersion,
  redactArgs,
  classifyAgentError,
  measured,
  suiteResultRecord,
  runSummaryRecord,
  writeSuiteResult,
  writeRunSummary,
};
