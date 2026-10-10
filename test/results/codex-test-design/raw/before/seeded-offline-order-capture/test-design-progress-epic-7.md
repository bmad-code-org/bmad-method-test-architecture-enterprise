---
runScope: 'epic'
runKey: 'epic-7'
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
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

# Step 1: Mode and Prerequisites

- Mode: Epic-level
- Reason: The run configuration names Epic 7 and identifies its epic document as the requirements source.
- Prerequisites: The Epic 7 requirements document is available. Architecture context is optional and absent by design.
- Run scope: `epic`
- Run key: `epic-7`
- Epic number: `7`
- Checkpoint state: Fresh run

# Step 2: Loaded Context

## Configuration

- Test artifacts: `field-order-capture/test-artifacts`
- Playwright utilities: Module default `true`; no package manifest exists, so the integration branch remains closed.
- Pact.js utilities: Module default `true`; no package manifest or Pact artifact exists, so the contract branch remains closed.
- Pact MCP: Module default `mcp`; contract testing is outside this run because repository evidence does not establish a contract testing practice.
- Browser automation: Module default `auto`; exploration was skipped because the epic explicitly defines a native Android client with no browser or web view, and the repository supplies no runnable target.
- Test stack type: `auto`; the repository contains no implementation manifest. The requirements identify the product surface as native Android.
- Execution mode: `sequential`
- Capability probe: `false`

## Requirements and Integration Points

- Story 7.1 requires offline order capture through a local SQLite outbound queue and a visible captured state.
- Story 7.2 requires queued orders to remain editable, with each edit appended to the queue.
- Story 7.3 requires automatic upload when Android reports a usable network and requires 2,000 queued items to sync within 30 seconds on fleet hardware.
- The acceptance path spans the Android client, local SQLite storage, Android connectivity reporting, the server ingestion path, server persistence, and the dispatcher web console.
- The server must preserve an accepted order unchanged through the dispatcher console.

## Existing Coverage

- No test folders, test files, fixtures, runner configuration, or prior system-level test design were found.
- Coverage is absent for the four acceptance criteria and for the security, concurrency, retry, recovery, rollout, and performance risks stated in the epic.

## Knowledge Loaded

- `risk-governance.md`
- `probability-impact.md`
- `test-levels-framework.md`
- `test-priorities-matrix.md`
- `nfr-criteria.md`, selected because the epic contains security, performance, reliability, scalability, and operational requirements.
- `playwright-cli.md`, selected by the browser automation default. Its browser exploration path does not apply to this native Android epic.

All required inputs are present. The absent PRD, architecture document, and sprint status file are expected for this run.

# Step 3: Risk and NFR Assessment

## Risk Register

| ID | Category | Risk and source evidence | Probability | Impact | Score | Mitigation | Owner | Timeline |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| R-001 | SEC | Sensitive order data is exposed through device storage. Story 7.1 states that the plain SQLite queue contains the stored card reference and billing address, lacks encryption at rest, and relies solely on the device screen lock. | 3 | 3 | 9 | Encrypt queue contents with Android Keystore backed keys, minimize queued sensitive fields, prevent backup and debug extraction, and validate storage on locked, rooted, and lost-device scenarios. | Mobile engineering and Security | Resolve before implementation acceptance |
| R-002 | DATA | Concurrent offline edits can silently destroy order lines. Story 7.2 states that two technicians can edit the same order, the server performs no version or timestamp check, later arrival overwrites earlier data, and no record preserves the lost lines. | 3 | 3 | 9 | Add versioned conflict detection, retain both revisions, expose a deterministic merge or conflict workflow, and audit every rejected or superseded revision. | Backend engineering and Product | Resolve before release |
| R-003 | OPS | A permanently invalid payload creates an uncontrolled retry loop. Story 7.3 specifies immediate, indefinite retries with no backoff, attempt cap, or dead-letter path. | 3 | 3 | 9 | Classify transient and permanent failures, add exponential backoff with jitter, cap attempts, quarantine terminal failures, expose recovery status, and emit retry metrics and alerts. | Mobile engineering, Backend engineering, and SRE | Resolve before release |
| R-004 | PERF | A full offline backlog may miss the required recovery window. Story 7.3 requires 2,000 queued items to sync within 30 seconds on fleet mid-range devices. | 2 | 3 | 6 | Define the representative device and network profile, benchmark the full path, batch or parallelize safely, and enforce the 30 second threshold in repeatable performance tests. | Mobile engineering and Performance engineering | Benchmark before feature complete; gate before release |
| R-005 | OPS | A severe defect would affect every technician and remain active during store review. Story 7.4 specifies universal enablement, no staged rollout, no disable switch, and a one to three day replacement-build delay. | 2 | 3 | 6 | Add a remotely controlled kill switch, stage rollout by cohort, define rollback criteria, and rehearse disablement before launch. | Product, Mobile engineering, and Release engineering | Complete before production rollout |
| R-006 | DATA | An accepted order may differ from the captured order or fail to appear for dispatch. The acceptance criteria require the server order to appear on the dispatcher console unchanged. | 2 | 3 | 6 | Use stable order and mutation identifiers, integrity checks, idempotent ingestion, and end-to-end payload comparison from device capture through persisted server record and dispatcher read model. | Mobile engineering, Backend engineering, and QA | Complete before release |
| R-007 | BUS | The core offline workflow may falsely report success or block field work. Story 7.1 and the first acceptance criterion require an offline save to persist locally and appear as captured. | 2 | 3 | 6 | Make local persistence atomic, report captured only after a committed queue write, test storage exhaustion and process interruption, and provide a visible recovery path. | Mobile engineering and QA | Complete before release |
| R-008 | TECH | Connectivity restoration may fail to trigger reliable synchronization. Story 7.3 relies on the operating system reporting a usable network, and the acceptance criteria require upload without technician action. | 2 | 3 | 6 | Validate process lifecycle and connectivity transitions, persist sync scheduling across restarts, confirm actual server reachability, and instrument queue age and sync trigger outcomes. | Mobile engineering and SRE | Complete before release |

All eight risks exceed the ownership threshold. R-001, R-002, and R-003 score 9 and block release while open. R-004 through R-008 require documented mitigation and evidence.

## NFR Planning

| Category | In-scope requirement or gap | Threshold | Planned evidence |
| --- | --- | --- | --- |
| Security | Protect the local queue that currently stores card references and billing addresses in plaintext. | UNKNOWN. The epic defines the insecure storage design without an acceptable encryption, retention, backup, or device-compromise standard. | Static configuration review, instrumented Android storage tests, backup extraction checks, locked-device checks, rooted-device security review, and sensitive-data logging scan. |
| Performance | Synchronize a backlog of 2,000 queued items on fleet mid-range devices. | Full backlog completes within 30 seconds after usable connectivity returns. Representative device model, network profile, server load, and measurement boundaries are UNKNOWN. | Device-based benchmark with 2,000 realistic payloads, server timing, throughput metrics, CPU, memory, battery, retry count, and repeated percentile results. |
| Reliability | Persist offline saves, preserve editability until acceptance, trigger sync automatically, and recover from upload failures. | Offline data loss tolerance is implied as zero by the acceptance criteria. Retry delay, attempt cap, restart recovery target, duplicate tolerance, and maximum queue age are UNKNOWN. | Android lifecycle tests, process-kill tests, storage fault injection, network transition tests, server fault injection, idempotency checks, queue-age metrics, and retry telemetry. |
| Scalability | Support the stated per-device maximum while many technicians may reconnect. | Per-device backlog is 2,000 items. Concurrent technician count, server throughput, and fleet reconnection profile are UNKNOWN. | Coordinated device or protocol load test, server saturation metrics, queue drain distribution, database contention metrics, and error-rate evidence. |
| Maintainability | No maintainability target appears in the epic. | UNKNOWN. | CI unit and integration coverage report, static analysis, dependency scan, and operational runbook review once implementation exists. |
| Compliance | The queue contains a stored card reference and billing address. Data residency remains under the unchanged regional routing layer. | Applicable payment-data classification, privacy retention, deletion, and audit requirements are UNKNOWN. | Security and privacy review, data inventory, retention verification, regional routing regression evidence, and audit-log review. |
| Operations | The feature launches to every technician with no runtime disable path. | Replacement through store review takes one to three days. No acceptable rollback time is defined. | Kill-switch test, staged rollout rehearsal, release monitoring dashboard, alert test, and rollback exercise. |

## Clarification Items

- Define the approved protection, retention, backup, and deletion controls for queued card references and billing addresses.
- Name the fleet device model, Android version, network conditions, server load, and timing boundaries for the 30 second performance requirement.
- Define retry limits, backoff, terminal failure handling, duplicate semantics, and acceptable queue age.
- Define conflict ownership and the required user experience when two technicians edit one order offline.
- Define expected concurrent reconnection volume and server capacity targets.
- Define rollout safety controls and the maximum acceptable disable or rollback time.

## Highest Mitigation Priorities

1. Remove plaintext sensitive-data exposure before the queue design is accepted.
2. Prevent silent loss from concurrent edits through versioned conflict handling and audit history.
3. Replace unbounded immediate retries with bounded, observable recovery behavior.
4. Prove the 2,000 item backlog target on representative hardware under defined network and server conditions.
5. Add a rapid operational disable path before universal release.

# Step 4: Coverage and Execution Plan

## Coverage Matrix

| Test ID | Atomic scenario | Test Level | Priority | Risk Link | Notes and expected evidence |
| --- | --- | --- | --- | --- | --- |
| 7.1-UNIT-001 | Serialize and deserialize every order field without mutation, including parts, labour, card reference, and billing address. | Unit | P1 | R-006 | Pure transformation logic belongs at unit level. Evidence is a deterministic field-by-field round trip report. |
| 7.1-COMP-001 | Commit the queue write atomically and enter captured state only after SQLite confirms success; storage-full and interrupted-write paths must leave a recoverable state. | Component | P0 | R-007 | Exercises the queue repository and presentation state together with fault-injected storage. |
| 7.1-E2E-001 | On a representative Android device with connectivity disabled, save an existing order and observe it in the captured list after app restart. | E2E | P0 | R-007 | Covers the critical technician journey across UI, process lifecycle, and real SQLite storage. |
| 7.1-E2E-002 | Inspect app storage, backups, logs, and diagnostics after offline capture and verify that sensitive queue contents are protected under the approved security controls. | E2E | P0 | R-001 | Device-level evidence is required because encryption and backup controls depend on Android runtime configuration and Keystore behavior. |
| 7.2-UNIT-001 | Append each queued edit as an ordered immutable mutation and allow edits only until server acceptance is recorded. | Unit | P1 | R-006 | Covers the local queue state machine without duplicating device workflow coverage. |
| 7.2-API-001 | Submit two revisions based on the same server version and verify that conflict handling preserves both revisions, returns a deterministic outcome, and writes an audit record. | API | P0 | R-002 | The risk sits at the ingestion and persistence boundary, so API coverage directly validates the required mitigation. |
| 7.2-E2E-001 | Use two offline devices assigned to one work order, edit on both, reconnect in each arrival order, and verify that no technician lines disappear silently. | E2E | P0 | R-002 | Validates the complete multi-device conflict journey and its technician-visible resolution. |
| 7.3-UNIT-001 | Classify transient and permanent upload failures and enforce backoff, jitter, attempt caps, and terminal quarantine in the retry state machine. | Unit | P1 | R-003 | Fast deterministic coverage suits the branching retry policy. |
| 7.3-API-001 | Fail uploads transiently, then accept them, and verify bounded retries plus a single persisted order for one mutation identifier. | API | P1 | R-003, R-006 | API fault injection verifies retry behavior and server idempotency at their shared boundary. |
| 7.3-API-002 | Permanently reject a payload and verify bounded request rate, quarantine, actionable status, retry metrics, and alerts. | API | P0 | R-003 | Confirms that an unrecoverable payload cannot create an endless request storm. |
| 7.3-E2E-001 | Restore a usable network and verify automatic synchronization without technician action across foreground, background, and resumed application states. | E2E | P1 | R-008 | Android lifecycle and connectivity callbacks require device-level validation. |
| 7.3-E2E-002 | Kill and restart the app during queue drain, then verify that synchronization resumes without loss, duplication, or reordering. | E2E | P1 | R-008, R-006 | Covers durable scheduling and end-to-end recovery after process interruption. |
| 7.3-E2E-003 | Capture offline, sync, then compare the device payload, accepted server record, and dispatcher console representation field by field. | E2E | P0 | R-006 | This is the acceptance criterion that spans all participating systems. |
| 7.3-E2E-004 | Drain 2,000 realistic items within 30 seconds on the agreed fleet device and network profile while recording resource usage and errors. | E2E | P0 | R-004 | The stated threshold includes client hardware, connectivity, server ingestion, and persistence, so a full-path device benchmark is required. |
| 7.3-API-003 | Simulate the agreed concurrent fleet reconnection profile and verify server throughput, latency, database contention, and error thresholds. | API | P1 | R-004 | Protocol-level load removes device orchestration noise and measures server scalability. Execution remains blocked until fleet concurrency thresholds are defined. |
| 7.4-COMP-001 | Evaluate remote enablement state and confirm that disablement safely prevents new offline captures while preserving access to already queued work. | Component | P1 | R-005 | Covers flag policy and local state transitions with deterministic inputs. |
| 7.4-E2E-001 | Disable the feature remotely on a production-like installed build and verify the safe state without a store update. | E2E | P0 | R-005 | Demonstrates the operational mitigation on the actual delivery path. |
| 7.4-E2E-002 | Rehearse staged rollout and rollback criteria with monitoring, alerts, and queued-item recovery. | E2E | P0 | R-005 | The universal user impact and one to three day store delay make release recovery a critical operational journey. |

The plan contains 10 P0 scenarios and eight P1 scenarios. No P2 or P3 scenarios are planned because every included behavior protects the core offline journey, sensitive data, data integrity, performance threshold, or release recovery.

## NFR Coverage and Evidence

| NFR category | Planned validation | Expected evidence for later NFR assessment | Open condition |
| --- | --- | --- | --- |
| Security | Device storage inspection, backup extraction, Keystore behavior, rooted-device review, and sensitive logging scan through 7.1-E2E-002. | Instrumentation report, storage and backup inspection artifacts, security scan results, and approved threat review. | R-001 blocks release. Approved encryption, retention, and compromise criteria remain undefined. |
| Performance | Full-path 2,000 item device benchmark through 7.3-E2E-004. | Timed run data with percentiles, queue drain trace, device CPU, memory, battery, server latency, throughput, and error metrics. | R-004 remains open until device, network, load, and timing boundaries are fixed. |
| Reliability | Storage fault injection, process restart, connectivity transitions, retry policy, idempotency, and terminal failure handling across the R-003, R-007, and R-008 rows. | Automated reports, fault-injection logs, queue-age metrics, retry counters, duplicate checks, alerts, and recovery traces. | Retry and recovery thresholds remain undefined under R-003 and R-008. |
| Scalability | Fleet reconnection load through 7.3-API-003 plus the per-device benchmark. | Load generator report, server saturation graphs, database contention metrics, latency distribution, throughput, and errors. | Concurrent fleet volume and server thresholds are undefined under R-004. |
| Maintainability | CI coverage, static analysis, dependency scanning, migration tests, and runbook review once code exists. | CI reports, coverage summary, static analysis output, dependency scan, and reviewed operational documentation. | No epic threshold exists. Record the agreed thresholds before implementation sign-off. |
| Compliance | Data inventory, regional routing regression, retention verification, and audit-log review. | Approved data classification, privacy and payment-data review, routing regression report, retention report, and audit samples. | Applicable classification and retention rules are undefined and tied to R-001. |
| Operations | Remote disablement, staged rollout, alerting, and rollback rehearsal through the R-005 rows. | Rollout record, kill-switch execution evidence, dashboard and alert captures, rollback timing, and recovery log. | R-005 blocks release until a rapid disable path and acceptable rollback time exist. |

No final NFR status is assigned in this plan. The `nfr-assess` workflow should evaluate the listed evidence after implementation.

## Execution Strategy

- PR: Run all unit, component, and functional API scenarios plus one offline capture and reconnect device smoke path. Keep the PR suite within 15 minutes.
- Nightly: Run the complete device matrix, lifecycle interruption, two-device conflict, sensitive-data inspection, permanent rejection, and dispatcher propagation scenarios.
- Weekly: Run the 2,000 item benchmark, concurrent fleet load, retry soak, security review automation, and staged rollout or rollback rehearsal in a controlled environment.

P0 scenarios execute first within every stage. The P1 scalability scenario follows after the P0 functional and recovery gates pass.

## Resource Estimate

| Priority | Estimate | Basis |
| --- | --- | --- |
| P0 | About 70 to 110 hours | Ten scenarios across Android devices, SQLite fault injection, server APIs, security controls, multi-device concurrency, performance, and release operations. |
| P1 | About 32 to 58 hours | Eight supporting logic, API, lifecycle, and fleet load scenarios. |
| P2 | About 0 to 8 hours | Contingency for secondary scenarios discovered when thresholds are clarified. |
| P3 | About 0 to 4 hours | No current scenarios; reserve only for low-impact diagnostics. |
| Total | About 102 to 180 hours | Includes automation, fixtures, environments, evidence capture, and stabilization. |

Expected elapsed time is about three to six weeks for one test engineer with scheduled support from mobile, backend, security, performance, and SRE owners. Device lab and production-like environment availability can extend this range.

## Quality Gates

- P0 pass rate must equal 100 percent.
- P1 pass rate must be at least 95 percent.
- Every acceptance criterion must have executed automated coverage with traceable evidence.
- All score 9 risks must be resolved. All score 6 risks must have completed mitigations, owners, and evidence before release.
- Requirements coverage must be at least 80 percent overall, with 100 percent coverage for P0 requirements and the four acceptance criteria.
- The 2,000 item queue must drain within 30 seconds under the agreed representative conditions.
- No silent order-line loss, duplicate accepted mutation, plaintext sensitive queue content, uncontrolled retry loop, or unrecoverable rollout defect is permitted.
- Each in-scope NFR category must have an identified, collectable evidence source. Final NFR status is deferred to `nfr-assess`.
- Any missing security, performance, reliability, scalability, compliance, or rollback threshold must be resolved before the affected gate can pass.

# Step 5: Output and Validation

- Mode: Epic-level, sequential execution
- Output: `field-order-capture/test-artifacts/test-design/test-design-epic-7.md`
- Key risks: Plaintext sensitive local storage, silent concurrent edit loss, uncontrolled retry loops, backlog performance, universal rollout exposure, order integrity, local persistence, and missed synchronization.
- Gate thresholds: P0 equals 100 percent; P1 is at least 95 percent; all score 9 risks are resolved; all score 6 mitigations are complete; requirements coverage is at least 80 percent; all four acceptance criteria have full traceability; the 2,000 item backlog drains within 30 seconds under approved conditions.
- Open assumptions: Representative device and network profiles, concurrency targets, security and compliance controls, retry thresholds, recovery targets, and rollback timing require stakeholder definition before their gates can pass.
- Validation: Risk arithmetic is correct, all eight risks map to coverage, all required template sections are populated, no placeholders remain, no tests were generated, and no browser session was opened.
