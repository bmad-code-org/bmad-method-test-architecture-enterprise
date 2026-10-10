---
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-10-10T01:46:48Z'
---

# Test Design: Epic 7: Offline order capture for field technicians

**Date:** 2026-10-09  
**Author:** User  
**Status:** Draft

---

## Executive Summary

**Scope:** Full epic-level test design for Epic 7

This plan covers offline capture and editing of field work orders on Android, durable SQLite queueing, automatic synchronization, unchanged server and dispatcher data, the 2,000-item recovery target, and the controls needed for safe fleet rollout. The supplied evidence exposes four release-blocking score-9 risks and two score-6 risks.

**Risk Summary:**

- Total risks identified: 6
- High-priority risks with a score of at least 6: 6
- Critical categories: security, data integrity, operations, and performance
- Release blockers: sensitive local data exposure, silent concurrent-edit loss, unbounded retry storms, and fleet-wide release without rapid disablement

**Coverage Summary:**

- P0 scenarios: 15, estimated at about 120 to 180 hours
- P1 scenarios: 5, estimated at about 50 to 80 hours
- P2/P3 scenarios: 1, estimated at about 8 to 16 hours
- **Total effort:** About 178 to 276 hours across roughly 4 to 7 weeks with two test engineers

---

## Not in Scope

| Item | Reasoning | Mitigation |
| --- | --- | --- |
| **Changes to billing behavior or schedule** | Epic 7 keeps billing unchanged and requires the offline path to avoid the billing service. | Add a service-spy or trace assertion proving zero billing calls and retain the existing billing regression suite. |
| **Dispatcher console visual redesign** | The epic requires unchanged order data at the dispatcher boundary and supplies no console implementation or visual requirements. | Validate the dispatcher read path and canonical payload equality. Keep the existing console regression suite as an entry and exit dependency. |
| **Browser automation** | The product surface in scope is a native Android application. Configuration sets browser automation to `none`. | Use Android device E2E coverage plus API and component tests at the service boundaries. |
| **Test implementation and final NFR assessment** | This workflow produces a design before implementation evidence exists. | Run the ATDD and automation workflows explicitly. Run `nfr-assess` after evidence has been collected. |

---

## Risk Assessment

### High-Priority Risks (Score ≥6)

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Timeline |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| R-001 | SEC | A lost, stolen, rooted, backed-up, or forensically inspected device can expose the customer's stored card reference and billing address because the outbound queue is a plain SQLite file with no encryption at rest. | 3 | 3 | 9 | Encrypt sensitive queue data with Android Keystore-backed keys; exclude fields that sync does not require; block backup and debug extraction; add device-storage security tests and a threat review. | Mobile Security Lead | Before implementation approval and release |
| R-002 | DATA | Concurrent offline edits can silently erase a technician's parts and labour lines, leaving no audit record or conflict signal. | 3 | 3 | 9 | Add optimistic versioning or conflict-aware merge semantics; retain immutable edit history; surface conflicts for resolution; test both arrival orders and reconnect timing permutations. | Order Domain Lead | Before server contract freeze |
| R-003 | OPS | A permanently rejected payload can produce an unlimited hot retry loop that consumes device battery and network capacity and continuously loads the server. | 3 | 3 | 9 | Classify transient and permanent failures; add bounded exponential backoff with jitter, retry budgets, quarantine or dead-letter handling, operator visibility, and recovery controls. | Mobile Sync Lead and SRE Lead | Before reliability testing |
| R-004 | OPS | A defective release reaches every technician at once and remains active for one to three days while a replacement build clears store review. | 3 | 3 | 9 | Add a remotely controlled kill switch, staged cohort rollout, release health telemetry, and rollback criteria validated in a production-like rehearsal. | Release Engineering Lead | Before production rollout |
| R-005 | PERF | A full working-day backlog can miss the 30-second recovery objective on fleet hardware, delaying dispatcher visibility and extending duplicate or conflicting work. | 2 | 3 | 6 | Benchmark representative payload distributions on named fleet devices and controlled networks; profile SQLite reads, serialization, batching, and server ingestion; enforce the threshold in device and API performance gates. | Performance Test Lead | Before release candidate |
| R-006 | DATA | An order can be changed, truncated, duplicated, or incompletely persisted across the local queue, upload, server storage, and dispatcher read path, violating the required unchanged result. | 2 | 3 | 6 | Define canonical payload equality and stable identifiers; verify field-by-field round trips, transaction atomicity, ordering, duplicate delivery behavior, and server persistence with representative maximum payloads. | Order Platform Lead | Before end-to-end acceptance |

### Medium-Priority Risks (Score 3-4)

The supplied epic evidence produced zero medium-priority risks.

### Low-Priority Risks (Score 1-2)

The supplied epic evidence produced zero low-priority risks.

### Risk Category Legend

- **TECH**: Technical and architecture flaws, integration issues, and scalability defects
- **SEC**: Access control, authentication, privacy, and data-exposure weaknesses
- **PERF**: Response-time, throughput, resource, and scalability shortfalls
- **DATA**: Loss, corruption, duplication, truncation, and inconsistency
- **BUS**: User, revenue, and business-logic harm
- **OPS**: Deployment, configuration, monitoring, recovery, and operational failures

### Residual Risk

| Risk ID | Residual risk after planned mitigation | Acceptance condition |
| --- | --- | --- |
| R-001 | Rooted-device and key-compromise exposure can remain possible within the approved mobile threat model. | Security and privacy owners approve the threat model, key lifecycle, retention rules, extraction resistance, and evidence. |
| R-002 | Simultaneous edits may still require human resolution when changes cannot merge safely. | Both versions remain recoverable, the conflict is visible and auditable, and resolution preserves chosen work. |
| R-003 | Transient outages can delay sync and quarantined permanent failures can require operator action. | Retry budgets protect device and server resources, valid work continues, and diagnostics support recovery. |
| R-004 | A staged cohort can still encounter defects before broad release. | Telemetry detects the defect within approved alert thresholds and the kill switch meets the approved disable-time target. |
| R-005 | Performance can vary by device, payload, radio, and server load. | Every approved gate profile completes 2,000 items within 30 seconds, with raw measurements retained. |
| R-006 | Future schema evolution can introduce new transformation faults. | Canonical equality, compatibility fixtures, and round-trip coverage become required release evidence for schema changes. |

---

## NFR Planning

**Purpose:** Capture epic-specific NFR thresholds, planned validation, and evidence expected for later `nfr-assess`. Final NFR status requires implementation evidence from that workflow.

| NFR Category | Requirement / Threshold | Risk Link | Planned Validation | Evidence Needed |
| --- | --- | --- | --- | --- |
| Security | Protect stored card references and billing addresses at rest. The approved encryption strength, retention period, backup policy, and extraction-resistance threshold are **UNKNOWN**. | R-001 | Inspect device storage, Android Keystore behavior, backup exclusion, logs, crash reports, screenshots, and diagnostic exports. | Threat model; device test report; extracted database sample; backup manifest evidence; mobile security review. |
| Performance | Sync exactly 2,000 queued items within 30 seconds on fleet-representative mid-range devices. Device models, payload mix, network profile, server load, timer start, and completion boundary are **UNKNOWN**. | R-005 | Run physical-device benchmarks under controlled network and server-load profiles; profile local and server processing. | Raw samples; p50, p95, and maximum time; CPU, memory, battery, network, API latency, and server-throughput reports. |
| Reliability | Start upload automatically on a usable network and complete without technician action. Trigger latency, lifecycle durability, target success rate, retry ceiling, idempotency rules, and poison-message handling are **UNKNOWN**. | R-003, R-006 | Exercise connectivity transitions, process death, reboot, fault injection, bounded retry, permanent rejection, duplicate delivery, and recovery. | Device traces; component results; retry metrics; quarantine records; API results; recovery logs. |
| Scalability | Support one device with 2,000 queued items. Fleet-wide reconnect concurrency, sustained throughput, queue growth ceiling, and server budgets are **UNKNOWN**. | R-003, R-005 | Run agreed fleet reconnect load and spike profiles while measuring queue drain and storage saturation. | Load-test report; request rate; throughput; database saturation; error rate; recovery time. |
| Maintainability | Provide deterministic queue-state coverage, structured diagnostics, trace correlation, static analysis, and a support runbook. Coverage, logging, and supportability thresholds are **UNKNOWN** beyond this plan's quality gates. | R-003, R-006 | Run unit and component suites, static and dependency analysis, log-schema checks, and a runbook exercise. | CI coverage report; analysis reports; dependency scan; log schema; runbook exercise record. |
| Compliance and privacy | Preserve tenant isolation and regional routing while handling billing-related data locally. Card-reference classification, applicable PCI and privacy controls, deletion SLA, and audit requirements are **UNKNOWN**. | R-001 | Review the data inventory; test retention, deletion, isolation, regional routing, backups, and diagnostic exports. | Approved privacy review; deletion output; routing traces; isolation output; audit evidence. |
| Operations | Support controlled rollout and rapid remote disablement. The required disable time and alert thresholds are **UNKNOWN**. | R-004 | Rehearse cohort rollout, kill-switch propagation, authorization, audit logging, alerts, and recovery. | Rollout rehearsal report; control-plane audit log; alert evidence; measured disable time. |

**Unknown thresholds:** Encryption policy, retention, backup treatment, extraction resistance, card-reference classification, privacy and PCI applicability, deletion SLA, audit requirements, gate devices, payload distribution, network and server-load profiles, timer boundaries, sync success rate, lifecycle durability, retry ceilings, poison-message handling, fleet concurrency, server budgets, queue growth, observability targets, rollback time, and alert thresholds.

---

## Entry Criteria

- [ ] QA, development, product, security, SRE, and release owners approve the requirements, assumptions, and risk treatments.
- [ ] R-001 through R-004 have approved designs before implementation acceptance testing begins.
- [ ] Canonical payload equality, stable identifiers, conflict semantics, server idempotency, retry budgets, and quarantine behavior are documented.
- [ ] Fleet-representative Android device and OS profiles, network profiles, payload distribution, server load, and 30-second timer boundaries are defined.
- [ ] Android builds, API environment, dispatcher read endpoint, controlled network tooling, telemetry, and rollout control plane are accessible.
- [ ] Isolated tenant and region fixtures, a 2,000-item queue generator, sensitive-data fixtures, concurrent-client fixtures, and cleanup routines are ready.
- [ ] The feature is deployed to a production-like environment with the required diagnostics enabled.

## Exit Criteria

- [ ] P0 pass rate is 100 percent.
- [ ] P1 pass rate is at least 95 percent, with every failure triaged and owned.
- [ ] P2/P3 pass rate is at least 90 percent and recorded for release review.
- [ ] All score-6 and score-9 mitigations have evidence. Every score-9 risk is resolved or has a formally approved release waiver.
- [ ] Open severity-1 and severity-2 defects are zero. Any remaining lower-severity defect has an owner and approved disposition.
- [ ] Critical paths and implemented risk coverage reach at least 80 percent. P0 requirement coverage reaches 100 percent.
- [ ] Security scenarios pass at 100 percent and the approved at-rest protection is demonstrated on a gate device.
- [ ] Every agreed device and environment profile completes the 2,000-item backlog within 30 seconds.
- [ ] Conflict, retry, idempotency, kill-switch, billing isolation, tenant isolation, regional routing, and canonical payload gates pass.
- [ ] Planned evidence exists for each in-scope NFR category. Final evidence grading remains assigned to `nfr-assess`.

---

## Test Coverage Plan

P0 through P3 express priority. Execution cadence appears in the Execution Strategy section.

### P0 (Critical)

**Criteria:** Critical business, security, data-integrity, or compliance impact with no safe workaround. Risk score supplies supporting evidence.

This epic has an unusually large P0 set because the supplied design creates six high risks across sensitive data, silent order loss, retry storms, rollout recovery, performance, and payload integrity. The regression constraints also protect billing, tenant isolation, and residency. Each P0 row establishes an independent release condition with critical impact and no source-supported safe workaround.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| --- | --- | --- | ---: | --- | --- |
| 7.1-E2E-001: Save an existing order with parts and labour while offline; show captured status; preserve the queue after app reopen. | E2E | R-006 | 1 | QA | Android UI and SQLite persistence cross the end-user boundary. |
| 7.1-COMP-001: Persist the complete canonical payload atomically to SQLite with exact types, nulls, quantities, prices, card reference, and billing address. | Component | R-006 | 1 | DEV | The repository with the real SQLite adapter is the smallest suitable boundary. |
| 7.1-E2E-002: Prove sensitive queued fields are encrypted, backup-excluded, and unreadable without the application key. | E2E | R-001 | 1 | QA and Security | Device-level inspection observes the actual at-rest representation. |
| 7.2-COMP-001: Append a distinct immutable queue entry for every pre-acceptance edit and reconstruct the latest local view exactly. | Component | R-002, R-006 | 1 | DEV | Real SQLite behavior exposes history and reconstruction faults. |
| 7.2-E2E-002: Reconnect two offline clients that edited the same order in both arrival orders; preserve both versions or present an auditable conflict. | E2E | R-002 | 1 | QA | Two clients and the server reveal cross-device conflict loss. |
| 7.3-E2E-001: Restore a usable network; start upload automatically; reach server acceptance; clear or archive pending state exactly once. | E2E | R-006 | 1 | QA | This proves the epic's primary delivery path. |
| 7.3-E2E-002: Round-trip minimum, typical, maximum, Unicode, and nullable payloads through SQLite, upload, server persistence, and dispatcher read; compare canonical equality. | E2E | R-006 | 1 | QA | One full-path test covers every transformation boundary. |
| 7.3-COMP-001: Apply bounded exponential backoff with jitter to transient failures; exhaust the permanent-failure retry budget; quarantine and expose diagnostics. | Component | R-003 | 1 | DEV | A fake clock and transport double make retry-state assertions deterministic. |
| 7.3-API-001: Keep rejected-item requests within approved device and fleet budgets during reconnect traffic while valid items continue. | API | R-003 | 1 | QA and SRE | API load is the direct operational consequence of retry behavior. |
| 7.3-API-002: Replay an acknowledged upload and prevent duplicate order effects under the server idempotency contract. | API | R-003, R-006 | 1 | QA | Duplicate delivery is expected during recovery and requires a server-boundary assertion. |
| 7.4-E2E-001: Remotely disable the feature on an enabled device within the rollback target while preserving queued data and the approved fallback. | E2E | R-004 | 1 | QA and Release Engineering | A production-like device and control plane prove recovery. |
| 7.4-API-001: Validate cohort targeting, kill-switch authorization, audit logging, propagation, and fail-safe behavior. | API | R-004 | 1 | QA and Security | The control-plane API is the smallest complete authorization and propagation boundary. |
| 7.REG-API-001: Prove offline capture and sync make zero billing-service calls and leave the nightly billing schedule unchanged. | API | N/A | 1 | QA | This traces the explicit unchanged billing constraint. |
| 7.REG-API-002: Prove one installation cannot read or write another installation's queued or accepted orders. | API | N/A | 1 | QA and Security | This traces the explicit tenant-isolation constraint. |
| 7.REG-API-003: Keep synced order traffic on the configured regional route and retain residency evidence. | API | N/A | 1 | QA and SRE | This traces the explicit residency constraint. |

**Total P0:** 15 tests, about 120 to 180 hours

### P1 (High)

**Criteria:** Core, frequent, or complex behavior with material user reach and a limited workaround. Risk score supplies supporting evidence.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| --- | --- | --- | ---: | --- | --- |
| 7.1-UNIT-001: Verify draft, queued, and captured state transitions, repeated save requests, and atomic save failure behavior. | Unit | R-006 | 1 | DEV | A deterministic state-machine test covers branching behavior efficiently. |
| 7.2-E2E-001: Edit a queued order before server acceptance; show the new lines immediately; keep the order editable. | E2E | R-006 | 1 | QA | This covers the technician's core queued-edit journey. |
| 7.2-UNIT-001: Accept edits while queued and reject edits after the server-accepted state is committed locally. | Unit | R-006 | 1 | DEV | Deterministic state transitions cover the acceptance race. |
| 7.3-E2E-003: Sync exactly 2,000 representative items within 30 seconds on each approved fleet device and environment profile. | E2E | R-005 | 1 | QA and Performance | Physical-device timing includes SQLite, CPU, radio, serialization, and API effects. |
| 7.3-COMP-002: Verify ordering, batching, cursor advancement, and complete delivery at queue sizes 0, 1, 1,999, and 2,000. | Component | R-005, R-006 | 1 | DEV | Component coverage isolates batching boundaries from device timing noise. |

**Total P1:** 5 tests, about 50 to 80 hours

### P2 (Medium)

**Criteria:** Secondary behavior with narrower user reach and an acceptable workaround. Risk score supplies supporting evidence.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| --- | --- | --- | ---: | --- | --- |
| 7.REG-E2E-001: Compare the connected Android order screen before and after feature enablement; allow only the specified captured and sync states. | E2E | N/A | 1 | QA | The existing connected flow and native rendering require a device-level regression. |

**Total P2:** 1 test, about 8 to 16 hours

### P3 (Low)

**Criteria:** Rare, cosmetic, or experimental behavior with minimal impact and an easy workaround. Risk score supplies supporting evidence.

No P3 scenarios are supported by the supplied scope.

**Total P3:** 0 tests, 0 hours

---

## Execution Strategy

**Philosophy:** Run every functional scenario in pull requests while the suite stays under 15 minutes. Defer work with material infrastructure or duration cost. Playwright is irrelevant to this native Android surface; Android tests should use parallel workers and isolated SQLite state to meet the same duration objective.

- **Pull request:** Run every unit and component test, all API contract and regression tests, and one Android offline-capture and reconnect smoke flow. Target a duration below 15 minutes through deterministic fakes, isolated databases, and one emulator profile.
- **Nightly:** Run the full Android device-flow matrix, two-client conflict permutations, payload round trips, lifecycle and network fault injection, storage inspection, and the 2,000-item benchmark on the primary fleet device.
- **Weekly:** Run every fleet device and OS profile, concurrent reconnect load and spike tests, endurance and battery profiling, static and dependency security scans, and the rollback or kill-switch rehearsal in a production-like environment.

Execution order within each applicable run is environment smoke, P0 coverage, P1 coverage, then P2 coverage.

---

## Resource Estimates

### Test Development Effort

| Priority | Count | Hours/Test | Total Hours | Notes |
| --- | ---: | --- | --- | --- |
| P0 | 15 | About 8 to 12 | About 120 to 180 | Security, data integrity, concurrency, retries, synchronization, rollout controls, and regression constraints |
| P1 | 5 | About 10 to 16 | About 50 to 80 | Editing, state transitions, batching boundaries, and physical-device performance |
| P2 | 1 | About 8 to 16 | About 8 to 16 | Connected-flow rendering regression across the approved matrix |
| P3 | 0 | N/A | 0 | No supported P3 scenario |
| **Total** | **21** | **Varies by level and harness** | **About 178 to 276** | **Roughly 4 to 7 weeks with two test engineers** |

The ranges include harness setup, fixtures, automation, environment integration, device execution, load evidence, diagnostics, triage, and reporting. Security architecture, conflict semantics, retry policy, or rollout-control changes can extend the elapsed timeline.

### Prerequisites

**Test Data:**

- Canonical order-payload factory covering minimum, typical, maximum, Unicode, nullable, parts, labour, card-reference, and billing-address data
- Queue factory for exact sizes 0, 1, 1,999, and 2,000 with deterministic IDs and ordering
- Two-client concurrent-edit fixtures plus isolated tenant and region fixtures
- Permanent and transient failure fixtures with automatic cleanup

**Tooling:**

- Native Android instrumentation and device orchestration for UI, lifecycle, storage, and connectivity validation
- Real SQLite adapter with isolated database fixtures for component coverage
- API test and load harness for idempotency, fleet reconnect, regional routing, tenant isolation, and service-spy assertions
- Network conditioning, device storage inspection, static analysis, dependency scanning, and trace correlation tools

**Environment:**

- Production-like Android builds, order-ingest API, server persistence, dispatcher read endpoint, telemetry, and rollout control plane
- Approved physical fleet devices, Android OS versions, network profiles, server-load profiles, regions, and tenant boundaries
- Permission to inspect application storage, backups, logs, crash reports, and audit records in test environments

---

## Quality Gate Criteria

### Pass/Fail Thresholds

- **P0 pass rate:** 100 percent with zero exceptions
- **P1 pass rate:** At least 95 percent; every failure requires triage, ownership, and an approved disposition
- **P2/P3 pass rate:** At least 90 percent and recorded for release review
- **High-risk mitigations:** 100 percent complete with evidence, or covered by an approved release waiver

### Coverage Targets

- **Critical paths:** At least 80 percent
- **P0 requirements:** 100 percent
- **Security scenarios:** 100 percent
- **Business logic:** At least 70 percent
- **Edge cases:** At least 50 percent

### Non-Negotiable Requirements

- [ ] Every P0 test passes.
- [ ] Every score-9 risk is resolved or carries a formally approved release waiver.
- [ ] Security scenarios pass at 100 percent and prove approved at-rest controls.
- [ ] The 2,000-item target passes on every agreed device and environment profile.
- [ ] Concurrent edits preserve both versions or produce an explicit, auditable conflict with recoverable work.
- [ ] Permanent failures stop within the approved retry budget, enter a recoverable quarantine path, and emit operator-visible diagnostics.
- [ ] Remote disablement and staged rollout meet the approved rollback target.
- [ ] Billing non-invocation, tenant isolation, regional routing, and canonical payload equality pass.
- [ ] Planned evidence exists for every in-scope NFR. Final NFR grading occurs in `nfr-assess`.

---

## Mitigation Plans

### R-001: Sensitive queue data exposure (Score: 9)

**Mitigation Strategy:** Encrypt sensitive queue data with Keystore-backed keys, minimize copied fields, exclude backups, restrict debug extraction, scan diagnostics, and complete a mobile threat review.  
**Owner:** Mobile Security Lead  
**Timeline:** Before implementation approval and release  
**Status:** Planned  
**Verification:** Pass 7.1-E2E-002 and the security NFR evidence plan on an approved gate device.

### R-002: Silent concurrent-edit loss (Score: 9)

**Mitigation Strategy:** Define optimistic versioning or conflict-aware merge semantics, retain immutable edits, expose conflicts, and preserve recovery history.  
**Owner:** Order Domain Lead  
**Timeline:** Before server contract freeze  
**Status:** Planned  
**Verification:** Pass 7.2-COMP-001 and 7.2-E2E-002 for both arrival orders and agreed timing permutations.

### R-003: Unbounded retry storm (Score: 9)

**Mitigation Strategy:** Classify failures, introduce bounded exponential backoff with jitter and retry budgets, quarantine permanent failures, preserve valid-item progress, and expose diagnostics.  
**Owner:** Mobile Sync Lead and SRE Lead  
**Timeline:** Before reliability testing  
**Status:** Planned  
**Verification:** Pass 7.3-COMP-001, 7.3-API-001, and 7.3-API-002 with approved budgets.

### R-004: Fleet-wide release without rapid disablement (Score: 9)

**Mitigation Strategy:** Add authorized remote disablement, staged cohorts, release-health telemetry, alerting, rollback criteria, and a production-like rehearsal.  
**Owner:** Release Engineering Lead  
**Timeline:** Before production rollout  
**Status:** Planned  
**Verification:** Pass 7.4-E2E-001 and 7.4-API-001 within the approved disable-time target.

### R-005: Backlog recovery misses 30 seconds (Score: 6)

**Mitigation Strategy:** Define the gate profiles, benchmark realistic payloads on named devices, profile every local and server stage, tune batching, and enforce the threshold in release evidence.  
**Owner:** Performance Test Lead  
**Timeline:** Before release candidate  
**Status:** Planned  
**Verification:** Pass 7.3-E2E-003 and 7.3-COMP-002 with retained raw measurements.

### R-006: End-to-end payload integrity failure (Score: 6)

**Mitigation Strategy:** Define canonical equality and stable identifiers, preserve transaction atomicity and ordering, protect idempotency, and cover representative payload boundaries.  
**Owner:** Order Platform Lead  
**Timeline:** Before end-to-end acceptance  
**Status:** Planned  
**Verification:** Pass every R-006-linked scenario, especially 7.3-E2E-002 and 7.3-API-002.

---

## Assumptions and Dependencies

### Assumptions

1. Epic 7 remains limited to the native Android offline-order path and its stated server and dispatcher boundaries.
2. Single-tenant installation isolation, regional routing, data residency, billing schedule, dispatcher behavior, and existing connected-order rendering remain contractual regression constraints.
3. The server can support stable request identifiers, idempotent replay, version checks, and conflict responses once the contracts are approved.
4. Approved fleet devices and production-like services can emit synchronized timing, resource, retry, and trace telemetry.
5. Security, privacy, performance, reliability, and operations owners will define every threshold marked **UNKNOWN** before its gate executes.

### Dependencies

1. Security and privacy decisions for encryption, retention, backup, extraction, classification, deletion, and audit are required before implementation approval.
2. Conflict semantics, immutable edit history, stable identifiers, canonical equality, and idempotency contracts are required before server contract freeze.
3. Retry ceilings, backoff parameters, quarantine policy, valid-item fairness, and diagnostic states are required before reliability testing.
4. Kill-switch authorization, staged cohorts, telemetry, alert thresholds, and disable-time target are required before production rollout.
5. Gate devices, OS versions, network profiles, payload mix, server load, and timer boundaries are required before performance acceptance.
6. Existing billing, tenant-isolation, residency, Android connected-flow, and dispatcher regressions must remain available through release.

### Risks to Plan

- **Risk:** Architecture and contract decisions remain unresolved.
  - **Impact:** Test cases can be designed now, while executable assertions for security, conflict, retry, and rollout controls remain blocked.
  - **Contingency:** Treat unresolved score-9 decisions as entry-gate failures and sequence harness work around approved interfaces first.
- **Risk:** The repository contains no implementation, build manifest, test framework, fixtures, or executable app.
  - **Impact:** Stack selection and harness integration effort can move within the stated ranges.
  - **Contingency:** Confirm the implementation stack and create the smallest maintainable Android, component, and API harnesses during automation planning.
- **Risk:** Physical devices and production-like services may have limited availability.
  - **Impact:** Performance, lifecycle, security, and rollout evidence can arrive late.
  - **Contingency:** Reserve device and environment windows before feature-complete status and run deterministic lower-level suites continuously.

---

## Follow-on Workflows (Manual)

- Run `/bmad-testarch-atdd` explicitly to generate failing P0 acceptance tests.
- Run `/bmad-testarch-automate` for broader coverage after implementation interfaces exist.
- Run `nfr-assess` after implementation evidence has been collected.

---

## Approval

**Test Design Approved By:**

- [ ] Product Manager: Unassigned. Date: Pending
- [ ] Tech Lead: Unassigned. Date: Pending
- [ ] QA Lead: Unassigned. Date: Pending
- [ ] Security Lead: Unassigned. Date: Pending
- [ ] SRE or Release Lead: Unassigned. Date: Pending

**Comments:** Draft requires resolution of the entry-gate decisions and formal approval by the listed roles.

---

## Interworking & Regression

| Service/Component | Impact | Regression Scope |
| --- | --- | --- |
| Android order UI and domain state | Adds captured, queued, syncing, rejected, conflicted, and accepted behavior around the existing order flow. | Existing connected-order creation and editing, status rendering, repeated save handling, pre-acceptance edit rules, and post-acceptance immutability. |
| SQLite outbound queue | Stores complete orders and edits across offline periods. | Atomic writes, exact types and nulls, ordering, reconstruction, lifecycle durability, schema migration, low-storage behavior, corruption handling, and cleanup. |
| Android connectivity and background execution | Triggers automatic upload and recovery. | Connectivity transitions, process death, reboot, app upgrade, battery constraints, trigger duplication, backoff, retry budgets, and valid-item fairness. |
| Server order-ingest API | Receives queued entries and retries. | Idempotency, stable identifiers, validation, permanent rejection, version conflicts, ordering, regional routing, tenant isolation, rate budgets, and load behavior. |
| Server persistence and dispatcher read path | Must preserve the canonical order unchanged. | Minimum through maximum payload round trips, Unicode and nullable fields, duplicate delivery, conflict records, stored order equality, and dispatcher read equality. |
| Billing service | Must remain outside the offline-capture path and keep its nightly schedule. | Service-spy and trace assertions plus the existing billing schedule regression. |
| Rollout control plane and telemetry | Must constrain blast radius and support rapid disablement. | Authorization, cohort targeting, audit logs, propagation, fail-safe behavior, alerts, dashboards, queued-data preservation, and rollback rehearsal. |
| Cross-team coordination | Mobile, order platform, security, SRE, release engineering, privacy, and dispatcher owners share contracts and evidence. | Joint review of entry gates, canonical payload and conflict contracts, retry and load budgets, security controls, rollout criteria, and final release evidence. |

---

## Appendix

### Knowledge Base References

- `risk-governance.md`: Risk classification and governance
- `probability-impact.md`: Probability, impact, and score methodology
- `test-levels-framework.md`: E2E, API, component, and unit level selection
- `test-priorities-matrix.md`: P0 through P3 prioritization
- `nfr-criteria.md`: NFR thresholds, evidence planning, and later assessment guidance

### Related Documents

- Epic: `docs/epic-7.md`
- Progress checkpoint: `.tea-runs/tea-test-design-U0s5Ut/attempt-1/artifacts/test-design/test-design-progress-epic-7.md`
- Prior system-level test design: N/A; none exists in the supplied artifact locations
- Architecture source: Embedded in `docs/epic-7.md`

---

**Generated by:** BMad TEA Agent: Test Architect Module  
**Workflow:** `bmad-testarch-test-design`  
**Version:** 4.0 (BMad v6)
