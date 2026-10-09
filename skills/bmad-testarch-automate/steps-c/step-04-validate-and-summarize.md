---
name: 'step-04-validate-and-summarize'
description: 'Validate outputs and produce automation summary'
outputFile: '{test_artifacts}/automate/automation-summary-{run_key}.md'
---

# Step 4: Validate & Summarize

## STEP GOAL

Validate generated outputs and produce a concise automation summary.

## MANDATORY EXECUTION RULES

- 📖 Read the entire step file before acting
- ✅ Speak in `{communication_language}`
- ✅ Validate against the checklist before completion

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

## 1. Validate

Use `checklist.md` to validate:

- Framework readiness
- Coverage mapping
- Test quality and structure
- Fixtures, factories, helpers
- [ ] CLI sessions cleaned up (no orphaned browsers)
- [ ] Temp artifacts stored in `{test_artifacts}/` not random locations

Correct documentation and summary metadata gaps before proceeding. Any generated test/support edit belongs to the shared loop's frozen manifest and retained repair budget; this validation stage grants no additional repairs. Keep existing tests and production source unchanged.
Execution failures follow the shared bounded loop; retain its product defects, unresolved failures and blockers in the summary without further repair.

---

## 2. Polish Output

Before finalizing, review the complete output document for quality:

1. **Remove duplication**: Progressive-append workflow may have created repeated sections — consolidate
2. **Verify consistency**: Ensure terminology, risk scores, and references are consistent throughout
3. **Check completeness**: All template sections should be populated or explicitly marked N/A
4. **Format cleanup**: Ensure markdown formatting is clean (tables aligned, headers consistent, no orphaned references)

---

## 3. Summary Output

Write `{outputFile}` including:

- The run's scope (`runKey`), and a note when it is `system` only because no narrower scope could be resolved
- Coverage plan by test level and priority
- Files created/updated
- Key assumptions and risks
- Next recommended workflow (e.g., `test-review` or `trace`)

**If `tea_use_playwright_utils` is true**, add a `Playwright Utils deviations` section listing every entry rolled up in Step 3C, one line each as `file:line: reason`. Write `None` when the list is empty; the reader cannot tell an empty section from a forgotten one.

**If `tea_use_pactjs_utils` is true and contract artifacts were generated**, add a `Pact.js Utils deviations` section on the same terms, from the same roll-up. Separate headings: a run can be clean on one mandate and not the other.

Name in the same section any RECOMMENDED utility the run wanted but could not wire, with the wiring it needs: an `auth-session` provider, a HAR directory for `network-recorder`, a mock provider for the webhook module, a config and script for `burn-in`. A run that quietly skipped auth and drove a login form instead has hidden the one thing the next person needs to fix.

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
  stepsCompleted: ['step-04-validate-and-summarize']
  lastStep: 'step-04-validate-and-summarize'
  lastSaved: '{date}'
  ---
  ```

  Then write this step's output below the frontmatter.

- **If `{outputFile}` already exists** (written earlier in this same run), update:
  - Leave `runScope` and `runKey` exactly as step 1 wrote them
  - Set `workflowStatus: 'completed'`
  - Add `'step-04-validate-and-summarize'` to `stepsCompleted` array (only if not already present)
  - Set `lastStep: 'step-04-validate-and-summarize'`
  - Set `lastSaved: '{date}'`
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
