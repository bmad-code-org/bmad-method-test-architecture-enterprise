---
name: 'step-01-validate'
description: 'Validate workflow outputs against checklist'
outputFile: '{test_artifacts}/framework/framework-validation-report-{validation_scope}-{run_timestamp}.md'
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

Apply `resources/setup-state.md` section 4. On Resume, restore this phase's selected exact artifacts, criteria/results, current subsection and owned reserved report from `phase_targets`, `validation_reports` and `phase_position`. Continue that report without another reservation or selection question. These Validate saves and completion hooks affect the run journal; preserve old Create checkpoints.

Use the artifact paths the user supplied with the Validate request. If none were supplied, list the likely outputs for this workflow and ask which exact file or files to validate. When several candidates exist, do not guess.

Likely outputs for this workflow:

- `{test_dir}/README.md` and the scaffolded framework config, fixtures, and sample tests under `{test_dir}`
- `{test_artifacts}/framework/framework-setup-progress.md` (run checkpoint, one per project)

Files written by older TEA versions sit at the root of `{test_artifacts}`: `{test_artifacts}/framework-setup-progress.md`. Offer them as candidates when present.

Read the selected artifacts. Derive `validation_scope` from their shared story, epic, system, pull request, or other meaningful scope. Use an artifact basename without its extension when no broader scope is available. Normalize the value to lowercase ASCII with only letters, numbers, and single hyphens. Remove leading and trailing hyphens. Ask for a short scope label if normalization leaves an empty value.

For a fresh reservation only, set `run_timestamp` to the current UTC time with milliseconds in `YYYYMMDDTHHmmssSSSZ` format and resolve `{outputFile}` with both values. Create the `{test_artifacts}/framework/` folder if it does not exist. Save the chosen report path and its reservation `run_id` in the journal before reservation. Atomically reserve that path using an exclusive-create operation that fails if the file already exists. A separate existence check followed by a normal write is forbidden. On collision, generate a fresh timestamp, resolve a new path, and retry exclusive creation until it succeeds. Initialize the reserved file with this journal's `run_id`, `validation_scope`, `run_timestamp`, `validated_artifacts`, and `status: IN_PROGRESS`. Save successful reservation ownership and the next subsection in the journal. This run may update only the file it reserved; Resume verifies its `run_id` before writing. If the workflow stops, leave that reservation in place. Never delete, truncate, or reuse a report from another run. Always refuse to overwrite prior validation history.

### 2. Load Checklist

Read `{validationChecklist}` and list all criteria.

### 3. Validate Outputs

Evaluate outputs against each checklist item. Save each completed criterion/result and the next Validate subsection in the journal; Resume continues unfinished criteria with the same selected artifacts and reserved report.

### 4. Write Report

Replace the `IN_PROGRESS` body in this run's reserved `{outputFile}` with the final validation report. Include PASS/WARN/FAIL per section plus the original `validation_scope`, `run_timestamp`, and `validated_artifacts` metadata. Record every selected artifact using its exact project-relative path. Preserve this report's `run_id` and save the final report result plus `phase-handoff` in the journal before completion hooks.

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Validation report written
- All checklist items evaluated
- All selected artifacts recorded in the report

### ❌ SYSTEM FAILURE:

- Skipped checklist items
- No report produced

## On Complete

Load `{skill-root}/resources/setup-phase-completion.md` completely and apply it for this phase. It resolves each applicable phase hook and canonical `workflow.on_complete` once, preserves the original operation, and continues pending phases before completing the run.
