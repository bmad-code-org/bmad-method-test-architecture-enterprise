---
name: 'step-04-validate-and-summarize'
description: 'Validate outputs, write structured evidence, and produce automation summary'
outputFile: '{test_artifacts}/automation-summary.md'
---

# Step 4: Validate & Summarize

## STEP GOAL

Validate generated outputs, write structured TA evidence, and produce a concise automation summary.

## MANDATORY EXECUTION RULES

- 📖 Read the entire step file before acting
- ✅ Speak in `{communication_language}`
- ✅ Validate against the checklist before completion
- ✅ Write `{ta_evidence_output}` before workflow completion

---

## EXECUTION PROTOCOLS:

- 🎯 Follow the MANDATORY SEQUENCE exactly
- 💾 Record outputs before proceeding
- 📖 Load the next step only when instructed

## CONTEXT BOUNDARIES:

- Available context: config, loaded artifacts, and knowledge fragments
- Focus: this step's goal only
- Limits: do not execute future steps
- Dependencies: prior steps' outputs (if any)

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly. Do not skip, reorder, or improvise.

## 1. Validate

Use `checklist.md` to validate:

- Framework readiness
- Coverage mapping
- Test quality and structure
- Fixtures, factories, helpers
- Structured TA evidence seed data from Step 3C
- [ ] CLI sessions cleaned up (no orphaned browsers)
- [ ] Temp artifacts stored in `{test_artifacts}/` not random locations

Fix gaps before proceeding.

---

## 2. Polish Output

Before finalizing, review the complete output document for quality:

1. **Remove duplication**: Progressive-append workflow may have created repeated sections — consolidate
2. **Verify consistency**: Ensure terminology, risk scores, and references are consistent throughout
3. **Check completeness**: All template sections should be populated or explicitly marked N/A
4. **Format cleanup**: Ensure markdown formatting is clean (tables aligned, headers consistent, no orphaned references)

---

## 3. Structured Evidence Output

Build and write `{ta_evidence_output}` as valid JSON before workflow completion.
This file is route-facing planning evidence for Archon and other consumers.
It is not a quality gate result.
Keep `{outputFile}` as the human-readable `automation-summary.md` report.

Use `gate: "PASS"` only when the evidence file itself is valid, complete, and consumable.
Use `gate: "ERROR"` when evidence is untrusted, incomplete, invalid, mismatched to the requested story, or missing required report pointers.
Do not use `FAIL` for generated-test quality findings in TA evidence.
Represent those findings in `quality_concerns`.

Read the Step 3C summary seed:

```javascript
const evidenceErrors = [];
let summary = {};

try {
  const rawSummary = fs.readFileSync('{test_artifacts}/tea-automate-summary-{{timestamp}}.json', 'utf8');
  const parsedSummary = JSON.parse(rawSummary);

  if (parsedSummary && typeof parsedSummary === 'object' && !Array.isArray(parsedSummary)) {
    summary = parsedSummary;
  } else {
    evidenceErrors.push('Step 3C summary seed must be a JSON object');
  }
} catch (error) {
  evidenceErrors.push(`Step 3C summary seed is missing or invalid JSON: ${error.message}`);
}

let evidenceData = summary.ta_evidence_data;
if (!evidenceData || typeof evidenceData !== 'object' || Array.isArray(evidenceData)) {
  evidenceErrors.push('ta_evidence_data must be an object');
  evidenceData = {};
}

const requiredArrays = ['changed_tests', 'fixture_needs', 'quality_concerns', 'nfr_signals'];
const isNonNegativeIntegerValue = (value) => {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 0;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const number = Number(value);
    return Number.isInteger(number) && number >= 0;
  }

  return false;
};
const toNonNegativeInteger = (value, fallback = 0) => {
  if (!isNonNegativeIntegerValue(value)) {
    return fallback;
  }

  return Number(value);
};

const normalizePathText = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/\\/g, '/')
    .replace(/^(\.\/)+/, '')
    .trim();
};
const canonicalizePathText = (value) => {
  const normalized = normalizePathText(value);
  const drivePrefixMatch = normalized.match(/^[A-Za-z]:\//);
  const prefix = drivePrefixMatch ? drivePrefixMatch[0] : normalized.startsWith('/') ? '/' : '';
  const body = prefix ? normalized.slice(prefix.length) : normalized;
  const parts = [];

  for (const part of body.split('/')) {
    if (!part || part === '.') {
      continue;
    }

    if (part === '..' && parts.length > 0 && parts[parts.length - 1] !== '..') {
      parts.pop();
      continue;
    }

    parts.push(part);
  }

  return `${prefix}${parts.join('/')}`;
};
const hasNonEmptyString = (value) => typeof value === 'string' && value.trim() !== '';
const hasUnresolvedPlaceholder = (value) => /[{}]/.test(normalizePathText(value));
const isAutomationSummaryPointer = (value) => {
  const normalized = normalizePathText(value);
  return !hasUnresolvedPlaceholder(value) && (normalized === 'automation-summary.md' || normalized.endsWith('/automation-summary.md'));
};
const isAbsolutePath = (value) => value.startsWith('/') || value.startsWith('//') || /^[A-Za-z]:\//.test(value);
const stripPathPrefix = (value, prefix) => {
  if (!prefix || value === prefix) {
    return value;
  }

  return value.startsWith(`${prefix}/`) ? value.slice(prefix.length + 1) : value;
};
const normalizeTestArtifactPath = (value) => {
  const normalized = canonicalizePathText(value);
  const projectRoot = canonicalizePathText(typeof project_root === 'string' ? project_root : '');
  const configuredTestDir = canonicalizePathText(typeof test_dir === 'string' ? test_dir : '');

  if (!normalized) {
    return '';
  }

  if (configuredTestDir && normalized.startsWith(`${configuredTestDir}/`)) {
    return `tests/${normalized.slice(configuredTestDir.length + 1)}`;
  }

  return stripPathPrefix(normalized, projectRoot);
};
const isExpectedTestPath = (value) => {
  const normalized = canonicalizePathText(value);
  const relativePath = normalizeTestArtifactPath(value);

  if (!relativePath || (isAbsolutePath(normalized) && relativePath === normalized)) {
    return false;
  }

  return (
    ['tests/', 'pact/', 'pacts/'].some((prefix) => relativePath.startsWith(prefix)) &&
    !relativePath.split('/').includes('..') &&
    !relativePath.split('/').includes('')
  );
};
const hasDuplicates = (values) => new Set(values).size !== values.length;
const rejectInvalidTestPaths = (label, files) => {
  const invalidFiles = files.filter((file) => !isExpectedTestPath(file));

  if (invalidFiles.length > 0) {
    evidenceErrors.push(`${label} must stay within the generated-test path boundary: ${invalidFiles.join(', ')}`);
  }
};

const normalizePriorityCoverage = (priorityCoverage = {}) => {
  const coverage = priorityCoverage && typeof priorityCoverage === 'object' ? priorityCoverage : {};

  return {
    P0: toNonNegativeInteger(coverage.P0),
    P1: toNonNegativeInteger(coverage.P1),
    P2: toNonNegativeInteger(coverage.P2),
    P3: toNonNegativeInteger(coverage.P3),
  };
};

const fallbackCoverage = {
  total_tests: toNonNegativeInteger(summary.total_tests),
  by_level: {
    api: toNonNegativeInteger(summary.api_tests),
    e2e: toNonNegativeInteger(summary.e2e_tests),
    backend: toNonNegativeInteger(summary.backend_tests),
  },
  priority_coverage: normalizePriorityCoverage(summary.priority_coverage),
};

for (const field of requiredArrays) {
  if (!Array.isArray(evidenceData[field])) {
    evidenceErrors.push(`${field} must be an array`);
    evidenceData[field] = [];
  }
}

let changedTests = evidenceData.changed_tests;
const fixtureNeeds = evidenceData.fixture_needs;
let qualityConcerns = evidenceData.quality_concerns;
let nfrSignals = evidenceData.nfr_signals;
const validatePriorityCoverage = (label, priorityCoverage) => {
  if (!priorityCoverage || typeof priorityCoverage !== 'object' || Array.isArray(priorityCoverage)) {
    evidenceErrors.push(`${label}.priority_coverage must be present`);
    return;
  }

  for (const priority of ['P0', 'P1', 'P2', 'P3']) {
    if (!isNonNegativeIntegerValue(priorityCoverage[priority])) {
      evidenceErrors.push(`${label}.priority_coverage.${priority} must be a non-negative integer`);
    }
  }
};

changedTests = changedTests.map((test, index) => {
  const label = `changed_tests[${index}]`;

  if (!test || typeof test !== 'object' || Array.isArray(test)) {
    evidenceErrors.push(`${label} must be an object`);
    return test;
  }

  for (const field of ['file', 'test_level', 'description', 'source']) {
    if (!hasNonEmptyString(test[field])) {
      evidenceErrors.push(`${label}.${field} must be a non-empty string`);
    }
  }

  validatePriorityCoverage(label, test.priority_coverage);

  return {
    ...test,
    file: normalizeTestArtifactPath(test.file),
    test_level: hasNonEmptyString(test.test_level) ? test.test_level.trim() : test.test_level,
    description: hasNonEmptyString(test.description) ? test.description.trim() : test.description,
    priority_coverage: normalizePriorityCoverage(test.priority_coverage),
    source: hasNonEmptyString(test.source) ? test.source.trim() : test.source,
  };
});

const rawChangedTestFiles = changedTests.map((test) => (test && typeof test === 'object' ? normalizeTestArtifactPath(test.file) : ''));
const changedTestFiles = rawChangedTestFiles.filter(Boolean);

if (rawChangedTestFiles.some((file) => !file)) {
  evidenceErrors.push('changed_tests entries must include file pointers');
}

if (hasDuplicates(changedTestFiles)) {
  evidenceErrors.push('changed_tests entries must not contain duplicate file pointers');
}

rejectInvalidTestPaths('changed_tests entries', changedTestFiles);

let coverage = evidenceData.coverage;
if (!coverage || typeof coverage !== 'object' || Array.isArray(coverage)) {
  evidenceErrors.push('coverage must be present');
  coverage = fallbackCoverage;
} else {
  if (!isNonNegativeIntegerValue(coverage.total_tests)) {
    evidenceErrors.push('coverage.total_tests must be a non-negative integer');
  }

  if (!coverage.by_level || typeof coverage.by_level !== 'object' || Array.isArray(coverage.by_level)) {
    evidenceErrors.push('coverage.by_level must be present');
  }

  for (const level of ['api', 'e2e', 'backend']) {
    if (!isNonNegativeIntegerValue(coverage.by_level?.[level])) {
      evidenceErrors.push(`coverage.by_level.${level} must be a non-negative integer`);
    }
  }

  if (!coverage.priority_coverage || typeof coverage.priority_coverage !== 'object' || Array.isArray(coverage.priority_coverage)) {
    evidenceErrors.push('coverage.priority_coverage must be present');
  }

  for (const priority of ['P0', 'P1', 'P2', 'P3']) {
    if (!isNonNegativeIntegerValue(coverage.priority_coverage?.[priority])) {
      evidenceErrors.push(`coverage.priority_coverage.${priority} must be a non-negative integer`);
    }
  }

  coverage = {
    total_tests: toNonNegativeInteger(coverage.total_tests),
    by_level: {
      api: toNonNegativeInteger(coverage.by_level?.api),
      e2e: toNonNegativeInteger(coverage.by_level?.e2e),
      backend: toNonNegativeInteger(coverage.by_level?.backend),
    },
    priority_coverage: normalizePriorityCoverage(coverage.priority_coverage),
  };

  const byLevelTotal = coverage.by_level.api + coverage.by_level.e2e + coverage.by_level.backend;
  if (coverage.total_tests !== byLevelTotal) {
    evidenceErrors.push('coverage.total_tests must equal the sum of coverage.by_level counts');
  }
}

if (coverage.total_tests > 0 && changedTestFiles.length === 0) {
  evidenceErrors.push('changed_tests must include generated test files when coverage.total_tests is greater than zero');
}

let artifactPointers = evidenceData.artifact_pointers;
if (!artifactPointers || typeof artifactPointers !== 'object' || Array.isArray(artifactPointers)) {
  evidenceErrors.push('artifact_pointers must be present');
  artifactPointers = {};
}

const reportFile = '{outputFile}';
const automationSummaryPointer = artifactPointers.automation_summary || reportFile;
if (!normalizePathText(artifactPointers.automation_summary)) {
  evidenceErrors.push('artifact_pointers.automation_summary must point to automation-summary.md');
}

if (hasUnresolvedPlaceholder(reportFile)) {
  evidenceErrors.push('report_file must be fully resolved before structured evidence is written');
}

if (!isAutomationSummaryPointer(reportFile)) {
  evidenceErrors.push('report_file must reference automation-summary.md');
}

if (hasUnresolvedPlaceholder(automationSummaryPointer)) {
  evidenceErrors.push('artifact_pointers.automation_summary must be fully resolved before structured evidence is written');
}

if (!isAutomationSummaryPointer(automationSummaryPointer)) {
  evidenceErrors.push('automation summary pointer must reference automation-summary.md');
}

let generatedTestFiles = [];
if (!Array.isArray(artifactPointers.generated_test_files)) {
  evidenceErrors.push('artifact_pointers.generated_test_files must be an array');
} else {
  const rawGeneratedTestFiles = artifactPointers.generated_test_files.map(normalizeTestArtifactPath);

  if (rawGeneratedTestFiles.some((file) => !file)) {
    evidenceErrors.push('artifact_pointers.generated_test_files must not contain blank file pointers');
  }

  generatedTestFiles = rawGeneratedTestFiles.filter(Boolean);

  if (hasDuplicates(generatedTestFiles)) {
    evidenceErrors.push('artifact_pointers.generated_test_files must not contain duplicate file pointers');
  }

  rejectInvalidTestPaths('artifact_pointers.generated_test_files', generatedTestFiles);
}

const sameFileSet = (left, right) => {
  const leftSet = new Set(left);
  const rightSet = new Set(right);

  return leftSet.size === rightSet.size && [...leftSet].every((value) => rightSet.has(value));
};

if (!sameFileSet(changedTestFiles, generatedTestFiles)) {
  evidenceErrors.push('changed_tests and artifact_pointers.generated_test_files must reference the same files');
}

const storyRef = typeof story_file === 'string' && story_file.length > 0 ? story_file : null;
const seedStoryRef = evidenceData.story_ref ?? summary.story_ref ?? null;
if (seedStoryRef !== null && seedStoryRef !== storyRef) {
  evidenceErrors.push('story_ref does not match the requested story');
}

nfrSignals = nfrSignals.map((signal, index) => {
  const label = `nfr_signals[${index}]`;

  if (!signal || typeof signal !== 'object' || Array.isArray(signal)) {
    evidenceErrors.push(`${label} must be an object`);
    return signal;
  }

  for (const field of ['category', 'source', 'evidence']) {
    if (!hasNonEmptyString(signal[field])) {
      evidenceErrors.push(`${label}.${field} must be a non-empty string`);
    }
  }

  return {
    ...signal,
    category: hasNonEmptyString(signal.category) ? signal.category.trim() : signal.category,
    source: hasNonEmptyString(signal.source) ? signal.source.trim() : signal.source,
    evidence: hasNonEmptyString(signal.evidence) ? signal.evidence.trim() : signal.evidence,
  };
});

qualityConcerns = qualityConcerns.map((concern, index) => {
  const label = `quality_concerns[${index}]`;

  if (!concern || typeof concern !== 'object' || Array.isArray(concern)) {
    evidenceErrors.push(`${label} must be an object`);
    return concern;
  }

  for (const field of ['category', 'severity', 'source', 'message']) {
    if (!hasNonEmptyString(concern[field])) {
      evidenceErrors.push(`${label}.${field} must be a non-empty string`);
    }
  }

  return {
    ...concern,
    category: hasNonEmptyString(concern.category) ? concern.category.trim() : concern.category,
    severity: hasNonEmptyString(concern.severity) ? concern.severity.trim() : concern.severity,
    source: hasNonEmptyString(concern.source) ? concern.source.trim() : concern.source,
    message: hasNonEmptyString(concern.message) ? concern.message.trim() : concern.message,
  };
});

if (
  qualityConcerns.some((concern) => concern && typeof concern === 'object' && String(concern.severity).trim().toLowerCase() === 'error')
) {
  evidenceErrors.push('quality_concerns contains error-severity entries');
}

const rawRoundValue =
  typeof automation_round === 'undefined' || automation_round === null || automation_round === '' ? 1 : Number(automation_round);
const roundValue = Number.isInteger(rawRoundValue) && rawRoundValue > 0 ? rawRoundValue : 1;
if (!Number.isInteger(rawRoundValue) || rawRoundValue < 1) {
  evidenceErrors.push('round must be a positive integer');
}

const evidenceOutputPath = '{ta_evidence_output}';
if (hasUnresolvedPlaceholder(evidenceOutputPath)) {
  throw new Error('ta_evidence_output must be resolved before writing structured evidence');
}

const evidenceOutputDirectory = normalizePathText(evidenceOutputPath).split('/').slice(0, -1).join('/');

const taEvidence = {
  contract_version: '1.0',
  workflow: 'bmad-testarch-automate',
  story_ref: storyRef,
  node: 'TA',
  round: roundValue,
  gate: evidenceErrors.length === 0 ? 'PASS' : 'ERROR',
  generated_at: new Date().toISOString(),
  report_file: reportFile,
  changed_tests: changedTests,
  fixture_needs: fixtureNeeds,
  quality_concerns: qualityConcerns,
  nfr_signals: nfrSignals,
  coverage,
  artifact_pointers: {
    automation_summary: automationSummaryPointer,
    generated_test_files: generatedTestFiles,
  },
};

if (evidenceErrors.length > 0) {
  taEvidence.quality_concerns.push({
    category: 'evidence-validation',
    severity: 'error',
    source: 'step-04-validate-and-summarize',
    message: 'Structured TA evidence failed validation',
    evidence: evidenceErrors,
  });
}

if (evidenceOutputDirectory) {
  fs.mkdirSync(evidenceOutputDirectory, { recursive: true });
}

fs.writeFileSync(evidenceOutputPath, JSON.stringify(taEvidence, null, 2), 'utf8');
```

Before completion, confirm:

- Required envelope fields exist: `contract_version`, `workflow`, `story_ref`, `node`, `round`, `gate`, `generated_at`, `report_file`, `changed_tests`, `fixture_needs`, `quality_concerns`, `nfr_signals`, `coverage`, and `artifact_pointers`.
- `changed_tests`, `fixture_needs`, `quality_concerns`, and `nfr_signals` are arrays, even when empty.
- Each `changed_tests` entry has string `file`, `test_level`, `description`, and `source` fields plus complete integer priority coverage counts.
- Each `quality_concerns` entry has non-empty `category`, `severity`, `source`, and `message` fields.
- Each `nfr_signals` entry has non-empty `category`, `source`, and `evidence` fields.
- Coverage and priority counts are non-negative integers.
- `coverage.total_tests` equals the sum of `coverage.by_level` counts.
- `report_file` and `artifact_pointers.automation_summary` point to `automation-summary.md`.
- Generated test pointers remain inside expected generated-test boundaries such as `tests/`, `pact/`, `pacts/`, or the configured test directory.
- Any error-severity `quality_concerns` entry makes the evidence `gate` become `ERROR`.
- `{ta_evidence_output}`, `report_file`, and `artifact_pointers.automation_summary` are resolved before writing, so no structured evidence contains literal placeholder paths.
- Missing required fields, invalid JSON, unexpected `story_ref`, or missing report pointers cause a consumer to treat the result as `ERROR`.

## 4. Summary Output

Write `{outputFile}` including:

- Coverage plan by test level and priority
- Files created/updated
- Key assumptions and risks
- Next recommended workflow (e.g., `test-review` or `trace`)
- Pointer to `{ta_evidence_output}` for route-facing structured evidence

---

## 5. Save Progress

**Save this step's accumulated work to `{outputFile}`.**

- **If `{outputFile}` does not exist** (first save), create it with YAML frontmatter:

  ```yaml
  ---
  stepsCompleted: ['step-04-validate-and-summarize']
  lastStep: 'step-04-validate-and-summarize'
  lastSaved: '{date}'
  ---
  ```

  Then write this step's output below the frontmatter.

- **If `{outputFile}` already exists**, update:
  - Add `'step-04-validate-and-summarize'` to `stepsCompleted` array (only if not already present)
  - Set `lastStep: 'step-04-validate-and-summarize'`
  - Set `lastSaved: '{date}'`
  - Append this step's output to the appropriate section.

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Step completed in full with required outputs

### ❌ SYSTEM FAILURE:

- Skipped sequence steps or missing outputs
  **Master Rule:** Skipping steps is FORBIDDEN.

## On Complete

Run: `python3 {project-root}/_bmad/scripts/resolve_customization.py --skill {skill-root} --key workflow.on_complete`

If the resolver succeeds and returns a non-empty `workflow.on_complete`, execute that value as the final terminal instruction before exiting.

If the resolver fails, returns no output, or resolves an empty value, skip the hook and exit normally.
