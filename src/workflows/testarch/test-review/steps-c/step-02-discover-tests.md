---
name: 'step-02-discover-tests'
description: 'Find and parse test files'
nextStepFile: './step-03-quality-evaluation.md'
---

# Step 2: Discover & Parse Tests

## STEP GOAL

Collect test files in scope and parse structure/metadata.

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

## 1. Discover Test Files

- **single**: use provided file path
- **directory**: glob under `{test_dir}` or selected folder
- **suite**: glob all tests in repo

Halt if no tests are found.

---

## 2. Parse Metadata (per file)

Collect:

- File size and line count
- Test framework detected
- Describe/test block counts
- Test IDs and priority markers
- Imports, fixtures, factories, network interception
- Waits/timeouts and control flow (if/try/catch)

---

## 3. Evidence Collection (if `tea_browser_automation` is `cli` or `auto`)

> **Fallback:** If CLI is not installed, fall back to MCP (if available) or skip evidence collection.

**CLI Evidence Collection:**
All commands use the same named session to target the correct browser:

1. `playwright-cli -s=tea-review open <target_url>`
2. `playwright-cli -s=tea-review tracing-start`
3. Execute the flow under review (using `-s=tea-review` on each command)
4. `playwright-cli -s=tea-review tracing-stop` → saves trace.zip
5. `playwright-cli -s=tea-review screenshot --filename={test_artifacts}/review-evidence.png`
6. `playwright-cli -s=tea-review network` → capture network request log
7. `playwright-cli -s=tea-review close`

> **Session Hygiene:** Always close sessions using `playwright-cli -s=tea-review close`. Do NOT use `close-all` — it kills every session on the machine and breaks parallel execution.

Load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Step completed in full with required outputs

### ❌ SYSTEM FAILURE:

- Skipped sequence steps or missing outputs
  **Master Rule:** Skipping steps is FORBIDDEN.
