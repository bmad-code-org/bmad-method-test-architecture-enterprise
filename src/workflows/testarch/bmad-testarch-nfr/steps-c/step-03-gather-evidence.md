---
name: 'step-03-gather-evidence'
description: 'Collect evidence for each NFR category'
nextStepFile: '{skill-root}/steps-c/step-04-evaluate-and-score.md'
outputFile: '{test_artifacts}/nfr-assessment.md'
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

For the criteria present in `declared_nfr_criteria`, collect relevant evidence
from these source families:

- **Performance**: load tests, metrics, response time data
- **Security**: scans, auth tests, vuln reports
- **Reliability**: error rates, burn-in runs, failover tests
- **Maintainability**: CI coverage report, jscpd duplication report, npm audit results, structured logging and error-tracking config
- **Other declared categories**: logs, monitoring, DR drills, deployability checks

These source families are discovery hints. An item in this list that has no
matching declared criterion creates no finding and no evidence gap.

### Build the supplied-evidence ledger

First identify `supplied_project_root`: the root directory of the project being
audited, containing its supplied `docs`, `evidence`, and configuration paths.
This can be a child of the runner workspace. Build one canonical
`supplied_evidence_ledger` before any domain evaluation. The ledger is the
complete allowlist for factual NFR claims. Include only files that exist under
`supplied_project_root` and were supplied for this audit. Exclude the skill,
templates, temporary worker output, and `{outputFile}`.

For every ledger entry, record:

```json
{
  "path": "{PROJECT_RELATIVE_PATH}",
  "observations": [
    {
      "criterion_id": "{STABLE_CRITERION_ID_FROM_DECLARED_SCOPE}",
      "supports": "{OBSERVATION_SUPPORTED_BY_THIS_FILE}"
    }
  ],
  "domains": ["{NFR_DOMAIN}"],
  "source": "supplied",
  "source_type": "implementation-evidence"
}
```

Rules:

- `path` is relative to `supplied_project_root`, uses `/` separators, and has no
  leading `./`, absolute prefix, or supplied project-directory prefix. For a
  supplied root ending in `{PROJECT_DIRECTORY}`, the one canonical spelling is
  `evidence/{FILE}`, never `{PROJECT_DIRECTORY}/evidence/{FILE}`.
- Resolve the canonical path under `supplied_project_root`, confirm it remains
  inside that root, and confirm it is a regular file before adding it.
- Every `observations` item binds one supported statement to the exact stable
  `criterion_id` from `declared_nfr_criteria`. Read the file before recording
  the observation. A statement that supports two declared criteria is recorded
  once for each criterion ID.
- Keep requirements and planning documents in
  `declared_nfr_criteria[].threshold_source`. Exclude them from the
  implementation-evidence ledger. A requirement or threshold proves the target
  only. It never proves implementation, an achieved measurement, or PASS.
- Sort ledger entries by `path`. Within each entry, de-duplicate observations by
  the pair `criterion_id` plus `supports`, then sort by `criterion_id` and
  `supports`. Order `domains` as security, performance, reliability,
  maintainability. Equivalent supplied evidence must produce identical ledger
  bytes.
- Record an explicit evidence gap only for a criterion in
  `declared_nfr_criteria` whose required implementation observation has no
  supporting ledger observation. Emit exactly one structured gap in declared
  source order:
  `{"criterion_id":"{criterion.id}","message":"{criterion.label}: no supplied implementation evidence"}`.
  Never split one
  unsupported criterion into narrower gaps or combine several criteria into a
  broader gap.
- Pass the complete ledger and gaps to Step 4 as
  `subagentContext.supplied_project_root`,
  `subagentContext.declared_nfr_criteria`,
  `subagentContext.supplied_evidence_ledger` and
  `subagentContext.evidence_gaps`.

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

Here, "category" means one criterion present in `declared_nfr_criteria`.
If evidence is missing for a category, mark that category as **CONCERNS**.
Name the missing observation in `evidence_gaps`.
Ignore discovery-checklist items absent from `declared_nfr_criteria`. Never add
a remembered, inferred, or example path or value to the ledger.

---

## 4. Save Progress

**Save this step's accumulated work to `{outputFile}`.**

- **If `{outputFile}` does not exist** (first save), create it using the workflow template (if available) with YAML frontmatter:

  ```yaml
  ---
  stepsCompleted: ['step-03-gather-evidence']
  lastStep: 'step-03-gather-evidence'
  lastSaved: '{date}'
  ---
  ```

  Then write this step's output below the frontmatter.

- **If `{outputFile}` already exists**, update:
  - Add `'step-03-gather-evidence'` to `stepsCompleted` array (only if not already present)
  - Set `lastStep: 'step-03-gather-evidence'`
  - Set `lastSaved: '{date}'`
  - Append this step's output to the appropriate section of the document.

Load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Step completed in full with required outputs

### ❌ SYSTEM FAILURE:

- Skipped sequence steps or missing outputs
  **Master Rule:** Skipping steps is FORBIDDEN.
