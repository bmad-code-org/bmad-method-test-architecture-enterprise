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
Check only the syntax, references or focused tests affected by these requested edits.
Do not invoke run-and-heal or require a passing full suite; preserve unrelated Create progress.

### 3. Report

Summarize the edits applied.

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Changes applied and confirmed

### ❌ SYSTEM FAILURE:

- Unconfirmed edits or missing update

## On Complete

When `workflow_customization_manual = true`, execute the non-empty `workflow.on_complete` retained from selected-mode activation as the final terminal instruction, then exit normally.
Otherwise resolve the same selected customization surface below; never run the other mode's hook.

Run: `uv run {project-root}/_bmad/scripts/resolve_customization.py --skill {workflow-skill-root} --project-root {project-root} --key workflow.on_complete`

If the resolver succeeds and returns a non-empty `workflow.on_complete`, execute that value as the final terminal instruction before exiting.

If the resolver fails or returns no output, use the selected `workflow.on_complete` block already resolved during activation (or resolve the selected defaults/team/user files with the same structural merge rules).
Execute its non-empty value as the final terminal instruction.
An explicitly resolved empty value means no completion hook; exit normally.
