---
name: 'step-03-risk-and-testability'
description: 'Perform testability review (system-level) and risk assessment'
nextStepFile: '{skill-root}/steps-c/step-04-coverage-plan.md'
outputFile: '{test_artifacts}/test-design/test-design-progress-{run_key}.md'
---

# Step 3: Testability & Risk Assessment

## STEP GOAL

Produce a defensible testability review (system-level) and a risk assessment matrix (all modes).

## MANDATORY EXECUTION RULES

- 📖 Read the entire step file before acting
- ✅ Speak in `{communication_language}`
- 🎯 Base conclusions on evidence from loaded artifacts

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

## 1. System-Level Mode: Testability Review

If **system-level**, evaluate architecture for:

- **Controllability** (state seeding, mockability, fault injection)
- **Observability** (logs, metrics, traces, deterministic assertions)
- **Reliability** (isolation, reproducibility, parallel safety)

**Structure output as:**

1. **🚨 Testability Concerns** (actionable issues first)
2. **✅ Testability Assessment Summary** (what is already strong)

Also identify **ASRs** (Architecturally Significant Requirements):

- Mark each as **ACTIONABLE** or **FYI**

---

## 2. All Modes: Risk Assessment

Using `risk-governance.md` and `probability-impact.md` (if loaded):

- Identify real risks (not just features)
- Ground every risk in an explicit statement from the supplied epic or a named artifact loaded for this run. Record the supporting statement in the risk description or mitigation notes so another reader can trace the row.
- Keep the register bounded by the scope supported by the supplied epic or a named artifact loaded for this run. Do not add plausible risks merely because they are common in other systems. If a concern has no supporting statement, record it as an assumption or clarification outside the risk register.
- Treat controls explicitly described as already satisfied as scope constraints. Verify them with regression assertions in the coverage plan. A hypothetical implementation violating a stated read-only, local-only, privacy, or rollout constraint needs evidence of a new exposure before it becomes a scored risk.
- Consolidate conditions that share a failure mechanism, consequence, and mitigation into one risk. Keep individual trigger and boundary cases in the coverage plan. For example, a stale cached timestamp and a missed refresh event can be one display-freshness risk; absent-value and disabled-flag rendering can share one conditional-visibility risk when the same visibility guard controls both.
- Preserve the risk table columns `Risk ID`, `Category`, `Description`, `Probability`, `Impact`, and `Score`. Add a separate source-evidence column when useful. State the failure consequence in `Description` and cite the supporting input.
- Assign unique canonical IDs `R-001`, `R-002`, and so on. Preserve those IDs in coverage, mitigations, summaries, and handoffs. Keep epic or story identity in the document run key.
- Preserve explicit score ranges in risk-band headings: high score 6 or greater, medium score 3 to 4, and low score 1 to 2. For a band with no identified risk, state that absence outside the table and leave its table body empty.
- Classify by category: TECH / SEC / PERF / DATA / BUS / OPS
- Score Probability (1–3) and Impact (1–3)
- Calculate Risk Score (P × I)
- Flag high risks (score ≥ 6)
- Define mitigation, owner, and timeline

---

## 3. NFR Planning Assessment

Using `nfr-criteria.md` when loaded:

- Identify NFR categories in scope: security, performance, reliability, scalability, maintainability, compliance, and any project-specific categories
- Extract measurable thresholds from PRD, architecture, ADRs, epics, or stories
- Mark missing thresholds as **UNKNOWN** and convert them into clarification items or risks; do not guess values
- Define planned evidence sources for later validation (tests, scans, metrics, logs, monitoring, CI reports)
- Convert NFR gaps into the existing risk register using SEC / PERF / OPS / TECH / DATA categories

**Boundary:** This workflow plans NFR validation. It does not assess final PASS/CONCERNS/FAIL from implementation evidence. Use `nfr-assess` after implementation evidence exists.

---

## 4. Summarize Risk Findings

Summarize the highest risks and their mitigation priorities.

---

### 5. Save Progress

**Save this step's accumulated work to `{outputFile}`.**

- **If `{outputFile}` does not exist** (first save), create it with YAML frontmatter:

  ```yaml
  ---
  runScope: '{run_scope}'
  runKey: '{run_key}'
  workflowStatus: 'in-progress'
  totalSteps: 5
  stepsCompleted: ['step-03-risk-and-testability']
  lastStep: 'step-03-risk-and-testability'
  nextStep: '{nextStepFile}'
  lastSaved: '{date}'
  ---
  ```

  Then write this step's output below the frontmatter.

- **If `{outputFile}` already exists**, update:
  - Leave `runScope` and `runKey` exactly as step 1 wrote them
  - Set `workflowStatus: 'in-progress'`
  - Set `totalSteps: 5`
  - Add `'step-03-risk-and-testability'` to `stepsCompleted` array (only if not already present)
  - Set `lastStep: 'step-03-risk-and-testability'`
  - Set `nextStep: '{nextStepFile}'`
  - Set `lastSaved: '{date}'`
  - Append this step's output to the appropriate section of the document.

Load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Step completed in full with required outputs

### ❌ SYSTEM FAILURE:

- Skipped sequence steps or missing outputs
  **Master Rule:** Skipping steps is FORBIDDEN.
