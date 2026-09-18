---
name: 'step-02-load-context'
description: 'Load documents, configuration, and knowledge fragments for the chosen mode'
nextStepFile: '{skill-root}/steps-c/step-03-risk-and-testability.md'
knowledgeIndex: './resources/tea-index.csv'
outputFile: '{test_artifacts}/test-design-progress-{run_key}.md'
---

# Step 2: Load Context & Knowledge Base

## STEP GOAL

Load the required documents, config flags, and knowledge fragments needed to produce accurate test design outputs.

## MANDATORY EXECUTION RULES

- 📖 Read the entire step file before acting
- ✅ Speak in `{communication_language}`
- 🎯 Only load artifacts required for the selected mode

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

## 1. Load Configuration

From `{config_source}`:

- Read `tea_use_playwright_utils`
- Read `tea_use_pactjs_utils`
- Read `tea_pact_mcp`
- Read `tea_browser_automation`
- Read `test_stack_type` (if not set, default to `"auto"`)
- Note `test_artifacts`

**Stack Detection** (for context-aware loading):

If `test_stack_type` is `"auto"` or not configured, infer `{detected_stack}` by scanning `{project-root}`:

- **Mobile indicators**: `.maestro/` or `maestro/` flow directory, `app.json`/`app.config.*` declaring expo or react-native, `Podfile`, `android/app/build.gradle`, `*.xcodeproj`, `pubspec.yaml`
- **Frontend indicators**: `playwright.config.*`, `cypress.config.*`, `package.json` with react/vue/angular
- **Backend indicators**: `pyproject.toml`, `pom.xml`/`build.gradle`, `go.mod`, `*.csproj`, `Gemfile`, `Cargo.toml`
- **Check mobile first** → `mobile`. A React Native or Expo project carries `package.json` with react and misdetects as `frontend` otherwise. When both mobile and backend indicators are present, preserve backend manifests and context alongside mobile context rather than discarding backend information.
- **Both frontend and backend present** → `fullstack`; only frontend → `frontend`; only backend → `backend`
- Explicit `test_stack_type` overrides auto-detection

---

## 2. Load Project Artifacts (Mode-Specific)

### System-Level Mode (Phase 3)

Load:

- PRD (FRs + NFRs)
- ADRs or architecture decisions
- Architecture / tech-spec document
- Epics (for scope)

Extract:

- Tech stack & dependencies
- Integration points
- NFRs (performance, security, reliability, compliance)
- NFR thresholds and missing threshold questions

### Epic-Level Mode (Phase 4)

Load documents for the epic identified by the `epic_num` resolved in step 1. Do not widen the scope to other epics and do not re-derive `epic_num`.

Load:

- Epic and story docs with acceptance criteria
- PRD (if available)
- Architecture / tech-spec (if available)
- Prior system-level test-design outputs (if available)

Extract:

- Testable requirements
- Integration points
- Known coverage gaps

---

## 3. Analyze Existing Test Coverage (Epic-Level)

If epic-level:

- Scan the repository for existing tests (search for `tests/`, `spec`, `e2e`, `api` folders)
- Identify coverage gaps and flaky areas
- Note existing fixture and test patterns

### Browser Exploration (if `tea_browser_automation` is `cli` or `auto`)

> **Fallback:** If CLI is not installed, fall back to MCP (if available) or skip browser exploration and rely on code/doc analysis.

**CLI Exploration Steps:**
All commands use the same named session to target the correct browser:

1. `playwright-cli -s=tea-explore open <target_url>`
2. `playwright-cli -s=tea-explore snapshot` → capture page structure and element refs
3. `playwright-cli -s=tea-explore screenshot --filename={test_artifacts}/exploration/explore-<page>.png`
4. Analyze snapshot output to identify testable elements and flows
5. `playwright-cli -s=tea-explore close`

Store artifacts under `{test_artifacts}/exploration/`

> **Session Hygiene:** Always close sessions using `playwright-cli -s=tea-explore close`. Do NOT use `close-all` — it kills every session on the machine and breaks parallel execution.

---

### Deterministic Knowledge Selection

The fragment list for this step is a closed set. Start empty, evaluate the complete conditions under **Load Knowledge Base Fragments**, and add every fragment from each matching list. A config flag opens a branch only when every stack, runner, package, and relevance condition on that branch also matches. Do not add fragments from tier labels, index descriptions, nearby mentions, general usefulness, or possible future need. Deduplicate while preserving the order below. Identical facts and config must produce an identical list.

Contract testing is relevant only when repository facts show existing Pact artifacts, dependencies, configuration, or broker variables, or when the task explicitly requests contract testing. A service count or target-state architecture alone does not open a contract branch.

## 4. Load Knowledge Base Fragments

Use `{knowledgeIndex}` to select and load only relevant fragments.

### System-Level Mode (Required)

- `adr-quality-readiness-checklist.md`
- `nfr-criteria.md`
- `test-levels-framework.md`
- `risk-governance.md`
- `test-quality.md`

### Epic-Level Mode (Required)

- `risk-governance.md`
- `probability-impact.md`
- `test-levels-framework.md`
- `test-priorities-matrix.md`

**Epic-Level NFR Loading:**

- Load `nfr-criteria.md` when the epic/story includes security, performance, reliability, scalability, compliance, maintainability, or operational requirements.
- Use prior system-level NFR planning from `test-design-architecture.md` or `test-design-qa.md` if present.

**Playwright CLI (if `tea_browser_automation` is "cli" or "auto"):**

- `playwright-cli.md`

**MCP Patterns (if `tea_browser_automation` is "mcp" or "auto"):**

- (existing MCP-related fragments, if any are added in future)

**Pact.js Utils (if enabled, `@seontechnologies/pactjs-utils` is in `package.json`, and contract testing is relevant, in either mode):**

- `pactjs-utils-mandate.md`, `pactjs-utils-overview.md`, `pactjs-utils-consumer-helpers.md`, `pactjs-utils-provider-verifier.md`, `pactjs-utils-request-filter.md`

**Contract Testing (if Pact.js Utils is disabled or not installed, and contract testing is relevant):**

- `contract-testing.md`

**Pact MCP (if tea_pact_mcp is "mcp" and contract testing is relevant):**

- `pact-mcp.md`

---

## 5. Confirm Loaded Inputs

Summarize what was loaded and confirm with the user if anything is missing.

---

### 6. Save Progress

**Save this step's accumulated work to `{outputFile}`.**

- **If `{outputFile}` does not exist** (first save), create it with YAML frontmatter:

  ```yaml
  ---
  runScope: '{run_scope}'
  runKey: '{run_key}'
  workflowStatus: 'in-progress'
  totalSteps: 5
  stepsCompleted: ['step-02-load-context']
  lastStep: 'step-02-load-context'
  nextStep: '{nextStepFile}'
  lastSaved: '{date}'
  ---
  ```

  Then write this step's output below the frontmatter.

- **If `{outputFile}` already exists**, update:
  - Leave `runScope` and `runKey` exactly as step 1 wrote them
  - Set `workflowStatus: 'in-progress'`
  - Set `totalSteps: 5`
  - Add `'step-02-load-context'` to `stepsCompleted` array (only if not already present)
  - Set `lastStep: 'step-02-load-context'`
  - Set `nextStep: '{nextStepFile}'`
  - Set `lastSaved: '{date}'`
  - Append this step's output to the appropriate section of the document.

**Update `inputDocuments`**: Set `inputDocuments` in the output template frontmatter to the list of artifact paths loaded in this step (e.g., knowledge fragments, test design documents, configuration files).

Load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Step completed in full with required outputs

### ❌ SYSTEM FAILURE:

- Skipped sequence steps or missing outputs
  **Master Rule:** Skipping steps is FORBIDDEN.
