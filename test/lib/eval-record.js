/**
 * Shared machinery behind `--json <path>`: one digest helper, the run identity
 * the record needs, and the record builders themselves.
 *
 * There is exactly one digest function here and every caller uses it. Two
 * digest implementations produce two answers for the same bytes, and the whole
 * point of carrying a digest is that a later run can decide whether it looked
 * at the same input.
 *
 * WHAT STILL REACHES `fs` DIRECTLY, AND WHY
 *
 * One call: the `mkdirSync` in `writeRecord`. The file-system port declares
 * `readFile` and `writeFile` over a caller-owned path and creates no directories,
 * which is the package's boundary rather than an omission, so the directory a
 * record is written into is made here and the bytes go through the port.
 *
 * Every read of a file's contents goes through `test/lib/file-system-port.js`:
 * `digestFiles` reads bytes, because a digest over decoded text is a digest over
 * something the file does not contain.
 */

'use strict';

const { isScripted } = require('./clock');

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const { boundedProbe } = require('./bounded-probe');
const { readBytes, writeText } = require('./file-system-port');

// `require(esm)` is stable on every Node the engines field admits (>= 22.20.0);
// see test/lib/eval-quality-inputs.js for the same reasoning applied to the
// package's schema-version constants. Unguarded on purpose: `runSummaryRecord`
// cannot honestly stamp `evalQualityVersion` without it, and a run that cannot
// even resolve its own scoring package is not one that should keep going far
// enough to write a record that omits the fact.
const { VERSION: EVAL_QUALITY_VERSION } = require('eval-quality');

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
const SECRET_TOKEN_PATTERN = /(^|[^A-Za-z0-9])(?:sk[-_]|gh[pousr]_|github_pat_|xox[abprs]-|AIza|AKIA|ya29\.)[A-Za-z0-9._~+/=-]*/g;
const SENSITIVE_VALUE_PATTERN =
  /((?:["']?)(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|credential|authorization|auth)(?:["']?)\s*[:=]\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\[redacted\]|[^\s,;}&\]]+)/gi;
const REDACTED = '[redacted]';
const MAX_DIAGNOSTIC_METRICS = 64;
const MAX_DIAGNOSTIC_METRIC_KEY = 128;

function boundedDiagnosticText(value, maxLength) {
  const text = String(value);
  if (text.length <= maxLength) return text;
  const digest = createHash('sha256').update(text).digest('hex');
  const suffix = `…sha256:${digest}`;
  return `${text.slice(0, maxLength - suffix.length)}${suffix}`;
}

function redactSecrets(value) {
  return String(value)
    .replaceAll(/(\b(?:authorization|proxy-authorization)\b\s*[:=]\s*)(?:bearer|basic)\s+[^\s,;"'}]+/gi, `$1${REDACTED}`)
    .replaceAll(SENSITIVE_VALUE_PATTERN, `$1${REDACTED}`)
    .replaceAll(/([?&](?:api[_-]?key|access[_-]?token|token|secret|password|credential|auth)=)[^&\s]+/gi, `$1${REDACTED}`)
    .replaceAll(SECRET_TOKEN_PATTERN, `$1${REDACTED}`);
}

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
 * Any typed-array view is hashed as the bytes it holds. That is not a detail:
 * `eval-quality`'s corpus port returns `bytes` as a plain `Uint8Array`, and a
 * `Uint8Array` reaching the branch below unconverted would be stringified to its
 * decimal spelling and hashed as the text "1,2,3". Every digest taken that way
 * would be wrong and none of them would look wrong, so the conversion is here
 * rather than left to each caller to remember.
 *
 * @param {string|Buffer|Uint8Array|Array<string|Buffer|Uint8Array>} parts
 * @returns {string} `sha256:<hex>`
 */
function digest(parts) {
  const list = Array.isArray(parts) ? parts : [parts];
  const hash = createHash('sha256');
  for (const part of list) {
    const bytes = ArrayBuffer.isView(part) ? Buffer.from(part.buffer, part.byteOffset, part.byteLength) : Buffer.from(String(part), 'utf8');
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
 * The existence check that used to ask has gone: `readBytes` answers absence as a
 * value and raises everything else, so the marker is written where the port says
 * the file was not there and a permission error or a directory in place of a file
 * still reaches the caller. `.present` is tested rather than the bytes, because a
 * zero-byte fixture is present and empty and has always contributed its own empty
 * bytes to the digest.
 *
 * @param {string} projectRoot
 * @param {string[]} relativePaths
 * @returns {Promise<string>}
 */
async function digestFiles(projectRoot, relativePaths) {
  const parts = [];
  for (const relative of [...relativePaths].sort()) {
    const read = await readBytes(path.join(projectRoot, relative));
    parts.push(relative, read.present ? read.bytes : '<missing>');
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
      const value = argument.slice(separator + 1);
      const sanitized = redactSecrets(value);
      redacted.push(`${flag}=${SECRET_FLAG_PATTERN.test(flag) || sanitized !== value ? REDACTED : value}`);
      continue;
    }
    if (argument.startsWith('-') && SECRET_FLAG_PATTERN.test(argument)) {
      redacted.push(argument);
      dropNextValue = true;
      continue;
    }
    const sanitized = redactSecrets(argument);
    redacted.push(sanitized === argument ? argument : REDACTED);
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
 * Build one bounded, secret-free diagnostic for an attempted repetition.
 * Harnesses pass scorer projections or artifact paths, never unrestricted model
 * text. The schema supplies the second line of defence for size and shape.
 */
function diagnosticRecord({
  caseId,
  repetition,
  signature = null,
  metricContributions = {},
  failureClass = 'none',
  rootCause = null,
  reason = null,
  triage = null,
  mappedFailures = [],
  mappedMeasurements = [],
  evidence = [],
}) {
  const failed = failureClass !== 'none' && failureClass !== 'quality';
  const boundedMetrics = Object.fromEntries(
    Object.entries(metricContributions)
      .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
      .slice(0, MAX_DIAGNOSTIC_METRICS)
      .map(([key, value]) => [String(key).slice(0, MAX_DIAGNOSTIC_METRIC_KEY), value]),
  );
  const boundedSignature = signature === null ? null : boundedDiagnosticText(redactSecrets(signature), 4096);
  const normalizedTriage = triage ?? (failureClass === 'quality' && rootCause ? [{ reason: reason ?? rootCause, rootCause }] : []);
  return {
    caseId,
    repetition,
    completionState: failed ? 'failed' : 'completed',
    signature: failed ? null : boundedSignature,
    metricContributions: failed ? {} : boundedMetrics,
    failureClass,
    rootCause,
    reason: reason === null ? null : boundedDiagnosticText(redactSecrets(reason), 2048),
    triage: normalizedTriage.slice(0, 16).map((entry) => ({
      reason: boundedDiagnosticText(redactSecrets(entry.reason), 2048),
      rootCause: entry.rootCause,
    })),
    mappedFailures: [...new Set(mappedFailures)].slice(0, 64).map((entry) => boundedDiagnosticText(redactSecrets(entry), 2048)),
    mappedMeasurements: [...new Set(mappedMeasurements)].slice(0, 64).map((entry) => String(entry).slice(0, 128)),
    evidence: evidence.slice(0, 32).map((entry) => ({
      kind: entry.kind,
      value: boundedDiagnosticText(redactSecrets(entry.value), 2048),
    })),
  };
}

function artifactEvidence(artifactPath, content) {
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  const excerpt = text.replaceAll(/\s+/g, ' ').trim().slice(0, 512) || '[empty artifact]';
  return [
    { kind: 'artifact', value: artifactPath },
    { kind: 'summary', value: `${digest(text)} ${excerpt}` },
  ];
}

/** Flatten an explicit scorer projection into bounded numeric contributions. */
function numericContributions(value, prefix = '', contributions = {}) {
  if (typeof value === 'number') {
    if (Number.isFinite(value) && prefix) contributions[prefix] = value;
    return contributions;
  }
  if (typeof value === 'boolean') {
    if (prefix) contributions[prefix] = value ? 1 : 0;
    return contributions;
  }
  if (Array.isArray(value)) {
    if (prefix) contributions[`${prefix}.count`] = value.length;
    return contributions;
  }
  if (value === null || typeof value !== 'object') return contributions;
  for (const [key, child] of Object.entries(value)) {
    numericContributions(child, prefix ? `${prefix}.${key}` : key, contributions);
  }
  return contributions;
}

function diagnosticRateMiss(entry, prefix, diagnostics) {
  const numerator = entry.metricContributions[`${prefix}.numerator`];
  const denominator = entry.metricContributions[`${prefix}.denominator`];
  const threshold = entry.metricContributions[`${prefix}.threshold`];
  if (denominator > 0) return numerator / denominator < threshold;
  return diagnostics
    .filter((candidate) => candidate.completionState === 'completed')
    .every((candidate) => (candidate.metricContributions[`${prefix}.denominator`] ?? 0) === 0);
}

/** Mark only the completed repetitions that contributed to aggregate quality failures. */
function classifyDiagnosticQuality(diagnostics, failures, classify, runnerContext = {}) {
  if (failures.length === 0) return diagnostics;
  if (typeof classify !== 'function') {
    throw new TypeError('classifyDiagnosticQuality requires a case-level classifier when aggregate quality failures exist');
  }
  const classified = diagnostics.map((entry) => {
    if (entry.completionState !== 'completed') return entry;
    const findings = [];
    const mappedFailures = new Set(entry.mappedFailures ?? []);
    for (const failure of failures) {
      const classification = classify(entry, [failure]);
      if (!classification) continue;
      const classifiedFindings =
        classification.findings ?? classification.reasons?.map((reason) => ({ reason, rootCause: classification.rootCause }));
      if (!Array.isArray(classifiedFindings) || classifiedFindings.length === 0) continue;
      findings.push(...classifiedFindings);
      mappedFailures.add(failure);
    }
    if (findings.length === 0) return entry;
    const uniqueFindings = [...new Map(findings.map((finding) => [`${finding.rootCause}\u0000${finding.reason}`, finding])).values()].slice(
      0,
      16,
    );
    if (uniqueFindings.some((finding) => !finding.rootCause)) {
      throw new TypeError('case-level quality classifications must name a root cause for every reason');
    }
    return {
      ...entry,
      failureClass: 'quality',
      rootCause: uniqueFindings[0].rootCause,
      reason:
        entry.reason ??
        uniqueFindings
          .map((finding) => finding.reason)
          .join('; ')
          .slice(0, 2048),
      triage: uniqueFindings,
      mappedFailures: [...mappedFailures].slice(0, 64),
    };
  });

  const failedDiagnostics = classified.filter((entry) => entry.completionState === 'failed');
  const environmentFailure = /\b(?:short|incomplete|completed|repetition|unmeasurable)\b/i;
  for (const failure of failures) {
    if (classified.some((entry) => entry.mappedFailures?.includes(failure))) continue;
    const failureTokens = new Set(
      String(failure)
        .toLowerCase()
        .match(/[a-z][a-z-]{2,}/g) ?? [],
    );
    let candidates = failedDiagnostics.filter((entry) =>
      (
        String(entry.reason)
          .toLowerCase()
          .match(/[a-z][a-z-]{2,}/g) ?? []
      ).some((token) => failureTokens.has(token)),
    );
    if (candidates.length === 0 && environmentFailure.test(failure)) candidates = failedDiagnostics;
    for (const entry of candidates) entry.mappedFailures = [...new Set([...(entry.mappedFailures ?? []), failure])];
  }

  const measurements = runnerContext.measurements ?? {};
  for (const [name, value] of Object.entries(measurements)) {
    if (value !== null) continue;
    const normalizedName = name.replaceAll(/[^a-z0-9]/gi, '').toLowerCase();
    let candidates = classified.filter((entry) =>
      (entry.mappedFailures ?? []).some((failure) =>
        failure
          .replaceAll(/[^a-z0-9]/gi, '')
          .toLowerCase()
          .includes(normalizedName),
      ),
    );
    if (candidates.length === 0 && runnerContext.completed < runnerContext.expected) {
      candidates = failedDiagnostics;
    }
    for (const entry of candidates) entry.mappedMeasurements = [...new Set([...(entry.mappedMeasurements ?? []), name])];
  }
  return classified;
}

function suiteDiagnosticRecords(entries = []) {
  return entries.map((entry) => {
    const value = typeof entry === 'string' ? { failureClass: entry } : entry;
    const rootCause = value.rootCause ?? (value.failureClass === 'quality' ? 'corpus-defect' : 'harness-defect');
    return {
      failureClass: value.failureClass,
      rootCause,
      reason: value.reason ?? value.message ?? `pre-measurement ${value.failureClass} failure`,
      evidence: value.evidence ?? [{ kind: 'summary', value: value.message ?? value.reason ?? value.failureClass }],
    };
  });
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
  generatedAt,
  mode,
  suite,
  repository,
  fixtureDigest,
  promptDigest,
  cases,
  runners,
  durationMs,
  declaredRepetitions = suite.repetitions,
  suiteFailureClasses = [],
  suiteDiagnostics = [],
  contractVersions = {},
}) {
  const normalizedSuiteDiagnostics = suiteDiagnosticRecords([...suiteFailureClasses, ...suiteDiagnostics]);
  const failureClass = worstFailureClass([
    ...runners.map((runner) => runner.failureClass),
    ...normalizedSuiteDiagnostics.map((entry) => entry.failureClass),
  ]);
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'suite-result',
    // Read through the clock port by the caller, never off the wall clock here.
    // A record whose durations came from a scripted clock and whose stamp came
    // from `new Date()` describes a run that began in March and was generated in
    // September, and nothing in the schema objects.
    generatedAt,
    mode,
    repository,
    suite: {
      id: suite.id,
      evalType: suite.evalType,
      // Empty for an `infrastructure` suite, which declares neither `skill` nor
      // `skills`: `suite.skills ?? [suite.skill]` used to fall back to
      // `[undefined]` for one, which fails the record's own schema rather than
      // describing the suite honestly. The same check `skillsOf` in
      // test/lib/suite-manifest.js applies to the manifest entry itself.
      skills: suite.skills ?? (typeof suite.skill === 'string' ? [suite.skill] : []),
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
      declaredRepetitions,
    },
    runners,
    suiteDiagnostics: normalizedSuiteDiagnostics.map((entry) => ({
      failureClass: entry.failureClass,
      rootCause: entry.rootCause,
      reason: boundedDiagnosticText(redactSecrets(entry.reason), 2048),
      evidence: (entry.evidence ?? []).slice(0, 32).map((evidence) => ({
        kind: evidence.kind,
        value: boundedDiagnosticText(redactSecrets(evidence.value), 2048),
      })),
    })),
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
function runSummaryRecord({ generatedAt, repository, suites, unaccountedSkills, durationMs }) {
  const failureClass = worstFailureClass([
    ...suites.map((suite) => suite.failureClass),
    ...(unaccountedSkills.length > 0 ? ['environment-configuration'] : []),
  ]);
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'run-summary',
    generatedAt,
    repository,
    // The installed `eval-quality`'s own version, not a caller-supplied argument:
    // every suite in `suites` was already scored against this exact install, so
    // asking a caller to pass it back in would only invite the two from
    // disagreeing.
    evalQualityVersion: EVAL_QUALITY_VERSION,
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
async function writeRecord(jsonPath, record, validator) {
  const result = validator(record);
  if (!result.success) {
    throw new Error(`eval result record does not match its schema (harness bug):\n${formatIssues(result.error.issues)}`);
  }
  // Stays on `fs`: the port writes bytes at a path and makes no directories.
  fs.mkdirSync(path.dirname(path.resolve(jsonPath)), { recursive: true });
  await writeText(jsonPath, `${JSON.stringify(record, null, 2)}\n`);
}

/**
 * Refuse to write an evidence record produced under a scripted clock.
 *
 * `TEA_CLOCK_FIXTURE` exists so `test/test-clock-port.js` can prove the clock
 * port is in the path that produces a duration. Left set in a shell it turns a
 * real eval run scripted in silence, and `test/eval-all.js` spawns its children
 * with the parent environment, so it reaches every one of them. The output is a
 * committed evidence record carrying fabricated durations that passes its own
 * schema, which is the worst artifact this repository can produce.
 *
 * The check that scripts the clock opts in through `TEA_CLOCK_FIXTURE_ALLOW_RECORD`,
 * so the one caller that needs a record under a fixture gets one and nothing else
 * does.
 */
function refuseScriptedRecord(filePath) {
  if (!isScripted() || process.env.TEA_CLOCK_FIXTURE_ALLOW_RECORD === '1') return;
  throw new Error(
    `refusing to write ${filePath}: TEA_CLOCK_FIXTURE is set, so every duration in this record came from a scripted clock. ` +
      'Unset it, or set TEA_CLOCK_FIXTURE_ALLOW_RECORD=1 if this run is the check that scripts the clock.',
  );
}

/**
 * @param {string} jsonPath
 * @param {object} record
 * @returns {Promise<void>}
 */
async function writeSuiteResult(jsonPath, record) {
  refuseScriptedRecord(jsonPath);
  await writeRecord(jsonPath, record, validateEvalResult);
}

/**
 * @param {string} jsonPath
 * @param {object} record
 * @returns {Promise<void>}
 */
async function writeRunSummary(jsonPath, record) {
  refuseScriptedRecord(jsonPath);
  await writeRecord(jsonPath, record, validateEvalRun);
}

module.exports = {
  refuseScriptedRecord,
  digest,
  digestFiles,
  digestPrompts,
  repositoryState,
  probeVersion,
  redactArgs,
  redactSecrets,
  classifyAgentError,
  measured,
  diagnosticRecord,
  artifactEvidence,
  numericContributions,
  diagnosticRateMiss,
  classifyDiagnosticQuality,
  suiteDiagnosticRecords,
  suiteResultRecord,
  runSummaryRecord,
  writeSuiteResult,
  writeRunSummary,
};
