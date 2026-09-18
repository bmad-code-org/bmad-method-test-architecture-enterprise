---
name: 'step-01-preflight-and-context'
description: 'Verify prerequisites and load story, framework, and knowledge base'
outputFile: '{test_artifacts}/atdd-checklist-{story_key}.md'
nextStepFile: '{skill-root}/steps-c/step-02-generation-mode.md'
knowledgeIndex: './resources/tea-index.csv'
---

# Step 1: Preflight & Context Loading

## STEP GOAL

Verify prerequisites and load all required inputs before generating red-phase acceptance test scaffolds.

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
- Derive and store `story_key` from the story filename when available (for BMM stories, this is the filename without `.md`, e.g. `1-2-user-authentication`)
- Derive and store `story_id` from story metadata, the H1 heading, or the filename when available (for BMM stories, this is typically `{epic_num}.{story_num}`)
- If a filename-based `story_key` is not available, create and persist a stable slug from the story title:
  - lowercase the title
  - collapse runs of whitespace to single `-`
  - strip all non-alphanumeric and non-hyphen characters
  - trim leading/trailing hyphens
  - truncate to a safe max length (64 chars)
- Use that slug as `story_key` and for `{outputFile}` basename so all checklist and handoff paths stay consistent
- If `story_id` is still unavailable after metadata/H1/filename parsing, set it to the final `story_key` so `story_id` is never empty
- Preserve `{story_file}` as a tracked artifact path for later handoff into BMM `dev-story`

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

## 7. Save Progress

**Save this step's accumulated work to `{outputFile}`.**

- **If `{outputFile}` does not exist** (first save), create it with YAML frontmatter:

  ```yaml
  ---
  stepsCompleted: ['step-01-preflight-and-context']
  lastStep: 'step-01-preflight-and-context'
  lastSaved: '{date}'
  ---
  ```

  Then write this step's output below the frontmatter.

- **If `{outputFile}` already exists**, update:
  - Add `'step-01-preflight-and-context'` to `stepsCompleted` array (only if not already present)
  - Set `lastStep: 'step-01-preflight-and-context'`
  - Set `lastSaved: '{date}'`
  - Append this step's output to the appropriate section.

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

### ❌ SYSTEM FAILURE:

- Skipped sequence steps or missing outputs
  **Master Rule:** Skipping steps is FORBIDDEN.
