---
name: 'step-04a-subagent-security'
description: 'Subagent: Security NFR evidence audit'
subagent: true
outputFile: '/tmp/tea-nfr-security-{{timestamp}}.json'
---

# Subagent 4A: Security NFR Evidence Audit

## SUBAGENT CONTEXT

This is an **isolated subagent** running in parallel with other NFR domain evidence audits.

**Your task:** Assess SECURITY NFR domain only.

---

## MANDATORY EXECUTION RULES

- ✅ Assess SECURITY only (not performance, reliability, maintainability)
- ✅ Output structured JSON to temp file
- ✅ Use only exact paths and supported observations from `subagentContext.supplied_evidence_ledger`
- ✅ Emit exactly one finding per item in `subagentContext.declared_nfr_criteria.security`, in declared order
- ✅ Record CONCERNS and an evidence gap when the ledger cannot support a declared criterion
- ❌ Do NOT assess other NFR domains
- ❌ Do NOT assess generic security dimensions absent from the declared criteria
- ❌ Do NOT put a requirements or threshold-source document in `evidence`
- ❌ Do NOT cite remembered files, implementation paths, examples, or inferred facts

---

## SUBAGENT TASK

### 1. Security Evidence Audit Scope

Read the security array from `subagentContext.declared_nfr_criteria`. Assess
only those entries and preserve their exact IDs, labels, and order. General
security topics are discovery knowledge only. They create no finding,
compliance row, recommendation, gap, or status impact unless a supplied
requirement declares them.

### 2. Risk Assessment

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

### 3. Compliance Check

Emit compliance rows only for standards explicitly declared in the supplied
requirements.

---

## OUTPUT FORMAT

The following is a schema-only shape. Braced tokens are placeholders and are
never evidence or default values.

```json
{
  "domain": "security",
  "risk_level": "{RISK_LEVEL}",
  "findings": [
    {
      "criterion_id": "{STABLE_CRITERION_ID_FROM_DECLARED_SCOPE}",
      "category": "{SECURITY_CRITERION}",
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
  "compliance": { "{STANDARD}": "{STATUS}" },
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

**Subagent terminates here.**
