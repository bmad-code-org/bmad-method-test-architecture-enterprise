---
runScope: 'epic'
runKey: 'epic-7'
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-10-09T20:58:00-0500'
inputDocuments:
  - 'field-order-capture/_bmad/config.toml'
  - 'field-order-capture/docs/epics/epic-7-offline-order-capture.md'
  - 'bmod-tea/knowledge/risk-governance.md'
  - 'bmod-tea/knowledge/probability-impact.md'
  - 'bmod-tea/knowledge/test-levels-framework.md'
  - 'bmod-tea/knowledge/test-priorities-matrix.md'
  - 'bmod-tea/knowledge/nfr-criteria.md'
---

# Progress

Mode: Epic-level

Epic: 7

Rationale: The invocation explicitly scopes this run to Epic 7, and the epic requirements document is available.

## Step 2: Loaded Context

- Configuration: TEA test artifacts resolve to `field-order-capture/test-artifacts`. Optional utility, Pact, browser automation, and explicit stack settings are unset.
- Requirements: `field-order-capture/docs/epics/epic-7-offline-order-capture.md` is the sole requirements source.
- Product surface: native Android order capture with local SQLite queueing and server synchronization. Repository indicators are insufficient to identify an implementation stack because this fixture contains no application source or manifests.
- Existing coverage: no tests, fixtures, test framework configuration, or prior test-design outputs are present.
- Knowledge: the four required epic-level fragments plus `nfr-criteria.md`, selected because the epic includes security, performance, and reliability requirements.
- Browser exploration: skipped because the epic has no browser surface and `tea_browser_automation` is unset.
- Missing optional context: PRD, architecture, and sprint status are intentionally absent per the run configuration.

## Step 3: Risk and NFR Assessment

### Risk Register

| Risk ID | Category | Description and source evidence | Probability | Impact | Score | Mitigation | Owner | Timeline |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| R-001 | SEC | Sensitive order data can be extracted from a lost or compromised device. Story 7.1 says the SQLite queue holds the full payload, including the stored card reference and billing address, with no encryption at rest. | 3 | 3 | 9 | Encrypt the queue with OS-backed keys, minimize sensitive fields, prevent sensitive logging and backups, then verify the on-device file is unreadable outside the app security context. | Mobile engineering and Security | Before implementation acceptance |
| R-002 | DATA | Concurrent offline edits can cause permanent, silent loss of a technician's order lines. Story 7.2 says the server accepts arrival order with no version or timestamp checks, and a later arrival overwrites the earlier edit without a record. | 3 | 3 | 9 | Add optimistic versioning or deterministic merge and conflict capture. Preserve both technicians' edits until conflict resolution is recorded and visible. | Backend engineering and Product | Before release |
| R-003 | OPS | One permanently rejected payload can generate unbounded rapid upload traffic and device resource consumption. Story 7.3 specifies immediate indefinite retry with no backoff, cap, or dead-letter path. | 3 | 2 | 6 | Add bounded exponential backoff with jitter, retry classification, an attempt ceiling, quarantine or dead-letter handling, telemetry, and a technician-visible recovery state. | Mobile and Backend engineering | Before release |
| R-004 | OPS | A production defect reaches every technician and remains active for one to three days while a replacement build clears store review. Story 7.4 specifies universal enablement with no flag, staged rollout, or remote disable path. | 2 | 3 | 6 | Add a server-controlled kill switch, staged rollout cohorts, health gates, and a tested rollback or disable runbook. | Release engineering and Product | Before rollout |
| R-005 | PERF | A full offline-day backlog can miss the operational sync target and delay dispatcher visibility. Story 7.3 requires 2,000 queued items to complete within 30 seconds on fleet mid-range devices. | 2 | 3 | 6 | Establish the exact device and network profile, benchmark the complete device-to-server path, batch or parallelize safely, and enforce the 30-second threshold in repeatable performance tests. | Mobile, Backend, and Performance engineering | Before release candidate approval |
| R-006 | DATA | A saved or edited order can be lost, corrupted, duplicated, or changed across local serialization and server acceptance. Stories 7.1 through 7.3 require full payload queueing and the acceptance criteria require the dispatcher to see the order unchanged. | 2 | 3 | 6 | Use durable transactions, stable order and mutation identifiers, integrity checks, idempotent server acceptance, and end-to-end payload comparison. | Mobile and Backend engineering | During implementation and before release |
| R-007 | OPS | Automatic delivery can fail after connectivity returns, leaving the technician's captured order absent from dispatch. Story 7.3 requires upload when Android reports a usable network, and the acceptance criteria require zero technician action. | 2 | 3 | 6 | Implement a lifecycle-safe sync worker with persisted scheduling, connectivity rechecks, resumable processing, clear queue state, and telemetry for queue age and sync outcomes. | Mobile engineering and Operations | During implementation and before release |

Scores use probability times impact on the 1 to 3 scale. R-001 and R-002 are release blockers at score 9. R-003 through R-007 require mitigation and owned evidence before release.

### NFR Planning

| NFR category | Requirement or gap | Measurable threshold | Planned evidence |
| --- | --- | --- | --- |
| Security | The queue contains a stored card reference and billing address in plaintext SQLite. Device screen lock is the only stated control. | UNKNOWN in the requirements. Proposed release condition: zero plaintext sensitive queue fields in the database, backups, logs, and crash artifacts. | On-device database inspection on locked and compromised test devices, static configuration review, backup extraction test, and sensitive-log scan. |
| Performance | A 2,000-item backlog must finish syncing on fleet mid-range Android devices. | Complete sync in 30 seconds or less. Exact device model, Android version, network profile, payload distribution, and server-load profile are UNKNOWN. | Repeatable device-lab benchmark with server timing, item throughput, CPU, memory, battery, and failure-rate evidence. |
| Reliability | Sync starts automatically when Android reports a usable network. The stated retry design is immediate and unbounded. | Automatic start requires no user action. Backoff schedule, maximum attempts, poison-message behavior, queue durability across process or device restart, and maximum recovery time are UNKNOWN. | Android device tests for connectivity transitions and lifecycle events, fault-injection integration tests, queue-state assertions, and retry telemetry. |
| Scalability | Each device can accumulate 2,000 items. Aggregate fleet concurrency is unspecified. | Per-device backlog is 2,000 items. Concurrent-device and server-throughput thresholds are UNKNOWN. | Server load test using representative simultaneous device backlogs, with throughput, latency, saturation, and error-rate metrics. |
| Maintainability | No source code, architecture, observability contract, or CI policy is supplied. | UNKNOWN. | Later code review, CI coverage report, dependency scan, structured-log checks, and ownership review. |
| Compliance | No compliance regime or data-retention rule is named. The queue contains payment-related and address data. | UNKNOWN. | Security and legal classification review, retention and deletion tests after successful sync, and evidence that regional routing remains unchanged. |

### Clarifications Outside the Risk Register

- Define the representative mid-range Android device, Android version, payload mix, network conditions, and server load used for the 30-second measurement.
- Define queue durability expectations across app termination, device reboot, OS background restrictions, storage pressure, and application upgrade.
- Define idempotency, ordering, successful-dequeue, and partial-batch semantics.
- Define permitted retention for accepted queue records and classification requirements for stored card references and billing addresses.
- Define aggregate fleet concurrency and operational alert thresholds for queue depth, queue age, retry rate, and failed sync.

### Scope Controls Requiring Regression Assertions

- The feature remains native Android with no browser or web-view behavior.
- The dispatcher's web console receives the order unchanged, with no console implementation change.
- Single-tenant storage isolation and regional routing remain unchanged.
- The billing service is neither called nor changed, and charging stays on its existing nightly schedule.

### Highest-Risk Findings

The two critical blockers are plaintext sensitive data at rest and guaranteed silent overwrite during concurrent offline editing. Unbounded retries, fleet-wide irreversible rollout, the 30-second backlog target, payload integrity, and automatic synchronization are high risks that require owned mitigations and automated evidence.

## Step 4: Coverage and Execution Plan

### Priority Criteria

- P0: Critical business, security, data-integrity, or compliance impact with no safe workaround.
- P1: Core, frequent, or complex behavior with material user reach and a limited workaround.
- P2: Secondary behavior with narrower user reach and an acceptable workaround.
- P3: Rare, cosmetic, or experimental behavior with minimal impact and an easy workaround.

### Coverage Matrix

| Test ID | Scenario | Test Level | Priority | Risk Link | Notes and expected evidence |
| --- | --- | --- | --- | --- | --- |
| 7.1-E2E-001 | Disable all connectivity, open an existing work order, add parts and labour, save, and verify the native Android screen lists it as captured. | E2E | P0 | R-006 | Primary core journey. Failure loses or hides order data. The source describes waiting or paper re-entry as the current fallback, which is an unsafe and incomplete workaround. Device video, UI assertions, and queue record evidence. |
| 7.1-INT-001 | Persist a complete order payload atomically in SQLite and recover the identical record after process termination and device restart. | Integration | P0 | R-006 | Exercises persistence and lifecycle boundaries beneath the user journey. Database assertions and serialized payload diff. |
| 7.1-UNIT-001 | Round-trip every supported order field, parts line, labour line, billing address, and stored card reference through queue serialization. | Unit | P0 | R-006 | Isolates data transformation branches without duplicating persistence or UI behavior. Field-by-field equality report. |
| 7.1-E2E-002 | Inspect app storage, backups, logs, and crash artifacts after offline capture and verify sensitive queue fields are absent in plaintext following mitigation. | E2E | P0 | R-001 | Primary security validation on a real device. Exposure has no safe workaround because the source names screen lock as the only control. Storage extraction report and sensitive-data scan. |
| 7.2-E2E-001 | Edit a queued order several times before server acceptance and verify the latest technician-visible state remains editable and reaches dispatch unchanged. | E2E | P0 | R-006 | Validates the full edit journey and final payload integrity. A lost edit has no in-feature recovery. Device and dispatcher/API payload comparison. |
| 7.2-API-001 | Submit conflicting offline edits from two assigned technicians in both arrival orders and verify the conflict-safe design preserves both contributions plus an auditable resolution. | API | P0 | R-002 | Primary conflict test at the server boundary. The stated design silently loses earlier lines and keeps no recovery record. Conflict record and final-order assertions. |
| 7.2-UNIT-001 | Generate stable mutation identifiers and deterministic per-order sequence values across repeated edits. | Unit | P1 | R-006 | Isolates ordering and identity logic that supports idempotent synchronization. Deterministic unit report. |
| 7.3-E2E-001 | Capture offline, restore a usable network, take no user action, and verify automatic upload plus an unchanged order on the dispatcher side. | E2E | P0 | R-007, R-006 | Primary acceptance journey. Failure leaves dispatch without the order. Waiting or paper re-entry is the only source-supported fallback. Device, worker, server, and payload evidence. |
| 7.3-API-001 | Replay the same queued mutation after a lost acknowledgement and verify exactly one server-side effect. | API | P0 | R-006 | Covers the client-server idempotency boundary. Duplicate orders or lines create data-integrity harm with no documented repair. Server state and idempotency-key evidence. |
| 7.3-INT-001 | Inject transient timeouts, connection drops, 5xx responses, and eventual recovery. Verify bounded backoff, jitter, retained queue data, and eventual acceptance. | Integration | P0 | R-003, R-007 | Primary retry-control scenario. Immediate indefinite retry can consume device and network resources; stopping the application only pauses the harm and does not resolve the payload. Virtual-clock retry trace and queue-state assertions. |
| 7.3-INT-002 | Return a permanent validation rejection for one item. Verify the attempt ceiling, quarantine or dead-letter state, technician-visible status, telemetry, and continued processing of later valid items. | Integration | P0 | R-003 | A poison item must have a bounded, observable recovery path. Retry-count, quarantine, telemetry, and following-item evidence. |
| 7.3-INT-003 | Verify an item is removed only after durable server acceptance, while failed and interrupted uploads remain queued. | Integration | P0 | R-006 | Protects against loss at the acknowledgement boundary. Transaction and fault-injection evidence. |
| 7.3-E2E-002 | Run a representative 2,000-item backlog on the defined mid-range fleet device and network profile. Measure from usable-network signal to durable server acceptance of all items. | E2E | P0 | R-005 | Primary full-path performance gate. Failure delays an entire offline day of orders and no in-feature workaround is documented. Timing report must show 30 seconds or less plus zero loss and duplication. |
| 7.3-API-002 | Drive simultaneous representative device backlogs against the server and find the concurrency level that preserves the per-device target and error budget. | API | P1 | R-005 | API load testing isolates server capacity from device behavior. The concurrent-device threshold is currently UNKNOWN. Load report with latency, throughput, saturation, and errors. |
| 7.3-E2E-003 | Exercise connectivity flapping, app backgrounding, process death, device reboot, and OS background restrictions around the sync trigger. Verify eventual automatic resume with one final order. | E2E | P1 | R-007 | Lifecycle coverage suits a native Android device test. The current wait or paper flow is a limited fallback. Worker telemetry and final-state assertions. |
| 7.4-API-001 | Exercise the server-controlled kill switch and staged cohort configuration. Verify enable, disable, and cohort boundaries without a new application build. | API | P0 | R-004 | Primary release-control scenario. Without this mitigation every technician is exposed and recovery takes one to three days. Configuration audit and API behavior evidence. |
| 7.4-E2E-001 | Rehearse rollout health gates and remote disable during a failed canary, then confirm queued data remains intact and the prior supported behavior is restored. | E2E | P0 | R-004 | Validates the operational recovery path across deployment and device behavior. Release drill record and queue-integrity assertions. |

P0 dominates because the epic handles sensitive data, durable order state, silent conflict loss, full-fleet rollout, and the core offline-to-dispatch journey. P1 covers supporting ordering, server-capacity characterization, and Android lifecycle boundaries. There are no P2 or P3 rows because the supplied scope contains no secondary, cosmetic, or experimental behavior with an acceptable workaround.

### Scope Regression Assertions

- In 7.3-E2E-001, verify the dispatcher receives an unchanged order while the web console implementation and rendering remain untouched.
- In 7.3-API-001, verify requests and stored records remain inside the installation's existing single-tenant boundary and regional routing path.
- During 7.1-E2E-001 and 7.3-E2E-001, assert that no billing-service request is emitted and that offline synchronization creates no charge event.
- Confirm the Android package contains no new web view or browser route for this epic through build inspection and the native-device E2E run.

These checks protect explicit scope constraints. They do not create new scored risks.

### NFR Coverage and Evidence

| NFR | Planned validation | Evidence for later NFR assessment | Open blocker or assumption |
| --- | --- | --- | --- |
| Security | 7.1-E2E-002 plus static and backup inspection. | Device extraction bundle and sensitive-data scan. | Data classification and permitted retention are UNKNOWN. |
| Performance | 7.3-E2E-002 and 7.3-API-002. | Device timing report, server load report, resource metrics, and payload integrity counts. | Device, Android, network, payload, server-load, and concurrency profiles must be defined. |
| Reliability | 7.3-INT-001, 7.3-INT-002, 7.3-INT-003, and 7.3-E2E-003. | Fault-injection logs, virtual-clock retry trace, queue snapshots, and worker telemetry. | Recovery-time, attempt-cap, lifecycle durability, and alert thresholds are UNKNOWN. |
| Scalability | 7.3-API-002. | Saturation curve, throughput, latency percentiles, and error-rate report. | Aggregate fleet concurrency target is UNKNOWN. |
| Maintainability | CI coverage, dependency scan, structured logging checks, and code ownership review after source exists. | CI reports and ownership record. | No source, architecture, or CI configuration is available in this planning run. |
| Compliance | Review classification and retention, then test deletion after acceptance and unchanged regional routing. | Review approval, deletion evidence, and routing trace. | Applicable compliance regime and retention rule are UNKNOWN. |

### Execution Strategy

- PR: Unit, API, integration, and focused device E2E coverage when the suite stays under 15 minutes. Run all P0 functional scenarios on every change that touches queueing, sync, orders, storage, or release controls.
- Nightly: Full Android lifecycle matrix, security storage inspection, 2,000-item device benchmark, simultaneous-backlog API load, and broader regression.
- Weekly: Extended connectivity chaos, soak runs, fleet-concurrency characterization, backup extraction, rollout rehearsal, and full dependency and static scans.

### Resource Estimates

| Priority | Estimate |
| --- | --- |
| P0 | About 90 to 140 hours |
| P1 | About 30 to 55 hours |
| P2 | About 8 to 16 hours for future clarification-driven coverage |
| P3 | About 0 to 5 hours |
| Total | About 128 to 216 hours |

Expected elapsed timeline is about four to seven weeks with mobile, backend, security, performance, and release-engineering work proceeding in parallel.

### Quality Gates

- P0 pass rate is 100 percent.
- P1 pass rate is at least 95 percent.
- Every acceptance criterion and every risk has automated planned coverage, with overall requirements-to-tests coverage at least 80 percent.
- R-001 and R-002 must be resolved or formally waived by accountable security, data, and product owners before release. Open score-9 risks block release.
- Mitigations and evidence for R-003 through R-007 must be complete before release.
- The 2,000-item full-path run must complete in 30 seconds or less on the agreed representative profile, with zero lost, duplicated, corrupted, or misrouted orders.
- NFR evidence sources must exist for every in-scope NFR category. Final PASS, CONCERNS, or FAIL assessment is deferred to `nfr-assess` after implementation evidence exists.

## Step 5: Completion Report

- Mode: Epic-level Create, full design, sequential execution.
- Output: `field-order-capture/test-artifacts/test-design/test-design-epic-7.md`.
- Key blockers: plaintext sensitive queue data and silent concurrent-edit loss, both scored 9.
- Gate thresholds: P0 at 100 percent, P1 at 95 percent or higher, all high-risk mitigations completed or formally waived, and the 2,000-item backlog completed within 30 seconds on the agreed profile.
- Open definitions: representative device and load profile, fleet concurrency, retry limits, durability behavior, data retention, and idempotency semantics.
- Validation: template sections populated, seven risk scores verified, all seven risks mapped to 17 coverage rows, required NFR planning included, placeholders removed, and no browser session or temporary artifact created.
