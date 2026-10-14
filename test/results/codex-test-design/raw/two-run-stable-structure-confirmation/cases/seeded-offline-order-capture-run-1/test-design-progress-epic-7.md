---
runScope: 'epic'
runKey: 'epic-7'
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-10-14'
inputDocuments:
  - field-order-capture/_bmad/config.toml
  - field-order-capture/docs/epics/epic-7-offline-order-capture.md
  - bmod-tea/knowledge/tea-index.csv
  - bmod-tea/knowledge/risk-governance.md
  - bmod-tea/knowledge/probability-impact.md
  - bmod-tea/knowledge/test-levels-framework.md
  - bmod-tea/knowledge/test-priorities-matrix.md
  - bmod-tea/knowledge/nfr-criteria.md
---

# Epic 7 test design progress

## Step 1: Mode and prerequisites

- Mode: epic-level, Create; full design; sequential execution; capability probe disabled.
- Run identity: epic / epic-7; epic number 7.
- Requirements source: `field-order-capture/docs/epics/epic-7-offline-order-capture.md`, including stories 7.1 through 7.4 and acceptance criteria.
- Configuration: `field-order-capture/_bmad/config.toml`; English communication and document output; user tea-eval-harness; project field-service-platform.
- No PRD, architecture document, or sprint status is required for this run. The epic contains the available architecture context.
- No existing current or legacy checkpoint was found. This is a fresh run.
- Deliverable: `field-order-capture/test-artifacts/test-design/test-design-epic-7.md`.
- Inputs under `field-order-capture/docs/` remain read-only; test generation is outside this run.

## Step 2: Loaded context

- Optional TEA integration flags, Pact MCP, and browser automation are unset. No integration branch is enabled. `test_stack_type` defaults to auto.
- The repository contains the epic and configuration only, plus this checkpoint. No application manifests, implementation, existing tests, fixtures, CI, or prior system-level test designs were found. Existing test results and flakiness cannot be assessed.
- Detected stack: mobile, from the epic's explicit native Android context. Preserve the server/API boundary described in the epic; its implementation stack is unspecified.
- Deterministic knowledge selection, in order: risk-governance, probability-impact, test-levels-framework, test-priorities-matrix, nfr-criteria. The NFR branch matches explicit security, performance, reliability, and release-operation facts. No Pact branch matches. Browser exploration has no configured branch or target.
- AC1: offline save and visible captured state. AC2: editability until server acceptance. AC3: automatic reconnect upload. AC4: unchanged server order visible in dispatcher console.
- Boundaries: native client to SQLite, queued edits to sync worker, OS usable-network signal to upload, server order persistence to existing dispatcher console.
- Explicit NFR: up to 2,000 entries sync within 30 seconds on fleet mid-range devices.
- Known design gaps: plaintext full payload, arrival-order overwrite without history, unbounded immediate retries, globally enabled release with one-to-three-day store recovery.
- Scope facts: single-tenant isolated installations; regional routing unchanged; billing service and nightly charging untouched; dispatcher rendering unchanged. These facts exclude multi-tenant isolation, residency redesign, payment execution, and browser rendering risks from this epic plan.
- Inputs are sufficient for this run. Execution tooling and measurement profiles remain planning dependencies, recorded without soliciting input.

## Step 3: Risk and NFR assessment

System-level testability review does not apply to epic-level mode. The gap inventory has five distinct controls/targets: unencrypted sensitive local storage, missing concurrent-edit checks/history, unmeasured backlog deadline, unlimited immediate retries, and irreversible fleet-wide release. Each has one risk. Story acceptance criteria create coverage without residual risks.

### High-Priority Risks (Score ≥6)

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Timeline |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ---------- | ----- | -------- |
| R-001 | SEC | Plain SQLite file, full order payload, not encrypted at rest (7.1): card reference and billing address become readable if app-data storage is extracted; the screen lock is the only stated control. Extraction is possible; disclosure is critical. | 2 | 3 | 6 | Minimize sensitive queued fields and protect remaining data/key access; verify the file boundary. | Android lead and Security | Before release candidate approval |
| R-002 | DATA | No version check and no timestamp check; later arrival overwrites earlier lines with no record (7.2): two offline technicians lose work silently. Explicit destructive behavior is likely and loss is critical. | 3 | 3 | 9 | Define conflict semantics; preserve conflicting versions and history; reproduce both arrival orders. | Server lead and Product | Before release candidate approval |
| R-003 | PERF | 2,000 queued items within 30 seconds on mid-range fleet devices (7.3): the new full-day backlog deadline is unmeasured; high uncertainty makes a missed target likely and prolonged sync materially degrades dispatch. | 3 | 2 | 6 | Measure real-device backlog completion and optimize queue/server throughput; define device and network profiles before measurement. | Android lead and Performance QA | Before release candidate approval |
| R-004 | TECH | Retried immediately and indefinitely, no backoff, attempt cap, or dead-letter path (7.3): permanently rejected payloads cause sustained request storms and can consume client/server capacity. Behavior is explicit; core sync disruption is critical. | 3 | 3 | 9 | Separate permanent and transient failures; implement bounded backoff and a recoverable terminal path with continued valid-item progress. | Android lead and Server lead | Before release candidate approval |
| R-005 | OPS | Enabled for every technician, no feature flag, no staged rollout, no disable without store review taking one to three days (7.4): a bad release affects the fleet for days. Incident probability is possible; fleet-wide inability to recover is critical. | 2 | 3 | 6 | Establish a tested containment and recovery path; rehearse release failure and verify queued-data preservation. | Release lead and Product | Before release authorization |

### Medium-Priority Risks (Score 3-4)

No medium-priority risks identified.

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ---------- | ----- |

### Low-Priority Risks (Score 1-2)

No low-priority risks identified.

| Risk ID | Category | Description | Probability | Impact | Score | Action |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ------ |

- Scale: probability 1 unlikely, 2 possible, 3 likely; impact 1 minor, 2 degraded, 3 critical. Score is their product. Five high risks; two critical score-9 risks. All remain Open; mitigations are proposals.
- Security: local payload protection is absent; approved storage/key/retention thresholds are UNKNOWN. Planned evidence is synthetic canary inspection of SQLite and related persisted files.
- Performance: 2,000 entries / 30 seconds is explicit. Fleet models, supported Android versions, payload profile, usable-network latency/bandwidth, and concurrent reconnect count are UNKNOWN. Plan timestamped device and server completion evidence.
- Reliability/data integrity: conflict loss and unlimited retries are explicit. Conflict policy, retry delay/cap, quarantine recovery, and resource ceilings are UNKNOWN. Plan API arrival-order evidence and sync/queue fault-injection traces.
- Operations: one-to-three-day store recovery is explicit. Incident detection/containment targets are UNKNOWN. Plan release recovery rehearsal evidence.
- Maintainability, compliance standards, and broader server scalability have no specified thresholds. Track these as scope/measurement clarifications outside the five-risk register. No final NFR outcome is assessed.
- Mitigation priority: first prevent silent data loss and request storms; protect local sensitive payload; establish release recovery; benchmark the deadline before sign-off.

## Step 4: Coverage and execution plan

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |
| P0: Protect local queued payload (7.1) | Integration | R-001 | 3 | Android/Security QA | Plaintext disclosure first appears across the owned SQLite/file boundary. Inspect synthetic canaries after initial capture, queued edit, and server acceptance/retention cleanup. No storage-extraction protection is stated. |
| P0: Preserve concurrent technicians' work (7.2) | API | R-002 | 3 | Server QA | Arrival-order overwrite appears at one server's HTTP contract. A then B, B then A, and stale queued revision arriving after newer acceptance. Assert preservation and explicit conflict/history per approved mitigation; current design loses lines. Source offers no recovery. |
| P0: Bound failed upload work (7.3) | Integration | R-004 | 4 | Android QA | Immediate indefinite retries first appear at the sync worker/queue event boundary. Transient rejection followed by success; permanently invalid item followed by a valid one; lost acceptance response; server throttling. Assert approved bounds, continued progress, and safe durable disposition. No terminal recovery is described. |
| P0: Contain and recover a bad fleet release (7.4) | E2E | R-005 | 2 | Release QA | Global release and unavailable disablement span release delivery and installed app/backend behavior. Exercise incident containment and recovery with pending orders; exercise replacement-build rollout with queue preservation. Current recovery waits one to three days and no safe workaround is stated. |
| P0: Native offline capture to unchanged dispatcher order (AC1-4) | E2E | - | 2 | Mobile QA | Real-device journeys across client/server/dispatcher: save offline then reconnect; save and edit offline then reconnect. Check captured visibility, editability until acceptance, automatic upload, and exact submitted fields visible in existing console. |
| P1: Full backlog meets deadline (7.3) | E2E | R-003 | 3 | Performance QA | Deadline spans real Android device, OS network signal, uploader, and server acceptance. Measure 2,000 entries within 30 seconds for warm baseline, cold-start recovery, and representative large payload. This is a core sync delay; permanent loss or a critical business deadline is unstated. Retained backlog permits later upload, but bounded recovery time is UNKNOWN. |
| P1: Queue persistence and edit lifecycle (7.1-2, AC1-2) | Integration | - | 3 | Android QA | Owned SQLite boundary: successful save persists exact payload; successive edits append entries and latest editable state; failed local write preserves prior state and reports save failure. These verify acceptance behavior and its immediate persistence boundaries. |
| P1: OS reconnect and acceptance lifecycle (7.3, AC2-3) | Integration | - | 3 | Android QA | OS event/worker/queue boundary: usable-network event schedules upload without user action; repeat notifications keep queue consistent; disconnect before acceptance retains pending editable data until reconnect. |
| P2: Unchanged platform constraints (Context/out of scope) | Integration | - | 3 | Dev QA | Assert existing installation-local destination, unchanged regional routing delegation, and zero billing/charge invocation from capture/edit/sync. These are satisfied source constraints with regression checks. |

- Exactly one linked row for each of five scored risks. AC-only and scope-constraint rows use `-`. No ungrounded residual risk was added.
- Priority criteria: P0 critical security/data/core fleet operation with no safe workaround; P1 frequent/core material degradation; P2 narrower secondary unchanged-constraint regression; P3 rare/cosmetic easy-workaround behavior. P3 is empty because rendering changes and cosmetic enhancements are outside the epic.
- Totals: P0 14, P1 9, P2 3, P3 0; total 26 planned scenarios. Each row's notes define its atomic scenarios.
- NFR evidence: persisted-file canary reports for security; server payload/history traces for integrity; timestamped queue/retry traces for reliability; device/network profile and per-entry acceptance ledger for performance; incident/replacement-build rehearsal for operations. Unknown policy targets are prerequisites for measuring mitigation success.
- Execution: functional Unit/Integration/API and short native E2E checks on every PR with a measured target below 15 minutes; costly device/backlog, lifecycle fault, and recovery work nightly; representative fleet profiling and release recovery rehearsal weekly and before release. Sequential workflow execution is retained. Native instrumentation/device tools are to be selected from actual implementation; browser-only tooling cannot drive the Android client.
- Estimates: P0 35 to 55 hours, P1 22 to 36 hours, P2 4 to 8 hours, P3 0 hours; total 61 to 99 hours, approximately 8 to 13 eight-hour person-days. These are test-development planning intervals; feature remediation and device provisioning are additional dependencies.
- Planned gates: P0 100%, P1 at least 95%, P2/P3 at least 90% informational, at least 80% agreed critical-path coverage, 100% security scenario coverage and completed high-risk mitigations. Exact 30-second backlog threshold remains mandatory. Final NFR assessment awaits execution evidence.

## Step 5: Output and validation

- Requested and resolved execution mode: sequential. Capability probing: false. No worker or browser session was launched.
- Wrote `field-order-capture/test-artifacts/test-design/test-design-epic-7.md` from `skill/test-design-template.md`; epic number and run identity remain 7 / epic-7.
- Read and applied `skill/checklist.md`. Epic-level requirements, all template sections, scope exclusions, entry/exit criteria, role responsibilities, NFR planning, execution lanes, range estimates, mitigations, dependencies, approvals, and interworking/regression are populated.
- System-level prerequisites, two-document validation, handoff generation, Playwright parallelization, and sprint/status-file changes are N/A for this native Android epic-only run. Team sign-off remains pending and is recorded as a draft approval condition.
- Automated document checks passed: matching table cell counts; five unique canonical risk IDs; bare numeric scores equal probability times impact; correct score bands; one risk-linked coverage row per risk; canonical levels; 26 scenarios with P0 14 / P1 9 / P2 3 / P3 0; local links resolve; no unresolved placeholders or clause-connector dashes.
- Effort intervals reconcile to 61 to 99 hours, approximately 8 to 13 eight-hour person-days or 1.5 to 3 working weeks for one contributor with ready dependencies.
- Polished prose with the de-ai checks while retaining the supplied template structure. Residual risk is explicitly Open until evidenced mitigation and rescoring. No final execution gate or NFR outcome is asserted.
- The P0 allocation follows the concrete security, irreversible loss, uncontrolled retries, fleet recovery, and critical order-journey consequences in this epic. The checklist's general P0 percentage heuristic does not override these consequence-based criteria.
- Completion summary: epic-level draft design; key blockers R-002 and R-004 score 9; all five risks require verified mitigation; proposed gates require P0 100%, P1 at least 95%, and all 2,000 entries accepted within 30 seconds on agreed real-device profiles.
- Open decisions: storage/key/retention policy, conflict semantics, retry bounds/disposition, fleet/network/payload profiles, and recovery targets. These are assigned dependencies; the run requested no questions.
- No requirement file under `field-order-capture/docs/` was changed; no tests were generated. The project inventory contains its original epic/config plus the one design deliverable and this required checkpoint.
- Optional completion-hook resolution follows the workflow's final command; a failed or empty resolver is skipped as instructed.
