---
runScope: 'epic'
runKey: 'epic-7'
mode: 'epic-level'
designLevel: 'full'
executionMode: 'sequential'
capabilityProbe: false
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-10-14'
inputDocuments:
  - field-order-capture/_bmad/config.toml
  - field-order-capture/docs/epics/epic-7-offline-order-capture.md
  - bmod-tea/knowledge/tea-index.csv
  - bmod-tea/knowledge/risk-governance.md
  - bmod-tea/knowledge/probability-impact.md
  - bmod-tea/knowledge/test-levels-framework.md
  - bmod-tea/knowledge/test-priorities-matrix.md
  - bmod-tea/knowledge/nfr-criteria.md
---

# Test Design: Epic 7: Offline order capture for field technicians

**Date:** 2026-10-14
**Author:** tea-eval-harness
**Status:** Draft; test design complete, release approval pending

## Executive Summary

**Scope:** Full epic-level test design for Epic 7 in field-service-platform. The native Android client captures and edits work orders into SQLite, uploads after connectivity returns, and preserves order content through server storage and dispatcher readback.

**Risk Summary:**

- Total risks identified: 5
- High-priority risks (≥6): 4, including 2 critical risks scoring 9
- High-risk categories: SEC, DATA, TECH, OPS; PERF requires benchmark evidence
- Highest mitigation priorities: silent destructive overwrites and unbounded retries; local billing-data protection and release containment follow before release.

**Coverage Summary:**

- P0 scenarios: 15 (~30–45 hours)
- P1 scenarios: 9 (~15–27 hours)
- P2/P3 scenarios: 3 (~3–6 hours)
- **Total effort:** 27 planned scenarios, ~48–78 hours (~6–10 person-days at 8 hours/day)

These are future test-development estimates. Provisioning and product mitigation work have separate estimates. The supplied repository contains the epic and configuration; implementation, runnable tests, fixtures, and prior system-level designs are unavailable. Existing coverage and flakiness cannot be measured. This document plans validation; execution results and final NFR status remain pending.

## Not in Scope

| Item | Reasoning | Mitigation |
| ---------- | -------------- | --------------------- |
| Offline entities other than work orders | Explicit epic exclusion | Limit test factories and queue scenarios to work orders; retain existing suites for other entities when available. |
| Dispatcher console implementation changes | Explicit exclusion; unchanged readback is AC4 | Use the existing console as a downstream readback oracle in the critical native journey. Retain its existing regression suite when supplied. |
| Charging and payment-provider behavior | Epic says capture never calls billing; nightly charging is unchanged | Assert zero billing invocation and unchanged scheduling at the integration seam. Billing owners retain full charge-flow validation. Use synthetic card references. |
| Browser rendering, web views, and visual redesign | Epic specifies native Android, no browser/web view, and unchanged rendering | Validate native captured/editable states in user journeys. Retain existing native rendering checks when supplied. |
| Cross-tenant storage design and regional routing changes | Each installation has separate servers/database; platform routing already enforces unchanged residency | Verify stated invariants through regression assertions; platform/server owners retain baseline evidence. |
| Test generation and implementation | This run produces a design from the epic | Execute automation and mitigation work in later workflows after prerequisites are ready. |

## Risk Assessment

The sole requirements source is [Epic 7](../../docs/epics/epic-7-offline-order-capture.md). Story references below point into that source. The register contains exactly one risk for each distinct documented gap: unprotected local data, missing conflict controls, an unmeasured performance target, missing retry controls, and missing release containment. Appending edits is a stated behavior validated in coverage. Acceptance criteria and satisfied deployment constraints produce coverage assertions.

Probability: 1 unlikely, 2 possible, 3 likely. Impact: 1 minor, 2 degraded, 3 critical. **Score = Probability × Impact.** Scores ≥6 require mitigation with an owner and timeline; score 9 is a release blocker until resolved. All five risks are currently open. Proposed controls require implementation and verification.

### High-Priority Risks (Score ≥6)

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Timeline |
| ------- | -------- | ------------- | ----------- | ------ | ----- | ------------ | ------- | -------- |
| R-001 | SEC | Plain SQLite file holds the full order payload and is not encrypted at rest (7.1), including stored card reference and billing address. Device/file access exposes sensitive customer data; the screen lock is the only stated protection. | 2 | 3 | 6 | Minimize retained sensitive fields; encrypt necessary data with protected keys; inspect SQLite and journal artifacts through capture, edits and cleanup. | Android lead + Security lead | Before release candidate |
| R-002 | DATA | No version check and no timestamp check; a later arrival overwrites earlier technician lines with no record they existed (7.2). Concurrent offline work causes unrecoverable data loss. | 3 | 3 | 9 | Detect conflicting revisions; preserve durable history; agree and implement a resolution rule before release. | Server lead + Product lead | Before release candidate |
| R-004 | TECH | Failed upload is retried immediately and indefinitely with no backoff, attempt cap, or dead-letter path (7.3). A permanently rejected payload loops at network speed, consumes capacity and leaves its essential upload unresolved. | 3 | 3 | 9 | Classify transient/terminal failures, bound retries with backoff, and durably isolate terminal items with a recovery path. | Android lead + Server lead | Before release candidate |
| R-005 | OPS | No feature flag, no staged rollout, and no way to disable without a new build through 1–3 days of store review (7.4). An incident reaches every technician and persists during replacement distribution. | 2 | 3 | 6 | Implement a containment/disable mechanism that preserves queued work; rehearse incident containment and replacement-build recovery. | Release lead + Product lead | Before distribution |

R-001 has probability 2 because unauthorized file access is conditional; sensitive disclosure gives impact 3. R-002 has probability 3 because the epic explicitly describes destructive overwrite; its irreversible line loss gives impact 3. R-004 has probability 3 because permanent rejection deterministically produces the stated infinite loop; unresolved upload and capacity exhaustion give impact 3. R-005 has probability 2 because an incident is conditional; universal exposure and slow containment give impact 3.

### Medium-Priority Risks (Score 3-4)

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner |
| ------- | -------- | ------------- | ----------- | ------ | ----- | ------------ | ------- |
| R-003 | PERF | Full backlog of 2,000 queued items must finish syncing within 30 seconds on mid-range fleet devices (7.3). Throughput is unmeasured in supplied inputs; exceeding the target delays completion of the technician's queued work. | 2 | 2 | 4 | Measure real-device end-to-end completion, retain content checks, and optimize client/server from benchmark evidence. Timeline: before release approval. | Android lead + Server performance lead |

R-003 has probability 2 because deadline compliance is unmeasured. Impact 2 reflects delayed acceptance of queued work. The epic specifies eventual server acceptance and a throughput target; a critical business cutoff or permanent loss caused by latency is unspecified. The acceptance target remains mandatory.

### Low-Priority Risks (Score 1-2)

No identified risks in this band.

| Risk ID | Category | Description | Probability | Impact | Score | Action |
| ------- | -------- | ------------- | ----------- | ------ | ----- | -------- |

### Risk Category Legend

- **TECH:** Technical/architecture flaws, integration and scalability
- **SEC:** Security, access controls and data exposure
- **PERF:** Performance targets and resource limits
- **DATA:** Data loss, corruption and inconsistency
- **BUS:** Business logic and user impact
- **OPS:** Deployment, containment and monitoring

## NFR Planning

**Purpose:** Plan epic-specific thresholds and evidence for later `nfr-assess`. Product constraints come from the epic; proposed mitigation thresholds require agreement before affected tests can assert success.

| NFR Category | Requirement / Threshold | Risk Link | Planned Validation | Evidence Needed |
| --------------- | ----------------------- | --------- | ------------------------------------------ | -------------------------------- |
| Security | Plaintext billing data is documented. Approved local-data protection, key handling and retention thresholds: UNKNOWN. | R-001 | Integration inspection of actual persisted SQLite, journal/WAL artifacts and cleanup; security validation of the agreed protection. | Redacted artifact report, file-access/key-control observations, build identifier. |
| Data integrity | Preserve work-order content (AC4); existing concurrent edits silently lose lines. Approved conflict/history policy: UNKNOWN. | R-002 | API arrival permutations and persisted revision readback against an approved conflict rule. | Server responses, revision history and field-difference report. |
| Performance | All 2,000 queued entries accepted within 30 seconds of regaining usable connectivity on fleet mid-range Android devices. | R-003 | Real-device E2E deadline measurement; server profiling supports diagnosis. Measure full acceptance and content integrity. | Device/OS/build/network profile, monotonic timing, entry counts, acceptance/readback records and server metrics. |
| Reliability | Automatic sync and editability until acceptance (AC2/AC3). Retry backoff, cap, terminal recovery and fairness thresholds: UNKNOWN. | R-004 | Integration fault injection and request-timing traces; native connectivity journeys verify automatic recovery. | Queue state transitions, attempt timestamps, rejection classification and accepted-item readback. |
| Operations | Universal enablement; disable requires replacement build with 1–3 day store review. Acceptable containment latency: UNKNOWN. | R-005 | E2E release/disable and replacement-build rehearsal with queued-work retention. | Recovery timeline, candidate artifact identities, distribution evidence and queue/server reconciliation. |
| Maintainability | Coverage/static-analysis targets and telemetry retention: UNKNOWN; repository has no implementation evidence. | - | Future CI/static-analysis reports and traceability verification after code is supplied. | CI test/coverage report, static-analysis report and assigned owners. |
| Scalability | Per-device 2,000-item workload is specified; fleet concurrency and server capacity targets: UNKNOWN. | R-003 | Include full-size device backlog and server profiling; additional fleet-load target requires product/platform input. | Backlog benchmark and documented fleet-load profile when agreed. |
| Residency and installation isolation | Single-tenant servers/storage and regional routing remain unchanged. | - | Scoped installation/routing regression assertions against the platform baseline. | Installation-specific readback and routing destination records. |
| Compliance | Specific legal or certification obligations: UNKNOWN. | - | Security owner identifies applicable obligations before sign-off; sensitive-data checks remain in scope. | Applicable-controls record and security evidence references when defined. |

**Unknown thresholds:** Fleet device models/Android versions, usable-network profile, representative payload-size distribution, fleet concurrency, conflict resolution, local-data protection/retention, retry timing/cap/terminal recovery, containment latency, background sync policy, maintainability targets and applicable compliance obligations. These are execution blockers or clarification items. They create no additional scored rows without source evidence of a distinct gap. Generic thresholds from knowledge examples are guidance only.

For the performance oracle, start the monotonic timer when the OS reports usable connectivity. Stop when the server has durably accepted all 2,000 queued entries and the client has reconciled their acknowledgement state. Queue length alone cannot prove acceptance. Count appended revisions as entries even when fewer unique work orders exist. Dispatcher comparison follows acceptance and verifies final order content separately. Repeat across approved fleet profiles; every measured full-backlog run must meet ≤30 seconds. The percentile and repetition requirements remain UNKNOWN.

## Entry Criteria

- [ ] QA, Android, Server and Product agree requirements, assumptions, risk ownership and scenario oracles.
- [ ] Native candidate Android build and accessible single-installation staging servers are available.
- [ ] Existing dispatcher console is accessible for AC4 readback.
- [ ] Fleet mid-range devices and Android/OS/network profiles are documented and available.
- [ ] Synthetic work orders, two assigned technicians and deterministic 2,000-entry datasets are ready.
- [ ] Queue inspection, server persistence readback, connectivity control and upload-response fault injection are available.
- [ ] Conflict, sensitive-data, retry and containment policies are agreed for mitigation-verification scenarios. Characterization scenarios can record current hazards earlier.
- [ ] Platform isolation/routing and billing baselines are supplied for scoped regression assertions.

## Exit Criteria

- [ ] All P0 tests pass; all four acceptance criteria have successful evidence.
- [ ] P1 pass rate is ≥95%; remaining failures are triaged with approved, expiring waivers. The explicit performance acceptance requirement still passes.
- [ ] No open high-severity defects or unmitigated high risks remain; any permissible waiver identifies approver, owner, reason and expiry.
- [ ] Conflict preservation, local-data protection, bounded retry recovery and release containment are verified against approved policies.
- [ ] All 2,000 queued entries sync within 30 seconds on approved fleet devices; content and acknowledgement reconciliation are verified.
- [ ] Security scenarios pass 100%, and planned NFR evidence is available for later assessment.
- [ ] Regression invariants pass; test coverage is agreed sufficient against the quality criteria below.

## Project Team

Names are unavailable. The responsibility mapping uses proposed role owners; the project must assign actual owners before test execution.

| Name | Role | Testing Responsibilities |
| ------ | -------- | ------------------------ |
| Unassigned | QA lead | Native user journeys, requirement traceability, evidence collection and test exit review. |
| Unassigned | Android lead | SQLite persistence, retry scheduler, native lifecycle/network controls and local-data handling. |
| Unassigned | Server lead | Conflict handling, durable acceptance/readback, synthetic data seeding and server performance diagnostics. |
| Unassigned | Security lead | Local-data protection policy, artifact access/key review and sensitive-data evidence. |
| Unassigned | Product lead | Conflict resolution, consequences/workarounds, UNKNOWN threshold decisions and acceptance. |
| Unassigned | Release / Platform leads | Containment rehearsal, build distribution, fleet profiles and routing/isolation baselines. |

## Test Coverage Plan

AC1: offline save appears captured. AC2: editability until server acceptance. AC3: automatic upload when connectivity returns. AC4: unchanged order content on the existing dispatcher console.

P0–P3 express test priority. The Execution Strategy section assigns cadence. Each scored risk has exactly one linked row at its first observable test level. Notes identify the mechanism, boundary, scenarios and recoverability. Rows with `-` validate requirements or satisfied constraints. Scenario counts describe the cases listed in Notes; profile permutations may expand execution count later.

### P0 (Critical)

**Criteria:** Critical business, security, data-integrity, or compliance impact with no safe workaround. Risk score is supporting evidence and is not a required condition.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ------------- | ---------- | --------- | ---------- | ----- | ------- |
| Protect sensitive persisted outbound data (7.1) | Integration | R-001 | 3 | Android + Security | Mechanism: plaintext full payload; boundary: owned SQLite/file persistence; level: Integration. Inspect DB and journal after (1) offline capture, (2) appended edit, (3) acceptance/cleanup. Characterize current readable synthetic billing fields, then verify agreed protection/retention. Consequence: critical customer disclosure; screen lock is the sole stated control and post-disclosure recovery is unresolved. |
| Preserve concurrent work-order revisions (7.2) | API | R-002 | 4 | Server | Mechanism: unconditional last-arrival overwrite; boundary: one server HTTP contract and its persisted revision outcome; level: API. (1) Technician A then B, (2) B then A, (3) stale same-device revision arrives last, (4) edit races acceptance. Use distinct lines and inspect conflict result/history against approved policy. Consequence: irreversible earlier-line loss; source states no record and provides no recovery. |
| Bound failed uploads and recover terminal items (7.3) | Integration | R-004 | 4 | Android | Mechanism: retry scheduler repeatedly consumes queued item; boundary: owned outbound queue/event scheduler with controllable transport; level: Integration. (1) Permanent rejection, (2) transient rejection then acceptance, (3) rejected item followed by valid item, (4) connectivity flaps during retry. Assert attempt timing/cap, retained terminal item and valid-item progress against approved policy. Consequence: unresolved essential upload and capacity exhaustion; source supplies no recovery. Record head-of-line behavior from observed queue progress. |
| Contain a fleet-wide release incident (7.4) | E2E | R-005 | 2 | Release + QA | Mechanism: universal native release with store-mediated replacement; boundary: installed build, deployed server and distribution/recovery journey; level: E2E. (1) Rehearse disable/containment while pending uploads exist, (2) replace build and reconcile retained queue/server work. Record the current absence of disable/staging and 1–3 day review latency; verify proposed control after implementation. Consequence: every technician exposed while essential operation is disrupted; the only documented recovery requires store review, leaving timely containment unresolved. |
| Offline capture/edit to unchanged dispatcher readback (AC1–AC4) | E2E | - | 2 | QA | Boundary: native Android user → real server → existing dispatcher console. (1) Save parts/labour offline, assert captured, reconnect without action, compare all fields downstream; (2) append repeated edits before delayed acceptance, assert pending editability, reconnect and compare newest accepted content. Verify server acceptance and queue acknowledgement separately. Critical work-order integrity has no source-supported safe workaround. This row proves the journey; linked rows isolate security/conflict/retry mechanisms. |

**Total P0:** 15 tests, ~30–45 hours.

### P1 (High)

**Criteria:** Core, frequent, or complex behavior with material user reach and a limited workaround. Risk score is supporting evidence and is not a required condition.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ------------- | ---------- | --------- | ---------- | ----- | ------- |
| Sync a full 2,000-entry backlog within 30 seconds (7.3) | E2E | R-003 | 3 | Performance + QA | Mechanism: complete native upload/acceptance throughput; boundary: real fleet device, OS connectivity, actual queue and server deadline; level: E2E. (1) 2,000 distinct orders, (2) 2,000 mixed initial/edit entries, (3) 2,000 entries accumulated over a full offline day. Verify deadline and content under approved device/network profiles. A breach delays queued-work acceptance; the epic establishes a release threshold and intended eventual acceptance. Dispatch latency is a possible downstream consequence requiring clarification. A critical business cutoff or permanent loss from latency is unstated. Recovery timing/workaround effectiveness is unresolved. P1 reflects material core-workflow delay; the 30-second criterion remains mandatory. |
| Append edits and preserve pending editability (7.1/7.2, AC2) | Integration | - | 3 | Android | Boundary: editor/queue writer → owned SQLite store. (1) Capture plus repeated edits append separate entries with newest pending state, (2) reopen pending data after process restart, (3) hold server acceptance and edit pending item. Persistence and pending-state assertions supplement the native journey with isolated storage evidence. Restart semantics require confirmation before execution. |
| Automatic OS connectivity recovery (AC3) | E2E | - | 1 | QA | Boundary: native lifecycle/connectivity → real server. Queue offline, background/foreground the app, deliver usable-network transition, assert upload begins and reaches acceptance with zero technician action. Test supported lifecycle behavior; background execution policy is UNKNOWN. |
| Preserve complete payload fields (AC4) | Unit | - | 2 | Android | Boundary: none; level: Unit. (1) Encode/decode parts and labour lines, (2) edited payload preserves synthetic card reference and billing address. Compare typed field values with the source fixture. Pure serialization evidence supplies the field oracle used by boundary tests. |

**Total P1:** 9 tests, ~15–27 hours.

### P2 (Medium)

**Criteria:** Secondary behavior with narrower user reach and an acceptable workaround. Risk score is supporting evidence and is not a required condition.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ------------- | ---------- | --------- | ---------- | ----- | ------- |
| Preserve installation isolation constraint | API | - | 1 | Server | One installation HTTP boundary; use synthetic identifiers in separately provisioned installations and confirm readback remains installation-specific. Source states separate storage/servers already enforce isolation. Supplemental unchanged-control regression, supported by baseline platform validation. |
| Preserve regional routing constraint | Integration | - | 1 | Platform | Owned routing boundary: observe configured regional destination of synthetic sync traffic and compare the existing platform baseline. Residency is unchanged. Existing platform validation covers the control; this checks integration compatibility. |
| Preserve billing invocation/schedule constraint | Integration | - | 1 | Server + Billing owner | Owned sync-to-billing integration seam: observe zero billing calls during capture/edit/sync and unchanged nightly configuration. Billing operation retains its existing nightly path and owner-managed regression. Full charging remains out of scope. |

**Total P2:** 3 tests, ~3–6 hours. These verify explicitly satisfied, unchanged controls. Any actual security/residency/billing regression discovered during execution requires impact triage and reprioritization.

### P3 (Low)

**Criteria:** Rare, cosmetic, or experimental behavior with minimal impact and an easy workaround. Risk score is supporting evidence and is not a required condition.

No P3 scenarios are planned. This epic introduces no cosmetic or optional behavior.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ------------- | ---------- | --------- | ---------- | ----- | ------- |

**Total P3:** 0 tests, 0 hours.

## Execution Strategy

Run all functional scenario classes on pull requests while the measured suite remains under 15 minutes. Priority defines consequence; schedule reflects runtime and infrastructure needs. Native Android runners and server API/integration runners are required; no browser automation is configured for this run.

- **Pull request:** Pure payload logic, SQLite persistence/security checks, API revision cases, deterministic upload fault injection, short native journeys and scoped regression assertions. Isolate data by run and serialize access to each device. Parallelize independent server/unit jobs.
- **Nightly:** Real fleet-device backlog benchmarks, full offline-day accumulation, repeated connectivity/lifecycle recovery and candidate-device matrix checks. These require extended runtime or scarce physical hardware.
- **Weekly:** Costly store/distribution recovery rehearsal, broad fleet profiles and prolonged retry/resource soak. Fleet-scale load profiling awaits an agreed concurrency target.

Before distribution, rerun all applicable critical, performance and containment evidence on the candidate build even when cadence would otherwise defer it. Preserve redacted device logs, queue/server traces, timing and fixture identifiers. Event-based observations and bounded polling replace arbitrary sleeps. No exploration sessions were opened; no browser cleanup is needed.

Within each scheduled run, execute a short environment smoke check, then available P0 cases, P1 cases and P2 cases. Device scarcity and long duration are the reasons for deferred cadence. Playwright-specific parallelization is N/A to the native client and unset browser configuration.

## Resource Estimates

### Test Development Effort

| Priority | Count | Hours/Test | Total Hours | Notes |
| --------- | ------------- | ---------- | ----------------- | ----------------------- |
| P0 | 15 | ~2–3 | ~30–45 | Security artifacts, concurrent revisions, retries and release setup |
| P1 | 9 | Varies by scenario | ~15–27 | Real-device benchmark setup dominates pure-logic cases |
| P2 | 3 | ~1–2 | ~3–6 | Existing-control seam assertions and baseline coordination |
| P3 | 0 | N/A | 0 | No planned scenarios |
| **Total** | **27** | **Varies** | **~48–78** | **~6–10 person-days** |

Intervals include test fixture/harness setup and scenario complexity. After entry dependencies are ready, one full-time test engineer needs approximately 1–2 working weeks for ~6–10 person-days of test development. Hardware access, mitigation implementation and environment provisioning can extend elapsed calendar time; calendar delivery is UNKNOWN until those dependencies are assigned.

### Prerequisites

**Test Data:** Proposed deterministic WorkOrder fixtures with parts, labour, synthetic billing address/card reference, installation-scoped IDs and two assigned technicians. Generate full 2,000-entry datasets with both distinct orders and appended revisions. Record expected payload/history per entry. Cleanup must be run-scoped.

**Tooling:** Native Android instrumentation/device automation, SQLite/journal inspection, controllable upload transport, actual staging-server readback, monotonic device timing and server profiling. Runner choice and versions are UNKNOWN; no repository framework exists to reuse. Backend load tooling can supplement device evidence after a load target is agreed.

**Environment:** Mid-range fleet Android devices, controllable usable/disconnected networks, a single-tenant staging installation and existing dispatcher console, isolated synthetic datasets, approved artifact-inspection access and a release rehearsal/distribution environment.

## Quality Gate Criteria

### Pass/Fail Thresholds

- **P0 pass rate:** 100%; all 15 planned cases must have execution evidence.
- **P1 pass rate:** ≥95%; failures need triage and approved expiring waivers. With 9 planned cases, rounding requires all 9 to pass unless an expanded denominator supports the threshold.
- **P2/P3 pass rate:** ≥90% informational; discovered high-impact failures still block through severity triage.
- **High-risk mitigations:** 100% verified before release. Any allowed waiver requires named approval, reason, compensating control and expiry. Score-9 risks remain blockers while open.
- **Performance acceptance:** Full 2,000-entry backlog completes within 30 seconds on approved mid-range fleet profiles; acknowledgement and unchanged content evidence required.

### Coverage Targets

- **Acceptance criteria:** 100% planned and executed coverage for AC1–AC4.
- **Scored risks:** 5/5 linked once at the first observable level.
- **Critical paths:** ≥80% minimum; all critical journeys in this plan must pass.
- **Security scenarios:** 100%.
- **Business logic:** ≥70% once implementation coverage can be measured.
- **Edge cases:** ≥50% minimum; every explicit boundary scenario in this plan remains required.

Coverage percentages beyond planned scenario traceability are execution targets. This run provides no code-coverage or pass-rate measurement. Future evidence collection and the trace workflow evaluate an eligible execution gate; this plan grants no release pass.

### Non-Negotiable Requirements

- [ ] All P0 tests pass.
- [ ] High risks have verified mitigations; approved exceptions carry owners and expiry.
- [ ] Security scenarios pass 100% with protected synthetic-data evidence.
- [ ] Explicit performance target is met on fleet devices.
- [ ] Planned NFR evidence exists and remaining UNKNOWNs are resolved or formally recorded for later assessment.
- [ ] Final NFR assessment is performed with implementation evidence through `nfr-assess`.

## Mitigation Plans

### R-001: Unencrypted queued billing data (Score: 6)

**Mitigation Strategy:** Agree the minimum offline payload, remove unnecessary sensitive data, protect retained values with encryption and protected key handling, and define accepted-item retention/cleanup. Inspect real SQLite and journal artifacts across the three linked scenarios. Avoid sensitive values in evidence output.

**Owner:** Android lead + Security lead; named assignment pending.
**Timeline:** Before release candidate.
**Status:** Planned; current plaintext exposure remains open.
**Verification:** Integration row linked to R-001; artifact readability, protection and retention match the approved policy.

### R-002: Silent concurrent overwrite (Score: 9)

**Mitigation Strategy:** Add revision/conflict detection and durable history. Product selects merge/rejection/resolution behavior that preserves earlier technician work. Characterize both arrival orders first, then verify approved outcomes including stale revisions and edits during acceptance.

**Owner:** Server lead + Product lead; named assignment pending.
**Timeline:** Before release candidate.
**Status:** Planned; destructive behavior remains a blocker.
**Verification:** API row linked to R-002; distinct technicians' lines remain recoverable and conflict/history is observable in stored state.

### R-003: Unmeasured full-backlog sync deadline (Score: 4)

**Mitigation Strategy:** Establish fleet device/network/payload profiles and benchmark real 2,000-entry queues. Trace scheduling, transfer, server persistence and acknowledgement time. Optimize measured bottlenecks while preserving revision order and content. Define the consequence and recovery expectation of exceeding 30 seconds.

**Owner:** Android lead + Server performance lead; named assignment pending.
**Timeline:** Before release approval.
**Status:** Planned; deadline compliance is unmeasured.
**Verification:** E2E row linked to R-003; all three scenario datasets satisfy ≤30 seconds on approved profiles with complete acceptance/readback evidence.

### R-004: Immediate infinite retry (Score: 9)

**Mitigation Strategy:** Establish transient/terminal response classification, bounded retry intervals/cap and durable terminal isolation. Keep rejected work recoverable and prove valid-item progress. The epic supplies none of these controls; exact values and remediation workflow require Product/Android/Server agreement.

**Owner:** Android lead + Server lead; named assignment pending.
**Timeline:** Before release candidate.
**Status:** Planned; unbounded retry remains a blocker.
**Verification:** Integration row linked to R-004; timed request and queue traces prove approved bounds, retention and recovery across four scenarios.

### R-005: Universal release with slow disable (Score: 6)

**Mitigation Strategy:** Establish a containment/disable path and controlled exposure strategy before distribution. Preserve pending captured work during containment and replacement. Rehearse current replacement limitations and later verify the agreed control without depending on a 1–3 day review to contain an incident.

**Owner:** Release lead + Product lead; named assignment pending.
**Timeline:** Before distribution.
**Status:** Planned; the current universal-release constraint remains open.
**Verification:** E2E row linked to R-005; containment timeline meets the agreed target and queue/server reconciliation proves work retention after replacement.

**Residual exposure:** Original scores remain open until implementation evidence verifies controls. A passing functional journey alone leaves plaintext exposure, destructive conflict behavior, retry resource consumption and release containment unresolved. Reassess likelihood and residual impact after mitigation verification; residual scores are UNKNOWN until that evidence exists.

## Assumptions and Dependencies

### Assumptions

1. Work orders can be seeded/opened before disconnection, consistent with story 7.1 opening an existing order. Offline order discovery is unspecified.
2. Appended entries represent queued revisions. Delivery ordering and accepted-revision edit boundaries need explicit policy; tests characterize source behavior and verify agreed mitigation.
3. Process restart, background execution, storage failures, authentication expiry and supported Android versions are execution clarifications. The epic provides insufficient facts for separate scored risks.
4. Synthetic data and test-only inspection/readback are available in staging. Access is pending until provisioned.
5. Scenario IDs and implementation paths can be added when a test framework exists. Proposed case naming uses epic/story and level, such as `7.3-INT-001`; this run creates no tests.

### Dependencies

| Dependency | Needed by | Owner | Status |
| ---------- | --------- | ----- | ------ |
| Actual Android build, server endpoints and console access | First executable test cycle | Android / Server / QA | Pending |
| Conflict, protection, retry and containment decisions | Mitigation verification | Product / Security / Release | Pending |
| Device/network/payload profiles and hardware | Performance baseline | Android / Performance | Pending |
| Queue inspection, fault injection and acceptance/readback evidence | Integration/API execution | Android / Server | Pending |
| Platform routing/isolation and billing baselines | Regression exit review | Platform / Billing | Pending |

### Risks to Plan

- **Fleet profile/access unknown:** Real-device performance evidence cannot be collected. Reserve fleet hardware and document profiles before benchmark execution; keep compliance unmeasured until available.
- **Missing implementation/test harness:** Execution and flakiness cannot be assessed. Build the agreed harness after design and capture baseline results.
- **Policies unresolved:** Mitigation-verification oracles remain incomplete. Characterize current source-described hazards, record UNKNOWNs and withhold successful-mitigation claims until decisions and evidence exist.

### Implementation Planning Handoff

Schedule local-data protection, revision/history conflict handling, bounded retry/terminal recovery and release containment with their proposed owners. QA/Android/Server provision queue inspection, fault injection, readback and fleet performance fixtures. This is planning guidance within the single epic document.

## Follow-on Workflows (Manual)

- Run `/bmad-tea-automate` in red mode to generate failing P0 tests after implementation interfaces are available.
- Run `/bmad-tea-automate` for broader coverage after the harness exists.
- Run `nfr-assess` with real evidence; use traceability/gate evaluation after execution results are collected.

## Approval

**Test Design Approved By:**

- [ ] Product Manager: Unassigned. Date: Pending.
- [ ] Tech Lead: Unassigned. Date: Pending.
- [ ] QA Lead: Unassigned. Date: Pending.

**Comments:** Approval is pending. Workflow completion records document production; release readiness depends on mitigations, thresholds and execution evidence.

## Interworking & Regression

Existing test files are unavailable in the supplied repository. The scopes below specify required regression behavior for the implementation team to locate or create later.

| Service/Component | Impact | Regression Scope |
| ----------------- | -------------- | ------------------------------- |
| Native Android order editor and SQLite queue | Offline capture/edit and acceptance state | Existing connected capture/edit behavior, field preservation, appended pending entries and native captured/editable presentation. |
| Android OS connectivity and upload scheduler | Automatic upload and retry resource behavior | Network transitions, supported lifecycle recovery, durable pending state and bounded upload attempts after mitigation. |
| Order server/database | Acceptance and revision outcome | Existing order validation/readback, approved conflict/history behavior, correct final work-order lines. |
| Existing dispatcher console | Reads accepted orders | AC4 unchanged field readback through the existing screen; coordinate seeded orders with console owner. |
| Installation servers/storage and regional routing | Unchanged deployment constraints | Installation-specific readback and configured region destination; coordinate platform baseline evidence. |
| Existing nightly billing service | Unchanged invocation and schedule | Zero capture/sync invocation; unchanged nightly scheduling. Billing owner supplies its existing charging regression evidence. |
| Release distribution | Universal build and replacement path | Containment timing, replacement compatibility and queued-work preservation; coordinate Release and Android owners. |

## Appendix

### Knowledge Base References

- `bmod-tea/knowledge/risk-governance.md`: category ownership and mitigation governance.
- `bmod-tea/knowledge/probability-impact.md`: 1–3 scales and score thresholds.
- `bmod-tea/knowledge/test-levels-framework.md`: test-level selection and duplication guard.
- `bmod-tea/knowledge/test-priorities-matrix.md`: business consequence, reach and recoverability determine priority.
- `bmod-tea/knowledge/nfr-criteria.md`: measurable thresholds and planned evidence.

Loaded in that deterministic order using `tea-index.csv`. Optional library, browser and Pact flags are unset; no manifests or Pact artifacts exist. The epic explicitly establishes native Android context. Mobile indicators from manifests are unavailable. Sequential execution and disabled capability probing follow the run configuration.

### Related Documents

- Requirements: [Epic 7: Offline order capture](../../docs/epics/epic-7-offline-order-capture.md).
- Configuration: [TEA/core configuration](../../_bmad/config.toml).
- PRD, architecture, tech spec and sprint status: N/A for this run; the epic is the sole requirements source.
- Template: `skill/test-design-template.md`.

**Generated by:** BMad TEA Test Architect Module
**Workflow:** `bmad-tea-test-design`
**Instruction version:** 5.0; supplied epic template footer version: 4.0 (BMad v6).
