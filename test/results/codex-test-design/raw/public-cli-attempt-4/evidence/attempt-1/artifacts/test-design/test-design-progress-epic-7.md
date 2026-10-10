---
runScope: 'epic'
runKey: 'epic-7'
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-10-09T21:59:22-0500'
inputDocuments:
  - '/private/tmp/remaining-skills-evidence/test-design-cli-final/field-order-capture/docs/epic-7.md'
  - '/private/tmp/tea-test-design-final-codex/skills/bmod-tea/knowledge/risk-governance.md'
  - '/private/tmp/tea-test-design-final-codex/skills/bmod-tea/knowledge/probability-impact.md'
  - '/private/tmp/tea-test-design-final-codex/skills/bmod-tea/knowledge/test-levels-framework.md'
  - '/private/tmp/tea-test-design-final-codex/skills/bmod-tea/knowledge/test-priorities-matrix.md'
  - '/private/tmp/tea-test-design-final-codex/skills/bmod-tea/knowledge/nfr-criteria.md'
---

# Test Design Progress: Epic 7

## Step 1: Detect Mode and Prerequisites

- Mode: Epic-level
- Run scope: `epic`
- Run key: `epic-7`
- Epic number: `7`
- Requirements input: `docs/epic-7.md`
- Prerequisite result: Passed. The supplied epic contains four stories and acceptance criteria.
- Checkpoint state: Fresh run.

## Step 2: Load Context and Knowledge Base

### Configuration

- `tea_use_playwright_utils`: `true`
- `tea_use_pactjs_utils`: `true`
- `tea_pact_mcp`: `mcp`
- `tea_browser_automation`: `none`
- `test_stack_type`: `auto`
- `test_artifacts`: `/private/tmp/remaining-skills-evidence/test-design-cli-final/field-order-capture/.tea-runs/tea-test-design-rff3mz/attempt-1/artifacts`
- Detected stack: Mobile, based on the supplied requirement that the client is a native Android application. The repository contains no implementation manifest that identifies the Android build system or language.

### Loaded Requirements and Context

- `docs/epic-7.md`: Four offline order-capture stories, four acceptance criteria, explicit Android and server integration context, and security, data-integrity, performance, reliability, and release-operability constraints.
- No other requirement documents were discovered or loaded.
- No prior system-level test design exists in the configured artifact locations.

### Existing Coverage Analysis

- No source files, test folders, test specifications, fixtures, or test framework configuration were found outside the supplied document and this run's artifacts.
- Existing automated coverage: None evidenced.
- Existing fixture patterns: None evidenced.
- Flaky areas: No test history exists to assess flakiness.
- Known coverage gap: Every Epic 7 acceptance criterion and NFR needs new automated coverage.
- Browser exploration: Skipped because `tea_browser_automation` is `none` and the epic has no browser or web-view surface.

### Knowledge Selection

- Loaded `risk-governance.md`.
- Loaded `probability-impact.md`.
- Loaded `test-levels-framework.md`.
- Loaded `test-priorities-matrix.md`.
- Loaded `nfr-criteria.md` because the epic contains security, performance, reliability, data-integrity, and operational requirements.
- Pact fragments were excluded because the repository contains no Pact artifacts, dependency, configuration, broker variable, or explicit contract-testing request.

### Testable Requirements and Integration Points

- Persist a complete order locally while offline and show it as captured.
- Permit edits until server acceptance and preserve the intended order state.
- Detect restored connectivity and upload without technician action.
- Preserve the order unchanged through server persistence and dispatcher-console retrieval.
- Synchronize 2,000 queued items within 30 seconds on representative mid-range fleet devices.
- Protect stored card references and billing addresses held in the local queue.
- Handle permanent and transient upload failures without unbounded request storms or battery and network exhaustion.
- Prevent silent lost updates when two offline technicians edit the same work order.
- Provide a recoverable release control because store review delays rollback by one to three days.
- Integration points: Android order editor, SQLite outbound queue, operating-system network callback, sync worker, server order endpoint and persistence layer, and dispatcher web-console read path.

## Step 3: Risk and NFR Planning Assessment

### Scoring Model

- Probability: 1 unlikely, 2 possible, 3 likely.
- Impact: 1 minor, 2 degraded, 3 critical.
- Score: Probability multiplied by impact.
- Score 6 or greater requires mitigation. Score 9 blocks release until resolved or formally waived.

### High Risks, Score 6 or Greater

| Risk ID | Category | Description | Source Evidence | Probability | Impact | Score | Mitigation | Owner | Timeline |
| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| R-001 | SEC | Sensitive payment and address data can be recovered from a lost, stolen, rooted, backed-up, or forensically inspected device because the queue stores the full order payload in a plain SQLite file with no encryption at rest. | Epic 7.1 states that the queue includes the stored card reference and billing address, is not encrypted at rest, and relies only on the device screen lock. | 3 | 3 | 9 | Encrypt queue data with Android Keystore-backed keys, exclude it from backups, minimize retained sensitive fields, verify deletion after acknowledgment, and add device-level extraction tests plus a security review. | Mobile security lead | Before implementation acceptance and release candidate |
| R-002 | DATA | Concurrent offline edits can silently overwrite another technician's accepted work, causing irreversible loss of parts and labour lines with no audit record. | Epic 7.2 states that the server applies edits by arrival order with no version or timestamp check and that the earlier technician's lines are lost without a record. | 3 | 3 | 9 | Add optimistic concurrency or conflict detection, retain immutable revision history, define a deterministic merge or user-resolution policy, and test both arrival orders. | Order platform lead | Before implementation acceptance |
| R-003 | OPS | A permanently rejected payload can create an unlimited tight retry loop that consumes battery and bandwidth and can overload the server for as long as the app runs. | Epic 7.3 specifies immediate indefinite retries with no backoff, attempt cap, or dead-letter path. | 3 | 2 | 6 | Classify transient and permanent failures, use bounded exponential backoff with jitter, cap attempts, quarantine poison payloads, surface recovery state, and emit retry metrics and alerts. | Mobile sync lead and SRE | Before performance testing |
| R-004 | PERF | A full offline-day backlog may miss the 30-second recovery target, delaying dispatch visibility and creating duplicate or partial processing pressure. | Epic 7.3 requires up to 2,000 queued items to finish syncing within 30 seconds on actual mid-range fleet devices. | 2 | 3 | 6 | Establish a representative device and network benchmark, batch and compress safely, measure end-to-end server acceptance, and gate the release on repeated 2,000-item runs within 30 seconds. | Performance engineer and mobile lead | Before release candidate |
| R-005 | OPS | A severe production defect affects every technician at once and remains active for one to three days because the feature launches globally with no feature flag, staged rollout, or remote disable control. | Epic 7.4 specifies universal enablement in one release and says remediation requires a new store-reviewed build taking one to three days. | 3 | 3 | 9 | Add a remotely controlled kill switch, staged cohort rollout, compatibility-safe queue migration, rollback runbook, monitoring gates, and a tested disable path that preserves queued data. | Release engineering lead and product owner | Before production rollout |

### Medium Risks, Score 3 to 4

No medium risks are supported as distinct failure mechanisms by the supplied Epic 7 evidence.

| Risk ID | Category | Description | Source Evidence | Probability | Impact | Score | Mitigation | Owner | Timeline |
| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |

### Low Risks, Score 1 to 2

No low risks are supported as distinct failure mechanisms by the supplied Epic 7 evidence.

| Risk ID | Category | Description | Source Evidence | Probability | Impact | Score | Mitigation | Owner | Timeline |
| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |

### NFR Planning

| NFR Category | Scope and Threshold | Planned Evidence | Gap or Linked Risk |
| --- | --- | --- | --- |
| Security | Queue confidentiality threshold: UNKNOWN. Current design explicitly uses unencrypted SQLite while storing a card reference and billing address. | Android device extraction test, backup-exclusion inspection, Keystore configuration review, dependency and mobile application security scans, deletion-after-acknowledgment test. | R-001. Clarify the required encryption standard, key lifecycle, retention period, and permitted local fields. |
| Performance | A queue of 2,000 items must fully sync within 30 seconds after usable connectivity returns on representative mid-range fleet devices. | Repeated instrumented device benchmark across controlled network profiles, server acceptance timestamps, p50, p95, and maximum completion duration, CPU, memory, battery, and bytes transferred. | R-004. Define the exact representative device models, network profile, warm-up, run count, percentile gate, and server load conditions. |
| Reliability | Upload begins without technician action when the OS reports usable connectivity. Retry safety thresholds are UNKNOWN. | Android instrumentation tests for disconnect and reconnect, process death and restart, transient and permanent server errors, idempotency, retry scheduling, poison payload quarantine, and telemetry assertions. | R-003. Define retry ceilings, backoff bounds, timeouts, acceptable duplicate rate, acceptable loss rate, and recovery SLO. |
| Data integrity | Server and dispatcher console must receive an order unchanged. Conflict preservation threshold should be zero silent lost updates. | Payload canonicalization checks, queue persistence integration tests, end-to-end Android-to-server-to-console comparison, concurrent technician conflict tests, revision-history assertions. | R-002. Define authoritative merge and conflict-resolution semantics. |
| Scalability | Explicit client backlog boundary is 2,000 items. Concurrent fleet and server throughput threshold: UNKNOWN. | Multi-device load test against the sync endpoint, database saturation metrics, queue depth and drain-rate telemetry. | R-004. Define concurrent reconnect storm size and server resource limits. |
| Operability | Remote disable and rollback recovery thresholds: UNKNOWN. Current release requires a one-to-three-day store cycle. | Kill-switch drill, staged rollout evidence, rollback rehearsal, alert and dashboard assertions, queued-data compatibility test across versions. | R-005. Define detection time, disable time, rollout cohorts, and rollback decision thresholds. |
| Maintainability | Coverage, code quality, migration safety, logging, and ownership thresholds: UNKNOWN. | CI coverage and static-analysis reports, schema-migration tests, structured log and metric contract tests, runbook review. | Clarification item. Define coverage gates, queue schema compatibility policy, and observability ownership. |
| Compliance and residency | The epic states data residency remains enforced by an unchanged regional routing layer. No new compliance threshold is named. | Regression assertion that sync requests remain region-routed and cross-installation access remains impossible. Review local storage of payment-related data with the security and compliance owners. | R-001 for local sensitive data. Regional routing and single-tenant isolation are stated constraints to preserve. |

### Scope Constraints and Regression Assertions

- The native Android order screen rendering is unchanged. Cover the existing captured-state presentation only where required by the acceptance criteria.
- The dispatcher web console implementation is unchanged. Use it as an end-to-end observation point for payload fidelity.
- Billing timing and charging behavior are unchanged. Assert that offline capture and sync make no billing-service call.
- Each installation remains single-tenant with separate storage. Assert that sync cannot address or read another installation.
- Regional routing remains unchanged. Assert that the sync endpoint stays within the configured region.

### Risk Summary

- Release blockers: R-001, R-002, and R-005.
- Mandatory mitigations: R-003 and R-004.
- First priority is prevention of irreversible data exposure and data loss. Second priority is bounded recovery behavior. Third priority is proof of the 2,000-item performance target under representative conditions.

## Step 4: Coverage Plan and Execution Strategy

### Priority Criteria

- P0: Critical business, security, data-integrity, or compliance impact with no safe workaround.
- P1: Core, frequent, or complex behavior with material user reach and a limited workaround.
- P2: Secondary behavior with narrower user reach and an acceptable workaround.
- P3: Rare, cosmetic, or experimental behavior with minimal impact and an easy workaround.

### Coverage Matrix

| Test ID | Requirement or Risk-Driven Scenario | Test Level | Priority | Risk Link | Notes |
| --- | --- | --- | --- | --- | --- |
| 7.1-E2E-001 | With all connectivity disabled, a technician opens an existing work order, adds parts and labour, saves, and sees the order listed as captured. | E2E | P1 | None | Core offline journey. Failure forces the documented paper and re-key workaround, which preserves work with material delay and error risk. Native Android instrumentation or Maestro is suitable because the user-visible device workflow crosses UI and local persistence. |
| 7.1-INT-001 | The offline save writes one complete, schema-valid outbound queue record containing every order field required by the server. | Integration | P1 | None | Validates the order service to SQLite boundary without duplicating the user-state assertion. |
| 7.1-INT-002 | A captured order and its queue record survive app process death, device restart, and application relaunch before sync. | Integration | P1 | None | Durability is required for hours-long offline work. The epic provides no separate recovery path if local state disappears. |
| 7.1-INT-003 | The SQLite file, Android backup, logs, crash reports, and temporary files contain no plaintext stored card reference or billing address. | Integration | P0 | R-001 | Security-critical local storage has no safe workaround after device loss. Device-level file and backup inspection is the direct evidence source. |
| 7.1-UNIT-001 | Queue encryption, key-unavailable handling, sensitive-field minimization, and delete-after-acknowledgment logic cover success and failure branches. | Unit | P0 | R-001 | Fast deterministic coverage isolates the security state machine. It complements the device extraction test without repeating it. |
| 7.2-E2E-001 | A queued order remains editable before server acceptance and becomes non-editable or transitions according to the accepted-state policy after acknowledgment. | E2E | P1 | None | Core user journey. Paper re-keying is the documented fallback before sync. Accepted-state behavior needs a product decision if continued edits are intended. |
| 7.2-INT-001 | Each pre-sync edit appends a new queue entry, preserves prior entries, and reconstructs the technician's latest intended order in deterministic sequence. | Integration | P1 | None | Covers SQLite ordering and reconstruction at the persistence boundary. |
| 7.2-API-001 | Two technicians edit the same work order offline and sync in both arrival orders. The server detects the conflict, preserves both revisions, and prevents silent line loss. | API | P0 | R-002 | Irreversible labour and parts loss has no source-supported recovery path. API coverage directly exercises concurrency control and revision persistence. |
| 7.2-E2E-002 | After a concurrent conflict, the affected technicians or dispatcher can resolve it through the defined policy and the final console order retains an audit trail. | E2E | P0 | R-002 | Cross-system validation proves that the conflict response is usable and that lost data remains recoverable. |
| 7.3-E2E-001 | Restoring a usable network automatically starts upload with no technician action. The captured state transitions only after server acceptance. | E2E | P1 | None | Core reconnect journey. The existing paper process is a limited fallback, with delayed dispatch visibility. |
| 7.3-INT-001 | A transient timeout or retryable server error follows bounded exponential backoff with jitter, resumes after process restart, and eventually uploads once accepted. | Integration | P1 | R-003 | Scheduler and persistence integration provide deterministic timing evidence. |
| 7.3-API-001 | A permanently invalid payload stops after the configured attempt or age limit, enters quarantine, avoids further server traffic, and exposes a recoverable diagnostic state. | API | P1 | R-003 | Direct API and worker assertions prove protection from a request storm. The epic states no current recovery path, so the business recovery threshold remains unresolved. |
| 7.3-E2E-002 | A 2,000-item backlog fully reaches server acceptance within 30 seconds on each representative mid-range fleet device under the approved network and server-load profile. | E2E | P1 | R-004 | The explicit threshold is a release acceptance target. The epic does not state a critical deadline, permanent loss, or blocked essential operation when 30 seconds is missed. Performance instrumentation belongs in notes while the canonical level remains E2E. |
| 7.3-INT-002 | Interrupted batch sync resumes from durable state without missing or duplicating accepted order mutations. | Integration | P0 | R-002 | Data-integrity failure can silently alter billable work. Server idempotency keys and client acknowledgment boundaries are exercised together. |
| 7.3-E2E-003 | The complete synced order appears on the dispatcher's web console unchanged, including line order, quantities, labour, addresses, and supported characters. | E2E | P0 | R-002 | Acceptance criterion with critical data-integrity impact. This validates the Android-to-server-to-console path without changing the console. |
| 7.3-API-002 | Sync requests remain within the configured regional route and cannot read or write another installation's data. | API | P0 | R-001 | Preserves explicit residency and single-tenant constraints. Cross-installation data access has security and compliance impact with no safe workaround. |
| 7.3-API-003 | Offline capture and sync do not invoke the billing service or change charging timing. | API | P2 | None | The epic states billing is unchanged and out of scope. A contract-spy regression has narrow reach and the existing nightly billing schedule remains the recovery context. |
| 7.3-UNIT-001 | Queue selection, acknowledgment, idempotency-key creation, retry classification, and state transitions cover empty, one-item, 2,000-item, malformed, transient-failure, and permanent-failure boundaries. | Unit | P1 | R-003 | Isolates branch-heavy sync logic for fast PR feedback. |
| 7.4-E2E-001 | A remote kill switch disables new offline capture and sync safely while preserving already queued data for later recovery. | E2E | P0 | R-005 | A fleet-wide defect otherwise persists through the documented one-to-three-day store review. Cross-system device behavior makes E2E suitable. |
| 7.4-INT-001 | Staged rollout targeting, configuration expiry, default-safe behavior, and queue schema compatibility work across old and new application versions. | Integration | P0 | R-005 | Validates the operational control and rollback compatibility at configuration and persistence boundaries. |
| 7.4-E2E-002 | A rollback drill detects a release fault, stops cohort expansion, activates the disable control within the agreed threshold, and recovers queued data after remediation. | E2E | P0 | R-005 | Proves the full operational recovery path. The disable-time threshold is currently UNKNOWN and must be defined before execution. |
| 7.NFR-INT-001 | Sync telemetry records queue depth, drain rate, retry reason, attempt count, payload quarantine, server acceptance latency, and correlation identifiers without sensitive fields. | Integration | P1 | R-003, R-004 | Supplies reliability and performance evidence while preventing R-001 leakage. |
| 7.NFR-INT-002 | Queue schema migrations preserve queued orders across supported app upgrades and rollback-compatible versions. | Integration | P1 | R-005 | Supports maintainability and release recovery. Supported version span is a required clarification. |

### Coverage Distribution

| Priority | Scenario Count | Rationale |
| --- | ---: | --- |
| P0 | 10 | Security exposure, silent data loss, tenant isolation, and fleet-wide release recovery have critical impact with no safe source-supported workaround. |
| P1 | 12 | These scenarios cover the core offline journey, complex synchronization, bounded retries, observability, and the 30-second target. The source documents material degradation and limited manual fallback for capture. |
| P2 | 1 | Billing non-interaction is an out-of-scope regression guard with narrow change exposure. |
| P3 | 0 | The supplied epic contains no cosmetic, experimental, or trivial behavior. |
| Total | 23 | Every acceptance criterion and every R-001 through R-005 risk has planned coverage. |

### NFR Coverage and Evidence Plan

| NFR Category | Planned Validation | Expected Evidence for Later NFR Assessment | Missing Threshold or Blocker |
| --- | --- | --- | --- |
| Security | Keystore-backed queue encryption, backup exclusion, sensitive-data minimization, deletion, log and crash-report inspection, tenant isolation. | Device file-system inspection report, security test results, key configuration review, scan reports, cross-tenant API results. | Encryption algorithm, key rotation, retention, and permitted local fields are UNKNOWN. R-001 blocks release until resolved. |
| Performance | Repeated 2,000-item end-to-end sync runs on fleet-representative devices and approved network profiles. | Raw timestamps, percentile report, device CPU, memory, battery, byte counts, server throughput and saturation metrics. | Device models, network profile, run count, percentile rule, and server load are UNKNOWN. |
| Reliability | Disconnect and reconnect, process death, transient failure, poison payload, bounded retry, durable resume, idempotency, and telemetry tests. | Instrumentation reports, scheduler traces, retry metrics, quarantine record, duplicate and loss counts. | Backoff bounds, attempt or age cap, timeouts, duplicate limit, loss limit, and recovery SLO are UNKNOWN. |
| Data integrity | Concurrent-edit conflict tests, interrupted batch recovery, canonical payload comparison through the dispatcher console. | Revision records, conflict results, payload hashes or canonical diffs, idempotency audit, zero-loss assertions. | Merge policy and accepted-state editing policy are UNKNOWN. |
| Scalability | Multi-device reconnect-storm test plus the 2,000-item client benchmark. | Server latency and error percentiles, database utilization, queue drain rate, accepted throughput. | Concurrent device count and infrastructure ceilings are UNKNOWN. |
| Operability | Staged rollout, kill switch, rollback drill, version compatibility, alerting. | Configuration audit, drill timeline, dashboard and alert captures, queued-data recovery report. | Disable-time target, rollout cohorts, alert thresholds, and supported rollback versions are UNKNOWN. R-005 blocks release until controls exist. |
| Maintainability | Unit coverage of sync state machine, schema migration tests, static analysis, structured telemetry contract. | CI coverage report, static-analysis report, migration matrix, runbook approval. | Coverage target uses 80% overall and 90% for queue and sync core pending team ratification. Ownership thresholds remain UNKNOWN. |
| Compliance and residency | Region-routing and tenant-isolation regression, plus review of locally stored payment-related data. | Routing test results, tenant-isolation results, security or compliance approval record. | Applicable payment and privacy control set is UNKNOWN. |

### Execution Strategy

- PR: Unit, API, and deterministic integration suites. Include one offline-capture device smoke path when the total remains under 15 minutes. Run P0 first, then P1 and P2.
- Nightly: Full Android device matrix, process-death and reconnect suites, both concurrent-edit arrival orders, security extraction checks, schema migrations, poison-payload recovery, and 2,000-item benchmark on one representative device.
- Weekly: Full representative device and network performance matrix, concurrent reconnect-storm load, endurance and battery testing, security scans, and rollback or kill-switch drills in a production-like environment.
- Quarantine policy: A failing or flaky P0 test remains release-blocking. Repair test determinism at its source. Do not mute the assertion or exclude the test from the gate.

### Resource Estimates

| Priority | Estimated Effort |
| --- | --- |
| P0 | Approximately 50 to 80 hours |
| P1 | Approximately 55 to 90 hours |
| P2 | Approximately 3 to 6 hours |
| P3 | 0 hours |
| Total | Approximately 108 to 176 hours |

Expected elapsed setup and implementation time is approximately 3 to 5 weeks with mobile, backend, security, and performance work proceeding in parallel. This range includes test data builders, controlled network profiles, representative devices, server instrumentation, and release-control fixtures.

### Quality Gates

- P0 pass rate is 100%.
- P1 pass rate is at least 95%, with no failure that compromises an acceptance criterion.
- Every high risk, R-001 through R-005, has completed mitigation and passing linked evidence before release.
- Requirements and risk traceability is 100% for all Epic 7 acceptance criteria and canonical risks.
- Overall automated code coverage is at least 80%. Queue, conflict, retry, and sync state-machine coverage is at least 90% pending ratification.
- Device extraction finds zero plaintext card references and billing addresses in queue-related storage, backups, logs, crash reports, or temporary files.
- Concurrent offline edits produce zero silent lost updates and retain an auditable resolution record.
- Each approved representative device completes a 2,000-item sync within 30 seconds under the defined profile for every required gate run.
- Permanent failures create no requests after the configured retry or age ceiling. Transient retries follow the approved bounded backoff policy.
- A tested remote-disable and rollback path preserves queued data and meets the defined disable-time threshold.
- Each in-scope NFR category has an identified evidence artifact. Final NFR PASS, CONCERNS, or FAIL assessment is deferred until implementation evidence exists.

## Step 5: Generate Output and Validate

- Execution mode: Sequential. Epic-level mode produces one artifact with a single-worker default.
- Output: `/private/tmp/remaining-skills-evidence/test-design-cli-final/field-order-capture/.tea-runs/tea-test-design-rff3mz/attempt-1/artifacts/test-design/test-design-epic-7.md`
- Template: `test-design-template.md`
- Checklist: `checklist.md`
- Validation result: Passed for epic-level scope.
- Risk validation: Five unique canonical risks, R-001 through R-005. All scores equal probability multiplied by impact. Every risk has mitigation, owner, timeline, verification, and residual risk.
- Coverage validation: 23 atomic scenarios. Every coverage row has one canonical test level. Every material risk maps to suitable coverage using its exact canonical ID.
- Priority validation: P0, P1, P2, and P3 criteria are preserved independently of execution timing. Empty P3 coverage is explained outside its table.
- NFR validation: Eight in-scope categories include thresholds, UNKNOWN gaps, planned validation, and later evidence sources. Final NFR status is deferred to `nfr-assess`.
- Execution validation: PR, nightly, and weekly strategy is concise and separate from priority.
- Estimate validation: Every effort and timeline value uses a range where work exists.
- Quality gate validation: P0 is 100%, P1 is at least 95%, overall coverage is at least 80%, all high-risk mitigations are required, and each NFR has planned evidence.
- Formatting validation: Required template sections are present, no unresolved placeholders remain, risk and coverage schemas are preserved, and no orphaned browser or temporary artifacts exist.
- Inputs: The supplied epic remained unchanged. No tests were generated.
- Open clarifications: The final design lists every missing NFR threshold and assigns resolution through entry criteria and dependencies.

