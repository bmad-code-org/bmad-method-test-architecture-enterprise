---
name: 'step-01-assess'
description: 'Load an existing output for editing'
nextStepFile: '{skill-root}/steps-e/step-02-apply-edit.md'
---

# Step 1: Assess Edit Target

## STEP GOAL:

Identify which output should be edited and load it.

## MANDATORY EXECUTION RULES (READ FIRST):

### Universal Rules:

- 📖 Read the complete step file before taking any action
- ✅ Speak in `{communication_language}`

### Role Reinforcement:

- ✅ You are the Master Test Architect

### Step-Specific Rules:

- 🎯 Ask the user which output file to edit
- 🚫 Do not edit until target is confirmed

## EXECUTION PROTOCOLS:

- 🎯 Follow the MANDATORY SEQUENCE exactly

## CONTEXT BOUNDARIES:

- Available context: existing outputs
- Focus: select edit target
- Limits: no edits yet

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly.

### 1. Identify Target

Ask the user to provide the output file path or select from known outputs.

Known outputs for this workflow:

- `{test_artifacts}/atdd/atdd-checklist-{story_key}.md` (one per story)
- the red-phase test files listed in that checklist

Files written by older TEA versions sit at the root of `{test_artifacts}`: `{test_artifacts}/atdd-checklist-{story_key}.md`. Offer them as candidates when present.

When several files match, list each one with its scope and ask which to edit. Do not guess.

### 2. Load Target

Read the provided output file in full.

### 3. Confirm

Confirm the target and proceed to edit.

Load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Target identified and loaded

### ❌ SYSTEM FAILURE:

- Proceeding without a confirmed target
