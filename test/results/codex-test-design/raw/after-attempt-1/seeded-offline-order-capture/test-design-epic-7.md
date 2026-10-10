---
workflowStatus: 'completed'
runScope: 'epic'
runKey: 'epic-7'
totalSteps: 5
stepsCompleted:
  - 'step-01-detect-mode'
  - 'step-02-load-context'
  - 'step-03-risk-and-testability'
  - 'step-04-coverage-plan'
  - 'step-05-generate-output'
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-10-09T20:55:00-0500'
inputDocuments:
  - 'field-order-capture/_bmad/config.toml'
  - 'field-order-capture/docs/epics/epic-7-offline-order-capture.md'
  - 'bmod-tea/knowledge/risk-governance.md'
  - 'bmod-tea/knowledge/probability-impact.md'
  - 'bmod-tea/knowledge/test-levels-framework.md'
  - 'bmod-tea/knowledge/test-priorities-matrix.md'
  - 'bmod-tea/knowledge/nfr-criteria.md'
---

# Test Design: Epic 7, Offline order capture for field technicians

**Date:** 2026-10-09
**Author:** tea-eval-harness
**Status:** Draft

---

## Executive Summary

**Scope:** Full epic-level test design for Epic 7.

The plan covers native Android offline order capture, queued editing, automatic synchronization, server acceptance, data integrity, and release controls. The epic document is the sole requirements source. No application source, existing tests, PRD, architecture document, or sprint status file is part of this run.

**Risk Summary:**

- Total risks identified: 7
- High-priority risks with score 6 or higher: 7
- Score-9 release blockers: 2
- Critical categories: Security, data integrity, operations, and performance

**Coverage Summary:**

- P0 scenarios: 6, with about 65 to 105 hours of effort
- P1 scenarios: 11, with about 55 to 90 hours of effort
- P2 and P3 scenarios: 0
- Total effort: about 120 to 195 hours, or roughly 15 to 25 person-days
- Expected elapsed timeline: about 4 to 7 weeks with parallel specialist work

---

## Not in Scope

| Item | Reasoning | Mitigation |
| --- | --- | --- |
| Offline capture for entities other than work orders | The epic explicitly excludes every other entity type. | Cover those entities in their owning epics and retain existing online-flow regression tests. |
| Dispatcher web console implementation changes | The epic changes no console behavior. | Use the console or its read API as an observation point and run the existing console regression suite. |
| Billing behavior and charging schedule | The epic states that it neither calls nor changes the billing service. | Assert that capture and sync emit no billing call or charge event, then run the existing nightly billing regression suite. |
| Browser and web-view behavior | The client is a native Android application with no browser surface or web view in scope. | Inspect the Android package and keep device tests native. |
| Cross-epic system architecture and final NFR assessment | This run is scoped to Epic 7 planning from one epic document. | Address system-wide design separately and run `nfr-assess` after implementation evidence exists. |
| Test implementation | This workflow produces the risk and coverage plan only. | Use the explicit ATDD and automation workflows after the plan is approved. |

---

## Risk Assessment

### High-Priority Risks, Score 6 or Higher

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Timeline |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| R-001 | SEC | Sensitive order data can be extracted from a lost or compromised device. Story 7.1 says the SQLite queue holds the full payload, including the stored card reference and billing address, with no encryption at rest. | 3 | 3 | 9 | Encrypt the queue with OS-backed keys, minimize sensitive fields, and prevent sensitive data from entering backups, logs, or crash artifacts. | Mobile engineering and Security | Before implementation acceptance |
| R-002 | DATA | Concurrent offline edits can cause permanent, silent loss of a technician's order lines. Story 7.2 says the server accepts arrival order with no version or timestamp checks, and a later arrival overwrites the earlier edit without a record. | 3 | 3 | 9 | Add optimistic versioning or deterministic merge plus durable conflict capture. Preserve both technicians' contributions until resolution is recorded. | Backend engineering and Product | Before release |
| R-003 | OPS | One permanently rejected payload can generate unbounded rapid upload traffic and device resource consumption. Story 7.3 specifies immediate indefinite retry with no backoff, attempt cap, or dead-letter path. | 3 | 2 | 6 | Add bounded exponential backoff with jitter, retry classification, an attempt ceiling, quarantine handling, telemetry, and a technician-visible recovery state. | Mobile and Backend engineering | Before release |
| R-004 | OPS | A production defect reaches every technician and remains active for one to three days while a replacement build clears store review. Story 7.4 specifies universal enablement with no flag, staged rollout, or remote disable path. | 2 | 3 | 6 | Add a server-controlled kill switch, staged rollout cohorts, health gates, and a tested disable or rollback runbook. | Release engineering and Product | Before rollout |
| R-005 | PERF | A full offline-day backlog can miss the operational sync target and delay dispatcher visibility. Story 7.3 requires 2,000 queued items to finish syncing within 30 seconds on fleet mid-range devices. | 2 | 3 | 6 | Define the representative test profile, benchmark the complete device-to-server path, optimize safe batching, and enforce the 30-second threshold. | Mobile, Backend, and Performance engineering | Before release-candidate approval |
| R-006 | DATA | A saved or edited order can be lost, corrupted, duplicated, changed, or misrouted across local serialization and server acceptance. Stories 7.1 through 7.3 require full-payload queueing, and the acceptance criteria require the dispatcher to see the order unchanged. | 2 | 3 | 6 | Use durable transactions, stable mutation identifiers, integrity checks, idempotent server acceptance, correct installation routing, and end-to-end payload comparison. | Mobile and Backend engineering | During implementation and before release |
| R-007 | OPS | Automatic delivery can fail after connectivity returns, leaving the technician's captured order absent from dispatch. Story 7.3 requires upload when Android reports a usable network, and the acceptance criteria require zero technician action. | 2 | 3 | 6 | Implement a lifecycle-safe sync worker with persisted scheduling, connectivity rechecks, resumable processing, clear queue state, and telemetry for queue age and sync outcomes. | Mobile engineering and Operations | During implementation and before release |

### Medium-Priority Risks, Score 3 to 4

No additional evidence-supported medium risks were identified. Conditions without source support remain clarification items below.

### Low-Priority Risks, Score 1 to 2

No additional evidence-supported low risks were identified.

### Residual Risk

All seven risks remain open at planning time. Residual probability must be rescored after the proposed controls exist and the planned evidence has been reviewed. R-001 and R-002 remain release blockers while their score is 9.

### Risk Category Legend

- **TECH**: Technical or architecture flaws, integration issues, and scalability constraints
- **SEC**: Security controls, authorization, and data exposure
- **PERF**: Performance targets, degradation, and resource limits
- **DATA**: Loss, corruption, duplication, inconsistency, and routing integrity
- **BUS**: Core user and business outcomes
- **OPS**: Deployment, configuration, monitoring, and recovery

---

## NFR Planning

This section defines planned validation and expected evidence. Final evidence ratings belong in a later `nfr-assess` run.

| NFR Category | Requirement or Threshold | Risk Link | Planned Validation | Evidence Needed |
| --- | --- | --- | --- | --- |
| Security | The queue currently stores card references and billing addresses in plaintext SQLite. The requirements define no acceptable at-rest exposure threshold. Proposed release condition: zero plaintext sensitive queue fields in the database, backups, logs, and crash artifacts. | R-001 | Inspect application storage, backups, logs, and crash artifacts on representative Android devices. | Device extraction bundle, configuration review, and sensitive-data scan report |
| Performance | A 2,000-item backlog must reach durable server acceptance within 30 seconds on the fleet's mid-range device. | R-005 | Run a full-path device benchmark and server capacity test using the agreed profile. | Timing report, item counts, latency percentiles, throughput, CPU, memory, battery, saturation, and error rate |
| Reliability | Sync must start without technician action when Android reports a usable network. Retry, poison-item handling, acknowledgement, and lifecycle recovery need bounded behavior. | R-003, R-006, R-007 | Use fault injection, virtual-clock retry tests, connectivity transitions, process death, reboot, and background restriction scenarios. | Retry traces, queue snapshots, worker logs, telemetry, and final server state |
| Scalability | A single device may hold 2,000 items. Aggregate simultaneous-device load is undefined. | R-005 | Load the server with representative concurrent device backlogs. | Saturation curve, latency percentiles, throughput, and error-rate report |
| Maintainability | Source, CI policy, coverage baseline, dependency policy, and observability contract are unavailable in this planning run. | R-003, R-007 | Review CI coverage, dependency scans, structured logging, queue metrics, alert ownership, and runbooks after implementation exists. | CI reports, dependency report, telemetry contract, and ownership record |
| Compliance | The epic names payment-related references, billing addresses, and unchanged regional routing. It names no compliance regime or retention rule. | R-001, R-006 | Obtain data-classification approval, test deletion after acceptance, and trace existing regional routing. | Approval record, retention and deletion evidence, and routing trace |

**Unknown thresholds and definitions:**

- Representative mid-range Android device, Android version, network profile, payload distribution, and server-load profile
- Aggregate fleet concurrency and server throughput target
- Retry backoff, attempt ceiling, quarantine behavior, maximum recovery time, and alert thresholds
- Queue durability expectations across app termination, reboot, OS background restrictions, storage pressure, and application upgrade
- Data classification, accepted retention period, backup policy, and deletion deadline after successful sync
- Idempotency, ordering, partial-batch, and successful-dequeue semantics

---

## Entry Criteria

- [ ] QA, Mobile, Backend, Security, Release Engineering, and Product agree on the requirements, assumptions, risk owners, and conflict behavior.
- [ ] R-001, R-002, R-003, and R-004 mitigation designs are approved and available in a testable build or environment.
- [ ] The representative Android device, Android version, network profile, payload mix, server load, and fleet concurrency profile are defined.
- [ ] A signed installable Android build, isolated application server, database, and dispatcher observation surface are available.
- [ ] Synthetic work orders, parts, labour, billing addresses, stored card references, two-technician conflicts, and 2,000-item queue fixtures are ready with deterministic cleanup.
- [ ] Network shaping, server fault injection, storage extraction, retry-clock control, and queue telemetry are available.
- [ ] Test installations preserve the production single-tenant and regional-routing boundaries without using production customer data.

## Exit Criteria

- [ ] P0 pass rate is 100 percent.
- [ ] P1 pass rate is at least 95 percent, with every failure triaged and any waiver approved with an owner and expiry.
- [ ] No open score-9 risk and no unmitigated score-6 risk remains.
- [ ] No open critical or high-severity defect remains in offline capture, editing, synchronization, data protection, or rollout controls.
- [ ] Every acceptance criterion and every risk has traceable automated coverage, with overall critical-path coverage at least 80 percent.
- [ ] The 2,000-item full-path benchmark completes within 30 seconds on the agreed profile with zero lost, duplicated, corrupted, or misrouted orders.
- [ ] NFR evidence exists for every in-scope category and is ready for `nfr-assess`.

---

## Test Coverage Plan

P0, P1, P2, and P3 describe business and quality priority. Execution timing is defined in the Execution Strategy section.

### P0, Critical

**Criteria:** Critical business, security, data-integrity, or compliance impact with no safe workaround. Risk score provides supporting evidence.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| --- | --- | --- | ---: | --- | --- |
| 7.1-E2E-002: After offline capture, inspect app storage, backups, logs, and crash artifacts for plaintext sensitive queue fields. | E2E | R-001 | 1 | Security QA and Mobile | A real-device storage test establishes the at-rest exposure. Failure exposes payment-related and address data. The source names screen lock as the only current control. |
| 7.2-API-001: Submit conflicting offline edits from two assigned technicians in both arrival orders and verify preservation plus auditable resolution. | API | R-002 | 1 | Backend QA | The server boundary owns conflict semantics. The stated behavior silently loses earlier lines and keeps no recovery record. |
| 7.3-API-001: Replay the same queued mutation after a lost acknowledgement and verify exactly one server-side effect. | API | R-006 | 1 | Backend QA | API coverage isolates idempotent acceptance. Duplicate orders or lines create data-integrity harm with no documented repair. |
| 7.3-INT-003: Remove an item only after durable server acceptance, while failed and interrupted uploads remain queued. | Integration | R-006 | 1 | Mobile and Backend QA | Fault injection at the acknowledgement boundary establishes durable handoff. Premature dequeue causes unrecoverable order loss. |
| 7.4-API-001: Exercise the server-controlled kill switch and staged-cohort configuration across enable, disable, and cohort boundaries. | API | R-004 | 1 | Release Engineering and QA | Configuration/API testing gives deterministic control evidence. The current recovery path requires a new build and one to three days of store review. |
| 7.4-E2E-001: Rehearse rollout health gates and remote disable during a failed canary while preserving queued data. | E2E | R-004 | 1 | Release Engineering and QA | The release recovery path crosses deployment and device behavior. Every technician is exposed when this control is absent. |

**Total P0:** 6 scenarios, about 65 to 105 hours.

### P1, High

**Criteria:** Core, frequent, or complex behavior with material user reach and a limited workaround. Risk score provides supporting evidence.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| --- | --- | --- | ---: | --- | --- |
| 7.1-E2E-001: With all connectivity disabled, add parts and labour, save, and verify that the native Android screen lists the order as captured. | E2E | R-006 | 1 | Mobile QA | This is the primary device journey. Failure forces the source-described wait or paper re-entry flow. |
| 7.1-INT-001: Persist a complete payload atomically and recover the identical record after process termination and device restart. | Integration | R-006 | 1 | Mobile QA | Persistence and Android lifecycle boundaries sit below the user journey. The current paper flow offers only a limited fallback. |
| 7.1-UNIT-001: Round-trip every supported order field, parts line, labour line, billing address, and stored card reference through queue serialization. | Unit | R-006 | 1 | Mobile Engineering | Unit coverage isolates transformation branches without duplicating storage or UI checks. |
| 7.2-E2E-001: Edit a queued order several times before acceptance and verify that the latest visible state reaches dispatch unchanged. | E2E | R-006 | 1 | Mobile QA | This directly covers editability and final-state integrity. Paper re-entry remains the only source-described fallback. |
| 7.2-UNIT-001: Generate stable mutation identifiers and deterministic per-order sequence values across repeated edits. | Unit | R-006 | 1 | Mobile Engineering | Isolated identity and ordering logic supports idempotent synchronization. |
| 7.3-E2E-001: Restore a usable network, take no user action, and verify automatic upload plus an unchanged order on the dispatcher side. | E2E | R-007, R-006 | 1 | Mobile and Backend QA | The complete cross-system acceptance journey requires a device-level test. Waiting or paper re-entry is a limited fallback. |
| 7.3-INT-001: Inject transient timeouts, connection drops, and 5xx responses, then verify bounded backoff, jitter, retained queue data, and eventual acceptance. | Integration | R-003, R-007 | 1 | Mobile and Backend QA | Integration fault injection gives deterministic retry evidence without duplicating the user journey. Stopping the app can pause resource use, yet it leaves the order unresolved. |
| 7.3-INT-002: Return a permanent rejection for one item and verify the attempt ceiling, quarantine state, visible status, telemetry, and continued processing of later valid items. | Integration | R-003 | 1 | Mobile and Backend QA | This directly establishes poison-item containment and recovery. |
| 7.3-E2E-002: Sync a representative 2,000-item backlog on the agreed fleet device and network profile within 30 seconds. | E2E | R-005 | 1 | Performance and Mobile QA | A full device-to-server benchmark measures the stated NFR and verifies zero loss or duplication. A slower result delays dispatcher visibility. |
| 7.3-API-002: Drive simultaneous representative device backlogs and characterize the concurrency level that preserves the per-device target. | API | R-005 | 1 | Performance and Backend QA | API load testing isolates server capacity. The aggregate concurrency target remains UNKNOWN. |
| 7.3-E2E-003: Exercise connectivity flapping, app backgrounding, process death, device reboot, and OS background restrictions around sync. | E2E | R-007 | 1 | Mobile QA | Native device coverage is required for Android lifecycle behavior. The result must converge to one accepted final order. |

**Total P1:** 11 scenarios, about 55 to 90 hours.

### P2, Medium

**Criteria:** Secondary behavior with narrower user reach and an acceptable workaround.

No P2 scenarios are supported by the supplied epic. Every planned behavior belongs to the core offline order journey or a material risk control.

**Total P2:** 0 scenarios, 0 hours.

### P3, Low

**Criteria:** Rare, cosmetic, or experimental behavior with minimal impact and an easy workaround.

No P3 scenarios are supported by the supplied epic. The epic explicitly excludes rendering changes and contains no cosmetic or experimental requirement.

**Total P3:** 0 scenarios, 0 hours.

---

## Execution Strategy

**Philosophy:** Run every functional scenario in pull requests while the suite stays under 15 minutes. Defer work with material device-lab, data-volume, fault-injection, or duration cost.

- **Pull request:** Run unit, API, integration, and focused Android device tests in parallel, targeting less than 15 minutes. Include all affected functional scenarios for queue, sync, order, storage, and release-control changes.
- **Nightly:** Run the full Android lifecycle matrix, storage inspection, 2,000-item device benchmark, simultaneous-backlog API load, and broad regression.
- **Weekly:** Run extended connectivity chaos, soak tests, fleet-concurrency characterization, backup extraction, rollout rehearsal, and complete dependency and static scans.

Execution order within each run is fast deterministic checks first, followed by P0 risk controls, P1 journeys, and any later-added P2 or P3 coverage.

---

## Resource Estimates

### Test Development Effort

| Priority | Scenario Count | Effort Range | Notes |
| --- | ---: | --- | --- |
| P0 | 6 | About 65 to 105 hours | Security extraction, conflict setup, idempotency, fault injection, and rollout controls |
| P1 | 11 | About 55 to 90 hours | Native-device journeys, lifecycle coverage, performance harness, and server load |
| P2 | 0 | 0 hours | No planned scenarios |
| P3 | 0 | 0 hours | No planned scenarios |
| **Total** | **17** | **About 120 to 195 hours** | Includes framework discovery, fixtures, environments, automation, stabilization, and reporting |

Expected elapsed time is about 4 to 7 weeks when mobile, backend, security, performance, and release-engineering work can proceed in parallel.

### Prerequisites

**Test Data:**

- Synthetic work-order factory with parts, labour, billing address, and non-production card-reference variants
- Two-technician same-order conflict fixture
- Deterministic 2,000-item backlog generator with configurable payload sizes
- Installation-scoped tenants and routing fixtures with automated cleanup

**Tooling:**

- Native Android unit, integration, and device-test runner selected from the implementation stack
- Network shaping and server fault injection for offline, flapping, timeout, and permanent-rejection cases
- Device storage and backup extraction plus sensitive-data scanning
- API load and full-path performance harness with synchronized device and server timing
- Virtual clock or injectable scheduler for deterministic backoff validation

**Environment:**

- Representative physical or virtual fleet device with the agreed Android version and resource profile
- Isolated single-tenant application server and database that preserve regional routing behavior
- Dispatcher console or read API for final-state verification
- Queue metrics, structured logs, retry traces, and alert capture

---

## Quality Gate Criteria

### Pass and Fail Thresholds

- P0 pass rate: 100 percent
- P1 pass rate: at least 95 percent, with approved waivers for any failure
- Any later-added P2 or P3 pass rate: at least 90 percent
- High-risk mitigations: 100 percent complete or covered by an approved, owned, time-limited waiver

### Coverage Targets

- Acceptance criteria and risk traceability: 100 percent mapped
- Overall critical-path automated coverage: at least 80 percent
- Security scenarios: 100 percent
- Business and data-integrity logic: at least 80 percent
- Material edge cases: at least 60 percent

### Non-Negotiable Requirements

- [ ] Every P0 test passes.
- [ ] R-001 and R-002 are resolved or carry formal waivers from accountable Security, Data, and Product owners. Open score-9 risks block release.
- [ ] R-003 through R-007 have completed mitigations and planned evidence.
- [ ] Sensitive queue data is absent from plaintext device storage, backups, logs, and crash artifacts.
- [ ] Conflicting technician edits preserve both contributions and an auditable resolution.
- [ ] The 2,000-item full-path run completes within 30 seconds on the agreed profile with zero lost, duplicated, corrupted, or misrouted orders.
- [ ] Remote disable and staged rollout controls pass their release rehearsal.
- [ ] Planned NFR evidence exists for every in-scope category. Final evidence ratings are deferred to `nfr-assess`.

---

## Mitigation Plans

### R-001: Plaintext sensitive queue data, Score 9

**Mitigation Strategy:**

1. Encrypt the SQLite database or sensitive payload fields with OS-backed keys.
2. Minimize queued sensitive fields and define deletion immediately after durable acceptance.
3. Exclude the queue and keys from unprotected backups, logs, crash reports, and debug exports.

**Owner:** Mobile engineering and Security  
**Timeline:** Before implementation acceptance  
**Status:** Planned  
**Verification:** 7.1-E2E-002 plus security review and extraction evidence.

### R-002: Silent concurrent-edit loss, Score 9

**Mitigation Strategy:**

1. Add server-recognized order versions or a deterministic merge contract.
2. Reject, merge, or route stale mutations into a durable conflict record.
3. Expose resolution status to authorized users and preserve an audit trail.

**Owner:** Backend engineering and Product  
**Timeline:** Before release  
**Status:** Planned  
**Verification:** 7.2-API-001 across both arrival orders and repeated conflicts.

### R-003: Unbounded rapid retries, Score 6

**Mitigation Strategy:**

1. Classify transient and permanent failures.
2. Apply bounded exponential backoff with jitter to transient failures.
3. Cap attempts, quarantine permanent failures, continue later valid items, and emit alerts.

**Owner:** Mobile and Backend engineering  
**Timeline:** Before release  
**Status:** Planned  
**Verification:** 7.3-INT-001 and 7.3-INT-002 with virtual-clock traces.

### R-004: Full-fleet rollout without remote recovery, Score 6

**Mitigation Strategy:**

1. Add a server-controlled kill switch with safe cached behavior.
2. Add staged cohorts and health gates for progressive exposure.
3. Rehearse remote disable and rollback while preserving queued data.

**Owner:** Release engineering and Product  
**Timeline:** Before rollout  
**Status:** Planned  
**Verification:** 7.4-API-001 and 7.4-E2E-001 plus the signed rollout runbook.

### R-005: Backlog sync exceeds 30 seconds, Score 6

**Mitigation Strategy:**

1. Define the representative device, network, payload, server-load, and concurrency profiles.
2. Instrument device and server timing with complete accepted-item counts.
3. Optimize batching and safe concurrency while preserving ordering and idempotency.

**Owner:** Mobile, Backend, and Performance engineering  
**Timeline:** Before release-candidate approval  
**Status:** Planned  
**Verification:** 7.3-E2E-002 and 7.3-API-002 reports.

### R-006: Queue-to-server integrity failure, Score 6

**Mitigation Strategy:**

1. Use atomic local transactions and stable order and mutation identifiers.
2. Make acceptance idempotent and dequeue contingent on durable acknowledgement.
3. Validate payload integrity, installation scope, and final dispatcher state end to end.

**Owner:** Mobile and Backend engineering  
**Timeline:** During implementation and before release  
**Status:** Planned  
**Verification:** 7.1, 7.2, and 7.3 data-integrity scenarios with field-level comparisons.

### R-007: Automatic synchronization fails, Score 6

**Mitigation Strategy:**

1. Use a persisted Android background worker with connectivity constraints and lifecycle-safe rescheduling.
2. Recheck real server reachability and resume incomplete work.
3. Expose queue age, sync outcomes, and failure alerts to operations and technicians.

**Owner:** Mobile engineering and Operations  
**Timeline:** During implementation and before release  
**Status:** Planned  
**Verification:** 7.3-E2E-001, 7.3-INT-001, and 7.3-E2E-003 with worker telemetry.

---

## Assumptions and Dependencies

### Assumptions

1. The Epic 7 document is the complete requirements source for this run.
2. Test environments use synthetic card references and billing addresses with no production customer data.
3. The implementation will expose deterministic queue state, worker status, correlation identifiers, and server acceptance state to authorized test tooling.
4. The dispatcher console or its backing read API can observe the final order without requiring a console implementation change.

### Dependencies

1. Security approval of storage encryption, backup exclusion, data minimization, and retention before device security testing begins.
2. Product and backend approval of versioning, merge, and conflict-resolution semantics before concurrency tests are finalized.
3. Mobile and backend approval of retry, poison-item, acknowledgement, ordering, and idempotency contracts before fault-injection tests begin.
4. Release Engineering delivery of kill switch, cohort, telemetry, and rollback controls before rollout rehearsal.
5. Product and Performance Engineering definition of the representative device, network, payload, server-load, and fleet-concurrency profiles before performance baselining.

### Risks to the Plan

- **Implementation stack is unknown:** Framework and fixture choices may change the estimate.
  - **Impact:** Automation setup and device-lab integration could take longer.
  - **Contingency:** Select the framework after source exists and retain the level, priority, and evidence contracts in this plan.
- **Several NFR thresholds are unknown:** Aggregate scale, retry, durability, retention, and alert rules remain undefined.
  - **Impact:** Some expected results cannot be finalized.
  - **Contingency:** Treat the listed definitions as entry blockers and update the plan after owners approve them.
- **No historical test or incident data is available:** Probability scores use only the explicit design statements and acceptance criteria.
  - **Impact:** Residual risk confidence is limited.
  - **Contingency:** Reassess probability after implementation burn-in and early rollout telemetry.

---

## Follow-on Workflows, Manual

- Run `/bmad-testarch-atdd` to generate failing P0 acceptance tests after the plan and mitigation contracts are approved.
- Run `/bmad-testarch-automate` for broader coverage after implementation exists.
- Run `nfr-assess` after security, performance, reliability, scalability, maintainability, and compliance evidence is available.

---

## Approval

**Test Design Approved By:**

- [ ] Product Manager: Unassigned. Date: Pending
- [ ] Mobile Tech Lead: Unassigned. Date: Pending
- [ ] Backend Tech Lead: Unassigned. Date: Pending
- [ ] Security Owner: Unassigned. Date: Pending
- [ ] QA Lead: Unassigned. Date: Pending

**Comments:** Pending team review.

---

## Interworking and Regression

| Service or Component | Impact | Regression Scope |
| --- | --- | --- |
| Native Android order client | Adds offline save, edit, queue status, and background sync behavior. | Existing online order capture, order editing, native rendering, app lifecycle, upgrade, storage-pressure, and accessibility regressions |
| Local SQLite queue | Stores full outbound order mutations and controls durability. | Atomicity, recovery, ordering, encryption, retention, backup exclusion, schema migration, and cleanup |
| Android background sync worker | Reacts to connectivity and manages retries. | Connectivity transitions, OS background limits, reboot, process death, battery behavior, bounded retry, alerts, and queue age |
| Order API and server database | Accepts queued mutations and resolves concurrency. | Authentication, authorization, idempotency, versioning, conflict capture, acknowledgement, input validation, and transaction integrity |
| Dispatcher web console | Observes the accepted order with no implementation change. | Existing order display and refresh regression, plus field-level comparison against the queued payload |
| Installation boundary and regional routing | Must remain single-tenant with unchanged residency routing. | Installation-scoped authorization, database isolation, routing trace, and absence of cross-installation records |
| Billing service | Must remain untouched by capture and sync. | Assert zero sync-time billing calls and charge events, then run the existing nightly charging regression |
| Application distribution and release controls | Gains staged exposure and remote recovery controls as risk mitigation. | Cohort targeting, kill switch, cached configuration, telemetry, rollback, and queued-data preservation |

Cross-team coordination is required among Mobile, Backend, Security, Operations, Release Engineering, Product, and the dispatcher-console owner for environment readiness, evidence review, and release rehearsal.

---

## Appendix

### Knowledge Base References

- `risk-governance.md`: Risk classification, ownership, and mitigation thresholds
- `probability-impact.md`: Probability, impact, and score definitions
- `test-levels-framework.md`: Test-level selection and duplicate-coverage guard
- `test-priorities-matrix.md`: P0 through P3 business-priority criteria
- `nfr-criteria.md`: NFR planning categories and evidence guidance

### Related Documents

- PRD: None supplied by run configuration
- Epic: [`epic-7-offline-order-capture.md`](../../docs/epics/epic-7-offline-order-capture.md)
- Architecture: None supplied by run configuration
- Tech Spec: None supplied by run configuration

---

**Generated by:** BMad TEA Agent, Test Architect Module  
**Workflow:** `bmad-testarch-test-design`  
**Version:** 5.0 step-file architecture
