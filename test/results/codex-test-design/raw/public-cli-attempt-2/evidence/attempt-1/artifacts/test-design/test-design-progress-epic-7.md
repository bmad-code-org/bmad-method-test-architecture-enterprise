---
runScope: 'epic'
runKey: 'epic-7'
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-10-10T02:18:55Z'
inputDocuments:
  - '/private/tmp/remaining-skills-evidence/test-design-cli-recovery/field-order-capture/docs/epic-7.md'
  - '/private/tmp/remaining-skills-frozen/test-design-recovery/skills/bmod-tea/knowledge/risk-governance.md'
  - '/private/tmp/remaining-skills-frozen/test-design-recovery/skills/bmod-tea/knowledge/probability-impact.md'
  - '/private/tmp/remaining-skills-frozen/test-design-recovery/skills/bmod-tea/knowledge/test-levels-framework.md'
  - '/private/tmp/remaining-skills-frozen/test-design-recovery/skills/bmod-tea/knowledge/test-priorities-matrix.md'
  - '/private/tmp/remaining-skills-frozen/test-design-recovery/skills/bmod-tea/knowledge/nfr-criteria.md'
---

# Test Design Progress: Epic 7

## Step 1: Mode and prerequisites

Mode: Epic-level test design.

Run identity: `run_scope=epic`, `run_key=epic-7`, `epic_num=7`.

The explicit run request selects Epic 7. The supplied requirements document contains four stories and acceptance criteria for offline order capture. The epic-level prerequisite check passes.

Evidence is limited to `docs/epic-7.md` as directed.

## Step 2: Context and knowledge

Configuration loaded:

* `tea_use_playwright_utils=true`
* `tea_use_pactjs_utils=true`
* `tea_pact_mcp=mcp`
* `tea_browser_automation=none`
* `test_stack_type=auto`
* `test_artifacts=/private/tmp/remaining-skills-evidence/test-design-cli-recovery/field-order-capture/.tea-runs/tea-test-design-gDfdCJ/attempt-1/artifacts`

The repository contains no implementation manifests or mobile, frontend, or backend stack indicators outside the supplied evidence and generated run artifacts. The detected stack is therefore `unknown`. No existing test directories, fixtures, test patterns, or flaky areas were found. Browser exploration was skipped because browser automation is `none` and the epic has no browser surface.

The supplied Epic 7 document was loaded as the sole requirements and architecture context. It identifies a native Android client, local SQLite queue, order server synchronization, and dispatcher web-console observation as integration points. Existing automated coverage is absent from the available project evidence.

Loaded knowledge fragments are `risk-governance.md`, `probability-impact.md`, `test-levels-framework.md`, `test-priorities-matrix.md`, and `nfr-criteria.md`. The NFR fragment applies because the epic contains explicit security, performance, reliability, and operational concerns. Contract-testing fragments do not apply because repository evidence contains no Pact artifacts or dependencies and the run does not request contract testing.

Required epic-level input is present. Architecture details, implementation code, test framework, fixtures, and prior coverage evidence are unavailable, so the plan must keep tool-specific implementation choices open and record these testability gaps.

## Step 3: Risk and NFR planning assessment

### Risk scoring model

Probability and impact use the required 1 through 3 scale. Score is probability multiplied by impact. Scores 6 through 8 require mitigation. Score 9 blocks release until resolved or formally waived.

| Risk ID | Category | Description | Source evidence | Probability | Impact | Score |
| --- | --- | --- | --- | ---: | ---: | ---: |
| R-001 | SEC | Sensitive order data can be recovered from a lost, stolen, rooted, or forensically inspected device because the local queue stores the customer card reference and billing address in a plain, unencrypted SQLite file. | Epic 7, Story 7.1: the queue contains the full payload, including card reference and billing address, and is unencrypted at rest with only the device screen lock protecting it. | 3 | 3 | 9 |
| R-002 | DATA | Legitimate order lines can be silently lost when two offline technicians edit the same work order because arrival order wins without version or timestamp checks and the overwritten changes leave no audit record. | Epic 7, Story 7.2 explicitly states the overwrite and loss behavior. | 3 | 3 | 9 |
| R-003 | OPS | A permanently rejected payload can enter a hot retry loop that drains battery and data, consumes server capacity, blocks queue progress, and continues for the life of the running application. | Epic 7, Story 7.3: retries are immediate and indefinite, with no backoff, attempt cap, or dead-letter path. | 3 | 3 | 9 |
| R-004 | OPS | A severe defect can affect every technician at once and remain active for one to three days because release is universal and disabling the feature requires a new store-reviewed build. | Epic 7, Story 7.4: no feature flag, staged rollout, or remote disable path; store review takes one to three days. | 3 | 3 | 9 |
| R-005 | DATA | An order can be altered, duplicated, omitted, or reordered while moving through capture, edit, local persistence, and server ingestion, so the dispatcher sees data different from the technician's accepted final order. | Epic 7 acceptance criteria require an order reaching the server to appear unchanged; Stories 7.1 and 7.2 use full-payload queued entries and append each edit. | 2 | 3 | 6 |
| R-006 | PERF | A full 2,000-item backlog can miss the 30-second recovery target on fleet hardware, delaying dispatch visibility after connectivity returns. | Epic 7, Story 7.3 requires 2,000 items to finish syncing within 30 seconds on fleet mid-range devices. | 2 | 3 | 6 |

### Required mitigations

| Risk ID | Mitigation | Owner | Timeline |
| --- | --- | --- | --- |
| R-001 | Remove stored payment data from offline payloads where possible. Encrypt the remaining queue data with Android Keystore-backed keys. Add migration, backup-exclusion, lock-state, root-threat, and secure-deletion verification. Obtain security approval for the data-minimization decision. | Mobile lead and Security | Before implementation approval and release |
| R-002 | Add optimistic concurrency with server versions or equivalent conflict detection. Preserve both technicians' changes in an auditable conflict workflow. Test opposite arrival orders and resolution outcomes. | Order service owner and Product | Before release |
| R-003 | Classify transient and permanent failures. Add bounded exponential backoff with jitter, an attempt policy, poison-item isolation, queue progress, and operator-visible telemetry. Verify recovery after process restart. | Mobile lead and SRE | Before release |
| R-004 | Add a remotely controlled kill switch and staged rollout with measured cohorts. Define activation, rollback, ownership, and audit procedures. Exercise disablement before general availability. | Release Engineering and Product | Before production rollout |
| R-005 | Define queue identity, ordering, idempotency, edit supersession, and transaction boundaries. Validate exact canonical payload equality across the device database, upload API, server store, and dispatcher read model. | Mobile lead and Order service owner | Before feature completion |
| R-006 | Define the representative mid-range device model, OS version, payload distribution, network profile, server load, and timing boundaries. Run automated device and server benchmarks at 2,000 items. Profile bottlenecks and retain results. | Performance Engineering and Mobile lead | Baseline before release candidate; gate every release candidate |

### NFR planning

| Category | Requirement or gap | Threshold | Planned evidence |
| --- | --- | --- | --- |
| Security | Protect sensitive local queue data. Current design explicitly leaves card reference and billing address unencrypted. | UNKNOWN. Data classification, permitted offline fields, encryption standard, key lifecycle, backup policy, and deletion deadline require definition. | Mobile security tests on physical or representative Android devices; database inspection; key lifecycle tests; static and dependency scans; security review report. |
| Performance | Sync a full backlog after connectivity returns. | 2,000 queued items complete within 30 seconds on the fleet's mid-range devices. Exact device, Android version, payload mix, network conditions, server load, and percentile are UNKNOWN. | Instrumented device benchmark plus server metrics. Record total duration, throughput, latency percentiles, CPU, memory, battery, bytes, and error rate. |
| Reliability | Capture and edit while offline, then upload automatically when the operating system reports a usable network. | Successful automatic trigger and eventual acceptance are required. Queue durability across app death or reboot, retry timing, attempt cap, backoff, poison-item handling, and recovery objectives are UNKNOWN. | Native device lifecycle and connectivity tests; fault injection; queue-state assertions across process death and reboot; server failure simulations; retry telemetry. |
| Scalability | Device and server must process simultaneous reconnects and 2,000-item queues. | Per-device backlog threshold is 2,000 in 30 seconds. Concurrent technician count and server saturation limits are UNKNOWN. | Coordinated load test with multiple device clients, API throughput and saturation metrics, queue-drain distributions, and capacity report. |
| Maintainability and operability | Release has no staged rollout, feature flag, or fast disablement. Test infrastructure and observability are unspecified. | Store replacement delay is one to three days. Kill-switch propagation time, alert thresholds, coverage targets, logging fields, and telemetry retention are UNKNOWN. | Rollout and rollback drill; remote-disable audit log; CI reports; structured queue and sync telemetry; alert tests; operational runbook review. |
| Compliance and privacy | Single-tenant isolation and regional routing remain unchanged. Offline storage adds a sensitive local copy whose governing policy is unspecified. | No cross-installation reads and unchanged regional routing are explicit. Applicable payment, privacy, retention, and device-loss obligations are UNKNOWN. | Regression tests for tenant isolation and regional routing; data inventory; privacy and compliance review; local retention and erasure tests. |

### Scope constraints and regression assertions

The supplied epic states that installations share no storage, regional routing is unchanged, billing timing and calls are unchanged, and the order screen rendering does not change. These are satisfied scope constraints, so they do not become hypothetical scored risks. The coverage plan must verify no cross-tenant access, no regional-routing regression, no billing-service interaction or schedule change, and no browser or web-view dependency in the technician flow.

### Risk summary

Four score 9 risks block an acceptable release posture: R-001, R-002, R-003, and R-004. Their controls belong in the design before test execution can produce release confidence. R-005 and R-006 require high-priority automated coverage and retained evidence. Missing NFR thresholds remain explicit unknowns and cannot receive final PASS status during this planning workflow.

## Step 4: Coverage plan and execution strategy

Priority expresses business importance and does not specify execution timing. P0 covers critical business, security, data-integrity, or compliance impact with no safe workaround. P1 covers core, frequent, or complex behavior with material user reach and a limited workaround. P2 covers secondary behavior with narrower user reach and an acceptable workaround. P3 covers rare, cosmetic, or experimental behavior with minimal impact and an easy workaround.

### P0 scenarios

Criteria: Critical business, security, data-integrity, or compliance impact with no safe workaround.

| Test ID | Requirement | Test Level | Risk Link | Notes |
| --- | --- | --- | --- | --- |
| 7.1-E2E-001 | With all device connectivity disabled, save an existing work order containing parts and labour. Verify the native app lists it as captured and emits no server request. | E2E | R-005 | Failure loses the technician's core order capture. The source offers paper re-entry only for the current connected-only product and provides no recovery path for a queued order that was reported captured. |
| 7.1-INT-001 | Inspect the on-device database, backups, logs, and temporary files after capture and edit. Verify prohibited card and address fields are absent or cryptographically protected with non-exportable Android Keystore-backed keys. | Integration | R-001 | This level observes the real persistence and key boundary. Failure exposes customer data after device compromise. A screen lock does not recover confidentiality after file extraction. |
| 7.1-E2E-002 | Kill and restart the app, then reboot the device while offline. Verify the captured order remains present and editable until server acceptance. | E2E | R-005 | Failure contradicts the required editable-until-accepted state and can lose a full field order. No source-supported restoration path exists. |
| 7.2-INT-001 | Apply several offline edits to one queued order. Verify each queue transaction is atomic, ordered, identifiable, and resolves to the technician's latest intended payload without duplicate server effects. | Integration | R-005 | Persistence and synchronization boundaries require an integration test. Failure corrupts or duplicates order data. The source provides no correction workflow. |
| 7.2-E2E-001 | Use two offline technician devices on the same work order. Sync them in both arrival orders and verify version conflict detection preserves both change sets or presents an auditable resolution workflow. | E2E | R-002 | Failure silently discards legitimate labour or parts lines. The epic explicitly states that the current proposed behavior keeps no record, leaving no recovery path. |
| 7.3-E2E-001 | Restore a usable network after offline capture. Verify queue upload starts without technician action and the accepted order leaves the editable queue state exactly once. | E2E | R-005 | Failure strands a captured core order. The source defines no manual sync action or alternate recovery for queued state. |
| 7.3-API-001 | Compare the canonical payload at capture, local persistence, upload request, server store, and dispatcher read model. Verify all business fields and line ordering are unchanged. | API | R-005 | API and persistence assertions isolate serialization fidelity while the device E2E covers the user journey. Failure causes dispatch to act on altered order data. No correction path is documented. |
| 7.3-API-002 | Inject transient timeouts and retryable server failures. Verify bounded exponential backoff with jitter, eventual acceptance, one logical server effect, and recorded retry telemetry. | API | R-003 | Failure can duplicate work or overload the device and server. Pausing the app leaves the core order unresolved and is not a valid workaround. |
| 7.3-API-003 | Place a permanently rejected payload before valid items. Verify attempt limits, poison-item isolation, continued queue progress, operator-visible failure state, and recovery after app restart. | API | R-003 | Failure creates an indefinite hot loop and can block every later order. The source supplies no dead-letter or manual recovery path. |
| 7.3-E2E-003 | On the defined fleet mid-range Android profile, sync 2,000 representative queued items within 30 seconds after network restoration while collecting device and server resource metrics. | E2E performance | R-006 | The end-to-end device path is the only level that validates the stated hardware budget. Failure delays dispatcher visibility for a full day of work. The source provides no recovery target or acceptable delayed mode. |
| 7.4-E2E-001 | Exercise cohort rollout, remote disablement, and audit logging in a production-like release environment. Verify a defective feature can be stopped within the approved kill-switch threshold. | E2E operational | R-004 | Failure exposes the whole fleet and leaves a one-to-three-day store release as the only documented recovery. |
| 7.0-API-001 | From one installation, attempt to address another installation's orders and storage identifiers. Verify isolation. Verify regional routing remains unchanged for captured and synced data. | API | None | Cross-installation disclosure has security and privacy impact. The epic states separate storage and unchanged regional routing, so this is a P0 regression assertion on satisfied constraints. |
| 7.0-API-002 | Observe service calls and billing records during capture, edit, retry, and sync. Verify the feature never calls the billing service and never changes nightly charging behavior. | API | None | Unexpected charging has direct financial impact. The epic says billing remains untouched, so there is no acceptable workaround for a regression. |

### P1 scenarios

Criteria: Core, frequent, or complex behavior with material user reach and a limited workaround.

| Test ID | Requirement | Test Level | Risk Link | Notes |
| --- | --- | --- | --- | --- |
| 7.3-E2E-002 | Alternate offline, captive, degraded, and usable network states with repeated operating-system callbacks. Verify one sync worker, stable queue state, no duplicate server effects, and automatic recovery on a truly usable network. | E2E | R-003, R-005 | Connectivity changes are frequent and complex. Temporary waiting is a limited workaround when the queue remains durable and later recovers automatically. |
| 7.0-INT-001 | Attempt offline capture for supported work orders and for every other capture entity. Verify only work orders gain offline behavior. | Integration | None | Scope leakage can affect adjacent workflows. Users can retain their existing connected workflow for other entities, which is an acceptable documented fallback. |

### P2 scenarios

Criteria: Secondary behavior with narrower user reach and an acceptable workaround.

| Test ID | Requirement | Test Level | Risk Link | Notes |
| --- | --- | --- | --- | --- |
| 7.0-E2E-001 | Compare the existing native order screen before and after enablement. Verify rendering remains unchanged and the technician flow introduces no browser or web-view dependency. | E2E | None | A rendering regression affects presentation while order capture can still be validated through the native controls. A corrected native build is an acceptable recovery for this narrower concern. |

### P3 scenarios

Criteria: Rare, cosmetic, or experimental behavior with minimal impact and an easy workaround.

No P3 scenarios are planned. Every supported behavior is part of the field order workflow or an explicit regression boundary with at least secondary customer impact.

### Coverage summary

The plan contains 16 atomic scenarios: 13 P0, 2 P1, 1 P2, and 0 P3. P0 dominates because offline order loss, silent overwrite, sensitive-data exposure, uncontrolled retry, fleet-wide release failure, billing regression, and isolation regression have critical consequences with no source-supported recovery. Test levels avoid repeated assertions: native E2E owns user and device lifecycle outcomes, integration owns SQLite and application boundary behavior, API owns server effects and cross-service invariants, and the operational E2E owns rollout controls.

### NFR coverage and evidence plan

| NFR category | Planned validation | Expected evidence for later NFR assessment | Open threshold or evidence gap |
| --- | --- | --- | --- |
| Security | 7.1-INT-001 and 7.0-API-001, plus static and dependency scans and a security review. | Device database inspection report, keystore test output, backup inspection, scan reports, tenant-isolation API results, and approval record. | Permitted offline fields, encryption algorithm, key rotation, retention, deletion, and device-compromise policy remain undefined. |
| Performance | 7.3-E2E-003 on representative physical or equivalent fleet hardware with server instrumentation. | Raw timing distribution, device profile, queue payload manifest, network profile, server-load profile, CPU, memory, battery, bytes, error rate, and profiler output. | Device model, Android version, payload mix, network conditions, concurrent load, and required percentile remain undefined. |
| Reliability | 7.1-E2E-002, 7.3-E2E-001, 7.3-API-002, 7.3-API-003, and 7.3-E2E-002. | Device-run results, fault-injection logs, queue state snapshots, retry schedule, restart evidence, duplicate-effect checks, and sync telemetry. | Retry cap, backoff schedule, poison-item recovery objective, app-death durability, and observability thresholds remain undefined. |
| Scalability | Extend 7.3-E2E-003 with coordinated reconnecting clients and server saturation measurement. | Concurrent-load report, throughput and latency distributions, saturation point, capacity model, and queue-drain completion distribution. | Concurrent technician volume and server capacity objectives remain undefined. |
| Maintainability and operability | 7.4-E2E-001 plus CI coverage, static analysis, structured logging, alert, and runbook checks. | Rollout drill, disablement timestamp and audit record, CI reports, alert test output, telemetry schema, dashboard capture, and approved runbook. | Kill-switch target, rollout cohort policy, alert thresholds, coverage target above the workflow gate, and telemetry retention remain undefined. |
| Compliance and privacy | 7.1-INT-001 and 7.0-API-001, backed by data inventory and compliance review. | Data-flow inventory, retention and erasure results, regional-routing regression results, and signed privacy or compliance review. | Applicable payment, privacy, retention, and lost-device obligations remain undefined. |

These gaps block final NFR status where a measurable threshold or authoritative policy is required. The later `nfr-assess` workflow should consume the named artifacts after implementation.

### Execution strategy

PR execution runs all functional unit, integration, API, and device tests when the full functional set remains below 15 minutes. If device duration exceeds 15 minutes, PRs run the P0 native smoke slice plus all lower-level functional checks, while the complete functional device suite runs nightly. Nightly execution also runs the full device matrix, lifecycle and connectivity-fault suite, security inspection, and moderate coordinated reconnect load. Weekly execution runs the 2,000-item performance gate, fleet-scale reconnect test, extended reliability and endurance suite, security scanning, and rollout or kill-switch drill in an isolated production-like environment.

Every tier must retain machine-readable results, device and build identity, logs, queue-state evidence, and server correlation identifiers. Failed or unmeasurable checks fail their tier. Quarantined P0 and P1 tests do not count toward gate pass rates.

### Resource estimates

| Priority | Estimate |
| --- | ---: |
| P0 | About 90 to 140 hours |
| P1 | About 20 to 35 hours |
| P2 | About 6 to 12 hours |
| P3 | 0 hours |
| Total | About 116 to 187 hours |

With mobile, service, security, performance, and release-engineering support available in parallel, plan roughly four to seven elapsed weeks. The range excludes production implementation of the required mitigations and includes test harnesses, device provisioning, fixtures, automation, telemetry assertions, and retained evidence.

### Quality gates

* P0 pass rate must equal 100 percent.
* P1 pass rate must be at least 95 percent.
* Every score 9 risk must be resolved or carry a formal waiver with approver, rationale, and expiry. Every score 6 risk must have completed mitigation and passing linked coverage before release.
* Every acceptance criterion and scored risk must map to at least one automated scenario. Overall planned requirement coverage must be at least 80 percent, with 100 percent coverage for P0 requirements.
* The 2,000-item backlog must meet the 30-second threshold on the approved representative device and declared test conditions.
* Security, performance, reliability, scalability, maintainability and operability, and compliance and privacy must each have the named evidence artifact available.
* Full NFR PASS, CONCERNS, or FAIL status is deferred to `nfr-assess` when implementation evidence exists.
* Any test that cannot measure its asserted outcome counts as a gate failure until evidence collection works.

## Step 5: Output generation and validation

Execution mode resolved to sequential generation. Configuration requested `auto`, and the available runtime did not expose the workflow's capability-probe methods. Epic-level mode produced one artifact with one worker.

Generated `/private/tmp/remaining-skills-evidence/test-design-cli-recovery/field-order-capture/.tea-runs/tea-test-design-gDfdCJ/attempt-1/artifacts/test-design/test-design-epic-7.md` from `test-design-template.md`.

Checklist validation completed. The final document contains the canonical scored risk table columns and canonical coverage table columns, all six risks have linked suitable coverage, all epic acceptance criteria and scope boundaries are represented, NFR gaps remain marked UNKNOWN, resource estimates use ranges, and execution timing uses the PR, nightly, and weekly model. No browser session or temporary exploration artifact was created. Markdown whitespace and unresolved template placeholders were checked successfully.

The document remains Draft. Four score 9 risks are open, two score 6 risks require mitigation, and authoritative security, performance-profile, retry, rollout, observability, and compliance thresholds remain unresolved. Release gates require 100 percent P0, at least 95 percent P1, at least 80 percent critical-path coverage with complete acceptance-criterion and risk mapping, completed or formally waived high-risk mitigations, and named evidence for every in-scope NFR category.

The configured completion hook is empty, so completion requires no hook command.
