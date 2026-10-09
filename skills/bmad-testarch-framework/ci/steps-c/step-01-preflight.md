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

## 1. Verify Git Repository

- Git worktree is present (`.git` may be a directory or a worktree marker file)
- Remote configured (if available)

If missing: **HALT** with "Git repository required for CI/CD setup."

---

## 2. Detect Test Stack Type

For both scope, use the agreed contract's stack and frameworks. Verify discovered files against that contract and report drift to the coordinator. For CI-only setup, determine the project's test stack type (`test_stack_type`) using the following algorithm:

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

- Check for framework configuration based on detected stack:
  - **Frontend/Fullstack**: `playwright.config.*` or `cypress.config.*` exists
  - **Mobile**: `maestro/` or `.maestro/` directory exists, app unit/component test config exists (`jest.config.*`, `vitest.config.*`, `build.gradle` test block, XCTest target, or `test/` for Flutter), and `maestro` command is available
  - **Backend (Node.js)**: `jest.config.*` or `vitest.config.*` or test scripts in `package.json`
  - **Backend (Python)**: `pyproject.toml` with `[tool.pytest]` or `pytest.ini` or `setup.cfg` with pytest config
  - **Backend (Java/Kotlin)**: `pom.xml` with surefire/failsafe plugins or `build.gradle` with test task
  - **Backend (Go)**: `*_test.go` files present (Go convention — no config file needed)
  - **Backend (C#/.NET)**: `*.csproj` with xUnit/NUnit/MSTest references
  - **Backend (Ruby)**: `Gemfile` with rspec or `.rspec` config file
- If `test_framework` is `"auto"`, detect from config files and project manifests found
- Verify test dependencies are installed (language-appropriate package manager)

Search both the project root and contract/configured test directories; follow test scripts to their config paths. For `setup_worker = ci` in a both Create run, the agreed future configs and dependency plan satisfy this generation prerequisite. Mark actual existence/dependency checks as deferred until the coordinator's combined validation.

If the framework is missing in an ordinary CI Create run, apply the shared router's read-only framework-first offer before checkpoint writes: ask “There is no test framework yet. Set it up now and continue CI in this run?” Acceptance selects both scope and loads `{skill-root}/steps-c/step-01-preflight.md`; preserve the CI request and return here after framework completion. Declining stops and leaves the project untouched. Skip this question when the router already recorded acceptance. If the framework exists and only its dependencies are missing, install its declared dependencies through the agreed package manager and verify them before continuing.

---

## 4. Ensure Tests Pass Locally

Resolve the project's exact local test commands, package-manager invocation and required service startup/readiness from its existing scripts/configs and documentation. Use language/framework defaults only when the project has no established command. Record all surfaces for fullstack/mobile. Hold execution until section 6c freezes the complete contract.

For a CI worker in both Create, defer test execution until the framework worker finishes. Record pending validation; YAML generation may begin from the agreed future contract. The coordinator must run the resulting test commands and check pipeline consistency before completion.

---

## 5. Detect CI Platform

- If `{workflow.ci_platform}` is not `"auto"`, use that value.
- Otherwise, scan for existing CI configuration files:
  - `.github/workflows/*.yml` → `github-actions`
  - `.gitlab-ci.yml` → `gitlab-ci`
  - `Jenkinsfile` → `jenkins`
  - `azure-pipelines.yml` → `azure-devops`
  - `.harness/*.yaml` → `harness`
  - `.circleci/config.yml` → `circle-ci`
- If found, ask whether to update or replace
- If not found, infer from git remote (github.com → `github-actions`, gitlab.com → `gitlab-ci`)
- If still unresolved, default to `github-actions`

Record detected `ci_platform` in step output.

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

In both Create, also read the contract's accepted integration dependencies, Pact relevance result and planned scripts/configs. The CI worker may generate jobs from these planned artifacts before they exist; combined validation requires the actual installed dependencies, configs, tests and scripts. Ordinary CI-only runs use the on-disk checks below.

From the TEA config read:

- `tea_use_playwright_utils` — when true and the stack is Playwright, Step 3 drives burn-in selection through `runBurnIn` from `@seontechnologies/playwright-utils/burn-in` instead of `--only-changed`
- `tea_use_pactjs_utils` — when true, Step 2 adds the contract-testing jobs, **but only if the repo actually has contract tests to run**. Check for a `pact/` or `tests/contract/` directory, `.pacttest.ts` files, or pact scripts in `package.json`, and check that `@seontechnologies/pactjs-utils` and `@pact-foundation/pact` are dependencies. A contract job wired into a pipeline with no contract tests fails every build on a missing script. When the flag is on and the artifacts are absent, skip the jobs and say so in the summary.

Also record whether `@seontechnologies/playwright-utils` is in `package.json`. If `tea_use_playwright_utils` is true and the package is absent, the pipeline cannot call the burn-in runner: note it and recommend the `framework` workflow rather than scaffolding a script that will not resolve.

---

## 6c. Freeze the Existing-Framework Contract and Execute Tests

For CI-only, construct and atomically journal the complete immutable contract now, before pipeline generation: detected stack/language/frameworks, toolchain, actual package manager and lockfile, install commands, exact local and CI test commands, config/test directories, required services/startup/readiness, reporters/artifacts, effective CI platform, integration dependencies and Pact relevance. Read existing package scripts/config files and service docs; preserve `pnpm`, `yarn`, `npm`, or the language-specific manager the project uses. An empty or unresolved command/services contract stops generation until resolved. All later CI steps consume this same contract.

For both, verify the already agreed contract and report drift to the coordinator; workers do not change it independently. A parallel CI worker may use future framework paths from that frozen contract and defer execution. Ordinary CI-only and sequential runs execute the contract's actual local commands with their required services now. If they fail, halt before pipeline generation and record failures in the run journal. The coordinator's final validator repeats execution only when generated or edited outputs need revalidation.

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
