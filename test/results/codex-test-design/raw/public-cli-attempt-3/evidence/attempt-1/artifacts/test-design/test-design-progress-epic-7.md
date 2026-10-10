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
  - '/private/tmp/remaining-skills-evidence/test-design-cli-schema-recovery/field-order-capture/docs/epic-7.md'
  - '/private/tmp/remaining-skills-frozen/test-design-schema-recovery/skills/bmod-tea/knowledge/risk-governance.md'
  - '/private/tmp/remaining-skills-frozen/test-design-schema-recovery/skills/bmod-tea/knowledge/probability-impact.md'
  - '/private/tmp/remaining-skills-frozen/test-design-schema-recovery/skills/bmod-tea/knowledge/test-levels-framework.md'
  - '/private/tmp/remaining-skills-frozen/test-design-schema-recovery/skills/bmod-tea/knowledge/test-priorities-matrix.md'
  - '/private/tmp/remaining-skills-frozen/test-design-schema-recovery/skills/bmod-tea/knowledge/nfr-criteria.md'
---

# Test Design Progress: Epic 7

## Step 1: Mode and prerequisites

- Mode: Epic-Level
- Design level: full
- Run scope: `epic`
- Run key: `epic-7`
- Epic number: `7`
- Project: `field-order-capture`
- Required input: `docs/epic-7.md`
- Prerequisite result: passed. The supplied epic contains story requirements and acceptance criteria.
- Checkpoint state: fresh run

## Step 2: Loaded context

### Configuration

- `tea_use_playwright_utils`: `true`
- `tea_use_pactjs_utils`: `true`
- `tea_pact_mcp`: `mcp`
- `tea_browser_automation`: `none`
- `test_stack_type`: `auto`
- `test_artifacts`: `/private/tmp/remaining-skills-evidence/test-design-cli-schema-recovery/field-order-capture/.tea-runs/tea-test-design-dGvHaV/attempt-1/artifacts`

### Stack and coverage discovery

- Repository stack indicators: none
- Evidence-backed target: native Android client with a server sync boundary
- Existing automated tests, fixtures, and test patterns: none found
- Prior system-level test-design outputs: none found
- Browser exploration: skipped because browser automation is `none` and the epic has no browser surface
- Contract-testing knowledge: skipped because the repository contains no Pact artifacts, dependencies, configuration, or broker variables and the run does not request contract testing

### Loaded requirement and knowledge inputs

- Supplied epic: `docs/epic-7.md`
- Required epic-level knowledge: risk governance, probability-impact scoring, test-level selection, and test priorities
- NFR knowledge: loaded because the epic contains security, performance, reliability, and operational requirements

### Extracted context

- Functional scope: offline capture, pre-sync editing, automatic synchronization, and unchanged server representation
- Integration points: Android local SQLite queue, operating-system connectivity signal, order upload API, server persistence, and dispatcher web-console observation
- Explicit threshold: a 2,000-item backlog must synchronize within 30 seconds on fleet-representative mid-range devices
- Known design gaps: plaintext sensitive data at rest, append-only edits, last-arrival overwrite without conflict detection, unbounded immediate retries, and an all-at-once release with a one-to-three-day rollback path

## Step 3: Risk and testability assessment

### Scoring model

- Probability: 1 unlikely, 2 possible, 3 likely
- Impact: 1 minor, 2 degraded, 3 critical
- Score: probability multiplied by impact
- Actions: 1 to 2 DOCUMENT, 3 to 4 MONITOR, 6 to 8 MITIGATE, 9 BLOCK

### High risks, score 6 or greater

| Risk ID | Category | Description | Source Evidence | Probability | Impact | Score |
| --- | --- | --- | --- | ---: | ---: | ---: |
| R-001 | SEC | Theft, loss, backup extraction, or device compromise can expose a stored card reference, billing address, and full order payload because the local queue is plaintext and the screen lock is its only protection. | Story 7.1 states that the SQLite queue contains these fields, is unencrypted at rest, and relies only on the device screen lock. | 3 | 3 | 9 |
| R-002 | DATA | Concurrent offline edits can silently erase a technician's lines, leaving the server and dispatcher with an incomplete order and no audit record of the lost data. | Story 7.2 states that two technicians may edit the same order offline, the server performs no version or timestamp check, and later arrival overwrites earlier work without a record. | 3 | 3 | 9 |
| R-003 | OPS | A permanently rejected payload can enter a tight, endless upload loop that consumes device power and data, loads the server, and prevents a terminal resolution for the queued order. | Story 7.3 specifies immediate indefinite retry with no backoff, attempt cap, or dead-letter path. | 3 | 3 | 9 |
| R-004 | PERF | A full offline-day backlog may exceed the required recovery window, delaying dispatch visibility and leaving technicians with a prolonged pending queue. | Story 7.3 requires up to 2,000 queued items to finish syncing within 30 seconds on fleet-representative mid-range devices. | 2 | 3 | 6 |
| R-005 | OPS | A severe production defect reaches every technician at once and remains active during the one-to-three-day store review window because runtime disablement and staged exposure are unavailable. | Story 7.4 specifies universal enablement in one release, no feature flag, no staged rollout, and no disable path short of a new store build. | 2 | 3 | 6 |

### Medium risks, score 3 to 4

No distinct medium risks were identified from the supplied epic after consolidation.

| Risk ID | Category | Description | Source Evidence | Probability | Impact | Score |
| --- | --- | --- | --- | ---: | ---: | ---: |

### Low risks, score 1 to 2

No distinct low risks were identified from the supplied epic after consolidation.

| Risk ID | Category | Description | Source Evidence | Probability | Impact | Score |
| --- | --- | --- | --- | ---: | ---: | ---: |

### Risk mitigations

| Risk ID | Required mitigation | Owner | Timeline |
| --- | --- | --- | --- |
| R-001 | Encrypt the outbound store with platform-backed keys, minimize retained payment and address fields, prevent backup and log leakage, and verify secure deletion after server acceptance. | Mobile engineering and security | Architecture decision before implementation; automated device evidence before release |
| R-002 | Add optimistic concurrency or a merge protocol, preserve immutable revision history, surface conflicts to technicians, and retain an auditable record for every submitted edit. | Order platform engineering and product | Protocol decision before implementation; conflict suite green before release |
| R-003 | Classify transient and permanent failures, add capped exponential backoff with jitter, provide quarantine or dead-letter handling, expose technician-visible state, and emit retry telemetry. | Mobile engineering, API engineering, and SRE | Retry policy before implementation; resilience and soak evidence before release |
| R-004 | Define a representative device and network profile, batch uploads safely, instrument queue-drain timing, and prove the 2,000-item backlog completes within 30 seconds with zero loss. | Mobile performance engineering and API engineering | Baseline during implementation; release-candidate performance gate |
| R-005 | Add a remotely controlled kill switch and staged rollout cohorts with monitoring and rollback criteria. | Release engineering and product operations | Available and rehearsed before production enablement |

### NFR validation plan

| NFR category | Threshold or current constraint | Planned evidence | Linked risk |
| --- | --- | --- | --- |
| Security | Acceptable at-rest protection and data minimization threshold: **UNKNOWN**. Current design stores sensitive fields in plaintext. | Threat model; Android storage and backup configuration review; physical-device extraction test; log and post-sync deletion checks | R-001 |
| Performance | A 2,000-item backlog completes within 30 seconds on a representative mid-range fleet device after connectivity returns. | Instrumented physical-device benchmark with controlled network profiles; server timing and queue-depth metrics; repeated percentile report | R-004 |
| Reliability | Queue upload begins without technician action when the operating system reports a usable network. Retry backoff, attempt cap, permanent-failure handling, durability, and recovery thresholds: **UNKNOWN**. | Connectivity transition tests; process and device restart tests; transient and permanent fault injection; bounded-retry assertions; endurance run; telemetry review | R-003 |
| Data integrity | An accepted order appears unchanged on the dispatcher console. Concurrent-edit conflict behavior currently permits silent loss and has no acceptable-loss threshold. | Payload hash and field-level comparison across local queue, API, server record, and dispatcher view; two-device deterministic conflict tests; audit-history assertions | R-002 |
| Scalability | Queue depth of 2,000 items on one mid-range device with a 30-second drain target. Concurrent fleet size and server capacity threshold: **UNKNOWN**. | Single-device boundary benchmark plus controlled multi-device API load profile after fleet concurrency is defined | R-004 |
| Maintainability and observability | Required queue metrics, correlation identifiers, failure alerts, conflict audit events, and support diagnostics: **UNKNOWN**. | Logging schema review; metric and alert assertions; trace correlation from local queue item to server acceptance; support runbook exercise | R-002, R-003 |
| Compliance and privacy | Applicable handling rules for stored card references and billing addresses: **UNKNOWN**. | Data classification decision; privacy and payment-security review; retention and deletion evidence | R-001 |
| Deployment safety | Current disablement lead time is one to three days. Acceptable rollback time and rollout blast radius: **UNKNOWN**. | Kill-switch test; cohort rollout rehearsal; rollback drill; monitoring and decision-threshold evidence | R-005 |

### Scope constraints for regression assertions

- The Android screen has no browser or web-view surface, and this epic does not change its rendering.
- The dispatcher web console is observational only for this epic.
- Each installation remains single-tenant with isolated storage.
- Regional routing continues to enforce data residency.
- The billing service remains untouched and continues its existing nightly schedule.

### Risk summary

R-001, R-002, and R-003 are release blockers while open because each scores 9. R-004 and R-005 require documented mitigation, an owner, and objective evidence. The unknown NFR thresholds require explicit decisions before implementation evidence can support a release gate.

## Step 4: Coverage and execution plan

P0, P1, P2, and P3 express test priority. Execution timing is defined separately.

### P0: Critical

Criteria: Critical business, security, data-integrity, or compliance impact with no safe workaround.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| --- | --- | --- | ---: | --- | --- |
| 7.1-E2E-001: Sensitive queue fields resist extraction from app storage and device backup | E2E | R-001 | 1 | QA and Security | Physical-device inspection is required because the risk is at the Android storage boundary. Exposure compromises customer and payment-related data; the epic provides no safe workaround. |
| 7.1-E2E-002: Sensitive queue fields never appear in diagnostic logs and are securely removed after acceptance | E2E | R-001 | 1 | QA and Security | Whole-device evidence covers storage lifecycle and logging. Residual copies retain the same exposure consequence; the epic provides no recovery path. |
| 7.2-API-001: Concurrent offline revisions are merged or rejected through explicit version control | API | R-002 | 1 | QA and API Engineering | The server boundary owns conflict enforcement. Silent overwrite loses technician lines, and the epic states that no record survives. |
| 7.2-E2E-001: Two offline technicians edit one order and both receive a deterministic preserved or conflict-visible outcome | E2E | R-002 | 1 | QA | A two-device journey proves the user-visible outcome. Silent loss has no source-backed workaround. |
| 7.2-API-002: Every submitted revision and conflict decision remains auditable | API | R-002 | 1 | QA and API Engineering | API and persistence assertions can establish immutable revision history without duplicating the device journey. |
| 7.3-UNIT-001: Failure classification separates transient and permanent upload errors | Unit | R-003 | 1 | Development | Pure classification logic supports exhaustive boundary coverage. Misclassification can create endless retries with no terminal recovery. |
| 7.3-INT-001: Transient failures use capped exponential backoff with jitter and an attempt policy | Integration | R-003 | 1 | QA and Development | The worker, clock, and transport boundary establish retry scheduling. Immediate indefinite retry can consume resources and overload the service. |
| 7.3-E2E-001: A permanently rejected payload reaches quarantine or another terminal visible state without a tight loop | E2E | R-003 | 1 | QA | The full journey must prove user-visible resolution and stopped network activity. The supplied design has no terminal path. |
| 7.4-E2E-001: Remote disablement stops new offline capture safely on a released client | E2E | R-005 | 1 | QA and Release Engineering | Runtime control is observable only through the released app path. A severe defect otherwise remains active for every technician for one to three days. |
| 7.4-INT-001: Rollout cohorts and rollback criteria limit exposure and preserve queued data | Integration | R-005 | 1 | QA and Release Engineering | Configuration-to-client integration proves blast-radius control. The current release model exposes every technician at once. |
| AC-4-E2E-001: A concurrently edited accepted order appears unchanged on the dispatcher console | E2E | R-002 | 1 | QA | Cross-system field and ordered-line comparison proves the critical data outcome after conflict handling. |
| REG-API-001: Installation A cannot read or write installation B order data | API | - | 1 | QA and Security | Regression assertion for the stated single-tenant storage constraint. Cross-installation exposure has no safe workaround. |
| REG-API-002: Offline-order uploads retain the installation's regional routing | API | - | 1 | QA and Platform | Regression assertion for the stated residency constraint. The applicable compliance threshold still needs confirmation. |
| REG-API-003: Capture and synchronization never invoke the billing service or alter its nightly schedule | API | - | 1 | QA and API Engineering | A billing spy and audit evidence verify the explicit non-interaction constraint. An unintended charge has no safe user workaround. |

Total P0: 14 tests, about 70 to 110 hours.

### P1: High

Criteria: Core, frequent, or complex behavior with material user reach and a limited workaround.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| --- | --- | --- | ---: | --- | --- |
| AC-1-E2E-001: An offline technician saves parts and labour and sees the order listed as captured | E2E | - | 1 | QA | This is the core journey. The context documents a paper-and-rekey workaround, which is manual and limited. |
| AC-2-E2E-001: A queued order remains editable before server acceptance | E2E | - | 1 | QA | Core pre-sync behavior with the same limited paper workaround. |
| 7.2-INT-001: Multiple local edits preserve the latest effective order and their deterministic queue order | Integration | R-002 | 1 | QA and Development | Repository-to-SQLite integration covers append behavior without duplicating the full two-device journey. |
| AC-2-E2E-002: The order stops accepting queued edits after server acceptance | E2E | - | 1 | QA | Boundary validation for the phrase "until it has been accepted." Incorrect state can create divergent revisions. |
| AC-3-E2E-001: A usable-network transition starts upload without technician action | E2E | R-003 | 1 | QA | Android operating-system connectivity and the background worker must be exercised together. Manual re-entry is a limited fallback. |
| 7.3-INT-002: A transient failure eventually succeeds once and removes only the accepted queue entry | Integration | R-003 | 1 | QA and Development | Worker, queue, and API-stub integration verifies recovery and guards against duplicate acceptance. |
| 7.3-API-001: Replayed upload identifiers are idempotent at the server boundary | API | R-003 | 1 | QA and API Engineering | Immediate retries create replay pressure. API coverage proves duplicate delivery cannot duplicate the stored order. |
| NFR-PERF-E2E-001: A 2,000-item backlog drains within 30 seconds on the defined mid-range device profile | E2E | R-004 | 1 | QA and Performance Engineering | A physical-device client-to-server benchmark matches the stated threshold. Missing the target causes material dispatch delay; the source does not establish a critical deadline or a recovery bound. |
| AC-4-API-001: Accepted payload fields and ordered parts and labour lines match the submitted order | API | - | 1 | QA | Field-level API comparison isolates serialization and persistence fidelity before the dispatcher journey. |
| 7.3-INT-003: Queue drain survives process restart and connectivity flapping without loss or duplicate acceptance | Integration | R-003 | 1 | QA and Development | The source gives no recovery threshold for these conditions, so recoverability remains unresolved. This coverage exercises the durable queue boundary. |

Total P1: 10 tests, about 35 to 55 hours.

### P2: Medium

Criteria: Secondary behavior with narrower user reach and an acceptable workaround.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| --- | --- | --- | ---: | --- | --- |
| REG-COMP-001: Existing order-screen layout remains stable while the captured state is shown | Component | - | 1 | Development | The epic states that rendering is unchanged. A localized visual defect leaves order capture available. |
| REG-E2E-001: Existing dispatcher-console presentation remains unchanged for a synchronized order | E2E | - | 1 | QA | The console is outside implementation scope. A presentation regression has narrower reach and can be checked against the server record. |

Total P2: 2 tests, about 6 to 12 hours.

### P3: Low

Criteria: Rare, cosmetic, or experimental behavior with minimal impact and an easy workaround.

No P3 scenarios are justified by the supplied epic. Its cosmetic constraints already receive P2 regression coverage because they are customer-facing.

Total P3: 0 tests, 0 hours.

### NFR coverage and evidence

| NFR Category | Requirement or Threshold | Risk Link | Planned Validation | Evidence Needed | Priority |
| --- | --- | --- | --- | --- | --- |
| Security | At-rest protection and minimization target **UNKNOWN**; plaintext storage is unacceptable risk evidence | R-001 | Physical-device storage, backup, log, and deletion inspection | Extraction report, backup inspection, log scan, deletion trace | P0 |
| Performance | 2,000 items in 30 seconds on a defined mid-range fleet device | R-004 | Instrumented physical-device client-to-server benchmark across controlled network profiles | Raw timings, percentile summary, device specification, server metrics | P1 |
| Reliability | Automatic upload on usable network; retry bounds and recovery thresholds **UNKNOWN** | R-003 | Connectivity transitions, deterministic clocks, fault injection, restart and soak scenarios | Test report, retry timeline, queue metrics, network capture, alerts | P0 |
| Data integrity | Accepted order unchanged; silent concurrent loss must be eliminated | R-002 | Two-device conflict journey, API revision tests, payload and audit comparison | Payload hashes, field diff, server history, device traces | P0 |
| Scalability | Per-device boundary is 2,000 items; concurrent fleet load **UNKNOWN** | R-004 | Boundary benchmark followed by multi-device API load after a fleet target exists | Load profile, throughput, saturation, error-rate report | P1 |
| Maintainability and observability | Required queue, retry, conflict, and correlation telemetry **UNKNOWN** | R-002, R-003 | Logging contract, metric and alert assertions, support runbook exercise | Schema review, sample traces, alert evidence, runbook record | P0 |
| Compliance and privacy | Applicable controls for card references and billing addresses **UNKNOWN** | R-001 | Data classification, privacy review, payment-security review, retention validation | Approved classification, review record, retention/deletion report | P0 |
| Deployment safety | Current disablement takes one to three days; acceptable rollback target **UNKNOWN** | R-005 | Kill-switch, cohort exposure, monitoring, and rollback rehearsal | Drill report, configuration audit, decision log | P0 |

Missing thresholds remain pre-release clarification items. Final NFR status belongs to `nfr-assess` after implementation evidence exists.

### Execution strategy

- Pull request: all deterministic unit, integration, API, component, and focused Android emulator functional scenarios when the parallel suite stays below 15 minutes.
- Nightly: dual-device journeys, restart and connectivity-flapping coverage, retry burn-in, storage inspection, and fault-injection scenarios.
- Weekly: physical-device 2,000-item benchmarks, fleet-scale API load, long-duration reliability runs, security review automation, and rollout or rollback drills.

Execution order is fast structural checks, P0 functional coverage, P1 functional coverage, P2 regression coverage, then expensive NFR suites.

### Resource estimates

| Priority | Count | Effort Range | Notes |
| --- | ---: | --- | --- |
| P0 | 14 | About 70 to 110 hours | Multi-device, security, conflict, release-control, and cross-system setup |
| P1 | 10 | About 35 to 55 hours | Core device flows, queue integration, API fidelity, and performance harness |
| P2 | 2 | About 6 to 12 hours | Focused rendering and console regression |
| P3 | 0 | 0 hours | No qualifying scenarios |
| Total | 26 | About 111 to 177 hours | Includes factories, fixtures, device orchestration, and evidence reporting |

Expected elapsed time for one test engineer with part-time support from development, security, platform, and release roles: about 4 to 6 weeks.

### Prerequisites

- Factories for installations, technicians, work orders, parts, labour, revisions, and accept or reject API responses
- Controllable Android connectivity, clock, process lifecycle, and device storage access
- Two independently identified device sessions assigned to the same work order
- API stubs or a test server that can produce transient, permanent, delayed, duplicate, and out-of-order outcomes
- Server audit access, dispatcher-console access, billing-service spy, regional-routing evidence, and tenant-isolation fixtures
- A named representative mid-range Android device and controlled network profiles
- Remote-configuration test environment with cohort and rollback controls

### Quality gates

- P0 pass rate: 100 percent
- P1 pass rate: at least 95 percent, with any failure triaged and formally waived before release
- P2 and P3 pass rate: at least 90 percent
- High-risk mitigations: 100 percent complete or covered by approved, owned, expiring waivers
- Planned-scenario coverage: at least 80 percent overall, 100 percent for security and all P0 scenarios
- No open severity-1 or severity-2 defects
- The 2,000-item, 30-second target is met on the agreed physical-device profile
- Every in-scope NFR category has its named evidence artifact; final NFR decisions remain deferred to `nfr-assess`

## Step 5: Output and validation

- Execution mode: sequential single-worker epic generation
- Output: `/private/tmp/remaining-skills-evidence/test-design-cli-schema-recovery/field-order-capture/.tea-runs/tea-test-design-dGvHaV/attempt-1/artifacts/test-design/test-design-epic-7.md`
- Template: `test-design-template.md`
- Checklist: `checklist.md`
- Canonical scored-risk tables: validated
- Canonical coverage tables: validated
- Scored risks: 5 unique IDs with correct probability multiplied by impact arithmetic
- Coverage rows: 26 with canonical single-value test levels and valid risk links
- Scenario totals: 14 P0, 10 P1, 2 P2, 0 P3
- Unresolved template placeholders: none
- Browser sessions: none opened
- Temporary artifacts: none created outside the declared test-design folder
- Workflow result: completed
- On-complete hook: empty, so no hook was executed
