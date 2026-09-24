---
name: 'step-01-preflight-and-context'
description: 'Verify prerequisites, load story, framework, and knowledge base, and resolve run identity'
outputFile: '{test_artifacts}/atdd/atdd-checklist-{story_key}.md'
nextStepFile: '{skill-root}/steps-c/step-02-generation-mode.md'
resumeStepFile: '{skill-root}/steps-c/step-01b-resume.md'
knowledgeIndex: './resources/tea-index.csv'
---

# Step 1: Preflight & Context Loading

## STEP GOAL

Verify prerequisites, load all required inputs, and resolve the run identity that names this story's checklist before generating red-phase acceptance test scaffolds.

## MANDATORY EXECUTION RULES

- 📖 Read the entire step file before acting
- ✅ Speak in `{communication_language}`
- 🚫 Halt if requirements are missing

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

## 1. Stack Detection

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

---

## 2. Prerequisites (Hard Requirements)

- Story approved with **clear acceptance criteria**
- Test framework configured:
  - **If {detected_stack} is `frontend` or `fullstack`:** `playwright.config.ts` or `cypress.config.ts`
  - **If {detected_stack} is `backend`:** relevant test config exists (e.g., `conftest.py`, `src/test/`, `*_test.go`, `.rspec`)
- Development environment available

If any are missing: **HALT** and notify the user.

---

## 3. Load Story Context

- Read story markdown from `{story_file}` (or ask user if not provided)
- Extract acceptance criteria and constraints into a criterion registry in source order
- Preserve every supplied criterion id that matches `AC-<positive integer>` exactly
- Reject duplicate supplied ids
- Assign ids to unnamed criteria deterministically. Reserve all supplied ids first, then visit unnamed criteria in source order and assign the lowest unused `AC-<positive integer>` id
- Persist each registry row as `{ id, idSource: supplied | generated, text }` and persist the exact ordered id set as `{criterion_ids}`. The same story content must always produce the same registry
- Identify affected components and integrations
- Derive and store `story_id` from story metadata, the H1 heading, or the filename when available (for BMM stories, this is typically `{epic_num}.{story_num}`)
- Derive and store `story_key`:
  - With a story file, `story_key` is the BMM story file basename without `.md` (for example `1-2-user-authentication`)
  - Without a story file, use `story_id` with `.` replaced by `-` (`1.2` becomes `1-2`)
  - With neither, use a slug of the story title: lowercase; replace every run of characters outside `a-z` and `0-9` with a single `-`; trim leading and trailing `-`; truncate to 64 characters
- Use that `story_key` for the `{outputFile}` basename so all checklist and handoff paths stay consistent
- If `story_id` is still unavailable after metadata/H1/filename parsing, set it to the final `story_key` so `story_id` is never empty
- Preserve `{story_file}` as a tracked artifact path for later handoff into BMM `dev-story`
- If a test design covers this story, read it for P0-P3 priorities and risks. Look in `{test_artifacts}/test-design/` first (`test-design-epic-{epic_num}.md` for the story's epic, then the system-level `test-design-qa.md` and `test-design-architecture.md`), then the legacy root `{test_artifacts}/` for the same names. Record the path you loaded in `inputDocuments`, or state that no test design was found in either location.

---

## 4. Load Framework & Existing Patterns

- Read framework config
- Inspect `{test_dir}` for existing test patterns, fixtures, helpers

## 4.5 Read TEA Config Flags

From `{config_source}`:

- `tea_use_playwright_utils`
- `tea_use_pactjs_utils`
- `tea_pact_mcp`
- `tea_browser_automation`
- `test_stack_type`

---

### Deterministic Knowledge Selection

The fragment list for this step is a closed set. Start empty, evaluate the complete conditions under **Load Knowledge Base Fragments**, and add every fragment from each matching list. A config flag opens a branch only when every stack, runner, package, and relevance condition on that branch also matches. Do not add fragments from tier labels, index descriptions, nearby mentions, general usefulness, or possible future need. Deduplicate while preserving the order below. Identical facts and config must produce an identical list.

Contract testing is relevant only when repository facts show existing Pact artifacts, dependencies, configuration, or broker variables, or when the task explicitly requests contract testing. A service count or target-state architecture alone does not open a contract branch.

## 5. Load Knowledge Base Fragments

Use `{knowledgeIndex}` to load:

**Core (always):**

- `data-factories.md`
- `component-tdd.md`
- `test-quality.md`
- `test-healing-patterns.md`

**If {detected_stack} is `frontend` or `fullstack`:**

- `selector-resilience.md`
- `timing-debugging.md`

**Playwright Utils (if enabled, `@seontechnologies/playwright-utils` is in `package.json`, the test files run on the Playwright runner, and {detected_stack} is `frontend` or `fullstack`):**

- `playwright-utils-mandate.md` (load first — it governs how the fragments below are applied)
- `overview.md`, `api-request.md`, `network-recorder.md`, `auth-session.md`, `intercept-network-call.md`, `recurse.md`, `log.md`, `file-utils.md`, `network-error-monitor.md`, `fixtures-composition.md`
- `fixture-architecture.md` and `network-first.md` for their principles only. Under the mandate the mechanism comes from the playwright-utils fragments.

**Playwright CLI (if tea_browser_automation is "cli" or "auto" and {detected_stack} is `frontend` or `fullstack`):**

- `playwright-cli.md`

**MCP Patterns (if tea_browser_automation is "mcp" or "auto" and {detected_stack} is `frontend` or `fullstack`):**

- (existing MCP-related fragments, if any are added in future)

**Traditional Patterns (if the Playwright Utils applicability gate above did not open and {detected_stack} is `frontend` or `fullstack`):**

- `fixture-architecture.md`
- `network-first.md`

**Backend Patterns (if {detected_stack} is `backend` or `fullstack`):**

- `test-levels-framework.md`
- `test-priorities-matrix.md`
- `ci-burn-in.md`

**Pact.js Utils (if enabled, `@seontechnologies/pactjs-utils` is in `package.json`, and contract testing is relevant):**

- `pactjs-utils-mandate.md` (load first — it governs how the fragments below are applied)
- `pactjs-utils-overview.md`, `pactjs-utils-consumer-helpers.md`, `pactjs-utils-provider-verifier.md`, `pactjs-utils-request-filter.md`, `pactjs-utils-zod-to-pact.md`, `pact-consumer-di.md`, `pact-consumer-framework-setup.md`, `pact-broker-webhooks.md`

**Contract Testing (if Pact.js Utils is disabled or not installed, and contract testing is relevant):**

- `contract-testing.md`

**Pact MCP (if tea_pact_mcp is "mcp" and contract testing is relevant):**

- `pact-mcp.md`

---

## 6. Confirm Inputs

Summarize loaded inputs and confirm with the user. Then proceed.

---

## 7. Resolve Run Identity

An ATDD run always covers exactly one story, so its checklist filename carries the story's identity and a run for one story never touches another story's checklist. Resolve the identity **now**, before any progress is saved.

Resolve the story in this order:

1. Use the story the user named in this invocation.
2. Otherwise use the story carried by the loaded artifacts: the story file name, or the story id from its metadata or H1 heading.
3. If several stories are candidates and the run is interactive, list them and ask which one this run covers. **Halt** until the user answers. A headless or autonomous run with no resolvable story halts with "A story with acceptance criteria is required for ATDD." ATDD has no `system` fallback because a story is a hard prerequisite.

Derive `story_key` from the resolved story as described in section 3, then set:

- `run_scope` to `story`
- `run_key` to `story-{story_key}`

`story-{story_key}` follows the shared run_key grammar: `story_key` is the BMM story file basename without `.md` (for example `1-2-user-authentication`); without a story file, it is the story id with `.` replaced by `-` (`1.2` becomes `1-2`).

Carry `story_key`, `run_scope`, and `run_key` forward through every remaining step. `{outputFile}` is `{test_artifacts}/atdd/atdd-checklist-{story_key}.md`.

---

## 8. Check for an Existing Checklist

Check whether `{outputFile}` already exists. A checklist at this path belongs to a previous run for the **same** story; checklists for other stories live under their own filenames and are never read or written here.

- **Does not exist:** this is a fresh run. Proceed to Save Progress.
- **Exists with `workflowStatus: 'in-progress'`:** a previous run for this story was interrupted. Display its `lastStep` and `lastSaved`, then ask:

  > "An unfinished ATDD run for `{run_key}` was last saved {lastSaved} at step {lastStep}. Resume it, or start over? Starting over replaces the checklist."

  **Halt** until the user answers. A headless or autonomous run starts over. If they resume, load `{resumeStepFile}`, read it completely, and execute it. If they start over, replace `{outputFile}` entirely in Save Progress.

- **Exists with `workflowStatus: 'completed'`**, or with no `workflowStatus` and `lastStep: 'step-05-validate-and-complete'`: a finished run for this story. Replace `{outputFile}` entirely in Save Progress.

**Never merge two runs into one checklist.** A `stepsCompleted` array or checklist body carried over from a prior run makes the resume dashboard and the story handoff report work this run never performed.

---

## 9. Save Progress

**Save this step's accumulated work to `{outputFile}`.**

Create the `{test_artifacts}/atdd/` folder if it does not exist. Write the file with YAML frontmatter, replacing any prior content as decided in the previous section:

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

`runScope` and `runKey` are this run's identity. Later steps carry both forward unchanged, and Resume mode refuses to continue a checklist whose `runKey` does not match the story being resumed.

**Update frontmatter fields**:

- Set `storyId` to `{story_id}`
- Set `storyKey` to `{story_key}`
- Set `storyFile` to `{story_file}`
- Set `atddChecklistPath` to `{outputFile}`
- Initialize `generatedTestFiles` to `[]`
- Set `inputDocuments` to the list of artifact paths loaded in this step (e.g., knowledge fragments, test design documents, configuration files)
- Set `acceptanceCriteria` to the persisted criterion registry, including generated ids and `idSource`

Load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Step completed in full with required outputs
- `story_key`, `run_scope`, and `run_key` resolved before the first save, and the checklist written to the path they name
- Any pre-existing checklist for this story was reported to the user and either resumed or replaced

### ❌ SYSTEM FAILURE:

- Skipped sequence steps or missing outputs
- Saving progress before `story_key` is resolved
- Appending this run's progress to a checklist left by a previous run
  **Master Rule:** Skipping steps is FORBIDDEN.
