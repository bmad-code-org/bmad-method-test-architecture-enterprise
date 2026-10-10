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
inputDocuments:
  - 'field-order-capture/_bmad/config.toml'
  - 'field-order-capture/docs/epics/epic-7-offline-order-capture.md'
  - 'bmod-tea/knowledge/risk-governance.md'
  - 'bmod-tea/knowledge/probability-impact.md'
  - 'bmod-tea/knowledge/test-levels-framework.md'
  - 'bmod-tea/knowledge/test-priorities-matrix.md'
  - 'bmod-tea/knowledge/nfr-criteria.md'
  - 'bmod-tea/knowledge/playwright-cli.md'
---

# Test Design: Epic 7: Offline order capture for field technicians

**Date:** 2026-10-09  
**Author:** tea-eval-harness  
**Status:** Draft

## Executive Summary

**Scope:** Full epic-level test design for Epic 7

The plan covers offline capture, queued editing, automatic synchronization, server preservation, sensitive local data, multi-technician conflicts, backlog performance, retry safety, and release recovery. The repository contains requirements only. No implementation or existing automated coverage was available for analysis.

**Risk Summary:**

- Total risks identified: 8
- High-priority risks with score 6 or greater: 8
- Release blockers with score 9: 3
- Critical categories: SEC, DATA, OPS, PERF, BUS, and TECH

**Coverage Summary:**

- P0 scenarios: 10, estimated at about 70 to 110 hours
- P1 scenarios: 8, estimated at about 32 to 58 hours
- P2 and P3 scenarios: 0 planned
- Total effort: about 102 to 180 hours including setup, stabilization, and contingency
- Expected timeline: about 3 to 6 weeks for one test engineer with specialist support

## Not in Scope

| Item | Reasoning | Mitigation |
| --- | --- | --- |
| Offline capture for records other than work orders | The epic explicitly limits offline capture to work orders. | Keep existing online regression coverage for other record types and plan separate test designs for future offline scopes. |
| Changes to the dispatcher web console | The epic states that the console is unchanged. | Use the existing console as an end-to-end observation point and run its order display regression suite. |
| Changes to charging behavior or schedule | Billing continues through the existing nightly service, and this epic neither calls nor changes it. | Verify that sync creates no new billing calls and run existing billing regression coverage for stored card references. |
| Regional routing implementation changes | The platform routing layer remains unchanged. | Run existing regional routing isolation checks for synchronized orders and retain platform ownership of routing validation. |

## Risk Assessment

### High-Priority Risks, Score 6 or Greater

| Risk ID | Category | Description and source evidence | Probability | Impact | Score | Mitigation | Owner | Timeline |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| R-001 | SEC | Story 7.1 states that the plain SQLite queue contains the stored card reference and billing address, lacks encryption at rest, and relies solely on the device screen lock. Device loss, backup, debugging, or compromise could expose sensitive order data. | 3 | 3 | 9 | Encrypt queue contents with Android Keystore backed keys, minimize queued sensitive fields, prevent backup and debug extraction, and validate locked and compromised device scenarios. | Mobile engineering and Security | Resolve before implementation acceptance |
| R-002 | DATA | Story 7.2 states that two technicians can edit the same work order, the server performs no version or timestamp check, later arrival overwrites earlier data, and no record preserves the lost lines. | 3 | 3 | 9 | Add versioned conflict detection, retain both revisions, provide a deterministic merge or conflict workflow, and audit superseded revisions. | Backend engineering and Product | Resolve before release |
| R-003 | OPS | Story 7.3 specifies immediate, indefinite retries with no backoff, attempt cap, or dead-letter path. A permanently invalid payload can create an uncontrolled request loop. | 3 | 3 | 9 | Classify transient and permanent failures, use exponential backoff with jitter, cap attempts, quarantine terminal failures, expose recovery status, and alert on retry health. | Mobile engineering, Backend engineering, and SRE | Resolve before release |
| R-004 | PERF | Story 7.3 requires 2,000 queued items to finish syncing within 30 seconds on the fleet's mid-range devices. The representative device, network profile, and server load are undefined. | 2 | 3 | 6 | Define representative conditions, benchmark the full path, optimize batching safely, and enforce the threshold in repeatable device and protocol load tests. | Mobile engineering and Performance engineering | Benchmark before feature complete; gate before release |
| R-005 | OPS | Story 7.4 specifies universal enablement, no staged rollout, no disable switch, and a one to three day replacement-build delay. A severe defect would affect every technician during that delay. | 2 | 3 | 6 | Add a remote kill switch, stage rollout by cohort, define rollback criteria, and rehearse disablement and recovery. | Product, Mobile engineering, and Release engineering | Complete before production rollout |
| R-006 | DATA | The acceptance criteria require an accepted order to appear on the dispatcher console unchanged. Serialization, retries, ingestion, persistence, or read-model transformation could mutate, lose, or duplicate data. | 2 | 3 | 6 | Use stable order and mutation identifiers, integrity checks, idempotent ingestion, and field-level comparison across capture, persistence, and dispatch display. | Mobile engineering, Backend engineering, and QA | Complete before release |
| R-007 | BUS | Story 7.1 requires an offline save to persist locally and appear as captured. A failed or partial local write could block field work or falsely report success. | 2 | 3 | 6 | Make persistence atomic, display captured only after commit, test storage exhaustion and interruption, and provide a visible recovery path. | Mobile engineering and QA | Complete before release |
| R-008 | TECH | Story 7.3 relies on the operating system reporting a usable network, and the acceptance criteria require synchronization without technician action. Lifecycle or connectivity scheduling failures could strand the queue. | 2 | 3 | 6 | Validate connectivity transitions and process lifecycle, persist sync scheduling across restarts, confirm server reachability, and instrument queue age and trigger outcomes. | Mobile engineering and SRE | Complete before release |

### Medium-Priority Risks, Score 3 to 4

None identified from the supplied epic.

### Low-Priority Risks, Score 1 to 2

None identified from the supplied epic.

### Risk Category Legend

- **TECH:** Technical architecture, lifecycle, integration, and scalability
- **SEC:** Security controls and data exposure
- **PERF:** Performance thresholds and resource limits
- **DATA:** Data integrity, loss, corruption, and inconsistency
- **BUS:** Business workflow and user impact
- **OPS:** Deployment, recovery, monitoring, and operational safety

## NFR Planning

This section defines planned validation. Final NFR evidence decisions belong in `nfr-assess` after implementation.

| NFR Category | Requirement or Threshold | Risk Link | Planned Validation | Evidence Needed |
| --- | --- | --- | --- | --- |
| Security | Protect local card references and billing addresses. Approved encryption, retention, backup, and compromise thresholds are UNKNOWN. | R-001 | Device storage inspection, backup extraction checks, Keystore validation, rooted-device review, and sensitive logging scan. | Instrumentation report, storage inspection artifacts, security scans, and approved threat review. |
| Performance | Drain 2,000 queued items within 30 seconds after usable connectivity returns. Device, network, load, and timing boundaries are UNKNOWN. | R-004 | Full-path benchmark on representative fleet hardware plus protocol-level load. | Timed runs, percentile data, queue drain traces, CPU, memory, battery, server latency, throughput, and errors. |
| Reliability | Persist offline saves, sync automatically, survive restarts, bound retries, prevent duplicates, and surface terminal failures. Retry timing, attempt cap, recovery target, duplicate tolerance, and maximum queue age are UNKNOWN. | R-003, R-007, R-008 | Storage and network fault injection, lifecycle interruption, restart recovery, idempotency, and retry policy validation. | Automated reports, fault logs, queue-age metrics, retry counters, duplicate checks, alerts, and recovery traces. |
| Scalability | Support 2,000 items per device during concurrent fleet reconnection. Concurrent technician volume and server capacity targets are UNKNOWN. | R-004 | Coordinated protocol load with server and database observation. | Load report, saturation graphs, database contention metrics, throughput, latency distribution, and errors. |
| Maintainability | No epic-specific threshold exists. | R-008 | CI coverage, static analysis, dependency scanning, migration tests, telemetry contract checks, and runbook review. | CI reports, coverage summary, scan output, migration results, and reviewed runbook. |
| Compliance | Classify and protect the stored card reference and billing address. Applicable payment, privacy, retention, deletion, and audit rules are UNKNOWN. | R-001 | Data inventory, privacy and payment-data review, retention validation, routing regression, and audit-log inspection. | Approved classification, review record, retention report, routing evidence, and audit samples. |
| Operations | Provide rapid disablement and controlled rollout. The store replacement path takes one to three days; acceptable rollback time is UNKNOWN. | R-005 | Kill-switch validation, staged rollout rehearsal, alert testing, and rollback exercise. | Rollout record, disablement evidence, monitoring captures, alert results, and rollback timing. |

**Unknown thresholds:** Queue encryption and retention standard; device compromise scope; representative device and network profile; performance measurement boundaries; concurrent reconnect volume; retry delay, cap, and terminal policy; acceptable queue age; recovery time; duplicate tolerance; maintainability targets; applicable compliance rules; acceptable disable and rollback time.

## Entry Criteria

- [ ] Product, Security, and Engineering have approved mitigations for R-001, R-002, R-003, and R-005.
- [ ] Owners have resolved the UNKNOWN NFR thresholds that govern security, performance, reliability, scalability, compliance, and operations.
- [ ] A testable Android build and matching server version are deployed to an isolated test installation.
- [ ] Representative fleet devices, Android versions, network profiles, and lifecycle controls are available.
- [ ] Synthetic work orders, parts, labour lines, card tokens, billing addresses, invalid payloads, and 2,000 item backlog factories are ready with cleanup.
- [ ] The environment supports API fault injection, server and database metrics, log correlation, and dispatcher console verification.

## Exit Criteria

- [ ] P0 pass rate equals 100 percent.
- [ ] P1 pass rate is at least 95 percent, with approved waivers for any remaining failure.
- [ ] All four acceptance criteria have executed automated coverage and traceable evidence.
- [ ] All score 9 risks are resolved, and every score 6 risk has completed mitigation and evidence.
- [ ] Requirements coverage is at least 80 percent overall and 100 percent for P0 requirements.
- [ ] The 2,000 item backlog drains within 30 seconds under the approved representative conditions.
- [ ] No open severity 1 or severity 2 defect remains in offline capture, edit, sync, data protection, conflict handling, retry safety, or rollback.
- [ ] Evidence exists for every in-scope NFR category and is ready for `nfr-assess`.

## Test Coverage Plan

P0, P1, P2, and P3 express business and quality priority. Execution timing is defined separately.

### P0: Critical

**Criteria:** Critical business, security, data-integrity, performance, or operational impact with no safe workaround.

| Test ID | Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| --- | --- | --- | --- | ---: | --- | --- |
| 7.1-COMP-001 | Commit the queue write atomically and enter captured state only after SQLite confirms success; storage-full and interrupted-write paths remain recoverable. | Component | R-007 | 1 | Mobile engineering | Exercises the queue repository and presentation state with fault-injected storage. |
| 7.1-E2E-001 | Save an order offline and observe it in the captured list after app restart on a representative Android device. | E2E | R-007 | 1 | QA and Mobile engineering | Covers the critical technician journey across UI, lifecycle, and real SQLite storage. |
| 7.1-E2E-002 | Verify approved protection of sensitive queue contents across app storage, backups, logs, and diagnostics. | E2E | R-001 | 1 | Security and QA | Device-level evidence establishes Android runtime and Keystore controls. |
| 7.2-API-001 | Submit two revisions based on one server version and verify deterministic conflict handling, preservation, and audit. | API | R-002 | 1 | Backend engineering and QA | Directly validates the ingestion and persistence mitigation. |
| 7.2-E2E-001 | Edit one work order on two offline devices, reconnect in each arrival order, and verify no silent line loss. | E2E | R-002 | 1 | QA | Validates the complete multi-device conflict journey. |
| 7.3-API-002 | Permanently reject a payload and verify bounded requests, quarantine, actionable status, metrics, and alerts. | API | R-003 | 1 | Backend engineering, SRE, and QA | Confirms that an invalid payload cannot create an endless request storm. |
| 7.3-E2E-003 | Capture offline, sync, and compare the device payload, server record, and dispatcher representation field by field. | E2E | R-006 | 1 | QA | Covers the unchanged-server-record acceptance criterion across participating systems. |
| 7.3-E2E-004 | Drain 2,000 realistic items within 30 seconds on the approved device and network profile. | E2E | R-004 | 1 | Performance engineering and QA | Full-path device evidence is required by the stated threshold. |
| 7.4-E2E-001 | Disable offline capture remotely on an installed production-like build and verify a safe state without a store update. | E2E | R-005 | 1 | Release engineering and QA | Demonstrates the rapid operational control. |
| 7.4-E2E-002 | Rehearse staged rollout and rollback with monitoring, alerts, and queued-item recovery. | E2E | R-005 | 1 | Release engineering, SRE, and QA | Covers the all-user blast radius and delayed store replacement path. |

**Total P0:** 10 scenarios, about 70 to 110 hours

### P1: High

**Criteria:** Core, frequent, or complex behavior with material user reach and a limited workaround.

| Test ID | Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| --- | --- | --- | --- | ---: | --- | --- |
| 7.1-UNIT-001 | Serialize and deserialize every order field without mutation. | Unit | R-006 | 1 | Mobile engineering | Pure transformation logic belongs at unit level. |
| 7.2-UNIT-001 | Append edits as ordered immutable mutations and allow edits only until acceptance. | Unit | R-006 | 1 | Mobile engineering | Covers the local queue state machine. |
| 7.3-UNIT-001 | Classify upload failures and enforce backoff, jitter, attempt caps, and quarantine. | Unit | R-003 | 1 | Mobile engineering | Deterministic unit coverage suits the branching retry policy. |
| 7.3-API-001 | Fail uploads transiently, then accept them, and verify bounded retries plus one persisted order per mutation. | API | R-003, R-006 | 1 | Backend engineering and QA | Fault injection validates retry and idempotency at the service boundary. |
| 7.3-E2E-001 | Restore usable connectivity and verify automatic sync across foreground, background, and resumed states. | E2E | R-008 | 1 | Mobile engineering and QA | Android connectivity and lifecycle behavior require device validation. |
| 7.3-E2E-002 | Kill and restart during queue drain, then verify resumed sync without loss, duplication, or reordering. | E2E | R-008, R-006 | 1 | Mobile engineering and QA | Covers durable scheduling after process interruption. |
| 7.3-API-003 | Simulate the approved concurrent fleet reconnect profile and verify server and database thresholds. | API | R-004 | 1 | Performance engineering and SRE | Protocol-level load isolates server scalability. Threshold definition blocks execution. |
| 7.4-COMP-001 | Evaluate remote enablement state and preserve access to already queued work after disablement. | Component | R-005 | 1 | Mobile engineering | Covers flag policy and local state transitions. |

**Total P1:** 8 scenarios, about 32 to 58 hours

### P2: Medium

**Criteria:** Secondary behavior with narrower user reach and an acceptable workaround.

No P2 scenarios are justified by the supplied epic.

**Total P2:** 0 scenarios, 0 planned hours

### P3: Low

**Criteria:** Rare, cosmetic, or experimental behavior with minimal impact and an easy workaround.

No P3 scenarios are justified by the supplied epic.

**Total P3:** 0 scenarios, 0 planned hours

## Execution Strategy

**Philosophy:** Run every functional scenario in pull requests while the suite stays under 15 minutes. Defer suites with material device, environment, duration, or load cost.

- **Pull request:** Run all unit, component, and functional API scenarios plus one offline capture and reconnect device smoke path. Parallelize runner workers and Android device shards to target less than 15 minutes. Run any existing dispatcher Playwright regression in a parallel job.
- **Nightly:** Run the complete device matrix, lifecycle interruption, two-device conflict, sensitive-data inspection, permanent rejection, and dispatcher propagation scenarios.
- **Weekly:** Run the 2,000 item benchmark, concurrent fleet load, retry soak, security automation, and staged rollout or rollback rehearsal in a controlled environment.

P0 scenarios run before P1 scenarios within each stage so critical failures stop the run early.

## Resource Estimates

### Test Development Effort

| Priority | Planned Count | Effort Range | Notes |
| --- | ---: | --- | --- |
| P0 | 10 | About 70 to 110 hours | Android device setup, SQLite fault injection, security controls, multi-device concurrency, performance, and release recovery. |
| P1 | 8 | About 32 to 58 hours | Supporting logic, API, lifecycle, and fleet load coverage. |
| P2 | 0 | About 0 to 8 hours contingency | Reserved for secondary scenarios discovered during threshold clarification. |
| P3 | 0 | About 0 to 4 hours contingency | Reserved for low-impact diagnostics discovered during implementation. |
| **Total** | **18** | **About 102 to 180 hours** | Includes fixtures, environments, automation, evidence capture, stabilization, and contingency. |

Expected elapsed time is about 3 to 6 weeks for one test engineer with scheduled mobile, backend, security, performance, release, and SRE support.

### Prerequisites

**Test Data:**

- Synthetic work-order factory with parts, labour, card tokens, billing addresses, versions, and deterministic identifiers
- Queue factory for ordered edits, invalid payloads, retries, and 2,000 item backlogs
- Isolated customer-installation fixture with cleanup for server records and dispatcher views

**Tooling:**

- Project Android unit, component, and device runner for application and lifecycle validation
- API fault-injection and protocol-load tooling for ingestion, retry, idempotency, and scalability
- Approved mobile security tooling for storage, backup, logging, and device-compromise inspection
- Metrics and log access for client queue health, server ingestion, database behavior, and alerts

**Environment:**

- Production-like Android builds on agreed mid-range fleet hardware and supported Android versions
- Controllable offline, degraded, and restored networks with an agreed performance profile
- Isolated server installation with dispatcher console access, fault injection, observability, and regional routing regression capability
- Remote configuration environment for kill-switch and staged rollout rehearsal

## Quality Gate Criteria

### Pass and Fail Thresholds

- **P0 pass rate:** 100 percent
- **P1 pass rate:** At least 95 percent; every failure requires triage and an approved waiver
- **P2 and P3 pass rate:** At least 90 percent if scenarios are later added
- **High-risk mitigations:** 100 percent complete with evidence, or a formally approved waiver with owner and expiry

### Coverage Targets

- **Four acceptance criteria:** 100 percent automated coverage
- **P0 requirements:** 100 percent requirements coverage
- **Overall requirements:** At least 80 percent coverage
- **Security scenarios:** 100 percent pass rate
- **Business logic:** At least 80 percent branch coverage once the implementation exists
- **Edge cases:** At least 60 percent of identified error and lifecycle cases

### Non-Negotiable Requirements

- [ ] All P0 tests pass.
- [ ] R-001, R-002, and R-003 are resolved or carry formal release waivers with executive and security approval.
- [ ] R-004 through R-008 have completed mitigations and evidence.
- [ ] The 2,000 item queue drains within 30 seconds under approved representative conditions.
- [ ] No silent order-line loss, duplicate accepted mutation, exposed sensitive queue content, uncontrolled retry loop, or unrecoverable rollout defect remains.
- [ ] Evidence exists for every in-scope NFR category. `nfr-assess` owns the final NFR decision.

## Mitigation Plans

### R-001: Sensitive Data in Plain Local Storage, Score 9

**Mitigation Strategy:** Encrypt the queue with hardware-backed keys where supported; minimize stored fields; exclude sensitive data from backups, logs, and diagnostics; define retention and deletion; complete device compromise testing.  
**Owner:** Mobile engineering and Security  
**Timeline:** Resolve before implementation acceptance  
**Status:** Planned  
**Verification:** 7.1-E2E-002 plus approved security and compliance evidence  
**Residual Risk:** An unlocked or deeply compromised device may expose data in memory. Document the accepted threat boundary and incident response.

### R-002: Silent Concurrent Edit Loss, Score 9

**Mitigation Strategy:** Add server-side version checks; retain conflicting revisions; provide deterministic resolution; audit every superseded edit; test both arrival orders.  
**Owner:** Backend engineering and Product  
**Timeline:** Resolve before release  
**Status:** Planned  
**Verification:** 7.2-API-001 and 7.2-E2E-001  
**Residual Risk:** Human merge decisions can still be wrong. Preserve revision history and actor attribution for recovery.

### R-003: Unbounded Immediate Retry Loop, Score 9

**Mitigation Strategy:** Separate transient and permanent failures; implement exponential backoff with jitter; cap attempts; quarantine terminal failures; expose recovery status; monitor retry volume and queue age.  
**Owner:** Mobile engineering, Backend engineering, and SRE  
**Timeline:** Resolve before release  
**Status:** Planned  
**Verification:** 7.3-UNIT-001, 7.3-API-001, and 7.3-API-002  
**Residual Risk:** Quarantined items require operational follow-up. Define ownership, alert response, and replay authorization.

### R-004: Backlog Performance and Reconnect Scale, Score 6

**Mitigation Strategy:** Define representative conditions; establish a baseline; optimize batching and concurrency without violating ordering or idempotency; capacity-test synchronized fleet reconnects.  
**Owner:** Mobile engineering and Performance engineering  
**Timeline:** Benchmark before feature complete; gate before release  
**Status:** Planned  
**Verification:** 7.3-E2E-004 and 7.3-API-003  
**Residual Risk:** Field network and device variance may exceed the approved profile. Monitor real queue-drain percentiles and resource usage after rollout.

### R-005: Universal Release Without Rapid Disablement, Score 6

**Mitigation Strategy:** Add remote enablement control; preserve queued work during disablement; stage rollout by cohort; define abort thresholds; rehearse rollback and recovery.  
**Owner:** Product, Mobile engineering, and Release engineering  
**Timeline:** Complete before production rollout  
**Status:** Planned  
**Verification:** 7.4-COMP-001, 7.4-E2E-001, and 7.4-E2E-002  
**Residual Risk:** Remote configuration can itself fail. Cache a safe state and retain a tested replacement-build procedure.

### R-006: Order Mutation, Loss, or Duplication Across Sync, Score 6

**Mitigation Strategy:** Assign stable order and mutation identifiers; preserve field-level integrity; make ingestion idempotent; compare device, server, and dispatch representations; correlate all stages in logs.  
**Owner:** Mobile engineering, Backend engineering, and QA  
**Timeline:** Complete before release  
**Status:** Planned  
**Verification:** 7.1-UNIT-001, 7.2-UNIT-001, 7.3-API-001, 7.3-E2E-002, and 7.3-E2E-003  
**Residual Risk:** Future read-model transformations may introduce drift. Keep the end-to-end field comparison in regression.

### R-007: False Capture or Local Persistence Failure, Score 6

**Mitigation Strategy:** Use atomic transactions; report captured after commit; detect storage exhaustion; recover interrupted writes; expose a technician-visible failure and retry path.  
**Owner:** Mobile engineering and QA  
**Timeline:** Complete before release  
**Status:** Planned  
**Verification:** 7.1-COMP-001 and 7.1-E2E-001  
**Residual Risk:** Catastrophic device or filesystem failure can destroy local data. Define user guidance and support recovery boundaries.

### R-008: Missed Automatic Synchronization, Score 6

**Mitigation Strategy:** Persist scheduled work; validate network reachability; handle Android process and lifecycle transitions; instrument trigger outcomes and queue age; alert on stranded queues.  
**Owner:** Mobile engineering and SRE  
**Timeline:** Complete before release  
**Status:** Planned  
**Verification:** 7.3-E2E-001 and 7.3-E2E-002  
**Residual Risk:** Vendor-specific Android power management can delay background work. Track the supported device matrix and field queue age.

## Assumptions and Dependencies

### Assumptions

1. Test data will use synthetic billing addresses and non-production stored card tokens.
2. A production-like test installation can expose the accepted server record and dispatcher representation for field comparison.
3. The single-tenant installation model and regional routing behavior remain unchanged, as stated in the epic.

### Dependencies

1. Product and engineering decisions for encryption, conflict handling, retry policy, and remote disablement are required before final automation acceptance.
2. The approved mid-range device, Android versions, network profile, server load, and measurement boundary are required before performance execution.
3. Stable order and mutation identifiers, fault-injection controls, correlated telemetry, and queue health metrics are required before reliability coverage.
4. Isolated test installations, dispatcher access, regional routing regression capability, and synthetic data cleanup are required before end-to-end execution.

### Risks to the Plan

- **Risk:** The repository has no implementation, test framework, or existing fixtures.
  - **Impact:** Exact tooling, selectors, APIs, and automation effort remain uncertain.
  - **Contingency:** Rebaseline the effort and bind scenarios to concrete interfaces when implementation and framework choices exist.
- **Risk:** Device lab and production-like fault injection may be unavailable when implementation completes.
  - **Impact:** Security, lifecycle, performance, and recovery evidence would remain incomplete.
  - **Contingency:** Reserve fleet hardware early, provide controllable network infrastructure, and require service fault-injection hooks as entry criteria.

## Follow-on Workflows

- Run `/bmad-testarch-atdd` explicitly to create failing P0 acceptance tests after architecture blockers are resolved.
- Run `/bmad-testarch-automate` explicitly for the broader plan after implementation interfaces exist.
- Run `nfr-assess` after the planned NFR evidence has been collected.

## Approval

- [ ] Product Manager: Unassigned; Date: Pending
- [ ] Tech Lead: Unassigned; Date: Pending
- [ ] Security Lead: Unassigned; Date: Pending
- [ ] QA Lead: Unassigned; Date: Pending

**Comments:** Approval requires disposition of all score 9 risks and agreement on UNKNOWN thresholds.

## Interworking and Regression

| Service or Component | Impact | Regression Scope |
| --- | --- | --- |
| Android order client | Adds offline persistence, queue state, background sync, and remote enablement. | Existing online order open, edit, save, authentication, app upgrade, process lifecycle, storage migration, and supported-device tests. |
| Local SQLite storage | Stores full order payloads and ordered mutations. | Schema migration, transaction atomicity, storage-full handling, backup exclusion, encryption, deletion, and restart recovery. |
| Android connectivity and background scheduler | Triggers unattended queue drain. | Offline, degraded, captive, restored, foreground, background, reboot, power-saving, and vendor-specific scheduling coverage. |
| Order ingestion API | Accepts queued mutations and must support idempotency, conflict handling, bounded retry semantics, and load. | Existing create and update contracts, authentication, validation, duplicate handling, error classification, rate limits, and observability. |
| Order database | Persists synchronized orders and revision history. | Transaction, version, audit, tenant isolation, contention, backup, and recovery tests. |
| Dispatcher web console | Displays synchronized orders without epic changes. | Existing order-list and order-detail regression plus field-level comparison for synchronized orders. |
| Regional routing layer | Continues to enforce data residency. | Existing region routing and cross-region isolation tests for synchronized order traffic. |
| Billing service | Remains on its nightly schedule and receives no new calls from this epic. | Existing nightly charging regression and an integration assertion that offline sync makes no billing request. |

Mobile, backend, platform, security, release, SRE, and dispatcher-console owners must coordinate the production-like environment, correlated telemetry, device matrix, and rollback rehearsal.

## Appendix

### Knowledge Base References

- `risk-governance.md`: Risk classification, ownership, and mitigation thresholds
- `probability-impact.md`: Probability, impact, score, and gate action scales
- `test-levels-framework.md`: Unit, component, API, and end-to-end selection
- `test-priorities-matrix.md`: P0 through P3 business priority decisions
- `nfr-criteria.md`: NFR planning and evidence expectations
- `playwright-cli.md`: Loaded by the browser automation default; no live browser target was available during this requirements-only run

### Related Documents

- Epic: `field-order-capture/docs/epics/epic-7-offline-order-capture.md`
- PRD: N/A for this run
- Architecture: N/A for this run
- Tech spec: N/A for this run
- Prior system-level test design: N/A for this run

**Generated by:** BMad TEA Agent, Test Architect Module  
**Workflow:** `bmad-testarch-test-design`  
**Version:** 5.0
