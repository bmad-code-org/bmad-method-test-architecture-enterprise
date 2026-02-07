---
name: 'step-03-gather-evidence'
description: 'Collect evidence for each NFR category'
nextStepFile: './step-04-evaluate-and-score.md'
---

# Step 3: Gather Evidence

## STEP GOAL

Collect measurable evidence to evaluate each NFR category.

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

## 1. Evidence Sources

Collect evidence for:

- **Performance**: load tests, metrics, response time data
- **Security**: scans, auth tests, vuln reports
- **Reliability**: error rates, burn-in runs, failover tests
- **Maintainability**: test quality, code health signals
- **Other categories**: logs, monitoring, DR drills, deployability checks

---

## 2. Browser-Based Evidence Collection (if `tea_browser_automation` is `cli` or `auto`)

> **Fallback:** If CLI is not installed, fall back to MCP (if available) or skip browser-based evidence collection.

For performance and security categories, CLI can gather live evidence:

**Performance evidence (page load, response times):**

1. `playwright-cli -s=tea-nfr open <target_url>`
2. `playwright-cli -s=tea-nfr network` → capture response times and payload sizes
3. `playwright-cli -s=tea-nfr screenshot --filename={test_artifacts}/nfr/perf-<page>.png`
4. `playwright-cli -s=tea-nfr close`

> **Session Hygiene:** Always close sessions using `playwright-cli -s=tea-nfr close`. Do NOT use `close-all` — it kills every session on the machine and breaks parallel execution.

Store artifacts under `{test_artifacts}/nfr/`

---

## 3. Evidence Gaps

If evidence is missing for a category, mark that category as **CONCERNS**.

Load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Step completed in full with required outputs

### ❌ SYSTEM FAILURE:

- Skipped sequence steps or missing outputs
  **Master Rule:** Skipping steps is FORBIDDEN.
