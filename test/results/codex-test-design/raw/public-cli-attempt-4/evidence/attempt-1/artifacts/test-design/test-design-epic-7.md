---
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-10-09T21:59:22-0500'
runScope: 'epic'
runKey: 'epic-7'
inputDocuments:
  - '/private/tmp/remaining-skills-evidence/test-design-cli-final/field-order-capture/docs/epic-7.md'
  - '/private/tmp/tea-test-design-final-codex/skills/bmod-tea/knowledge/risk-governance.md'
  - '/private/tmp/tea-test-design-final-codex/skills/bmod-tea/knowledge/probability-impact.md'
  - '/private/tmp/tea-test-design-final-codex/skills/bmod-tea/knowledge/test-levels-framework.md'
  - '/private/tmp/tea-test-design-final-codex/skills/bmod-tea/knowledge/test-priorities-matrix.md'
  - '/private/tmp/tea-test-design-final-codex/skills/bmod-tea/knowledge/nfr-criteria.md'
---

# Test Design: Epic 7, Offline Order Capture for Field Technicians

**Date:** 2026-10-09  
**Author:** User  
**Status:** Draft

---

## Executive Summary

**Scope:** Full epic-level test design for Epic 7.

Epic 7 adds native Android order capture, editing, and synchronization during extended network outages. The plan covers the mobile queue, server acceptance, dispatcher-console fidelity, security, concurrency, retry safety, performance, and release recovery. The repository contains no implementation or existing automated tests, so every scenario is planned as new coverage.

**Risk Summary:**

- Total risks identified: 5
- High-priority risks with score 6 or greater: 5
- Critical score 9 risks: 3
- Critical categories: SEC, DATA, OPS
- Release blockers: plaintext sensitive queue data, silent lost updates, and the absence of a rapid disable path

**Coverage Summary:**

- P0 scenarios: 10, approximately 50 to 80 hours
- P1 scenarios: 12, approximately 55 to 90 hours
- P2 scenarios: 1, approximately 3 to 6 hours
- P3 scenarios: 0
- Total: 23 scenarios, approximately 108 to 176 hours across 3 to 5 weeks with parallel specialist work

---

## Not in Scope

| Item | Reasoning | Mitigation |
| --- | --- | --- |
| Offline capture for entities other than work orders | Explicitly excluded by Epic 7. | Keep fixtures and routes scoped to work orders. Track any expansion as a separate epic. |
| Dispatcher web-console changes | The console is unchanged by this epic. | Use the existing console as an end-to-end observation point for order fidelity. |
| Charging behavior or schedule changes | Billing remains on its existing nightly schedule and Epic 7 must not call or modify it. | Add an API-spy regression that confirms capture and sync produce no billing-service call. |

---

## Risk Assessment

Probability and impact use a 1 to 3 scale. Score equals probability multiplied by impact. Scores of 6 or greater require mitigation. Score 9 blocks release until resolved or formally waived.

### High-Priority Risks, Score 6 or Greater

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Timeline |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| R-001 | SEC | Sensitive payment and address data can be recovered from device storage. Epic 7.1 states that the full payload includes the stored card reference and billing address in an unencrypted SQLite file protected only by the screen lock. | 3 | 3 | 9 | Encrypt queue data with Android Keystore-backed keys, exclude it from backups, minimize retained fields, verify deletion after acknowledgment, and complete device extraction testing plus security review. | Mobile security lead | Before implementation acceptance and release candidate |
| R-002 | DATA | Concurrent offline edits can silently overwrite accepted work and permanently lose parts and labour lines. Epic 7.2 states that arrival order wins with no version or timestamp check and no record of the lost lines. | 3 | 3 | 9 | Add optimistic concurrency or conflict detection, retain immutable revisions, define deterministic resolution, and test both arrival orders. | Order platform lead | Before implementation acceptance |
| R-003 | OPS | A permanently rejected payload can trigger unlimited immediate uploads, consuming battery and bandwidth and loading the server. Epic 7.3 specifies indefinite retry with no backoff, cap, or dead-letter path. | 3 | 2 | 6 | Classify failures, use bounded exponential backoff with jitter, cap attempts or age, quarantine poison payloads, expose recovery state, and emit metrics and alerts. | Mobile sync lead and SRE | Before performance testing |
| R-004 | PERF | A full offline-day backlog may miss the required recovery time. Epic 7.3 requires 2,000 queued items to finish syncing within 30 seconds on actual mid-range fleet devices. | 2 | 3 | 6 | Define representative devices and network load, optimize safe batching, measure server acceptance, and gate release on repeatable 2,000-item runs within 30 seconds. | Performance engineer and mobile lead | Before release candidate |
| R-005 | OPS | A severe defect can affect every technician and stay active for one to three days. Epic 7.4 specifies global enablement with no feature flag, staged rollout, or disable path outside a new store-reviewed build. | 3 | 3 | 9 | Add a remote kill switch, staged cohorts, compatible queue migration, monitoring gates, and a tested rollback path that preserves queued data. | Release engineering lead and product owner | Before production rollout |

### Medium-Priority Risks, Score 3 to 4

No medium risks are supported as distinct failure mechanisms by the supplied Epic 7 evidence.

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |

### Low-Priority Risks, Score 1 to 2

No low risks are supported as distinct failure mechanisms by the supplied Epic 7 evidence.

| Risk ID | Category | Description | Probability | Impact | Score | Action |
| --- | --- | --- | ---: | ---: | ---: | --- |

### Risk Category Legend

- **TECH**: Technical architecture, integration, or scalability
- **SEC**: Security, privacy, access control, or data exposure
- **PERF**: Performance, latency, throughput, or resource limits
- **DATA**: Data loss, corruption, inconsistency, or auditability
- **BUS**: Business logic, user harm, or revenue impact
- **OPS**: Deployment, configuration, monitoring, or recovery

---

## NFR Planning

This section defines planned evidence. Final PASS, CONCERNS, or FAIL decisions belong in a later `nfr-assess` run after implementation evidence exists.

| NFR Category | Requirement / Threshold | Risk Link | Planned Validation | Evidence Needed |
| --- | --- | --- | --- | --- |
| Security | Queue confidentiality threshold is UNKNOWN. Current design stores a card reference and billing address in unencrypted SQLite. | R-001 | Device-level storage and backup inspection, key configuration review, field-minimization checks, deletion checks, security scans. | File-system extraction report, backup inspection, key review, scan reports, deletion results. |
| Performance | All 2,000 queued items reach server acceptance within 30 seconds on representative mid-range fleet devices. | R-004 | Repeated instrumented end-to-end benchmark across approved device, network, and server-load profiles. | Raw timestamps, p50, p95, maximum duration, CPU, memory, battery, byte counts, server saturation metrics. |
| Reliability | Upload starts without technician action when connectivity returns. Retry and recovery thresholds are UNKNOWN. | R-003 | Disconnect, reconnect, process-death, transient-error, permanent-error, durable-resume, idempotency, and quarantine tests. | Instrumentation results, scheduler traces, retry metrics, quarantine records, duplicate and loss counts. |
| Data integrity | Synced order is unchanged. Silent lost-update tolerance is zero. | R-002 | Concurrent-edit tests in both arrival orders, interrupted-batch recovery, canonical payload comparison through the console. | Revision records, conflict results, canonical diffs, idempotency audit, zero-loss assertions. |
| Scalability | Client backlog boundary is 2,000 items. Concurrent reconnect-storm threshold is UNKNOWN. | R-004 | Multi-device load plus client backlog benchmark. | Server latency and error percentiles, database utilization, queue drain rate, accepted throughput. |
| Operability | Rapid disable and rollback thresholds are UNKNOWN. Current recovery takes one to three days through store review. | R-005 | Staged rollout, kill-switch drill, rollback rehearsal, compatibility testing, alert verification. | Configuration audit, drill timeline, dashboard and alert captures, queued-data recovery report. |
| Maintainability | Overall automated code coverage target is at least 80%. Queue and sync core target is at least 90%, pending ratification. Migration and observability thresholds are UNKNOWN. | R-003, R-005 | Unit coverage, schema migration matrix, static analysis, structured telemetry contract checks, runbook review. | CI coverage and static-analysis reports, migration results, telemetry contract results, approved runbook. |
| Compliance and residency | Preserve regional routing and single-tenant isolation. Applicable control set for locally stored payment-related data is UNKNOWN. | R-001 | Region-routing regression, tenant-isolation API tests, security and compliance review. | Routing and isolation results, recorded compliance approval or required remediation. |

**Unknown thresholds:** encryption algorithm, key rotation, data retention, permitted local fields, representative device models, network profile, performance percentile rule, concurrent reconnect count, retry limits, backoff bounds, timeouts, duplicate limit, loss limit, recovery SLO, conflict policy, accepted-state editing policy, disable time, rollout cohorts, alert thresholds, supported rollback versions, and applicable payment or privacy controls.

---

## Entry Criteria

- [ ] R-001, R-002, and R-005 production design changes are approved before test implementation depends on their contracts.
- [ ] Missing NFR thresholds have named owners and approved values.
- [ ] Android implementation stack and test runner are identified.
- [ ] Representative fleet device models and controlled network profiles are available.
- [ ] Test environment includes Android clients, sync endpoint, database, dispatcher console, and observable regional routing.
- [ ] Factories can create work orders, technicians, queue payloads, conflicts, transient failures, permanent failures, and 2,000-item backlogs.
- [ ] Server telemetry exposes acceptance timestamps, correlation identifiers, retry classifications, queue depth, and saturation metrics without sensitive fields.
- [ ] Remote configuration and staged rollout controls exist for R-005 tests.

## Exit Criteria

- [ ] P0 pass rate is 100%.
- [ ] P1 pass rate is at least 95%, with every failure triaged and no acceptance criterion compromised.
- [ ] P2 pass rate is at least 90% or has an approved, time-bound waiver.
- [ ] No open P0 or P1 severity defect remains.
- [ ] R-001 through R-005 mitigations are complete and their linked tests pass.
- [ ] Requirements and risk traceability is 100%.
- [ ] Coverage targets and every non-negotiable gate in this plan are met.
- [ ] Planned evidence exists for every in-scope NFR category.

---

## Test Coverage Plan

P0, P1, P2, and P3 indicate priority. Execution timing appears in the Execution Strategy section.

### P0, Critical

**Criteria:** Critical business, security, data-integrity, or compliance impact with no safe workaround. Risk score supports the decision and does not assign priority by itself.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| --- | --- | --- | ---: | --- | --- |
| 7.1-INT-003: No plaintext card reference or billing address exists in SQLite, backups, logs, crash reports, or temporary files. | Integration | R-001 | 1 | Mobile security QA | Device extraction is the direct evidence. Device loss has no safe workaround. |
| 7.1-UNIT-001: Queue encryption, key failure, field minimization, and delete-after-acknowledgment branches behave safely. | Unit | R-001 | 1 | Mobile developer | Deterministic state-machine coverage complements device extraction. |
| 7.2-API-001: Concurrent offline edits in both arrival orders detect conflict and preserve both revisions. | API | R-002 | 1 | Backend QA | Silent work loss is irreversible under the supplied design. API coverage directly exercises concurrency control. |
| 7.2-E2E-002: Users can resolve a concurrent conflict and retain an audit trail. | E2E | R-002 | 1 | Mobile and web QA | Confirms that preserved revisions remain operationally recoverable across systems. |
| 7.3-INT-002: Interrupted sync resumes without missing or duplicating accepted mutations. | Integration | R-002 | 1 | Mobile and backend QA | Exercises client acknowledgment and server idempotency boundaries. |
| 7.3-E2E-003: The dispatcher console shows the complete synced order unchanged. | E2E | R-002 | 1 | End-to-end QA | Covers the acceptance criterion across Android, server persistence, and existing console. |
| 7.3-API-002: Sync stays in the configured region and cannot cross installation boundaries. | API | R-001 | 1 | Security QA | Preserves explicit residency and single-tenant constraints. |
| 7.4-E2E-001: Remote disable stops new capture and sync safely while preserving queued data. | E2E | R-005 | 1 | Release QA | Full device and remote-configuration behavior must work during a fleet-wide incident. |
| 7.4-INT-001: Staged targeting, safe defaults, expiry, and queue compatibility work across supported versions. | Integration | R-005 | 1 | Platform QA | Validates the release-control contract and rollback-safe persistence. |
| 7.4-E2E-002: A rollback drill stops cohort expansion, disables the feature within the approved threshold, and recovers queued data. | E2E | R-005 | 1 | Release engineering | Proves the complete operational recovery path. Disable-time threshold is pending. |

**Total P0:** 10 scenarios, approximately 50 to 80 hours. This exceeds the usual small P0 share because the epic explicitly introduces three score 9 security, data-integrity, and fleet-recovery risks with no safe source-supported workaround.

### P1, High

**Criteria:** Core, frequent, or complex behavior with material user reach and a limited workaround. Risk score supports the decision and does not assign priority by itself.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| --- | --- | --- | ---: | --- | --- |
| 7.1-E2E-001: Offline add-and-save shows the order as captured. | E2E | None | 1 | Mobile QA | Core user journey. The documented paper and re-key process preserves work with delay and error risk. |
| 7.1-INT-001: Offline save persists one complete, schema-valid queue entry. | Integration | None | 1 | Mobile QA | Covers the order-service to SQLite boundary without repeating the UI assertion. |
| 7.1-INT-002: Captured state survives process death, device restart, and relaunch. | Integration | None | 1 | Mobile QA | Required for hours-long outages. No separate local recovery path is supplied. |
| 7.2-E2E-001: A queued order stays editable until server acceptance and follows the approved post-acceptance policy. | E2E | None | 1 | Mobile QA | Core edit journey. The accepted-state rule requires clarification. |
| 7.2-INT-001: Each edit appends and reconstructs the latest intended order deterministically. | Integration | None | 1 | Mobile QA | Covers SQLite ordering and reconstruction. |
| 7.3-E2E-001: A usable network automatically starts upload and changes state only after server acceptance. | E2E | None | 1 | Mobile QA | Core reconnect journey with the paper process as a limited fallback. |
| 7.3-INT-001: Transient failures use bounded jittered backoff, survive restart, and eventually upload. | Integration | R-003 | 1 | Mobile QA | Scheduler and persistence integration provides deterministic timing evidence. |
| 7.3-API-001: A permanently invalid payload reaches a retry ceiling, enters quarantine, and stops server traffic. | API | R-003 | 1 | Backend and mobile QA | Directly proves request-storm prevention and diagnosable recovery state. |
| 7.3-E2E-002: A 2,000-item backlog reaches server acceptance within 30 seconds on each representative device. | E2E | R-004 | 1 | Performance QA | The threshold is explicit. Business consequence and recoverability after a miss remain unspecified. |
| 7.3-UNIT-001: Queue selection, acknowledgment, idempotency, retry classification, and state transitions cover boundaries. | Unit | R-003 | 1 | Mobile developer | Fast coverage for branch-heavy sync logic. |
| 7.NFR-INT-001: Telemetry records queue and retry state without sensitive fields. | Integration | R-003, R-004 | 1 | Mobile and SRE QA | Supplies reliability and performance evidence while guarding R-001. |
| 7.NFR-INT-002: Queue schema migrations preserve orders across supported upgrades and rollback-compatible versions. | Integration | R-005 | 1 | Mobile QA | Supports maintainability and recovery. Supported version span is pending. |

**Total P1:** 12 scenarios, approximately 55 to 90 hours.

### P2, Medium

**Criteria:** Secondary behavior with narrower user reach and an acceptable workaround. Risk score supports the decision and does not assign priority by itself.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| --- | --- | --- | ---: | --- | --- |
| 7.3-API-003: Capture and sync do not invoke billing or change its nightly schedule. | API | None | 1 | Backend QA | Out-of-scope regression guard. The unchanged billing schedule supplies the recovery context. |

**Total P2:** 1 scenario, approximately 3 to 6 hours.

### P3, Low

**Criteria:** Rare, cosmetic, or experimental behavior with minimal impact and an easy workaround. Risk score supports the decision and does not assign priority by itself.

The supplied epic contains no P3 behavior.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| --- | --- | --- | ---: | --- | --- |

**Total P3:** 0 scenarios, 0 hours.

---

## Execution Strategy

**Philosophy:** Run every functional scenario in pull requests while the suite stays under 15 minutes. Defer work only when duration or infrastructure is material.

- **Pull request:** Unit, API, deterministic integration, and one offline-capture device smoke flow. Run the full functional set when it remains below 15 minutes. Execute in parallel using the Android and service runners selected during implementation.
- **Nightly:** Full device matrix, process-death and reconnect coverage, concurrent-edit arrival orders, storage extraction, schema migrations, poison-payload recovery, and one representative-device 2,000-item benchmark.
- **Weekly:** Full device and network performance matrix, reconnect-storm load, endurance and battery runs, security scans, and rollback or kill-switch drills in a production-like environment.

A flaky P0 test remains release-blocking. Repair the source of nondeterminism. Do not mute or remove the assertion from the gate.

---

## Resource Estimates

### Test Development Effort

| Priority | Count | Effort per Scenario | Total Effort | Notes |
| --- | ---: | --- | --- | --- |
| P0 | 10 | Approximately 5 to 8 hours | Approximately 50 to 80 hours | Device security, concurrency, cross-system integrity, and recovery drills |
| P1 | 12 | Approximately 4 to 8 hours | Approximately 55 to 90 hours | Core mobile, synchronization, performance, telemetry, and migration coverage |
| P2 | 1 | Approximately 3 to 6 hours | Approximately 3 to 6 hours | Billing isolation regression |
| P3 | 0 | 0 hours | 0 hours | No qualifying scenarios |
| **Total** | **23** | **Varies by environment** | **Approximately 108 to 176 hours** | **Approximately 3 to 5 weeks with parallel specialist work** |

The range includes factories, controlled network profiles, representative devices, server instrumentation, and release-control fixtures.

### Prerequisites

**Test Data:**

- Work-order factory with parts, labour, address, card-reference token, Unicode, boundary sizes, and deterministic identifiers
- Technician assignment fixture for same-order concurrency
- Queue fixture for empty, one-item, 2,000-item, malformed, transient-failure, and permanent-failure states
- Automatic cleanup that removes server records and securely clears device data

**Tooling:**

- Native Android instrumentation or Maestro runner selected to match the implementation stack
- Device farm containing approved mid-range fleet models
- Network conditioning for offline, reconnect, latency, loss, and bandwidth profiles
- SQLite and backup inspection utilities for local data extraction
- API and load tooling for sync correctness, reconnect storms, and server saturation
- Static analysis, mobile security scanning, and CI coverage reporting

**Environment:**

- Production-like single-tenant installation with isolated database
- Dispatcher console connected to the same test installation
- Regional routing observability and a second isolated installation for access-denial tests
- Controllable sync endpoint responses and server telemetry
- Remote configuration, cohort rollout, alerting, and rollback controls

---

## Quality Gate Criteria

### Pass and Failure Thresholds

- **P0 pass rate:** 100% with no exception
- **P1 pass rate:** At least 95%, with a formal waiver for any remaining failure and no compromised acceptance criterion
- **P2 and P3 pass rate:** At least 90% where scenarios exist
- **High-risk mitigations:** R-001 through R-005 are 100% complete or have approved, time-bound waivers

### Coverage Targets

- **Requirements and risk traceability:** 100%
- **Overall automated code coverage:** At least 80%
- **Queue, conflict, retry, and sync state machines:** At least 90%, pending ratification
- **Security scenarios:** 100%
- **Critical end-to-end paths:** 100% of the paths listed as P0

### Non-Negotiable Requirements

- [ ] Every P0 test passes.
- [ ] No high risk with score 6 or greater remains unmitigated.
- [ ] Device extraction finds zero plaintext card references or billing addresses in queue-related storage, backups, logs, crash reports, and temporary files.
- [ ] Concurrent offline edits produce zero silent lost updates and retain an auditable resolution record.
- [ ] Each approved representative device completes a 2,000-item sync within 30 seconds under the approved profile for every required gate run.
- [ ] Permanent failures create no request after the approved retry or age ceiling. Transient retries follow bounded backoff.
- [ ] The remote-disable and rollback path preserves queued data and meets the approved disable-time threshold.
- [ ] Tenant isolation, regional routing, dispatcher-console fidelity, and billing non-interaction regressions pass.
- [ ] Each in-scope NFR category has its planned evidence. Final NFR status is deferred to `nfr-assess`.

---

## Mitigation Plans

### R-001: Plaintext Sensitive Queue Data, Score 9

**Mitigation Strategy:**

1. Encrypt queue data with Android Keystore-backed keys.
2. Minimize local sensitive fields and exclude queue data from backups.
3. Delete sensitive records and temporary copies after server acknowledgment.
4. Prevent sensitive values from entering logs, crash reports, and telemetry.
5. Complete device extraction and security review before release.

**Owner:** Mobile security lead  
**Timeline:** Before implementation acceptance and release candidate  
**Status:** Planned  
**Verification:** 7.1-INT-003, 7.1-UNIT-001, and 7.3-API-002  
**Residual Risk:** Rooted or physically compromised devices may still expose data in memory. Define the accepted device threat model and retention window.

### R-002: Silent Lost Updates, Score 9

**Mitigation Strategy:**

1. Add server-enforced versioning or equivalent conflict detection.
2. Preserve immutable revisions and both technicians' changes.
3. Define deterministic merge or user-resolution behavior.
4. Apply idempotency across interrupted batches.
5. Retain an audit record through dispatcher visibility.

**Owner:** Order platform lead  
**Timeline:** Before implementation acceptance  
**Status:** Planned  
**Verification:** 7.2-API-001, 7.2-E2E-002, 7.3-INT-002, and 7.3-E2E-003  
**Residual Risk:** Human resolution may be required for semantically incompatible edits. Define ownership and response time.

### R-003: Unbounded Immediate Retry, Score 6

**Mitigation Strategy:**

1. Classify transient and permanent responses.
2. Apply bounded exponential backoff with jitter.
3. Stop after an approved attempt or age ceiling.
4. Quarantine poison payloads and expose recovery state.
5. Monitor retry volume, reason, queue age, and quarantine depth.

**Owner:** Mobile sync lead and SRE  
**Timeline:** Before performance testing  
**Status:** Planned  
**Verification:** 7.3-INT-001, 7.3-API-001, 7.3-UNIT-001, and 7.NFR-INT-001  
**Residual Risk:** Long server outages can create a reconnect surge. Size and test the approved reconnect-storm profile.

### R-004: Backlog Misses the 30-Second Target, Score 6

**Mitigation Strategy:**

1. Define representative devices, network profiles, server load, and run count.
2. Instrument client enqueue, upload, and server-acceptance timestamps.
3. Optimize safe batching and payload transfer while preserving idempotency.
4. Run repeated 2,000-item gates and reconnect-storm load tests.
5. Monitor device and server resource saturation.

**Owner:** Performance engineer and mobile lead  
**Timeline:** Before release candidate  
**Status:** Planned  
**Verification:** 7.3-E2E-002 and 7.NFR-INT-001  
**Residual Risk:** Field networks can fall outside the approved profile. Define supported network conditions and user-visible behavior beyond them.

### R-005: No Rapid Disable or Staged Rollout, Score 9

**Mitigation Strategy:**

1. Add a remotely controlled kill switch with safe defaults and expiry.
2. Roll out through monitored cohorts.
3. Preserve queue compatibility across supported versions.
4. Define alert thresholds and a rollback runbook.
5. Rehearse disable and recovery before production rollout.

**Owner:** Release engineering lead and product owner  
**Timeline:** Before production rollout  
**Status:** Planned  
**Verification:** 7.4-E2E-001, 7.4-INT-001, 7.4-E2E-002, and 7.NFR-INT-002  
**Residual Risk:** Devices may remain offline during a disable event. Define client-side expiry and safe behavior for stale remote configuration.

---

## Assumptions and Dependencies

### Assumptions

1. `docs/epic-7.md` is the complete supplied requirements and architecture context for this run.
2. The Android order screen, dispatcher console, billing schedule, single-tenant storage, and regional routing retain their documented current behavior.
3. Existing paper capture and later re-keying remains available as a limited fallback for basic order capture.
4. No implementation, test framework, historical defect data, production metrics, or prior test-design artifact exists in the supplied project scope.

### Dependencies

1. Approved security design and compliance control set for local payment-related data before implementation acceptance.
2. Server concurrency and revision contract before concurrent-edit test implementation.
3. Retry, quarantine, idempotency, and observability contracts before synchronization test implementation.
4. Representative fleet devices, network profiles, and performance gate rules before release-candidate testing.
5. Remote configuration, staged rollout, and rollback controls before production rollout.

### Risks to Plan

- **Risk:** The repository contains requirements only.
  - **Impact:** Tool selection, fixture integration, and implementation-specific assertions cannot be finalized.
  - **Contingency:** Reconcile this design with the implementation repository and preserve all canonical risk and scenario identifiers.
- **Risk:** Several NFR thresholds are UNKNOWN.
  - **Impact:** Related scenarios can be automated structurally, while final gates remain incomplete.
  - **Contingency:** Assign owners during entry review and record approved thresholds before release-candidate execution.
- **Risk:** No historical performance or reliability baseline is supplied.
  - **Impact:** Trend-based regression detection starts with this epic's first controlled baseline.
  - **Contingency:** Store raw evidence and environment metadata for every benchmark.

---

## Follow-on Workflows, Manual

- Run `/bmad-testarch-atdd` to generate failing P0 acceptance-test scaffolds as a separate workflow.
- Run `/bmad-testarch-framework` if the implementation repository has no mobile and service test framework.
- Run `/bmad-testarch-automate` for broader coverage after implementation exists.
- Run `/bmad-testarch-ci` to encode the PR, nightly, and weekly stages.
- Run `nfr-assess` after implementation evidence exists.

---

## Approval

**Test Design Approved By:**

- [ ] Product Manager: Unassigned. Date: Pending
- [ ] Tech Lead: Unassigned. Date: Pending
- [ ] QA Lead: Unassigned. Date: Pending
- [ ] Security Lead: Unassigned. Date: Pending

**Comments:** Draft requires threshold resolution and team approval before execution.

---

## Interworking and Regression

| Service or Component | Impact | Regression Scope |
| --- | --- | --- |
| Native Android order editor | Saves and edits captured orders while offline. | Existing online save behavior, captured-state rendering, validation, accepted-state transition. |
| SQLite outbound queue | Stores full payloads, revisions, retry state, and acknowledgments. | Persistence, encryption, backup exclusion, process restart, schema migration, secure deletion. |
| Android connectivity and background scheduling | Starts and continues sync after usable connectivity returns. | Network transitions, process death, battery constraints, duplicate callbacks, bounded scheduling. |
| Server order API and persistence | Accepts queued mutations, enforces idempotency and conflict policy. | Online order writes, authorization, tenant isolation, regional route, validation, revision audit. |
| Dispatcher web console | Observes the unchanged persisted order. | Existing order detail display and canonical payload fidelity. |
| Billing service | Must remain untouched by this epic. | Zero capture or sync calls, unchanged nightly charging schedule. |
| Release configuration and monitoring | Controls staged enablement, disable, alerting, and rollback. | Safe defaults, cohort targeting, config expiry, offline devices, version compatibility, recovery drill. |

Cross-team coordination is required among mobile, order-platform, security, SRE, release engineering, product, and QA owners for all score 6 or greater risks.

---

## Appendix

### Knowledge Base References

- `risk-governance.md`: Risk classification and mitigation governance
- `probability-impact.md`: Probability, impact, score, and action thresholds
- `test-levels-framework.md`: Canonical test-level selection
- `test-priorities-matrix.md`: Independent P0 through P3 priority decisions
- `nfr-criteria.md`: NFR thresholds, evidence planning, and unknown-threshold handling

### Related Documents

- Epic: `docs/epic-7.md`
- PRD: Not supplied
- Architecture: Epic 7 context only. No separate architecture document supplied
- Prior system-level test design: None found in the configured artifact scope

---

**Generated by:** BMad TEA Agent, Test Architect Module  
**Workflow:** `bmad-testarch-test-design`  
**Version:** 4.0, BMad v6
