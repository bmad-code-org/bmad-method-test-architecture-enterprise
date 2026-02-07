---
name: 'step-01-load-context'
description: 'Load NFR requirements, evidence sources, and knowledge base'
nextStepFile: './step-02-define-thresholds.md'
knowledgeIndex: '{project-root}/_bmad/tea/testarch/tea-index.csv'
---

# Step 1: Load Context & Knowledge Base

## STEP GOAL

Gather NFR requirements, evidence sources, and knowledge fragments needed for assessment.

## MANDATORY EXECUTION RULES

- 📖 Read the entire step file before acting
- ✅ Speak in `{communication_language}`
- 🚫 Halt if implementation or evidence is unavailable

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

## 1. Prerequisites

- Implementation accessible for evaluation
- Evidence sources available (test results, metrics, logs)

If missing: **HALT** and request the missing inputs.

---

## 2. Load Configuration

From `{config_source}`:

- Read `tea_browser_automation`

---

## 3. Load Knowledge Base Fragments

From `{knowledgeIndex}` load:

- `adr-quality-readiness-checklist.md`
- `ci-burn-in.md`
- `test-quality.md`
- `playwright-config.md`
- `error-handling.md`

**Playwright CLI (if `tea_browser_automation` is "cli" or "auto"):**

- `playwright-cli.md`

**MCP Patterns (if `tea_browser_automation` is "mcp" or "auto"):**

- (existing MCP-related fragments, if any are added in future)

---

## 4. Load Artifacts

If available, read:

- `tech-spec.md` (primary NFRs)
- `PRD.md` (product-level NFRs)
- `story` or `test-design` docs (feature-level NFRs)

---

## 5. Confirm Inputs

Summarize loaded NFR sources and evidence availability.

Load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Step completed in full with required outputs

### ❌ SYSTEM FAILURE:

- Skipped sequence steps or missing outputs
  **Master Rule:** Skipping steps is FORBIDDEN.
