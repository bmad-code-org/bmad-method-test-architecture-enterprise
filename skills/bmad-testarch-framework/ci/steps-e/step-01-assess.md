---
name: 'step-01-assess'
description: 'Load an existing output for editing'
nextStepFile: '{skill-root}/ci/steps-e/step-02-apply-edit.md'
evaluationPlansStepFile: '{skill-root}/ci/steps-c/step-03b-render-evaluation-plans.md'
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

Load `resources/setup-state.md` and save this phase's Edit position in the all-scope journal. On Resume, restore `phase_targets` and `edit_requests` for this phase and continue at its saved subsection; do not ask for an already confirmed target or enter Create resume.

Ask the user to provide the output file path or select from known outputs.

Known outputs for this workflow:

- the pipeline file for the chosen `ci_platform`: `{project-root}/.github/workflows/test.yml`, `{project-root}/.gitlab-ci.yml`, `{project-root}/Jenkinsfile`, `{project-root}/azure-pipelines.yml`, `{project-root}/.harness/pipeline.yaml`, or `{project-root}/.circleci/config.yml`
- `{test_artifacts}/ci/ci-pipeline-progress.md` (run checkpoint, one per project)

Files written by older TEA versions sit at the root of `{test_artifacts}`: `{test_artifacts}/ci-pipeline-progress.md`. Offer them as candidates when present.

When several files match, list each one with its scope and ask which to edit. Do not guess.

### 2. Load Target

Read the provided output file in full. Save the exact confirmed target paths and their pre-edit digests in `phase_targets`, then save the next Edit subsection before continuing.

### 3. Detect Evaluation Plans

Load `{evaluationPlansStepFile}`, read it completely, and run its sections 1 and 2 (detect and validate) against the repository, holding what it finds in the conversation. Every `ci/evaluation-ci-plan.json` it finds is an edit to apply.

### 4. Confirm

Confirm the target and the plans found, and proceed to edit.

Journal the confirmed target, requested change context and next Edit step in `phase_position` before loading `{nextStepFile}`. Preserve every unrequested Create checkpoint field.

Load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Target identified and loaded

### ❌ SYSTEM FAILURE:

- Proceeding without a confirmed target
