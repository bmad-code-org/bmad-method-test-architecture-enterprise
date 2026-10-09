---
name: 'step-01-preflight'
description: 'Verify prerequisites and detect CI platform'
nextStepFile: '{skill-root}/ci/steps-c/step-02-generate-pipeline.md'
outputFile: '{test_artifacts}/ci/ci-pipeline-progress.md'
legacyOutputFile: '{test_artifacts}/ci-pipeline-progress.md'
resumeStepFile: '{skill-root}/ci/steps-c/step-01b-resume.md'
---

# Step 1: Preflight Checks

## STEP GOAL

Verify CI prerequisites and determine target CI platform.

## MANDATORY EXECUTION RULES

- 📖 Read the entire step file before acting
- ✅ Speak in `{communication_language}`
- 🚫 Halt if requirements fail

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

Create preflight plans declared dependencies and required local services, then installs/starts them and runs the agreed commands after section 6c saves the contract. During legacy recovery with `setup_inventory_only = true`, execute only sections 2 through 6c as inventory and contract journaling: skip activation hooks, installs, services/tests, phase checkpoints and all scaffold/pipeline writes. Return directly to the resume caller after the contract save. Coordinator platform planning executes only section 5 and returns to framework selection before contract freeze.

## 1. Verify Git Repository

- Git worktree is present (`.git` may be a directory or a worktree marker file)
- Remote configured (if available)

If missing: **HALT** with "Git repository required for CI/CD setup."

---

## 2. Detect Test Stack Type

For both with a newly generated framework, use the agreed contract's stack and frameworks. Verify discovered files against that contract and report drift to the coordinator. For CI-only or both with `framework_reused = true`, determine the project's test stack type (`test_stack_type`) using the following algorithm:

1. If `test_stack_type` is explicitly set in config (not `"auto"`), use that value.
2. Otherwise, auto-detect by scanning project manifests:
   - **Mobile indicators**: `.maestro/` or `maestro/` flow directory, `app.json`/`app.config.*` declaring expo or react-native, `Podfile`, `android/app/build.gradle`, `*.xcodeproj`/`*.xcworkspace`, `pubspec.yaml`
   - **Frontend indicators**: `playwright.config.*`, `cypress.config.*`, `vite.config.*`, `next.config.*`, `src/components/`, `src/pages/`, `src/app/`
   - **Backend indicators**: `pyproject.toml`, `pom.xml`/`build.gradle`, `go.mod`, `*.csproj`/`*.sln`, `Gemfile`, `Cargo.toml`, `jest.config.*`, `vitest.config.*`, `src/routes/`, `src/controllers/`, `src/api/`, `Dockerfile`, `serverless.yml`
   - **Mobile present** → `mobile` (check first; a React Native or Expo project carries frontend indicators too)
   - **Both frontend and backend present** → `fullstack`
   - **Only frontend** → `frontend`
   - **Only backend** → `backend`
   - **Cannot determine** → default to `fullstack` and note assumption

Record detected `test_stack_type` in step output.

---

## 3. Verify Test Framework

Identify the existing framework from actual declared test scripts, configuration paths and test files. The application stack supplies context; it does not require a browser or device suite that the project has not declared. Apply these checks to every existing/reused project, including CI-only and frontend/mobile applications:

- **Browser surface**: Playwright or Cypress config exists at the root or the path used by the project's browser test command.
- **Node.js unit/component/API surface**: Jest/Vitest config, framework scripts in `package.json`, or a Node built-in `node --test` script with its test files. A frontend application with a passing Jest/Vitest/Node built-in suite satisfies this existing-framework prerequisite without Playwright/Cypress.
- **Mobile device surface, when declared**: Maestro flow directory or Appium config plus its app/build context; inventory required CLI/tool dependencies for installation after the contract is saved. Recognize app unit/component suites independently (Jest/Vitest, JUnit, XCTest, or Flutter tests).
- **Python**: pytest settings in `pyproject.toml`, `pytest.ini` or `setup.cfg`, or established pytest commands and test files.
- **Java/Kotlin**: Maven surefire/failsafe configuration or Gradle test task and its test files.
- **Go**: `*_test.go` files and the established Go command.
- **C#/.NET**: test projects with xUnit/NUnit/MSTest references.
- **Ruby**: RSpec dependency/config or an established RSpec command and specs.

Record the observed `frameworks` and `test_surfaces` in the contract. Browser/device installs, artifacts and jobs are applicable only for observed or explicitly requested browser/device surfaces; an app's frontend/mobile stack alone does not add them.

- If `test_framework` is `"auto"`, detect from config files and project manifests found
- Inspect installed test dependencies read-only and record any missing declared dependencies for the section 6c contract; defer installation until that contract is saved.

Search both the project root and contract/configured test directories; follow test scripts to their config paths. For `setup_worker = ci` in a both Create run, the agreed future configs and dependency plan satisfy this generation prerequisite. Mark actual existence/dependency checks as deferred until the coordinator's combined validation.

The shared router's pre-activation inventory is the single missing-framework consent gate. If expected framework artifacts are missing here, report inventory drift and halt this journal at the current phase; do not ask another framework-first question, change scope, or promise a write-free decline after activation. If the framework exists and dependencies are missing, record the declared install plan for section 6c. This inventory step performs no dependency installation or test execution.

---

## 4. Ensure Tests Pass Locally

Resolve the project's exact local test commands, package-manager invocation and required service startup/readiness from its existing scripts/configs and documentation. Use language/framework defaults only when the project has no established command. Record all surfaces for fullstack/mobile. Hold dependency installation and test execution until section 6c freezes and journals the complete contract.

Fallback commands when the project has no established invocation: Node.js `npm test` or `npm run test:e2e`; Python `pytest` or `python -m pytest`; Java/Kotlin `mvn test` or `gradle test`; Go `go test ./...`; .NET `dotnet test`; Ruby `bundle exec rspec`. Prefer the actual project command already established in its scripts/configs.

For a CI worker in both Create, defer test execution until the framework worker finishes. Record pending validation; YAML generation may begin from the agreed future contract. The coordinator must run the resulting test commands and check pipeline consistency before completion.

---

## 5. Detect CI Platform

Coordinator-only planning resolves this platform and any existing-pipeline action before the contract freezes or workers launch. If the journal/contract already records `ci_platform`, `pipeline_action`, and `pipeline_target`, consume them without a new question and skip platform redetection and the selection bullets below. During legacy inventory, retain the checkpoint's platform or infer it from its existing pipeline and journal the continuation action as `update`. Workers use the passed contract platform/action/target decision and continue to section 6 without platform detection or user questions; an unresolved platform/action/target returns to the coordinator and stops worker launch.

- If `{workflow.ci_platform}` is not `"auto"`, use that value.
- Otherwise, scan for existing CI configuration files:
  - `.github/workflows/*.yml` → `github-actions`
  - `.gitlab-ci.yml` → `gitlab-ci`
  - `Jenkinsfile` → `jenkins`
  - `azure-pipelines.yml` → `azure-devops`
  - `.harness/*.yaml` → `harness`
  - `.circleci/config.yml` → `circle-ci`
- If found and no action was recorded, the coordinator asks whether to update or replace and journals `pipeline_action` before workers launch. A headless Create uses `update` for an existing pipeline and records that decision.
- If not found, infer from git remote (github.com → `github-actions`, gitlab.com → `gitlab-ci`)
- If still unresolved, default to `github-actions`

Resolve `pipeline_target` in the coordinator: use the caller's selected pipeline or the interrupted run's saved existing path. For an existing pipeline with no selected target, identify the relevant test pipeline; when several candidates remain, the coordinator asks which target to update/replace before freezing. Use the platform's default output path only for a new pipeline. Match target format to the chosen platform and resolve any mismatch before launch.

Record `ci_platform`, `pipeline_action` (`create`, `update`, or `replace`), and exact project-relative `pipeline_target` in the journal/contract and step output; During a section-5-only coordinator planning call, return to the caller; ordinary preflight continues to section 6.

---

## 6. Read Environment Context

- Read environment context based on detected stack:
  - **Node.js**: Read `.nvmrc` if present (default to Node 24+ LTS if missing); read `package.json` for dependency caching strategy
  - **Python**: Read `.python-version` or `pyproject.toml` for Python version; note `pip`/`poetry`/`pipenv` for caching
  - **Java**: Read `pom.xml`/`build.gradle` for Java version; note Maven/Gradle for caching
  - **Go**: Read `go.mod` for Go version; note Go module cache path
  - **C#/.NET**: Read `*.csproj`/`global.json` for .NET SDK version; note NuGet cache
  - **Ruby**: Read `.ruby-version` or `Gemfile` for Ruby version; note Bundler cache

---

## 6b. Read TEA Config Flags

In both Create with a new-framework contract, also read the contract's accepted integration dependencies, Pact relevance result and planned scripts/configs. The CI worker may generate jobs from these planned artifacts before they exist; combined validation requires the actual installed dependencies, configs, tests and scripts. Ordinary CI-only runs use the on-disk checks below.

From the TEA config read:

- `tea_use_playwright_utils` — when true and the stack is Playwright, Step 3 drives burn-in selection through `runBurnIn` from `@seontechnologies/playwright-utils/burn-in` instead of `--only-changed`
- `tea_use_pactjs_utils` — when true, Step 2 adds the contract-testing jobs, **but only if the repo actually has contract tests to run**. Check for a `pact/` or `tests/contract/` directory, `.pacttest.ts` files, or pact scripts in `package.json`, and check that `@seontechnologies/pactjs-utils` and `@pact-foundation/pact` are dependencies. A contract job wired into a pipeline with no contract tests fails every build on a missing script. When the flag is on and the artifacts are absent, skip the jobs and say so in the summary.

Also record whether `@seontechnologies/playwright-utils` is in `package.json`. If `tea_use_playwright_utils` is true and the package is absent, the pipeline cannot call the burn-in runner: record the missing integration and its dependency decision for this run's contract; use the documented available-package fallback until the required dependency is present.

---

## 6c. Freeze the Existing-Framework Contract and Execute Tests

For CI-only or both with `framework_reused = true`, resolve required dependency choices and the declared installation plan, then construct and atomically journal the complete immutable contract now, before dependency installation, test execution or pipeline generation: detected stack/language/frameworks, toolchain, actual package manager and lockfile, install commands, exact local and CI test commands, config/test directories, observed test surfaces, required services/startup/readiness, reporters/artifacts, effective CI platform/action/target, integration dependencies and Pact relevance. Read existing package scripts/config files and service docs; preserve `pnpm`, `yarn`, `npm`, or the language-specific manager the project uses. An empty or unresolved command/services contract stops generation until resolved. All later CI steps consume this same contract. In `setup_inventory_only` recovery, save this recovered contract, skip the execution paragraph below, and return to the original resume caller without phase checkpoint writes.

For both with a newly generated framework, verify the already agreed contract and report drift to the coordinator; workers do not change it independently. A parallel CI worker may use future framework paths from that frozen contract and defer execution. After the complete contract is successfully journaled, ordinary CI-only and sequential runs install any missing declared dependencies through its agreed package manager/install commands, verify dependency readiness, start its required services, and execute its actual local test commands. Installation and execution failures stop before pipeline generation and are recorded in the run journal. When existing commands pass with `framework_reused = true`, the coordinator marks that reused framework phase completed in the journal and continues CI generation; retain its original Create checkpoint and skip framework scaffold/hook checks. The coordinator's final validator repeats execution only when generated outputs need revalidation.

---

## 7. Check for an Existing Checkpoint

The pre-activation request gate has already selected the applicable run and its Resume/start-over decision. Honor that journal decision without another prompt or a reset of its ledger. A saved `setup_resume_requested` dispatches the journal's next position directly; never let the headless start-over fallback below replace selected Resume. A fresh new `run_id` following an approved start-over replaces this Create checkpoint at Save Progress while preserving prior archived journal history. Ask the phase-local question below only for a direct legacy invocation with no recorded coordinator decision.

Check whether `{outputFile}` already exists. A project has one CI pipeline setup, so a checkpoint at this path belongs to a previous run of this workflow.
When it does not exist, also check `{legacyOutputFile}`, where runs before the `ci/` folder wrote the checkpoint. Only an in-progress legacy checkpoint counts here; a completed one stays where it is and this run starts fresh in the folder.

A checkpoint that carries no `workflowStatus` predates that key: treat it as `'completed'` when its `lastStep` is `'step-04-validate-and-summary'`, and as `'in-progress'` otherwise.

- **No checkpoint:** this is a fresh run. Proceed to Save Progress.
- **Exists with `workflowStatus: 'in-progress'`:** a previous run was interrupted. Display its `lastStep` and `lastSaved`, then ask:

  > "An unfinished CI pipeline setup was last saved {lastSaved} at step {lastStep}. Resume it, or start over? Starting over replaces the checkpoint."

  **Halt** until the user answers. A headless or autonomous run starts over. If they resume, load `{resumeStepFile}`, read it completely, and execute it. If they start over, replace `{outputFile}` entirely in Save Progress and leave any legacy checkpoint untouched.

- **Exists with `workflowStatus: 'completed'`:** a finished run. Replace `{outputFile}` entirely in Save Progress.

**Never merge two runs into one checkpoint.** A `stepsCompleted` array carried over from a prior run makes the resume dashboard and its routing report steps this run never performed.

---

### 8. Save Progress

**Save this step's accumulated work to `{outputFile}`.**

Retain `run_id`, `setup_scope`, `setup_operation`, the agreed `contract`, and hook ledger fields with this Create phase's frontmatter. For every scope, report this save and the next step to the coordinator so it atomically updates `{test_artifacts}/framework/setup-run-progress.md` and `phase_position` through `resources/setup-state.md`; preserve per-phase step names and artifact paths. Workers update only their own Create checkpoint.

Create the `{test_artifacts}/ci/` folder if it does not exist. Write the file with YAML frontmatter, replacing any prior content as decided in the previous section:

```yaml
---
workflowStatus: 'in-progress'
stepsCompleted: ['step-01-preflight']
lastStep: 'step-01-preflight'
lastSaved: '{date}'
---
```

Then write this step's output below the frontmatter.

Load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Step completed in full with required outputs

### ❌ SYSTEM FAILURE:

- Skipped sequence steps or missing outputs
  **Master Rule:** Skipping steps is FORBIDDEN.
