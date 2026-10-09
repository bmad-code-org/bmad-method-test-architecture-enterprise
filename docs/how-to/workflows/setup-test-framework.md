---
title: 'How to Set Up Framework and CI with TEA'
description: Set up a test framework, CI, or both with the Framework skill
tableOfContents:
  maxHeadingLevel: 4
---

# How to Set Up Framework and CI with TEA

<a id="how-to-set-up-a-test-framework-with-tea"></a>

Use TEA's `framework` skill to scaffold test directories, fixtures, configuration, and runner commands, and to configure CI when requested.

`bmad-testarch-framework` owns framework and CI setup. Your prompt selects framework only, CI only, or both.
TEA infers the scope from your request. When CI scope is unclear in an interactive session, it asks once: "Do you want CI too?" An unattended request with unclear scope runs framework setup only and states that CI was excluded.
Explicit framework-only requests skip the CI phase. For both, TEA agrees the stack, framework, and test commands first, then can generate the scaffold and pipeline in parallel and validate them together. If a working framework already exists, TEA reuses it and configures CI for its actual commands.

Setup scope is separate from the operation: Create starts a new run, Resume picks up an interrupted run where it stopped, Validate reports checks without repairing outputs, and Edit revises the selected outputs and checks those changes.

Choose [framework setup](#framework-setup), [CI setup](#ci-setup), or both. Existing CI commands, customizations, and progress remain usable. [Evaluation plans](#evaluation-plans) integrate scored checks into the pipeline.

## Framework Setup

<a id="framework-when-to-use-this"></a>

### When to Use This

- No existing test framework in your project
- Current setup needs shared fixtures or runner configuration
- Starting a new project that needs testing infrastructure
- Phase 3 (Solutioning) after architecture is complete

<a id="framework-prerequisites"></a>

### Prerequisites

- Architecture completed (or at least tech stack decided)

<a id="framework-steps"></a>

### Steps

<a id="framework-1-run-framework-setup"></a>

#### 1. Run Framework Setup

- **Claude Code / Cursor / Windsurf:** `/bmad-testarch-framework`
- **Codex:** `$bmad-testarch-framework`
- **Inside a `/bmad-tea` chat:** `TF`

Full invocation rules: [Invoking a TEA Skill](/docs/reference/commands.md#invoking-a-tea-skill).

For framework only, add "Set up the test framework only."
For both phases, add "Set up the test framework and CI." The same skill runs both phases using an agreed stack, framework, and test-command contract.
`TF` starts framework setup; the `CI` menu code starts its CI phase.

<a id="framework-2-answer-teas-questions"></a>

#### 2. Answer TEA's Questions

TEA will ask about:

- Your tech stack (React, Node, etc.)
- Preferred test framework:
  - **Frontend/Fullstack**: Playwright, Cypress
  - **Backend (Node.js)**: Jest, Vitest, or Playwright (API testing via playwright-utils)
  - **Backend (Python)**: pytest, or Playwright for Python
  - **Backend (Java/Kotlin)**: JUnit, or Playwright for Java
  - **Backend (Go)**: Go test
  - **Backend (C#/.NET)**: dotnet test / xUnit, or Playwright for .NET
  - **Backend (Ruby)**: RSpec
- Testing scope (E2E, integration, unit, API)
- CI/CD platform (GitHub Actions, GitLab CI, Jenkins, Azure DevOps, Harness, etc.)

<a id="framework-3-review-generated-output"></a>

#### 3. Review Generated Output

TEA generates:

- **Test scaffold**: Directory structure and config files (language-idiomatic)
- **Sample specs**: Example tests following best practices for your framework
- **`.env.example`**: Environment variable template
- **Version file**: `.nvmrc` (Node.js), `.python-version` (Python), `global.json` (.NET), etc.
- **README updates**: Testing documentation

<a id="framework-what-you-get"></a>

### What You Get

**Frontend/Fullstack (Node.js):**

```text
tests/
├── e2e/
│   ├── example.spec.ts
│   └── fixtures/
├── integration/
├── unit/
├── playwright.config.ts  # or cypress.config.ts
└── README.md
```

**Backend (Python example):**

```text
tests/
├── unit/
│   └── test_example.py
├── integration/
├── api/
├── conftest.py
└── README.md
```

> **Note:** Playwright has official bindings for Python, Java, and .NET, so it is viable for API testing across those languages too.

<a id="framework-playwright-utils-integration-on-by-default"></a>

### Playwright Utils Integration (on by default)

This integration applies to JavaScript and TypeScript suites using the Playwright runner.
TEA uses the selected framework's conventions for other stacks.

`tea_use_playwright_utils` defaults to `true`, so unless you turned it off in `bmad setup tea` this skill asks to install `@seontechnologies/playwright-utils` and then scaffolds against it:

```bash
npm install -D @seontechnologies/playwright-utils
```

What gets created on the enabled branch:

- `{test_dir}/support/merged-fixtures.ts`: the single entry point every spec imports `test` from, composed with `mergeTests`
- `{test_dir}/support/auth-fixture.ts`: `setAuthProvider` and `createAuthFixtures()`. If the auth endpoint is unknown, `getToken` contains a `TODO` listed in the summary.
- `global-setup.ts` wiring for `authStorageInit()` and `configureAuthSession()`, with the token storage directory gitignored
- Sample tests written in the same style, since every later skill reads them as the reference

If you decline the install, TEA scaffolds plain Playwright fixtures.

**Utilities available:** api-request, network-recorder, auth-session, intercept-network-call, recurse, log, file-utils, burn-in, network-error-monitor

Set `tea_use_playwright_utils = "false"` under `[modules.tea]` for plain Playwright fixtures.

<a id="framework-write-time-quality-checks"></a>

### Write-Time Quality Checks

The framework phase's Create operation installs the hook on Claude Code; Resume installs it when continuing through that setup step.
TEA copies `.claude/hooks/tea-enforce.cjs` and registers pre-write, post-write, and stop hooks in the project's `.claude/settings.json`, preserving existing settings.
The hooks run in ordinary coding sessions in that project.
Rules apply to the test and Pact config paths in `.tea/enforce-config.json`.

Seven rules block supported violations:

- Focused tests such as `.only`
- Tautological assertions such as `expect(value).toBe(value)`
- Hard waits such as `waitForTimeout`
- Test files above the configured line limit, which defaults to 1,000
- Maestro flows with no assertion or destination-state wait that can fail
- Pact config without `fileParallelism: false`
- Pact settings that defeat serialization, such as concurrent execution, multiple workers, or disabled isolation

Undocumented disabled tests produce a warning.
Post-write and stop checks catch violations that bypassed the pre-write hook.
If the hook itself errors, it fails open and allows the write.

The skill skips hook installation on platforms without this interception point and records that in its summary.
Run `test-review` to audit test quality on those platforms.

<a id="framework-optional-mcp-enhancements"></a>

### Optional: MCP Enhancements

TEA can use Playwright MCP servers for enhanced capabilities:

- `playwright`: Browser automation
- `playwright-test`: Test runner with failure analysis

Configure in your IDE's MCP settings.

<a id="framework-tips"></a>

### Tips

- **Run only once per repository**: Framework setup is a one-time operation
- **Run after architecture is complete**: Framework aligns with tech stack
- **Include CI in the same run**: Ask for framework and CI setup together, or use the `ci` command later to start the CI phase

<a id="framework-next-steps"></a>

### Next Steps

System-level Test Design should precede framework setup so planned NFR evidence shapes the infrastructure.

After test framework setup:

1. **Epic Test Design**: Create the test plan for the next epic
2. **CI Configuration (skip if you included CI)**: Set up automated test runs
3. **Story Implementation**: Tests are ready for development

## CI Setup

Use Framework to configure test jobs, sharding, burn-in runs, quality gates, and result artifacts. The existing CI command and `CI` menu code select this phase.

<a id="ci-when-to-use-this"></a>

### When to Use This

- Need to automate test execution in CI/CD
- Want selective testing (only run affected tests)
- Need parallel execution for faster feedback
- Want burn-in loops for flakiness detection
- Setting up new CI/CD pipeline
- Optimizing existing CI/CD workflow

<a id="ci-prerequisites"></a>

### Prerequisites

- A working test framework, or permission to create one during setup
- Tests written, or sample tests from framework setup
- CI/CD platform access (GitHub Actions, GitLab CI, etc.)

<a id="ci-steps"></a>

### Steps

<a id="ci-1-run-ci-setup"></a>

#### 1. Run CI Setup

- **Claude Code / Cursor / Windsurf:** `/bmad-testarch-framework`
- **Codex:** `$bmad-testarch-framework`
- **Inside a `/bmad-tea` chat:** `TF`

Request CI scope explicitly:

```text
Set up CI only for the existing test framework.
```

The compatibility entries `/bmad-testarch-ci`, `$bmad-testarch-ci`, and `CI` select CI scope by default.

Full invocation rules: [Invoking a TEA Skill](/docs/reference/commands.md#invoking-a-tea-skill).

If no framework exists, TEA offers to include framework setup. Declining stops the run without changes. On acceptance, it agrees the stack, framework, and test commands before generating both outputs; final validation checks them together.
Choose Create, Resume, Validate, or Edit for the selected setup scope. Existing CI customizations and saved checkpoints remain usable.

Create installs the dependencies needed to run the existing test commands and starts their required local services during preflight.
It uses your project's scripts and configuration; common commands include `npm test`, `pytest`, `mvn test`, `go test ./...`, `dotnet test`, and `bundle exec rspec`.
Validate records execution results and missing prerequisites in its report. Edit checks the pipeline changes you requested, such as syntax, injection safety, and evaluation-plan rendering.

<a id="ci-2-select-cicd-platform"></a>

#### 2. Select CI/CD Platform

TEA will ask which platform you're using.

**Supported Platforms:**

- **GitHub Actions** (most common)
- **GitLab CI**
- **Jenkins**: Generates `Jenkinsfile` with parallel stages, artifact archiving, and post-failure handling
- **Azure DevOps**: Generates `azure-pipelines.yml` with matrix strategy for sharding and Azure-specific caching
- **Harness**: Generates `.harness/pipeline.yaml` with Kubernetes-based execution and parallel steps
- **Circle CI**
- **Other** (TEA provides generic template)

**Example:**

```text
GitHub Actions
```

<a id="ci-3-configure-test-strategy"></a>

#### 3. Configure Test Strategy

TEA will ask about your test execution strategy.

<a id="ci-repository-structure"></a>

##### Repository Structure

**Question:** "What's your repository structure?"

**Options:**

- **Single app**: One application in root
- **Monorepo**: Multiple apps/packages
- **Monorepo with affected detection**: Only test changed packages

**Example:**

```text
Monorepo with multiple apps
Need selective testing for changed packages only
```

<a id="ci-parallel-execution"></a>

##### Parallel Execution

**Question:** "Want to shard tests for parallel execution?"

**Options:**

- **No sharding**: Run tests sequentially
- **Sharding**: Split the suite across CI jobs. Runtime depends on the slowest shard and job setup.
- **Shard by file**: Each file runs in parallel

**Example:**

```text
Yes, shard across 4 workers for faster execution
```

<a id="ci-burn-in-loops"></a>

##### Burn-In Loops

**Question:** "Want burn-in loops for flakiness detection?"

**Options:**

- **No burn-in**: Run tests once
- **PR burn-in**: Run tests multiple times on PRs; catches flaky tests before they merge
- **Nightly burn-in**: Dedicated flakiness detection job

**Example:**

```text
Yes, run tests 5 times on PRs to catch flaky tests early
```

<a id="ci-4-review-generated-ci-configuration"></a>

#### 4. Review Generated CI Configuration

TEA generates platform-specific workflow files.
The GitHub Actions sample runs selective tests on pull requests, the full sharded suite on pushes to `main` or `develop` and on the nightly schedule, and full-suite burn-in on the nightly schedule.
The GitLab sample runs the full sharded suite on pushes to the default branch or `develop` and on schedules, with full-suite burn-in on schedules.

<a id="ci-github-actions-githubworkflowstestyml"></a>

##### GitHub Actions (`.github/workflows/test.yml`):

```yaml
name: Test Suite

on:
  pull_request:
  push:
    branches: [main, develop]
  schedule:
    - cron: '0 2 * * *' # Nightly at 2 AM

jobs:
  # Main test job with sharding
  test:
    name: Test (Shard ${{ matrix.shard }})
    if: github.event_name == 'push' || github.event_name == 'schedule'
    runs-on: ubuntu-latest
    timeout-minutes: 15

    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3, 4]

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps

      - name: Run tests
        run: npx playwright test --shard=${{ matrix.shard }}/4

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-results-${{ matrix.shard }}
          path: test-results/
          retention-days: 7

      - name: Upload test report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report-${{ matrix.shard }}
          path: playwright-report/
          retention-days: 7

  # Full-suite burn-in on the nightly schedule
  burn-in:
    name: Burn-In (Flakiness Detection)
    runs-on: ubuntu-latest
    if: github.event_name == 'schedule'
    timeout-minutes: 30

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps

      - name: Run burn-in loop
        run: |
          for i in {1..5}; do
            echo "=== Burn-in iteration $i/5 ==="
            npx playwright test --grep-invert "@skip" --retries=0 || exit 1
          done

      - name: Upload burn-in results
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: burn-in-failures
          path: test-results/

  # Selective testing (changed files only)
  selective:
    name: Selective Tests
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'

    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0 # Full history for git diff

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps

      - name: Run selective tests
        run: npm run test:changed
```

<a id="ci-gitlab-ci-gitlab-ciyml"></a>

##### GitLab CI (`.gitlab-ci.yml`):

```yaml
variables:
  NODE_VERSION: '22.20.0'

stages:
  - test
  - burn-in

# Test job with parallel execution
test:
  stage: test
  image: node:$NODE_VERSION
  parallel: 4
  script:
    - npm ci
    - npx playwright install --with-deps
    - npx playwright test --shard=$CI_NODE_INDEX/$CI_NODE_TOTAL
  artifacts:
    when: always
    paths:
      - test-results/
      - playwright-report/
    expire_in: 7 days
  rules:
    - if: $CI_PIPELINE_SOURCE == "schedule"
    - if: $CI_PIPELINE_SOURCE == "push" && ($CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH || $CI_COMMIT_BRANCH == "develop")

# Burn-in job for flakiness detection
burn-in:
  stage: burn-in
  image: node:$NODE_VERSION
  script:
    - npm ci
    - npx playwright install --with-deps
    - |
      for i in {1..5}; do
        echo "=== Burn-in iteration $i/5 ==="
        npx playwright test --retries=0 || exit 1
      done
  artifacts:
    when: on_failure
    paths:
      - test-results/
  rules:
    - if: $CI_PIPELINE_SOURCE == "schedule"
```

<a id="ci-burn-in-testing"></a>

##### Burn-In Testing

<a id="ci-option-1-classic-burn-in-playwright-built-in"></a>

###### Option 1: Classic Burn-In (Playwright Built-In)

```json
{
  "scripts": {
    "test": "playwright test",
    "test:burn-in": "playwright test --repeat-each=5 --retries=0"
  }
}
```

**How it works:**

- Runs every test 5 times
- Fails if any iteration fails
- Detects flakiness before merge

**Use when:** Small test suite, want to run everything multiple times

---

<a id="ci-option-2-smart-burn-in-playwright-utils"></a>

###### Option 2: Smart Burn-In (Playwright Utils)

If `tea_use_playwright_utils: true`:

**scripts/burn-in-changed.ts:**

```typescript
import { runBurnIn } from '@seontechnologies/playwright-utils/burn-in';

await runBurnIn({
  configPath: 'playwright.burn-in.config.ts',
  baseBranch: 'main',
});
```

**playwright.burn-in.config.ts:**

```typescript
import type { BurnInConfig } from '@seontechnologies/playwright-utils/burn-in';

const config: BurnInConfig = {
  skipBurnInPatterns: ['**/config/**', '**/*.md', '**/*types*'],
  burnInTestPercentage: 0.3,
  burnIn: { repeatEach: 5, retries: 0 },
};

export default config;
```

**package.json:**

```json
{
  "scripts": {
    "test:burn-in": "tsx scripts/burn-in-changed.ts"
  }
}
```

**How it works:**

- Git diff analysis (only affected tests)
- Smart filtering (skip configs, docs, types)
- Volume control (run 30% of affected tests)
- Each test runs 5 times

**Use when:** Large test suite, want intelligent selection

---

**Comparison:**

| Feature        | Classic Burn-In                    | Smart Burn-In (PW-Utils)            |
| -------------- | ---------------------------------- | ----------------------------------- |
| Changed 1 file | Runs all 500 tests × 5 = 2500 runs | Runs 3 affected tests × 5 = 15 runs |
| Config change  | Runs all tests                     | Skips (no tests affected)           |
| Type change    | Runs all tests                     | Skips (no runtime impact)           |
| Setup          | Zero config                        | Requires config file                |

Use classic burn-in for the full suite.
Use smart selection when you have checked that its dependency analysis covers your project.

<a id="ci-5-configure-secrets"></a>

#### 5. Configure Secrets

TEA provides a secrets checklist.

**Required Secrets** (add to CI/CD platform):

```markdown
## GitHub Actions Secrets

Repository Settings → Secrets and variables → Actions

### Required

- None (tests run without external auth)

### Optional

- `TEST_USER_EMAIL`: Test user credentials
- `TEST_USER_PASSWORD`: Test user password
- `API_BASE_URL`: API endpoint for tests
- `DATABASE_URL`: Test database (if needed)
```

**How to Add Secrets:**

**GitHub Actions:**

1. Go to repo Settings → Secrets → Actions
2. Click "New repository secret"
3. Add name and value
4. Use in workflow: `${{ secrets.TEST_USER_EMAIL }}`

**GitLab CI:**

1. Go to Project Settings → CI/CD → Variables
2. Add variable name and value
3. Use in workflow: `$TEST_USER_EMAIL`

<a id="ci-6-test-the-ci-pipeline"></a>

#### 6. Test the CI Pipeline

<a id="ci-push-and-verify"></a>

##### Push and Verify

**Commit the workflow file:**

```bash
git add .github/workflows/test.yml
git commit -m "ci: add automated test pipeline"
git push
```

**Watch the CI run:**

- GitHub Actions: Go to Actions tab
- GitLab CI: Go to CI/CD → Pipelines
- Circle CI: Go to Pipelines

**Expected Result:**

```text
✓ test (shard 1/4) - 3m 24s
✓ test (shard 2/4) - 3m 18s
✓ test (shard 3/4) - 3m 31s
✓ test (shard 4/4) - 3m 15s
✓ burn-in - 15m 42s
```

<a id="ci-test-on-pull-request"></a>

##### Test on Pull Request

**Create test PR:**

```bash
git checkout -b test-ci-setup
echo "# Test" > test.md
git add test.md
git commit -m "test: verify CI setup"
git push -u origin test-ci-setup
```

**Open PR and verify:**

- Tests run automatically
- Burn-in runs (if configured for PRs)
- Selective tests run (if applicable)
- All checks pass ✓

<a id="ci-what-you-get"></a>

### What You Get

<a id="ci-automated-test-execution"></a>

#### Automated Test Execution

- **On every PR**: Catch issues before merge
- **On every push to main**: Protect production
- **Nightly**: regression testing

<a id="ci-parallel-execution-1"></a>

#### Parallel Execution

- Split the suite across multiple CI jobs

<a id="ci-selective-testing"></a>

#### Selective Testing

- **Run only affected tests**: Git diff-based selection
- **Faster PR feedback**: Don't run entire suite every time

<a id="ci-flakiness-detection"></a>

#### Flakiness Detection

- **Burn-in loops**: Run tests multiple times
- **Early detection**: Catch flaky tests in PRs

<a id="ci-artifact-collection"></a>

#### Artifact Collection

- **Test results**: Saved for 7 days
- **Screenshots**: On test failures
- **Videos**: Full test recordings
- **Traces**: Playwright trace files for debugging

<a id="ci-tips"></a>

### Tips

<a id="ci-start-simple-add-complexity"></a>

#### Start Simple, Add Complexity

**Week 1:** Basic pipeline

```yaml
- Run tests on PR
- Single worker (no sharding)
```

**Week 2:** Add parallelization

```yaml
- Shard across 4 workers
- Faster feedback
```

**Week 3:** Add selective testing

```yaml
- Git diff-based selection
- Skip unaffected tests
```

**Week 4:** Add burn-in

```yaml
- Detect flaky tests
- Run on PR and nightly
```

<a id="ci-optimize-for-feedback-speed"></a>

#### Optimize for Feedback Speed

**Goal:** PR feedback in < 5 minutes

**Strategies:**

- Balance shards so one slow job does not hold up the suite
- Run affected tests on pull requests and the full suite on the agreed schedule
- Cache dependencies (`actions/cache`, `cache: 'npm'`)
- Run smoke tests first, full suite after

**Example fast workflow:**

```yaml
name: Fast Test Feedback

on:
  pull_request:
  push:
    branches: [main, develop]

jobs:
  smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run test:smoke

  full:
    needs: smoke
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm test
```

<a id="ci-use-test-tags"></a>

#### Use Test Tags

Tag tests for selective execution:

```typescript
// Critical path tests (always run)
test('@critical should login', async ({ page }) => {});

// Smoke tests (run first)
test('@smoke should load homepage', async ({ page }) => {});

// Slow tests (run nightly only)
test('@slow should process large file', async ({ page }) => {});

// Skip in CI
test('@local-only should use local service', async ({ page }) => {});
```

**In CI:**

```bash
# PR: Run critical and smoke only
npx playwright test --grep "@critical|@smoke"

# Nightly: Run everything except local-only
npx playwright test --grep-invert "@local-only"
```

<a id="ci-monitor-ci-performance"></a>

#### Monitor CI Performance

Track metrics:

```markdown
## CI Metrics

| Metric           | Target   | Current | Status |
| ---------------- | -------- | ------- | ------ |
| PR feedback time | < 5 min  | 3m 24s  | ✅     |
| Full suite time  | < 15 min | 12m 18s | ✅     |
| Flakiness rate   | < 1%     | 0.3%    | ✅     |
| CI cost/month    | < $100   | $75     | ✅     |
```

<a id="ci-handle-flaky-tests"></a>

#### Handle Flaky Tests

When burn-in detects flakiness:

1. **Quarantine flaky test:**

   ```typescript
   test.skip('flaky test: investigating', async ({ page }) => {
     // TODO: Fix flakiness
   });
   ```

2. **Investigate with trace viewer:**

   ```bash
   npx playwright show-trace test-results/trace.zip
   ```

3. **Fix root cause:**
   - Add network-first patterns
   - Remove hard waits
   - Fix race conditions

4. **Verify fix:**

   ```bash
   npx playwright test tests/flaky.spec.ts --repeat-each=20 --retries=0
   ```

<a id="ci-secure-secrets"></a>

#### Secure Secrets

**Don't commit secrets to code:**

```yaml
# ❌ Bad
- run: API_KEY=sk-1234... npm test

# ✅ Good
- run: npm test
  env:
    API_KEY: ${{ secrets.API_KEY }}
```

**Use environment-specific secrets:**

- `STAGING_API_URL`
- `PROD_API_URL`
- `TEST_API_URL`

<a id="ci-cache-aggressively"></a>

#### Cache Aggressively

Speed up CI with caching:

```yaml
# Cache npm downloads
- uses: actions/setup-node@v4
  with:
    cache: 'npm'

# Cache Playwright browsers
- name: Cache Playwright browsers
  uses: actions/cache@v4
  with:
    path: ~/.cache/ms-playwright
    key: playwright-${{ hashFiles('package-lock.json') }}
```

<a id="ci-common-issues"></a>

### Common Issues

<a id="ci-tests-pass-locally-fail-in-ci"></a>

#### Tests Pass Locally, Fail in CI

**Symptoms:**

- Green locally, red in CI
- "Works on my machine"

**Common Causes:**

- Different Node version
- Different browser version
- Missing environment variables
- Timezone differences
- Race conditions (CI slower)

```yaml
# Pin Node version
- uses: actions/setup-node@v4
  with:
    node-version-file: '.nvmrc'

# Pin the browser by pinning @playwright/test in package-lock.json. `playwright install`
# takes no version suffix: `chromium@1.40.0` fails with "Invalid installation targets".
- run: npx playwright install --with-deps chromium

# Set the test process timezone.
- run: npx playwright test
  env:
    TZ: 'America/New_York'
```

<a id="ci-ci-takes-too-long"></a>

#### CI Takes Too Long

CI takes 30+ minutes, developers wait too long.

1. **Shard tests:** distribute the suite across CI jobs
2. **Selective testing:** Only run affected tests on PR
3. **Smoke tests first:** Run critical path (2 min), full suite after
4. **Cache dependencies:** `npm ci` with cache
5. **Optimize tests:** Remove slow tests, hard waits

<a id="ci-burn-in-always-fails"></a>

#### Burn-In Always Fails

Find the failing tests in the burn-in report and check whether failures repeat consistently or intermittently:

1. Identify flaky tests (check which iteration fails)
2. Fix flaky tests using `test-review`
3. Re-run burn-in on specific files:

```bash
npm run test:burn-in tests/flaky.spec.ts
```

<a id="ci-out-of-ci-minutes"></a>

#### Out of CI Minutes

Using too many CI minutes, hitting plan limit.

1. Run full suite only on main branch
2. Use selective testing on PRs
3. Run expensive tests nightly only
4. Self-host runners (for GitHub Actions)

<a id="ci-related-guides"></a>

### Related Guides

- [How to Set Up Test Framework](/docs/how-to/workflows/setup-test-framework.md): Include the framework phase when needed
- [How to Run Test Review](/docs/how-to/workflows/run-test-review.md): Audit CI tests
- [Integrate Playwright Utils](/docs/how-to/customization/integrate-playwright-utils.md): Burn-in utility

<a id="ci-understanding-the-concepts"></a>

### Understanding the Concepts

- [Test Quality Standards](/docs/explanation/test-quality-standards.md): Why determinism matters
- [Network-First Patterns](/docs/explanation/network-first-patterns.md): Avoid CI flakiness

<a id="ci-reference"></a>

### Reference

- [Command: ci](/docs/reference/commands.md#ci): Full command reference
- [TEA Configuration](/docs/reference/configuration.md): CI-related config options

## Evaluation Plans

If the repository holds an evaluation written with `bmad-testarch-evaluate`, Framework's CI phase finds its `ci/evaluation-ci-plan.json` and renders it into the same pipeline file.
A standalone run picks up existing plans after the quality gates step, and an edit-mode run detects them first and renders them into the pipeline it loaded.
Evaluate writes the plan and Framework writes every pipeline file.
The last stage of `bmad-testarch-evaluate` invokes Framework in edit mode on the pipeline file once the plan is written, or in create mode when the repository has no pipeline file.

For each tier the plan places a check on, the pipeline gets one job, `evaluation-pr` for the `pr` tier:

- **One step per tier.** `tea-evaluate ci --tier <tier>` is the runtime's one entry that runs a tier. It runs every check the plan places on the tier and writes the evidence bundle, and it takes no check selector, so the job runs it once as `npm exec --prefix <evaluations folder> -- tea-evaluate ci --evaluation <evaluation folder> --tier <tier>`, named for the ids of the checks it carries. A `merge` job runs the `pr` tier's step first and its own second.
- **The tooling stays in the evaluations folder.** The job installs the private `package.json` Evaluate wrote there with `npm ci --prefix` (`npm install --prefix` when no lockfile is committed), so the repository's own manifest stays untouched and a repository in any language works.
- **The Node version respects the tooling's floor.** The evaluation job runs the project's `.nvmrc` version only when it is at or above the Node floor TeA and eval-quality declare (22.20.0), and the current LTS otherwise, so a project pinned to an older Node is not blocked.
- **Checks and tiers come from the plan.** Framework preserves the complete check set and every check's tier placement, without adding, dropping, or moving checks. The evaluation plan stays unchanged.
- **A job the plan gates waits for its tier's evaluation job.**
  A check's optional `gates` names existing publish or deploy jobs by job id, so a blocking exit stops the shipment.
  A gated job in the pipeline file gets the evaluation job appended to its `needs`, and Framework changes only that job's `needs`; its `if:` and every other key stay unchanged.
  A gated job in another workflow file gets a `workflow_run` trigger on the pipeline, an `if:` that requires a successful run of the pipeline file on the tier's event, and the evaluated commit as the `ref` of its checkout steps, and that workflow's other jobs get an event guard.
  Framework reports each edit in the summary and restores the wait when it rewrites the evaluation jobs.
  Across files, Framework limits changes to the gated job's `if:` and checkout `ref:`, its workflow's `workflow_run` trigger, and event guards on that workflow's other jobs.
  All other job settings stay unchanged.
  A plan renders nothing and is reported when a name matches no job or a gate cannot hold.
  Inside the pipeline file a gate cannot hold when the gated job already ran in a run where its tier's evaluation job is skipped (a deploy on every push beside an evaluation job guarded to tags), when the job already waits for another plan's evaluation job through the cross-file form, when the tier's evaluation job runs on a run the job did not run on before (a `workflow_dispatch` the plan adds to a tag-push release file; a deploy file that already starts on a dispatch gains no run), or when its `if:` calls a status function other than `success()` (`always()`, `!cancelled()`, `failure()`).
  A run the render adds, such as a merge tier's branch filter or a new cron, is skipped through the wait and is no conflict.
  Across files a gate also cannot hold for a pull request tier, a `pull_request_target` tier or another event that runs code of a fork, for an evaluation job behind a ref or cron guard, for a gated workflow that already follows another workflow, for a job gated by another plan or by a second tier, and for a job with `needs`, a `uses:` job, a job with an `if:` of its own, or a job that reads `github.ref`, `github.ref_name`, `github.sha`, `github.head_ref` or `github.event.*`.
- **Evidence is kept whatever the result.** The job uploads `<evaluation folder>/runs/` with `if: always()` under the artifact name `<job id>-runs`, so no two jobs upload one name, and each invocation writes `runs/<invocationId>/` under that folder.
- **Triggers follow the plan.** The workflow gains the events the checks name, and each evaluation job gets an `if:` on the event that starts its tier when the workflow carries more events than the tier names. When an event is new to the workflow, or an event it already has gains a branch filter, a tag pattern or a cron, the jobs that existed before get an `if:` that keeps them on the events and filters they already ran on, and the summary names each guard. A job the plan gates inside the pipeline file is exempt, since its wait keeps it off the added runs. `workflow_dispatch` goes to every tier whose checks name `manual-dispatch`.
- **Timeouts.** The `pr` and `merge` jobs get 30 minutes and the `scheduled` and `release` jobs 120, since their live checks spend model calls.
- **The plan is validated first.** Framework runs `tea-evaluate check` and refuses a plan only for findings about `ci/evaluation-ci-plan.json`.
- **Credentials stay yours.** The plan carries none, so the summary lists what the live tiers need.

The jobs carry a `# tea-evaluation-plan:` marker with the plan's path, so a later run, in create or edit mode, rewrites each of them under the id the current plan gives, renames one whose id differs and leaves every job without the marker as it was, apart from the event guards and gate waits described above.
Edit mode never writes the create run's checkpoint.
See [tea-evaluate CLI](/docs/reference/tea-evaluate-cli.md#ci) for the plan and its tiers.
