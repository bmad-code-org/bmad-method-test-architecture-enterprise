# Proposal: Playwright CLI Integration into TEA

> **Status:** Implemented (Phases 1-2, 4-5 complete; Phase 3 deferred to BMAD-METHOD repo)
> **Date:** 2026-02-07
> **Scope:** TEA module (`bmad-method-test-architecture-enterprise`) + installer changes in `BMAD-METHOD`
> **Reviews:** Gemini #1 (complete), Opus #1 (complete), Gemini #2 (complete), Opus #2 (clean), Codex (complete), PR Reviews (complete)

---

## 1. Background

### What is Playwright CLI?

[`@playwright/cli`](https://github.com/microsoft/playwright-cli) is a new command-line interface for browser automation optimized for AI coding agents. It positions itself as a **token-efficient** alternative to Playwright MCP.

**Key characteristics:**

- **93% fewer tokens** than MCP — returns concise element references (`e15`, `e21`) instead of full accessibility trees
- **No schema loading** — commands discovered via `--help`, not injected into context as tool definitions
- **External state management** — browser state persists in named sessions, not in LLM context
- **Skills system** — `playwright-cli install --skills` registers the CLI as a discoverable agent skill (e.g., in `~/.claude/skills/playwright-cli/`)
- **Rich command set** — `open`, `snapshot`, `screenshot`, `click`, `fill`, `type`, `route`, `tracing-start/stop`, `video-start/stop`, `state-save/load`, session management, tab management, storage manipulation, and more
- **Requires:** Node.js 18+, `npm install -g @playwright/cli@latest`

### How TEA currently handles Playwright MCP

TEA already has a boolean flag `tea_use_mcp_enhancements` defined in `src/module.yaml` (lines 36-46). The pattern:

1. **module.yaml** defines a `single-select` boolean config prompt
2. **Installer** collects the answer, writes it to `_bmad/tea/config.yaml`
3. **Workflow step files** read the flag in preflight (e.g., `atdd/steps-c/step-01`) and conditionally enable recording/healing/exploratory modes (e.g., `atdd/steps-c/step-02`)
4. **Subprocess context** passes the flag to parallel test generation workers (e.g., `automate/steps-c/step-03`)

This proposal extends that proven pattern to support CLI alongside MCP.

---

## 2. Design: The `tea_browser_automation` Config

### Replace the boolean with a multi-mode selector

**Current state** (`src/module.yaml`):

```yaml
tea_use_mcp_enhancements:
  prompt: 'Enable Playwright MCP enhancements?'
  default: true
  result: '{value}'
  single-select:
    - value: true
      label: 'Yes - Enable live browser verification'
    - value: false
      label: 'No - Standard mode only'
```

**Proposed replacement:**

```yaml
# ✅ ACTIVELY USED - Browser automation strategy for TEA workflows
# Controls how TEA interacts with live browsers during test generation
tea_browser_automation:
  prompt: 'How should TEA interact with browsers during test generation?'
  default: 'auto'
  result: '{value}'
  single-select:
    - value: 'auto'
      label: 'Auto - Smart selection (Recommended)'
    - value: 'cli'
      label: 'CLI only - Playwright CLI (@playwright/cli)'
    - value: 'mcp'
      label: 'MCP only - Playwright MCP servers'
    - value: 'none'
      label: 'None - No live browser interaction'
```

**Why this design:**

| Mode   | Behavior                                                                                                                                                 |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auto` | TEA picks CLI or MCP per-action using the heuristic (see section 3). Works best with both installed, but falls back gracefully if only one is available. |
| `cli`  | TEA uses only Playwright CLI commands. MCP ignored even if available.                                                                                    |
| `mcp`  | TEA uses only MCP tools. CLI ignored even if installed. Preserves current behavior exactly.                                                              |
| `none` | No browser interaction. TEA generates tests from documentation and code analysis only.                                                                   |

**Migration from old flag:**

- The old `tea_use_mcp_enhancements: true` migrates to `tea_browser_automation: "auto"` (they already opted in — give them the best experience; CLI commands only fire if CLI is actually installed, so MCP-only users see no change in practice)
- The old `tea_use_mcp_enhancements: false` migrates to `tea_browser_automation: "none"`
- The installer migrates existing configs automatically (see section 4.2)

> **Note:** Migrating `true → auto` is technically a behavior expansion (CLI may be used if installed), not a strict backward-compatible mapping. This is intentional: `auto` with only MCP installed behaves identically to the old `true` mode because CLI fallback is a no-op when CLI isn't present.

### Keep `tea_use_playwright_utils` unchanged

`tea_use_playwright_utils` controls whether generated test code imports from `@seontechnologies/playwright-utils`. This is orthogonal to browser automation mode and remains a separate boolean flag.

---

## 3. Auto Heuristic: CLI vs MCP Decision Logic

When `tea_browser_automation: "auto"`, TEA applies this priority order:

### Priority 1: User Override

If the user explicitly requests CLI or MCP in their prompt (e.g., "use the CLI to explore this page" or "open MCP browser"), honor that request regardless of heuristic.

### Priority 2: Auto Heuristic

**Prefer CLI for quick, stateless discovery:**

- Open page, take snapshot/screenshot, list elements
- One-shot data capture (selectors, labels, page structure)
- Locator verification (checking if an AI-generated locator actually exists on a page — one-shot check)
- Light recording of simple flows
- Capturing screenshots/traces for evidence
- Session-isolated exploration

**Prefer MCP for stateful, multi-step flows:**

- Long sequences where state must carry across many steps
- Multi-tab flows, file uploads, repeated edits
- Tight looped interaction requiring rich tool semantics
- Complex interaction patterns (drag/drop, multi-step wizards)
- Self-healing mode (analyzing failures with full DOM access)

### Priority 3: Fallback

- If CLI command fails with "command not found", "not installed", or similar environment error → fall back to MCP
- If CLI command fails with a runtime error (e.g., element not found, timeout) → do NOT fall back, handle the error normally
- If MCP is unavailable (no MCP tools in context) → fall back to CLI
- If neither is available → fall back to `none` mode (pure AI generation)

> **Workflow step guidance:** When a step attempts a CLI command, check the error type. Only trigger fallback on environment/installation errors, not on page interaction failures. Example instruction for step files:
>
> ```
> If `playwright-cli` returns "command not found" or "ENOENT":
>   → Log: "CLI not installed, falling back to MCP"
>   → Use MCP tools for this step instead
> If `playwright-cli` returns a page error (element not found, timeout):
>   → Handle normally (retry, adjust selector, report to user)
> ```

### Decision Table for Workflows

| Workflow                      | Default Tool (auto mode)                               | Rationale                                                                                                       |
| ----------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| **test-design** (exploratory) | CLI                                                    | Page discovery, snapshots, screenshots — stateless, one-shot                                                    |
| **atdd** (record baseline)    | CLI for baseline capture, MCP for complex interactions | Record initial flow with CLI; switch to MCP only if drag/drop, multi-step wizards, or continued state is needed |
| **automate** (generate tests) | CLI for selector verification, MCP for healing         | CLI captures snapshots for selector accuracy; MCP runs tests and analyzes failures in healing mode              |
| **test-review** (evidence)    | CLI                                                    | Traces, screenshots, network capture — stateless evidence collection                                            |
| **nfr-assess** (performance)  | CLI                                                    | Network monitoring, timing capture — stateless                                                                  |
| **trace** (requirements)      | Neither typically needed                               | Traceability is document-based, not browser-based                                                               |

### Embedding the Heuristic in Workflows

The heuristic is NOT hardcoded in one place. Instead, each workflow step file that needs browser interaction specifies its preference inline. This keeps logic co-located with context and avoids a brittle central router.

**Pattern for workflow step files:**

```markdown
## Browser Interaction

**Automation mode:** `config.tea_browser_automation`

If `auto`:

- This step performs [stateless page discovery / stateful multi-step flow]
- **Preferred tool:** [CLI / MCP]
- **Fallback:** [MCP / CLI] if preferred tool unavailable

If `cli`: Use Playwright CLI commands only
If `mcp`: Use Playwright MCP tools only
If `none`: Skip browser interaction, use documentation/code analysis
```

---

## 4. Installer Changes (BMAD-METHOD repo)

### 4.1 Prerequisites Check

During TEA module installation, after the user selects a browser automation mode other than `none`, add a prerequisites verification step.

**For CLI (`cli` or `auto`):**

```
? Have you installed Playwright CLI globally?
  npm install -g @playwright/cli@latest

  And installed the skills for your IDE?
  playwright-cli install --skills

  (Yes / No - I'll do it later)
```

If "No", display:

```
⚠️  Playwright CLI is not yet installed. TEA workflows that use CLI will
   fall back to MCP (if available) or pure AI generation.

   Install when ready:
     npm install -g @playwright/cli@latest
     playwright-cli install --skills

   Node.js 18+ required.
```

**For MCP (`mcp` or `auto`):**

```
? Have you configured Playwright MCP servers in your IDE?
  See: https://github.com/microsoft/playwright-mcp

  (Yes / No - I'll do it later)
```

If "No", display the existing MCP setup instructions.

**Key principle:** We document that the user must install these tools themselves. The installer does NOT run `npm install -g` or configure MCP servers. It only sets the config flag and provides guidance.

### 4.2 Config Migration

For existing installations with the old boolean flag.

The installer loads existing configs under module keys (e.g., `this.existingConfig['tea'] = { tea_use_mcp_enhancements: true }`), so the migration must operate on the module-scoped object:

```javascript
// In config-collector.js — loadExistingConfig() or collectModuleConfig()
// After loading moduleConfig from _bmad/tea/config.yaml:
if (moduleConfig.tea_use_mcp_enhancements !== undefined) {
  // Migrate old boolean to new string mode
  // true → auto: they already opted in to browser automation, give them the best experience
  if (moduleConfig.tea_use_mcp_enhancements === true) {
    moduleConfig.tea_browser_automation = 'auto';
  } else {
    moduleConfig.tea_browser_automation = 'none';
  }
  delete moduleConfig.tea_use_mcp_enhancements;
  // Persist the migrated config back to _bmad/tea/config.yaml
}
```

> **Important:** The migration runs on the module-level config object (loaded at `config-collector.js` line ~119), not on the top-level `existingConfig`. See `loadExistingConfig()` where `this.existingConfig[entry.name] = moduleConfig`.

### 4.3 Config Output

After installation, `_bmad/tea/config.yaml` will contain:

```yaml
tea_browser_automation: 'auto' # or "cli", "mcp", "none"
```

---

## 5. Knowledge Base Addition

### New Knowledge Fragment: `playwright-cli.md`

**Location:** `src/testarch/knowledge/playwright-cli.md`

**Content outline:**

```markdown
# Playwright CLI for Agent-Driven Browser Automation

## Overview

Token-efficient CLI for AI coding agents. Returns element references
instead of full accessibility trees. 93% fewer tokens than MCP.

## Installation

npm install -g @playwright/cli@latest
playwright-cli install --skills # Register as agent skill

## Core Workflow Pattern

1. Open page: playwright-cli open <url>
2. Take snapshot: playwright-cli snapshot
3. Interact: playwright-cli click <ref> / fill <ref> <text>
4. Capture evidence: playwright-cli screenshot / tracing-start/stop

## Element Reference System

Snapshot returns concise refs: {ref: "e15", role: "button", name: "Submit"}
Use refs in subsequent commands: playwright-cli click e15

## Session Isolation

Named sessions prevent state leakage between test contexts:
playwright-cli -s=test-auth open https://app.com/login
PLAYWRIGHT_CLI_SESSION=test-auth playwright-cli snapshot

## Key Commands Quick Reference

| Category    | Commands                                         |
| ----------- | ------------------------------------------------ |
| Navigation  | open, goto, go-back, reload, close               |
| Interaction | click, fill, type, check, select, hover, drag    |
| Capture     | snapshot, screenshot, pdf                        |
| Network     | route, unroute, network                          |
| Storage     | state-save, state-load, cookie-_, localstorage-_ |
| Debug       | tracing-start/stop, video-start/stop, console    |
| Session     | list, close-all, kill-all                        |
| Tabs        | tab-list, tab-new, tab-close, tab-select         |

## When CLI vs MCP

- CLI: stateless discovery, snapshots, screenshots, one-shot captures
- MCP: stateful multi-step flows, self-healing, rich DOM introspection
```

### Update `tea-index.csv`

Add a new row matching the existing CSV schema (`id,name,description,tags,fragment_file`):

```csv
playwright-cli,Playwright CLI,"Token-efficient CLI for AI coding agents: element refs, sessions, snapshots, browser automation","cli,browser,agent,automation,snapshot",knowledge/playwright-cli.md
```

> **Note:** This brings the total fragment count from 34 to 35. Update the assertion in `test/test-knowledge-base.js` line 91 from `records.length === 34` to `records.length === 35`.

### Conditional Loading

- Load `playwright-cli.md` when `config.tea_browser_automation` is `cli` or `auto`
- Continue loading existing MCP-related patterns when mode is `mcp` or `auto`
- Load neither when mode is `none`

---

## 6. Workflow Step Changes

### 6.1 Preflight Steps (all workflows that read config)

**Files affected:**

- `src/workflows/testarch/atdd/steps-c/step-01-preflight-and-context.md`
- `src/workflows/testarch/automate/steps-c/step-01-preflight-and-context.md`
- (and any other workflow preflight steps that currently read `tea_use_mcp_enhancements`)

**Change:**

```markdown
## 3.5 Read TEA Config Flags

From `{config_source}`:

- `tea_use_playwright_utils`
- `tea_browser_automation` ← replaces tea_use_mcp_enhancements
```

**Knowledge loading update (same files):**

```markdown
**Playwright CLI (if tea_browser_automation is "cli" or "auto"):**

- `playwright-cli.md`

**MCP Patterns (if tea_browser_automation is "mcp" or "auto"):**

- (existing MCP-related fragments, if any are added in future)
```

### 6.2 Generation Mode Steps

**File:** `src/workflows/testarch/atdd/steps-c/step-02-generation-mode.md`

**Current** (lines 49-55):

```markdown
Use recording only when:

- UI interactions are complex (drag/drop, multi-step wizards)
- `config.tea_use_mcp_enhancements` is true
- Playwright MCP tools are available
```

**Proposed replacement:**

```markdown
## 2. Optional Mode: Recording (Complex UI)

Use recording when UI interactions need live browser verification.

**Tool selection based on `config.tea_browser_automation`:**

If `auto`:

- **Simple recording** (snapshot selectors, capture structure): Use CLI
  - `playwright-cli open <url>` → `playwright-cli snapshot` → extract refs
- **Complex recording** (drag/drop, wizards, multi-step state): Use MCP
  - Full browser automation with rich tool semantics
- **Fallback:** If preferred tool unavailable, use the other; if neither, skip recording

If `cli`:

- Use Playwright CLI for all recording
- `playwright-cli open <url>`, `snapshot`, `screenshot`, `click <ref>`, etc.

If `mcp`:

- Use Playwright MCP tools for all recording (current behavior)
- Confirm MCP availability, record selectors and interactions

If `none`:

- Skip recording mode entirely, use AI generation from documentation
```

### 6.3 Subprocess Context

**File:** `src/workflows/testarch/automate/steps-c/step-03-generate-tests.md`

**Current** (lines 54-63):

```javascript
config: {
  test_framework: config.test_framework,
  use_playwright_utils: config.tea_use_playwright_utils,
  use_mcp_enhancements: config.tea_use_mcp_enhancements
},
```

**Proposed:**

```javascript
config: {
  test_framework: config.test_framework,
  use_playwright_utils: config.tea_use_playwright_utils,
  browser_automation: config.tea_browser_automation  // "auto" | "cli" | "mcp" | "none"
},
```

### 6.4 Workflow-Specific CLI Usage Patterns

#### test-design (Exploratory Mode)

When `browser_automation` is `cli` or `auto`:

```markdown
**CLI Exploration Steps:**
All commands use the same named session to target the correct browser:

1. `playwright-cli -s=tea-explore open <target_url>`
2. `playwright-cli -s=tea-explore snapshot` → capture page structure and element refs
3. `playwright-cli -s=tea-explore screenshot --filename={test_artifacts}/explore-<page>.png`
4. Analyze snapshot output to identify testable elements and flows
5. `playwright-cli -s=tea-explore close`

Store artifacts under `{test_artifacts}/exploration/`
```

#### atdd / automate (Test Generation)

When `browser_automation` is `cli` or `auto`:

```markdown
**CLI Selector Verification:**
All commands use the same named session to target the correct browser:

1. `playwright-cli -s=tea-verify open <target_url>`
2. `playwright-cli -s=tea-verify snapshot` → get element refs with roles and names
3. Map refs to stable Playwright locators:
   - ref `{role: "button", name: "Submit"}` → `page.getByRole('button', { name: 'Submit' })`
   - ref `{role: "textbox", name: "Email"}` → `page.getByRole('textbox', { name: 'Email' })`
4. Use verified locators in generated test code
5. `playwright-cli -s=tea-verify close`
```

#### test-review (Evidence Collection)

When `browser_automation` is `cli` or `auto`:

```markdown
**CLI Evidence Collection:**
All commands use the same named session to target the correct browser:

1. `playwright-cli -s=tea-review open <target_url>`
2. `playwright-cli -s=tea-review tracing-start`
3. Execute the flow under review (using `-s=tea-review` on each command)
4. `playwright-cli -s=tea-review tracing-stop` → saves trace.zip
5. `playwright-cli -s=tea-review screenshot --filename={test_artifacts}/review-evidence.png`
6. `playwright-cli -s=tea-review network` → capture network request log
7. `playwright-cli -s=tea-review close`
```

---

## 7. Documentation Changes

### 7.1 New How-To Guide

**File:** `docs/how-to/customization/configure-browser-automation.md`

This replaces / supersedes `enable-tea-mcp-enhancements.md`.

**Content outline:**

1. What is browser automation in TEA?
2. The four modes: `auto`, `cli`, `mcp`, `none`
3. Prerequisites per mode
4. Setup instructions:
   - CLI: `npm install -g @playwright/cli@latest` + `playwright-cli install --skills`
   - MCP: Configure MCP servers in IDE
5. The auto heuristic explained
6. How to override per-request
7. Troubleshooting

### 7.2 Update Existing Docs

**All files referencing `tea_use_mcp_enhancements`** (found via grep — every one must be updated or deprecated):

| File                                                                   | Action                                                                |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `src/module.yaml`                                                      | Replace flag definition (Phase 1)                                     |
| `src/workflows/testarch/atdd/steps-c/step-01-preflight-and-context.md` | Update config read (Phase 1)                                          |
| `src/workflows/testarch/atdd/steps-c/step-02-generation-mode.md`       | Update branching logic (Phase 1)                                      |
| `src/workflows/testarch/automate/steps-c/step-03-generate-tests.md`    | Update subprocess context (Phase 1)                                   |
| `docs/reference/configuration.md`                                      | Replace flag docs with `tea_browser_automation`                       |
| `docs/reference/troubleshooting.md`                                    | Update troubleshooting for new flag                                   |
| `docs/explanation/tea-overview.md`                                     | Update MCP section → browser automation                               |
| `docs/how-to/customization/enable-tea-mcp-enhancements.md`             | Supersede with `configure-browser-automation.md` (redirect or delete) |
| `docs/how-to/workflows/run-atdd.md`                                    | Update MCP references                                                 |
| `docs/how-to/workflows/run-automate.md`                                | Update MCP references                                                 |
| `docs/MIGRATION.md`                                                    | Add migration entry for this config change                            |
| `README.md`                                                            | Update any MCP flag references                                        |
| `CHANGELOG.md`                                                         | Add breaking change entry                                             |

### 7.3 Update README / Module Description

**Current** (`src/module.yaml` line 4):

```yaml
subheader: 'Risk-based testing workflows for BMad Method/Enterprise with optional Playwright/MCP enhancements'
```

**Proposed:**

```yaml
subheader: 'Risk-based testing workflows for BMad Method/Enterprise with optional Playwright CLI/MCP enhancements'
```

---

## 8. Session Hygiene & Isolation

All CLI sessions created by TEA workflows should follow these conventions:

### Naming Convention

```
tea-<workflow>[-<context>]
```

Examples: `tea-explore`, `tea-verify`, `tea-review`, `tea-atdd-login-flow`

For parallel execution safety (multiple agents or concurrent workflows on the same machine), append a unique suffix (timestamp or process ID):

```
tea-explore-1738900000
tea-verify-<pid>
```

### Cleanup Protocol

Every workflow step that opens a CLI session must close it **using the same session selector**:

```markdown
**Session Cleanup (end of step):**

- `playwright-cli -s=<session-name> close` (close the session's page)
```

> **Do NOT use `close-all`** in workflow steps — it kills every session on the machine and breaks parallel execution. Reserve `close-all` for manual troubleshooting only (e.g., user runs it themselves to clean up after a crash).

### Guardrail in Checklists

Add to workflow checklists:

```markdown
- [ ] CLI sessions cleaned up (no orphaned browsers)
- [ ] Temp artifacts stored in `{test_artifacts}/` not random locations
```

---

## 9. Validation & Guardrails

### Config Validation

The installer should validate:

- `tea_browser_automation` is one of `auto | cli | mcp | none`
- CLI/MCP availability is checked via **user-prompted confirmation** during install (see section 4.1), not by executing shell commands. The installer does not run `playwright-cli --help` or similar — it asks the user if they've installed the prerequisites and displays guidance if not.

### Workflow Guardrails

- CLI/MCP commands are only emitted when `tea_browser_automation` is not `none`
- Auto mode decisions are logged: "Using CLI for snapshot (stateless discovery)" or "Using MCP for multi-step recording (stateful flow)"
- Fallback is always logged: "CLI unavailable, falling back to MCP"

### Migration

- Old `tea_use_mcp_enhancements: true` configs are auto-migrated to `tea_browser_automation: "auto"` (see note in section 2 on why this is safe)
- Old `tea_use_mcp_enhancements: false` configs are auto-migrated to `tea_browser_automation: "none"`
- Workflows that still reference the old flag should emit a deprecation warning

---

## 10. Implementation Plan

### Phase 1: Foundation (TEA module) — COMPLETE

- [x] 1. Add `playwright-cli.md` knowledge fragment to `src/testarch/knowledge/` (human-friendly tone)
- [x] 2. Update `tea-index.csv` with new row (35th fragment)
- [x] 3. Update `test/test-knowledge-base.js` — fragment count 34→35
- [x] 4. Replace `tea_use_mcp_enhancements` with `tea_browser_automation` in `src/module.yaml`
- [x] 5. Update all preflight step files to read new config flag (atdd, automate, test-design, test-review, nfr-assess)
- [x] 6. Update generation-mode step files with CLI/MCP/auto branching logic
- [x] 7. Update subprocess context in orchestration steps
- [x] _Extra:_ Update `test/test-installation-components.js` (CSV line count 35→36)
- [x] _Extra:_ Add `test:knowledge` script to `package.json` test chain

### Phase 2: Workflow Integration (TEA module) — COMPLETE

- [x] 8. Update `atdd` workflow steps with CLI patterns (step-04, step-04b, step-05)
- [x] 9. Update `automate` workflow steps with CLI patterns (step-02, step-03b, step-04)
- [x] 10. Update `test-design` workflow steps with CLI exploratory patterns (step-02, step-05)
- [x] 11. Update `test-review` workflow steps with CLI evidence collection (step-02, step-04)
- [x] 12. Update `nfr-assess` workflow steps with CLI evidence (step-03, step-05)
- [x] 13. Add session cleanup to all workflow checklists
- [x] _Extra:_ Add fallback notes to all CLI sections (graceful degradation)
- [x] _Extra:_ Add `open <target_url>` before `snapshot` in subprocess steps

### Phase 3: Installer (BMAD-METHOD repo) — DEFERRED

> **Note:** Deferred to a separate PR in the BMAD-METHOD repo. The installer reads `module.yaml` dynamically, so it will pick up the new schema once TEA module changes land.

- [ ] 14. Verify config-collector already handles `single-select` with string values correctly
- [ ] 15. Add prerequisite check prompts (user-prompted, no shell execution) for CLI and MCP
- [ ] 16. Add config migration logic in `loadExistingConfig()` for `tea_use_mcp_enhancements` → `tea_browser_automation`
- [ ] 17. Test installation flow end-to-end

### Phase 4: Documentation (TEA module) — COMPLETE

- [x] 18. Create `configure-browser-automation.md` how-to guide
- [x] 19. Update all files referencing old flag (configuration.md, troubleshooting.md, tea-overview.md, run-atdd.md, run-automate.md, glossary/index.md)
- [x] 20. Add migration entry to `docs/MIGRATION.md` (section 5 + updated config blocks)
- [x] 21. Add breaking change entry to `CHANGELOG.md`
- [x] 22. Update README and module subheader
- [x] _Extra:_ Create deprecation stub for `enable-tea-mcp-enhancements.md` (redirect to new guide)
- [x] _Extra:_ Update 9+ files with stale fragment counts (33/34→35)
- [x] _Extra:_ Fix pre-existing path errors (`src/bmm/` → `src/`)

### Phase 5: Validation — COMPLETE

- [x] 23. Add `"test:knowledge"` to `package.json` scripts and `test` chain
- [x] 24. Knowledge base tests pass (42/42, 35 fragments)
- [x] 25. Installation component tests pass (35/35)
- [x] 26. Schema validation passes (52/52 agent schema, 1/1 agent file)
- [x] 27. All tests pass (except pre-existing eslint-plugin-unicorn Node.js compat issue)
- [ ] 28. Manual testing: install with each mode — deferred (requires Phase 3)
- [ ] 29. Config migration testing — deferred (requires Phase 3)

### Review Rounds — COMPLETE

**Gemini #1:**

- [x] Add `${timestamp}` suffix to session names in atdd `step-02-generation-mode.md`

**Opus:**

- [x] Fix 9 stale fragment counts (33/34→35) across docs + teach-me-testing workflows
- [x] Add `playwright-cli.md` to test-design knowledge loading section
- [x] Add MCP placeholder to automate preflight (consistency with atdd)
- [x] Fix `src/bmm/module.yaml` → `src/module.yaml` in configuration.md
- [x] Fix `src/bmm/testarch/knowledge/` → `src/testarch/knowledge/` in knowledge-base.md
- [x] Fix double-dashes → em-dashes in configure-browser-automation.md
- [x] Add inline comments to MIGRATION.md historical code blocks

**Gemini #2:**

- [x] Add `tea_browser_automation` config read to test-design, test-review, nfr-assess preflight
- [x] Add `open <target_url>` guard to subprocess steps (atdd step-04b, automate step-03b)
- [x] Fix last stale count in learn-testing-tea-academy.md (34→35)
- [x] Update MIGRATION.md "New Configuration" blocks to show `tea_browser_automation`
- [x] Create deprecation stub `enable-tea-mcp-enhancements.md`
- [x] Add fallback notes to 6 CLI workflow sections

---

## 11. Open Questions — RESOLVED

1. **Should `auto` be the default?** — **Yes.** Implemented as proposed. Gives the best experience; CLI-only users get graceful fallback; MCP-only users see no change.

2. **Should we add a `both` mode distinct from `auto`?** — **No.** `auto` already uses both tools intelligently.

3. **CLI version pinning?** — **Use `@latest`.** Follows the same convention as `@playwright/mcp@latest`.

4. **Skills installation scope** — **One-time global setup.** Documented alongside MCP setup in `configure-browser-automation.md`.

---

## 12. Summary

| What                | Change                                                                                           | Status             |
| ------------------- | ------------------------------------------------------------------------------------------------ | ------------------ |
| **Config**          | `tea_use_mcp_enhancements` (boolean) → `tea_browser_automation` (string: `auto\|cli\|mcp\|none`) | Done               |
| **Default**         | `auto` — smart CLI/MCP selection with fallback                                                   | Done               |
| **Installer**       | Prerequisite checks for CLI and MCP; auto-migration of old config                                | Deferred (Phase 3) |
| **Knowledge**       | New `playwright-cli.md` fragment (35th, human-friendly tone)                                     | Done               |
| **Workflows**       | All browser-touching steps get CLI/MCP/auto branching + fallback notes                           | Done               |
| **Heuristic**       | CLI for stateless discovery; MCP for stateful flows; user override always wins                   | Done               |
| **Docs**            | New how-to guide; updated 15+ reference, overview, and workflow guides                           | Done               |
| **Backward compat** | Old boolean flag deprecated; stub redirect created; migration guide updated                      | Done               |
| **Tests**           | All pass (schemas 52/52, install 35/35, knowledge 42/42, agent 1/1)                              | Done               |
| **Reviews**         | 3 review rounds (Gemini #1, Opus, Gemini #2) — all findings addressed                            | Done               |

The core principle: **CLI and MCP are complementary tools, not competitors.** Auto mode uses each where it shines — CLI for token-efficient stateless snapshots, MCP for rich stateful automation — while giving users full control to override when they know better.
