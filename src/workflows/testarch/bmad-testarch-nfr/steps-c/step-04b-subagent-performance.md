---
name: 'step-04b-subagent-performance'
description: 'Subagent: Performance NFR evidence audit'
subagent: true
outputFile: '/tmp/tea-nfr-performance-{{timestamp}}.json'
---

# Subagent 4B: Performance NFR Evidence Audit

## SUBAGENT CONTEXT

This is an **isolated subagent** running in parallel with other NFR domain evidence audits.

**Your task:** Assess PERFORMANCE NFR domain only.

Use only exact paths and supported observations from
`subagentContext.supplied_evidence_ledger`. When the ledger cannot support a
declared criterion, report CONCERNS and add the missing observation to
`evidence_gaps`. Emit exactly one finding per item in
`subagentContext.declared_nfr_criteria.performance`, in declared order. Omit
generic performance topics absent from that scope. Keep requirements and
threshold sources out of `evidence`. Never cite remembered files, examples, or
inferred facts.

---

## SUBAGENT TASK

### 1. Performance Evidence Audit Scope

Read only the Performance entries established in Step 2 from
`subagentContext.declared_nfr_criteria.performance` and assess each finding
against its declared threshold. When a threshold is `UNKNOWN`, report
`CONCERNS`. General performance topics are discovery knowledge only and create
no finding or gap unless the supplied requirements declare them.

---

### 2. Status Assignment

For each category, determine status. Load
`{skill-root}/steps-c/nfr-status-definitions.md` for what PASS, CONCERNS, FAIL,
and N/A mean and are shared across all four NFR domain workers.

Assign the finding status solely by comparing the supplied implementation
observation with that criterion's declared threshold. A result allowed by the
threshold remains PASS. For example, a moderate-only dependency finding remains
PASS when the declared threshold prohibits critical and high findings. Descriptive
severity outside the threshold's prohibited set cannot lower the finding or
domain status.

For each criterion, select every ledger observation whose `criterion_id` equals
that criterion's stable ID. Cite all of them, de-duplicated and sorted by `path`
then `supports`. Omitting any bound observation is invalid. When no observation
is bound, emit exactly one gap object with that `criterion_id` and the fixed
message `${criterion.label}: no supplied implementation evidence`. Emit no
narrower, broader, or free-form gap for that criterion.

---

## OUTPUT FORMAT

The following is a schema-only shape. Braced tokens are placeholders and are
never evidence or default values.

```json
{
  "domain": "performance",
  "risk_level": "{RISK_LEVEL}",
  "findings": [
    {
      "criterion_id": "{STABLE_CRITERION_ID_FROM_DECLARED_SCOPE}",
      "category": "{PERFORMANCE_CRITERION}",
      "status": "{STATUS}",
      "description": "{EVIDENCE_BACKED_FINDING}",
      "evidence": [
        {
          "path": "{PROJECT_RELATIVE_PATH_FROM_LEDGER}",
          "supports": "{OBSERVATION_FROM_LEDGER}"
        }
      ],
      "recommendations": ["{ACTION_IF_NEEDED}"]
    }
  ],
  "evidence_gaps": [
    {
      "criterion_id": "{STABLE_CRITERION_ID_FROM_DECLARED_SCOPE}",
      "message": "{CRITERION_LABEL}: no supplied implementation evidence"
    }
  ],
  "compliance": { "{PERFORMANCE_COMMITMENT}": "{STATUS}" },
  "priority_actions": ["{PRIORITY_ACTION}"],
  "summary": "{EVIDENCE_BACKED_SUMMARY}"
}
```

Use each ledger path exactly as stored. De-duplicate and sort evidence by
`path`, then `supports`. Keep the threshold source in a separate
`threshold_source` field when needed; never copy it into `evidence`.

---

## EXIT CONDITION

Subagent completes when JSON output written to temp file.
