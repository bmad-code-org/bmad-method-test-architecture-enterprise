---
title: BMAD-TEA PRD Handoff - TEA Gate Contracts For BMAD V2 Workflow
status: handoff
created: "2026-06-30"
updated: "2026-06-30"
source_parent_prd: ../../../_bmad-output/planning-artifacts/prds/prd-workflow-engine-2026-06-29/prd.md
source_parent_epics: ../../../_bmad-output/planning-artifacts/epics-bmad-tea-workflow-orchestration-2026-06-29/epics.md
---

# BMAD-TEA PRD Handoff: TEA Gate Contracts For BMAD V2 Workflow

## Document Purpose

This document is the local BMAD-TEA product requirements handoff for the BMAD TEA v2 workflow orchestration feature.
It contains only BMAD-TEA-owned requirements needed for isolated implementation inside this repository.
It is intended to be read with `architecture.md` and `epics.md` in this same folder.
Implementation agents must not traverse out of this repository to read parent workspace planning files.

## Product Context

The v2 Archon workflow needs BMAD-TEA to provide structured evidence and release-gate contracts.
TEA must preserve ownership of test automation evidence, test quality review, NFR review, and traceability review.
Archon owns orchestration and route decisions.
BMAD-TEA owns the semantics and reports behind `TA`, `RV`, `NR`, and `TR`.

The current correction is that `RV -> NR -> TR` must not be a blind hard chain.
`RV` and `NR` are conditional sibling gates.
`TR` is the final traceability gate after resolved `RV` and `NR` branches.
When Archon skips an optional gate, the skipped contract must be distinguishable from a missing or failed gate.

## Scope

BMAD-TEA owns these capabilities:

- Emit structured test automation evidence from `TA` that Archon `gate-planner` can read.
- Provide `RV` test quality and reliability review semantics.
- Provide `NR` NFR evidence review semantics.
- Provide `TR` final traceability review semantics.
- Emit JSON gate contracts for `RV`, `NR`, and `TR`.
- Define skipped-contract compatibility for optional TEA branches.
- Link each machine-readable contract to human-readable TEA reports.
- Validate PASS, FAIL, SKIPPED, and ERROR outcomes through fixtures.

BMAD-TEA does not own these capabilities:

- Archon DAG conditions, `when:` expressions, `route_loop`, or PR handoff orchestration.
- BMAD-METHOD code review triage or `bmad-code-review-auto`.
- Linear issue creation or BMAD artifact sync.
- Hermes callback behavior or Hermes-specific contract fields.

## Functional Requirements

### T-FR-1: Emit Structured Test Automation Evidence

TEA automation must produce structured evidence pointers that Archon can use for release-gate planning.
The evidence must not require Archon to parse markdown prose.

Acceptance criteria:

- Given `TA` runs, when test automation evidence is written, then Archon can locate structured evidence for changed tests, coverage-related evidence, quality concerns, and NFR signals.
- Given automation evidence is missing or invalid, when Archon consumes the evidence, then the workflow can fail closed with `ERROR`.
- Given human reports exist, when route decisions run, then Archon does not need to parse markdown reports for branch flags.

### T-FR-2: Emit RV Test Quality Gate Contract

BMAD-TEA must provide `RV` as a test quality and reliability review, not a coverage decision.
When `RV` runs, it emits `tea-rv.gate.json`.

Acceptance criteria:

- Given `RV` runs, when its contract is emitted, then it includes `contract_version`, `workflow`, `story_ref`, `node`, `round`, `gate`, `quality_score`, `findings_count`, `blocking_findings_count`, and `report_file`.
- Given weak tests, flaky behavior, unreliable fixtures, timing-sensitive behavior, or weak assertions exist, when RV emits its contract, then blocking findings produce `FAIL`.
- Given RV execution fails, evidence is invalid, or output is untrusted, when the contract is validated, then the result is `ERROR`.

### T-FR-3: Support RV Skipped Contract Shape

BMAD-TEA must define the shape expected when Archon intentionally skips RV.
The skipped contract must be compatible with downstream summary and traceability joins.

Acceptance criteria:

- Given `run_rv` is false, when Archon emits `tea-rv-skipped.gate.json`, then BMAD-TEA's expected skipped shape includes `contract_version`, `workflow`, `story_ref`, `node`, `round`, `gate: SKIPPED`, and skip reason.
- Given downstream TEA or summary logic reads the skipped contract, when it validates the artifact, then it distinguishes intentional skip from missing evidence.

### T-FR-4: Emit NR NFR Evidence Gate Contract

BMAD-TEA must provide `NR` as an NFR evidence review.
When `NR` runs, it emits `tea-nr.gate.json`.

Acceptance criteria:

- Given `NR` runs, when its contract is emitted, then it includes `contract_version`, `workflow`, `story_ref`, `node`, `round`, `gate`, `nfr_categories`, `findings_count`, `blocking_findings_count`, and `report_file`.
- Given missing security, reliability, performance, observability, data integrity, or integration evidence exists, when NR emits its contract, then blocking findings produce `FAIL`.
- Given NR execution fails, evidence is invalid, or output is untrusted, when the contract is validated, then the result is `ERROR`.

### T-FR-5: Support NR Skipped Contract Shape

BMAD-TEA must define the shape expected when Archon intentionally skips NR.
The skipped contract must be compatible with downstream summary and traceability joins.

Acceptance criteria:

- Given `run_nr` is false, when Archon emits `tea-nr-skipped.gate.json`, then BMAD-TEA's expected skipped shape includes `contract_version`, `workflow`, `story_ref`, `node`, `round`, `gate: SKIPPED`, and skip reason.
- Given downstream TEA or summary logic reads the skipped contract, when it validates the artifact, then it distinguishes intentional skip from missing evidence.

### T-FR-6: Emit TR Traceability Gate Contract

BMAD-TEA must provide `TR` as the final traceability gate.
When `TR` runs, it emits `tea-tr.gate.json`.
TR must evaluate traceability across story requirements, test design, automation evidence, and implementation evidence.

Acceptance criteria:

- Given `TR` runs, when its contract is emitted, then it includes `contract_version`, `workflow`, `story_ref`, `node`, `round`, `gate`, `coverage_gaps_count`, `findings_count`, `blocking_findings_count`, `trace_file`, and `report_file`.
- Given traceability gaps exist, when TR emits its contract, then blocking gaps produce `FAIL`.
- Given TR execution fails, evidence is invalid, `story_ref` mismatches, or output is untrusted, when the contract is validated, then the result is `ERROR`.

### T-FR-7: Support TR Skipped Contract Shape

BMAD-TEA must define the shape expected when Archon intentionally skips TR because release-gate evaluation is already blocked.

Acceptance criteria:

- Given `run_tr` is false, when Archon emits `tea-tr-skipped.gate.json`, then BMAD-TEA's expected skipped shape includes `contract_version`, `workflow`, `story_ref`, `node`, `round`, `gate: SKIPPED`, and skip reason.
- Given summary reads a skipped TR contract, when it validates the artifact, then it distinguishes intentional skip from missing evidence.

### T-FR-8: Validate TEA Gate Outcomes

BMAD-TEA must provide fixtures or deterministic tests for TEA gate PASS, FAIL, SKIPPED compatibility, and ERROR outcomes.

Acceptance criteria:

- Given RV, NR, and TR passing fixtures run, when contracts are emitted, then each gate is `PASS`.
- Given blocking findings exist, when RV, NR, or TR emits a contract, then the relevant gate is `FAIL`.
- Given skipped-contract fixtures are validated, when downstream consumers read them, then they are accepted as `SKIPPED`.
- Given invalid evidence or untrusted output exists, when validation runs, then the result is `ERROR`.

## Non-Functional Requirements

- TEA contract output must be stable enough for Archon routing.
- Human-readable TEA reports may evolve without breaking JSON consumers.
- TEA gates must preserve risk-based testing semantics.
- RV must not become a coverage decision.
- NR must run only for NFR risk or evidence signals.
- TR must remain the final traceability gate when release-gate evaluation proceeds.
- Invalid or untrusted evidence must fail closed as `ERROR`.
