'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual, stripVTControlCharacters } = require('node:util');
const yaml = require('js-yaml');
const { projectPath } = require('./workflow-cli');
const { generatedInventory, reconcileInventory } = require('./automate-inventory');
const { UNIT_CHECK_KIND, normalizeUnitReport, unitReportRunner } = require('./unit-runners');

const UNUSABLE_CRITERIA_POLICIES = ['halt', 'skip-and-report'];

function unusableCriteriaPolicy(value = 'halt', label = 'workflow.red.unusable_criteria') {
  if (!UNUSABLE_CRITERIA_POLICIES.includes(value)) throw new Error(`${label} must be halt or skip-and-report`);
  return value;
}

const STATUSES = ['passed', 'verified red', 'failed', 'could not measure', 'disabled'];
const RESULT_KEYS = [
  'requestId',
  'validationReportPath',
  'mode',
  'operation',
  'executionStatus',
  'summaryPath',
  'generatedFiles',
  'executionReports',
  'counts',
  'healingRoundsUsed',
  'remainingFailures',
];

function artifactPath(projectRoot, value, label) {
  if (typeof value !== 'string' || value.trim() === '' || value.includes('\0')) throw new Error(`${label} must be a nonempty path`);
  const root = fs.realpathSync(projectRoot);
  const candidate = projectPath(root, value, label);
  let real;
  try {
    real = fs.realpathSync(candidate);
  } catch {
    throw new Error(`${label} does not exist: ${value}`);
  }
  const resolvedRelative = path.relative(root, real);
  if (resolvedRelative === '..' || resolvedRelative.startsWith(`..${path.sep}`) || path.isAbsolute(resolvedRelative))
    throw new Error(`${label} resolves outside the project`);
  if (!fs.statSync(real).isFile()) throw new Error(`${label} must name a file: ${value}`);
  return path.relative(root, real).split(path.sep).join('/');
}

function counts(value, label) {
  const keys = ['executed', 'passed', 'failed', 'skipped', 'intendedFailures'];
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length)
    throw new Error(`${label} must contain exactly ${keys.join(', ')}`);
  for (const key of keys)
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) throw new Error(`${label}.${key} must be a nonnegative integer`);
  if (value.executed !== value.passed + value.failed) throw new Error(`${label}.executed must equal passed + failed`);
  if (value.intendedFailures > value.failed) throw new Error(`${label}.intendedFailures exceeds failed`);
}

function reportCounts(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) return null;
  const result = { executed: 0, passed: 0, failed: 0, skipped: 0, errors: 0, assertionFailures: 0 };
  const assertion = (error) =>
    error?.matcherResult || /(?:^|\n)(?:Error: )?expect\(/.test(stripVTControlCharacters(String(error?.message ?? '')));
  const add = (attempt) => {
    if (attempt.status === 'passed') result.passed++;
    else if (['failed', 'timedOut', 'interrupted'].includes(attempt.status)) {
      result.failed++;
      if (attempt.status !== 'failed') result.errors++;
      else if ((attempt.errors ?? []).some(assertion)) result.assertionFailures++;
    } else if (attempt.status === 'skipped') result.skipped++;
    else throw new Error(`execution report has unsupported attempt status: ${attempt.status}`);
  };
  // Unit attempts carry a classified failure: assertion, timeout or other error.
  const addUnit = (attempt) => {
    switch (attempt.status) {
      case 'passed': {
        result.passed++;
        break;
      }
      case 'skipped': {
        result.skipped++;
        break;
      }
      case 'failed': {
        result.failed++;
        if (attempt.failure === 'timeout') result.errors++;
        else if (attempt.failure === 'assertion') result.assertionFailures++;
        break;
      }
      default: {
        throw new Error(`execution report has unsupported attempt status: ${attempt.status}`);
      }
    }
  };
  if (Array.isArray(report.suites)) {
    result.errors = (report.errors ?? []).length;
    const walk = (suite) => {
      for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) for (const attempt of test.results ?? []) add(attempt);
      for (const child of suite.suites ?? []) walk(child);
    };
    for (const suite of report.suites) walk(suite);
  } else if (unitReportRunner(report)) {
    const normalized = normalizeUnitReport(report);
    result.errors = normalized.errors;
    for (const file of normalized.files) for (const test of file.tests) for (const attempt of test.attempts) addUnit(attempt);
  } else if (report.kind === UNIT_CHECK_KIND) {
    const red = report.mode === 'red';
    if (
      report.schemaVersion !== 1 ||
      !['expand', 'red'].includes(report.mode) ||
      !Array.isArray(report.files) ||
      (red && !Array.isArray(report.productionFilesTouched))
    )
      throw new Error('tea-unit-check report is malformed');
    result.errors = red ? report.productionFilesTouched.length : 0;
    const text = (value) => value === null || (typeof value === 'string' && value.length > 0);
    for (const file of report.files) {
      if (!file || !text(file.loadError) || !text(file.runError) || !(file.exitCode === null || Number.isSafeInteger(file.exitCode)))
        throw new Error('tea-unit-check file result lacks its outcome fields');
      if (file.exitCode === null && !file.loadError && !file.runError)
        throw new Error(`tea-unit-check records no exit code and no error: ${file.file}`);
      if (file.loadError) result.errors++;
      if (file.runError) result.errors++;
      if (!Array.isArray(file.tests)) throw new Error('tea-unit-check file result lacks its tests');
      let failedFinal = false;
      for (const test of file.tests) {
        // Every attempt counts, so a retry cannot hide an earlier wrong-reason failure.
        if (!Array.isArray(test?.attempts) || test.attempts.length === 0) throw new Error('tea-unit-check test lacks its attempts');
        const last = test.attempts.at(-1);
        if (last.status !== test.status || last.failure !== test.failure)
          throw new Error('tea-unit-check test outcome disagrees with its final attempt');
        if (test.status === 'failed') failedFinal = true;
        for (const attempt of test.attempts) {
          if (attempt?.status === 'failed' && !['assertion', 'timeout', 'error'].includes(attempt.failure))
            throw new Error('tea-unit-check failure lacks a classified reason');
          if (attempt?.status !== 'failed' && attempt?.failure !== null)
            throw new Error('tea-unit-check attempt has an unexpected failure reason');
          addUnit(attempt);
        }
      }
      // Vitest and Jest exit nonzero exactly when a test fails, unless a load or run error explains it.
      if (!file.loadError && !file.runError && (file.exitCode !== 0) !== failedFinal)
        throw new Error(`tea-unit-check exit code ${file.exitCode} disagrees with its test results: ${file.file}`);
    }
  } else if (report.schemaVersion === 1 && Array.isArray(report.files) && Array.isArray(report.productionFilesTouched)) {
    result.errors = report.productionFilesTouched.length;
    for (const file of report.files) {
      if (file.loadError) result.errors++;
      for (const test of file.tests ?? []) add({ ...test, errors: [{ message: test.message }] });
    }
  } else return null;
  result.executed = result.passed + result.failed;
  return result;
}

function frontmatter(file) {
  const text = fs.readFileSync(file, 'utf8');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error('summary must retain workflow YAML frontmatter');
  const state = yaml.load(match[1]);
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('artifact frontmatter must be a table');
  return { text, state, hash: createHash('sha256').update(text).digest('hex') };
}

function skippedRedCriteria(checkpoint, text, settings, operation, inventory) {
  const continuing = operation === 'create' || operation === 'resume';
  const savedPolicy = unusableCriteriaPolicy(checkpoint.unusable_criteria, 'checkpoint unusable_criteria');
  const expected = settings.unusable_criteria ?? 'halt';
  if (continuing && savedPolicy !== expected) throw new Error('Red checkpoint changed the resolved unusable_criteria policy');
  const skipped = checkpoint.unusableCriteria;
  if (skipped === undefined && savedPolicy === 'halt') return 0;
  if (!Array.isArray(skipped)) throw new Error('Red checklist must record unusableCriteria as an array');
  if (skipped.length === 0) return 0;
  if (savedPolicy !== 'skip-and-report') throw new Error('Red checklist cannot skip criteria unless skip-and-report is enabled');
  if (!Array.isArray(checkpoint.acceptanceCriteria)) throw new Error('Red checklist must retain all acceptance criteria');

  const registry = new Map();
  for (const row of checkpoint.acceptanceCriteria) {
    if (
      typeof row?.id !== 'string' ||
      !/^AC-[1-9]\d*$/.test(row.id) ||
      typeof row.text !== 'string' ||
      !row.text.trim() ||
      registry.has(row.id)
    ) {
      throw new Error('Red checklist has an invalid acceptance-criteria registry');
    }
    registry.set(row.id, row.text);
  }
  const excluded = new Set();
  for (const row of skipped) {
    if (
      !row ||
      !registry.has(row.id) ||
      row.text !== registry.get(row.id) ||
      typeof row.reason !== 'string' ||
      !row.reason.trim() ||
      excluded.has(row.id)
    ) {
      throw new Error('Red checklist has an unusable criterion with a missing reason, mismatched text, or duplicate ID');
    }
    excluded.add(row.id);
  }
  if (excluded.size >= registry.size) throw new Error('Red checklist has no testable acceptance criteria');

  const section = text.split(/^## Unusable criteria[ \t]*\r?$/m)[1]?.split(/^#{1,2}[ \t]/m)[0] ?? '';
  const listed = [...section.matchAll(/^-[ \t]+(AC-[1-9]\d*):/gm)].map((match) => match[1]);
  if (!isDeepStrictEqual(listed, [...excluded]))
    throw new Error('Red checklist Unusable criteria section must list each skipped ID in order');
  if (continuing && inventory) {
    const active = new Set([...registry.keys()].filter((id) => !excluded.has(id)));
    for (const test of inventory.tests) {
      const [id, ...extra] = test.titlePath.at(-1).match(/\bAC-\d+\b/g) ?? [];
      if (extra.length || !active.delete(id)) throw new Error('Red scaffold titles must map one-to-one to testable criteria');
    }
    if (active.size) throw new Error('Red scaffold inventory omits a testable criterion');
  }
  return excluded.size;
}

function parseResult({
  manifestPath,
  projectRoot,
  mode,
  operation,
  settings,
  startedAtMs,
  requestId,
  story,
  targets = [],
  selectedCheckpoint,
  checkpointBefore,
  evidenceDir,
  runners,
}) {
  let result;
  try {
    result = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`generation manifest is missing or invalid JSON: ${error.message}`);
  }
  if (
    !result ||
    typeof result !== 'object' ||
    Array.isArray(result) ||
    Object.keys(result).length !== RESULT_KEYS.length ||
    RESULT_KEYS.some((key) => !Object.hasOwn(result, key))
  ) {
    throw new Error(`generation manifest must contain exactly ${RESULT_KEYS.join(', ')}`);
  }
  if (result.requestId !== requestId) throw new Error('generation manifest belongs to another CLI request');
  if (operation !== 'validate' && result.validationReportPath !== null) throw new Error('validationReportPath is reserved for Validate');
  if (result.mode !== mode || result.operation !== operation)
    throw new Error('generation manifest mode or operation differs from the request');
  if (!STATUSES.includes(result.executionStatus)) throw new Error(`unsupported execution status: ${result.executionStatus}`);
  result.summaryPath = artifactPath(projectRoot, result.summaryPath, 'summaryPath');
  if (selectedCheckpoint && result.summaryPath !== selectedCheckpoint)
    throw new Error('result summary differs from the selected checkpoint');
  for (const key of ['generatedFiles', 'executionReports']) {
    if (!Array.isArray(result[key]) || new Set(result[key]).size !== result[key].length)
      throw new Error(`${key} must be an array of unique paths`);
    result[key] = result[key].map((file) => artifactPath(projectRoot, file, key));
    if (new Set(result[key]).size !== result[key].length) throw new Error(`${key} contains duplicate resolved paths`);
  }
  if (
    !Array.isArray(result.remainingFailures) ||
    result.remainingFailures.some((failure) => typeof failure !== 'string' || !failure.trim())
  )
    throw new Error('remainingFailures must be an array of nonempty strings');
  if (
    !result.counts ||
    Object.keys(result.counts).length !== 2 ||
    !Object.hasOwn(result.counts, 'initial') ||
    !Object.hasOwn(result.counts, 'final')
  )
    throw new Error('counts must contain initial and final');
  counts(result.counts.initial, 'counts.initial');
  counts(result.counts.final, 'counts.final');
  const actual = { executed: 0, passed: 0, failed: 0, skipped: 0, errors: 0, assertionFailures: 0 };
  const successful = ['passed', 'verified red'].includes(result.executionStatus);
  let recognizedReports = 0;
  const nativeReports = [];
  const reportIdentities = new Set();
  for (const file of result.executionReports) {
    const absolute = path.join(projectRoot, file);
    const stat = fs.statSync(absolute, { bigint: true });
    const identity = `${stat.dev}:${stat.ino}`;
    if (reportIdentities.has(identity)) throw new Error('executionReports repeats the same physical evidence through an alias');
    reportIdentities.add(identity);
    if (
      (['create', 'resume'].includes(operation) || successful) &&
      startedAtMs !== undefined &&
      fs.statSync(absolute).mtimeMs < startedAtMs - 1
    )
      throw new Error(`execution evidence predates this attempt: ${file}`);
    let report;
    try {
      report = JSON.parse(fs.readFileSync(absolute, 'utf8'));
    } catch {
      throw new Error(`execution report is invalid JSON: ${file}`);
    }
    const observed = reportCounts(report);
    if (observed) {
      recognizedReports++;
      nativeReports.push(report);
      for (const key of Object.keys(actual)) actual[key] += observed[key];
    }
  }
  const allRecognized = recognizedReports > 0 && recognizedReports === result.executionReports.length;
  if (successful && !allRecognized) throw new Error('successful execution requires supported native reports for every final scope');
  let inventory;
  if (successful) {
    // The report family selects the registration grammar; reconciliation then
    // requires that family to match a runner the project declared before the run.
    const unitRunner = nativeReports
      .map((report) => (report.kind === UNIT_CHECK_KIND ? report.runner : unitReportRunner(report)))
      .find(Boolean);
    inventory = generatedInventory(projectRoot, result.generatedFiles, { runner: unitRunner ?? 'playwright' });
    if (evidenceDir)
      fs.writeFileSync(path.join(evidenceDir, 'generated-test-inventory.json'), `${JSON.stringify(inventory, null, 2)}\n`, { flag: 'wx' });
    const verified = reconcileInventory(inventory, nativeReports, { mode, runners });
    if (evidenceDir)
      fs.writeFileSync(path.join(evidenceDir, 'validated-test-scopes.json'), `${JSON.stringify(verified, null, 2)}\n`, { flag: 'wx' });
  }
  if (recognizedReports > 0) {
    for (const key of ['executed', 'passed', 'failed', 'skipped'])
      if (allRecognized ? actual[key] !== result.counts.final[key] : actual[key] > result.counts.final[key])
        throw new Error(`counts.final.${key} disagrees with runner reports`);
    if (actual.errors > 0 && successful) throw new Error('successful execution has runner errors or modified production files');
  }
  if (
    !Number.isSafeInteger(result.healingRoundsUsed) ||
    result.healingRoundsUsed < 0 ||
    result.healingRoundsUsed > settings.max_healing_iterations
  )
    throw new Error('healingRoundsUsed exceeds the configured repair budget');

  const summary = frontmatter(path.join(projectRoot, result.summaryPath));
  const checkpoint = summary.state;
  const savedMode = checkpoint.test_mode ?? checkpoint.testMode;
  if (savedMode !== undefined && savedMode !== mode) throw new Error('selected artifact mode differs from the request');
  if (operation === 'create') {
    if (
      checkpoint.cli_request_id !== requestId ||
      checkpoint.cli_story !== (story ?? null) ||
      !isDeepStrictEqual(checkpoint.cli_targets, targets)
    )
      throw new Error('Create summary does not identify this request and scope');
    for (const file of [result.summaryPath, ...result.generatedFiles])
      if (fs.statSync(path.join(projectRoot, file)).mtimeMs < startedAtMs - 1)
        throw new Error(`generation artifact predates this attempt: ${file}`);
    if (story && !(checkpoint.inputDocuments ?? []).includes(story)) throw new Error('Create summary does not retain the requested story');
  }
  if (selectedCheckpoint && checkpointBefore) {
    if (operation === 'validate' && summary.hash !== checkpointBefore.hash) throw new Error('Validate modified the selected checkpoint');
    if (operation === 'edit' && summary.hash === checkpointBefore.hash) throw new Error('Edit did not update the selected checkpoint');
    const identityKeys = ['runScope', 'runKey', 'testEntry', 'testMode', 'test_mode', 'test_operation', 'cli_story', 'cli_targets'];
    if (mode === 'red') identityKeys.push('unusable_criteria', 'unusableCriteria');
    const progressKeys = [
      'workflowStatus',
      'stepsCompleted',
      'lastStep',
      'auto_validate',
      'auto_heal_failures',
      'max_healing_iterations',
      'use_mcp_healing',
      'healing_rounds_used',
    ];
    for (const key of [...identityKeys, ...(operation === 'edit' ? progressKeys : [])])
      if (checkpointBefore.state[key] !== undefined && !isDeepStrictEqual(checkpoint[key], checkpointBefore.state[key]))
        throw new Error(`selected checkpoint changed its saved ${key}`);
    if (operation === 'resume') {
      if (checkpoint.cli_request_id !== requestId) throw new Error('Resume checkpoint does not identify this CLI attempt');
      if (result.healingRoundsUsed < (checkpointBefore.state.healing_rounds_used ?? 0))
        throw new Error('Resume reset its saved repair count');
    }
  }
  if (operation === 'validate') {
    result.validationReportPath = artifactPath(projectRoot, result.validationReportPath, 'validationReportPath');
    const validation = frontmatter(path.join(projectRoot, result.validationReportPath)).state;
    if (
      !['PASS', 'WARN', 'FAIL'].includes(validation.status) ||
      validation.cli_request_id !== requestId ||
      validation.cli_mode !== mode ||
      validation.cli_operation !== 'validate'
    )
      throw new Error('validation report is incomplete or belongs to another request');
    const selected = (validation.validated_artifacts ?? []).map((file) => artifactPath(projectRoot, file, 'validated_artifacts'));
    if (!selected.includes(selectedCheckpoint)) throw new Error('validation report omits the selected checkpoint');
    if (fs.statSync(path.join(projectRoot, result.validationReportPath)).mtimeMs < startedAtMs - 1)
      throw new Error('validation report predates this attempt');
    if (validation.status === 'FAIL' && result.executionStatus !== 'failed')
      throw new Error('failed validation must report a failed outcome');
  }
  if (operation === 'create' || operation === 'resume') {
    if (checkpoint?.workflowStatus !== 'completed')
      throw new Error(`generation checkpoint is incomplete: workflowStatus is ${JSON.stringify(checkpoint?.workflowStatus ?? null)}`);
    const terminal = mode === 'red' ? 'step-05-validate-and-complete' : 'step-04-validate-and-summarize';
    const required =
      mode === 'red'
        ? ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', terminal]
        : ['step-01-preflight-and-context', 'step-02-identify-targets', terminal];
    const aggregation =
      mode === 'red' ? ['step-04c-aggregate', 'step-04-generate-tests'] : ['step-03c-aggregate', 'step-03-generate-tests'];
    const completed = Array.isArray(checkpoint.stepsCompleted) ? checkpoint.stepsCompleted : [];
    const missing = required.filter((step) => !completed.includes(step));
    if (!aggregation.some((step) => completed.includes(step))) missing.push(`one of ${aggregation.join(' or ')}`);
    if (missing.length > 0 || checkpoint.lastStep !== terminal)
      throw new Error(
        `generation checkpoint does not retain completed mode-specific steps and terminal step: missing ${missing.join(', ') || 'none'}; lastStep ${JSON.stringify(checkpoint.lastStep ?? null)}; expected ${terminal}`,
      );
    if (result.generatedFiles.length === 0) throw new Error('generation completed without generated files');
    if (checkpoint.test_mode !== mode || checkpoint.test_operation !== 'create')
      throw new Error('generation checkpoint has inconsistent mode or operation');
    for (const key of ['auto_validate', 'auto_heal_failures', 'max_healing_iterations', 'use_mcp_healing']) {
      if (checkpoint[key] !== settings[key]) throw new Error(`generation checkpoint changed ${key}`);
    }
    if (checkpoint.healing_rounds_used !== result.healingRoundsUsed)
      throw new Error('generation checkpoint and manifest disagree on repair rounds');
    if (
      (!settings.auto_validate || !settings.auto_heal_failures) &&
      result.healingRoundsUsed !== (operation === 'resume' ? (checkpointBefore?.state.healing_rounds_used ?? 0) : 0)
    )
      throw new Error('disabled healing cannot consume repair rounds');
    if (!settings.auto_validate && result.executionStatus !== 'disabled') throw new Error('disabled validation must report disabled');
    if (settings.auto_validate && result.executionStatus === 'disabled')
      throw new Error('validation was enabled but execution reports disabled');
  }
  if (mode === 'red') result.skippedCriteriaCount = skippedRedCriteria(checkpoint, summary.text, settings, operation, inventory);
  const final = result.counts.final;
  if (['passed', 'verified red'].includes(result.executionStatus)) {
    if (final.executed === 0 || final.skipped !== 0 || result.executionReports.length === 0)
      throw new Error('successful execution requires executed tests, reports, and no skipped results');
    if (result.executionStatus === 'passed' && (mode !== 'expand' || final.failed !== 0))
      throw new Error('passed requires expand mode with no failed tests');
    if (
      result.executionStatus === 'verified red' &&
      (mode !== 'red' || final.passed !== 0 || final.intendedFailures !== final.failed || actual.assertionFailures !== final.failed)
    )
      throw new Error('verified red requires every executed test to fail for its intended criterion');
  }
  if (['failed', 'could not measure'].includes(result.executionStatus) && result.remainingFailures.length === 0)
    throw new Error('failed or unmeasured execution requires a reported reason');
  return result;
}

module.exports = { STATUSES, RESULT_KEYS, artifactPath, parseResult, reportCounts, frontmatter, unusableCriteriaPolicy };
