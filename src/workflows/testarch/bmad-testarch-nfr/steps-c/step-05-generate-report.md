---
name: 'step-05-generate-report'
description: 'Create NFR report and validation summary'
outputFile: '{test_artifacts}/nfr-assessment.md'
---

# Step 5: Generate Report & Validate

## STEP GOAL

Produce the NFR evidence audit report and validate completeness.

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

Use `nfr-report-template.md` to produce `{outputFile}` containing:

- Category results (PASS/CONCERNS/FAIL)
- Evidence summary
- Remediation actions
- Gate-ready YAML snippet

The gate snippet's `audited_domains` block carries the four domain statuses Step
4E rolled up in `domain_statuses`. Write them from that value rather than judging
them again here, and write each domain's `## <Domain> Assessment` section from the
same value: the block is what a machine reads and the section is what a person
reads, and a report whose two disagree about a domain has published two answers.

Render evidence only from each finding's audited `evidence` objects. For every
factual NFR claim, write the exact path relative to `supplied_project_root`,
without the supplied project-directory prefix, and the corresponding `supports`
statement. Under each domain heading, render exactly one `###` subsection for
each declared criterion, using its exact label and declared source order. Render
no other criterion subsection. Include every audited evidence item attached to
that finding, de-duplicated and sorted by path then supported observation. Omit
generic template sections absent from `declared_nfr_criteria`; mark them N/A only
when the report schema requires the heading.

Copy the structured `evidence_gaps` objects into `## Evidence Gaps` in declared
source order. Render exactly one bullet per object as
`- **{criterion_id}:** {message}`. A declared criterion with no audited
implementation evidence must remain CONCERNS, or the workflow's declared
undecidable state. Never invent an additional narrower or broader gap.

Requirements documents appear only as `Threshold Source` values beside their
declared thresholds. Never render a threshold source in an `Evidence` field or
count it as proof of implementation.

After the four audited domain sections, render
`recorded_only_nfr_criteria` in one `## Recorded-Only NFR Criteria` table, in
source order, with columns for ID, category, label, declared threshold,
threshold source, and assessment mode. Write the mode as `RECORDED ONLY` and
state once that these criteria were preserved without automated assessment.
Do not create finding subsections, statuses, actual values, evidence, gaps,
risks, actions, compliance results, or gate entries for recorded-only criteria.

---

## 2. Polish Output

Before finalizing, review the complete output document for quality:

1. **Remove duplication**: Progressive-append workflow may have created repeated sections — consolidate
2. **Verify consistency**: Ensure terminology, risk scores, and references are consistent throughout
3. **Check completeness**: All template sections should be populated or explicitly marked N/A
4. **Format cleanup**: Ensure markdown formatting is clean (tables aligned, headers consistent, no orphaned references)

---

## 3. Validation

Validate against `checklist.md` and fix gaps.

Perform a final prepublication pass against the canonical
`supplied_evidence_ledger`:

1. Every evidence path in the report exactly matches one ledger entry.
2. The statement beside that path exactly matches an observation in the entry's
   `supports` array.
3. Every evidence path uses canonical supplied-project-relative spelling and
   omits the supplied project-directory prefix.
4. No requirements or threshold-source path appears as implementation evidence.
5. Findings and gaps cover exactly the declared criteria. Broad checklist items
   absent from that scope have no status impact.
6. Every declared finding without valid support is CONCERNS, or the declared
   undecidable state, and appears in `## Evidence Gaps`.
7. No item recorded in `citation_audit[].rejected` appears in the report.
8. Evidence is de-duplicated and sorted by path then supported observation;
   repeated runs over equivalent evidence yield the same finding order, paths,
   statuses, and gaps.
9. Every declared criterion has exactly one subsection in declared source order.
10. Every ledger observation bound to a declared criterion appears under that
    criterion. Every unsupported criterion has exactly one fixed structured gap.
11. Every recorded-only criterion appears exactly once in the recorded-only
    table and nowhere in assessed findings, gaps, status rollups, or the gate.

If any check fails, return to Step 4E and correct the finding. Do not publish the
report until all eleven checks pass.

- [ ] CLI sessions cleaned up (no orphaned browsers)

---

## 4. Save Progress

**Save this step's accumulated work to `{outputFile}`.**

- **If `{outputFile}` does not exist** (first save), create it using the workflow template (if available) with YAML frontmatter:

  ```yaml
  ---
  stepsCompleted: ['step-05-generate-report']
  lastStep: 'step-05-generate-report'
  lastSaved: '{date}'
  ---
  ```

  Then write this step's output below the frontmatter.

- **If `{outputFile}` already exists**, update:
  - Add `'step-05-generate-report'` to `stepsCompleted` array (only if not already present)
  - Set `lastStep: 'step-05-generate-report'`
  - Set `lastSaved: '{date}'`
  - Append this step's output to the appropriate section of the document.

---

## 5. Completion Summary

Report:

- Overall NFR status
- Critical blockers or waivers needed
- Next recommended workflow (`trace` or release gate)

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
