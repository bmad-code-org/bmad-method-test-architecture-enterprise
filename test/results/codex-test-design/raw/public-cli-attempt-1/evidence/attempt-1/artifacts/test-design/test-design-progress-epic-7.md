---
runScope: 'epic'
runKey: 'epic-7'
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-10-10T01:46:48Z'
inputDocuments:
  - '/private/tmp/remaining-skills-evidence/test-design-cli-after/field-order-capture/docs/epic-7.md'
  - '/Users/murat/opensource/_wt/remaining-skills-codex-evaluation/skills/bmod-tea/knowledge/risk-governance.md'
  - '/Users/murat/opensource/_wt/remaining-skills-codex-evaluation/skills/bmod-tea/knowledge/probability-impact.md'
  - '/Users/murat/opensource/_wt/remaining-skills-codex-evaluation/skills/bmod-tea/knowledge/test-levels-framework.md'
  - '/Users/murat/opensource/_wt/remaining-skills-codex-evaluation/skills/bmod-tea/knowledge/test-priorities-matrix.md'
  - '/Users/murat/opensource/_wt/remaining-skills-codex-evaluation/skills/bmod-tea/knowledge/nfr-criteria.md'
---

# Test Design Progress: Epic 7

## Step 1: Detect Mode and Prerequisites

- Mode: Epic-level
- Design level: Full
- Run scope: `epic`
- Run key: `epic-7`
- Epic number: `7`
- Supplied input: `docs/epic-7.md`
- Prerequisite result: Passed. The supplied epic contains context, four stories, acceptance criteria, and relevant architecture constraints.
- Checkpoint state: Fresh run. No existing scoped checkpoint was present.

## Step 2: Load Context and Knowledge Base

### Configuration

- `tea_use_playwright_utils`: `true`
- `tea_use_pactjs_utils`: `true`
- `tea_pact_mcp`: `mcp`
- `tea_browser_automation`: `none`
- `test_stack_type`: `auto`
- `test_artifacts`: `/private/tmp/remaining-skills-evidence/test-design-cli-after/field-order-capture/.tea-runs/tea-test-design-U0s5Ut/attempt-1/artifacts`

### Stack and Existing Coverage

- Repository scan: No implementation, build manifest, test directory, fixture, or test framework files were found outside the supplied epic and run artifacts.
- Detected repository stack: Undetermined from repository files.
- Product surface from supplied evidence: Native Android application with no browser or web-view surface.
- Existing automated coverage: None found.
- Browser exploration: Skipped because `tea_browser_automation` is `none` and the epic has no browser surface.
- Contract branch: Closed. No Pact artifacts, dependencies, configuration, broker variables, or explicit contract-testing request were found.
- Prior system-level test design: None found in this run's artifact locations.

### Testable Requirements and Integration Points

- Save an existing work order while offline and show it as captured.
- Keep a queued order editable until server acceptance; each edit appends a queue entry.
- Upload queued entries automatically when Android reports a usable network.
- Preserve the order unchanged through server acceptance and dispatcher-console display.
- Sync a 2,000-item backlog within 30 seconds on fleet-representative mid-range devices.
- Integration boundaries: Android order UI and domain layer, local SQLite outbound queue, Android connectivity reporting, server order-ingest API, server persistence, and dispatcher read path.

### Known Coverage and Design Gaps

- Sensitive card references and billing addresses are stored unencrypted in SQLite.
- Concurrent offline edits use arrival-order last-write-wins behavior with silent data loss.
- Permanent upload failures trigger immediate unbounded retries with no backoff, cap, or dead-letter path.
- The release has no feature flag, staged rollout, or fast disable path; recovery requires a store-reviewed build taking one to three days.
- No repository test framework, test fixtures, executable application, API schema, device matrix, or observability evidence is available.

### Knowledge Loaded

- `risk-governance.md`
- `probability-impact.md`
- `test-levels-framework.md`
- `test-priorities-matrix.md`
- `nfr-criteria.md`, selected because the epic includes security, performance, reliability, and operational requirements.

## Step 3: Risk and NFR Planning Assessment

### Risk Scoring Basis

- Probability: 1 is unlikely, 2 is possible, 3 is likely.
- Impact: 1 is minor, 2 is degraded service, 3 is critical business, data, security, or operational harm.
- Score: Probability multiplied by impact.
- Scores 6 through 8 require mitigation. Score 9 blocks release until resolved or formally waived.

### Risk Register

| Risk ID | Category | Description | Source evidence | Probability | Impact | Score | Mitigation | Owner | Timeline |
| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| R-001 | SEC | A lost, stolen, rooted, backed-up, or forensically inspected device can expose the customer's stored card reference and billing address because the outbound queue is a plain SQLite file with no encryption at rest. | Epic 7.1 states that the full payload contains the stored card reference and billing address, the SQLite file is unencrypted, and the screen lock is the only protection. | 3 | 3 | 9 | Encrypt sensitive queue data with Android Keystore-backed keys; exclude sensitive fields when they are unnecessary for sync; block backup and debug extraction; add device-storage security tests and a threat review. | Mobile Security Lead | Before implementation approval and release |
| R-002 | DATA | Concurrent offline edits can silently erase a technician's parts and labour lines, leaving no audit record or conflict signal. | Epic 7.2 states that two technicians may edit the same order offline and that arrival-order overwrite loses earlier lines with no record. | 3 | 3 | 9 | Add optimistic versioning or conflict-aware merge semantics; retain immutable edit history; surface conflicts for resolution; test both arrival orders and reconnect timing permutations. | Order Domain Lead | Before server contract freeze |
| R-003 | OPS | A permanently rejected payload can produce an unlimited hot retry loop that consumes device battery and network capacity and can continuously load the server. | Epic 7.3 specifies immediate indefinite retries with no backoff, attempt cap, or dead-letter path. | 3 | 3 | 9 | Classify transient and permanent failures; add bounded exponential backoff with jitter, retry budgets, quarantine/dead-letter handling, operator visibility, and recovery controls. | Mobile Sync Lead and SRE Lead | Before reliability testing |
| R-004 | OPS | A defective release reaches every technician at once and remains active for one to three days while a replacement build clears store review. | Epic 7.4 specifies universal enablement, no feature flag, no staged rollout, and no disable path short of a new reviewed build. | 3 | 3 | 9 | Add a remotely controlled kill switch, staged cohort rollout, release health telemetry, and rollback criteria validated in a production-like rehearsal. | Release Engineering Lead | Before production rollout |
| R-005 | PERF | A full working-day backlog can miss the 30-second recovery objective on fleet hardware, delaying dispatcher visibility and extending duplicate or conflicting work. | Epic 7.3 requires 2,000 queued items to sync within 30 seconds on the fleet's mid-range devices. | 2 | 3 | 6 | Benchmark representative payload distributions on named fleet devices and controlled networks; profile SQLite reads, serialization, batching, and server ingestion; enforce the threshold in device and API performance gates. | Performance Test Lead | Before release candidate |
| R-006 | DATA | The order may be changed, truncated, duplicated, or incompletely persisted across the local queue, upload, server storage, and dispatcher read path, violating the required unchanged result. | Acceptance criteria require an order reaching the server to appear on the dispatcher's console unchanged; Epic 7.1 says the queue stores the full payload. | 2 | 3 | 6 | Define canonical payload equality and stable identifiers; verify field-by-field round trips, transaction atomicity, ordering, duplicate delivery behavior, and server persistence with representative maximum payloads. | Order Platform Lead | Before end-to-end acceptance |

### NFR Planning Matrix

| NFR category | Requirement or gap | Measurable threshold | Planned evidence |
| --- | --- | --- | --- |
| Security | Local queue holds stored card reference and billing address in plaintext. | Required protection level, retention period, backup policy, and acceptable extraction resistance are **UNKNOWN**. Current stated design has no at-rest encryption. | Threat model; Android Keystore and file-system inspection tests; backup/extraction test; secret and PII logging scan; mobile security review. |
| Performance | Sync a full backlog after connectivity returns. | 2,000 queued items complete within 30 seconds on fleet-representative mid-range devices. Device models, payload mix, network profile, server load, and timing boundaries are **UNKNOWN**. | Physical-device benchmark; controlled network profiles; server-side ingestion metrics; p50, p95, and maximum completion time; resource profiling. |
| Reliability | Upload begins automatically on a usable network and completes without technician action. | Trigger latency, durability across process death or reboot, acceptable success rate, retry ceiling, backoff, idempotency, and poison-message handling are **UNKNOWN**. | Android lifecycle and connectivity tests; fault injection; process-kill and reboot recovery; retry telemetry; duplicate-delivery and permanent-rejection tests. |
| Scalability | One device can accumulate 2,000 items. Fleet-wide concurrency is unspecified. | Concurrent reconnecting devices, server throughput, queue growth ceiling, and sustained load target are **UNKNOWN**. | API load and spike tests using the agreed fleet concurrency; database saturation metrics; queue-drain throughput and error rate. |
| Maintainability | No implementation, test framework, telemetry contract, or queue-state diagnostics are supplied. | Coverage, diagnostics, structured logging, and supportability targets are **UNKNOWN**. | CI coverage report; static analysis; queue-state transition tests; structured logs and correlation IDs; support runbook validation. |
| Compliance and privacy | Sensitive billing-related data is copied to local device storage. Data residency and tenant isolation are declared unchanged. | Card-reference classification, applicable PCI/privacy controls, deletion SLA, and audit requirements are **UNKNOWN**. | Security and privacy review; data inventory; retention/deletion tests; tenant-isolation regression; regional-routing regression. |
| Operations | Universal release has no fast disable path. | Disable time is currently one to three days through store review. Required rollback time and alert thresholds are **UNKNOWN**. | Kill-switch rehearsal; staged rollout evidence; release dashboards; alert tests; rollback runbook exercise. |

### Scope Constraints for Regression Coverage

- Preserve single-tenant installation isolation. No shared storage is introduced.
- Preserve regional routing and data residency behavior.
- Preserve the existing billing schedule and avoid calls from the offline-capture path to the billing service.
- Preserve the dispatcher's web-console behavior and the Android order-screen rendering.

### Assumptions and Clarifications Outside the Scored Register

- Define the fleet-representative Android device models, OS versions, available storage, battery state, and network profiles used for the 30-second gate.
- Define when the 30-second timer starts and when sync is considered complete.
- Define queue durability expectations across application kill, device reboot, upgrade, logout, low storage, and SQLite corruption.
- Define server idempotency behavior and stable identifiers for retried queue entries.
- Define edit behavior when sync begins while the technician is modifying a queued order.
- Define telemetry, operator controls, and user-visible states for queued, syncing, rejected, conflicted, and accepted entries.

### Risk Summary

- Four score-9 risks block release: local sensitive-data exposure, silent concurrent-edit data loss, unbounded retry storms, and fleet-wide rollout without rapid disablement.
- Two score-6 risks require mitigation and automated evidence: the 2,000-item performance target and end-to-end payload integrity.
- The first mitigation sequence is security architecture, conflict semantics, retry policy, and release controls. Performance and full-path integrity validation follow on the stabilized design.

## Step 4: Coverage Plan and Execution Strategy

### Priority Criteria

- P0: Critical business, security, data-integrity, or compliance impact with no safe workaround.
- P1: Core, frequent, or complex behavior with material user reach and a limited workaround.
- P2: Secondary behavior with narrower user reach and an acceptable workaround.
- P3: Rare, cosmetic, or experimental behavior with minimal impact and an easy workaround.

### Coverage Matrix

| Test ID | Requirement or risk-driven scenario | Test Level | Priority | Risk Link | Notes |
| --- | --- | --- | --- | --- | --- |
| 7.1-E2E-001 | On a fleet-representative Android device with connectivity disabled, save an existing order with parts and labour lines; verify the device shows the order as captured and the queue survives reopening the app. | E2E | P0 | R-006 | Failure loses a core field-work order. Paper capture and later re-entry is the documented current workaround, but it defeats the epic and risks transcription error. A device flow is required because the user-visible state and local persistence cross the Android UI and SQLite boundary. |
| 7.1-COMP-001 | Persist the complete canonical order payload atomically to SQLite when the sync route reports offline; verify exact field types, nulls, quantities, prices, card reference, and billing address. | Component | P0 | R-006 | Failure silently truncates or changes business and billing data. The repository and real SQLite adapter are the smallest suitable boundary. |
| 7.1-E2E-002 | Inspect application storage after offline capture and prove sensitive queue fields are encrypted, backup-excluded, and unreadable without the application key. | E2E | P0 | R-001 | Failure exposes customer billing data after device loss or extraction, with no safe user workaround. A device-level storage inspection can observe the actual at-rest representation. |
| 7.1-UNIT-001 | Verify queue-state transitions for offline save: draft to queued to captured, including repeated save requests and atomic failure behavior. | Unit | P1 | R-006 | Failure leaves misleading state or duplicate intent. A deterministic state-machine test isolates the branching logic. |
| 7.2-E2E-001 | Edit a queued order before server acceptance; verify the new lines appear immediately and the order remains editable. | E2E | P1 | R-006 | This is a core journey. The technician can recreate the order only through manual re-entry, so the workaround is limited. |
| 7.2-COMP-001 | Verify each pre-acceptance edit appends a distinct immutable queue entry with stable order and edit identifiers, while reconstructing the latest local view exactly. | Component | P0 | R-002, R-006 | Failure can discard audit history or build the wrong outbound state. Real SQLite behavior and repository reconstruction belong at component level. |
| 7.2-E2E-002 | With two offline Android clients editing the same work order, reconnect them in both arrival orders; verify version conflict handling preserves both technicians' work or presents a resolvable conflict with an audit trail. | E2E | P0 | R-002 | Silent loss of parts or labour has critical data and billing impact with no safe workaround. Two real clients and the server are required to observe the cross-device failure mode. |
| 7.2-UNIT-001 | Verify edits are accepted while queued and rejected after the server-accepted state is committed locally. | Unit | P1 | R-006 | A race can allow post-acceptance mutation. Deterministic state transitions provide the fastest complete branch coverage. |
| 7.3-E2E-001 | Restore a usable network after offline capture; verify upload starts without technician action, reaches server acceptance, and clears or archives the local pending state exactly once. | E2E | P0 | R-006 | Failure blocks the epic's core delivery outcome. Waiting or manually recreating the order is the only documented fallback. |
| 7.3-E2E-002 | Round-trip representative minimum, typical, maximum, Unicode, and nullable payloads through SQLite, upload, server persistence, and dispatcher read API; compare against canonical payload equality. | E2E | P0 | R-006 | Failure changes customer orders without a safe workaround. This test spans every transformation boundary while avoiding dispatcher UI coverage that is outside scope. |
| 7.3-COMP-001 | For transient upload failures, verify bounded exponential backoff with jitter and eventual success; for permanent rejection, verify retry-budget exhaustion, quarantine, user state, and operator-visible diagnostics. | Component | P0 | R-003 | The stated immediate infinite retry can drain batteries and overload services. A fake clock and transport double make retry-state assertions deterministic. |
| 7.3-API-001 | Under simulated reconnect traffic, verify permanently rejected items remain within the agreed per-device and fleet request-rate budgets and never starve valid items. | API | P0 | R-003 | Server-facing load is the material operational consequence. An API load harness is the suitable observation point. The exact fleet budget remains a blocker pending definition. |
| 7.3-E2E-003 | On each named mid-range fleet device, sync exactly 2,000 representative queued items within 30 seconds using the agreed network and server-load profile. | E2E | P1 | R-005 | Missing the budget delays a frequent core journey. Eventual sync and waiting provide a limited workaround. Physical-device timing is required because SQLite, CPU, radio, and serialization costs contribute. |
| 7.3-COMP-002 | Exercise queue sizes 0, 1, 1,999, and 2,000; verify deterministic ordering, batching, cursor advancement, and no dropped entries. | Component | P1 | R-005, R-006 | Boundary faults can block or omit a full-day backlog. Component coverage isolates batching and queue traversal without device timing noise. |
| 7.3-API-002 | Replay a previously acknowledged upload and verify the server's idempotency contract prevents duplicate order effects while returning a stable result. | API | P0 | R-003, R-006 | Retries make duplicate delivery a supported condition. Duplicate parts, labour, or order records have critical data impact and no safe technician workaround. |
| 7.4-E2E-001 | Exercise remote disablement on an enabled device; verify new offline captures are safely blocked or routed according to the approved fallback, queued data remains recoverable, and the change takes effect within the rollback target. | E2E | P0 | R-004 | A bad fleet-wide release currently remains active for one to three days. A production-like device and control plane are required to prove recovery. |
| 7.4-API-001 | Validate staged cohort targeting and kill-switch authorization, audit logging, propagation, and fail-safe behavior. | API | P0 | R-004 | Unauthorized or ineffective rollout control preserves the full fleet blast radius. No safe workaround exists during store review. |
| 7.REG-API-001 | Verify offline capture and sync never invoke the billing service and never alter its nightly schedule. | API | P0 | None | The epic explicitly leaves charging unchanged. An accidental call could create financial harm; service-spy or trace evidence provides a direct assertion. |
| 7.REG-API-002 | Verify one installation cannot read or write another installation's queued or accepted orders. | API | P0 | None | Single-tenant isolation is an explicit satisfied constraint. A regression could expose customer data with no safe workaround. |
| 7.REG-API-003 | Verify synced order traffic remains on the existing regional routing path and produces residency evidence for the configured region. | API | P0 | None | Residency is an explicit unchanged control. Cross-region storage would have compliance impact and no user workaround. |
| 7.REG-E2E-001 | Compare the Android order screen before and after enabling offline capture for existing connected-order flows; allow only the specified captured and sync states. | E2E | P2 | None | Rendering is explicitly unchanged outside new status behavior. The connected flow remains usable, so a rollback or prior build is an acceptable temporary workaround. |

No P3 scenarios are planned. Every supported requirement affects a core order path, sensitive data, system integration, or an explicit regression constraint.

### NFR Coverage and Evidence Plan

| NFR category | Planned validation | Expected evidence for later NFR assessment | Blocker or assumption |
| --- | --- | --- | --- |
| Security | Device storage extraction, Keystore behavior, backup exclusion, log and crash-report scanning, tenant-isolation regression. | Device test report, extracted database sample showing ciphertext, backup manifest evidence, security scan, and trace logs. | Required encryption, retention, and card-reference handling policy must be approved. |
| Performance | Physical-device 2,000-item queue drain plus server ingestion profiling. | Per-device timing report with raw samples, p50, p95, maximum, CPU, memory, battery, network, API latency, and server throughput. | Named devices, payload distribution, network profile, server load, and timer boundaries must be defined. |
| Reliability | Connectivity transition, lifecycle recovery, bounded retry, permanent rejection, idempotency, and fault injection. | Component results, device traces, retry metrics, quarantine records, API results, and recovery logs. | Restart and reboot durability, retry ceilings, and poison-message policy must be defined. |
| Scalability | Concurrent fleet reconnect load and spike profile with 2,000 items per device where applicable. | Load-test summary, request rate, queue-drain throughput, database saturation, error rate, and recovery time. | Concurrent device count and acceptable server budgets are unknown. |
| Maintainability | Queue-state unit coverage, component coverage, static analysis, dependency scan, structured logs, and trace correlation. | CI coverage and analysis reports, dependency scan, log schema, and diagnostic runbook exercise. | Coverage and observability thresholds are unknown beyond the plan's quality gate. |
| Compliance and privacy | Data inventory review, retention and deletion validation, residency regression, and tenant isolation. | Approved privacy and security review, deletion test output, routing traces, and isolation test output. | Applicable PCI and privacy classifications, deletion SLA, and audit requirements are unknown. |
| Operations | Kill-switch, staged cohort rollout, propagation, audit, alerts, and recovery rehearsal. | Rollout rehearsal report, control-plane audit log, alert evidence, and measured disable time. | Required rollback time and alert thresholds are unknown. |

### Execution Strategy

- PR: Run all unit and component tests, API contract and regression tests, and one Android offline-capture and reconnect smoke flow. Keep the suite below 15 minutes through deterministic fakes, isolated SQLite files, and one emulator profile.
- Nightly: Run the full Android device-flow matrix, two-client conflict permutations, payload round trips, lifecycle and network fault injection, security storage inspection, and the 2,000-item benchmark on the primary fleet device.
- Weekly: Run all fleet device and OS profiles, concurrent reconnect load and spike tests, endurance and battery profiling, static and dependency security scans, and rollback or kill-switch rehearsal in a production-like environment.

### Resource Estimate

| Priority | Estimated test engineering effort | Scope |
| --- | --- | --- |
| P0 | About 120 to 180 hours | Security, data integrity, concurrency, retry controls, end-to-end sync, rollout controls, and regression constraints. |
| P1 | About 50 to 80 hours | Editing, state transitions, batching boundaries, and fleet-device performance. |
| P2 | About 8 to 16 hours | Connected-flow rendering regression. |
| P3 | 0 hours | No P3 scenarios are supported by the supplied scope. |
| Total | About 178 to 276 hours | Automation, harnesses, device execution, load evidence, diagnostics, and reporting. |

With two test engineers and timely access to app builds, server environments, fleet devices, and approved contracts, the expected elapsed time is about 4 to 7 weeks. Security architecture changes, conflict semantics, retry policy, or rollout-control implementation can extend that timeline.

### Quality Gates

- P0 pass rate is 100 percent.
- P1 pass rate is at least 95 percent, with every failure triaged and owned.
- Every acceptance criterion has one or more traceable planned scenarios. Implemented requirements and risk coverage reach at least 80 percent before release, with 100 percent coverage for P0 requirements.
- All score-6 and score-9 mitigations are implemented and supported by the planned evidence before release. No score-9 risk remains open.
- The 2,000-item backlog completes within 30 seconds on every agreed gate device and environment profile.
- Sensitive queue fields are encrypted at rest and are absent from backups, logs, screenshots, crash reports, and diagnostic exports.
- Concurrent offline edits produce preserved work or an explicit, auditable conflict. No silent line loss is permitted.
- Permanent failures stop within the approved retry budget, enter a recoverable quarantine path, and emit operator-visible diagnostics.
- Remote disablement and staged rollout are proven within the approved rollback target before fleet release.
- Billing non-invocation, tenant isolation, regional routing, and unchanged dispatcher payload assertions pass.
- Evidence sources are identified for every in-scope NFR. Final NFR PASS, CONCERNS, or FAIL decisions are deferred to the NFR assessment workflow after implementation evidence exists.

## Step 5: Generate Output and Validate

- Resolved execution mode: `subagent`, selected by automatic capability probing and used as one worker for the single epic artifact.
- Output: `/private/tmp/remaining-skills-evidence/test-design-cli-after/field-order-capture/.tea-runs/tea-test-design-U0s5Ut/attempt-1/artifacts/test-design/test-design-epic-7.md`
- Template: `test-design-template.md`
- Checklist: `checklist.md`
- Risk result: Six unique scored risks. Four score 9 and two score 6. Every risk has a mitigation, owner, timeline, residual-risk statement, and exact coverage links.
- Coverage result: 21 atomic scenarios. Fifteen are P0, five are P1, one is P2, and none are P3. The high P0 share is retained because each row covers an independent critical security, data, compliance, financial, or recovery condition with no source-supported safe workaround.
- NFR result: Security, performance, reliability, scalability, maintainability, compliance and privacy, and operations have planned validations and evidence artifacts. Unknown thresholds remain explicit blockers or dependencies.
- Validation result: Passed template structure, canonical risk and coverage table headers, risk-score arithmetic, risk-reference presence, interval estimates, entry and exit gates, regression scope, and placeholder scan.
- Browser-session check: Passed. No browser exploration was configured or started.
- Temporary-artifact check: Passed. Workflow artifacts are confined to the requested `test-design` directory.
- Completion hook: Skipped because the supplied `on_complete` value is empty.
