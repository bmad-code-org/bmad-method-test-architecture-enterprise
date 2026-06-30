---
name: 'step-03c-aggregate'
description: 'Aggregate subagent outputs, structured evidence data, and test infrastructure'
outputFile: '{test_artifacts}/automation-summary.md'
nextStepFile: '{skill-root}/steps-c/step-04-validate-and-summarize.md'
---

# Step 3C: Aggregate Test Generation Results

## STEP GOAL

Read outputs from parallel subagents (API + E2E and/or Backend test generation based on `{detected_stack}`), aggregate results, prepare structured TA evidence data, and create supporting infrastructure (fixtures, helpers).

---

## MANDATORY EXECUTION RULES

- 📖 Read the entire step file before acting
- ✅ Speak in `{communication_language}`
- ✅ Read subagent outputs from temp files
- ✅ Generate shared fixtures based on fixture needs from both subagents
- ✅ Write all generated test files to disk
- ✅ Normalize worker outputs into machine-readable TA evidence data for Step 4
- ✅ Prepare data for the final Step 4 envelope fields: `contract_version`, `workflow`, `story_ref`, `node`, `round`, `gate`, `generated_at`, `report_file`, `changed_tests`, `fixture_needs`, `quality_concerns`, `nfr_signals`, `coverage`, and `artifact_pointers`
- ❌ Do NOT regenerate tests (use subagent outputs)
- ❌ Do NOT run tests yet (that's step 4)
- ❌ Do NOT write `{ta_evidence_output}` in this step; Step 4 validates the seed data and writes the final envelope

---

## EXECUTION PROTOCOLS:

- 🎯 Follow the MANDATORY SEQUENCE exactly
- 💾 Record outputs before proceeding
- 📖 Load the next step only when instructed

## CONTEXT BOUNDARIES:

- Available context: config, subagent outputs from temp files
- Focus: aggregation and fixture generation only
- Limits: do not execute future steps
- Dependencies: Step 3A and 3B subagent outputs

---

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly. Do not skip, reorder, or improvise.

### 1. Read Subagent Outputs

**Read API test subagent output (always):**

```javascript
const workerReadConcerns = [];
const toWorkerOutputObject = (value, source) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }

  workerReadConcerns.push({
    category: 'worker-output-shape',
    severity: 'error',
    source,
    message: 'Worker output must be a JSON object',
  });

  return { success: false };
};
const readWorkerOutput = (filePath, source) => {
  try {
    return toWorkerOutputObject(JSON.parse(fs.readFileSync(filePath, 'utf8')), source);
  } catch (error) {
    workerReadConcerns.push({
      category: 'worker-output-read',
      severity: 'error',
      source,
      message: `Worker output is missing or invalid JSON: ${error.message}`,
      evidence: filePath,
    });

    return { success: false };
  }
};

const apiTestsPath = '/tmp/tea-automate-api-tests-{{timestamp}}.json';
const apiTestsOutput = readWorkerOutput(apiTestsPath, 'api-tests');
```

**Read E2E test subagent output (if {detected_stack} is `frontend` or `fullstack`):**

```javascript
let e2eTestsOutput = null;
if (detected_stack === 'frontend' || detected_stack === 'fullstack') {
  const e2eTestsPath = '/tmp/tea-automate-e2e-tests-{{timestamp}}.json';
  e2eTestsOutput = readWorkerOutput(e2eTestsPath, 'e2e-tests');
}
```

**Read Backend test subagent output (if {detected_stack} is `backend` or `fullstack`):**

```javascript
let backendTestsOutput = null;
if (detected_stack === 'backend' || detected_stack === 'fullstack') {
  const backendTestsPath = '/tmp/tea-automate-backend-tests-{{timestamp}}.json';
  backendTestsOutput = readWorkerOutput(backendTestsPath, 'backend-tests');
}
```

**Verify all launched subagents succeeded:**

- Check `apiTestsOutput.success === true`
- If E2E was launched: check `e2eTestsOutput.success === true`
- If Backend was launched: check `backendTestsOutput.success === true`
- If any failed, do not write files from that worker.
- Continue aggregation so Step 4 can emit `ERROR` evidence with worker concerns.

---

### 2. Write All Test Files to Disk

**Write API test files:**

```javascript
const fileWriteConcerns = [];
const writtenGeneratedTestFiles = [];
const normalizeGeneratedTestPath = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/\\/g, '/')
    .replace(/^(\.\/)+/, '')
    .trim();
};
const canonicalizeGeneratedTestPath = (value) => {
  const normalized = normalizeGeneratedTestPath(value);
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
const isAbsoluteGeneratedTestPath = (value) => value.startsWith('/') || value.startsWith('//') || /^[A-Za-z]:\//.test(value);
const stripGeneratedTestPrefix = (value, prefix) => {
  if (!prefix || value === prefix) {
    return value;
  }

  return value.startsWith(`${prefix}/`) ? value.slice(prefix.length + 1) : value;
};
const normalizeGeneratedTestArtifactPath = (value) => {
  const normalized = canonicalizeGeneratedTestPath(value);
  const projectRoot = canonicalizeGeneratedTestPath(typeof project_root === 'string' ? project_root : '');
  const configuredTestDir = canonicalizeGeneratedTestPath(typeof test_dir === 'string' ? test_dir : '');

  if (!normalized) {
    return '';
  }

  if (configuredTestDir && normalized.startsWith(`${configuredTestDir}/`)) {
    return `tests/${normalized.slice(configuredTestDir.length + 1)}`;
  }

  return stripGeneratedTestPrefix(normalized, projectRoot);
};
const isExpectedGeneratedTestPath = (value) => {
  const normalized = canonicalizeGeneratedTestPath(value);
  const relativePath = normalizeGeneratedTestArtifactPath(value);

  if (!relativePath || (isAbsoluteGeneratedTestPath(normalized) && relativePath === normalized)) {
    return false;
  }

  return (
    ['tests/', 'pact/', 'pacts/'].some((prefix) => relativePath.startsWith(prefix)) &&
    !relativePath.split('/').includes('..') &&
    !relativePath.split('/').includes('')
  );
};
const generatedTestDirectory = (filePath) => {
  const normalized = canonicalizeGeneratedTestPath(filePath);
  const lastSlash = normalized.lastIndexOf('/');

  return lastSlash > 0 ? normalized.slice(0, lastSlash) : '';
};
const seenGeneratedTestFiles = new Set();
const workerStatusText = (output) =>
  output?.status === undefined || output?.status === null ? '' : String(output.status).trim().toLowerCase();
const workerStatusIndicatesFailure = (output) => ['fail', 'failed', 'error', 'errored'].includes(workerStatusText(output));
const isTrustedWorkerOutput = (output) => output?.success === true && !workerStatusIndicatesFailure(output);
const writeGeneratedTests = (tests, source) => {
  if (!Array.isArray(tests)) {
    return;
  }

  tests.forEach((test) => {
    if (!test || typeof test !== 'object' || typeof test.file !== 'string' || typeof test.content !== 'string') {
      fileWriteConcerns.push({
        category: 'worker-output-shape',
        severity: 'error',
        source,
        message: 'Generated test entries must include string file and content fields',
        evidence: test?.file || null,
      });
      return;
    }

    const artifactFile = normalizeGeneratedTestArtifactPath(test.file);

    if (!isExpectedGeneratedTestPath(test.file)) {
      fileWriteConcerns.push({
        category: 'worker-output-path',
        severity: 'error',
        source,
        message: 'Generated test file path must stay within the expected generated-test boundary',
        evidence: test.file,
      });
      return;
    }

    if (seenGeneratedTestFiles.has(artifactFile)) {
      fileWriteConcerns.push({
        category: 'worker-output-path',
        severity: 'error',
        source,
        message: 'Generated test file path duplicates another worker output',
        evidence: test.file,
      });
      return;
    }

    seenGeneratedTestFiles.add(artifactFile);

    try {
      const directory = generatedTestDirectory(artifactFile);
      if (directory) {
        fs.mkdirSync(directory, { recursive: true });
      }

      fs.writeFileSync(artifactFile, test.content, 'utf8');
      writtenGeneratedTestFiles.push(artifactFile);
      console.log(`✅ Created: ${artifactFile}`);
    } catch (error) {
      fileWriteConcerns.push({
        category: 'worker-output-write',
        severity: 'error',
        source,
        message: `Generated test file could not be written: ${error.message}`,
        evidence: test.file,
      });
    }
  });
};

if (isTrustedWorkerOutput(apiTestsOutput)) {
  writeGeneratedTests(apiTestsOutput.tests, 'api-tests');
}
```

**Write E2E test files (if {detected_stack} is `frontend` or `fullstack`):**

```javascript
if (isTrustedWorkerOutput(e2eTestsOutput)) {
  writeGeneratedTests(e2eTestsOutput.tests, 'e2e-tests');
}
```

**Write Backend test files (if {detected_stack} is `backend` or `fullstack`):**

```javascript
if (isTrustedWorkerOutput(backendTestsOutput)) {
  writeGeneratedTests(backendTestsOutput.testsGenerated, 'backend-tests');
}
```

---

### 3. Aggregate Fixture Needs

**Collect all fixture needs from all launched subagents:**

```javascript
const toFixtureArray = (value) => (Array.isArray(value) ? value : []);
const fixtureStatusText = (output) =>
  output?.status === undefined || output?.status === null ? '' : String(output.status).trim().toLowerCase();
const isTrustedFixtureWorker = (output) =>
  output?.success === true && !['fail', 'failed', 'error', 'errored'].includes(fixtureStatusText(output));
const toTrustedFixtureArray = (output, value) => (isTrustedFixtureWorker(output) ? toFixtureArray(value) : []);
const apiFixtureNeeds =
  typeof apiTestsOutput === 'undefined' || !apiTestsOutput ? [] : toTrustedFixtureArray(apiTestsOutput, apiTestsOutput.fixture_needs);
const e2eFixtureNeeds =
  typeof e2eTestsOutput === 'undefined' || !e2eTestsOutput ? [] : toTrustedFixtureArray(e2eTestsOutput, e2eTestsOutput.fixture_needs);
const backendFixtureNeeds =
  typeof backendTestsOutput === 'undefined' || !backendTestsOutput
    ? []
    : toTrustedFixtureArray(backendTestsOutput, backendTestsOutput.coverageSummary?.fixtureNeeds);
const allFixtureNeeds = [...apiFixtureNeeds, ...e2eFixtureNeeds, ...backendFixtureNeeds];

// Remove duplicates
const uniqueFixtures = [...new Set(allFixtureNeeds)];
```

**Categorize fixtures:**

- **Authentication fixtures:** authToken, authenticatedUserFixture, etc.
- **Data factories:** userDataFactory, productDataFactory, etc.
- **Network mocks:** paymentMockFixture, apiResponseMocks, etc.
- **Test helpers:** wait/retry/assertion helpers

---

### 4. Generate Fixture Infrastructure

**Create or update fixture files based on needs:**

**A) Authentication Fixtures** (`tests/fixtures/auth.ts`):

```typescript
import { test as base } from '@playwright/test';

export const test = base.extend({
  authenticatedUser: async ({ page }, use) => {
    // Login logic
    await page.goto('/login');
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'password');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');

    await use(page);
  },

  authToken: async ({ request }, use) => {
    // Get auth token for API tests
    const response = await request.post('/api/auth/login', {
      data: { email: 'test@example.com', password: 'password' },
    });
    const { token } = await response.json();

    await use(token);
  },
});
```

**B) Data Factories** (`tests/fixtures/data-factories.ts`):

```typescript
import { faker } from '@faker-js/faker';

export const createUserData = (overrides = {}) => ({
  name: faker.person.fullName(),
  email: faker.internet.email(),
  ...overrides,
});

export const createProductData = (overrides = {}) => ({
  name: faker.commerce.productName(),
  price: faker.number.int({ min: 10, max: 1000 }),
  ...overrides,
});
```

**C) Network Mocks** (`tests/fixtures/network-mocks.ts`):

```typescript
import { Page } from '@playwright/test';

export const mockPaymentSuccess = async (page: Page) => {
  await page.route('/api/payment/**', (route) => {
    route.fulfill({
      status: 200,
      body: JSON.stringify({ success: true, transactionId: '12345' }),
    });
  });
};
```

**D) Helper Utilities** (`tests/fixtures/helpers.ts`):

```typescript
import { Page } from '@playwright/test';
import { interceptNetworkCall } from '@seontechnologies/playwright-utils/intercept-network-call';

export const observeApiCall = (page: Page, urlPattern: string, method: string = 'GET') => {
  return interceptNetworkCall({
    page,
    method,
    url: urlPattern,
  });
};
```

---

### 5. Calculate Summary Statistics

**Aggregate test counts (based on `{detected_stack}`):**

```javascript
const toArray = (value) => (Array.isArray(value) ? value : []);
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
const toObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

const safeApiTestsOutput = toObject(typeof apiTestsOutput === 'undefined' ? null : apiTestsOutput);
const safeE2eTestsOutput = typeof e2eTestsOutput === 'undefined' || !e2eTestsOutput ? null : toObject(e2eTestsOutput);
const safeBackendTestsOutput = typeof backendTestsOutput === 'undefined' || !backendTestsOutput ? null : toObject(backendTestsOutput);
const evidenceWorkerStatusText = (output) =>
  output?.status === undefined || output?.status === null ? '' : String(output.status).trim().toLowerCase();
const evidenceWorkerStatusIndicatesFailure = (output) => ['fail', 'failed', 'error', 'errored'].includes(evidenceWorkerStatusText(output));
const isTrustedEvidenceWorker =
  typeof isTrustedWorkerOutput === 'function'
    ? isTrustedWorkerOutput
    : (output) => output?.success === true && !evidenceWorkerStatusIndicatesFailure(output);
const normalizeEvidencePathText = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/\\/g, '/')
    .replace(/^(\.\/)+/, '')
    .trim();
};
const canonicalizeEvidencePath = (value) => {
  const normalized = normalizeEvidencePathText(value);
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
const stripEvidencePathPrefix = (value, prefix) => {
  if (!prefix || value === prefix) {
    return value;
  }

  return value.startsWith(`${prefix}/`) ? value.slice(prefix.length + 1) : value;
};
const normalizeEvidenceArtifactPath =
  typeof normalizeGeneratedTestArtifactPath === 'function'
    ? normalizeGeneratedTestArtifactPath
    : (value) => {
        const normalized = canonicalizeEvidencePath(value);
        const projectRoot = canonicalizeEvidencePath(typeof project_root === 'string' ? project_root : '');
        const configuredTestDir = canonicalizeEvidencePath(typeof test_dir === 'string' ? test_dir : '');

        if (!normalized) {
          return '';
        }

        if (configuredTestDir && normalized.startsWith(`${configuredTestDir}/`)) {
          return `tests/${normalized.slice(configuredTestDir.length + 1)}`;
        }

        return stripEvidencePathPrefix(normalized, projectRoot);
      };
const hasWrittenGeneratedTestFiles = Array.isArray(typeof writtenGeneratedTestFiles === 'undefined' ? null : writtenGeneratedTestFiles);
const writtenGeneratedTestFileSet = new Set(
  hasWrittenGeneratedTestFiles ? writtenGeneratedTestFiles.map(normalizeEvidenceArtifactPath).filter(Boolean) : [],
);
const toSuccessfulTests = (output, field) => (isTrustedEvidenceWorker(output) ? toArray(output[field]) : []);
const filterWrittenTests = (tests) =>
  hasWrittenGeneratedTestFiles ? tests.filter((test) => writtenGeneratedTestFileSet.has(normalizeEvidenceArtifactPath(test?.file))) : tests;
const apiWorkerTests = toSuccessfulTests(safeApiTestsOutput, 'tests');
const e2eWorkerTests = safeE2eTestsOutput ? toSuccessfulTests(safeE2eTestsOutput, 'tests') : [];
const backendWorkerTests = safeBackendTestsOutput ? toSuccessfulTests(safeBackendTestsOutput, 'testsGenerated') : [];
const apiTests = filterWrittenTests(apiWorkerTests);
const e2eTests = filterWrittenTests(e2eWorkerTests);
const backendTests = filterWrittenTests(backendWorkerTests);
const apiCount = isTrustedEvidenceWorker(safeApiTestsOutput) ? toNonNegativeInteger(safeApiTestsOutput.test_count, apiTests.length) : 0;
const e2eCount = isTrustedEvidenceWorker(safeE2eTestsOutput) ? toNonNegativeInteger(safeE2eTestsOutput.test_count, e2eTests.length) : 0;
const backendCount = isTrustedEvidenceWorker(safeBackendTestsOutput)
  ? toNonNegativeInteger(safeBackendTestsOutput.coverageSummary?.totalTests, backendTests.length)
  : 0;

const resolvedMode = subagentContext?.execution?.resolvedMode;
const subagentExecutionLabel =
  resolvedMode === 'sequential'
    ? 'SEQUENTIAL (API then dependent workers)'
    : resolvedMode === 'agent-team'
      ? 'AGENT-TEAM (parallel worker squad)'
      : resolvedMode === 'subagent'
        ? 'SUBAGENT (parallel subagents)'
        : `PARALLEL (based on ${detected_stack})`;
const performanceGainLabel =
  resolvedMode === 'sequential'
    ? 'baseline (no parallel speedup)'
    : resolvedMode === 'agent-team' || resolvedMode === 'subagent'
      ? '~40-70% faster than sequential'
      : 'mode-dependent';

const normalizePriorityCoverage = (priorityCoverage = {}) => {
  const coverage = priorityCoverage && typeof priorityCoverage === 'object' ? priorityCoverage : {};

  return {
    P0: toNonNegativeInteger(coverage.P0),
    P1: toNonNegativeInteger(coverage.P1),
    P2: toNonNegativeInteger(coverage.P2),
    P3: toNonNegativeInteger(coverage.P3),
  };
};

const collectPriorityCoverageValueConcerns = (priorityCoverage, source, label) => {
  if (priorityCoverage === undefined || priorityCoverage === null) {
    return [];
  }

  if (typeof priorityCoverage !== 'object' || Array.isArray(priorityCoverage)) {
    return [
      {
        category: 'worker-output-value',
        severity: 'error',
        source,
        message: `${label} must be an object when present`,
      },
    ];
  }

  return ['P0', 'P1', 'P2', 'P3']
    .filter((priority) => priorityCoverage[priority] !== undefined && !isNonNegativeIntegerValue(priorityCoverage[priority]))
    .map((priority) => ({
      category: 'worker-output-value',
      severity: 'error',
      source,
      message: `${label}.${priority} must be a non-negative integer`,
    }));
};

const collectWorkerValueConcerns = (output, source, countPath, tests) => {
  const concerns = [];
  const safeOutput = output && typeof output === 'object' ? output : {};

  if (!isTrustedEvidenceWorker(safeOutput)) {
    return concerns;
  }

  const countValue = countPath === 'coverageSummary.totalTests' ? safeOutput.coverageSummary?.totalTests : safeOutput[countPath];

  if (countValue !== undefined && !isNonNegativeIntegerValue(countValue)) {
    concerns.push({
      category: 'worker-output-value',
      severity: 'error',
      source,
      message: `Worker output field ${countPath} must be a non-negative integer`,
    });
  }

  concerns.push(...collectPriorityCoverageValueConcerns(safeOutput.priority_coverage, source, 'priority_coverage'));

  toArray(tests).forEach((test, index) => {
    if (!test || typeof test !== 'object') {
      concerns.push({
        category: 'worker-output-shape',
        severity: 'error',
        source,
        message: `Worker output test entry ${index} must be an object`,
      });
      return;
    }

    concerns.push(...collectPriorityCoverageValueConcerns(test.priority_coverage, source, `tests[${index}].priority_coverage`));
  });

  return concerns;
};

const addPriorityCoverage = (left, right) => ({
  P0: left.P0 + right.P0,
  P1: left.P1 + right.P1,
  P2: left.P2 + right.P2,
  P3: left.P3 + right.P3,
});

const sumTestPriorityCoverage = (tests) =>
  tests.reduce(
    (totals, test) => addPriorityCoverage(totals, normalizePriorityCoverage(test?.priority_coverage)),
    normalizePriorityCoverage(),
  );

const mergePriorityCoverage = (primary = {}, fallback = normalizePriorityCoverage()) => {
  const coverage = primary && typeof primary === 'object' ? primary : {};

  return {
    P0: Object.hasOwn(coverage, 'P0') && isNonNegativeIntegerValue(coverage.P0) ? toNonNegativeInteger(coverage.P0) : fallback.P0,
    P1: Object.hasOwn(coverage, 'P1') && isNonNegativeIntegerValue(coverage.P1) ? toNonNegativeInteger(coverage.P1) : fallback.P1,
    P2: Object.hasOwn(coverage, 'P2') && isNonNegativeIntegerValue(coverage.P2) ? toNonNegativeInteger(coverage.P2) : fallback.P2,
    P3: Object.hasOwn(coverage, 'P3') && isNonNegativeIntegerValue(coverage.P3) ? toNonNegativeInteger(coverage.P3) : fallback.P3,
  };
};

const resolvePriorityCoverage = (output, tests) =>
  isTrustedEvidenceWorker(output)
    ? mergePriorityCoverage(output?.priority_coverage, sumTestPriorityCoverage(tests))
    : normalizePriorityCoverage();

const apiPriorityCoverage = resolvePriorityCoverage(safeApiTestsOutput, apiTests);
const e2ePriorityCoverage = safeE2eTestsOutput ? resolvePriorityCoverage(safeE2eTestsOutput, e2eTests) : normalizePriorityCoverage();
const backendPriorityCoverage = safeBackendTestsOutput
  ? resolvePriorityCoverage(safeBackendTestsOutput, backendTests)
  : normalizePriorityCoverage();
const totalPriorityCoverage = [apiPriorityCoverage, e2ePriorityCoverage, backendPriorityCoverage].reduce(
  addPriorityCoverage,
  normalizePriorityCoverage(),
);

const normalizeChangedTest = (test, testLevel, source) => {
  const safeTest = test && typeof test === 'object' ? test : {};

  return {
    file: typeof safeTest.file === 'string' && safeTest.file.trim().length > 0 ? normalizeEvidenceArtifactPath(safeTest.file) : null,
    test_level: safeTest.test_level || testLevel,
    description: safeTest.description || safeTest.name || safeTest.summary || `Generated ${testLevel} test`,
    priority_coverage: normalizePriorityCoverage(safeTest.priority_coverage),
    source,
  };
};

const changedTests = [
  ...apiTests.map((test) => normalizeChangedTest(test, 'api', 'api-tests')),
  ...e2eTests.map((test) => normalizeChangedTest(test, 'e2e', 'e2e-tests')),
  ...backendTests.map((test) => normalizeChangedTest(test, test?.test_level || 'backend', 'backend-tests')),
];

const collectQualityConcerns = (output, source) => {
  const concerns = [];
  const safeOutput = output && typeof output === 'object' ? output : {};

  if (safeOutput.quality_concerns !== undefined && !Array.isArray(safeOutput.quality_concerns)) {
    concerns.push({
      category: 'worker-output-shape',
      severity: 'error',
      source,
      message: 'Worker output field quality_concerns must be an array when present',
    });
  }

  if (Array.isArray(safeOutput.quality_concerns)) {
    concerns.push(
      ...safeOutput.quality_concerns.map((concern) =>
        concern && typeof concern === 'object'
          ? { ...concern, source }
          : {
              category: 'worker-quality',
              severity: 'warn',
              source,
              message: String(concern),
            },
      ),
    );
  }

  if (safeOutput.validation_issues !== undefined && !Array.isArray(safeOutput.validation_issues)) {
    concerns.push({
      category: 'worker-output-shape',
      severity: 'error',
      source,
      message: 'Worker output field validation_issues must be an array when present',
    });
  }

  if (Array.isArray(safeOutput.validation_issues)) {
    concerns.push(
      ...safeOutput.validation_issues.map((issue) => ({
        category: 'validation',
        severity: 'warn',
        source,
        message: String(issue),
      })),
    );
  }

  const status = safeOutput.status === undefined || safeOutput.status === null ? '' : String(safeOutput.status).trim().toLowerCase();

  if (
    safeOutput.provider_scrutiny === 'pending' ||
    safeOutput.provider_scrutiny?.pending ||
    safeOutput.provider_scrutiny?.status === 'pending'
  ) {
    concerns.push({
      category: 'provider-scrutiny',
      severity: 'warn',
      source,
      message: 'Provider scrutiny is pending for one or more generated tests',
      evidence: safeOutput.provider_scrutiny,
    });
  }

  if (safeOutput.success !== true) {
    concerns.push({
      category: 'worker-status',
      severity: 'error',
      source,
      message: 'Worker did not report success: true',
    });
  }

  if (status && !['complete', 'pass', 'passed', 'success'].includes(status)) {
    concerns.push({
      category: 'worker-status',
      severity: ['fail', 'failed', 'error', 'errored'].includes(status) ? 'error' : 'warn',
      source,
      message: `Worker reported status: ${safeOutput.status}`,
    });
  }

  return concerns;
};

const collectWorkerShapeConcerns = (output, source, expectedArrayFields) =>
  expectedArrayFields
    .filter((field) => !Array.isArray(output?.[field]))
    .map((field) => ({
      category: 'worker-output-shape',
      severity: 'error',
      source,
      message: `Worker output field ${field} must be an array`,
    }));

const collectWorkerFixtureConcerns = (output, source) => {
  if (!output || typeof output !== 'object') {
    return [];
  }

  if (source === 'backend-tests') {
    return output.coverageSummary?.fixtureNeeds !== undefined && !Array.isArray(output.coverageSummary.fixtureNeeds)
      ? [
          {
            category: 'worker-output-shape',
            severity: 'error',
            source,
            message: 'Worker output field coverageSummary.fixtureNeeds must be an array when present',
          },
        ]
      : [];
  }

  return !Array.isArray(output.fixture_needs)
    ? [
        {
          category: 'worker-output-shape',
          severity: 'error',
          source,
          message: 'Worker output field fixture_needs must be an array',
        },
      ]
    : [];
};

const collectNfrSignals = (output, source) => {
  const safeOutput = output && typeof output === 'object' ? output : {};
  if (!isTrustedEvidenceWorker(safeOutput)) {
    return [];
  }

  const directSignals = Array.isArray(safeOutput.nfr_signals) ? safeOutput.nfr_signals : [];
  const summarySignals = Array.isArray(safeOutput.coverageSummary?.nfrSignals) ? safeOutput.coverageSummary.nfrSignals : [];
  const testSignals = [
    ...(Array.isArray(safeOutput.tests) ? safeOutput.tests : []),
    ...(Array.isArray(safeOutput.testsGenerated) ? safeOutput.testsGenerated : []),
  ].flatMap((test) => (test && typeof test === 'object' && Array.isArray(test.nfr_signals) ? test.nfr_signals : []));

  return [...directSignals, ...summarySignals, ...testSignals]
    .filter((signal) => signal && typeof signal === 'object')
    .map((signal) => ({
      ...signal,
      category: signal.category || signal.nfr_category || 'integration boundaries',
      source,
      original_source: signal.source || null,
      evidence: signal.evidence || signal.evidence_pointer || signal.file || null,
    }));
};

const collectNfrSignalConcerns = (output, source) => {
  const concerns = [];
  const safeOutput = output && typeof output === 'object' ? output : {};
  if (!isTrustedEvidenceWorker(safeOutput)) {
    return concerns;
  }

  const nfrCollections = [
    ['nfr_signals', safeOutput.nfr_signals],
    ['coverageSummary.nfrSignals', safeOutput.coverageSummary?.nfrSignals],
  ];

  nfrCollections.forEach(([label, value]) => {
    if (value !== undefined && !Array.isArray(value)) {
      concerns.push({
        category: 'worker-output-shape',
        severity: 'error',
        source,
        message: `Worker output field ${label} must be an array when present`,
      });
    }
  });

  const testEntries = [...toArray(safeOutput.tests), ...toArray(safeOutput.testsGenerated)];
  testEntries.forEach((test, index) => {
    if (test && typeof test === 'object' && test.nfr_signals !== undefined && !Array.isArray(test.nfr_signals)) {
      concerns.push({
        category: 'worker-output-shape',
        severity: 'error',
        source,
        message: `Worker output test entry ${index}.nfr_signals must be an array when present`,
      });
    }
  });

  const signalEntries = [
    ...(Array.isArray(safeOutput.nfr_signals) ? safeOutput.nfr_signals : []),
    ...(Array.isArray(safeOutput.coverageSummary?.nfrSignals) ? safeOutput.coverageSummary.nfrSignals : []),
    ...testEntries.flatMap((test) => (test && typeof test === 'object' && Array.isArray(test.nfr_signals) ? test.nfr_signals : [])),
  ];

  signalEntries.forEach((signal, index) => {
    if (!signal || typeof signal !== 'object' || Array.isArray(signal)) {
      concerns.push({
        category: 'worker-output-shape',
        severity: 'error',
        source,
        message: `Worker output NFR signal entry ${index} must be an object`,
      });
    }
  });

  return concerns;
};

const summary = {
  detected_stack: '{detected_stack}',
  total_tests: apiCount + e2eCount + backendCount,
  api_tests: apiCount,
  e2e_tests: e2eCount,
  backend_tests: backendCount,
  fixtures_created: uniqueFixtures.length,
  api_test_files: apiTests.length,
  e2e_test_files: e2eTests.length,
  backend_test_files: backendTests.length,
  priority_coverage: totalPriorityCoverage,
  knowledge_fragments_used: [
    ...(isTrustedEvidenceWorker(safeApiTestsOutput) ? toArray(safeApiTestsOutput.knowledge_fragments_used) : []),
    ...(isTrustedEvidenceWorker(safeE2eTestsOutput) ? toArray(safeE2eTestsOutput.knowledge_fragments_used) : []),
    ...(isTrustedEvidenceWorker(safeBackendTestsOutput) ? toArray(safeBackendTestsOutput.knowledge_fragments_used) : []),
  ],
  subagent_execution: subagentExecutionLabel,
  performance_gain: performanceGainLabel,
  ta_evidence_data: {
    changed_tests: changedTests,
    fixture_needs: uniqueFixtures,
    quality_concerns: [
      ...(Array.isArray(typeof workerReadConcerns === 'undefined' ? null : workerReadConcerns) ? workerReadConcerns : []),
      ...(Array.isArray(typeof fileWriteConcerns === 'undefined' ? null : fileWriteConcerns) ? fileWriteConcerns : []),
      ...collectWorkerShapeConcerns(safeApiTestsOutput, 'api-tests', ['tests']),
      ...(safeE2eTestsOutput ? collectWorkerShapeConcerns(safeE2eTestsOutput, 'e2e-tests', ['tests']) : []),
      ...(safeBackendTestsOutput ? collectWorkerShapeConcerns(safeBackendTestsOutput, 'backend-tests', ['testsGenerated']) : []),
      ...collectWorkerFixtureConcerns(safeApiTestsOutput, 'api-tests'),
      ...(safeE2eTestsOutput ? collectWorkerFixtureConcerns(safeE2eTestsOutput, 'e2e-tests') : []),
      ...(safeBackendTestsOutput ? collectWorkerFixtureConcerns(safeBackendTestsOutput, 'backend-tests') : []),
      ...collectWorkerValueConcerns(safeApiTestsOutput, 'api-tests', 'test_count', apiWorkerTests),
      ...(safeE2eTestsOutput ? collectWorkerValueConcerns(safeE2eTestsOutput, 'e2e-tests', 'test_count', e2eWorkerTests) : []),
      ...(safeBackendTestsOutput
        ? collectWorkerValueConcerns(safeBackendTestsOutput, 'backend-tests', 'coverageSummary.totalTests', backendWorkerTests)
        : []),
      ...collectQualityConcerns(safeApiTestsOutput, 'api-tests'),
      ...(safeE2eTestsOutput ? collectQualityConcerns(safeE2eTestsOutput, 'e2e-tests') : []),
      ...(safeBackendTestsOutput ? collectQualityConcerns(safeBackendTestsOutput, 'backend-tests') : []),
      ...collectNfrSignalConcerns(safeApiTestsOutput, 'api-tests'),
      ...(safeE2eTestsOutput ? collectNfrSignalConcerns(safeE2eTestsOutput, 'e2e-tests') : []),
      ...(safeBackendTestsOutput ? collectNfrSignalConcerns(safeBackendTestsOutput, 'backend-tests') : []),
    ],
    nfr_signals: [
      ...collectNfrSignals(safeApiTestsOutput, 'api-tests'),
      ...(safeE2eTestsOutput ? collectNfrSignals(safeE2eTestsOutput, 'e2e-tests') : []),
      ...(safeBackendTestsOutput ? collectNfrSignals(safeBackendTestsOutput, 'backend-tests') : []),
    ],
    coverage: {
      total_tests: apiCount + e2eCount + backendCount,
      by_level: {
        api: apiCount,
        e2e: e2eCount,
        backend: backendCount,
      },
      priority_coverage: totalPriorityCoverage,
    },
    artifact_pointers: {
      automation_summary: '{outputFile}',
      generated_test_files: changedTests.map((test) => test.file),
    },
    source_worker_metadata: {
      api: {
        success: safeApiTestsOutput.success,
        test_count: apiCount,
        summary: safeApiTestsOutput.summary,
      },
      e2e: safeE2eTestsOutput
        ? {
            success: safeE2eTestsOutput.success,
            test_count: e2eCount,
            summary: safeE2eTestsOutput.summary,
          }
        : null,
      backend: safeBackendTestsOutput
        ? {
            success: safeBackendTestsOutput.success,
            status: safeBackendTestsOutput.status,
            coverageSummary: safeBackendTestsOutput.coverageSummary,
            summary: safeBackendTestsOutput.summary,
          }
        : null,
    },
  },
};
```

**Store summary for Step 4:**
Save summary and `ta_evidence_data` to `{test_artifacts}` for the validation step:

```javascript
const summarySeedPath = '{test_artifacts}/tea-automate-summary-{{timestamp}}.json';
fs.mkdirSync('{test_artifacts}', { recursive: true });
fs.writeFileSync(summarySeedPath, JSON.stringify(summary, null, 2), 'utf8');
```

---

### 6. Optional Cleanup

**Clean up subagent temp files** (optional - can keep for debugging):

```javascript
fs.unlinkSync(apiTestsPath);
if (e2eTestsOutput) fs.unlinkSync('/tmp/tea-automate-e2e-tests-{{timestamp}}.json');
if (backendTestsOutput) fs.unlinkSync('/tmp/tea-automate-backend-tests-{{timestamp}}.json');
console.log('✅ Subagent temp files cleaned up');
```

---

## OUTPUT SUMMARY

Display to user:

```
✅ Test Generation Complete ({subagent_execution})

📊 Summary:
- Stack Type: {detected_stack}
- Total Tests: {total_tests}
  - API Tests: {api_tests} ({api_test_files} files)
  - E2E Tests: {e2e_tests} ({e2e_test_files} files)         [if frontend/fullstack]
  - Backend Tests: {backend_tests} ({backend_test_files} files)  [if backend/fullstack]
- Fixtures Created: {fixtures_created}
- Priority Coverage:
  - P0 (Critical): {P0} tests
  - P1 (High): {P1} tests
  - P2 (Medium): {P2} tests
  - P3 (Low): {P3} tests

🚀 Performance: {performance_gain}

📂 Generated Files:
- tests/api/[feature].spec.ts                                [always]
- tests/e2e/[feature].spec.ts                                [if frontend/fullstack]
- tests/unit/[feature].test.*                                 [if backend/fullstack]
- tests/integration/[feature].test.*                          [if backend/fullstack]
- tests/fixtures/ or tests/support/                           [shared infrastructure]

✅ Ready for validation (Step 4)
```

---

## EXIT CONDITION

Proceed to Step 4 when:

- ✅ All test files written to disk (API + E2E and/or Backend, based on `{detected_stack}`)
- ✅ All fixtures and helpers created
- ✅ Summary statistics and structured TA evidence seed data calculated and saved
- ✅ Output displayed to user

---

### 7. Save Progress

**Save this step's accumulated work to `{outputFile}`.**

- **If `{outputFile}` does not exist** (first save), create it with YAML frontmatter:

  ```yaml
  ---
  stepsCompleted: ['step-03c-aggregate']
  lastStep: 'step-03c-aggregate'
  lastSaved: '{date}'
  ---
  ```

  Then write this step's output below the frontmatter.

- **If `{outputFile}` already exists**, update:
  - Add `'step-03c-aggregate'` to `stepsCompleted` array (only if not already present)
  - Set `lastStep: 'step-03c-aggregate'`
  - Set `lastSaved: '{date}'`
  - Append this step's output to the appropriate section.

Load next step: `{nextStepFile}`

---

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- All launched subagents succeeded (based on `{detected_stack}`)
- All test files written to disk
- Fixtures generated based on subagent needs
- Summary complete and accurate
- Structured TA evidence seed data includes changed tests, quality concerns, NFR signals, coverage, artifact pointers, and source worker metadata

### ❌ SYSTEM FAILURE:

- One or more subagents failed
- Test files not written to disk
- Fixtures missing or incomplete
- Summary missing or inaccurate

**Master Rule:** Do NOT proceed to Step 4 if aggregation incomplete.
