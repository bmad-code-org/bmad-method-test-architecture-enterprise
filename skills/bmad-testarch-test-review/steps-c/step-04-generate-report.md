---
name: 'step-04-generate-report'
description: 'Create test-review report and validate'
outputFile: '{test_artifacts}/test-review/test-review-{run_key}.md'
---

# Step 4: Generate Report & Validate

## STEP GOAL

Produce the test-review report and validate against checklist.

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

## 1. Report Generation

Use `test-review-template.md` to produce `{outputFile}`. It carries:

- the score summary and the one-paragraph Summary;
- the criteria table, with only the rows that apply to this repository;
- the findings, each once: one location, one explanation of the failure, one concrete fix, and a code snippet only when it clarifies the evidence;
- the Decision (the recommendation alone), and the manifests the CLI reads.

Context references, a coverage note and run identity belong in the Summary when they matter: `test-review` does not score coverage, so direct coverage findings to `trace`; when step 1 keyed a headless run to its reviewed target because the context named several stories or epics, say so there.

`**Execution Mode**:` goes in the Executive Summary, set to step 3F's `execution_mode`, which is the mode step-03's capability probe actually resolved. Write `agent-team`, `subagent`, or `sequential`; never `auto`: it names the request, and this line records what the probe resolved. `cli/lib/parse-report.js` reads this line into the verdict, so a headless run that silently fell back to `sequential` says so in its own artifact.

**Do not write** a Key Weaknesses list, Best Practices Found, Test File Analysis, Knowledge Base References, Next Steps, an appendix of violations by location, a Decision rationale, Review Metadata or a feedback section. Each restates a finding or pads the report, and the findings already carry what a reader needs. Put useful unscored ideas from `reviewSummary.advisory_observations` under `### Advisory Observations`, and omit the subsection when empty. Never render an empty or literal `n/a` item.

In `review_mode: pr`, the report speaks only to what the pull request changed or broke, and you fill the template's Review Mode line with `pr`. The CLI computes the pull request decision and puts it at the top of the artifact after provenance is known.

**Say only what the run established.** The criteria table lists a row only when it applies to this repository: a row whose convention or applicability gate is closed, or whose utility the project does not use, is left out. Test Duration is `Not measured`, because a static read cannot time a run. Test Length uses the exact line counts the headless prompt supplies. State no test count, assertion count or duration unless the run supplied it, and label an estimate `(estimate)`. Write nothing about how the rubric decided (which row fired, a registry gap, a closed gate): a reader cannot act on it.

**Reproduce the `## Quality Score Breakdown` ledger in the template's exact line form**, inside its fenced block, with the bonus carrying a leading plus (`Total Bonus:             +0` for a zero bonus). Headless runners parse those lines to compute the authoritative score, so the rendering is part of the contract.

---

## 2. Polish Output

Before finalizing, review the complete output document for quality:

1. **Remove duplication**: This run's step-by-step appends may have created repeated sections. Consolidate them
2. **Verify consistency**: Ensure terminology, risk scores, and references are consistent throughout
3. **Check completeness**: Required template sections should be populated.
   Omit the optional Key Strengths and Advisory Observations subsections when empty;
   never fill list items with N/A.
4. **Format cleanup**: Ensure markdown formatting is clean (tables aligned, headers consistent, no orphaned references). **The `## Quality Score Breakdown` ledger is exempt from this pass** — leave its lines exactly as the template prints them, and never reflow it into a table to satisfy the alignment rule.

---

## 3. Validation

Validate against `checklist.md` and fix any gaps.

- [ ] CLI sessions cleaned up (no orphaned browsers)
- [ ] Evidence artifacts stored in `{test_artifacts}/test-review/` with this run's `{run_key}` in their names

---

## 4. Save Progress

**Save this step's accumulated work to `{outputFile}`.** `run_key` is the value step 1 resolved; never re-derive it. When `output_file_override` is non-empty it IS `{outputFile}`, replacing the step frontmatter default.

**Resume state is for interactive runs.** The resume keys below (`workflowStatus`, `stepsCompleted`, `lastStep`, `lastSaved`, `inputDocuments`) let `step-01b-resume.md` continue an interrupted run. A headless run writes only `workflowType`, `runScope` and `runKey`, and the CLI removes any resume key from the report it publishes.

- **If `{outputFile}` does not exist** (first save), create it using the workflow template (if available) with YAML frontmatter:

  ```yaml
  ---
  workflowType: 'testarch-test-review'
  runScope: '{run_scope}'
  runKey: '{run_key}'
  workflowStatus: 'completed'
  stepsCompleted: ['step-04-generate-report']
  lastStep: 'step-04-generate-report'
  lastSaved: '{date}'
  ---
  ```

  Then write this step's output below the frontmatter.

- **If `{outputFile}` already exists**, it is this run's report: step 1 created it or Resume selected it, so it never holds another run's work. Update:
  - Leave `runScope` and `runKey` exactly as step 1 wrote them
  - Set `workflowStatus: 'completed'`
  - Add `'step-04-generate-report'` to `stepsCompleted` array (only if not already present)
  - Set `lastStep: 'step-04-generate-report'`
  - Set `lastSaved: '{date}'`
  - Append this step's output to the appropriate section of the document.

---

## 5. Completion Summary

Report:

- Scope reviewed
- Report path (`{outputFile}`) and its `run_key`
- Overall score
- Critical blockers
- Next recommended workflow (e.g., `automate` or `trace`)

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Step completed in full with required outputs

### ❌ SYSTEM FAILURE:

- Skipped sequence steps or missing outputs
  **Master Rule:** Skipping steps is FORBIDDEN.

## On Complete

Run: `uv run {project-root}/_bmad/scripts/resolve_customization.py --skill {skill-root} --project-root {project-root} --key workflow.on_complete`

If the resolver succeeds and returns a non-empty `workflow.on_complete`, execute that value as the final terminal instruction before exiting.

If the resolver fails, returns no output, or resolves an empty value, skip the hook and exit normally.
