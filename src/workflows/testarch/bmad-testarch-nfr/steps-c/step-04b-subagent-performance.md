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

---

## SUBAGENT TASK

### 1. Performance Evidence Audit Categories

Read the Performance thresholds established in Step 2 from
`subagentContext.nfr_thresholds.performance` and assess every finding against those values. When a
threshold is `UNKNOWN`, report `CONCERNS`. The fixed values below are examples of the evidence shape;
they are never authoritative defaults.

**A) Response Times:**

- API response times (example: <200ms)
- Page load times (example: <2s)
- Time to interactive (example: <3s)

**B) Throughput:**

- Requests per second capacity
- Concurrent user support
- Database query performance

**C) Resource Usage:**

- Memory consumption
- CPU utilization
- Database connection pooling

**D) Optimization:**

- Caching strategies
- CDN usage
- Code splitting/lazy loading
- Database indexing

---

### 2. Status Assignment

For each category, determine status. Load
`{skill-root}/steps-c/nfr-status-definitions.md` for what PASS, CONCERNS, FAIL,
and N/A mean and are shared across all four NFR domain workers.

---

## OUTPUT FORMAT

```json
{
  "domain": "performance",
  "risk_level": "LOW",
  "findings": [
    {
      "category": "Response Times",
      "status": "PASS",
      "description": "API endpoints respond in <150ms (P95)",
      "evidence": ["Load testing results show 140ms P95"],
      "recommendations": []
    },
    {
      "category": "Caching",
      "status": "CONCERNS",
      "description": "No CDN for static assets",
      "evidence": ["Static files served from origin"],
      "recommendations": ["Implement CDN (CloudFront/Cloudflare)", "Cache static assets for 1 year"]
    }
  ],
  "compliance": {
    "SLA_99.9": "PASS",
    "SLA_99.99": "CONCERNS"
  },
  "priority_actions": ["Implement CDN for static assets", "Add database query caching for frequent reads"],
  "summary": "Performance is acceptable with minor optimization opportunities"
}
```

---

## EXIT CONDITION

Subagent completes when JSON output written to temp file.
