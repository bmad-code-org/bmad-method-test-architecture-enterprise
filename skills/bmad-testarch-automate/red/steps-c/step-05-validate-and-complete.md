---
name: 'step-05-validate-and-complete'
description: 'Validate ATDD outputs and summarize'
outputFile: '{test_artifacts}/atdd/atdd-checklist-{story_key}.md'
---

# Step 5: Validate & Complete

## STEP GOAL

Validate ATDD outputs and provide a completion summary.

## MANDATORY EXECUTION RULES

- 📖 Read the entire step file before acting
- ✅ Speak in `{communication_language}`
- ✅ Validate against the checklist

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

## 0. Run and Heal Generated Tests

Set `test_operation = create` and preserve the selected `test_mode`.
Read `{skill-root}/resources/run-and-heal.md` completely and execute it before validation and completion.
Use the aggregated generated-file list and this run's existing `{outputFile}` for results.
For a 2.0.0 Resume, recover that list from the checkpoint body and its generated files before execution; preserve original scope and acceptance criteria.
Before execution and before each repair edit, persist the resolved values in this checkpoint's YAML frontmatter using the exact keys `test_mode`, `test_operation`, `auto_validate`, `auto_heal_failures`, `max_healing_iterations`, `use_mcp_healing`, and `healing_rounds_used`. Retain these typed values when saving completion; recover legacy body-only values as the shared resource specifies.
Record execution status in the completion summary. When `test_mode_defaulted = true`, include the exact line `Mode selection: entry default ({test_mode})` and explain that the invocation supplied no clear mode signal. Otherwise report the selected mode and its explicit task or saved-checkpoint basis.
A product defect or unavailable environment is reported honestly; a completed generation workflow does not imply all tests pass.

## 1. Validation

Use `{skill-root}/red/checklist.md` to validate:

- Prerequisites satisfied
- Test files created correctly
- Checklist matches acceptance criteria
- Tests are generated as red-phase scaffolds and marked with `test.skip()`
- Preflight preserved supplied criterion ids and assigned stable, collision-free ids to unnamed criteria
- Every executable leaf title carries exactly one id from the persisted criterion registry
- Every declared acceptance criterion has exactly one red-phase leaf scaffold
- Secondary branches and journeys are checklist work for green-phase automation
- The criterion-defining assertion is the first assertion that can fail and directly isolates the exact newly promised status, scalar, or property
- API setup responses from unimplemented endpoints remain opaque before the criterion assertion
- Each E2E primary scaffold begins with the criterion-defining assertion as its first potentially failing operation
- State-transition criteria exercise the transition-bearing branch in their primary scaffold
- Story metadata and handoff paths are captured for downstream workflows
- [ ] CLI sessions cleaned up (no orphaned browsers)
- [ ] Temp artifacts stored in `{test_artifacts}/` not random locations

Correct documentation and summary metadata gaps before completion. Any generated test/support edit belongs to the shared loop's frozen manifest and retained repair budget; this validation stage grants no additional repairs. Keep existing tests and production source unchanged.
Execution failures follow the shared bounded loop; retain its intended red failures, unresolved failures and blockers without further repair.

---

## 2. Polish Output

Before finalizing, review the complete output document for quality:

1. **Remove duplication**: Progressive-append workflow may have created repeated sections — consolidate
2. **Verify consistency**: Ensure terminology, risk scores, and references are consistent throughout
3. **Check completeness**: All template sections should be populated or explicitly marked N/A
4. **Format cleanup**: Ensure markdown formatting is clean (tables aligned, headers consistent, no orphaned references)

---

## 3. Completion Summary

Report:

- Test files created
- Checklist output path
- Story key / story file handoff path
- Key risks or assumptions
- Next recommended workflow (usually `dev-story`; `automate` comes after implementation)

---

## 4. Save Progress

**Save this step's accumulated work to `{outputFile}`.**
Preserve or include the loop's resolved YAML frontmatter keys `test_mode`, `test_operation`, `auto_validate`, `auto_heal_failures`, `max_healing_iterations`, `use_mcp_healing`, and `healing_rounds_used` in either save branch below. Save their current values; the first-save identity template never resets settings or spent rounds.

- **If `{outputFile}` does not exist** (first save), create it with YAML frontmatter:

  ```yaml
  ---
  runScope: '{run_scope}'
  runKey: '{run_key}'
  workflowStatus: 'completed'
  stepsCompleted: ['step-05-validate-and-complete']
  lastStep: 'step-05-validate-and-complete'
  lastSaved: '{date}'
  storyId: '{story_id}'
  storyKey: '{story_key}'
  storyFile: '{story_file}'
  atddChecklistPath: '{outputFile}'
  generatedTestFiles: []
  ---
  ```

  Then write this step's output below the frontmatter.

- **If `{outputFile}` already exists** (written earlier in this same run), update:
  - Leave `runScope` and `runKey` exactly as step 1 wrote them
  - Set `workflowStatus: 'completed'`
  - Add `'step-05-validate-and-complete'` to `stepsCompleted` array (only if not already present)
  - Set `lastStep: 'step-05-validate-and-complete'`
  - Set `lastSaved: '{date}'`
  - Ensure `storyId`, `storyKey`, `storyFile`, and `atddChecklistPath` are present and populated
  - Ensure `generatedTestFiles` remains populated with the deterministic list of present generated test paths
  - Retain the resolved frontmatter settings and `healing_rounds_used` saved by the loop; completion never resets the budget.
  - Append this step's output to the appropriate section.

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Step completed in full with required outputs

### ❌ SYSTEM FAILURE:

- Skipped sequence steps or missing outputs
  **Master Rule:** Skipping steps is FORBIDDEN.

## On Complete

When `workflow_customization_manual = true`, execute the non-empty `workflow.on_complete` retained from selected-mode activation as the final terminal instruction, then exit normally.
Otherwise resolve the same selected customization surface below; never run the other mode's hook.

Run: `uv run {project-root}/_bmad/scripts/resolve_customization.py --skill {workflow-skill-root} --project-root {project-root} --key workflow.on_complete`

If the resolver succeeds and returns a non-empty `workflow.on_complete`, execute that value as the final terminal instruction before exiting.

If the resolver fails or returns no output, use the selected `workflow.on_complete` block already resolved during activation (or resolve the selected defaults/team/user files with the same structural merge rules).
Execute its non-empty value as the final terminal instruction.
An explicitly resolved empty value means no completion hook; exit normally.
