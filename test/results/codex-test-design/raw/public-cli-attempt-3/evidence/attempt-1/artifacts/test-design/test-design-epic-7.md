---
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-10-09'
inputDocuments:
  - '/private/tmp/remaining-skills-evidence/test-design-cli-schema-recovery/field-order-capture/docs/epic-7.md'
  - '/private/tmp/remaining-skills-frozen/test-design-schema-recovery/skills/bmod-tea/knowledge/risk-governance.md'
  - '/private/tmp/remaining-skills-frozen/test-design-schema-recovery/skills/bmod-tea/knowledge/probability-impact.md'
  - '/private/tmp/remaining-skills-frozen/test-design-schema-recovery/skills/bmod-tea/knowledge/test-levels-framework.md'
  - '/private/tmp/remaining-skills-frozen/test-design-schema-recovery/skills/bmod-tea/knowledge/test-priorities-matrix.md'
  - '/private/tmp/remaining-skills-frozen/test-design-schema-recovery/skills/bmod-tea/knowledge/nfr-criteria.md'
---

# Test Design: Epic 7: Offline order capture for field technicians

**Date:** 2026-10-09
**Author:** User
**Status:** Draft

---

## Executive Summary

**Scope:** Full epic-level test design for Epic 7

**Risk Summary:**

- Total risks identified: 5
- High-priority risks, score 6 or greater: 5
- Critical categories: security, data integrity, operations, and performance
- Release blockers while open: R-001, R-002, and R-003

**Coverage Summary:**

- P0 scenarios: 14, about 70 to 110 hours
- P1 scenarios: 10, about 35 to 55 hours
- P2/P3 scenarios: 2, about 6 to 12 hours
- **Total effort:** about 111 to 177 hours, or about 4 to 6 weeks for one test engineer with part-time specialist support

The plan covers the native Android client, its SQLite outbound queue, Android connectivity transitions, the order upload API, server persistence, and dispatcher-console observation. The repository contains no implementation, test framework, existing tests, prior system-level test design, or architecture artifact. Tool choices therefore remain implementation dependencies.

---

## Not in Scope

| Item | Reasoning | Mitigation |
| --- | --- | --- |
| Offline capture for entities other than work orders | The epic excludes all other entity types. | Retain existing regression coverage for those entities when a test suite becomes available. |
| Dispatcher web-console implementation changes | The epic changes no console behavior. | Use the console only to observe that an accepted order appears unchanged. |
| Billing behavior or schedule changes | The billing service remains untouched and charges on its existing nightly schedule. | Add a non-interaction regression assertion around capture and synchronization. |
| Regional-routing implementation changes | The platform routing layer continues to enforce residency. | Assert that offline-order uploads retain the installation's existing region. |
| Browser or web-view automation for the technician client | The technician client is native Android and has no browser surface or web view. | Use Android device automation and API-level validation. |

---

## Risk Assessment

Probability uses 1 for unlikely, 2 for possible, and 3 for likely. Impact uses 1 for minor, 2 for degraded, and 3 for critical. Score equals probability multiplied by impact.

### High-Priority Risks (Score ≥6)

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Timeline |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ---------- | ----- | -------- |
| R-001 | SEC | Theft, loss, backup extraction, or device compromise can expose the stored card reference, billing address, and full order payload. Story 7.1 states that the SQLite queue is plaintext and protected only by the device screen lock. | 3 | 3 | 9 | Encrypt the queue with platform-backed keys, minimize retained fields, prevent backup and log leakage, and verify secure deletion after acceptance. | Mobile Engineering and Security | Architecture decision before implementation; device evidence before release |
| R-002 | DATA | Concurrent offline edits can silently erase technician lines and leave no audit record. Story 7.2 states that later arrival overwrites earlier work with no version or timestamp check. | 3 | 3 | 9 | Add optimistic concurrency or merge semantics, preserve revision history, surface conflicts, and audit every submitted revision. | Order Platform Engineering and Product | Protocol decision before implementation; conflict suite green before release |
| R-003 | OPS | A permanently rejected payload can retry immediately forever, consuming power and data, loading the server, and never reaching a terminal state. Story 7.3 specifies no backoff, cap, or dead-letter path. | 3 | 3 | 9 | Classify failures, add capped exponential backoff with jitter, provide quarantine or dead-letter handling, expose state, and emit telemetry. | Mobile Engineering, API Engineering, and SRE | Policy before implementation; resilience and soak evidence before release |
| R-004 | PERF | A full offline-day backlog may exceed the 30-second recovery target and delay dispatcher visibility. Story 7.3 sets a 2,000-item threshold on fleet-representative mid-range devices. | 2 | 3 | 6 | Define the device and network profile, batch safely, instrument queue-drain time, and prove zero-loss completion within 30 seconds. | Mobile Performance Engineering and API Engineering | Baseline during implementation; release-candidate performance gate |
| R-005 | OPS | A severe defect reaches every technician at once and remains active during a one-to-three-day store review because no runtime disablement or staged rollout exists. Story 7.4 states these constraints directly. | 2 | 3 | 6 | Add a remotely controlled kill switch, staged cohorts, monitoring thresholds, and rehearsed rollback. | Release Engineering and Product Operations | Available and rehearsed before production enablement |

### Medium-Priority Risks (Score 3-4)

No distinct medium risks were identified from the supplied epic after consolidation.

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ---------- | ----- |

### Low-Priority Risks (Score 1-2)

No distinct low risks were identified from the supplied epic after consolidation.

| Risk ID | Category | Description | Probability | Impact | Score | Action |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ------ |

### Risk Category Legend

- **TECH:** Technical or architecture risk
- **SEC:** Security risk
- **PERF:** Performance or resource-limit risk
- **DATA:** Data integrity, loss, corruption, or inconsistency risk
- **BUS:** Business logic, revenue, or user-outcome risk
- **OPS:** Deployment, configuration, monitoring, or operational risk

---

## NFR Planning

**Purpose:** Capture epic-specific thresholds, planned validation, and evidence expected for later `nfr-assess`. Final NFR status requires implementation evidence.

| NFR Category | Requirement / Threshold | Risk Link | Planned Validation | Evidence Needed |
| --------------- | ----------------------- | --------- | ------------------------------------------ | -------------------------------- |
| Security | At-rest protection and data minimization target **UNKNOWN**. The supplied design stores sensitive fields in plaintext. | R-001 | Physical-device storage, backup, log, and deletion inspection | Extraction report, backup inspection, log scan, and deletion trace |
| Performance | A 2,000-item backlog completes within 30 seconds on an agreed mid-range fleet device. | R-004 | Instrumented physical-device client-to-server benchmark across controlled network profiles | Raw timings, percentile summary, device specification, and server metrics |
| Reliability | Upload begins without technician action after a usable-network signal. Retry limits and recovery thresholds are **UNKNOWN**. | R-003 | Connectivity transitions, deterministic clocks, fault injection, restart, and soak scenarios | Test report, retry timeline, queue metrics, network capture, and alerts |
| Data integrity | An accepted order appears unchanged. Silent concurrent-edit loss must be eliminated. | R-002 | Two-device conflict journey, API revision tests, payload comparison, and audit assertions | Payload hashes, field diff, server history, and device traces |
| Scalability | The per-device boundary is 2,000 items. Concurrent fleet size and server-capacity threshold are **UNKNOWN**. | R-004 | Boundary benchmark followed by multi-device API load after a fleet target exists | Load profile, throughput, saturation, and error-rate report |
| Maintainability and observability | Required queue metrics, correlation IDs, failure alerts, conflict events, and support diagnostics are **UNKNOWN**. | R-002, R-003 | Logging contract, metric and alert assertions, trace correlation, and runbook exercise | Schema review, sample traces, alert evidence, and runbook record |
| Compliance and privacy | Applicable handling controls for stored card references and billing addresses are **UNKNOWN**. | R-001 | Data classification, privacy review, payment-security review, and retention validation | Approved classification, review record, and retention or deletion report |
| Deployment safety | Current disablement takes one to three days. Acceptable rollback time and blast radius are **UNKNOWN**. | R-005 | Kill-switch, cohort exposure, monitoring, and rollback rehearsal | Drill report, configuration audit, and decision log |

**Unknown thresholds:** acceptable local encryption and retention controls; retry delay, cap, terminal-state, durability, and recovery bounds; fleet concurrency and server-capacity target; telemetry and alert requirements; applicable privacy and payment-security controls; rollback-time and rollout-blast-radius targets.

---

## Entry Criteria

- [ ] Security architecture for local sensitive data is approved and R-001 mitigation is implemented.
- [ ] Concurrent-edit protocol and audit semantics are approved and R-002 mitigation is implemented.
- [ ] Retry, terminal-failure, and telemetry policies are approved and R-003 mitigation is implemented.
- [ ] Representative mid-range Android device and controlled network profiles are named.
- [ ] Android test build, order API, test server, dispatcher console, and audit data are accessible.
- [ ] Factories exist for installations, technicians, work orders, revisions, and server responses.
- [ ] Remote-disablement and staged-rollout controls are available for validation.
- [ ] Requirements, assumptions, and missing NFR thresholds are agreed by Product, Development, Security, Platform, and QA.

## Exit Criteria

- [ ] P0 pass rate is 100 percent.
- [ ] P1 pass rate is at least 95 percent with every failure triaged and formally waived when accepted.
- [ ] P2 and P3 pass rate is at least 90 percent.
- [ ] No severity-1 or severity-2 defect remains open.
- [ ] Every risk scoring 6 or greater is mitigated or has an approved, owned, expiring waiver.
- [ ] The 2,000-item backlog completes within 30 seconds on the agreed physical-device profile with zero loss.
- [ ] Planned-scenario coverage reaches at least 80 percent overall and 100 percent for P0 and security scenarios.
- [ ] Every in-scope NFR category has the named evidence artifact for later `nfr-assess`.

---

## Test Coverage Plan

P0, P1, P2, and P3 express priority. Execution timing appears in the Execution Strategy section.

### P0 (Critical)

**Criteria:** Critical business, security, data-integrity, or compliance impact with no safe workaround. Risk score is supporting evidence and is not a required condition.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ------------- | ---------- | --------- | ---------- | ----- | ------- |
| 7.1-E2E-001: Sensitive queue fields resist extraction from app storage and device backup | E2E | R-001 | 1 | QA and Security | Physical-device inspection is required because the risk sits at the Android storage boundary. Exposure compromises customer and payment-related data; the epic supplies no safe workaround. |
| 7.1-E2E-002: Sensitive queue fields never appear in diagnostic logs and are securely removed after acceptance | E2E | R-001 | 1 | QA and Security | Whole-device evidence covers storage lifecycle and logging. Residual copies retain the same exposure consequence; the epic supplies no recovery path. |
| 7.2-API-001: Concurrent offline revisions are merged or rejected through explicit version control | API | R-002 | 1 | QA and API Engineering | The server boundary owns conflict enforcement. Silent overwrite loses technician lines, and the epic states that no record survives. |
| 7.2-E2E-001: Two offline technicians edit one order and both receive a deterministic preserved or conflict-visible outcome | E2E | R-002 | 1 | QA | A two-device journey proves the user-visible outcome. Silent loss has no source-backed workaround. |
| 7.2-API-002: Every submitted revision and conflict decision remains auditable | API | R-002 | 1 | QA and API Engineering | API and persistence assertions establish immutable history without duplicating the device journey. |
| 7.3-UNIT-001: Failure classification separates transient and permanent upload errors | Unit | R-003 | 1 | Development | Pure classification logic supports exhaustive boundary coverage. Misclassification can create endless retries with no terminal recovery. |
| 7.3-INT-001: Transient failures use capped exponential backoff with jitter and an attempt policy | Integration | R-003 | 1 | QA and Development | The worker, clock, and transport boundary establish retry scheduling. Immediate indefinite retry can consume resources and overload the service. |
| 7.3-E2E-001: A permanently rejected payload reaches quarantine or another terminal visible state without a tight loop | E2E | R-003 | 1 | QA | The full journey must prove visible resolution and stopped network activity. The supplied design has no terminal path. |
| 7.4-E2E-001: Remote disablement stops new offline capture safely on a released client | E2E | R-005 | 1 | QA and Release Engineering | Runtime control is observable through the released app path. A severe defect otherwise remains active for every technician for one to three days. |
| 7.4-INT-001: Rollout cohorts and rollback criteria limit exposure and preserve queued data | Integration | R-005 | 1 | QA and Release Engineering | Configuration-to-client integration proves blast-radius control. The current release model exposes every technician at once. |
| AC-4-E2E-001: A concurrently edited accepted order appears unchanged on the dispatcher console | E2E | R-002 | 1 | QA | Cross-system field and ordered-line comparison proves the critical data outcome after conflict handling. |
| REG-API-001: Installation A cannot read or write installation B order data | API | - | 1 | QA and Security | Regression assertion for the stated single-tenant storage constraint. Cross-installation exposure has no safe workaround. |
| REG-API-002: Offline-order uploads retain the installation's regional routing | API | - | 1 | QA and Platform | Regression assertion for the stated residency constraint. The applicable compliance threshold remains unresolved. |
| REG-API-003: Capture and synchronization never invoke the billing service or alter its nightly schedule | API | - | 1 | QA and API Engineering | A billing spy and audit evidence verify the explicit non-interaction constraint. An unintended charge has no safe user workaround. |

**Total P0:** 14 tests, about 70 to 110 hours

### P1 (High)

**Criteria:** Core, frequent, or complex behavior with material user reach and a limited workaround. Risk score is supporting evidence and is not a required condition.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ------------- | ---------- | --------- | ---------- | ----- | ------- |
| AC-1-E2E-001: An offline technician saves parts and labour and sees the order listed as captured | E2E | - | 1 | QA | This is the core journey. The context documents a paper-and-rekey workaround, which is manual and limited. |
| AC-2-E2E-001: A queued order remains editable before server acceptance | E2E | - | 1 | QA | Core pre-sync behavior with the same limited paper workaround. |
| 7.2-INT-001: Multiple local edits preserve the latest effective order and their deterministic queue order | Integration | R-002 | 1 | QA and Development | Repository-to-SQLite integration covers append behavior without duplicating the full two-device journey. |
| AC-2-E2E-002: The order stops accepting queued edits after server acceptance | E2E | - | 1 | QA | Boundary validation for the phrase "until it has been accepted." Incorrect state can create divergent revisions. |
| AC-3-E2E-001: A usable-network transition starts upload without technician action | E2E | R-003 | 1 | QA | Android connectivity and the background worker must be exercised together. Manual re-entry is a limited fallback. |
| 7.3-INT-002: A transient failure eventually succeeds once and removes only the accepted queue entry | Integration | R-003 | 1 | QA and Development | Worker, queue, and API-stub integration verifies recovery and guards against duplicate acceptance. |
| 7.3-API-001: Replayed upload identifiers are idempotent at the server boundary | API | R-003 | 1 | QA and API Engineering | Immediate retries create replay pressure. API coverage proves duplicate delivery cannot duplicate the stored order. |
| NFR-PERF-E2E-001: A 2,000-item backlog drains within 30 seconds on the defined mid-range device profile | E2E | R-004 | 1 | QA and Performance Engineering | A physical-device client-to-server benchmark matches the threshold. Missing it causes material dispatch delay; the source establishes no critical deadline or recovery bound. |
| AC-4-API-001: Accepted payload fields and ordered parts and labour lines match the submitted order | API | - | 1 | QA | Field-level API comparison isolates serialization and persistence fidelity before the dispatcher journey. |
| 7.3-INT-003: Queue drain survives process restart and connectivity flapping without loss or duplicate acceptance | Integration | R-003 | 1 | QA and Development | The source gives no recovery threshold for these conditions, so recoverability remains unresolved. This coverage exercises the durable queue boundary. |

**Total P1:** 10 tests, about 35 to 55 hours

### P2 (Medium)

**Criteria:** Secondary behavior with narrower user reach and an acceptable workaround. Risk score is supporting evidence and is not a required condition.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ------------- | ---------- | --------- | ---------- | ----- | ------- |
| REG-COMP-001: Existing order-screen layout remains stable while the captured state is shown | Component | - | 1 | Development | The epic states that rendering is unchanged. A localized visual defect leaves order capture available. |
| REG-E2E-001: Existing dispatcher-console presentation remains unchanged for a synchronized order | E2E | - | 1 | QA | The console is outside implementation scope. A presentation regression has narrower reach and can be compared with the server record. |

**Total P2:** 2 tests, about 6 to 12 hours

### P3 (Low)

**Criteria:** Rare, cosmetic, or experimental behavior with minimal impact and an easy workaround. Risk score is supporting evidence and is not a required condition.

No P3 scenarios are justified by the supplied epic. Its cosmetic constraints receive P2 regression coverage because they are customer-facing.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ------------- | ---------- | --------- | ---------- | ----- | ------- |

**Total P3:** 0 tests, 0 hours

---

## Execution Strategy

**Philosophy:** Run every functional scenario in pull requests while the suite stays under 15 minutes. Defer work with material infrastructure or duration cost.

- **Pull request:** Deterministic unit, integration, API, component, and focused Android emulator functional scenarios. Run in parallel with a target duration below 15 minutes.
- **Nightly:** Dual-device journeys, restart and connectivity-flapping coverage, retry burn-in, storage inspection, and fault injection.
- **Weekly:** Physical-device 2,000-item benchmarks, fleet-scale API load, long-duration reliability runs, security review automation, and rollout or rollback drills.

Execution order is fast structural checks, P0 functional coverage, P1 functional coverage, P2 regression coverage, then expensive NFR suites.

---

## Resource Estimates

### Test Development Effort

| Priority | Count | Hours/Test | Total Hours | Notes |
| --------- | ----- | ---------- | ----------- | ----- |
| P0 | 14 | About 5 to 8 | About 70 to 110 | Multi-device, security, conflict, release-control, and cross-system setup |
| P1 | 10 | About 3 to 6 | About 35 to 55 | Core device flows, queue integration, API fidelity, and performance harness |
| P2 | 2 | About 3 to 6 | About 6 to 12 | Focused rendering and console regression |
| P3 | 0 | N/A | 0 | No qualifying scenarios |
| **Total** | **26** | **Variable** | **About 111 to 177** | **About 4 to 6 weeks** |

Estimates include factories, fixtures, device orchestration, and evidence reporting. They assume one test engineer with part-time support from Development, Security, Platform, SRE, Performance, and Release Engineering.

### Prerequisites

**Test Data:**

- Factories for installations, technicians, work orders, parts, labour, revisions, and accept or reject API responses
- Tenant-isolation fixtures and deterministic concurrent-edit data
- A 2,000-item queue dataset with stable payload sizes

**Tooling:**

- Android device automation selected from the implementation stack
- Controllable clocks, connectivity, process lifecycle, and app-private storage inspection
- API stub or test server for transient, permanent, delayed, duplicate, and out-of-order outcomes
- Load and telemetry tooling selected after the server stack is known

**Environment:**

- Android emulator lane plus the named mid-range physical device
- Two independently identified device sessions assigned to one work order
- Order API, server audit data, dispatcher console, billing spy, regional-routing evidence, and tenant fixtures
- Remote-configuration environment with cohort and rollback controls

---

## Quality Gate Criteria

### Pass/Fail Thresholds

- **P0 pass rate:** 100 percent
- **P1 pass rate:** At least 95 percent; waivers required for failures
- **P2/P3 pass rate:** At least 90 percent; informational failures still require triage
- **High-risk mitigations:** 100 percent complete or covered by approved, owned, expiring waivers

### Coverage Targets

- **Planned scenarios:** At least 80 percent automated before release
- **Critical paths:** 100 percent of planned P0 scenarios executed
- **Security scenarios:** 100 percent passing
- **Business and queue logic:** At least 80 percent statement and branch coverage once the implementation stack is known
- **Edge cases:** At least 50 percent of identified boundaries automated

### Non-Negotiable Requirements

- [ ] All P0 tests pass.
- [ ] No severity-1 or severity-2 defect remains open.
- [ ] No risk scoring 6 or greater remains unmitigated without a formal waiver.
- [ ] Security coverage for R-001 passes in full.
- [ ] The R-004 threshold of 2,000 items in 30 seconds is met on the agreed device profile.
- [ ] Every in-scope NFR category has its planned evidence artifact.
- [ ] Final NFR PASS, CONCERNS, or FAIL decisions are produced by `nfr-assess` after evidence exists.

---

## Mitigation Plans

### R-001: Plaintext sensitive data in the outbound queue (Score: 9)

**Mitigation Strategy:**

1. Classify every queued field and remove values that synchronization does not require.
2. Encrypt the database with keys held by Android platform-backed keystore facilities.
3. Exclude queue material from backups and redact it from logs, crashes, and diagnostics.
4. Delete accepted payloads and verify that recovery paths do not retain plaintext remnants.

**Owner:** Mobile Engineering and Security  
**Timeline:** Architecture decision before implementation; device evidence before release  
**Status:** Planned  
**Verification:** 7.1-E2E-001 and 7.1-E2E-002 plus the security evidence package  
**Residual Risk:** A fully compromised device may expose decrypted data while the application is using it. The approved mobile threat model must state the accepted boundary.

### R-002: Silent concurrent-edit data loss (Score: 9)

**Mitigation Strategy:**

1. Give every order revision a stable order ID, revision ID, base version, author, and server receipt record.
2. Reject stale writes or merge them with explicit deterministic rules.
3. Surface unresolved conflicts to each affected technician.
4. Preserve submitted revisions and conflict decisions in an immutable audit history.

**Owner:** Order Platform Engineering and Product  
**Timeline:** Protocol decision before implementation; conflict suite green before release  
**Status:** Planned  
**Verification:** 7.2-API-001, 7.2-E2E-001, 7.2-API-002, and AC-4-E2E-001  
**Residual Risk:** Human conflict resolution may delay dispatch visibility. Conflict age and resolution outcome require monitoring.

### R-003: Unbounded immediate retries (Score: 9)

**Mitigation Strategy:**

1. Define transient and permanent failure classes.
2. Apply capped exponential backoff with jitter and an explicit attempt policy.
3. Move permanently rejected items to a visible quarantine or terminal state.
4. Emit queue depth, attempt count, age, failure class, and terminal-state telemetry.
5. Preserve idempotency through replay-safe identifiers.

**Owner:** Mobile Engineering, API Engineering, and SRE  
**Timeline:** Policy before implementation; resilience and soak evidence before release  
**Status:** Planned  
**Verification:** 7.3-UNIT-001, 7.3-INT-001, 7.3-E2E-001, 7.3-INT-002, and 7.3-API-001  
**Residual Risk:** Backoff can lengthen recovery during extended outages. Queue age and visible terminal state must remain observable.

### R-004: Backlog misses the 30-second sync target (Score: 6)

**Mitigation Strategy:**

1. Define the representative device, payload distribution, network profile, and server environment.
2. Instrument client queue-drain and server processing time.
3. Use bounded batching or parallelism while preserving item order and idempotency.
4. Repeat the benchmark and retain raw results with percentile summaries.

**Owner:** Mobile Performance Engineering and API Engineering  
**Timeline:** Baseline during implementation; release-candidate performance gate  
**Status:** Planned  
**Verification:** NFR-PERF-E2E-001 and server-capacity evidence  
**Residual Risk:** Networks outside the approved profile may exceed 30 seconds. The acceptance profile and supported operating envelope must be published.

### R-005: Universal rollout with delayed disablement (Score: 6)

**Mitigation Strategy:**

1. Add a remotely controlled kill switch with safe queued-data behavior.
2. Define internal, pilot, and general-availability cohorts.
3. Tie expansion to error, data-integrity, retry, and sync-latency thresholds.
4. Rehearse rollback and confirm that queued orders survive state changes.

**Owner:** Release Engineering and Product Operations  
**Timeline:** Available and rehearsed before production enablement  
**Status:** Planned  
**Verification:** 7.4-E2E-001, 7.4-INT-001, and the rollout drill record  
**Residual Risk:** A remote-configuration outage can delay disablement. The client needs a documented safe default and a tested recovery procedure.

---

## Assumptions and Dependencies

### Assumptions

1. The order API can accept a client-generated idempotency and revision identifier after the protocol decision.
2. The Android test build permits deterministic control of connectivity, clocks, process lifecycle, and app-private storage in test environments.
3. "Unchanged" means exact business-field values and ordered parts and labour lines, excluding server-generated metadata that the team explicitly documents.
4. The existing paper-and-rekey process remains available as the limited workaround for basic offline capture failure.

### Dependencies

1. Security and privacy classification for the stored card reference and billing address is required before implementation approval.
2. Conflict and audit semantics are required before server and mobile integration testing.
3. Retry and terminal-failure policy is required before resilience automation.
4. A named fleet-representative device and network profile are required before performance acceptance.
5. Fleet concurrency, observability, compliance, and rollback targets are required before the release gate.
6. The implementation stack and test framework are required before automation code is selected.

### Risks to Plan

- **Risk:** No implementation or test framework exists in the supplied repository.
  - **Impact:** Tooling, fixtures, and executable evidence cannot be validated during design.
  - **Contingency:** Select framework-compatible Android, API, and performance tools during implementation planning and preserve this plan's levels and evidence contracts.
- **Risk:** Several NFR thresholds are unresolved.
  - **Impact:** Final NFR status cannot be determined objectively.
  - **Contingency:** Record approved thresholds before corresponding automation begins and evaluate them later through `nfr-assess`.

---

## Follow-on Workflows (Manual)

- Run `/bmad-testarch-atdd` to generate failing P0 test scaffolds as a separate workflow.
- Run `/bmad-testarch-automate` for broader automation after implementation exists.
- Run `nfr-assess` after the planned evidence artifacts exist.

---

## Approval

**Test Design Approved By:**

- [ ] Product Manager: pending; Date: pending
- [ ] Tech Lead: pending; Date: pending
- [ ] Security Lead: pending; Date: pending
- [ ] QA Lead: pending; Date: pending

**Comments:** Draft requires resolution of the five high-priority risks and the listed unknown thresholds.

---

## Interworking & Regression

| Service/Component | Impact | Regression Scope |
| ----------------- | ------ | ---------------- |
| Android order screen | Adds offline persistence and captured-state behavior without a rendering redesign | Existing online order capture, edit boundaries, status display, and layout stability |
| SQLite outbound queue | New sensitive-data and durable-work boundary | Encryption, backup exclusion, lifecycle deletion, ordering, restart, and queue-depth boundaries |
| Android connectivity and background worker | Triggers automatic synchronization and retry | Offline-to-online transitions, flapping, process restart, transient and permanent failures |
| Order upload API | Receives queued payloads, revisions, and replays | Authentication, authorization, idempotency, validation, version conflicts, tenant isolation, and regional routing |
| Order persistence and audit | Stores accepted orders and revision outcomes | Field fidelity, ordered line items, immutable history, conflict decisions, and deletion semantics |
| Dispatcher web console | Observes the accepted order with no implementation change | Existing order display plus cross-system field comparison |
| Billing service | Must receive no calls or schedule changes from this epic | Non-interaction spy, nightly schedule regression, and no duplicate charge trigger |
| Release configuration | Requires runtime disablement and staged cohorts to mitigate R-005 | Kill switch, cohort targeting, monitoring thresholds, queued-data safety, and rollback rehearsal |

---

## Appendix

### Knowledge Base References

- `risk-governance.md`: risk classification, ownership, and mitigation rules
- `probability-impact.md`: probability, impact, score, and action thresholds
- `test-levels-framework.md`: canonical test-level selection and duplicate-coverage guard
- `test-priorities-matrix.md`: independent P0 through P3 prioritization
- `nfr-criteria.md`: measurable NFR planning and later evidence assessment

### Related Documents

- Epic: `/private/tmp/remaining-skills-evidence/test-design-cli-schema-recovery/field-order-capture/docs/epic-7.md`
- PRD: unavailable in supplied inputs
- Architecture: unavailable in supplied inputs
- Prior system-level test design: unavailable

---

**Generated by:** BMad TEA Agent, Test Architect Module  
**Workflow:** `bmad-testarch-test-design`  
**Version:** 4.0, BMad v6
