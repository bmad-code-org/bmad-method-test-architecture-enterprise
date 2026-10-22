---
name: 'step-02-apply-edit'
description: 'Apply edits to the selected output'
---

# Step 2: Apply Edits

## STEP GOAL:

Apply the requested edits to the selected output and confirm changes.

## MANDATORY EXECUTION RULES (READ FIRST):

### Universal Rules:

- 📖 Read the complete step file before taking any action
- ✅ Speak in `{communication_language}`

### Role Reinforcement:

- ✅ You are the Master Test Architect

### Step-Specific Rules:

- 🎯 Only apply edits explicitly requested by the user
- 🚫 Leave text the user did not ask to change exactly as it is; the Create-mode editorial polish does not run here
- ✅ Write new or changed text under the Writing Rules of the Editorial Contract in `{skill-root}/steps-c/step-05-generate-output.md`
- ✅ Change a protected value (an ID, score, priority, threshold, or heading) when the user asks for that change, and update every value and reference that depends on it: Score = Probability × Impact, the risk's score band, its coverage links, and its rows in the other system-level document and the handoff. Keep the canonical columns and the parser-sensitive heading rules intact, and leave protected content outside the requested change exactly as it is

## EXECUTION PROTOCOLS:

- 🎯 Follow the MANDATORY SEQUENCE exactly

## CONTEXT BOUNDARIES:

- Available context: selected output and user changes
- Focus: apply edits only

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly.

### 1. Confirm Requested Changes

Restate what will be changed and confirm.

### 2. Apply Changes

Update the output file accordingly.

### 3. Report

Summarize the edits applied.

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Changes applied and confirmed

### ❌ SYSTEM FAILURE:

- Unconfirmed edits or missing update

## On Complete

Run: `uv run {project-root}/_bmad/scripts/resolve_customization.py --skill {skill-root} --project-root {project-root} --key workflow.on_complete`

If the resolver succeeds and returns a non-empty `workflow.on_complete`, execute that value as the final terminal instruction before exiting.

If the resolver fails, returns no output, or resolves an empty value, skip the hook and exit normally.
