---
name: 'step-01-validate'
description: 'Validate workflow outputs against checklist'
outputFile: '{test_artifacts}/atdd-validation-report-{validation_scope}-{run_timestamp}.md'
validationChecklist: '{skill-root}/checklist.md'
---

# Step 1: Validate Outputs

## STEP GOAL:

Validate outputs using the workflow checklist and record findings.

## MANDATORY EXECUTION RULES (READ FIRST):

### Universal Rules:

- 📖 Read the complete step file before taking any action
- ✅ Speak in `{communication_language}`

### Role Reinforcement:

- ✅ You are the Master Test Architect

### Step-Specific Rules:

- 🎯 Validate against `{validationChecklist}`
- 🚫 Do not skip checks
- 🚫 Never overwrite an existing validation report

## EXECUTION PROTOCOLS:

- 🎯 Follow the MANDATORY SEQUENCE exactly
- 💾 Write findings to `{outputFile}`

## CONTEXT BOUNDARIES:

- Available context: user-selected workflow outputs and checklist
- Focus: validation only
- Limits: do not modify outputs in this step

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly.

### 1. Select Scope and Resolve Report Path

Use the artifact paths the user supplied with the Validate request. If none were supplied, list the likely outputs for this workflow and ask which exact file or files to validate. When several candidates exist, do not guess.

Read the selected artifacts. Derive `validation_scope` from their shared story, epic, system, pull request, or other meaningful scope. Use an artifact basename without its extension when no broader scope is available. Normalize the value to lowercase ASCII with only letters, numbers, and single hyphens. Remove leading and trailing hyphens. Ask for a short scope label if normalization leaves an empty value.

Set `run_timestamp` to the current UTC time with milliseconds in `YYYYMMDDTHHmmssSSSZ` format and resolve `{outputFile}` with both values. Atomically reserve that path using an exclusive-create operation that fails if the file already exists. A separate existence check followed by a normal write is forbidden. On collision, generate a fresh timestamp, resolve a new path, and retry exclusive creation until it succeeds. Initialize the reserved file with `validation_scope`, `run_timestamp`, `validated_artifacts`, and `status: IN_PROGRESS`. This run may update only the file it reserved. If the workflow stops, leave that reservation in place. Never delete, truncate, or reuse a report from another run. Always refuse to overwrite prior validation history.

### 2. Load Checklist

Read `{validationChecklist}` and list all criteria.

### 3. Validate Outputs

Evaluate outputs against each checklist item.

### 4. Write Report

Replace the `IN_PROGRESS` body in this run's reserved `{outputFile}` with the final validation report. Include PASS/WARN/FAIL per section plus the original `validation_scope`, `run_timestamp`, and `validated_artifacts` metadata. Record every selected artifact using its exact project-relative path.

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Validation report written
- All checklist items evaluated
- All selected artifacts recorded in the report

### ❌ SYSTEM FAILURE:

- Skipped checklist items
- No report produced

## On Complete

Run: `uv run {project-root}/_bmad/scripts/resolve_customization.py --skill {skill-root} --project-root {project-root} --key workflow.on_complete`

If the resolver succeeds and returns a non-empty `workflow.on_complete`, execute that value as the final terminal instruction before exiting.

If the resolver fails, returns no output, or resolves an empty value, skip the hook and exit normally.
