---
name: 'step-04-validate-and-summary'
description: 'Validate pipeline and summarize'
outputFile: '{test_artifacts}/ci/ci-pipeline-progress.md'
---

# Step 4: Validate & Summarize

## STEP GOAL

Validate CI configuration and report completion details.

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

## Worker Handoff

If `setup_worker` is set in a both Create run, return generated artifacts and this phase checkpoint to the coordinator before validation. Mark this phase `generated`; do not execute completion hooks or save it as completed. The coordinator runs this terminal after both workers join.

## 1. Validation

Validate against `{skill-root}/ci/checklist.md`:

- Config file created
- Stages and sharding configured
- Burn-in and artifacts enabled
- Secrets/variables documented
- Evaluation plans found by step 3b rendered, one `tea-evaluate ci` step per tier and an `if: always()` upload of each `runs/` folder (when any plan exists)

Fix gaps before completion. Run the actual contract test commands, verify all generated pipeline commands/paths/dependencies against the framework, and perform syntax and injection checks before saving completed progress.

---

## 2. Completion Summary

Report:

- CI platform and config path
- Key stages enabled
- Artifacts and notifications
- Evaluation plans rendered, refused or not validated, the jobs they gate, and the credentials their live tiers need
- Next steps (set secrets, run pipeline)

---

### 3. Save Progress

**Save this step's accumulated work to `{outputFile}`.**

Retain `run_id`, `setup_scope`, `setup_operation`, the agreed `contract`, and hook ledger fields with this Create phase's frontmatter. For every scope, report this save and the next step to the coordinator so it atomically updates `{test_artifacts}/framework/setup-run-progress.md` and `phase_position` through `resources/setup-state.md`; preserve per-phase step names and artifact paths. Workers update only their own Create checkpoint.

- **If `{outputFile}` does not exist** (first save), create it with YAML frontmatter:

  ```yaml
  ---
  workflowStatus: 'completed'
  stepsCompleted: ['step-04-validate-and-summary']
  lastStep: 'step-04-validate-and-summary'
  lastSaved: '{date}'
  ---
  ```

  Then write this step's output below the frontmatter.

- **If `{outputFile}` already exists**, update:
  - Set `workflowStatus: 'completed'`
  - Add `'step-04-validate-and-summary'` to `stepsCompleted` array (only if not already present)
  - Set `lastStep: 'step-04-validate-and-summary'`
  - Set `lastSaved: '{date}'`
  - Append this step's output to the appropriate section of the document.

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Step completed in full with required outputs

### ❌ SYSTEM FAILURE:

- Skipped sequence steps or missing outputs
  **Master Rule:** Skipping steps is FORBIDDEN.

## On Complete

Load `{skill-root}/resources/setup-phase-completion.md` completely and apply it for this phase. It resolves each applicable phase hook and canonical `workflow.on_complete` once, preserves the original operation, and continues pending phases before completing the run.
