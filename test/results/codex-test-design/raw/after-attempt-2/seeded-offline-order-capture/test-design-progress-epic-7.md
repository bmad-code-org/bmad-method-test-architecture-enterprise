---
runScope: 'epic'
runKey: 'epic-7'
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-10-10T02:16:41Z'
inputDocuments:
  - 'field-order-capture/_bmad/config.toml'
  - 'field-order-capture/docs/epics/epic-7-offline-order-capture.md'
  - 'bmod-tea/knowledge/tea-index.csv'
  - 'bmod-tea/knowledge/risk-governance.md'
  - 'bmod-tea/knowledge/probability-impact.md'
  - 'bmod-tea/knowledge/test-levels-framework.md'
  - 'bmod-tea/knowledge/test-priorities-matrix.md'
  - 'bmod-tea/knowledge/nfr-criteria.md'
---

# Step 1: Mode and Prerequisites

- Mode: Epic-level
- Scope: Epic 7
- Requirements source: `field-order-capture/docs/epics/epic-7-offline-order-capture.md`
- Prerequisite status: Satisfied
- Run key: `epic-7`

# Step 2: Loaded Context

- TEA configuration: Test artifacts resolve to `field-order-capture/test-artifacts`. Optional utility, Pact, browser automation, and explicit stack settings are absent.
- Product context: Native Android offline order capture with a local SQLite outbound queue and automatic server synchronization.
- Requirements: Stories 7.1 through 7.4, four acceptance criteria, and the stated out-of-scope boundaries.
- Integration points: Android client storage, operating-system connectivity reporting, order upload API, server order persistence, and dispatcher console observation.
- Existing test coverage: No implementation or test files are present in the supplied project fixture. No fixture patterns or flaky areas can be evidenced.
- Prior test design: No system-level test-design output is present.
- Stack: Mobile, based on the explicit native Android requirement. The supplied fixture contains no implementation manifests.
- NFR context: Security, performance, reliability, and operational release risks are explicit, so `nfr-criteria.md` was loaded.
- Browser exploration: Inapplicable because the epic has no browser surface and browser automation is unconfigured.
- Missing inputs: None for the configured run. The epic is the complete requirements source by instruction.

# Step 3: Risk and NFR Assessment

## Risk Register

Probability and impact use the 1 to 3 scale. Score equals probability multiplied by impact. Every risk in this register scores at least 6 and requires mitigation.

| Risk ID | Category | Description and source evidence | Probability | Impact | Score | Mitigation | Owner | Timeline |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| E7-R01 | SEC | Loss or theft of a device can expose a stored card reference, billing address, and full order payload. Story 7.1 states that the SQLite queue is unencrypted and protected only by the device screen lock. | 3 | 3 | 9 | Encrypt queued data with platform-backed keys, exclude it from insecure backups, minimize sensitive fields, and verify deletion after server acceptance. Complete a security review and device-storage attack test. | Mobile engineering and Security | Before implementation acceptance and release |
| E7-R02 | DATA | Concurrent offline edits can silently destroy a technician's order lines. Story 7.2 states that the server has no version or timestamp check, later arrival overwrites earlier work, and the lost lines leave no record. | 2 | 3 | 6 | Add optimistic concurrency or a merge policy, retain conflict history, surface conflicts to users, and test both upload orders with two devices. | Backend engineering and Product | Before release |
| E7-R03 | PERF | A full-day backlog can exceed the required recovery time and delay field orders. Story 7.3 requires 2,000 queued items to sync within 30 seconds on fleet mid-range devices. | 2 | 3 | Define the fleet reference device and network profile, benchmark end-to-end throughput, profile client and server bottlenecks, and enforce the 30-second threshold in CI or a release performance environment. | Mobile engineering and Performance engineering | Before release candidate approval |
| E7-R04 | OPS | A permanently rejected payload can create an endless high-rate retry loop, drain device resources, consume bandwidth, load the server, and conceal a queue item that cannot progress. Story 7.3 specifies immediate indefinite retry with no backoff, attempt cap, or dead-letter path. | 3 | 3 | 9 | Add bounded exponential backoff with jitter, classify permanent failures, quarantine rejected entries, expose recovery controls, and alert on retry and queue-age thresholds. | Mobile engineering, Backend engineering, and SRE | Before implementation acceptance and release |
| E7-R05 | DATA | A captured order can reach the server with missing, duplicated, reordered, or changed content, violating the dispatcher parity criterion. The acceptance criteria require the server order to appear on the dispatcher console unchanged. | 2 | 3 | 6 | Use stable client operation identifiers and server-side idempotency, verify exact payload parity at the persistence boundary, and cover interruption and retry boundaries. | Mobile engineering and Backend engineering | Before release |
| E7-R06 | OPS | A release defect can affect every technician and remain active for one to three days. Story 7.4 states that rollout is fleet-wide, has no feature flag or staged rollout, and requires a reviewed store build to disable. | 2 | 3 | 6 | Add a remotely controlled kill switch, staged rollout cohorts, backward-compatible server behavior, release telemetry, and explicit rollback criteria. | Product, Mobile engineering, and Release engineering | Before production rollout |

## NFR Planning Assessment

| NFR category | Requirement or gap | Threshold | Planned evidence |
| --- | --- | --- | --- |
| Security | Protect locally queued order and payment-related data from device compromise. Current design explicitly stores it as plaintext. | UNKNOWN. The epic defines the insecure design and gives no approved encryption, key-management, backup, retention, or field-minimization standard. | Static configuration inspection, instrumented device storage inspection, backup extraction test, log and crash-report leakage scan, and security review. Covered by E7-R01. |
| Performance | Synchronize the maximum offline backlog on representative fleet hardware. | 2,000 queued items within 30 seconds after usable connectivity returns. The exact reference device and network profile are UNKNOWN. | Timed device-to-server workload on the approved mid-range Android profile with client CPU, memory, battery, network, API latency, throughput, and server resource metrics. Covered by E7-R03. |
| Reliability | Start synchronization without technician action and recover safely from transient or permanent upload failure. | Automatic sync on the operating system's usable-network signal. Retry limits, backoff, maximum queue age, recovery time after failure, and acceptable loss or duplication rates are UNKNOWN. | Android device-flow tests for connectivity transitions plus integration fault injection for timeouts, transient errors, permanent rejection, process restart, and repeated signals. Queue-depth, queue-age, retry, rejection, and success metrics provide operational evidence. Covered by E7-R04 and E7-R05. |
| Scalability | Handle accumulated mobile work and concurrent returning devices without missing the per-device sync target. | Per-device backlog is 2,000. Concurrent device count and server saturation threshold are UNKNOWN. | Multi-client load test using the approved concurrency profile while each client preserves the 30-second requirement. Covered by E7-R03. |
| Maintainability and operability | Diagnose and recover stuck queue entries and disable unsafe behavior during release. | Retry alert thresholds, queue-age alert thresholds, observability fields, and kill-switch propagation time are UNKNOWN. | Structured logs with correlation and operation identifiers, retry and queue dashboards, alert tests, dead-letter recovery exercise, and kill-switch drill. Covered by E7-R04 and E7-R06. |
| Compliance and privacy | Preserve regional data routing and installation isolation. Determine whether local storage of the stored card reference and billing address triggers additional obligations. | Existing regional routing and single-tenant isolation must remain unchanged. Applicable local-data retention and payment-data controls are UNKNOWN. | Regression tests for tenant and regional routing boundaries, plus Security and Privacy review of the queued fields and retention period. E7-R01 covers the demonstrated local exposure. |

## Scope Constraints and Clarifications

- Single-tenant storage isolation and regional routing are stated as existing controls. Coverage must assert that offline synchronization preserves them.
- Charging remains outside the feature path. Coverage must assert that queue capture and synchronization do not call or reschedule billing.
- Dispatcher console changes remain out of scope. End-to-end coverage observes the existing console only as proof of unchanged server persistence.
- Clarify the approved mid-range device and network profile, concurrent reconnect volume, queue durability expectation across application or device restart, local-data security standard, and operational alert thresholds before test implementation.

## Risk Summary

E7-R01 and E7-R04 are score 9 release blockers. E7-R02, E7-R03, E7-R05, and E7-R06 score 6 and require owned mitigation before release. The immediate priority is to change the unsafe storage and retry designs, then establish conflict handling, payload idempotency, measurable performance evidence, and rollback controls.

# Step 4: Coverage Plan and Execution Strategy

## Priority Criteria

- P0: Critical business, security, data-integrity, or compliance impact with no safe workaround.
- P1: Core, frequent, or complex behavior with material user reach and a limited workaround.
- P2: Secondary behavior with narrower user reach and an acceptable workaround.
- P3: Rare, cosmetic, or experimental behavior with minimal impact and an easy workaround.

## Coverage Matrix

| Coverage ID | Requirement or risk-driven scenario | Test Level | Priority | Risk Link | Notes and expected evidence |
| --- | --- | --- | --- | --- | --- |
| E7-T01 | Save a representative order while the Android device is offline. Verify the local commit succeeds and the order screen shows captured. | E2E | P0 | E7-R05 | This is the core field journey. A false captured state can conceal lost business data, and the source provides no recovery path. Device-flow result plus local queue and correlation-ID evidence. |
| E7-T02 | Inspect a queued order on a locked and unlocked test device, in application backups, logs, crash reports, and temporary files. Verify approved encryption, key protection, field minimization, and access boundaries. | E2E | P0 | E7-R01 | A device-level security test observes the real Android storage boundary. Exposure includes payment-related and address data, and the source provides no safe workaround. Storage extraction and leakage-scan report. |
| E7-T03 | Accept a queued order, then verify its sensitive local payload is deleted according to the approved retention rule and cannot be recovered through the application or backup path. | E2E | P0 | E7-R01 | Complements E7-T02 by validating lifecycle cleanup after acceptance. Device storage inspection report. |
| E7-T04 | Edit a queued order several times before synchronization. Verify each intended revision is represented and the latest accepted state contains every technician-entered line. | Component | P0 | E7-R05 | The mobile queue and SQLite adapter can be exercised deterministically without a full device-server journey. Lost edits affect order integrity, and no recovery path is stated. Repository state assertions. |
| E7-T05 | Send concurrent offline edits for the same work order from two devices in both arrival orders. Verify the approved conflict or merge policy preserves each contribution and leaves an auditable conflict record. | E2E | P0 | E7-R02 | Two devices and the real server boundary are required to observe the documented silent-overwrite failure. Lost lines have no source-backed recovery. Server record and conflict-audit evidence. |
| E7-T06 | Replay the same queued operation after timeout and response loss. Verify one logical server mutation, a stable operation identifier, and exact response reconciliation. | API | P0 | E7-R05 | API coverage isolates server idempotency and duplicate suppression. Duplicate or missing order lines have no source-backed recovery. Request, response, and persistence evidence. |
| E7-T07 | Restore connectivity after offline capture and queued edits. Verify synchronization starts without technician action and reaches an accepted state through connection loss, reconnection, and application restart boundaries. | E2E | P0 | E7-R05 | This validates the complete automatic-sync acceptance criterion on Android. The source offers no manual recovery flow. Device trace plus queue-state and server-state evidence. |
| E7-T08 | Compare the accepted server order and the existing dispatcher console representation with the final queued payload field by field, including parts, labour, billing address, and stable identifiers. | E2E | P0 | E7-R05 | The dispatcher criterion requires unchanged content across the full path. A user-visible E2E assertion provides the only direct evidence of that outcome. Payload diff artifact and console assertion result. |
| E7-T09 | Synchronize exactly 2,000 queued items within 30 seconds on the approved mid-range Android profile under the approved reconnect network profile. | E2E | P0 | E7-R03 | This is the explicit performance budget for a full-day backlog. Delayed orders have no source-backed recovery time. Timed run report with device and server resource metrics. |
| E7-T10 | Exercise retry policy calculations for transient failures, permanent rejections, jitter, attempt limits, and queue quarantine boundaries. | Unit | P0 | E7-R04 | Unit coverage gives exhaustive deterministic checks of the retry state machine. An unbounded loop is a score 9 operational risk. Unit report and policy assertions. |
| E7-T11 | Inject timeouts, transient server errors, and a permanently rejected payload through the real client-server path. Verify bounded request rate, later recovery, quarantine of terminal failures, continued progress for valid items, and visible diagnostic state. | E2E | P0 | E7-R04 | The system-level resource and queue-progress consequences require device and server observation. Closing the application only pauses the documented loop and has no source-backed recovery. Network trace, queue metrics, battery and CPU metrics, and rejection record. |
| E7-T12 | Exercise staged rollout and the remote kill switch in a production-like environment. Verify cohort targeting, telemetry, safe queue disposition, backward-compatible server behavior, and disablement within the approved propagation threshold. | E2E | P0 | E7-R06 | The current recovery path requires a new reviewed build and takes one to three days. A release drill must prove the mitigation across client and server. Rollout and rollback drill record. |

All primary scenarios are P0 because each protects a core order journey, sensitive data, data integrity, or a score 9 operational exposure without a safe source-backed workaround. P1 through P3 have no primary risk scenarios in this epic. Regression assertions below remain P1 because the epic states their controls already exist and remain unchanged.

## Required Regression Assertions

- API regression: Offline synchronization preserves single-installation tenant isolation and the platform's regional routing behavior.
- API and service-spy regression: Capture, editing, retries, and synchronization make zero calls to billing and do not alter the nightly charging schedule.
- E2E regression: The existing dispatcher console renders the accepted order without a console code change.
- Component regression: Offline capture remains limited to work orders.

## NFR Coverage and Evidence Plan

| NFR category | Planned validation | Later evidence artifact | Open threshold or blocker |
| --- | --- | --- | --- |
| Security | E7-T02 and E7-T03 plus Security review | Device storage extraction, backup test, leakage scan, and review record | Approved encryption, key, field-minimization, retention, and backup rules are required before implementation acceptance. |
| Performance | E7-T09 | Machine-readable timing results, device profile, network profile, and client/server resource traces | Fleet reference device and reconnect network profile must be named. |
| Reliability | E7-T06, E7-T07, E7-T10, and E7-T11 | Test reports, network traces, queue-depth and queue-age metrics, retry counters, and rejection record | Retry cap, backoff bounds, maximum queue age, durability boundary, and acceptable duplication or loss rate must be approved. |
| Scalability | E7-T09 plus concurrent reconnect load around the same scenario | Load report with concurrent-client count, throughput, latency, and saturation point | Expected concurrent returning-device profile is unknown. |
| Maintainability and operability | E7-T11 and E7-T12 | Structured logs, dashboard and alert captures, quarantine recovery record, and rollback drill | Required correlation fields, alert thresholds, kill-switch propagation time, and ownership must be defined. |
| Compliance and privacy | E7-T02 and tenant/residency regression assertions | Security and Privacy review plus routing and isolation test reports | Applicable controls for locally stored card references and billing addresses are unknown. |

Final NFR PASS, CONCERNS, or FAIL decisions remain deferred until implementation evidence exists and `nfr-assess` runs.

## Execution Strategy

- PR: Unit retry-policy coverage, component queue coverage, API idempotency and regression coverage, and targeted emulator flows when the complete functional set stays under 15 minutes.
- Nightly: Android device flows across connectivity transitions, application restarts, conflict ordering, permanent rejection, exact payload parity, and the supported device matrix.
- Weekly and release candidate: The physical-device 2,000-item performance run, concurrent reconnect load, storage extraction, leakage scan, and rollout or kill-switch drill.
- Execution order: E7-R01 and E7-R04 mitigations first, followed by all remaining P0 scenarios, followed by P1 regression assertions.

## Resource Estimate

| Priority | Estimated effort |
| --- | --- |
| P0 | Approximately 70 to 110 hours |
| P1 | Approximately 12 to 24 hours |
| P2 | 0 hours because the plan contains no P2 scenarios |
| P3 | 0 hours because the plan contains no P3 scenarios |
| Total | Approximately 82 to 134 hours |

Expected elapsed time is approximately three to five weeks with coordinated Mobile, Backend, Security, Performance, SRE, and Release support. Device-lab and production-like environment readiness can extend the schedule.

## Quality Gates

- P0 pass rate is 100 percent.
- P1 pass rate is at least 95 percent.
- Every acceptance criterion has automated coverage and bidirectional traceability.
- E7-R01 and E7-R04 are mitigated and rescored below 9 before release.
- All score 6 risks have implemented mitigation, named ownership, and passing planned coverage before release.
- The 2,000-item backlog completes within 30 seconds on the approved fleet device and network profile.
- Concurrent edits preserve contributions or create an explicit, auditable conflict requiring resolution. Silent loss is prohibited.
- Permanent rejection produces bounded retry behavior, quarantine, diagnostics, and continued progress for valid queue items.
- Accepted orders are idempotent and match the final queued payload exactly.
- Staged rollout and remote disablement evidence exists before production enablement.
- Overall planned requirements and risk coverage is at least 80 percent, with 100 percent coverage for P0 scenarios and acceptance criteria.
- Each in-scope NFR category has an identified evidence artifact. Final NFR status remains deferred to `nfr-assess`.

# Step 5: Completion Report

- Mode: Epic-level Create, full design, sequential execution.
- Output: `field-order-capture/test-artifacts/test-design/test-design-epic-7.md`.
- Critical risks: E7-R01 and E7-R04 score 9 and block release until mitigated or formally waived.
- Gate thresholds: P0 pass rate of 100 percent, P1 pass rate of at least 95 percent when applicable, complete mitigation of high risks, complete acceptance-criterion traceability, and 2,000 queued items synchronized within 30 seconds on the approved profile.
- Open decisions: Local-data controls, reference device and network profile, concurrent reconnect load, conflict semantics, retry and quarantine policy, durability boundaries, observability thresholds, and kill-switch propagation time.
- Validation: Template sections, risk arithmetic, risk-to-coverage links, acceptance-criteria traceability, NFR planning, interval estimates, interworking scope, and output paths were checked. No browser session or temporary exploration artifact was created.
