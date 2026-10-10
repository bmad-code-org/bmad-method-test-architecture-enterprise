---
runScope: 'epic'
runKey: 'epic-7'
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-10-09T21:33:29-05:00'
inputDocuments:
  - 'field-order-capture/_bmad/config.toml'
  - 'field-order-capture/docs/epics/epic-7-offline-order-capture.md'
  - 'bmod-tea/knowledge/risk-governance.md'
  - 'bmod-tea/knowledge/probability-impact.md'
  - 'bmod-tea/knowledge/test-levels-framework.md'
  - 'bmod-tea/knowledge/test-priorities-matrix.md'
  - 'bmod-tea/knowledge/nfr-criteria.md'
---

# Step 1: Detect Mode and Prerequisites

- Mode: Epic-level
- Run scope: `epic`
- Run key: `epic-7`
- Epic number: `7`
- Requirements source: `field-order-capture/docs/epics/epic-7-offline-order-capture.md`
- Prerequisite status: Satisfied
- Existing checkpoint: None

# Step 2: Load Context and Knowledge Base

## Configuration

- `test_artifacts`: `field-order-capture/test-artifacts`
- `test_stack_type`: `auto` by workflow default
- Detected stack context: Native Android mobile application, established by the epic. The repository fixture contains no application manifests or source files for independent stack detection.
- `tea_use_playwright_utils`: Unset
- `tea_use_pactjs_utils`: Unset
- `tea_pact_mcp`: Unset
- `tea_browser_automation`: Unset
- Browser exploration: Inapplicable because the epic explicitly has no browser surface or web view.

## Loaded Inputs

- Epic 7 requirements and acceptance criteria
- Risk governance and probability-impact scoring guidance
- Test-level selection and priority guidance
- NFR criteria because the epic contains security, performance, reliability, and operational requirements

## Existing Coverage

The repository contains no test directories, specifications, fixtures, test framework configuration, prior test-design output, application source, or package manifests. Existing automated coverage and fixture patterns cannot be established from the available project artifacts.

## Extracted Test Context

- Testable flows: offline capture, editing before sync, automatic sync after reconnection, and dispatcher-visible payload integrity.
- Integration points: Android client, local SQLite outbound queue, operating-system connectivity signal, order server, and dispatcher web console read path.
- Explicit high-risk gaps: unencrypted sensitive queue data, lost concurrent edits, infinite immediate retries of permanently invalid payloads, a 2,000-item backlog with a 30-second target, and an all-user release with a one-to-three-day rollback path.

# Step 3: Risk and NFR Assessment

## Risk Scoring

Probability: 1 is unlikely, 2 is possible, and 3 is likely. Impact: 1 is minor, 2 is degraded service, and 3 is critical business, security, or data harm. Score equals probability multiplied by impact.

### High Risks, Score 6 or Greater

| Risk ID | Category | Description | Source Evidence | Probability | Impact | Score | Mitigation | Owner | Timeline |
| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| R-001 | SEC | Sensitive customer data can be recovered from a lost, stolen, compromised, or debug-accessible device because the queue holds full payloads, including the stored card reference and billing address, in an unencrypted SQLite file. | Story 7.1 states that the queue is unencrypted at rest and protected only by the device screen lock. | 3 | 3 | 9 | Encrypt queued payloads with Android Keystore-backed keys, minimize retained payment and address fields, prevent backup or export of the queue, and verify data removal after acknowledgement. Require security review before release. | Mobile Engineering and Security | Before implementation approval and release |
| R-002 | DATA | Valid order lines can be silently and permanently lost when two assigned technicians edit the same work order offline and their queued changes reach the server in different order. | Story 7.2 states that the server uses arrival order without version or timestamp checks, the later arrival overwrites the earlier edit, and lost lines leave no record. | 3 | 3 | 9 | Add version-aware conflict detection with an explicit merge or human resolution path. Preserve an audit record of conflicting submissions. Block release until concurrent offline edits are resolved without silent loss. | Order Service Engineering and Product | Before release |
| R-003 | OPS | A permanently invalid payload can create an unbounded hot retry loop that consumes device battery and data, floods the order endpoint, and prevents dependable queue recovery. | Story 7.3 specifies immediate retries forever, with no backoff, attempt cap, or dead-letter path. | 3 | 3 | 9 | Classify transient and permanent failures, add bounded exponential backoff with jitter, cap attempts, quarantine terminal failures, expose recovery status, and instrument retry rate and queue age. | Mobile Engineering, Order Service Engineering, and SRE | Before release |
| R-004 | PERF | A field device may miss the required recovery window, leaving dispatchers without orders after connectivity returns when a full-day backlog reaches 2,000 items. | Story 7.3 requires all 2,000 queued items to sync within 30 seconds on fleet mid-range devices. | 2 | 3 | 6 | Benchmark the complete client-to-server path on the fleet device profile with realistic payload sizes and network conditions. Tune batching, concurrency, transaction handling, and server capacity against the 30-second threshold. | Mobile Engineering and Performance Engineering | Before release candidate approval |
| R-005 | OPS | A production defect affects every technician immediately and remains active for one to three days while a replacement build passes store review. | Story 7.4 specifies an all-user release with no feature flag, staged rollout, or remote disable mechanism. | 3 | 3 | 9 | Add a remotely controlled kill switch, staged percentage rollout, health gates, and rollback criteria. Exercise disablement and rollback before general availability. | Product, Mobile Engineering, and Release Engineering | Before production rollout |
| R-006 | DATA | Queued edits may fail to preserve the final accepted order across a multi-entry sequence, especially when upload stops partway through, because each edit appends a new queue entry and the required sequence semantics are unspecified. | Story 7.2 states that each edit appends a new entry. The acceptance criteria require the accepted server order to appear unchanged on the dispatcher console. | 2 | 3 | 6 | Define ordering, idempotency, acknowledgement, crash recovery, and compaction rules. Prove that replaying or resuming any prefix of a queued edit sequence converges on one correct final order without duplicate application. | Mobile Engineering and Order Service Engineering | Before implementation completion |

### Medium Risks, Score 3 to 4

No distinct medium risks were identified from the supplied epic after consolidating shared failure mechanisms.

### Low Risks, Score 1 to 2

No distinct low risks were identified from the supplied epic.

## Scope Constraints Requiring Regression Assertions

- The product remains single-tenant with separate storage and application servers per installation.
- Regional routing continues to enforce data residency.
- The billing service remains uncalled and unchanged by offline capture and synchronization.
- Dispatcher web console behavior and rendering remain unchanged; only the resulting order data is observed there.
- The Android order screen rendering remains unchanged.

## NFR Planning Assessment

| NFR Category | Requirement or Gap | Threshold | Planned Evidence |
| --- | --- | --- | --- |
| Security | Protect sensitive order data in the local queue | UNKNOWN. The epic explicitly permits unencrypted storage, while no acceptable at-rest protection or retention threshold is defined. | Static configuration review, device filesystem inspection, backup and export checks, lost-device threat test, queue purge verification |
| Performance | Drain a full offline backlog after network recovery | 2,000 items within 30 seconds on fleet mid-range devices | Instrumented device benchmark with realistic payloads, representative network profiles, server timings, queue depth, throughput, CPU, memory, battery, and error rate |
| Reliability | Preserve queued orders and converge on the correct server state through reconnects, failures, retries, and restarts | Automatic upload after usable network returns. Retry limits, recovery time after failure, and acceptable data-loss rate are UNKNOWN. | Stateful integration tests, native device flows, process-kill and restart tests, fault injection, queue and server reconciliation, telemetry assertions |
| Scalability | Sustain synchronized backlog load across deployed technicians | Per-device boundary is 2,000 items. Concurrent fleet size and server capacity target are UNKNOWN. | Multi-device or client load test, endpoint saturation test, database profiling, queue-age and throughput monitoring |
| Operational Resilience | Contain a bad release | Current rollback delay is one to three days. Acceptable blast radius and disablement time are UNKNOWN. | Staged rollout rehearsal, kill-switch test, rollback drill, release telemetry and alert verification |
| Maintainability | Diagnose stuck queues, conflicts, and failed deliveries | UNKNOWN. No logging, metrics, trace, audit retention, or support workflow target is defined. | CI coverage report, structured log checks, client/server correlation IDs, dashboards, alerts, and support recovery runbook review |
| Compliance and Privacy | Handle stored card reference and billing address on the device | UNKNOWN. No applicable control set, retention limit, or approved data classification is named. | Security and privacy review, data inventory, retention test, backup exclusion evidence, device compromise assessment |

## Clarifications to Resolve Before Release

- Define the approved encryption, key management, retention, backup, and purge controls for queued card references and billing addresses.
- Define conflict resolution behavior and the technician or dispatcher experience when offline edits collide.
- Define transient and terminal upload errors, retry ceilings, backoff limits, dead-letter recovery, and alert thresholds.
- Name the fleet mid-range Android device profile, payload distribution, network profile, and measurement boundaries for the 30-second target.
- Define expected concurrent reconnect volume and server-side capacity targets.
- Define acceptable rollout blast radius, kill-switch response time, observability signals, and rollback triggers.

## Risk Summary

Four score-9 risks require release-blocking mitigation: local sensitive-data exposure, silent concurrent-edit loss, unbounded retry storms, and an all-user rollout without rapid disablement. Two score-6 risks require evidence before release: the 2,000-item synchronization target and deterministic multi-entry edit replay. Testing can demonstrate these conditions and verify mitigations. Product and architecture changes are required to remove the failure mechanisms described by R-001, R-002, R-003, and R-005.

# Step 4: Coverage Plan and Execution Strategy

## Priority Criteria

- P0: Critical business, security, data-integrity, or compliance impact with no safe workaround.
- P1: Core, frequent, or complex behavior with material user reach and a limited workaround.
- P2: Secondary behavior with narrower user reach and an acceptable workaround.
- P3: Rare, cosmetic, or experimental behavior with minimal impact and an easy workaround.

## Coverage Matrix

| Test ID | Scenario | Test Level | Priority | Risk Link | Notes |
| --- | --- | --- | --- | --- | --- |
| 7.1-INT-001 | Persist an offline order atomically in the local queue and reconstruct the full captured payload | Integration | P1 | R-006 | Core capture correctness. Failure blocks offline work; the epic identifies paper capture and later re-entry as a limited workaround. Integration scope isolates SQLite serialization and transaction behavior. |
| 7.1-E2E-001 | On a fleet-profile Android device with connectivity disabled, save an order and show it as captured | E2E | P1 | R-006 | Covers acceptance criterion 1 through the user-visible native flow. The documented paper workflow is possible, with delay and re-entry cost. |
| 7.1-INT-002 | Verify queued card references and billing addresses are encrypted, unavailable through backup or export, and purged after server acknowledgement | Integration | P0 | R-001 | Security-critical local persistence has no source-supported workaround after device compromise. The integration boundary includes Android storage and key management. |
| 7.1-E2E-002 | Attempt queue recovery from a locked, lost-device test image using the approved threat model | E2E | P0 | R-001 | Validates the actual device protection boundary. Exposure is critical and the source names only screen lock protection. |
| 7.2-INT-001 | Append multiple edits, restart the app after each queue transaction boundary, resume upload, and converge on the latest complete order exactly once | Integration | P0 | R-006 | Data-integrity failure can produce an incorrect accepted order. No recovery path is specified. Integration testing can control crashes and inspect both local and server state. |
| 7.2-E2E-001 | Edit a captured order while offline and retain editability until server acceptance | E2E | P1 | R-006 | Covers acceptance criterion 2. Failure blocks a core field workflow; paper capture remains a limited operational workaround. |
| 7.2-E2E-002 | Submit conflicting offline edits from two assigned technicians in both arrival orders and require explicit conflict handling with no silent line loss | E2E | P0 | R-002 | The epic states that lines are silently lost with no record. There is no workaround because the missing lines cannot be recovered. Two-device E2E coverage is required for the cross-client journey. |
| 7.2-API-001 | Verify version checks, conflict response semantics, merge or resolution behavior, and durable audit history for competing submissions | API | P0 | R-002 | Direct API coverage exercises all conflict permutations quickly and validates the server control that prevents silent loss. |
| 7.3-E2E-001 | Restore usable connectivity and verify upload begins without technician action, completes, and clears only acknowledged entries | E2E | P1 | R-003, R-006 | Covers acceptance criterion 3 across operating-system network state, native client, queue, and server. Manual re-entry remains a limited workaround for failed capture. |
| 7.3-UNIT-001 | Classify transient, throttling, authentication, validation, and terminal errors into bounded retry or quarantine outcomes | Unit | P0 | R-003 | A wrong classification can trigger an indefinite hot loop. Pure policy logic belongs at unit level. The epic defines no user recovery path. |
| 7.3-INT-001 | Apply bounded exponential backoff with jitter, an attempt cap, and terminal quarantine during controlled server failures | Integration | P0 | R-003 | Verifies retry scheduling, persistence, and server interaction without a full device journey. An unbounded loop has no source-supported workaround. |
| 7.3-API-001 | Expose retry count, queue age, terminal reason, correlation ID, and recovery action for stuck submissions | API | P1 | R-003 | Supports diagnosis and recovery for a core sync path. Operational intervention is a limited workaround only after these signals and recovery controls exist. |
| 7.3-E2E-002 | Sync 2,000 realistic queued items within 30 seconds on the named mid-range fleet device and representative recovered-network profile | E2E | P1 | R-004 | Covers the explicit performance threshold across the complete path. Missing the target delays dispatcher visibility; the epic does not establish permanent loss or a critical business deadline. |
| 7.3-API-002 | Sustain the defined concurrent fleet reconnect load while preserving correctness and the per-device 30-second objective | API | P1 | R-004 | Exercises server capacity at a controllable boundary. Concurrent fleet size remains a clarification blocker. |
| 7.3-E2E-003 | Verify the accepted server order appears unchanged on the dispatcher console after offline capture and edit replay | E2E | P0 | R-002, R-006 | Covers acceptance criterion 4 and end-to-end data integrity. An incorrect dispatched order has no recovery path stated in the epic. |
| 7.4-E2E-001 | Disable offline capture remotely on a production-like installed build and verify technicians return to the established connected-order behavior | E2E | P0 | R-005 | A kill switch must contain a bad release without waiting one to three days. The current source-supported recovery delay is unacceptable for a fleet-wide critical defect. |
| 7.4-E2E-002 | Exercise staged rollout health gates, halt progression on threshold breach, and roll back the enabled cohort | E2E | P0 | R-005 | Validates blast-radius controls under production-like release conditions. No existing rapid rollback exists. |

Every scored risk has coverage at a suitable level. P0 rows protect sensitive data, order integrity, retry containment, and release containment where the epic provides no safe workaround. P1 rows cover core capture and synchronization paths with the documented paper and re-entry process as a limited workaround, plus the 30-second target whose missed business deadline is unstated. No P2 or P3 risk-driven scenarios are justified by the supplied requirements.

## Scope Constraint Regression Assertions

| Constraint | Test Level | Regression Assertion |
| --- | --- | --- |
| Separate single-tenant installations | API | Requests and persisted identifiers stay within the installation under test; no new shared storage or cross-installation lookup is introduced. |
| Regional routing owns data residency | Integration | Offline synchronization uses the existing regional route and does not add a bypass endpoint. |
| Billing remains unchanged | Integration | Capture and sync emit no calls to the billing service and do not alter the nightly charging schedule. |
| Android order screen rendering remains unchanged | Component | Existing order-screen visual and interaction regression suite remains green with offline state additions isolated to capture status. |
| Dispatcher console behavior remains unchanged | E2E | Existing console regression suite remains green while the final accepted order data is verified. |

## NFR Coverage and Evidence Plan

| NFR | Planned Validation | Expected Evidence | Gap Handling |
| --- | --- | --- | --- |
| Security and privacy | R-001 integration and lost-device E2E scenarios, data inventory review, backup and export inspection | Test report, filesystem inspection record, encryption and key configuration, purge evidence, security review | Encryption, retention, and compliance thresholds must be approved before release. |
| Performance and scalability | R-004 full-path device benchmark and server reconnect-load API test | Timestamped benchmark results, device and network profile, payload distribution, latency percentiles, throughput, error rate, CPU, memory, battery, and server saturation metrics | Fleet device model and concurrent reconnect volume must be defined before the suite can be accepted. |
| Reliability | R-003 retry policy tests and R-006 crash, resume, ordering, and acknowledgement tests | Deterministic test results, retry timeline, queue and server reconciliation, quarantine record, queue-age metrics | Recovery time, attempt cap, retry schedule, and data-loss objective require definition. |
| Operational resilience | R-005 kill-switch, staged rollout, and rollback exercises | Release rehearsal report, control-plane audit record, alert timeline, rollback duration | Acceptable cohort size, disablement time, and rollback triggers require definition. |
| Maintainability and observability | Retry and queue diagnostics contract plus automated coverage reporting | CI coverage report, structured log samples, correlation trace, dashboards, alert tests, recovery runbook | Logging, tracing, audit retention, and support ownership require definition. |

Final NFR status is deferred until implementation evidence exists and can be assessed through `nfr-assess`.

## Execution Strategy

- PR: Run unit, integration, API, component, and focused emulator E2E coverage. Keep the functional suite below 15 minutes through isolated fixtures and deterministic network control.
- Nightly: Run two-device conflict flows, process-kill recovery, complete native E2E regression, retry fault injection, security storage inspection, and the 2,000-item device benchmark.
- Weekly: Run concurrent fleet reconnect load, endurance and battery profiling, staged-rollout rehearsal, kill-switch validation, and rollback drills in a production-like environment.
- Execute P0 coverage first, followed by P1 coverage. Block later stages on P0 failure.

## Resource Estimates

| Priority | Estimate | Scope |
| --- | --- | --- |
| P0 | About 65 to 105 hours | Security harness, two-device conflict setup, retry fault injection, deterministic replay, dispatcher verification, and release-control exercises |
| P1 | About 35 to 60 hours | Core device flows, queue integration coverage, diagnostics contract, device benchmark, and server load coverage |
| P2 | About 8 to 16 hours | Scope-constraint component and regression coverage where existing suites need extension |
| P3 | 0 hours planned | No P3 scenario is supported by the epic |
| Total | About 108 to 181 hours | Automation, fixtures, environment setup, execution tuning, and evidence capture |

Expected elapsed time is about three to five weeks with coordinated mobile, backend, security, performance, and release-engineering access. These estimates exclude product and architecture implementation of the required mitigations.

## Quality Gates

- P0 pass rate is 100 percent.
- P1 pass rate is at least 95 percent, with every failure triaged and owned.
- Every high-risk mitigation is implemented and verified before release. Open score-9 risks block release.
- Every acceptance criterion maps to automated coverage, with at least 80 percent requirements coverage overall and no uncovered P0 criterion.
- The 2,000-item backlog completes within 30 seconds on the approved fleet device and network profile.
- No sensitive queued payload is readable outside the approved application and key boundary; acknowledged payload data is purged according to the approved retention rule.
- Concurrent offline edits produce an explicit conflict outcome or a lossless resolved order, with a durable audit record.
- Permanently rejected payloads stop hot retrying and enter a visible, recoverable terminal state.
- Kill-switch, staged rollout, and rollback evidence meets the approved operational thresholds.
- Each in-scope NFR category has an identified, retained evidence artifact. Final NFR PASS, CONCERNS, or FAIL assessment remains deferred to `nfr-assess`.

# Step 5: Generate Output and Validate

- Mode: Epic-level Create
- Execution mode: Sequential, as explicitly configured
- Output: `field-order-capture/test-artifacts/test-design/test-design-epic-7.md`
- Critical score-9 risks: R-001, R-002, R-003, and R-005
- Gate thresholds: P0 at 100 percent, P1 at 95 percent or greater, all high-risk mitigations verified, requirements coverage at 80 percent or greater, and identified evidence for every in-scope NFR
- Open inputs: approved local-data controls, conflict semantics, retry policy, fleet device and network profile, concurrent reconnect target, release-control thresholds, and observability retention
- Validation: Template sections populated, canonical risk and coverage columns preserved, all six risks linked to suitable coverage, NFR planning included, interval estimates used, PR/Nightly/Weekly execution defined, no browser sessions opened, and no temporary artifacts created outside the test-design folder
