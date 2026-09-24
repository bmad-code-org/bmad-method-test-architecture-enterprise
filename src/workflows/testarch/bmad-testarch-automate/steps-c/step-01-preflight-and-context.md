---
name: 'step-01-preflight-and-context'
description: 'Determine mode, verify framework, load context and knowledge, and resolve run identity'
outputFile: '{test_artifacts}/automate/automation-summary-{run_key}.md'
nextStepFile: '{skill-root}/steps-c/step-02-identify-targets.md'
resumeStepFile: '{skill-root}/steps-c/step-01b-resume.md'
knowledgeIndex: './resources/tea-index.csv'
---

# Step 1: Preflight & Context Loading

## STEP GOAL

Determine execution mode, verify framework readiness, load the necessary artifacts and knowledge fragments, and resolve the run identity that names this run's automation summary.

## MANDATORY EXECUTION RULES

- 📖 Read the entire step file before acting
- ✅ Speak in `{communication_language}`
- 🚫 Halt if framework scaffolding is missing

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

## 1. Stack Detection & Verify Framework

**Read `config.test_stack_type`** from `{config_source}`.

**Auto-Detection Algorithm** (when `test_stack_type` is `"auto"` or not configured):

- Scan `{project-root}` for project manifests:
  - **Mobile indicators**: `.maestro/` or `maestro/` flow directory, `app.json`/`app.config.*` declaring expo or react-native, `Podfile`, `android/app/build.gradle`, `*.xcodeproj`/`*.xcworkspace`, `pubspec.yaml`
  - **Frontend indicators**: `package.json` with react/vue/angular/next dependencies, `playwright.config.*`, `vite.config.*`, `webpack.config.*`
  - **Backend indicators**: `pyproject.toml`, `pom.xml`/`build.gradle`, `go.mod`, `*.csproj`/`*.sln`, `Gemfile`, `Cargo.toml`
  - **Check mobile first.** A React Native or Expo project carries `package.json` with react and misdetects as `frontend` otherwise.
  - **Mobile present** = `mobile`; frontend and backend both present = `fullstack`; only frontend = `frontend`; only backend = `backend`
  - A mobile client and its own backend in one repo detects as `mobile`. Set `test_stack_type` explicitly to cover both surfaces in one run.
- Explicit `test_stack_type` config value overrides auto-detection
- **Backward compatibility**: if `test_stack_type` is not in config, treat as `"auto"` (preserves current frontend behavior for existing installs)

Store result as `{detected_stack}` = `frontend` | `backend` | `fullstack` | `mobile`

**Verify framework exists:**

**If {detected_stack} is `frontend` or `fullstack`:**

- `playwright.config.ts` or `cypress.config.ts`
- `package.json` includes test dependencies

**If {detected_stack} is `backend` or `fullstack`:**

- Relevant test config exists (e.g., `conftest.py`, `src/test/`, `*_test.go`, `.rspec`, test project `*.csproj`)

**If {detected_stack} is `mobile`:**

- Required project framework configuration (HALT if missing either):
  - A `maestro/` or `.maestro/` directory exists
  - The app's own unit/component test config exists (`jest.config.*`, `vitest.config.*`, `build.gradle` test block, an XCTest target, or `test/` for Flutter)
- Environment PATH check: `maestro` command on PATH. If missing from PATH, do NOT halt: flows can still be generated, so record that they cannot be executed in this run environment and say so in the summary.

If required framework configuration is missing: **HALT** with message "Run `framework` workflow first."

---

## 2. Determine Execution Mode

- **BMad-Integrated** if story/tech-spec/test-design artifacts are provided or found
- **Standalone** if only source code is available
- If unclear, ask the user which mode to use

---

## 3. Load Context

### BMad-Integrated (if available)

- Story with acceptance criteria
- PRD and/or tech spec
- Test-design document (if exists). Look in `{test_artifacts}/test-design/` first (`test-design-epic-{epic_num}.md` for the epic in scope, then the system-level `test-design-qa.md` and `test-design-architecture.md`), then the legacy root `{test_artifacts}/` for the same names. Record the path you loaded, or state that no test design was found in either location.

### Standalone

- Skip artifacts; proceed to codebase analysis

### Always Load

- Test framework config
- Existing test structure in `{test_dir}`
- Existing tests (for coverage gaps)

### Read TEA Config Flags

- From `{config_source}` read `tea_use_playwright_utils`
- From `{config_source}` read `tea_use_pactjs_utils`
- From `{config_source}` read `tea_pact_mcp`
- From `{config_source}` read `tea_browser_automation`
- From `{config_source}` read `test_stack_type`

---

### Deterministic Knowledge Selection

The fragment list for this step is a closed set. Start empty, evaluate the complete conditions under **Load Knowledge Base Fragments**, and add every fragment from each matching list. A config flag opens a branch only when every stack, runner, package, and relevance condition on that branch also matches. Do not add fragments from tier labels, index descriptions, nearby mentions, general usefulness, or possible future need. Deduplicate while preserving the order below. Identical facts and config must produce an identical list.

Contract testing is relevant only when repository facts show existing Pact artifacts, dependencies, configuration, or broker variables, or when the task explicitly requests contract testing. A service count or target-state architecture alone does not open a contract branch.

## 4. Load Knowledge Base Fragments

Use `{knowledgeIndex}` and load only what is required.

**Core (always load):**

- `test-levels-framework.md`
- `test-priorities-matrix.md`
- `data-factories.md`
- `selective-testing.md`
- `ci-burn-in.md`
- `test-quality.md`

**Mobile (if `{detected_stack}` is `mobile`):**

- `mobile-test-strategy.md`
- `maestro-flows.md`
- `mobile-ci-device-lab.md`

**Playwright Utils (if enabled, `@seontechnologies/playwright-utils` is in `package.json`, and the test files run on the Playwright runner):**

- `playwright-utils-mandate.md` (load first — it governs how the fragments below are applied)
- `overview.md`, `api-request.md`, `network-recorder.md`, `auth-session.md`, `intercept-network-call.md`, `recurse.md`, `log.md`, `file-utils.md`, `burn-in.md`, `network-error-monitor.md`, `fixtures-composition.md`
- `fixture-architecture.md` and `network-first.md` for their principles only. Under the mandate the mechanism comes from the playwright-utils fragments: interception is `interceptNetworkCall` declared before `page.goto`, and composition is `mergeTests`.

**Traditional Patterns (if the Playwright Utils applicability gate above did not open and the test files run on the Playwright runner):**

- `fixture-architecture.md`
- `network-first.md`

**Pact.js Utils (if enabled, `@seontechnologies/pactjs-utils` is in `package.json`, and contract testing is relevant):**

- `pactjs-utils-mandate.md` (load first — it governs how the fragments below are applied)
- `pactjs-utils-overview.md`, `pactjs-utils-consumer-helpers.md`, `pactjs-utils-provider-verifier.md`, `pactjs-utils-request-filter.md`, `pactjs-utils-zod-to-pact.md`

**Contract Testing (if Pact.js Utils is disabled or not installed, and contract testing is relevant):**

- `contract-testing.md`

**Pact MCP (if tea_pact_mcp is "mcp" and contract testing is relevant):**

- `pact-mcp.md`

**Healing (if auto-heal enabled):**

- `test-healing-patterns.md`
- `selector-resilience.md`
- `timing-debugging.md`

**Playwright CLI (if tea_browser_automation is "cli" or "auto" and the test files run on the Playwright runner):**

- `playwright-cli.md`

**MCP Patterns (if tea_browser_automation is "mcp" or "auto"):**

- (existing MCP-related fragments, if any are added in future)

---

## 5. Confirm Inputs

Summarize loaded artifacts, framework, and knowledge fragments, then proceed.

---

## 6. Resolve Run Identity

Every run writes an automation summary whose filename carries the run's scope, so a run for one story, epic, or target never rewrites or appends into another scope's summary. Resolve `run_scope` and `run_key` **now**, before any progress is saved.

### run_key grammar

- `system`: the whole project or system, or no narrower scope could be resolved.
- `epic-{epic_num}`: one epic.
- `story-{story_key}`: one story. `story_key` is the BMM story file basename without `.md` (for example `1-2-user-authentication`). Without a story file, use the story id with `.` replaced by `-` (`1.2` becomes `1-2`).
- `target-{slug}`: when no story or epic applies, the slug of the automated path or feature name. Use `target_feature` when it is set. For `target_files`, use the single file path, or the deepest directory the files share.

Slug rule (used for every `{slug}` and for an epic title with no number): lowercase; replace every run of characters outside `a-z` and `0-9` with a single `-`; trim leading and trailing `-`; truncate to 64 characters.

### Resolution order

1. Use the scope the user named in this invocation (a story, an epic, a feature or path, or the whole system).
2. Otherwise use the scope carried by the loaded artifacts: a story file gives `story-{story_key}`; an epic document gives `epic-{epic_num}` from its metadata, H1 heading, or filename; a `target_feature` or `target_files` value with no story or epic gives `target-{slug}`. When a story and its epic are both loaded, the story is the scope.
3. If several candidates of the same kind remain (for example two stories) and the run is interactive, list them and ask which one this run covers. **Halt** until the user answers. A headless or autonomous run with no resolvable scope uses `system` and says so in the summary.

Auto-discovery across the whole codebase with no story, epic, or target is `system`.

Set `run_scope` to `story`, `epic`, `target`, or `system` to match the resolved `run_key`. Carry `run_scope` and `run_key` forward through every remaining step.

---

## 7. Check for an Existing Summary

Check whether `{outputFile}` already exists. A summary at this path belongs to a previous run of the **same** scope; summaries for other scopes live under their own filenames and are never read or written here.

- **Does not exist:** this is a fresh run. Proceed to Save Progress.
- **Exists with `workflowStatus: 'in-progress'`:** a previous run for this scope was interrupted. Display its `lastStep` and `lastSaved`, then ask:

  > "An unfinished automate run for `{run_key}` was last saved {lastSaved} at step {lastStep}. Resume it, or start over? Starting over replaces the summary."

  **Halt** until the user answers. A headless or autonomous run starts over. If they resume, load `{resumeStepFile}`, read it completely, and execute it. If they start over, replace `{outputFile}` entirely in Save Progress.

- **Exists with `workflowStatus: 'completed'`**, or with no `workflowStatus` and `lastStep: 'step-04-validate-and-summarize'`: a finished run for this scope. Replace `{outputFile}` entirely in Save Progress.

**Never merge two runs into one summary.** Content carried over from a prior run makes the summary report tests, files, and coverage this run never produced.

---

## 8. Save Progress

**Save this step's accumulated work to `{outputFile}`.**

Create the `{test_artifacts}/automate/` folder if it does not exist. Write the file with YAML frontmatter, replacing any prior content as decided in the previous section:

```yaml
---
runScope: '{run_scope}'
runKey: '{run_key}'
workflowStatus: 'in-progress'
stepsCompleted: ['step-01-preflight-and-context']
lastStep: 'step-01-preflight-and-context'
lastSaved: '{date}'
---
```

Then write this step's output below the frontmatter.

`runScope` and `runKey` are this run's identity. Later steps carry both forward unchanged and never re-derive them, and Resume mode refuses to continue a summary whose `runKey` does not match the run being resumed.

**Update `inputDocuments`**: Set `inputDocuments` in the output template frontmatter to the list of artifact paths loaded in this step (e.g., knowledge fragments, test design documents, configuration files).

Load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Step completed in full with required outputs
- `run_scope` and `run_key` resolved before the first save, and the summary written to the path they name
- Any pre-existing summary for this scope was reported to the user and either resumed or replaced

### ❌ SYSTEM FAILURE:

- Skipped sequence steps or missing outputs
- Saving progress before run identity is resolved, or writing to a summary path that carries no run identity
- Appending this run's progress to a summary left by a previous run
  **Master Rule:** Skipping steps is FORBIDDEN.
