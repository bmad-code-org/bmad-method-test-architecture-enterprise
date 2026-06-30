---
title: BMAD-TEA Epics Handoff - TEA Gate Contracts For BMAD V2 Workflow
status: handoff
created: "2026-06-30"
updated: "2026-06-30"
source_parent_epics: ../../../_bmad-output/planning-artifacts/epics-bmad-tea-workflow-orchestration-2026-06-29/epics.md
---

# BMAD-TEA Epics: TEA Gate Contracts For BMAD V2 Workflow

## Overview

This file contains the BMAD-TEA-owned subset of the parent BMAD TEA v2 workflow orchestration epics.
It is local planning input for implementation inside `BMAD-TEA`.
It excludes Archon DAG work and BMAD-METHOD review work except where dependency notes are required.
No BMAD-TEA story may require traversal out of `BMAD-TEA` to read parent workspace planning files during implementation.

## Epic T1: Test Automation Evidence For Gate Planning

BMAD-TEA exposes structured automation evidence for Archon's gate planner.

### Story T1.1: Emit Structured TA Evidence

As a test architect,
I want `TA` to emit structured evidence pointers,
So that Archon can plan release gates without parsing TEA markdown reports.

**Requirements Covered:** T-FR-1.

Depends on: existing TEA automation behavior.
Contract needed: TA evidence shape or pointer consumed by Archon `gate-planner`.
Blocking behavior: Archon Story A3.1 cannot complete until gate-planner can read TA evidence without markdown parsing.
Integration validation: A fixture proves gate-planner can read changed-test evidence, quality concerns, and NFR signals from structured TA output.

**Acceptance Criteria:**

**Given** `TA` runs
**When** automation evidence is written
**Then** structured evidence identifies changed tests, quality concerns, and NFR signals
**And** Archon does not need to parse markdown prose.

**Given** evidence is missing or invalid
**When** a consumer validates it
**Then** the result can be treated as `ERROR`.

## Epic T2: RV Test Quality Gate

BMAD-TEA provides a conditional test quality and reliability gate.

### Story T2.1: Emit RV Gate Contract

As a test architect,
I want `RV` to emit a test quality gate contract,
So that weak or unreliable tests can route back to development through Archon's single loop.

**Requirements Covered:** T-FR-2.

Depends on: Story T1.1 and Archon Story A3.1.
Contract needed: `tea-rv.gate.json`.
Blocking behavior: Archon Story A3.2 cannot complete until RV emits a contract with quality score, finding counts, and report pointer.
Integration validation: Fixtures prove RV PASS, FAIL, and ERROR outcomes.

**Acceptance Criteria:**

**Given** RV runs
**When** its contract is emitted
**Then** it includes `quality_score`, `findings_count`, `blocking_findings_count`, and `report_file`.

**Given** weak tests, flaky behavior, unreliable fixtures, timing-sensitive behavior, or weak assertions exist
**When** RV emits its contract
**Then** blocking findings produce `FAIL`.

### Story T2.2: Validate RV Skipped Contract Compatibility

As a test architect,
I want the RV skipped contract shape to be validated,
So that an intentional RV skip is not confused with missing evidence.

**Requirements Covered:** T-FR-3.

Depends on: Archon Story A3.2.
Contract needed: `tea-rv-skipped.gate.json`.
Blocking behavior: Archon summary cannot treat RV as resolved until the skipped contract shape is accepted.
Integration validation: A fixture proves `tea-rv-skipped.gate.json` is accepted as `SKIPPED`.

**Acceptance Criteria:**

**Given** RV is intentionally skipped
**When** the skipped contract is validated
**Then** it includes story identity, node, round, `gate: SKIPPED`, and reason
**And** downstream consumers distinguish it from missing evidence.

## Epic T3: NR NFR Evidence Gate

BMAD-TEA provides a conditional NFR evidence gate.

### Story T3.1: Emit NR Gate Contract

As a test architect,
I want `NR` to emit an NFR evidence gate contract,
So that missing NFR evidence can route back to development through Archon's single loop.

**Requirements Covered:** T-FR-4.

Depends on: Story T1.1 and Archon Story A3.1.
Contract needed: `tea-nr.gate.json`.
Blocking behavior: Archon Story A3.2 cannot complete until NR emits a contract with NFR categories, finding counts, and report pointer.
Integration validation: Fixtures prove NR PASS, FAIL, and ERROR outcomes.

**Acceptance Criteria:**

**Given** NR runs
**When** its contract is emitted
**Then** it includes `nfr_categories`, `findings_count`, `blocking_findings_count`, and `report_file`.

**Given** missing security, reliability, performance, observability, data integrity, or integration evidence exists
**When** NR emits its contract
**Then** blocking findings produce `FAIL`.

### Story T3.2: Validate NR Skipped Contract Compatibility

As a test architect,
I want the NR skipped contract shape to be validated,
So that an intentional NR skip is not confused with missing evidence.

**Requirements Covered:** T-FR-5.

Depends on: Archon Story A3.2.
Contract needed: `tea-nr-skipped.gate.json`.
Blocking behavior: Archon summary cannot treat NR as resolved until the skipped contract shape is accepted.
Integration validation: A fixture proves `tea-nr-skipped.gate.json` is accepted as `SKIPPED`.

**Acceptance Criteria:**

**Given** NR is intentionally skipped
**When** the skipped contract is validated
**Then** it includes story identity, node, round, `gate: SKIPPED`, and reason
**And** downstream consumers distinguish it from missing evidence.

## Epic T4: TR Final Traceability Gate

BMAD-TEA provides the final traceability gate after resolved RV and NR branches.

### Story T4.1: Emit TR Traceability Contract

As a test architect,
I want `TR` to emit a final traceability contract,
So that trace gaps are visible before PR preparation.

**Requirements Covered:** T-FR-6.

Depends on: Stories T2.1, T2.2, T3.1, T3.2, and Archon Story A3.3.
Contract needed: `tea-tr.gate.json`.
Blocking behavior: Archon Story A4.1 cannot complete until TR emits traceability status and evidence pointers.
Integration validation: Fixtures prove TR PASS, FAIL, story mismatch ERROR, and invalid evidence ERROR.

**Acceptance Criteria:**

**Given** TR runs
**When** its contract is emitted
**Then** it includes `coverage_gaps_count`, `findings_count`, `blocking_findings_count`, `trace_file`, and `report_file`.

**Given** traceability gaps exist
**When** TR emits its contract
**Then** blocking gaps produce `FAIL`.

**Given** `story_ref` mismatches
**When** TR validates inputs
**Then** the result is `ERROR`.

### Story T4.2: Validate TR Skipped Contract Compatibility

As a test architect,
I want the TR skipped contract shape to be validated,
So that a blocked release-gate evaluation can still produce a resolved TR role contract.

**Requirements Covered:** T-FR-7.

Depends on: Archon Story A3.3.
Contract needed: `tea-tr-skipped.gate.json`.
Blocking behavior: Archon summary cannot treat TR as resolved until the skipped contract shape is accepted.
Integration validation: A fixture proves `tea-tr-skipped.gate.json` is accepted as `SKIPPED`.

**Acceptance Criteria:**

**Given** TR is intentionally skipped
**When** the skipped contract is validated
**Then** it includes story identity, node, round, `gate: SKIPPED`, and reason
**And** downstream summary distinguishes it from missing evidence.

## Epic T5: TEA Contract Validation

BMAD-TEA proves route-facing gate contracts are stable and compatible with Archon.

### Story T5.1: Add TEA Gate Contract Fixtures

As a test architect,
I want deterministic fixtures for TEA gate contracts,
So that Archon can trust TEA route-facing outputs.

**Requirements Covered:** T-FR-8.

Depends on: Stories T1.1 through T4.2.
Contract needed: Fixtures for RV, NR, TR, skipped contracts, and ERROR cases.
Blocking behavior: Archon vertical slice cannot be marked complete until TEA fixtures validate.
Integration validation: Archon summary fixtures consume real and skipped TEA contracts.

**Acceptance Criteria:**

**Given** passing RV, NR, and TR fixtures run
**When** contracts are emitted
**Then** each gate is `PASS`.

**Given** blocking findings exist
**When** RV, NR, or TR emits a contract
**Then** the relevant gate is `FAIL`.

**Given** skipped contract fixtures run
**When** downstream consumers validate them
**Then** they are accepted as `SKIPPED`.

**Given** invalid evidence or untrusted output exists
**When** validation runs
**Then** the result is `ERROR`.
