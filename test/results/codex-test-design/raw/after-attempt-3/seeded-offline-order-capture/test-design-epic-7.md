---
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted:
  - 'step-01-detect-mode'
  - 'step-02-load-context'
  - 'step-03-risk-and-testability'
  - 'step-04-coverage-plan'
  - 'step-05-generate-output'
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-10-09'
runScope: 'epic'
runKey: 'epic-7'
inputDocuments:
  - 'field-order-capture/_bmad/config.toml'
  - 'field-order-capture/docs/epics/epic-7-offline-order-capture.md'
  - 'bmod-tea/knowledge/risk-governance.md'
  - 'bmod-tea/knowledge/probability-impact.md'
  - 'bmod-tea/knowledge/test-levels-framework.md'
  - 'bmod-tea/knowledge/test-priorities-matrix.md'
  - 'bmod-tea/knowledge/nfr-criteria.md'
---

# Test Design: Epic 7, Offline Order Capture for Field Technicians

**Date:** 2026-10-09  
**Author:** tea-eval-harness  
**Status:** Draft

---

## Executive Summary

**Scope:** Full epic-level test design for Epic 7.

Epic 7 adds native Android order capture, editing, queueing, and synchronization during extended loss of connectivity. The design has six high risks. Four are critical score-9 risks that require product or architecture changes before release: unencrypted sensitive data, silent loss of concurrent edits, unbounded retry storms, and fleet-wide rollout without rapid disablement.

**Risk Summary:**

- Total risks identified: 6
- High-priority risks with score 6 or greater: 6
- Critical categories: security, data integrity, performance, and operations
- Score-9 release blockers: R-001, R-002, R-003, and R-005

**Coverage Summary:**

- P0 test cases: 48, about 65 to 105 hours
- P1 test cases: 29, about 35 to 60 hours
- P2 and P3 risk-driven test cases: 0
- Total effort: about 100 to 165 hours, or about three to five weeks with the required specialists and environments

The repository contains requirements and configuration only. It has no application source, test suites, fixtures, framework configuration, or prior test-design output. Every scenario in this document is planned coverage.

---

## Not in Scope

| Item | Reasoning | Mitigation |
| --- | --- | --- |
| Offline capture for records other than work orders | The epic explicitly limits offline capture to work orders. | Keep other record types on their existing paths and run their current regression coverage. |
| Dispatcher console behavior or rendering changes | The epic excludes console changes. The console participates only as an observer of accepted order data. | Run the existing console regression suite and verify final order payload integrity through one end-to-end journey. |
| Card charging behavior or schedule | The billing service remains on its existing nightly schedule and the epic does not call it. | Assert that capture and sync emit no billing calls and leave the nightly schedule unchanged. |
| Android order-screen rendering changes | The epic states that screen rendering is unchanged. | Run component and visual regression coverage for the existing order screen, including the captured-status addition. |
| Regional routing changes | The platform regional routing layer continues to enforce residency and is outside this epic. | Verify that sync uses the existing regional route and introduces no bypass endpoint. |
| Cross-installation shared storage | Each installation remains single-tenant with separate databases and application servers. | Assert installation-scoped identifiers and storage in API and persistence regression coverage. |

---

## Risk Assessment

Probability uses 1 for unlikely, 2 for possible, and 3 for likely. Impact uses 1 for minor, 2 for degraded service, and 3 for critical business, security, or data harm. Score equals probability multiplied by impact.

### High-Priority Risks, Score 6 or Greater

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Timeline |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| R-001 | SEC | Sensitive customer data can be recovered from a lost, stolen, compromised, or debug-accessible device. Story 7.1 places full order payloads, stored card references, and billing addresses in an unencrypted SQLite file protected only by the device screen lock. | 3 | 3 | 9 | Encrypt queued payloads with Android Keystore-backed keys, minimize retained fields, exclude the queue from backup and export, purge acknowledged data, and complete security review. | Mobile Engineering and Security | Before implementation approval and release |
| R-002 | DATA | Valid order lines can be silently and permanently lost when two assigned technicians edit the same order offline. Story 7.2 states that arrival order controls overwrites, with no version check, timestamp check, or record of lost lines. | 3 | 3 | 9 | Add version-aware conflict detection, an explicit merge or human resolution path, and a durable audit record for conflicting submissions. | Order Service Engineering and Product | Before release |
| R-003 | OPS | A permanently invalid payload can create an unbounded hot retry loop that drains device resources, consumes data, floods the order endpoint, and prevents dependable recovery. Story 7.3 specifies immediate retries forever, with no backoff, attempt cap, or dead-letter path. | 3 | 3 | 9 | Classify transient and terminal failures, add bounded exponential backoff with jitter, cap attempts, quarantine terminal failures, expose recovery state, and monitor retry rate and queue age. | Mobile Engineering, Order Service Engineering, and SRE | Before release |
| R-004 | PERF | A field device may miss the required recovery window and delay dispatcher visibility when a full-day backlog reaches 2,000 items. Story 7.3 requires the full backlog to sync within 30 seconds on fleet mid-range devices. | 2 | 3 | 6 | Benchmark the complete client-to-server path on the fleet device profile with realistic payload and network distributions. Tune batching, concurrency, transactions, and server capacity against the threshold. | Mobile Engineering and Performance Engineering | Before release candidate approval |
| R-005 | OPS | A production defect affects every technician immediately and remains active for one to three days while a replacement build passes store review. Story 7.4 specifies an all-user release with no feature flag, staged rollout, or remote disable mechanism. | 3 | 3 | 9 | Add a remote kill switch, staged percentage rollout, health gates, and rollback criteria. Exercise disablement and rollback before general availability. | Product, Mobile Engineering, and Release Engineering | Before production rollout |
| R-006 | DATA | Queued edits may fail to preserve the final accepted order across a multi-entry sequence, especially when upload stops partway through. Story 7.2 states that every edit appends an entry, while the acceptance criteria require the accepted server order to appear unchanged on the dispatcher console. Ordering, idempotency, acknowledgement, and recovery semantics are unspecified. | 2 | 3 | 6 | Define ordering, idempotency, acknowledgement, crash recovery, and compaction rules. Prove that replaying or resuming any sequence prefix converges on one correct final order without duplicate application. | Mobile Engineering and Order Service Engineering | Before implementation completion |

### Medium-Priority Risks, Score 3 to 4

No distinct medium risks were identified after consolidating shared failure mechanisms.

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |

### Low-Priority Risks, Score 1 to 2

No distinct low risks were identified from the supplied epic.

| Risk ID | Category | Description | Probability | Impact | Score | Action |
| --- | --- | --- | ---: | ---: | ---: | --- |

### Risk Category Legend

- **TECH:** Technical architecture, integration, and scalability
- **SEC:** Security controls and data exposure
- **PERF:** Performance thresholds and resource limits
- **DATA:** Data loss, corruption, and inconsistency
- **BUS:** Business behavior and user impact
- **OPS:** Deployment, configuration, monitoring, and recovery

---

## NFR Planning

This section defines later validation evidence. Final NFR status requires implementation evidence through `nfr-assess`.

| NFR Category | Requirement or Threshold | Risk Link | Planned Validation | Evidence Needed |
| --- | --- | --- | --- | --- |
| Security and privacy | Local protection, retention, backup, and purge thresholds are UNKNOWN. The current epic explicitly stores sensitive fields unencrypted. | R-001 | Android storage integration checks, lost-device E2E threat scenario, backup and export inspection, purge verification, and security review | Test report, filesystem inspection record, encryption and key configuration, backup exclusion evidence, purge evidence, and review record |
| Performance | Drain 2,000 realistic queued items within 30 seconds on the approved fleet mid-range device after usable connectivity returns. | R-004 | Instrumented full-path device benchmark and server reconnect-load test | Device and network profile, payload distribution, latency percentiles, throughput, error rate, CPU, memory, battery, and server saturation metrics |
| Reliability | Automatic upload after usable network returns. Retry limits, recovery time, and acceptable data-loss rate are UNKNOWN. | R-003, R-006 | Retry fault injection, process-kill recovery, deterministic replay, acknowledgement checks, and queue-to-server reconciliation | Retry timeline, quarantine record, queue snapshots, reconciliation output, logs, and queue-age metrics |
| Scalability | Per-device backlog boundary is 2,000 items. Concurrent fleet reconnect volume and server capacity threshold are UNKNOWN. | R-004 | Multi-client API load test with representative payloads and reconnect timing | Load report, capacity curve, endpoint and database profiles, throughput, and error rate |
| Operational resilience | Current rollback delay is one to three days. Approved cohort size, disablement time, and rollback triggers are UNKNOWN. | R-005 | Kill-switch test, staged-rollout health-gate exercise, and rollback drill | Control-plane audit record, alert timeline, cohort progression log, and rollback duration |
| Maintainability and observability | Logging, metrics, trace, audit retention, and support recovery thresholds are UNKNOWN. | R-002, R-003, R-006 | Diagnostics contract checks, correlation tracing, dashboard and alert verification, and recovery-runbook review | CI coverage report, structured logs, correlation trace, dashboards, alert test, audit record, and runbook |
| Compliance | Applicable control set, approved data classification, and retention period for stored card references and billing addresses are UNKNOWN. | R-001 | Data inventory, privacy and security review, retention test, and device compromise assessment | Approved classification, control mapping, review record, and retention evidence |

**Unknown thresholds:** local encryption and key controls; queue retention and purge time; retry ceiling and backoff limits; terminal-error recovery time; acceptable data-loss rate; concurrent reconnect volume; server capacity; rollout cohort size; kill-switch response time; rollback triggers; logging and audit retention; compliance control set.

---

## Entry Criteria

- [ ] Product, Mobile Engineering, Order Service Engineering, Security, SRE, and QA agree on the requirements and recorded clarifications.
- [ ] R-001, R-002, R-003, and R-005 mitigation designs are approved and available in a testable build.
- [ ] Ordering, idempotency, acknowledgement, crash recovery, and compaction behavior is specified for R-006.
- [ ] The approved mid-range Android fleet device, operating-system version, payload distribution, and recovered-network profile are named.
- [ ] Concurrent reconnect volume and server capacity targets are defined.
- [ ] The Android build, test order service, regional route, dispatcher console, release controls, logs, metrics, and audit data are accessible to the test team.
- [ ] Isolated installation-scoped accounts, work orders, two-technician assignments, sensitive-data markers, queue factories, and deterministic server fault controls are ready.

## Exit Criteria

- [ ] P0 pass rate is 100 percent.
- [ ] P1 pass rate is at least 95 percent, with every failure triaged and owned.
- [ ] No open score-9 risk, P0 defect, P1 defect without an approved waiver, or unmitigated high risk remains.
- [ ] Every acceptance criterion maps to automated coverage and overall requirements coverage is at least 80 percent.
- [ ] Security scenarios pass at 100 percent and approved local-data controls have retained evidence.
- [ ] The 2,000-item backlog completes within 30 seconds on the approved device and network profile.
- [ ] Concurrent edits produce a lossless resolved order or explicit conflict outcome with a durable audit record.
- [ ] Permanently rejected payloads enter a visible, recoverable terminal state without hot retrying.
- [ ] Kill-switch, staged-rollout, and rollback exercises meet approved operational thresholds.
- [ ] Every in-scope NFR category has the evidence listed in this design. Final NFR disposition is recorded through `nfr-assess`.

---

## Test Coverage Plan

P0 through P3 express business and quality priority. Execution timing is defined in the Execution Strategy section.

### P0, Critical

**Criteria:** Critical business, security, data-integrity, or compliance impact with no safe workaround.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| --- | --- | --- | ---: | --- | --- |
| Protect queued card references and billing addresses through encryption, backup exclusion, export controls, and purge after acknowledgement | Integration | R-001 | 4 | Mobile QA and Security | Security-critical persistence boundary. The tests inspect storage and key behavior directly. Device compromise has no source-supported workaround. |
| Resist queue recovery from a locked lost-device image under the approved threat model | E2E | R-001 | 2 | Security | The device-level flow validates the actual protection boundary. Exposure is critical and the epic names only screen lock protection. |
| Resume a multi-entry edit sequence after process termination at each transaction boundary and converge exactly once | Integration | R-006 | 6 | Mobile QA and Order Service QA | Integration control enables deterministic crash points and inspection of local and server state. Incorrect accepted data has no stated recovery path. |
| Submit conflicting offline edits from two assigned technicians in both arrival orders and surface explicit conflict handling | E2E | R-002 | 4 | Mobile QA | The cross-client journey must prove that no valid line disappears silently. Story 7.2 states that lost lines leave no record, so no recovery path exists. |
| Enforce version checks, conflict response semantics, resolution behavior, and durable audit history | API | R-002 | 6 | Order Service QA | Direct server coverage exercises conflict permutations efficiently and verifies the primary loss-prevention control. |
| Classify transient, throttling, authentication, validation, and terminal upload errors | Unit | R-003 | 8 | Mobile Engineering | Pure retry-policy logic belongs at unit level. Misclassification can cause an unbounded loop with no user recovery path. |
| Apply bounded backoff, jitter, attempt limits, and terminal quarantine under controlled server failures | Integration | R-003 | 7 | Mobile QA and Order Service QA | The integration boundary verifies scheduler, persistence, and server interaction deterministically. |
| Show the accepted server order unchanged on the dispatcher console after capture and edit replay | E2E | R-002, R-006 | 4 | QA | This covers acceptance criterion 4 and final data integrity across client, server, and console. An incorrect dispatched order has no source-supported workaround. |
| Disable offline capture remotely on an installed production-like build and restore established connected-order behavior | E2E | R-005 | 3 | Release QA | The control must contain a fleet-wide defect within the approved response time. Current recovery requires a one-to-three-day store review. |
| Enforce staged rollout health gates, halt progression, and roll back the enabled cohort | E2E | R-005 | 4 | Release QA | Production-like release testing validates blast-radius controls and rollback behavior. |

**Total P0:** 48 test cases across 10 scenario groups, about 65 to 105 hours.

### P1, High

**Criteria:** Core, frequent, or complex behavior with material user reach and a limited workaround.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| --- | --- | --- | ---: | --- | --- |
| Persist an offline order atomically and reconstruct its complete payload | Integration | R-006 | 5 | Mobile QA | Covers SQLite serialization and transaction behavior. Failure blocks offline work; the epic documents paper capture and later re-entry as a limited workaround. |
| Save an order with connectivity disabled and show it as captured on a fleet-profile Android device | E2E | R-006 | 3 | Mobile QA | Covers acceptance criterion 1 through the native user flow. Paper capture preserves the work with delay and re-entry cost. |
| Edit a captured order while offline and retain editability until server acceptance | E2E | R-006 | 4 | Mobile QA | Covers acceptance criterion 2. Paper capture is the documented limited workaround for field work. |
| Begin upload without technician action when usable connectivity returns, accept the order, and clear only acknowledged entries | E2E | R-003, R-006 | 5 | Mobile QA and Order Service QA | Covers acceptance criterion 3 across operating-system network state, native client, queue, and server. |
| Expose retry count, queue age, terminal reason, correlation ID, and recovery action for stuck submissions | API | R-003 | 5 | Order Service QA and SRE | Diagnostics support intervention after a failed core sync. Recovery remains limited until the planned controls exist. |
| Sync 2,000 realistic queued items within 30 seconds on the approved fleet device and recovered-network profile | E2E | R-004 | 3 | Performance QA and Mobile QA | Full-path device coverage measures the explicit threshold. A miss delays dispatcher visibility; the epic establishes no permanent loss or critical deadline. |
| Sustain the approved concurrent fleet reconnect volume while preserving correctness and the per-device recovery target | API | R-004 | 4 | Performance QA and SRE | API-level load provides controllable server-capacity evidence. The fleet concurrency target is an entry blocker. |

**Total P1:** 29 test cases across 7 scenario groups, about 35 to 60 hours.

### P2, Medium

**Criteria:** Secondary behavior with narrower user reach and an acceptable workaround.

No risk-driven P2 scenarios are justified by the supplied epic.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| --- | --- | --- | ---: | --- | --- |

**Total P2:** 0 test cases, 0 hours.

### P3, Low

**Criteria:** Rare, cosmetic, or experimental behavior with minimal impact and an easy workaround.

No risk-driven P3 scenarios are justified by the supplied epic.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| --- | --- | --- | ---: | --- | --- |

**Total P3:** 0 test cases, 0 hours.

---

## Execution Strategy

**Philosophy:** Run every functional scenario in pull requests while the suite remains under 15 minutes. Long-running work moves to scheduled suites based on infrastructure and duration.

- **Pull request:** Run unit, integration, API, component, and focused Android emulator E2E coverage in parallel. Target completion within 15 minutes.
- **Nightly:** Run two-device conflict flows, process-kill recovery, complete native E2E regression, retry fault injection, storage inspection, and the 2,000-item device benchmark.
- **Weekly:** Run concurrent fleet reconnect load, endurance and battery profiling, staged-rollout rehearsal, kill-switch validation, and rollback drills in a production-like environment.
- Within each run, execute P0 coverage first and P1 coverage second. Stop promotion on any P0 failure.

---

## Resource Estimates

### Test Development Effort

| Priority | Test Cases | Total Hours | Notes |
| --- | ---: | --- | --- |
| P0 | 48 | About 65 to 105 hours | Security harness, two-device conflict setup, retry fault injection, deterministic replay, dispatcher verification, and release controls |
| P1 | 29 | About 35 to 60 hours | Core device flows, queue integration coverage, diagnostics, device benchmark, and server load coverage |
| P2 | 0 | 0 hours | No risk-driven P2 scope |
| P3 | 0 | 0 hours | No risk-driven P3 scope |
| **Total** | **77** | **About 100 to 165 hours** | Includes fixtures, environment setup, execution tuning, and evidence capture |

Expected elapsed time is about three to five weeks with coordinated access to mobile, backend, security, performance, SRE, and release-engineering support. Product and architecture implementation of mitigations is outside this estimate.

### Prerequisites

**Test Data:**

- Installation-scoped technician, dispatcher, and two-technician assignment factories with automatic cleanup
- Work-order factory with realistic parts, labour, stored-card-reference markers, billing addresses, and configurable payload size
- Queue-state fixtures for empty, partially acknowledged, terminal, retrying, and 2,000-item backlogs
- Deterministic conflict and server-response fixtures

**Tooling:**

- Project-approved Android native test runner or device-flow tool for emulator and physical-device E2E coverage
- Android device lab with the approved mid-range fleet profile and process, storage, backup, battery, CPU, and memory instrumentation
- Network shaping and connectivity controls for offline, reconnect, latency, loss, and bandwidth profiles
- API and fault-injection harness for response classes, timing, partial acknowledgements, and order-server state inspection
- Approved HTTP load tool for concurrent reconnect and server-capacity tests
- Security inspection tooling for SQLite contents, key use, backup, export, and lost-device analysis
- Release-control test environment for kill switch, staged rollout, health gates, and rollback

**Environment:**

- Isolated single-tenant test installation routed through the same regional layer as production
- Production-like order service and dispatcher console with billing calls observable and blocked from real charging
- Central logs, metrics, traces, queue-age dashboard, retry-rate dashboard, alerts, and durable audit access

---

## Quality Gate Criteria

### Pass and Fail Thresholds

- **P0 pass rate:** 100 percent
- **P1 pass rate:** At least 95 percent; every failure requires triage and ownership
- **P2 and P3 pass rate:** At least 90 percent when those bands gain approved scope
- **High-risk mitigations:** 100 percent complete or covered by a formally approved, time-limited waiver

### Coverage Targets

- **Requirements coverage:** At least 80 percent overall and 100 percent for P0 acceptance and risk scenarios
- **Security scenarios:** 100 percent
- **Critical data-integrity paths:** 100 percent
- **Business logic:** At least 70 percent
- **Edge cases:** At least 50 percent

### Non-Negotiable Requirements

- [ ] All P0 tests pass.
- [ ] R-001, R-002, R-003, and R-005 have no open release-blocking condition.
- [ ] Every score-6 or score-9 mitigation has automated verification and retained evidence.
- [ ] Local queued payloads meet approved encryption, key, backup, export, retention, and purge controls.
- [ ] Concurrent offline edits preserve every valid line through a lossless resolved order or explicit audited conflict.
- [ ] A terminal payload stops hot retrying and enters a visible, recoverable state.
- [ ] The 2,000-item backlog meets the 30-second threshold on the approved device and network profile.
- [ ] Kill-switch, staged-rollout, and rollback evidence meets approved response thresholds.
- [ ] Planned evidence exists for every NFR category. Final NFR disposition is produced through `nfr-assess`.

---

## Mitigation Plans

### R-001: Unencrypted Sensitive Queue Data, Score 9

**Mitigation Strategy:**

1. Minimize queued payment and address data to the fields strictly required for order submission.
2. Encrypt the SQLite database or sensitive columns with keys protected by Android Keystore.
3. Exclude queue data and keys from backup, export, logs, crash reports, and diagnostics.
4. Purge acknowledged payload data according to an approved retention rule.
5. Complete security and privacy review against the approved device threat model.

**Owner:** Mobile Engineering and Security  
**Timeline:** Before implementation approval and release  
**Status:** Planned  
**Verification:** R-001 integration and lost-device E2E coverage, configuration inspection, and security review evidence.  
**Residual Risk:** Physical compromise risk remains within the approved Android hardware, operating-system, and key-protection threat model.

### R-002: Silent Concurrent-Edit Loss, Score 9

**Mitigation Strategy:**

1. Attach an order version to every queued submission.
2. Reject or branch stale updates at the server.
3. Present an explicit merge or human resolution path.
4. Preserve both submitted versions and the resolution in an audit record.

**Owner:** Order Service Engineering and Product  
**Timeline:** Before release  
**Status:** Planned  
**Verification:** R-002 API permutations and two-device E2E conflict flows.  
**Residual Risk:** Human conflict resolution can delay final order acceptance; alerts and queue status must keep the unresolved state visible.

### R-003: Unbounded Retry Storm, Score 9

**Mitigation Strategy:**

1. Define transient, throttling, authentication, validation, and terminal error classes.
2. Apply bounded exponential backoff with jitter to retryable errors.
3. Cap attempts and quarantine terminal or exhausted submissions.
4. Provide visible recovery actions and preserve the original payload.
5. Alert on retry rate, queue age, quarantine count, and endpoint saturation.

**Owner:** Mobile Engineering, Order Service Engineering, and SRE  
**Timeline:** Before release  
**Status:** Planned  
**Verification:** R-003 unit, integration, API diagnostics, and fault-injection evidence.  
**Residual Risk:** Extended server outages can grow queue age; bounded retries, capacity monitoring, and recovery controls contain the effect.

### R-004: Backlog Sync Misses 30 Seconds, Score 6

**Mitigation Strategy:**

1. Name the fleet device, operating-system, payload, and network profiles.
2. Profile client serialization, SQLite reads, network transfer, server processing, and database writes.
3. Tune batching, concurrency, compression, acknowledgements, and transaction size.
4. Capacity-test the approved concurrent reconnect volume.

**Owner:** Mobile Engineering and Performance Engineering  
**Timeline:** Before release candidate approval  
**Status:** Planned  
**Verification:** R-004 device benchmark and API load evidence.  
**Residual Risk:** Network conditions outside the approved profile can extend sync time; queue visibility and eventual recovery evidence must remain available.

### R-005: Fleet-Wide Release Without Rapid Disablement, Score 9

**Mitigation Strategy:**

1. Add a remotely controlled kill switch with fail-safe behavior.
2. Release through staged cohorts with observable health thresholds.
3. Halt progression automatically or operationally when a threshold is breached.
4. Define rollback ownership, triggers, communication, and maximum response time.
5. Exercise disablement and rollback on an installed production-like build.

**Owner:** Product, Mobile Engineering, and Release Engineering  
**Timeline:** Before production rollout  
**Status:** Planned  
**Verification:** R-005 kill-switch, staged-rollout, and rollback exercises with audit evidence.  
**Residual Risk:** Store review remains relevant for permanent binary replacement; remote containment limits exposure during that interval.

### R-006: Non-Deterministic Multi-Entry Replay, Score 6

**Mitigation Strategy:**

1. Specify queue ordering and per-entry identity.
2. Make server application idempotent and acknowledgement durable.
3. Resume safely after process termination and partial acknowledgement.
4. Compact superseded local edits only after correctness is proven.
5. Reconcile final client, server, and dispatcher order state.

**Owner:** Mobile Engineering and Order Service Engineering  
**Timeline:** Before implementation completion  
**Status:** Planned  
**Verification:** R-006 integration crash matrix and final dispatcher E2E coverage.  
**Residual Risk:** Corrupt local storage can still require recovery policy; the acceptable data-loss objective and support procedure require approval.

---

## Assumptions and Dependencies

### Assumptions

1. The existing connected-order path, regional routing, billing schedule, and dispatcher rendering have stable regression suites available to the implementing team.
2. The order service can expose test-safe conflict, acknowledgement, and failure controls without changing production semantics.
3. Product and architecture owners will replace the explicit unsafe behaviors covered by R-001, R-002, R-003, and R-005 before release.
4. The accepted server order is the authoritative state observed by the dispatcher console.

### Dependencies

1. Approved local-data security and compliance controls are required before security test implementation can be accepted.
2. Conflict and queue replay specifications are required before R-002 and R-006 automation can be finalized.
3. Retry policy and recovery-state contracts are required before R-003 automation can be finalized.
4. Fleet device, network, payload, and concurrency profiles are required before R-004 results can be gated.
5. Remote disablement and staged-rollout controls are required before R-005 validation can begin.
6. Test environments, accounts, logs, metrics, audit records, device lab access, and deterministic server fault controls are required before QA execution.

### Risks to the Plan

- **Risk:** The repository fixture contains no implementation or existing test assets.
  - **Impact:** Framework fit, fixture reuse, endpoint details, and current coverage cannot be verified during design.
  - **Contingency:** Reconcile this plan with the implementation repository before automation and update scenario ownership or levels only when concrete evidence requires it.
- **Risk:** Several NFR thresholds remain UNKNOWN.
  - **Impact:** Security, capacity, resilience, and release-control evidence cannot receive an objective gate result.
  - **Contingency:** Treat the unknowns as entry blockers and record approved values in the test configuration and evidence manifest.
- **Risk:** Physical-device and production-like rollout environments may have limited scheduling capacity.
  - **Impact:** Nightly and weekly evidence can arrive late.
  - **Contingency:** Reserve the approved device profile and release-control environment before implementation completion; keep deterministic emulator and API coverage in pull requests.

---

## Follow-on Workflows, Manual

- Run `/bmad-testarch-atdd` to generate failing P0 test scaffolds through a separate workflow.
- Run `/bmad-testarch-automate` to implement broader coverage after the product implementation and test framework exist.
- Run `nfr-assess` when implementation evidence is available.

---

## Approval

**Test Design Approved By:**

- [ ] Product Manager: Unassigned. Date: Pending
- [ ] Mobile Tech Lead: Unassigned. Date: Pending
- [ ] Order Service Tech Lead: Unassigned. Date: Pending
- [ ] Security Lead: Unassigned. Date: Pending
- [ ] QA Lead: Unassigned. Date: Pending

**Comments:** Approval must record the resolved UNKNOWN thresholds and any time-limited waiver.

---

## Interworking and Regression

| Service or Component | Impact | Regression Scope |
| --- | --- | --- |
| Android order screen | Adds captured status and offline queue interactions while preserving existing rendering. | Existing component, interaction, accessibility, and visual regression coverage remains green. |
| Local SQLite queue | New persistence boundary for full order payloads and edits. | Atomic writes, encryption, backup exclusion, restart recovery, ordering, acknowledgement, compaction, and purge. |
| Android connectivity and lifecycle | Triggers automatic synchronization and can interrupt work at any process boundary. | Offline and reconnect transitions, process termination, device restart, background and foreground transitions, and operating-system version matrix. |
| Order service | Accepts queued orders and edits, resolves conflicts, acknowledges entries, and classifies failures. | Connected-order API regression, idempotency, version conflicts, validation errors, throttling, authentication, partial failures, and audit history. |
| Order database | Stores the accepted authoritative order. | Transactionality, duplicate prevention, version history, audit durability, and installation isolation. |
| Dispatcher web console | Reads accepted order data without a feature change. | Existing console regression plus final offline-order payload equality. Coordinate test data and environment access with the console owner. |
| Regional routing layer | Continues to enforce residency for synchronized requests. | Existing residency-route regression and confirmation that no bypass endpoint was introduced. Coordinate route evidence with the platform team. |
| Billing service | Remains untouched and runs on its nightly schedule. | Assert zero calls from capture and sync; run existing billing schedule regression. Coordinate observation with the billing owner. |
| Release control plane | Must gain kill-switch, staged-rollout, health-gate, and rollback capabilities. | Control authorization, audit trail, cohort targeting, threshold handling, disablement, and rollback rehearsal. Coordinate with Release Engineering and SRE. |

---

## Appendix

### Knowledge Base References

- `risk-governance.md`: Risk classification, ownership, mitigation, and gate guidance
- `probability-impact.md`: Probability and impact scoring methodology
- `test-levels-framework.md`: Unit, integration, API, component, and E2E level selection
- `test-priorities-matrix.md`: P0 through P3 business-priority classification
- `nfr-criteria.md`: NFR thresholds, planned validation, and evidence guidance

### Related Documents

- Epic: `field-order-capture/docs/epics/epic-7-offline-order-capture.md`
- TEA configuration: `field-order-capture/_bmad/config.toml`
- Requirements source policy: Epic 7 is the sole requirements source for this run.

---

**Generated by:** BMad TEA Agent, Test Architect Module  
**Workflow:** `bmad-testarch-test-design`  
**Version:** 5.0
