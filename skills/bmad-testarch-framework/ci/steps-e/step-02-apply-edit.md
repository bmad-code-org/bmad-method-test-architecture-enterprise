---
name: 'step-02-apply-edit'
description: 'Apply edits to the selected output'
evaluationPlansStepFile: '{skill-root}/ci/steps-c/step-03b-render-evaluation-plans.md'
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

- 🎯 Only apply edits explicitly requested by the user. The evaluation plans step 1 found are requested by their existence

## EXECUTION PROTOCOLS:

- 🎯 Follow the MANDATORY SEQUENCE exactly

## CONTEXT BOUNDARIES:

- Available context: selected output and user changes
- Focus: apply edits only

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly.

### 1. Confirm Requested Changes

Restate what will be changed and confirm when the journal has no saved confirmed request. Restore confirmed requests on Resume, then save their exact requested changes and this phase's next subsection in `edit_requests` and `phase_position` before writes.

### 2. Apply Changes

Apply only the outstanding saved edits. Follow `resources/setup-state.md` section 4 to reconcile interrupted writes, recording each applied edit and resulting digest in `edit_applied`. Save the next subsection after each successful edit. Edit state and hook failures update the run journal; preserve historical Create checkpoint bytes unless an exact checkpoint edit was requested.

When the loaded target is a pipeline file, run sections 3 and 4 of `{evaluationPlansStepFile}` on it, whether or not step 1 found plans, so the generated jobs of a plan that was deleted are removed, then return here. Skip its section 5.

### 3. Report

Summarize the edits applied.

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Changes applied and confirmed

### ❌ SYSTEM FAILURE:

- Unconfirmed edits or missing update

## On Complete

Load `{skill-root}/resources/setup-phase-completion.md` completely and apply it for this phase. It resolves each applicable phase hook and canonical `workflow.on_complete` once, preserves the original operation, and continues pending phases before completing the run.
