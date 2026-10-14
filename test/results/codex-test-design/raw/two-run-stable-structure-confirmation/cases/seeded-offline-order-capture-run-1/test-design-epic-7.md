---
runScope: 'epic'
runKey: 'epic-7'
mode: 'epic-level'
designLevel: 'full'
executionMode: 'sequential'
capabilityProbe: false
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

# Test Design: Epic 7: Offline order capture for field technicians

**Date:** 2026-10-14
**Author:** tea-eval-harness
**Status:** Draft

## Executive Summary

**Scope:** Full epic-level test design for Epic 7, stories 7.1 through 7.4, in field-service-platform.
The sole requirements source is [Epic 7](../../docs/epics/epic-7-offline-order-capture.md).
The client is native Android; its boundaries are SQLite persistence, OS connectivity events, the order server, and the existing dispatcher console.

**Risk Summary:**

- Total risks identified: 5.
- High-priority risks (≥6): 5; two score 9.
- Critical categories: SEC, DATA, PERF, TECH, OPS.
- Current risk status: all Open. Storage protection, conflict handling, bounded retries, and release containment require decisions and mitigation verification.

**Coverage Summary:**

- P0 scenarios: 14; approximately 35 to 55 hours.
- P1 scenarios: 9; approximately 22 to 36 hours.
- P2/P3 scenarios: 3; approximately 4 to 8 hours.
- Total: 26 planned scenarios; approximately 61 to 99 hours, or 8 to 13 eight-hour person-days.

The repository contains requirements and configuration; implementation, tests, fixtures, and execution results are unavailable.
This document plans validation and records proposed release conditions.
Test generation and final NFR assessment are separate workflows.

## Not in Scope

| Item | Reasoning | Mitigation |
| ---- | --------- | ---------- |
| Offline capture of other entities | The epic limits offline capture to work orders. | Keep capture fixtures and acceptance checks restricted to work orders; other entities retain their existing regression coverage when available. |
| Browser rendering and dispatcher console changes | The Android client has no browser or web view; the epic changes neither order rendering nor the console. | Validate the existing console's unchanged order fields in the cross-system journey. Use native Android automation for the technician app. |
| Multi-tenant data isolation | Each installation has its own database and servers; storage is explicitly unshared. | Assert sync uses the configured installation-local destination. Retain platform isolation regression coverage without adding a shared-tenant risk. |
| Residency policy or regional routing redesign | Residency is unchanged and enforced by an untouched platform routing layer. | Assert the existing regional-routing delegation is preserved; platform routing tests remain the broader control. |
| Card charging and billing schedule | The epic neither touches nor calls the billing service and leaves nightly charging unchanged. | Assert capture/edit/sync makes no billing or charge invocation. Existing billing regression remains the owner of charging behavior. The stored card reference and address in the local queue are covered by R-001. |
| Implementation changes and generated tests | This run produces a test design. | Hand the scenarios and blockers to Dev and QA for separate implementation and automation work. |

## Risk Assessment

The gap inventory consists of five separate statements: unprotected sensitive local storage, destructive arrival-order editing, an unmeasured backlog target, unlimited immediate retries, and fleet-wide release without rapid reversal.
Each statement has one canonical risk.
Acceptance criteria and satisfied scope constraints have additional coverage rows.

Probability uses 1 = unlikely, 2 = possible, 3 = likely or high uncertainty.
Impact uses 1 = minor, 2 = degraded operation, 3 = critical loss, disclosure, or blocked essential operation.
Score = Probability × Impact. Scores ≥6 require mitigation; an open score-9 risk blocks the proposed release conditions.
Test priority is assigned from business consequence, reach, and available recovery.

### High-Priority Risks (Score ≥6)

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Timeline |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ---------- | ----- | -------- |
| R-001 | SEC | Plain SQLite file; full order payload; not encrypted at rest; device screen lock is the only protection (Epic 7, story 7.1). Extracting app-data storage exposes the customer's stored card reference and billing address. Extraction is possible and disclosure is critical. | 2 | 3 | 6 | Minimize sensitive queued fields, protect remaining persisted data and key access, and verify synthetic canaries across the file boundary. | Android lead and Security | Before release candidate approval |
| R-002 | DATA | No version check and no timestamp check; later arrival overwrites earlier lines with no record (Epic 7, story 7.2). Two offline technicians can silently lose parts and labour edits. The source describes destructive behavior directly; loss is critical. | 3 | 3 | 9 | Define conflict semantics, preserve competing revisions/history, and verify both arrival orders and stale delivery. | Server lead and Product | Before release candidate approval |
| R-003 | PERF | 2,000 queued items must finish syncing within 30 seconds on fleet mid-range devices (Epic 7, story 7.3). This new full-day backlog target has no supplied measurement evidence. High uncertainty makes a missed target likely; delayed dispatch materially degrades the core journey. | 3 | 2 | 6 | Establish representative device, payload, and network profiles; measure full server acceptance and tune queue/server throughput. | Android lead and Performance QA | Before release candidate approval |
| R-004 | TECH | Retried immediately and indefinitely; no backoff, attempt cap, or dead-letter path (Epic 7, story 7.3). Permanently rejected payloads repeatedly consume network and client/server capacity, threatening essential sync operation. The retry loop is explicit and sustained disruption is critical. | 3 | 3 | 9 | Classify failures, add bounded transient backoff, and provide durable recoverable disposition for permanent rejection while valid items progress. | Android lead and Server lead | Before release candidate approval |
| R-005 | OPS | Enabled for every technician; no feature flag, no staged rollout, no disable without a new build and one-to-three-day store review (Epic 7, story 7.4). A faulty release can disrupt the fleet's core order operation for days. An incident is possible; fleet-wide recovery failure is critical. | 2 | 3 | 6 | Establish and rehearse containment and recovery that preserve queued work; verify replacement-build recovery. | Release lead and Product | Before release authorization |

R-001's extraction probability and R-005's incident probability are planning judgments.
R-002 and R-004 describe known mechanisms in the source.
R-003's probability reflects an unmeasured new deadline with unspecified fleet and network profiles.
All mitigations are proposed and remain Open pending implementation evidence.
Residual risk remains at the recorded score until each proposed control has verified evidence.
After verification, owners must rescore remaining extraction, conflict-resolution, resource, benchmark-profile, and recovery exposure with a reason and evidence reference.
No residual acceptance or waiver is approved in this draft.

### Medium-Priority Risks (Score 3-4)

No medium-priority risks identified.

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ---------- | ----- |

### Low-Priority Risks (Score 1-2)

No low-priority risks identified.

| Risk ID | Category | Description | Probability | Impact | Score | Action |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ------ |

### Risk Category Legend

- TECH: Technical design, integration, and resilience failures.
- SEC: Access controls and sensitive-data exposure.
- PERF: Deadline, throughput, and resource performance.
- DATA: Loss, corruption, and inconsistent stored work.
- BUS: Business logic and user-operation harm.
- OPS: Deployment, containment, recovery, and monitoring.

## NFR Planning

These are planned thresholds and evidence sources for later `nfr-assess`.
The epic's 30-second target is the only specified performance threshold.
Policy values identified as UNKNOWN require owner decisions before mitigation success can be measured.

| NFR Category | Requirement / Threshold | Risk Link | Planned Validation | Evidence Needed |
| ------------ | ----------------------- | --------- | ------------------ | --------------- |
| Security | Full payload contains card reference and address in plaintext. Approved local-storage, key-access, and retention policy: UNKNOWN. | R-001 | Integration inspection of synthetic payload canaries after save, edit, and acceptance/cleanup. Approved mitigation must prevent readable sensitive persisted data. | Persisted-file inspection report, storage/key configuration evidence, retention observations. |
| Data integrity | Two technicians can overwrite each other without checks or history. Conflict detection, merge/rejection semantics, and history policy: UNKNOWN. | R-002 | API delivery permutations against one real order service; verify each technician's work is preserved or exposed for explicit resolution. | Request sequence, server snapshots, preserved revisions, conflict responses/history. |
| Performance | All 2,000 queued entries finish syncing within 30 seconds of usable connectivity on fleet mid-range devices. | R-003 | E2E benchmark on physical fleet devices with timestamped OS network signal, entry acceptance, and queue acknowledgement. | Device/build/network/payload profile, per-entry acceptance ledger, completion timing and resource traces. |
| Reliability | Unlimited immediate retries exist. Backoff, cap, permanent-error disposition, and resource ceilings: UNKNOWN. | R-004 | Integration fault injection at the worker/queue boundary; inspect attempt scheduling, retained state, and valid-item progress. | Attempt/time ledger, queue state, disposition records, network/resource traces, fault configuration. |
| Operations / recoverability | Global release has only a replacement build with one-to-three-day store review. Detection and containment/recovery targets: UNKNOWN. | R-005 | E2E release incident and replacement-build rehearsal with queued orders. | Detection/containment timeline, deployed build identifiers, recovery observations and before/after order ledger. |
| Maintainability / test observability | No numeric code-quality or coverage NFR is supplied. Test seams and evidence collection are planning dependencies. | - | Inspect ability to seed queues, inject failures, and correlate orders safely; select quality checks once source/tooling exists. | Testability inventory, applicable CI/static-analysis reports, agreed quality targets. |
| Scalability | Fleet concurrency and simultaneous reconnect volume: UNKNOWN. The epic specifies one client's 2,000-entry backlog. | R-003 | Use the backlog benchmark for the stated target; add a fleet reconnect load profile only after the deployment volume is defined. | Approved concurrency profile and server load/acceptance traces when applicable. |
| Compliance | Named compliance standards: UNKNOWN. Sensitive queue handling is covered by the security plan; residency is an unchanged platform constraint. | - | Preserve existing regional-routing delegation and obtain the applicable storage/privacy policy from Security. | Routing regression evidence and approved applicable policy. |

**Unknown thresholds:** Fleet device models, supported Android versions, network bandwidth/latency and usable-connectivity definition, representative payload sizes, reconnect concurrency, queue retention/key policy, conflict semantics, retry timing/cap/disposition, resource ceilings, and incident detection/containment goals.
These are dependencies and clarifications; they create no additional scored risks without source evidence of a separate gap.
Network fault scenarios remain distinct from the 30-second benchmark's agreed usable-network profile.

## Entry Criteria

- [ ] Dev, Product, Security, Release, and QA accept the scenarios and proposed mitigation policies.
- [ ] A representative native Android build and isolated order-server environment are available.
- [ ] An existing dispatcher console can read orders in the test installation.
- [ ] Synthetic work orders, parts/labour data, two assigned technicians, and a 2,000-entry queue fixture are available.
- [ ] QA can control connectivity, trigger OS usable-network events, inject upload failures, inspect test-owned SQLite state, and read server acceptance evidence.
- [ ] Fleet devices, supported Android versions, payload profile, and benchmark network conditions are recorded.
- [ ] Conflict, storage, retry, retention, and recovery policies are approved before their mitigation-verification scenarios begin. Characterization of the current gaps can begin earlier.

## Exit Criteria

- [ ] All P0 scenarios pass, with failures reproducibly diagnosed and corrected.
- [ ] P1 pass rate is at least 95%; each accepted failure has an owner, reason, approver, and expiry.
- [ ] All five high-risk mitigations are verified complete and no high-severity defect remains open.
- [ ] Every acceptance criterion has passing journey evidence; security scenarios pass 100%.
- [ ] Every agreed physical-device backlog run accepts all 2,000 entries within 30 seconds and preserves the expected order state.
- [ ] Queue protection, conflict preservation, bounded retries, and release recovery evidence meet the approved policies.
- [ ] Planned NFR evidence is collected and ready for `nfr-assess`; unknown targets affecting sign-off are resolved.

## Project Team

Names are unavailable. The following role assignments are proposed for the handoff.

| Name | Role | Testing Responsibilities |
| ---- | ---- | ------------------------ |
| Unassigned | Android lead | Queue persistence, sync lifecycle, retry mitigation, native test seams. |
| Unassigned | Server lead | Conflict semantics, preserved revisions, server acceptance evidence. |
| Unassigned | Security | Queue minimization, storage/key/retention policy, file-exposure verification. |
| Unassigned | Mobile / Performance QA | Native journeys, fault injection, fleet backlog benchmark, evidence collection. |
| Unassigned | Release lead | Incident containment, replacement-build rehearsal, queue-safe recovery. |
| Unassigned | Product / QA lead | Resolve business-policy gaps, approve coverage and release conditions. |
| Unassigned | Technical design owner | Resolve cross-boundary testability decisions with Android, Server, and Release leads. |

## Test Coverage Plan

Each risk has exactly one linked row at the level where its failure first becomes observable.
P0-P3 headings classify impact and urgency. Execution Strategy defines when checks run.
Rows with `-` cover acceptance behavior or satisfied scope constraints.
Test Count counts the enumerated scenarios, excluding device/profile parameter runs.
Suggested IDs follow `7.<story>-<LEVEL>-<sequence>`; concrete runner names and endpoints await the implementation.

### P0 (Critical)

**Criteria:** Critical business, security, data-integrity, or compliance impact with no safe workaround.
Risk score supports this decision; business consequence determines priority.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |
| 7.1: Protect locally queued sensitive payload | Integration | R-001 | 3 | Android / Security QA | Mechanism: unencrypted payload; boundary: owned SQLite and related persisted files; level: Integration. Scenarios: (1) inspect files after offline capture, (2) inspect after appended edit, (3) inspect after server acceptance and approved retention cleanup. Use synthetic card-reference/address canaries. Exposure is critical; screen lock is the sole source-stated protection and extraction recovery is unresolved. Mitigation checks will expose the current plaintext design. |
| 7.2: Preserve edits from two offline technicians | API | R-002 | 3 | Server QA | Mechanism: arrival-order overwrite; boundary: one order service's HTTP contract; level: API. Scenarios: (1) A then B, (2) B then A, (3) an older queued revision after a newer accepted revision. Compare every line and preserved revision/conflict record against the approved policy. Source-stated silent irreversible loss has no recovery record or safe workaround. |
| 7.3: Bound retries and preserve useful queue progress | Integration | R-004 | 4 | Android QA | Mechanism: immediate indefinite retry; boundary: sync worker and owned queue/event scheduling; level: Integration. Scenarios: (1) transient rejection then success, (2) permanent rejection followed by a valid entry, (3) acceptance response lost in transit, (4) server throttling. Observe approved delays/caps, safe retained or terminal state, and valid-item progress. Sustained resource consumption threatens core sync. Closing the app leaves the order unresolved; source recovery is absent. |
| 7.4: Contain and recover a bad fleet release | E2E | R-005 | 2 | Release QA | Mechanism: fleet-wide enablement without rapid disable; boundary: release delivery, installed Android build, and backend; level: E2E. Scenarios: (1) invoke the approved incident containment/recovery path with pending orders, (2) deliver a replacement build and verify queued orders survive and reach the server. Global disruption is critical; the sole source-stated recovery waits one to three days. Faster mitigation is proposed and must be implemented to satisfy this row. |
| AC1-4: Offline capture reaches the dispatcher unchanged | E2E | - | 2 | Mobile QA | Boundary: real Android client, order server, and existing dispatcher console. Scenarios: (1) capture offline then restore usable network, (2) capture and edit offline then restore network. Check visible captured state, editability through pending acceptance, automatic upload without a manual sync action, and exact order/parts/labour fields on the console. This is the essential new order journey; paper re-keying is the source-described fallback for the current connectivity restriction. |

**Total P0:** 14 tests; approximately 35 to 55 hours.

### P1 (High)

**Criteria:** Core, frequent, or complex behavior with material user reach and a limited workaround.
Risk score supports this decision; business consequence determines priority.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |
| 7.3: Complete a 2,000-entry backlog within 30 seconds | E2E | R-003 | 3 | Performance QA | Mechanism: backlog processing deadline; boundary: real fleet device, OS usable-network signal, uploader, and server acceptance; level: E2E. Scenarios: (1) warm representative baseline, (2) cold-start/recovered queued backlog, (3) representative large-payload backlog. All 2,000 entries must be accepted by 30 seconds; verify expected final revisions and acknowledged queue state. Delayed availability is material core degradation. The source gives no critical business cutoff or permanent-loss consequence from latency alone. Pending items can upload later; bounded recovery time and dispatch impact need clarification. The 30-second release target remains mandatory. |
| 7.1-2, AC1-2: Persist captured orders and queued edits | Integration | - | 3 | Android QA | Boundary: queue repository and SQLite. Scenarios: (1) successful save durably stores exact order payload, (2) successive edits append entries while the displayed editable state reflects the latest edit, (3) failed local write retains the previous committed state and reports failed capture. These persistence checks support the journey without repeating the sensitive-file or cross-technician assertions. Source fallback is paper/re-keying; repair of failed local writes is unspecified. |
| 7.3, AC2-3: React to usable-network and acceptance events | Integration | - | 3 | Android QA | Boundary: OS connectivity event, sync worker, and owned queue. Scenarios: (1) usable-network event starts upload automatically, (2) repeated notifications keep pending/accepted state consistent, (3) disconnect before acceptance keeps the order pending and editable until a later reconnect. Observe real event scheduling and queue transitions. Later connectivity supplies recovery for pending uploads; timing outside the stated usable-network profile is UNKNOWN. |

**Total P1:** 9 tests; approximately 22 to 36 hours.

### P2 (Medium)

**Criteria:** Secondary behavior with narrower user reach and an acceptable workaround.
Risk score supports this decision; business consequence determines priority.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |
| Context constraints: preserve platform delegation | Integration | - | 3 | Dev QA | Boundary: sync client's configured destination and platform adapters. Scenarios: (1) use the installation-local destination, (2) preserve existing regional-routing delegation, (3) capture/edit/sync invokes no billing or charge operation. These verify explicitly satisfied, unchanged constraints; they register no new exposure. Existing platform/billing behavior remains available outside this epic. Any observed security or charging regression requires severity triage and reprioritization before release. |

**Total P2:** 3 tests; approximately 4 to 8 hours.

### P3 (Low)

**Criteria:** Rare, cosmetic, or experimental behavior with minimal impact and an easy workaround.
Risk score supports this decision; business consequence determines priority.

No P3 scenarios are planned. Rendering is unchanged and cosmetic enhancements are outside the epic.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |

**Total P3:** 0 tests; 0 hours.

### Acceptance-Criteria Traceability

| Criterion | Primary planned coverage | Additional boundary coverage |
| --------- | ------------------------ | ---------------------------- |
| AC1: offline save and visible captured state | P0 native journey, both scenarios | P1 persisted successful save and failed-write state |
| AC2: editable until server acceptance | P0 offline-edit journey | P1 appended edits and pending/accepted lifecycle |
| AC3: automatic upload on reconnect | P0 native journeys | P1 OS event scheduling and disconnect/reconnect |
| AC4: unchanged order on dispatcher console | P0 native journeys compare submitted fields and latest accepted edit | API conflict scenarios preserve competing work under the approved policy |

The lower-level rows examine persistence and event handling; the journeys examine user-visible outcomes across deployables.
Pure logic and individual rendered-component coverage can be selected once implementation exposes those units.
The evidence supplied for this run provides no specific unit/component mechanism to assign.

## Execution Strategy

- **Pull request:** Run all functional persistence, API, event-lifecycle, and short native journey scenarios with a measured target below 15 minutes. Use isolated order/device identities and reset test-owned queues between scenarios. CI runner parallelism can be selected later; this design workflow executes sequentially.
- **Nightly:** Run costly physical-device backlog profiles, upload fault/resource checks, and pending-queue lifecycle recovery. Retain request, queue, server, and device evidence for failures.
- **Weekly:** Run the representative fleet/network benchmark matrix and release incident/replacement-build rehearsal. Repeat them against the release candidate before authorization.

Timing depends on infrastructure cost and duration, independent of P0-P3 priority.
Within each scheduled run, execute the existing journey smoke first, then remaining P0, P1, and P2/P3 checks; smoke is a selection from the planned coverage.
If functional PR runtime exceeds 15 minutes, improve fixtures and execution distribution; any temporary deferral requires an explicit owner and recorded gate impact.
Use native Android instrumentation or a device-flow runner selected from the eventual codebase.
Use an HTTP/fault harness for server and queue boundaries.
Browser exploration has no configured branch or client target in this run; no browser sessions were opened.

## Resource Estimates

### Test Development Effort

| Priority | Count | Hours/Test | Total Hours | Notes |
| -------- | ----- | ---------- | ----------- | ----- |
| P0 | 14 | Approximately 2 to 4 | Approximately 35 to 55 | Sensitive-file inspection, conflict permutations, native journeys, recovery setup |
| P1 | 9 | Approximately 2 to 4 | Approximately 22 to 36 | Device benchmarks and queue/event fixtures |
| P2 | 3 | Approximately 1 to 3 | Approximately 4 to 8 | Existing adapter/destination regression checks |
| P3 | 0 | N/A | 0 | No in-scope scenarios |
| Total | 26 | Varies by scenario | Approximately 61 to 99 | Approximately 8 to 13 eight-hour person-days |

Hours/Test are broad planning intervals; row totals account for shared fixtures.
This is test-development effort after entry dependencies are ready.
Feature remediation, provisioning lead time, and store-review delay require separate scheduling.
With one full-time contributor and ready dependencies, plan approximately 1.5 to 3 working weeks.

### Prerequisites

**Test Data:**

- Synthetic work-order fixtures with exact parts/labour values, card-reference/address canaries, and expected accepted payloads.
- Two technician identities assigned to the same work order; revisions with distinguishable lines and arrival order.
- Queue seeds of 2,000 entries with representative payload sizes; permanent-rejection and transient-failure cases.
- Isolated installation/device/order identities and setup/teardown for queue files and server state. Persistent acceptance evidence must survive teardown.

**Tooling:**

- Native Android device automation and approved test-build instrumentation; runner availability is UNKNOWN.
- Real SQLite inspection and controlled persistence failure injection in the test environment.
- HTTP fault control and a request/acceptance ledger without real customer data.
- Device timing/network/resource capture and server-state inspection; generic API load tooling can supplement the physical-device deadline measurements.
- A console verification method for the existing dispatcher view, selected once access is available.

**Environment:**

- Physical mid-range fleet Android devices plus an emulator for repeatable functional checks; fleet models and OS range must be provided.
- An isolated single-tenant server/database and the existing dispatcher console.
- Controlled offline/usable-network profiles and clocks/timestamps suitable for elapsed-time correlation.
- A release rehearsal environment supporting the proposed containment and replacement-build recovery path.

## Quality Gate Criteria

These are proposed release conditions for later execution.
No execution-based gate or final NFR status is issued by this design.

### Pass/Fail Thresholds

- P0 pass rate: 100%, with every planned P0 scenario executed.
- P1 pass rate: ≥95%; any accepted failure needs an approver, reason, owner, and expiry. With nine scenarios, one failure would produce 88.9%, below this threshold.
- P2/P3 pass rate: ≥90%, informational; newly discovered severe regressions still block release.
- High-risk mitigations: 100% verified complete before release; open score-9 risks block the proposed release conditions.
- Full backlog: every agreed benchmark run accepts all 2,000 entries within 30 seconds of usable connectivity. Discarded or missing entries cannot count as completion.

### Coverage Targets

- Critical paths: ≥80% of the agreed inventory; all four epic acceptance criteria and critical native journeys require passing coverage.
- Security scenarios: 100%.
- Business logic: ≥70% of the agreed testable logic inventory once code exists.
- Edge cases: ≥50% of the agreed inventory; every scenario enumerated in the five risk-linked rows remains mandatory.

These percentages are planning targets, distinct from measured code coverage.
No current implementation coverage or flakiness can be inferred from this repository.

### Non-Negotiable Requirements

- [ ] All P0 tests pass.
- [ ] No high-risk item remains unmitigated; no high-severity defect remains open.
- [ ] Local sensitive-data exposure checks pass 100% against the approved security policy.
- [ ] Both technicians' edits remain preserved or recoverable through explicit conflict resolution/history.
- [ ] Permanently rejected uploads have an approved bounded, durable recovery path and valid items progress.
- [ ] The physical-device 2,000-entry / 30-second target is met.
- [ ] Release containment and queue-safe recovery are demonstrated.
- [ ] Planned NFR evidence is available for later assessment and targets affecting sign-off are resolved.

## Mitigation Plans

### R-001: Plaintext sensitive queue payload (Score: 6)

**Mitigation Strategy:** Security and Android must decide which sensitive fields offline capture needs, remove unnecessary copies, and protect required persisted data with an approved key/access policy.
Include SQLite-associated persisted files and define retention following acceptance.
**Owner:** Android lead and Security.
**Timeline:** Policy before mitigation verification; completion before release candidate approval.
**Status:** Planned; risk Open.
**Verification:** The three Integration scenarios inspect synthetic canaries and key accessibility at the file boundary. Document the intended attacker/access model and the test instrumentation used to obtain inspection access.

### R-002: Silent concurrent-edit loss (Score: 9)

**Mitigation Strategy:** Product and Server must agree on version/conflict semantics that preserve both technicians' work and expose conflicts for explicit resolution.
Retain competing revisions or an adequate history before accepting destructive replacement.
**Owner:** Server lead and Product.
**Timeline:** Policy before API verification; completion before release candidate approval.
**Status:** Planned; risk Open.
**Verification:** The three API scenarios assert preserved line sets, revision history, and conflict outcomes for both arrival orders and stale delivery. The current source-described overwrite is a reproducible failure against the proposed data-preservation condition.

### R-003: Unmeasured backlog deadline (Score: 6)

**Mitigation Strategy:** Define fleet/network/payload profiles, measure the new queue path, identify throughput bottlenecks, and optimize processing while preserving order correctness.
Average required completion throughput is approximately 67 queued entries per second over 30 seconds; elapsed full-backlog completion remains the acceptance measure.
**Owner:** Android lead and Performance QA.
**Timeline:** Profiles before benchmarking; verified target before release candidate approval.
**Status:** Planned; risk Open.
**Verification:** The three E2E benchmark scenarios start at the OS usable-network event and end only when the server acceptance ledger confirms every entry. Record latest expected order revisions and acknowledged queue state. Count repeated edits as queue entries and prevent a successful aggregate from hiding missing entries.

### R-004: Immediate indefinite retry loop (Score: 9)

**Mitigation Strategy:** Define permanent/transient errors, backoff timing, attempt bounds, and durable rejection/recovery handling.
Prevent a rejected entry from blocking valid work; retain recoverable order state and expose terminal failures safely.
Resolve acceptance-response loss without destructive duplicate processing.
**Owner:** Android lead and Server lead.
**Timeline:** Retry/disposition policy before verification; completion before release candidate approval.
**Status:** Planned; risk Open.
**Verification:** The four Integration scenarios use controlled responses and timestamps to assert the approved retry/disposition behavior, queue consistency, and resource ceilings. Stop fault injections at the harness safety bound; record sustained unbounded behavior as a failure, preserving the source facts.

### R-005: Fleet-wide release with delayed recovery (Score: 6)

**Mitigation Strategy:** Release and Product must choose a containment control and recovery procedure before authorizing deployment to all technicians.
Evaluate controlled rollout or disablement as proposed changes, preserve offline orders during recovery, and prepare a replacement-build path.
The source supplies no existing flag or staged deployment control.
**Owner:** Release lead and Product.
**Timeline:** Procedure and implementation before rehearsal; verified recovery before release authorization.
**Status:** Planned; risk Open.
**Verification:** The two E2E recovery scenarios inject a bad-release condition, measure detection and containment against approved targets, then verify queued orders remain recoverable through restoration or replacement. Record the source's one-to-three-day store-review delay in the recovery plan; a lab rehearsal cannot prove an actual review duration.

## Assumptions and Dependencies

### Assumptions

1. Test devices and the server environment will use synthetic data and allow controlled fault injection and queue inspection.
2. Fleet/device/network/payload profiles will be agreed before the 30-second target is assessed. Supported OS versions and concurrent reconnect volume are UNKNOWN.
3. Server endpoints, schemas, Android scheduling mechanisms, and runner APIs will be derived from implementation. The supplied epic defines no concrete API paths or framework.
4. Storage, conflict, retry, and release containment controls in this plan are proposed mitigations. Their required semantics need owner approval.
5. Latency beyond 30 seconds implies delayed sync. A critical dispatch deadline or permanent-loss consequence solely from latency is unspecified and requires business clarification.

### Dependencies

1. Android build, test seams, device profiles, and controlled SQLite/OS connectivity access: required before native and Integration execution.
2. Order API, isolated server/database, two-technician assignment fixtures, and acceptance/history inspection: required before API and cross-system execution.
3. Existing dispatcher console access: required before AC4 journey verification.
4. Approved mitigation policies and release recovery capability: required before mitigation verification and release authorization.
5. Evidence storage and correlation across device, queue, request, and server: required before NFR measurements.

### Risks to Plan

- **Risk:** Implementation and test infrastructure are unavailable in this fixture repository.
  **Impact:** Runtime, coverage, and execution results cannot be measured during design.
  **Contingency:** Use this scenario inventory to establish test seams and collect evidence when builds become available.
- **Risk:** Unknown policy and measurement profiles prevent stable mitigation or benchmark assertions.
  **Impact:** Later execution cannot prove closure until those values are approved.
  **Contingency:** Assign the decisions to the owners above and make them entry conditions for the affected scenarios.

These delivery dependencies are outside the scored product-risk register.

## Implementation Planning Handoff

- Android and Security: decide queue field minimization, persisted-data protection, key access, and retention; provide file inspection and failure-injection seams.
- Product and Server: decide conflict/version/history semantics and expose acceptance evidence.
- Android and Server: decide bounded retry/disposition and valid-item progress behavior.
- Release and Product: implement and rehearse a queue-safe containment/recovery path.
- QA and Dev: provision synthetic fixtures, representative devices, network profiles, and evidence capture; automate the coverage rows in a separate workflow.

## Follow-on Workflows (Manual)

- Run `/bmad-tea-automate` in red mode for failing P0 tests as a separate authorized workflow.
- Run `/bmad-tea-automate` for broader coverage when implementation is available.
- Run `nfr-assess` once execution evidence exists.

## Approval

**Test Design Approved By:**

- [ ] Product Manager: Unassigned; date pending.
- [ ] Tech Lead: Unassigned; date pending.
- [ ] QA Lead: Unassigned; date pending.

**Comments:** Draft awaiting role assignment and mitigation-policy decisions. Workflow completion records document generation.

## Interworking & Regression

| Service/Component | Impact | Regression Scope |
| ----------------- | ------ | ---------------- |
| Native Android order screen | Adds captured/pending behavior without rendering changes. | Offline save/edit visibility and exact parts/labour values; existing online save/edit behavior must remain usable. Existing suite is unavailable. |
| SQLite outbound queue | Persists full order entries and appends edits. | Committed save, appended revisions, safe failed write, sensitive-file policy, retained pending state, and acceptance cleanup. |
| OS connectivity and sync worker | Usable-network event starts automatic upload. | Event scheduling, repeat notifications, disconnect recovery, bounded failure handling, and queue consistency. |
| Order API and installation-local database | Applies queued changes and feeds dispatcher reads. | Exact payload preservation, competing technician revisions, acceptance tracking, and configured installation destination. |
| Existing dispatcher console | Displays accepted server orders unchanged. | AC4 field equality and availability of the accepted order through existing rendering. No console redesign is planned. |
| Platform regional routing | Remains the residency control. | Preserve existing routing delegation and run platform regression when available. |
| Existing billing service | Nightly charging remains untouched. | Assert no invocation by capture/edit/sync; retain billing team's existing schedule/charging regression outside this epic. |
| Release delivery | Installs globally enabled functionality and replacement builds. | Recovery rehearsal must preserve queued work and demonstrate the approved containment capability. |

Coordinate Android, Server, QA, Security, and Release access to the same isolated installation and evidence ledger.
No existing regression tests or flaky areas were found in the repository; the scopes above are required checks for later implementation.

## Appendix

### Knowledge Base References

- `bmod-tea/knowledge/risk-governance.md`: category, owner, mitigation, and risk governance.
- `bmod-tea/knowledge/probability-impact.md`: 1-to-3 scales and score thresholds.
- `bmod-tea/knowledge/test-levels-framework.md`: unit, integration, API, component, and E2E selection.
- `bmod-tea/knowledge/test-priorities-matrix.md`: business-impact priority decision tree.
- `bmod-tea/knowledge/nfr-criteria.md`: measurable NFR planning and later evidence assessment.

### Related Documents

- Requirements: [Epic 7: Offline order capture](../../docs/epics/epic-7-offline-order-capture.md), Context, stories 7.1-7.4, Acceptance criteria, and Out of scope.
- Configuration: [TEA/core config](../../_bmad/config.toml).
- Template: `skill/test-design-template.md`.
- PRD, architecture, tech spec, and sprint status: N/A for this run. The epic is the only requirements source.
- Prior system-level designs, implementation, test fixtures, CI manifests, and test reports: unavailable in the scanned project.

**Generated by:** BMad TEA Test Architect Module.
**Workflow:** `bmad-tea-test-design`, Create mode, epic-7, sequential execution with capability probing disabled.
**Version:** 5.0 step-file workflow.
