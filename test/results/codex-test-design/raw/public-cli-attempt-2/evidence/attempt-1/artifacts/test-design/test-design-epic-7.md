---
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-10-10T02:18:55Z'
inputDocuments:
  - '/private/tmp/remaining-skills-evidence/test-design-cli-recovery/field-order-capture/docs/epic-7.md'
  - '/private/tmp/remaining-skills-frozen/test-design-recovery/skills/bmod-tea/knowledge/risk-governance.md'
  - '/private/tmp/remaining-skills-frozen/test-design-recovery/skills/bmod-tea/knowledge/probability-impact.md'
  - '/private/tmp/remaining-skills-frozen/test-design-recovery/skills/bmod-tea/knowledge/test-levels-framework.md'
  - '/private/tmp/remaining-skills-frozen/test-design-recovery/skills/bmod-tea/knowledge/test-priorities-matrix.md'
  - '/private/tmp/remaining-skills-frozen/test-design-recovery/skills/bmod-tea/knowledge/nfr-criteria.md'
---

# Test Design: Epic 7, Offline Order Capture for Field Technicians

**Date:** 2026-10-09
**Author:** User
**Status:** Draft

## Executive Summary

**Scope:** Full epic-level test design for Epic 7.

The plan covers native Android offline capture, queued edits, automatic synchronization, server persistence, dispatcher-visible payload fidelity, and release controls. It also protects the explicit boundaries around tenancy, regional routing, billing, rendering, and browser independence.

**Risk Summary:**

* Total risks identified: 6
* High-priority risks with score at least 6: 6
* Critical score 9 risks: 4
* Critical categories: SEC, DATA, OPS, PERF

**Coverage Summary:**

* P0 scenarios: 13, about 90 to 140 hours
* P1 scenarios: 2, about 20 to 35 hours
* P2 scenarios: 1, about 6 to 12 hours
* P3 scenarios: 0, 0 hours
* Total effort: about 116 to 187 hours across roughly four to seven elapsed weeks with parallel specialist support

The unusually large P0 band follows the epic's documented exposure. Sensitive-data disclosure, silent order-line loss, unbounded retry, fleet-wide rollout failure, payload corruption, isolation regression, billing regression, and the required backlog recovery target each carry critical consequences without a source-supported recovery path.

## Not in Scope

| Item | Reasoning | Mitigation |
| --- | --- | --- |
| Offline capture for entities other than work orders | Epic 7 explicitly excludes it. | Run boundary regression 7.0-INT-001 to prove adjacent entities retain their connected workflow. |
| Changes to the dispatcher's web console | Epic 7 changes no dispatcher UI. | Validate the existing dispatcher-visible read model and unchanged payload through 7.3-API-001. |
| Changes to charging behavior | The existing billing service retains its nightly schedule, and Epic 7 must never call it. | Run billing-isolation regression 7.0-API-002. |
| Browser or web-view implementation for technicians | The technician client is a native Android application with no browser surface. | Run native rendering and dependency regression 7.0-E2E-001. |
| Automated test implementation | This workflow produces the plan and evidence contract only. | Generate tests through a separate ATDD or automation workflow after blockers and interfaces are resolved. |
| Final NFR status | Implementation evidence does not exist in the supplied project. | Run `nfr-assess` after the named evidence artifacts are available. |

## Risk Assessment

Probability and impact use a one through three scale. Score equals probability multiplied by impact. Scores 6 through 8 require mitigation. Score 9 blocks release until resolved or formally waived.

### High-Priority Risks (Score ≥6)

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Timeline |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| R-001 | SEC | Sensitive order data can be recovered from a lost, stolen, rooted, or forensically inspected device. Story 7.1 stores the customer card reference and billing address in a plain, unencrypted SQLite file protected only by the device screen lock. | 3 | 3 | 9 | Minimize offline fields. Encrypt remaining queue data with Android Keystore-backed keys. Exclude it from backups. Verify migration, deletion, logging, and device-compromise behavior. | Mobile lead and Security | Before implementation approval and release |
| R-002 | DATA | Legitimate order lines can be silently lost when two offline technicians edit the same work order. Story 7.2 applies arrival order without version or timestamp checks and retains no audit record of overwritten changes. | 3 | 3 | 9 | Add version-based conflict detection or an equivalent concurrency control. Preserve both change sets in an auditable conflict-resolution path. | Order service owner and Product | Before release |
| R-003 | OPS | A permanently rejected payload can cause a hot retry loop that drains battery and data, consumes server capacity, blocks queue progress, and runs for the life of the application. Story 7.3 specifies immediate indefinite retry with no backoff, attempt cap, or dead-letter path. | 3 | 3 | 9 | Classify failures. Add bounded exponential backoff with jitter, an attempt policy, poison-item isolation, continued queue progress, and operator-visible telemetry. | Mobile lead and SRE | Before release |
| R-004 | OPS | A severe defect can affect every technician and remain active for one to three days. Story 7.4 enables the feature universally with no feature flag, staged rollout, or remote disable path. | 3 | 3 | 9 | Add a remotely controlled kill switch and staged rollout with measured cohorts, auditable activation, rollback ownership, and a rehearsed disablement procedure. | Release Engineering and Product | Before production rollout |
| R-005 | DATA | An order can be altered, duplicated, omitted, or reordered across capture, edits, local persistence, upload, storage, and dispatcher retrieval. The acceptance criteria require the order to appear unchanged, while Stories 7.1 and 7.2 use full-payload entries and append every edit. | 2 | 3 | 6 | Define identity, ordering, idempotency, edit supersession, and transaction boundaries. Compare canonical payloads at every persistence and transport boundary. | Mobile lead and Order service owner | Before feature completion |
| R-006 | PERF | A full 2,000-item backlog can miss the 30-second recovery target on fleet hardware, delaying dispatch visibility after connectivity returns. Story 7.3 supplies the item count, time budget, and hardware class. | 2 | 3 | 6 | Define the representative device, OS, payload mix, network profile, server load, and measurement percentile. Benchmark the complete path and retain profiles. | Performance Engineering and Mobile lead | Baseline before the release candidate; gate every release candidate |

### Medium-Priority Risks (Score 3-4)

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |
| None | N/A | No evidence-supported risk scored in this band. |  |  |  | Continue discovery as implementation evidence becomes available. | Test Architect |

### Low-Priority Risks (Score 1-2)

| Risk ID | Category | Description | Probability | Impact | Score | Action |
| --- | --- | --- | ---: | ---: | ---: | --- |
| None | N/A | No evidence-supported risk scored in this band. |  |  |  | Document new evidence during implementation. |

### Risk Category Legend

* **TECH**: Technical or architecture fragility, integration defects, and scalability design issues
* **SEC**: Access-control, authorization, and data-exposure risks
* **PERF**: SLA violations, degradation, and resource-limit risks
* **DATA**: Data loss, corruption, duplication, and inconsistency
* **BUS**: Business logic, revenue, and user-outcome risks
* **OPS**: Deployment, configuration, monitoring, and operational-recovery risks

### Residual Risk

Implementation details, existing controls, and test evidence are absent. Every risk remains open. R-001 through R-004 retain score 9 until the listed production controls exist and their linked P0 coverage passes. R-005 and R-006 retain score 6 until their interfaces, thresholds, and evidence are complete. A formal waiver requires an approver, rationale, compensating controls, and expiry date.

## NFR Planning

**Purpose:** Capture epic-specific NFR thresholds, planned validation, and evidence expected for later `nfr-assess`. Final NFR decisions require implementation evidence.

| NFR Category | Requirement / Threshold | Risk Link | Planned Validation | Evidence Needed |
| --- | --- | --- | --- | --- |
| Security | Sensitive local queue data requires an approved protection policy. Permitted fields, encryption standard, key lifecycle, backup policy, and deletion deadline are UNKNOWN. | R-001 | On-device persistence and backup inspection, keystore tests, static and dependency scans, tenant-isolation API checks, and security review. | Database inspection report, keystore output, backup inspection, scan reports, tenant-isolation results, and approval record. |
| Performance | A 2,000-item queue must finish syncing within 30 seconds on fleet mid-range devices. Device model, Android version, payload mix, network profile, server load, and percentile are UNKNOWN. | R-006 | Instrumented native device benchmark with server profiling. | Raw timing distribution, declared test profile, CPU, memory, battery, bytes, error rate, server saturation metrics, and profiler output. |
| Reliability | Capture and editing must survive offline operation until server acceptance. Upload must begin automatically on a usable network. Retry cap, backoff, poison-item recovery objective, process-death durability, and observability thresholds are UNKNOWN. | R-003, R-005 | Native lifecycle and connectivity tests, API fault injection, queue-state checks, restart recovery, idempotency checks, and telemetry assertions. | Device-run results, queue snapshots, fault logs, retry schedule, duplicate-effect results, and correlated sync telemetry. |
| Scalability | Each device carries up to 2,000 items. Concurrent reconnect volume and server capacity objectives are UNKNOWN. | R-006 | Coordinated reconnect load with multiple device clients and saturation measurement. | Throughput and latency distributions, saturation point, capacity model, and queue-drain completion distribution. |
| Maintainability and operability | Release requires a kill switch, measured cohorts, diagnostics, and actionable alerts. Kill-switch propagation, rollout policy, alert thresholds, coverage target beyond the workflow gate, and telemetry retention are UNKNOWN. | R-003, R-004 | Rollout and rollback drill, remote-disable verification, CI checks, structured-logging checks, alert tests, and runbook review. | Drill report, disablement timestamp and audit record, CI reports, telemetry schema, alert output, dashboard capture, and approved runbook. |
| Compliance and privacy | Installations must remain isolated and regional routing must remain unchanged. Applicable payment-data, privacy, retention, erasure, and lost-device obligations are UNKNOWN. | R-001 | Data inventory, compliance review, local retention and erasure tests, and isolation and routing regression tests. | Data-flow inventory, review approval, erasure results, and regional-routing and tenant-isolation reports. |

**Unknown thresholds:** Offline-field allowlist, encryption algorithm, key rotation, retention and deletion, approved device-compromise model, representative device and Android version, payload distribution, network conditions, concurrency, performance percentile, retry cap, backoff schedule, poison-item objective, durability across app death and reboot, kill-switch propagation, rollout cohorts, alert thresholds, telemetry retention, and governing compliance obligations.

## Entry Criteria

* [ ] R-001 through R-004 have approved production-control designs, owners, and implementation commitments.
* [ ] Queue identity, ordering, idempotency, supersession, and transaction semantics are documented.
* [ ] Conflict behavior and the user-visible resolution workflow are agreed by Product, Mobile, Service, and QA.
* [ ] Representative fleet device, Android version, payload distribution, network profile, server load, and performance percentile are defined.
* [ ] Native test framework, device lab, API harness, fault-injection controls, and observability access are provisioned.
* [ ] Factories can create work orders, parts, labour, assignments, technician identities, server responses, and deterministic 2,000-item queues.
* [ ] Feature build, server build, dispatcher read model, billing-call observation, routing evidence, and isolated test tenants are accessible.
* [ ] Security and compliance owners approve the offline data inventory and test procedure.

## Exit Criteria

* [ ] P0 pass rate is 100 percent.
* [ ] P1 pass rate is at least 95 percent, with an approved waiver for any failure.
* [ ] P2 pass rate is at least 90 percent.
* [ ] No open severity 1 or severity 2 defect affects Epic 7.
* [ ] Every score 9 risk is resolved or formally waived. Every score 6 risk has completed mitigation and passing linked coverage.
* [ ] Every acceptance criterion and scored risk maps to automated coverage. Overall planned requirement coverage is at least 80 percent, and P0 requirement coverage is 100 percent.
* [ ] The 2,000-item backlog meets 30 seconds under the approved test profile.
* [ ] Every in-scope NFR category has the named evidence artifact ready for `nfr-assess`.
* [ ] Tenant isolation, regional routing, billing behavior, and native-only rendering regressions pass.

## Test Coverage Plan

P0, P1, P2, and P3 express priority. Execution timing appears only in the Execution Strategy section.

### P0 (Critical)

**Criteria**: Critical business, security, data-integrity, or compliance impact with no safe workaround. Risk score is supporting evidence and is not a required condition.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| --- | --- | --- | ---: | --- | --- |
| 7.1-E2E-001: Save a parts-and-labour order with all connectivity disabled. Verify the native app lists it as captured and sends no server request. | E2E | R-005 | 1 | Mobile QA | Failure loses the core field order. The epic gives no recovery path for an order already reported as captured. |
| 7.1-INT-001: Inspect the device database, backups, logs, and temporary files after capture and edit. Verify prohibited sensitive fields are absent or protected with non-exportable keys. | Integration | R-001 | 1 | Security and Mobile QA | The integration level observes the real persistence and key boundary. File extraction defeats the stated screen-lock-only control. |
| 7.1-E2E-002: Kill and restart the app, then reboot the device while offline. Verify the captured order remains present and editable until acceptance. | E2E | R-005 | 1 | Mobile QA | Failure loses or strands a full order. The source supplies no restoration workflow. |
| 7.2-INT-001: Apply several offline edits. Verify atomic queue transactions, stable identity, ordering, supersession, and one logical server effect. | Integration | R-005 | 1 | Mobile QA and Service QA | This level isolates SQLite and application boundary behavior. Failure corrupts or duplicates order data. |
| 7.2-E2E-001: Use two offline technicians on the same work order and sync in both arrival orders. Verify conflict detection preserves both change sets or presents an auditable resolution. | E2E | R-002 | 1 | Mobile QA and Service QA | Failure silently deletes legitimate labour or parts. Story 7.2 documents no recovery record. |
| 7.3-E2E-001: Restore a usable network. Verify upload begins without user action and each accepted order leaves editable queue state exactly once. | E2E | R-005 | 1 | Mobile QA | Failure strands the order. The epic defines no manual sync recovery. |
| 7.3-API-001: Compare canonical payloads at capture, local persistence, upload, server storage, and dispatcher retrieval. Verify fields and line ordering remain unchanged. | API | R-005 | 1 | Service QA | API and persistence checks establish exact serialization fidelity. Failure gives dispatch altered information. |
| 7.3-API-002: Inject transient timeouts and retryable failures. Verify bounded backoff with jitter, eventual acceptance, one logical server effect, and retry telemetry. | API | R-003 | 1 | Service QA | Failure can duplicate work or overload the system. Pausing the application leaves the core order unresolved. |
| 7.3-API-003: Place a permanently rejected payload before valid items. Verify attempt limits, poison-item isolation, queue progress, operator-visible failure, and restart recovery. | API | R-003 | 1 | Service QA and SRE | Failure creates an indefinite hot loop and can block every later order. |
| 7.3-E2E-003: Sync 2,000 representative items within 30 seconds on the approved fleet device profile while collecting device and server metrics. | E2E performance | R-006 | 1 | Performance Engineering and Mobile QA | The complete device path establishes the stated hardware budget. Delayed dispatch has no documented recovery target. |
| 7.4-E2E-001: Exercise cohort rollout, remote disablement, and audit logging in a production-like release environment. | E2E operational | R-004 | 1 | Release Engineering and QA | Failure exposes the fleet and leaves a one-to-three-day store release as the documented recovery. |
| 7.0-API-001: Attempt cross-installation order access and verify regional routing for captured and synced data. | API | None | 1 | Security and Service QA | Tenant disclosure has critical privacy impact. The epic declares isolation and routing as satisfied constraints that require regression protection. |
| 7.0-API-002: Observe service calls and billing records throughout capture, edit, retry, and sync. Verify no billing call or schedule change. | API | None | 1 | Service QA | Unexpected charging has direct financial impact and no acceptable workaround. |

**Total P0**: 13 tests, about 90 to 140 hours.

### P1 (High)

**Criteria**: Core, frequent, or complex behavior with material user reach and a limited workaround. Risk score is supporting evidence and is not a required condition.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| --- | --- | --- | ---: | --- | --- |
| 7.3-E2E-002: Alternate offline, captive, degraded, and usable network states with repeated operating-system callbacks. Verify one sync worker, stable queue state, no duplicate effect, and automatic recovery. | E2E | R-003, R-005 | 1 | Mobile QA | Connectivity transitions are frequent and complex. Waiting is a limited workaround when the durable queue later recovers automatically. |
| 7.0-INT-001: Attempt offline capture for work orders and every adjacent capture entity. Verify only work orders gain offline behavior. | Integration | None | 1 | Mobile QA | Scope leakage affects adjacent workflows. Their existing connected flow remains an acceptable fallback. |

**Total P1**: 2 tests, about 20 to 35 hours.

### P2 (Medium)

**Criteria**: Secondary behavior with narrower user reach and an acceptable workaround. Risk score is supporting evidence and is not a required condition.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| --- | --- | --- | ---: | --- | --- |
| 7.0-E2E-001: Compare the existing native order screen before and after enablement. Verify rendering remains unchanged and no browser or web-view dependency appears. | E2E | None | 1 | Mobile QA | This guards the explicit presentation boundary. A corrected native build is an acceptable recovery for the narrower rendering concern. |

**Total P2**: 1 test, about 6 to 12 hours.

### P3 (Low)

**Criteria**: Rare, cosmetic, or experimental behavior with minimal impact and an easy workaround. Risk score is supporting evidence and is not a required condition.

No P3 scenarios are planned. Every supported behavior belongs to the field order workflow or an explicit regression boundary with at least secondary customer impact.

**Total P3**: 0 tests, 0 hours.

## NFR Test Coverage Plan

| NFR Category | Requirement / Threshold | Planned Validation | Tool / Level | Evidence Artifact | Priority |
| --- | --- | --- | --- | --- | --- |
| Security | Approved sensitive-field, encryption, key, backup, retention, and deletion policy. Current threshold details are UNKNOWN. | Device storage inspection, key lifecycle, static scan, dependency scan, tenant isolation, and security review. | Native integration, API, security scanners | Security report and raw inspection or scan outputs | P0 |
| Performance | 2,000 queued items in 30 seconds on an approved fleet profile. Several profile dimensions remain UNKNOWN. | Full native queue drain with device and server instrumentation. | Native E2E performance and server profiler | Timing distribution, declared profile, resource metrics, and profiler output | P0 |
| Reliability | Automatic sync, durable editable queue, bounded retries, poison isolation, and idempotent server effects. Several recovery thresholds remain UNKNOWN. | Lifecycle, connectivity, restart, transient failure, permanent rejection, and duplicate-effect scenarios. | Native E2E and API fault injection | Run results, queue snapshots, retry schedule, logs, and correlated telemetry | P0 |
| Scalability | Concurrent reconnect capacity is UNKNOWN. Per-device workload is 2,000 items. | Coordinated clients under increasing load through saturation. | Distributed load harness and server metrics | Capacity report, throughput and latency distributions, and saturation point | P0 |
| Maintainability and operability | Kill switch, cohorts, diagnostics, alerts, and runbooks. Propagation and alert thresholds are UNKNOWN. | Release drill, remote-disable check, CI checks, telemetry-contract checks, and alert tests. | Operational E2E, CI, monitoring | Drill report, audit record, CI results, telemetry schema, and alert output | P0 |
| Compliance and privacy | Tenant isolation and regional routing remain unchanged. Governing offline-data obligations are UNKNOWN. | Data inventory, compliance review, retention and erasure checks, isolation and routing regression. | Review, native integration, API | Approved inventory and review, erasure results, isolation report, and routing report | P0 |

Missing authoritative thresholds block a measurable result for the affected NFR. The later `nfr-assess` workflow should consume these artifacts and assign the final status.

## Execution Strategy

**Philosophy:** Run every functional scenario in pull requests while the suite stays under 15 minutes. Defer work with material infrastructure or duration cost. Priority and execution timing remain separate decisions.

* **Pull request:** Run all unit, integration, API, and native functional tests when the combined functional suite stays below 15 minutes. Use parallel test workers and device shards with a target duration of 10 to 15 minutes. If the full device set exceeds 15 minutes, run the P0 native smoke slice plus every lower-level functional check.
* **Nightly:** Run the complete device matrix, lifecycle and connectivity-fault suite, security inspection, moderate coordinated reconnect load, and any functional device cases deferred for infrastructure duration.
* **Weekly:** Run the 2,000-item performance gate, fleet-scale reconnect test, extended reliability and endurance work, security scanning, and rollout or kill-switch drill in an isolated production-like environment.

Within each scheduled run, execute environment and fixture smoke checks first, followed by P0, P1, P2, and any future P3 scenarios.

Every tier retains machine-readable results, device and build identity, logs, queue-state evidence, and server correlation identifiers. A result that cannot measure its asserted outcome fails its tier. Quarantined P0 and P1 tests do not count toward pass rates.

## Resource Estimates

### Test Development Effort

| Priority | Count | Effort Range | Notes |
| --- | ---: | ---: | --- |
| P0 | 13 | About 90 to 140 hours | Native devices, security inspection, concurrency, performance, and release controls drive setup complexity. |
| P1 | 2 | About 20 to 35 hours | Connectivity-state control and adjacent-flow fixtures require integration work. |
| P2 | 1 | About 6 to 12 hours | Native rendering baseline and dependency inspection. |
| P3 | 0 | 0 hours | No scenarios planned. |
| **Total** | **16** | **About 116 to 187 hours** | Includes harnesses, fixtures, devices, telemetry assertions, automation, and retained evidence. |

Estimated elapsed time is about four to seven weeks with Mobile QA, Service QA, Security, Performance Engineering, SRE, and Release Engineering available in parallel. Production implementation of risk controls is excluded.

### Prerequisites

**Test Data:**

* Work-order factory with parts, labour, billing address, stored card reference token, assignment, and deterministic identifiers
* Queue factory for ordered, edited, malformed, permanently rejected, and 2,000-item backlogs
* Two-technician concurrent-edit fixture with deterministic sync order
* Automatic cleanup that preserves failed-run evidence while deleting accepted test orders after collection

**Tooling:**

* Project-selected native Android test runner for device journeys and lifecycle control
* SQLite and Android backup inspection tooling for local-data verification
* API harness with deterministic server fault injection and correlation IDs
* Device and server profiling tools for time, CPU, memory, battery, network, and saturation evidence
* Security and dependency scanners selected by the Security owner

The repository does not identify a test stack or contain the configured Playwright Utils or Pact.js Utils packages. Tool-specific bindings remain open until the implementation repository and dependencies are available.

**Environment:**

* Representative physical or equivalent fleet device with fixed Android version and resettable state
* Isolated single-tenant installations plus a second installation for isolation probes
* Controllable network profiles covering offline, captive, degraded, usable, and flapping states
* Production-like order server, dispatcher read model, telemetry, release controls, and observable billing boundary
* Load environment sized for coordinated reconnects without affecting shared users

## Quality Gate Criteria

### Pass/Fail Thresholds

* **P0 pass rate**: 100 percent with no exceptions
* **P1 pass rate**: At least 95 percent; every failure requires a formal waiver
* **P2 pass rate**: At least 90 percent
* **High-risk mitigations**: 100 percent complete or covered by approved waivers with expiry

### Coverage Targets

* **Critical paths**: At least 80 percent, with every listed P0 requirement covered
* **Acceptance criteria**: 100 percent mapped to automated scenarios
* **Scored risks**: 100 percent linked to suitable automated coverage
* **Security scenarios**: 100 percent
* **Business logic**: At least 70 percent
* **Edge cases**: At least 50 percent

### Non-Negotiable Requirements

* [ ] All P0 tests pass.
* [ ] No score 9 risk remains open without a formal waiver carrying approver, rationale, compensating controls, and expiry.
* [ ] Every score 6 risk has completed mitigation and passing linked coverage.
* [ ] R-001 security coverage passes 100 percent.
* [ ] R-006 meets 2,000 items in 30 seconds under the approved profile.
* [ ] The named evidence exists for every in-scope NFR category.
* [ ] Final NFR status is assigned later through `nfr-assess`.
* [ ] No open severity 1 or severity 2 defect affects Epic 7.

## Mitigation Plans

### R-001: Unencrypted Sensitive Queue Data (Score: 9)

**Mitigation Strategy:** Minimize offline fields; encrypt required data with non-exportable keys; exclude data from backup and logs; define retention and secure deletion; exercise migration and device-loss behavior.
**Owner:** Mobile lead and Security
**Timeline:** Before implementation approval and release
**Status:** Planned
**Verification:** 7.1-INT-001 plus scan reports and security approval
**Residual risk:** Rooted-device and key-compromise exposure remains until the approved threat model and compensating controls quantify it.

### R-002: Silent Concurrent-Edit Loss (Score: 9)

**Mitigation Strategy:** Carry a server version or equivalent causal token; reject conflicting writes safely; preserve both change sets; give users an auditable resolution path.
**Owner:** Order service owner and Product
**Timeline:** Before release
**Status:** Planned
**Verification:** 7.2-E2E-001 across both arrival orders and repeated conflict cycles
**Residual risk:** Business conflict-resolution policy remains undefined.

### R-003: Unbounded Immediate Retry (Score: 9)

**Mitigation Strategy:** Classify failure types; implement bounded exponential backoff with jitter; cap attempts; isolate poison items; preserve progress; expose diagnostics and recovery.
**Owner:** Mobile lead and SRE
**Timeline:** Before release
**Status:** Planned
**Verification:** 7.3-API-002, 7.3-API-003, and 7.3-E2E-002 with retained telemetry
**Residual risk:** Retry and recovery thresholds remain undefined.

### R-004: Fleet-Wide Release Without Rapid Disablement (Score: 9)

**Mitigation Strategy:** Add a remotely controlled kill switch; stage measured cohorts; record every activation; define rollback ownership; rehearse disablement.
**Owner:** Release Engineering and Product
**Timeline:** Before production rollout
**Status:** Planned
**Verification:** 7.4-E2E-001 in a production-like environment
**Residual risk:** Store replacement still takes one to three days if remote controls fail.

### R-005: End-to-End Order Integrity Failure (Score: 6)

**Mitigation Strategy:** Define canonical payloads, stable queue identity, ordering, transaction boundaries, edit supersession, and idempotent server handling.
**Owner:** Mobile lead and Order service owner
**Timeline:** Before feature completion
**Status:** Planned
**Verification:** 7.1-E2E-001, 7.1-E2E-002, 7.2-INT-001, 7.3-E2E-001, 7.3-API-001, and 7.3-E2E-002
**Residual risk:** Canonicalization and idempotency contracts remain undefined.

### R-006: Backlog Recovery Misses 30 Seconds (Score: 6)

**Mitigation Strategy:** Define the complete performance profile; benchmark early; profile client and server bottlenecks; establish capacity and regression baselines.
**Owner:** Performance Engineering and Mobile lead
**Timeline:** Baseline before the release candidate; gate every release candidate
**Status:** Planned
**Verification:** 7.3-E2E-003 plus coordinated reconnect capacity evidence
**Residual risk:** The result cannot be interpreted until hardware, network, payload, load, and percentile definitions exist.

## Assumptions and Dependencies

### Assumptions

1. The supplied Epic 7 document is the complete requirements and architecture evidence for this run.
2. The order server and dispatcher read model expose a stable way to correlate and compare the canonical order payload.
3. Existing platform controls continue to enforce single-tenant isolation and regional routing.
4. Existing billing behavior remains independently observable during tests.
5. A project-specific Android and API automation stack will be selected when implementation evidence becomes available.

### Dependencies

1. Mobile and service teams must define queue, conflict, idempotency, and canonical payload contracts before test implementation.
2. Security and compliance must approve the offline field inventory and storage controls before device security testing.
3. Product must approve conflict-resolution behavior before concurrent-edit acceptance testing.
4. Release Engineering must provide kill-switch and staged-rollout controls before the operational gate.
5. Performance Engineering must approve the test profile before the 30-second result can gate release.
6. SRE must expose correlated retry, queue, server, and alert telemetry before reliability evidence collection.

### Risks to Plan

* **Risk:** The implementation repository and test stack are unavailable.
  * **Impact:** Harness-specific estimates and integration details remain broad.
  * **Contingency:** Confirm the native and API stack at test implementation kickoff and retain this plan's level and evidence contracts.
* **Risk:** Representative fleet hardware and network profiles are undefined.
  * **Impact:** Performance results can be precise and still fail to represent technicians.
  * **Contingency:** Block R-006 gate execution until Product, Mobile, and Performance Engineering approve the profile.
* **Risk:** Security and compliance thresholds are undefined.
  * **Impact:** Automated checks cannot establish acceptable protection or retention.
  * **Contingency:** Keep R-001 open and require written policy before implementation approval.

## Follow-on Workflows (Manual)

* Run `/bmad-testarch-atdd` to generate failing P0 acceptance-test scaffolds after entry criteria are met.
* Run `/bmad-testarch-automate` for broader coverage after implementation exists.
* Run `nfr-assess` after the required evidence artifacts exist.

## Approval

**Test Design Approved By:**

* [ ] Product Manager: Unassigned. Date: Pending
* [ ] Mobile Tech Lead: Unassigned. Date: Pending
* [ ] Order Service Lead: Unassigned. Date: Pending
* [ ] Security Owner: Unassigned. Date: Pending
* [ ] QA Lead: Unassigned. Date: Pending

**Comments:** Approval is blocked by unresolved score 9 risks and missing authoritative NFR thresholds.

## Interworking & Regression

| Service/Component | Impact | Regression Scope |
| --- | --- | --- |
| Native Android order client | Adds offline capture, editing, queue lifecycle, and automatic sync. | Existing connected capture, native rendering, app lifecycle, connectivity handling, storage, and adjacent entity flows. |
| Local SQLite queue | Stores full order payloads and edit history pending acceptance. | Atomic writes, persistence, ordering, identity, encryption, backup exclusion, deletion, capacity, and restart recovery. |
| Order ingestion service | Accepts queued payloads and determines ordering, idempotency, validation, and conflicts. | Existing online ingestion, validation, duplicate handling, concurrency, failure classification, and transaction behavior. |
| Dispatcher read model and web console | Must show the accepted order unchanged. | Canonical payload fidelity and existing read behavior. No UI change is planned. |
| Network-state integration | Triggers unattended queue upload. | Offline, captive, degraded, restored, and flapping states; repeated callbacks; single-worker behavior. |
| Billing service | Must remain untouched and retain its nightly schedule. | No calls from offline capture or sync; no new charge events or timing changes. |
| Regional routing layer | Must continue enforcing residency. | Captured and synced data stays on the existing regional path. |
| Tenant deployment boundary | Installations continue to use isolated databases and application servers. | Cross-installation access probes and storage-identifier isolation. |
| Release controls | Current epic proposes universal enablement. | Cohort selection, kill switch, activation audit, rollback drill, and alerting after mitigation. |

Cross-team coordination is required among Mobile, Order Service, Product, Security, SRE, Performance Engineering, Release Engineering, and QA for the named controls and evidence.

## Appendix

### Knowledge Base References

* `risk-governance.md`: risk classification, ownership, mitigation, and gate rules
* `probability-impact.md`: probability, impact, score, and action thresholds
* `test-levels-framework.md`: unit, integration, API, and E2E selection
* `test-priorities-matrix.md`: independent P0 through P3 priority decisions
* `nfr-criteria.md`: NFR threshold, evidence, and tool guidance

### Related Documents

* Epic: `/private/tmp/remaining-skills-evidence/test-design-cli-recovery/field-order-capture/docs/epic-7.md`
* PRD: N/A. No PRD was supplied for this run.
* Architecture: N/A. No architecture document was supplied for this run.
* Tech Spec: N/A. No technical specification was supplied for this run.

**Generated by:** BMad TEA Agent, Test Architect Module
**Workflow:** `bmad-testarch-test-design`
**Version:** 4.0
