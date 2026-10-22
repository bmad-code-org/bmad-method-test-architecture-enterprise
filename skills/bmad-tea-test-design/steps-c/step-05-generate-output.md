---
name: 'step-05-generate-output'
description: 'Generate output documents with adaptive orchestration (agent-team, subagent, or sequential)'
outputFile: '{test_artifacts}/test-design/test-design-epic-{epic_num}.md'
progressFile: '{test_artifacts}/test-design/test-design-progress-{run_key}.md'
---

# Step 5: Generate Outputs & Validate

## STEP GOAL

Write the final test-design document(s) using the correct template(s), polish them under the Editorial Contract, then validate the saved outputs against the checklist.

## MANDATORY EXECUTION RULES

- 📖 Read the entire step file before acting
- ✅ Speak in `{communication_language}`
- ✅ Use the provided templates and output paths
- ✅ Resolve execution mode from explicit user request first, then config
- ✅ Apply fallback rules deterministically when requested mode is unsupported

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

## 0. Resolve Execution Mode (User Override First)

```javascript
const parseBooleanFlag = (value, defaultValue = true) => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['false', '0', 'off', 'no'].includes(normalized)) return false;
    if (['true', '1', 'on', 'yes'].includes(normalized)) return true;
  }
  if (value === undefined || value === null) return defaultValue;
  return Boolean(value);
};

const orchestrationContext = {
  config: {
    execution_mode: config.tea_execution_mode || 'auto', // "auto" | "subagent" | "agent-team" | "sequential"
    capability_probe: parseBooleanFlag(config.tea_capability_probe, true), // supports booleans and "false"/"true" strings
  },
  timestamp: new Date().toISOString().replace(/[:.]/g, '-'),
};

const normalizeUserExecutionMode = (mode) => {
  if (typeof mode !== 'string') return null;
  const normalized = mode.trim().toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ');

  if (normalized === 'auto') return 'auto';
  if (normalized === 'sequential') return 'sequential';
  if (normalized === 'subagent' || normalized === 'sub agent' || normalized === 'subagents' || normalized === 'sub agents') {
    return 'subagent';
  }
  if (normalized === 'agent team' || normalized === 'agent teams' || normalized === 'agentteam') {
    return 'agent-team';
  }

  return null;
};

const normalizeConfigExecutionMode = (mode) => {
  if (mode === 'subagent') return 'subagent';
  if (mode === 'auto' || mode === 'sequential' || mode === 'subagent' || mode === 'agent-team') {
    return mode;
  }
  return null;
};

// Explicit user instruction in the active run takes priority over config.
const explicitModeFromUser = normalizeUserExecutionMode(runtime.getExplicitExecutionModeHint?.() || null);

const requestedMode = explicitModeFromUser || normalizeConfigExecutionMode(orchestrationContext.config.execution_mode) || 'auto';
const probeEnabled = orchestrationContext.config.capability_probe;

const supports = { subagent: false, agentTeam: false };
if (probeEnabled) {
  supports.subagent = runtime.canLaunchSubagents?.() === true;
  supports.agentTeam = runtime.canLaunchAgentTeams?.() === true;
}

let resolvedMode = requestedMode;
if (requestedMode === 'auto') {
  if (supports.agentTeam) resolvedMode = 'agent-team';
  else if (supports.subagent) resolvedMode = 'subagent';
  else resolvedMode = 'sequential';
} else if (probeEnabled && requestedMode === 'agent-team' && !supports.agentTeam) {
  resolvedMode = supports.subagent ? 'subagent' : 'sequential';
} else if (probeEnabled && requestedMode === 'subagent' && !supports.subagent) {
  resolvedMode = 'sequential';
}
```

Resolution precedence:

1. Explicit user request in this run (`agent team` => `agent-team`; `subagent` => `subagent`; `sequential`; `auto`)
2. `tea_execution_mode` from config
3. Runtime capability fallback (when probing enabled)

## 1. Select Output Template(s)

### System-Level Mode (Phase 3)

Generate **two** documents:

- `{test_artifacts}/test-design/test-design-architecture.md` using `test-design-architecture-template.md`
- `{test_artifacts}/test-design/test-design-qa.md` using `test-design-qa-template.md`

If `resolvedMode` is `agent-team` or `subagent`, these two documents can be generated in parallel as independent workers, then reconciled for consistency.

### Epic-Level Mode (Phase 4)

Generate **one** document:

- `{outputFile}` using `test-design-template.md`
- Use the `epic_num` resolved in step 1. It is the value that named this run's progress checkpoint, so the plan and its checkpoint always identify the same run. Do not re-derive it and do not ask the user again.

Epic-level mode remains single-worker by default (one output artifact).

---

## Editorial Contract

This contract governs the wording of every Create-mode output: the epic document, both system-level documents, and the handoff. Apply it while populating templates in section 2, and again as the final cleanup in section 4. It needs no separate prompt or extra pass from the user.

It edits prose only. Scope, risk scores, priorities, coverage, risk acceptance, and release criteria keep the values steps 3 and 4 decided. When editing exposes a substantive defect, such as a missing scenario, a wrong score, or an unmapped risk, return to the step that owns that decision, fix it there, and carry the fix forward. Never repair it as a wording change.

When rules conflict, resolve them in this order: technical correctness and evidence, then the template and parser contracts, then reviewer comprehension, then style.

### Writing Rules

- Replace filler with a concrete statement, or delete it when no information is lost.
- State the actor, action, condition, and expected result whenever the sources provide them. When a needed detail is missing, keep the gap visible as `UNKNOWN`, an open assumption, or a clarification item, and leave it unfilled.
- Use one name per concept. Keep the exact repository names and domain terms the sources use.
- Put prerequisites, conditions, and warnings before the action they govern.
- Split an instruction that combines several actions or conditions into separate steps. Keep complete sentences and the context a reader needs; a shorter sentence that loses a condition is a defect.
- Keep rationale, scenario references, and execution instructions in the template sections that already hold them.
- Remove promotional claims and vague attribution such as "industry best practice says". Keep citations, and make clear which statements are observed facts, planned checks, assumptions, or unknowns.
- Write planned verification as planned. A test that has not run never reads as run, verified, or passing.

### Protected Content

Keep these exact, in meaning and in text, through every edit:

- Requirement, risk, and test IDs; requirement-to-test mappings; source links and evidence references; explicit exclusions.
- Risk category, probability, impact, score, owner, mitigation, and timeline decisions.
- Test levels and priorities; preconditions, test data, sequence, assertions, negative cases, cleanup, and dependencies.
- Thresholds, units, comparison operators, timeouts, retry counts, quantifiers, and negations.
- Assumptions, unknowns, confidence statements, unverified behavior, unresolved owners, and missing acceptance criteria.
- Literal commands, paths, symbols, code, regular expressions, payloads, Unicode test data, and expected strings.
- Required filenames, headings, table headers, status values, and handoff keys.

Downstream scoring reads the documents by structure, so structure is protected too:

- Priority section headings open with `P0`, `P1`, `P2`, or `P3`. Keep that opening when rewording a heading.
- Risk-band headings state their score range, for example `(Score ≥6)`. Keep the range.
- A heading that opens or ends with Example or Illustration, a heading that ends with Reference, and a paragraph that opens `Example:`, `Worked example:`, or `Illustration:` mark the tables after them as reference material, and scoring skips them. Never place a scored risk table or coverage table under such a label, and never add such a label above one.
- Scoring also skips every table inside a blockquote. Keep scored risk and coverage tables out of blockquotes and callouts.
- Keep the canonical risk and coverage column names from the templates.

This contract sets no banned-word or punctuation list. Terms such as test harness and test vector can be exact technical language. A reusable safety requirement stays even when it also applies to other projects. Keep uncertainty wherever the sources are uncertain. Keep every required document; the system-level pair stays two documents.

---

## 2. Populate Templates

Write each output with the Editorial Contract applied from the start.

Ensure the outputs include:

- Risk assessment matrix
- NFR planning summary (thresholds, missing thresholds, planned evidence, and NFR-derived risks) — when NFRs are in scope
- Coverage matrix and priorities
- NFR coverage and planned evidence mapping — when NFRs are in scope
- Execution strategy
- Resource estimates (ranges)
- Quality gate criteria
- Any mode-specific sections required by the template

---

## 3. Generate BMAD Handoff Document (System-Level Mode Only)

**If this is a system-level test design** (not component/feature level):

1. Copy `test-design-handoff-template.md` to `{test_artifacts}/test-design/{project_name}-handoff.md`
2. Populate all sections from the test design output:
   - Fill TEA Artifacts Inventory with actual paths
   - Extract P0/P1 risks into Epic-Level guidance
   - Map critical test scenarios to Story-Level guidance
   - Build risk-to-story mapping table from risk register
3. Save alongside the test design document

> **Note**: The handoff document is designed for consumption by BMAD's `create-epics-and-stories` workflow. It is only generated for system-level test designs where epic/story decomposition is relevant.

---

## 4. Polish Output

Review every output saved so far, including the handoff in system-level mode, and finish all edits before section 5:

1. **Apply the Editorial Contract**: Make the final wording pass. Compare each edited passage with its draft and confirm the Protected Content is unchanged.
2. **Remove duplication**: Progressive-append workflow may have created repeated sections — consolidate
3. **Verify consistency**: Ensure terminology, risk scores, and references are consistent throughout, and that the handoff carries the same risk IDs, scores, and priorities as the test design
4. **Check completeness**: All template sections should be populated or explicitly marked N/A
5. **Table schema**: Preserve the canonical risk and coverage column names from the templates. Verify every scored risk has one unique `R-<three digits>` ID, every coverage link preserves that exact ID, and every risk-band heading states its score range. Probability, Impact, and Score cells contain only bare integers; explain each judgment in prose and verify Score equals Probability × Impact. Empty bands contain no risk rows; describe the absence in prose outside the table. Keep each risk description readable and traceable to its source.
6. **Format cleanup**: Ensure markdown formatting is clean (tables aligned, headers consistent, no orphaned references)

---

## 5. Validate Final Outputs

Validate after the last edit to every output. Read the saved files from disk: the epic document in epic-level mode, or both system-level documents and the handoff in system-level mode.

Validate the output(s) against:

- `checklist.md` in this workflow folder
- [ ] CLI sessions cleaned up (no orphaned browsers)
- [ ] Temp artifacts stored under `{test_artifacts}/test-design/`

If any checklist criteria are missing, fix before completion. A fix that changes a saved output reopens validation for the content it touched: rerun the risk, coverage, and cross-document checks after a risk or coverage change, the handoff checks after a handoff change, and the Document Quality checks after any wording change. Completion waits until the last rerun passes with no further edits.

---

## 6. Completion Report

Summarize:

- Mode used
- Output file paths
- Key risks and gate thresholds
- Any open assumptions

---

### 7. Save Progress

**Save this step's accumulated work to `{progressFile}`.**

- **If `{progressFile}` does not exist** (first save), create it with YAML frontmatter:

  ```yaml
  ---
  runScope: '{run_scope}'
  runKey: '{run_key}'
  workflowStatus: 'completed'
  totalSteps: 5
  stepsCompleted: ['step-05-generate-output']
  lastStep: 'step-05-generate-output'
  nextStep: ''
  lastSaved: '{date}'
  ---
  ```

  Then write this step's output below the frontmatter.

- **If `{progressFile}` already exists**, update:
  - Leave `runScope` and `runKey` exactly as step 1 wrote them
  - Set `workflowStatus: 'completed'`
  - Set `totalSteps: 5`
  - Add `'step-05-generate-output'` to `stepsCompleted` array (only if not already present)
  - Set `lastStep: 'step-05-generate-output'`
  - Set `nextStep: ''`
  - Set `lastSaved: '{date}'`
  - Append this step's output to the appropriate section of the document.

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
