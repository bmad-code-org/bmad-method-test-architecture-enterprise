---
name: 'step-04d-subagent-maintainability'
description: 'Subagent: Maintainability NFR evidence audit'
subagent: true
outputFile: '/tmp/tea-nfr-maintainability-{{timestamp}}.json'
---

# Subagent 4D: Maintainability NFR Evidence Audit

## SUBAGENT CONTEXT

This is an **isolated subagent** running in parallel with other NFR domain evidence audits.

**Your task:** Assess MAINTAINABILITY NFR domain only.

---

## SUBAGENT TASK

### 1. Maintainability Evidence Audit Categories

**A) Test Coverage:**

- Overall coverage percentage (from CI coverage report)
- Coverage trend (improving/flat/declining)
- Critical paths left uncovered

**B) Code Duplication:**

- Duplicated block percentage (from jscpd CI job)
- Largest duplicated regions
- Refactor candidates identified

**C) Dependency & Vulnerability Health:**

- Critical/high vulnerabilities (from `npm audit` CI job)
- Outdated or unmaintained dependencies
- Time-to-remediate for known issues

**D) Observability:**

- Structured logging validated (telemetry headers present)
- Error tracking configured (Sentry/monitoring integration)
- Log levels and error context sufficient for debugging

---

### 2. Status Assignment

For each category, determine status. Load
`{skill-root}/steps-c/nfr-status-definitions.md` for what PASS, CONCERNS, FAIL,
and N/A mean and are shared across all four NFR domain workers.

---

## OUTPUT FORMAT

```json
{
  "domain": "maintainability",
  "risk_level": "MEDIUM",
  "findings": [
    {
      "category": "Test Coverage",
      "status": "PASS",
      "description": "Coverage at 84%, meets 80% threshold",
      "evidence": ["CI coverage report - coverage/lcov-report/index.html"],
      "recommendations": []
    },
    {
      "category": "Code Duplication",
      "status": "CONCERNS",
      "description": "Duplication at 6%, above the 5% threshold",
      "evidence": ["jscpd report - reports/jscpd/jscpd-report.json"],
      "recommendations": ["Extract shared helper for the duplicated fixture setup", "Track duplication trend per PR"]
    }
  ],
  "compliance": {
    "coverage_80pct": "PASS",
    "duplication_5pct": "CONCERNS",
    "vulnerability_scan": "PASS"
  },
  "priority_actions": ["Reduce fixture-setup duplication below 5%", "Confirm error tracking captures unhandled promise rejections"],
  "summary": "Coverage and vulnerability scan clean; duplication trending above threshold"
}
```

---

## EXIT CONDITION

Subagent completes when JSON output written to temp file.
