---
name: 'step-02-generate-pipeline'
description: 'Generate CI pipeline configuration'
nextStepFile: './step-03-configure-quality-gates.md'
outputFile: '{test_artifacts}/ci-pipeline-progress.md'
---

# Step 2: Generate CI Pipeline

## STEP GOAL

Create platform-specific CI configuration with test execution, sharding, burn-in, and artifacts.

## MANDATORY EXECUTION RULES

- 📖 Read the entire step file before acting
- ✅ Speak in `{communication_language}`

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

## 1. Resolve Output Path and Select Template

Determine the pipeline output file path based on the detected `ci_platform`:

| CI Platform      | Output Path                                 | Template File                                       |
| ---------------- | ------------------------------------------- | --------------------------------------------------- |
| `github-actions` | `{project-root}/.github/workflows/test.yml` | `{installed_path}/github-actions-template.yaml`     |
| `gitlab-ci`      | `{project-root}/.gitlab-ci.yml`             | `{installed_path}/gitlab-ci-template.yaml`          |
| `jenkins`        | `{project-root}/Jenkinsfile`                | `{installed_path}/jenkins-pipeline-template.groovy` |
| `azure-devops`   | `{project-root}/azure-pipelines.yml`        | `{installed_path}/azure-pipelines-template.yaml`    |
| `harness`        | `{project-root}/.harness/pipeline.yaml`     | `{installed_path}/harness-pipeline-template.yaml`   |
| `circle-ci`      | `{project-root}/.circleci/config.yml`       | _(no template; generate from first principles)_     |

Use templates from `{installed_path}` when available. Adapt the template to the project's `test_stack_type` and `test_framework`.

---

## 2. Pipeline Stages

Include stages:

- lint
- test (parallel shards)
- contract-test (if `tea_use_pactjs_utils` enabled)
- burn-in (flaky detection)
- report (aggregate + publish)

---

## 3. Test Execution

- Parallel sharding enabled
- CI retries configured
- Capture artifacts (HTML report, JUnit XML, traces/videos on failure)
- Cache dependencies (language-appropriate: node_modules, .venv, .m2, go module cache, NuGet, bundler)

Write the selected pipeline configuration to the resolved output path from step 1. Adjust test commands based on `test_stack_type` and `test_framework`:

- **Frontend/Fullstack**: Include browser install, E2E/component test commands, Playwright/Cypress artifacts
- **Backend (Node.js)**: Use `npm test` or framework-specific commands (`vitest`, `jest`), skip browser install
- **Backend (Python)**: Use `pytest` with coverage (`pytest --cov`), install via `pip install -r requirements.txt` or `poetry install`
- **Backend (Java/Kotlin)**: Use `mvn test` or `gradle test`, cache `.m2/repository` or `.gradle/caches`
- **Backend (Go)**: Use `go test ./...` with coverage (`-coverprofile`), cache Go modules
- **Backend (C#/.NET)**: Use `dotnet test` with coverage, restore NuGet packages
- **Backend (Ruby)**: Use `bundle exec rspec` with coverage, cache `vendor/bundle`

### Contract Testing Pipeline (if `tea_use_pactjs_utils` enabled)

When `tea_use_pactjs_utils` is enabled, add a `contract-test` stage after `test`:

1. **Consumer test + publish**: Run consumer contract tests, then publish pacts to broker
   - `npm run test:contract:consumer`
   - `npx pact-broker publish ./pacts --consumer-app-version=$GIT_SHA --branch=$BRANCH`
   - Only publish on PR and main branch pushes

2. **Provider verification**: Run provider verification against published pacts
   - `npm run test:contract:provider`
   - `buildVerifierOptions` auto-reads `PACT_BROKER_BASE_URL`, `PACT_BROKER_TOKEN`
   - Verification results published to broker when `CI=true`

3. **Can-I-Deploy gate**: Block deployment if contracts are incompatible
   - `npx pact-broker can-i-deploy --pacticipant=$PROVIDER --version=$GIT_SHA --to-environment=production`
   - Add `--retry-while-unknown 6 --retry-interval 10` for async verification

4. **Webhook job**: Add `repository_dispatch` trigger for `pact_changed` event
   - Provider verification runs when consumers publish new pacts
   - Ensures compatibility is checked on both consumer and provider changes

5. **Breaking change handling**: When `PACT_BREAKING_CHANGE=true` env var is set:
   - Provider test passes `includeMainAndDeployed: false` to `buildVerifierOptions` — verifies only matching branch
   - Coordinate with consumer team before removing the flag

6. **Record deployment**: After successful deployment, record version in broker
   - `npx pact-broker record-deployment --pacticipant=$PROVIDER --version=$GIT_SHA --environment=production`

Required CI secrets: `PACT_BROKER_BASE_URL`, `PACT_BROKER_TOKEN`

**If `tea_pact_mcp` is `"mcp"`:** Reference the SmartBear MCP `Can I Deploy` and `Matrix` tools for pipeline guidance in `pact-mcp.md`.

---

### 4. Save Progress

**Save this step's accumulated work to `{outputFile}`.**

- **If `{outputFile}` does not exist** (first save), create it with YAML frontmatter:

  ```yaml
  ---
  stepsCompleted: ['step-02-generate-pipeline']
  lastStep: 'step-02-generate-pipeline'
  lastSaved: '{date}'
  ---
  ```

  Then write this step's output below the frontmatter.

- **If `{outputFile}` already exists**, update:
  - Add `'step-02-generate-pipeline'` to `stepsCompleted` array (only if not already present)
  - Set `lastStep: 'step-02-generate-pipeline'`
  - Set `lastSaved: '{date}'`
  - Append this step's output to the appropriate section of the document.

Load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Step completed in full with required outputs

### ❌ SYSTEM FAILURE:

- Skipped sequence steps or missing outputs
  **Master Rule:** Skipping steps is FORBIDDEN.
