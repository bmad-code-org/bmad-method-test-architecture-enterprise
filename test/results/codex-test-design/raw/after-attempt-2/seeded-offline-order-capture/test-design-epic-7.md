---
runScope: 'epic'
runKey: 'epic-7'
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
lastSaved: '2026-10-10T02:16:41Z'
inputDocuments:
  - 'field-order-capture/_bmad/config.toml'
  - 'field-order-capture/docs/epics/epic-7-offline-order-capture.md'
  - 'bmod-tea/knowledge/risk-governance.md'
  - 'bmod-tea/knowledge/probability-impact.md'
  - 'bmod-tea/knowledge/test-levels-framework.md'
  - 'bmod-tea/knowledge/test-priorities-matrix.md'
  - 'bmod-tea/knowledge/nfr-criteria.md'
---

# Test Design: Epic 7: Offline order capture for field technicians

**Date:** 2026-10-09  
**Author:** tea-eval-harness  
**Status:** Draft

## Executive Summary

**Scope:** Full epic-level test design for Epic 7. This plan covers offline work-order capture, queued editing, automatic synchronization, server persistence, and release controls for the native Android client.

**Risk Summary:**

- Total risks identified: 6
- High-priority risks with scores of 6 or greater: 6
- Critical categories: Security, data integrity, performance, and operations
- Release blockers: Unencrypted sensitive local storage and unbounded immediate retry behavior, both scored 9

**Coverage Summary:**

- P0 scenarios: 12, with approximately 70 to 110 hours of test development and setup
- P1 scenarios: 0
- P2 and P3 scenarios: 0
- Total effort: Approximately 70 to 110 hours, or roughly 2 to 4 person-weeks

The concentration of P0 coverage reflects the epic's stated security exposure, silent data-loss path, strict backlog target, unsafe retry behavior, and fleet-wide release model. Each primary scenario protects a core order journey or a critical control with no safe source-backed workaround.

## Not in Scope

| Item | Reasoning | Mitigation |
| --- | --- | --- |
| Offline capture for records other than work orders | The epic explicitly excludes every other record type. | Run a boundary regression confirming that other record types retain their current online behavior. |
| Dispatcher console implementation changes | The epic states that the existing console is unchanged. | Observe the existing console in the end-to-end parity scenario without adding console-specific feature coverage. |
| Billing behavior or schedule changes | Charging remains an independent nightly process, and the epic does not call or modify it. | Use service-spy and billing-ledger regression assertions to prove that capture and synchronization make zero billing calls. |
| Regional routing or tenancy architecture changes | Existing single-tenant installation boundaries and regional routing remain unchanged. | Require existing isolation and regional-routing regressions to pass with synchronized orders. |
| Browser rendering and web-view behavior | The technician client is native Android, and the epic has no browser or web-view surface. | Use Android device flows and API-level verification. Browser exploration is inapplicable. |

## Risk Assessment

Probability and impact use the 1 to 3 scale. Score equals probability multiplied by impact. A score of 6 through 8 requires mitigation. A score of 9 blocks release until resolved or formally waived.

### High-Priority Risks

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Timeline |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| E7-R01 | SEC | Loss or theft of a device can expose the stored card reference, billing address, and full order payload. Story 7.1 states that the SQLite queue is unencrypted and protected only by the device screen lock. | 3 | 3 | 9 | Encrypt queued data with platform-backed keys, exclude it from insecure backups, minimize sensitive fields, and delete accepted payloads under an approved retention rule. | Mobile engineering and Security | Before implementation acceptance and release |
| E7-R02 | DATA | Concurrent offline edits can silently destroy a technician's order lines. Story 7.2 states that the server has no version or timestamp check, later arrival overwrites earlier work, and the lost lines leave no record. | 2 | 3 | 6 | Add optimistic concurrency or an approved merge policy, retain conflict history, surface conflicts, and verify both device-arrival orders. | Backend engineering and Product | Before release |
| E7-R03 | PERF | A full-day backlog can exceed the required recovery time and delay field orders. Story 7.3 requires 2,000 queued items to synchronize within 30 seconds on fleet mid-range devices. | 2 | 3 | 6 | Name the reference device and network profile, benchmark end-to-end throughput, remove bottlenecks, and enforce the 30-second target in a release performance environment. | Mobile engineering and Performance engineering | Before release candidate approval |
| E7-R04 | OPS | A permanently rejected payload can create an endless high-rate retry loop, drain device resources, consume bandwidth, load the server, and conceal an item that cannot progress. Story 7.3 specifies immediate indefinite retry with no backoff, attempt cap, or dead-letter path. | 3 | 3 | 9 | Add bounded exponential backoff with jitter, classify permanent failures, quarantine rejected entries, expose recovery controls, and alert on retry and queue-age thresholds. | Mobile engineering, Backend engineering, and SRE | Before implementation acceptance and release |
| E7-R05 | DATA | A captured order can reach the server with missing, duplicated, reordered, or changed content, violating the acceptance criterion that the dispatcher sees the order unchanged. | 2 | 3 | 6 | Use stable operation identifiers and server-side idempotency, verify exact payload parity at the persistence boundary, and cover interruption and replay boundaries. | Mobile engineering and Backend engineering | Before release |
| E7-R06 | OPS | A release defect can affect every technician and remain active for one to three days. Story 7.4 states that rollout is fleet-wide, has no feature flag or staged rollout, and requires a reviewed store build to disable. | 2 | 3 | 6 | Add a remotely controlled kill switch, staged rollout cohorts, backward-compatible server behavior, release telemetry, and explicit rollback criteria. | Product, Mobile engineering, and Release engineering | Before production rollout |

### Medium-Priority Risks

No score 3 or 4 risks were identified from the supplied epic. Lower-scored concerns without direct source evidence remain clarification items outside the register.

### Low-Priority Risks

No score 1 or 2 risks were identified from the supplied epic.

### Risk Category Legend

- **TECH**: Technical or architecture flaws, integration weaknesses, and scalability constraints
- **SEC**: Security controls, authorization, and data exposure
- **PERF**: Performance targets, degradation, and resource limits
- **DATA**: Data loss, corruption, duplication, and inconsistency
- **BUS**: Business logic, customer outcomes, and revenue impact
- **OPS**: Deployment, configuration, monitoring, recovery, and supportability

## NFR Planning

This section defines planned validation and later evidence. Final NFR status belongs in `nfr-assess` after implementation evidence exists.

| NFR Category | Requirement or Threshold | Risk Link | Planned Validation | Evidence Needed |
| --- | --- | --- | --- | --- |
| Security | Queued order and payment-related data requires approved local protection. The current plaintext design is an explicit exposure. | E7-R01 | Android storage extraction, backup inspection, field-minimization review, log and crash-report leakage scan, and deletion verification after acceptance | Device extraction report, backup result, leakage scan, retention result, and Security review |
| Performance | Exactly 2,000 queued items synchronize within 30 seconds on the approved mid-range fleet device after connectivity returns. | E7-R03 | Timed device-to-server workload with repeat runs and client/server profiling | Machine-readable timing report, device profile, network profile, throughput, latency, CPU, memory, battery, and server metrics |
| Reliability | Synchronization starts automatically, survives interruption, avoids duplicates, and handles transient and permanent failures safely. | E7-R04, E7-R05 | Connectivity-transition device flows, replay and idempotency API checks, retry-policy unit tests, fault injection, process restart, and queue-progress checks | Test reports, network traces, operation IDs, queue-depth and queue-age metrics, retry counters, and rejection records |
| Scalability | Per-device 2,000-item backlogs retain the performance target under the approved concurrent reconnect profile. | E7-R03 | Multi-client reconnect load around the same 2,000-item workload | Load report with client count, throughput, latency, resource saturation, and target compliance |
| Maintainability and operability | Stuck entries are diagnosable and recoverable, and unsafe fleet behavior can be disabled remotely. | E7-R04, E7-R06 | Structured-log checks, alert tests, quarantine recovery exercise, staged rollout, and kill-switch drill | Correlated logs, dashboard and alert captures, recovery record, and rollout or rollback drill record |
| Compliance and privacy | Existing regional routing and installation isolation remain intact. Local retention of card references and billing addresses follows the approved policy. | E7-R01 | Isolation and regional-routing regressions plus Security and Privacy review of queued fields and retention | Routing and isolation report, data classification, retention decision, and review approval |

**Unknown thresholds and required decisions:**

- Approved local encryption, key-management, backup exclusion, field-minimization, and retention rules
- Exact mid-range Android reference device and reconnect network profile
- Concurrent returning-device load profile and server saturation threshold
- Retry cap, backoff bounds, maximum queue age, terminal-rejection handling, and acceptable loss or duplication rate
- Queue durability boundary across application restart, operating-system process termination, and device restart
- Required correlation fields, alert thresholds, kill-switch propagation time, and operational ownership
- Applicable payment-data and privacy controls for the stored card reference and billing address

## Entry Criteria

- [ ] The local-data protection design is approved by Security and Privacy.
- [ ] The conflict-resolution policy, audit behavior, and user-facing conflict state are approved by Product and Engineering.
- [ ] The retry, quarantine, idempotency, and queue-progression contracts are specified.
- [ ] The reference Android device, operating-system versions, and reconnect network profile are named.
- [ ] A production-like order API and persistence environment supports deterministic fault injection and reset.
- [ ] Factories can create work orders, parts, labour lines, stored card references, billing addresses, rejection responses, and 2,000-item queues without production data.
- [ ] Two independently identified device sessions can target the same work order for concurrency coverage.
- [ ] Queue, retry, rejection, operation-ID, and server-persistence telemetry is observable.
- [ ] Staged rollout and remote-disable controls are available for release testing.

## Exit Criteria

- [ ] P0 pass rate is 100 percent.
- [ ] Every Epic 7 acceptance criterion has passing automated coverage and bidirectional traceability.
- [ ] E7-R01 and E7-R04 are mitigated and rescored below 9.
- [ ] Every score 6 risk has implemented mitigation, a named owner, and passing risk-linked coverage.
- [ ] No open severity 1 or severity 2 defect affects offline capture, edit, synchronization, security, order integrity, retry safety, or release control.
- [ ] The 2,000-item workload completes within 30 seconds on the approved device and network profile.
- [ ] Required security, reliability, scalability, operability, compliance, and privacy evidence is available for `nfr-assess`.
- [ ] Tenant isolation, regional routing, billing independence, and dispatcher-console regressions pass.

## Test Coverage Plan

P0 through P3 express priority. Execution timing is defined separately in the Execution Strategy.

### P0: Critical

**Criteria:** Critical business, security, data-integrity, or compliance impact with no safe workaround.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| --- | --- | --- | ---: | --- | --- |
| E7-T01: Save a representative order while the Android device is offline. Verify the local commit succeeds and the order screen shows captured. | E2E | E7-R05 | 1 | Mobile QA | Core field journey. A false captured state can conceal lost business data. The source provides no recovery path. Device-flow result plus local queue and correlation-ID evidence. |
| E7-T02: Inspect a queued order on a locked and unlocked test device, in application backups, logs, crash reports, and temporary files. Verify approved encryption, key protection, field minimization, and access boundaries. | E2E | E7-R01 | 1 | Mobile QA and Security | Device-level coverage observes the real Android storage boundary. Exposure includes payment-related and address data. Storage extraction and leakage-scan evidence is required. |
| E7-T03: Accept a queued order, then verify its sensitive local payload is deleted under the approved retention rule and cannot be recovered through the application or backup path. | E2E | E7-R01 | 1 | Mobile QA and Security | Validates the sensitive-data lifecycle after acceptance. Device storage inspection provides direct evidence. |
| E7-T04: Edit a queued order several times before synchronization. Verify each intended revision is represented and the latest accepted state contains every technician-entered line. | Component | E7-R05 | 1 | Mobile engineering | The queue repository and SQLite adapter can be exercised deterministically at component level. This isolates local revision behavior from server transport. |
| E7-T05: Send concurrent offline edits for the same work order from two devices in both arrival orders. Verify the approved conflict or merge policy preserves each contribution and leaves an auditable conflict record. | E2E | E7-R02 | 1 | Mobile QA and Backend QA | Two devices and the real server boundary are required to observe the documented overwrite failure. Lost lines have no source-backed recovery. |
| E7-T06: Replay the same queued operation after timeout and response loss. Verify one logical server mutation, a stable operation identifier, and exact response reconciliation. | API | E7-R05 | 1 | Backend QA | API coverage isolates server idempotency and duplicate suppression. Request, response, and persistence evidence must share one operation identifier. |
| E7-T07: Restore connectivity after offline capture and queued edits. Verify synchronization starts without technician action and reaches an accepted state through connection loss, reconnection, and application restart boundaries. | E2E | E7-R05 | 1 | Mobile QA | Validates the complete automatic-sync acceptance criterion on Android. The source specifies no manual recovery flow. |
| E7-T08: Compare the accepted server order and existing dispatcher-console representation with the final queued payload field by field. Include parts, labour, billing address, and stable identifiers. | E2E | E7-R05 | 1 | Mobile QA and Backend QA | The acceptance criterion requires unchanged content across the full path. A payload diff artifact supports the user-visible assertion. |
| E7-T09: Synchronize exactly 2,000 queued items within 30 seconds on the approved mid-range Android profile under the approved reconnect network profile. | E2E | E7-R03 | 1 | Performance QA | This is the epic's explicit performance budget. A full system path is required because client, network, API, and persistence all contribute to elapsed time. |
| E7-T10: Exercise retry-policy calculations for transient failures, permanent rejections, jitter, attempt limits, and queue-quarantine boundaries. | Unit | E7-R04 | 1 | Mobile engineering | Unit coverage gives exhaustive deterministic checks of the retry state machine and timing boundaries. |
| E7-T11: Inject timeouts, transient server errors, and a permanently rejected payload through the real client-server path. Verify bounded request rate, later recovery, quarantine of terminal failures, continued progress for valid items, and visible diagnostics. | E2E | E7-R04 | 1 | Mobile QA, Backend QA, and SRE | System observation is required for queue progress, server load, bandwidth, battery, and CPU consequences. Closing the application only pauses the documented loop and offers no recovery. |
| E7-T12: Exercise staged rollout and the remote kill switch in a production-like environment. Verify cohort targeting, telemetry, safe queue disposition, backward-compatible server behavior, and disablement within the approved threshold. | E2E | E7-R06 | 1 | Release QA and SRE | The current recovery path takes one to three days through store review. A release drill proves the mitigation across client and server. |

**Total P0:** 12 risk-driven scenarios, approximately 70 to 110 hours including fixtures, device setup, fault injection, evidence capture, and stabilization.

### P1: High

**Criteria:** Core, frequent, or complex behavior with material user reach and a limited workaround.

No P1 scenarios are assigned. Every primary scenario meets the stricter P0 criterion.

### P2: Medium

**Criteria:** Secondary behavior with narrower user reach and an acceptable workaround.

No P2 scenarios are assigned.

### P3: Low

**Criteria:** Rare, cosmetic, or experimental behavior with minimal impact and an easy workaround.

No P3 scenarios are assigned.

## Execution Strategy

**Philosophy:** Run every functional scenario in pull requests while the suite stays under 15 minutes. Schedule work with material infrastructure or duration cost separately.

- **Pull request:** Retry-policy unit coverage, queue component coverage, API idempotency checks, contract-level regression, and targeted Android emulator flows. Parallelize supported tests to keep feedback below 15 minutes.
- **Nightly:** Android device flows covering connectivity transitions, application restart, concurrent conflict ordering, permanent rejection, payload parity, and the supported device matrix.
- **Weekly and release candidate:** Physical-device 2,000-item performance runs, concurrent reconnect load, storage extraction, leakage scanning, and rollout or kill-switch drills.

Execution begins with evidence for E7-R01 and E7-R04. The remaining P0 scenarios follow after those blocker mitigations are testable. Required interworking regressions run before release approval.

## Resource Estimates

### Test Development Effort

| Priority | Scenario Count | Effort Range | Notes |
| --- | ---: | --- | --- |
| P0 | 12 | Approximately 70 to 110 hours | Includes data factories, Android fixtures, two-device orchestration, fault injection, security inspection, performance harness, operational evidence, and stabilization. |
| P1 | 0 | N/A | Empty priority band. |
| P2 | 0 | N/A | Empty priority band. |
| P3 | 0 | N/A | Empty priority band. |
| **Total** | **12** | **Approximately 70 to 110 hours** | **Roughly 2 to 4 person-weeks. Expected elapsed time is approximately 3 to 5 weeks with required cross-team and environment support.** |

### Prerequisites

**Test Data:**

- Work-order factory with parts, labour, billing address, and synthetic stored card reference fields
- Queue factory for exact sizes from empty through 2,000 items
- Versioned edit and two-technician conflict fixtures
- Transient and permanent server-rejection fixtures
- Automatic cleanup scoped to the installation and device identity

**Tooling:**

- Android emulator and physical-device control for offline transitions, process restart, device restart, and storage inspection
- API test harness for replay, idempotency, persistence, tenant isolation, and regional-routing assertions
- Network fault injection for timeout, response loss, reconnect, and server-error scenarios
- Load and profiling tooling for the 2,000-item target and concurrent reconnect profile
- Log, metric, and trace access for queue, retry, rejection, operation-ID, and persistence evidence

**Environment:**

- Production-like Android build with the same native storage and network stack used for release
- Approved mid-range fleet device and supported Android versions
- Isolated single-tenant test installation with regional routing enabled
- Resettable order API and database capable of deterministic rejection and delay injection
- Existing dispatcher console available for read-only parity observation
- Staged rollout and kill-switch test environment

## Quality Gate Criteria

### Pass and Fail Thresholds

- P0 pass rate: 100 percent
- P1 pass rate: At least 95 percent if P1 coverage is added
- P2 and P3 pass rate: At least 90 percent if those bands gain coverage
- High-risk mitigation completion: 100 percent or an approved, time-bound waiver with owner and expiry

### Coverage Targets

- Epic 7 acceptance criteria: 100 percent automated traceability
- P0 risk scenarios: 100 percent implemented and passing
- Security scenarios: 100 percent passing
- Critical order path coverage: At least 80 percent
- Business logic coverage: At least 70 percent
- Relevant edge-case coverage: At least 50 percent

### Non-Negotiable Requirements

- [ ] All P0 scenarios pass.
- [ ] E7-R01 and E7-R04 are mitigated and rescored below 9.
- [ ] Every score 6 risk has completed mitigation and passing risk-linked coverage.
- [ ] Security coverage for local queued data passes 100 percent.
- [ ] Exactly 2,000 items synchronize within 30 seconds on the approved profile.
- [ ] Concurrent edits preserve contributions or produce an explicit auditable conflict. Silent loss is prohibited.
- [ ] Permanent rejection produces bounded retry, quarantine, diagnostics, and continued progress for valid items.
- [ ] Accepted orders are idempotent and match the final queued payload exactly.
- [ ] Staged rollout and remote-disable evidence exists before production enablement.
- [ ] Planned evidence exists for every in-scope NFR category. Final NFR decisions remain deferred to `nfr-assess`.

## Mitigation Plans

### E7-R01: Sensitive queued data is stored without encryption. Score 9

**Mitigation Strategy:** Encrypt the queue with platform-backed keys, exclude sensitive data from insecure backup paths, minimize retained fields, prevent leakage into logs and crash reports, and delete accepted payloads under an approved retention rule.  
**Owner:** Mobile engineering and Security  
**Timeline:** Before implementation acceptance and release  
**Status:** Planned  
**Verification:** E7-T02 and E7-T03, followed by Security and Privacy review  
**Residual Risk:** Compromised unlocked devices and authorized debugging paths may still expose data. Security must document the accepted device-threat boundary.

### E7-R02: Concurrent offline edits can silently overwrite work. Score 6

**Mitigation Strategy:** Implement optimistic concurrency or an approved merge policy, preserve conflicting versions, create an audit record, and show a resolvable conflict state.  
**Owner:** Backend engineering and Product  
**Timeline:** Before release  
**Status:** Planned  
**Verification:** E7-T05 across both arrival orders and overlapping line edits  
**Residual Risk:** Human resolution may still choose an incorrect merge. Retained versions and audit history must support recovery.

### E7-R03: A 2,000-item backlog can miss the 30-second target. Score 6

**Mitigation Strategy:** Define representative hardware and network conditions, batch efficiently, profile client and server work, and capacity-test concurrent returning devices.  
**Owner:** Mobile engineering and Performance engineering  
**Timeline:** Before release candidate approval  
**Status:** Planned  
**Verification:** E7-T09 with repeatable machine-readable timing and resource evidence  
**Residual Risk:** Field networks and devices outside the approved profile may synchronize more slowly. Product and Operations must document the supported envelope.

### E7-R04: Permanent rejection causes immediate indefinite retry. Score 9

**Mitigation Strategy:** Use bounded exponential backoff with jitter, distinguish transient and terminal failures, quarantine terminal entries, continue valid queue progress, expose recovery controls, and alert on retry or queue-age thresholds.  
**Owner:** Mobile engineering, Backend engineering, and SRE  
**Timeline:** Before implementation acceptance and release  
**Status:** Planned  
**Verification:** E7-T10 and E7-T11 with client, network, and server resource evidence  
**Residual Risk:** Misclassified failures can delay recovery or quarantine recoverable work. Metrics and an operator recovery path must remain available.

### E7-R05: Synchronized order content can change, duplicate, or disappear. Score 6

**Mitigation Strategy:** Assign stable operation and revision identifiers, enforce server-side idempotency, preserve queue state through interruption, and compare final persisted payloads exactly.  
**Owner:** Mobile engineering and Backend engineering  
**Timeline:** Before release  
**Status:** Planned  
**Verification:** E7-T01, E7-T04, E7-T06, E7-T07, and E7-T08  
**Residual Risk:** Fields added by future schema revisions can escape parity checks. Schema-aware factories and explicit field inventories must evolve with the contract.

### E7-R06: Fleet-wide rollout lacks rapid disablement. Score 6

**Mitigation Strategy:** Add a remotely controlled kill switch, staged cohorts, backward-compatible server handling, release telemetry, queue-safe disablement semantics, and explicit rollback criteria.  
**Owner:** Product, Mobile engineering, Release engineering, and SRE  
**Timeline:** Before production rollout  
**Status:** Planned  
**Verification:** E7-T12 in a production-like release environment  
**Residual Risk:** Devices that remain offline cannot receive a remote disable command immediately. The server must safely reject or defer incompatible traffic when those devices reconnect.

## Assumptions and Dependencies

### Assumptions

1. The supplied epic is the complete requirements source for this run.
2. Existing tenant isolation and regional routing are observable through supported test interfaces.
3. The existing dispatcher console can display synthetic test orders in the test installation.
4. Synthetic stored card references and addresses are approved for test use. Production customer data is unnecessary.

### Dependencies

1. Security and Privacy approval of local-data controls is required before storage testing can pass.
2. Product and Engineering approval of conflict behavior is required before E7-T05 can assert the correct outcome.
3. Retry, quarantine, idempotency, and durability contracts are required before E7-T06, E7-T07, E7-T10, and E7-T11 are implemented.
4. The fleet reference device, network profile, and concurrency profile are required before performance evidence is valid.
5. Queue and server observability is required before fault-injection results are diagnosable.
6. Staged rollout and remote-disable capabilities are required before E7-T12 can pass.

### Risks to the Plan

- **Implementation and framework evidence is absent from the supplied fixture.** Test package names, selectors, endpoints, and existing fixture reuse remain unresolved. Validate them against the implementation repository before test coding.
- **Physical device and production-like load access may arrive late.** Reserve the device lab and performance environment before the release candidate window. Emulator results cannot replace the required fleet-device evidence.
- **Fault injection may affect shared environments.** Use an isolated installation and scoped synthetic identities, with reset and cleanup verified before each run.

## Follow-on Workflows

- Run `/bmad-testarch-atdd` explicitly to create failing P0 acceptance-test scaffolds after the blockers and contracts are resolved.
- Run `/bmad-testarch-automate` explicitly for broader automation after implementation exists.
- Run `nfr-assess` after security, performance, reliability, scalability, operability, and compliance evidence is available.

## Approval

- [ ] Product Manager. Name and date pending.
- [ ] Mobile Tech Lead. Name and date pending.
- [ ] Backend Tech Lead. Name and date pending.
- [ ] Security reviewer. Name and date pending.
- [ ] QA Lead. Name and date pending.

## Interworking and Regression

| Service or Component | Impact | Regression Scope |
| --- | --- | --- |
| Native Android order client | Adds local capture, queued edit, automatic sync, retry, and release-control behavior. | Existing online order capture and edit flows, authentication, lifecycle, upgrade, process restart, and supported Android-version suites must pass. |
| SQLite outbound queue | Stores full order payloads and revisions before acceptance. | Schema migration, transaction atomicity, storage access, backup exclusion, retention, cleanup, full-queue, and corruption-handling regressions must pass. |
| Order upload API | Receives queued operations and returns acceptance or rejection. | Authentication, authorization, validation, idempotency, timeout, duplicate request, rate, and backward-compatibility tests must pass. |
| Order persistence and conflict handling | Applies queued revisions and exposes the stored order. | Transaction, revision, audit, conflict, exact payload, and rollback tests must pass. Backend and Mobile teams must agree on conflict semantics. |
| Dispatcher console | Observes the final server order with no implementation change. | Existing order-detail rendering and refresh tests must pass. QA uses it only for parity observation. |
| Tenant boundary and regional routing | Existing controls route each installation to its own regional application and database. | Cross-installation isolation and regional-routing regression suites must pass for synchronized orders. Platform coordination is required for evidence access. |
| Billing service | Remains independent and runs on its existing nightly schedule. | Service-spy, event, and billing-ledger checks must prove zero new calls, events, or scheduling changes from this epic. |
| Release and monitoring platform | Must support staged exposure, rapid disablement, and queue health evidence. | Cohort targeting, kill-switch propagation, client/server compatibility, alert delivery, and rollback-drill tests must pass. Release Engineering and SRE coordinate the drill. |

## Appendix

### Acceptance Criteria Traceability

| Acceptance Criterion | Coverage |
| --- | --- |
| A technician with no connectivity can save an order and see it listed as captured. | E7-T01 |
| A captured order remains editable until accepted by the server. | E7-T04 and E7-T07 |
| The queue uploads without technician action once the network returns. | E7-T07, E7-T09, and E7-T11 |
| The server order appears on the dispatcher console unchanged. | E7-T06 and E7-T08 |

### Knowledge Base References

- `risk-governance.md`: Risk classification, mitigation ownership, and gate expectations
- `probability-impact.md`: Probability, impact, and score thresholds
- `test-levels-framework.md`: Unit, component, API, and E2E level selection
- `test-priorities-matrix.md`: Independent P0 through P3 assignment criteria
- `nfr-criteria.md`: NFR planning, measurable thresholds, and later evidence expectations

### Related Documents

- Epic: `field-order-capture/docs/epics/epic-7-offline-order-capture.md`
- PRD: N/A by run configuration
- Architecture: N/A by run configuration
- Sprint status: N/A by run configuration

**Generated by:** BMad TEA Agent, Test Architect Module  
**Workflow:** `bmad-testarch-test-design`  
**Execution mode:** Sequential
