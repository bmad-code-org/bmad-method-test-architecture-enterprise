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
**Status:** Draft; workflow complete, stakeholder approval pending.

## Executive Summary

**Scope:** Full epic-level design for Stories 7.1–7.4. The sole requirements source is [Epic 7](../../docs/epics/epic-7-offline-order-capture.md). The client is native Android. Its SQLite outbound queue, sync worker, server acceptance and existing dispatcher read path form the tested journey.

**Risk Summary:** Five explicit gap statements produce five scored risks. Four score ≥6; two score 9. Security, data integrity, reliability and operations need mitigation before release. The performance target needs device evidence. Every risk remains OPEN; proposed controls below require product and engineering decisions.

**Coverage Summary:**

- P0: 20 scenarios, approximately 40–60 hours.
- P1: 6 scenarios, approximately 12–20 hours.
- P2/P3: 1/0 scenarios, approximately 1–2/0 hours.
- Total: 27 scenarios, approximately 53–82 hours, 7–11 eight-hour working days or 1.5–2.5 working weeks for one contributor with prerequisites ready.

The repository contains the epic and config, with no application source, manifests, tests, fixtures or prior test designs. Existing coverage and flakiness are unverified. This document plans validation; test execution and final NFR assessment remain pending.

## Not in Scope

| Item | Reasoning | Mitigation |
| ---- | --------- | ---------- |
| Offline objects other than work orders | Epic explicitly excludes them. | Keep fixtures and acceptance assertions bounded to work orders. |
| Dispatcher console changes and broad browser regression | Epic excludes console changes. | Read the existing order view in C08 to verify delivery unchanged; console maintainers retain their existing regression scope. |
| Browser client, web view, visual redesign | Epic specifies native Android and unchanged rendering. | Use native device journeys; C11 checks the existing native presentation. |
| Charging logic and nightly payment execution | Epic says sync never calls billing and leaves its nightly schedule unchanged. | C10 checks the integration boundary; billing owners retain charge execution regression. |
| Shared-storage tenant isolation | Each installation has its own database and servers. | C10 verifies installation binding. A cross-tenant shared-database test matrix is inapplicable. |
| Regional residency routing changes | The platform routing layer is unchanged. | C10 checks the existing route remains in use; platform owners retain routing validation. |
| Compliance certification and unspecified fleet-wide capacity | The epic names neither a certification regime nor a concurrent fleet load target. | Cover the stated sensitive-data exposure and 2,000-item backlog. Record further thresholds as UNKNOWN. |

## Risk Assessment

Scores are probability × impact. Probability: 1 unlikely, 2 possible or unmeasured, 3 likely under an explicitly described failure mechanism. Impact: 1 minor, 2 degraded operation with recoverable work, 3 critical sensitive-data exposure, silent loss or core outage. Scores 6–8 require mitigation; score 9 blocks release while open. These are design rules; no implementation evidence gate has run.

The register has one row per explicit gap: unprotected queue, missing conflict control, unmeasured deadline, unsafe retry policy and irreversible release. Append-only edits are a trigger for ordering tests. Intended acceptance behavior adds coverage without adding residual risks.

### High-Priority Risks (Score ≥6)

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Timeline |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ---------- | ----- | -------- |
| R-001 | SEC | Plain SQLite file contains the full order payload and is not encrypted at rest; screen lock is the only protection (7.1). Access to queue bytes exposes stored card references and billing addresses. Extraction is possible; confidentiality impact is critical. | 2 | 3 | 6 | Minimize queued sensitive fields and define protected storage/key handling; inspect database and sidecars through C01. | Android lead + Security reviewer | Decide before storage-test implementation; verify before release. |
| R-002 | DATA | No version check and no timestamp check; later arrival overwrites earlier lines with no record (7.2). Two offline technicians can silently lose work. The described arrival-order behavior makes loss likely under that trigger. | 3 | 3 | 9 | Decide conflict detection/resolution and retained submissions; verify both arrival orders and recovery in C02. | Server lead + Product owner | Decide before conflict-test implementation; resolve before release. |
| R-004 | TECH | Retried immediately and indefinitely; no backoff, attempt cap or dead-letter path (7.3). A permanently rejected item produces continuous uploads and can prevent useful progress. Endless traffic is explicit under permanent rejection; queue starvation needs validation. | 3 | 3 | 9 | Define bounded retries, transient/terminal classification and a recoverable rejected-item path; validate worker progression in C03. | Android lead + Server lead | Decide before retry-test implementation; resolve before release. |
| R-005 | OPS | Enabled for every technician; no feature flag, no staged rollout, and disabling requires a store build taking one to three days (7.4). A defective release exposes all technicians throughout containment delay. A release defect is possible; blast radius and recovery delay are critical. | 2 | 3 | 6 | Decide reversible containment and staged distribution; rehearse containment and backlog-preserving recovery through C04. | Release lead + Product owner | Decide and rehearse before all-user distribution. |

### Medium-Priority Risks (Score 3-4)

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ---------- | ----- |
| R-003 | PERF | Full backlog of 2,000 items must finish syncing within 30 seconds on actual mid-range fleet devices (7.3); no measurement is supplied. Exceeding the target delays server availability. The source establishes a release budget; critical business cutoff or permanent loss from delay is UNKNOWN. | 2 | 2 | 4 | Measure network-restoration-to-final-acceptance on fleet devices using C09. Establish payload/network profiles before execution and complete evidence before release sign-off. | Android lead + Performance QA |

### Low-Priority Risks (Score 1-2)

No low-priority risks were identified from the supplied gap statements.

| Risk ID | Category | Description | Probability | Impact | Score | Action |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ------ |

### Risk Category Legend

- TECH: technical design and integration fragility.
- SEC: security and sensitive-data exposure.
- PERF: performance and capacity.
- DATA: loss, corruption and conflicting updates.
- BUS: business-rule and user-impact failures.
- OPS: release, recovery and operation.

## NFR Planning

This section defines thresholds and future evidence for `nfr-assess`. All evidence is pending.

| NFR Category | Requirement / Threshold | Risk Link | Planned Validation | Evidence Needed |
| ------------ | ----------------------- | --------- | ------------------ | --------------- |
| Security | Queue holds billing address and stored card reference in plaintext. Protection, minimization and retention acceptance policy: UNKNOWN. | R-001 | C01, Integration: inspect actual SQLite files and sidecars with synthetic sensitive markers, including residual data. | Storage report, extraction procedure, approved policy and key-handling review. |
| Data integrity | Captured content reaches dispatcher unchanged; two offline writers currently overwrite each other. Conflict resolution and retention policy: UNKNOWN. | R-002 | C02, API: controlled arrival orders and recoverable conflict records. | Request sequence, persisted versions, conflict/audit records and approved resolution oracle. |
| Performance | 2,000 queued items fully sync within 30 seconds after connectivity returns on fleet mid-range devices. | R-003 | C09, E2E: device-to-real-server timing for representative backlog profiles. | Device/build/OS, network and payload profile, monotonic timestamps, accepted item IDs/counts and client/server profiles. |
| Reliability | Automatic upload after usable network returns; current immediate infinite retry has no terminal path. Safe retry intervals, cap, jitter and dead-letter/recovery behavior: UNKNOWN. | R-004 | C03, Integration: controlled responses and virtual-clock attempt scheduling; C08 covers user-visible automatic delivery. | Worker attempt trace, queue state transitions, server acceptance and terminal-error handling record. |
| Operability | All-user launch; current disable delay is one to three days. Acceptable containment time, rollout cohorts and disable semantics: UNKNOWN. | R-005 | C04, E2E: exercise approved containment and store-build recovery with queued work. | Rehearsal timeline, release/build identifiers, queue reconciliation and recovery instructions. |

**Unknown thresholds:** Device model/OS matrix, usable-network profile, payload-size distribution, protection/retention policy, conflict policy, retry policy and release containment budget need decisions before their corresponding tests are executable. No numeric battery, memory, maintainability or concurrent-user SLO is supplied. Collect resource observations during device work; treat them as diagnostics. No additional scored risks arise from these clarification items.

## Entry Criteria

- [ ] QA, Dev and Product agree the epic interpretation and exclusions; mitigation acceptance policies are recorded.
- [ ] A candidate Android build and test server are accessible in an isolated single-customer installation.
- [ ] QA can seed orders, inspect queue state and server persistence, inject ordered responses and restore state.
- [ ] Two technician identities/devices can share an assigned order; an existing dispatcher read view is accessible.
- [ ] Synthetic parts, labour, card-reference and address fixtures are ready; each run cleans up its orders and device queue.
- [ ] Fleet device/OS, network and payload profiles are established for deadline testing.
- [ ] Storage, conflicts, retries and containment policies resolve the blockers for C01–C04. Characterization can start earlier with expected unsafe behavior documented.

## Exit Criteria

- [ ] P0 passes 100%; P1 passes ≥95%, with every failure triaged and any waiver approved.
- [ ] No open critical/high-severity defects or score-9 risks remain; high-risk mitigations have verification evidence.
- [ ] Every acceptance criterion, security scenario and critical journey has executed coverage; overall planned coverage is ≥80%.
- [ ] Both 2,000-item device profiles meet the 30-second deadline with complete server reconciliation.
- [ ] Queue confidentiality, conflict recovery, bounded retry and release containment have evidence under approved policies.
- [ ] Owners review residual risk and approve release. Formal NFR assessment follows when evidence exists.

## Project Team

Names are unavailable. Roles below are proposed responsibility assignments for this draft.

| Name | Role | Testing Responsibilities |
| ---- | ---- | ------------------------ |
| Unassigned | QA lead | Own traceability, device journeys, evidence and defect triage. |
| Unassigned | Android lead | Own queue/worker integration fixtures and local-storage remediation. |
| Unassigned | Server lead | Own server conflict policy, API verification and acceptance records. |
| Unassigned | Tech lead / Architect | Decide mitigation design and approve integration test seams. |
| Unassigned | Product owner | Approve conflict outcomes, retry recovery and rollout acceptance. |
| Unassigned | Security reviewer | Approve sensitive-data policy and review storage evidence. |
| Unassigned | Release / Platform lead | Own containment rehearsal, release recovery and routing boundary evidence. |

## Test Coverage Plan

P0/P1/P2/P3 express priority. Execution timing is specified in Execution Strategy. Each C identifier denotes one coverage row; suffixes identify its atomic scenarios. Every scored risk has exactly one linked row at its first observable boundary. A `-` Risk Link denotes acceptance or regression coverage without a scored gap.

### P0 (Critical)

**Criteria:** Critical business, security, data-integrity or compliance impact with no safe workaround. Risk score supplies evidence; business consequence sets priority.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |
| C01: 7.1 queue confidentiality | Integration | R-001 | 3 | Android + Security | Mechanism: plaintext sensitive payload crosses one owned SQLite file boundary, observable by byte inspection. C01a inspect primary database after offline save; C01b inspect WAL/journal sidecars during repeated edits; C01c inspect retained bytes after acceptance/removal under the approved retention policy. Use synthetic card/address markers. Current storage is expected to expose them; protected-storage acceptance needs the proposed policy. Exposure has no source-backed safe workaround; screen lock leaves file contents unprotected. |
| C02: 7.2 preserve concurrent and stale submissions | API | R-002 | 4 | Server + QA | Mechanism: server accepts stale edits across one service HTTP boundary and replaces earlier lines. C02a submit offline writers A then B; C02b reverse arrival; C02c deliver an older same-device appended revision after a newer revision; C02d recover both submitted payloads through the agreed conflict record. Seed disjoint parts/labour lines and inspect server state. Current behavior characterizes loss; mitigation oracle must preserve or explicitly reconcile both contributions. Silent lost lines have no recorded recovery or safe workaround. |
| C03: 7.3 safe retry and queue progress | Integration | R-004 | 5 | Android + Server | Mechanism: worker response handling crosses one owned queue/event boundary; observe attempts with a controlled endpoint. C03a transient failure then acceptance; C03b permanently invalid payload reaches recoverable terminal handling; C03c rate-limited response follows approved retry timing; C03d rejected head item permits valid later item progress; C03e worker restart preserves attempt/recovery state. Assert virtual-clock schedule and queue disposition against the decided policy. Current infinite retry is an expected characterization failure of safe behavior. Halting the app leaves captured work unresolved; recovery is absent from the source. |
| C04: 7.4 contain and recover release | E2E | R-005 | 2 | Release + QA | Mechanism: all-user distribution and recovery span Android build, server and release channel. C04a rehearse approved containment with queued work intact and verify subsequent recovery; C04b replace a defective build through the store test channel, preserve backlog and reconcile final server orders. A kill switch and staged rollout are proposed controls; execution waits for an agreed release design. Current recovery requires a new build and one to three days; no prompt source-backed containment exists. Fleet-wide disruption without safe recovery makes this P0. |
| C05: AC1, 7.1 save visibly captured offline | E2E | - | 1 | QA | C05a open a preloaded existing work order, remove connectivity, add parts and labour, save, and reopen its captured listing with exact lines. Boundary: technician journey across native app and durable local queue. Lost work after an apparent save blocks the core offline task; paper capture requires later re-keying and cannot recover a falsely saved payload. |
| C06: AC2, 7.2 edit until server acceptance | E2E | - | 1 | QA | C06a keep server acceptance delayed, edit the queued order in native UI, save and reopen the latest fields; verify editing remains possible throughout the pending period. Boundary: native journey with controlled acceptance. Unavailable edits leave the core captured order unresolved. No supported workaround is stated. Acceptance is the specified boundary; post-acceptance editing policy is outside this criterion. |
| C07: 7.1–7.3 persistence and acceptance transitions | Integration | - | 3 | Android + Server | C07a interrupt/fail the local transaction and verify captured status occurs only after durable success, including reopen; C07b append two edits and verify earlier queue entries persist and latest local content is reconstructed after process restart; C07c lose the acknowledgement after server commit, replay, and reconcile one logical order with exact lines. Boundaries: queue persistence and acceptance state transitions. These assert atomicity, append semantics and replay integrity, distinct from UI editability and server conflict policy. False success or replay corruption has no safe recovery stated. |
| C08: AC3/AC4, 7.3 automatic delivery unchanged | E2E | - | 1 | QA | C08a capture and edit offline, restore usable connectivity without touching the app, await server acceptance, and read the existing dispatcher view. Compare work-order identity, parts, labour and all saved business fields to the final expected payload. Boundary: Android client, application server and dispatcher read path. Verify queue disposition only after acceptance. Failure prevents dispatch from receiving captured work; no supported fast recovery is stated. |

**Total P0:** 20 scenarios, approximately 40–60 hours.

The P0 share reflects the epic's sensitive payload, explicitly destructive writes, unbounded retry and slow release recovery. These consequences justify P0 independently. Intended save/edit/delivery scenarios protect the same core work at distinct observable boundaries. No low-value scenarios were added to change the priority distribution.

### P1 (High)

**Criteria:** Core, frequent or complex behavior with material user reach and a limited workaround. Priority follows consequence and recoverability.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |
| C09: 7.3 backlog deadline | E2E | R-003 | 3 | Performance QA + Android | Mechanism: full queue drainage spans native device scheduling, local reads, transport and server acceptance; the real-device deadline requires E2E. C09a one-item timing baseline; C09b 2,000 representative queued items; C09c 2,000 items at the large end of the agreed representative payload profile, including repeated order edits. Start at restored usable connectivity, before OS callback processing; finish at final item acceptance with final order reconciliation. C09b/c must each take ≤30 seconds on agreed actual mid-range fleet devices. Missing the budget delays availability while queued work remains pending. A critical business cutoff or permanent loss from latency is unstated; no manual speedup is provided. This material delay supports P1 and remains release-blocking through the explicit acceptance budget. |
| C10: unchanged installation, routing and billing boundaries | API | - | 3 | Server + Platform | C10a submit through the installation-bound service and verify persistence in its dedicated database/config binding; C10b verify the existing regional route remains selected for sync traffic; C10c verify sync makes zero billing calls and leaves nightly schedule configuration unchanged. Boundary: existing service HTTP integration, supported by configuration and dependency spies. These are satisfied scope constraints with no new scored exposure. They guard integration behavior; billing execution and platform routing internals remain owned elsewhere. |

**Total P1:** 6 scenarios, approximately 12–20 hours.

### P2 (Medium)

**Criteria:** Secondary behavior with narrower user reach and an acceptable workaround.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |
| C11: unchanged native presentation | Component | - | 1 | Android | C11a compare the existing captured/edit presentation with its established native baseline using long representative parts/labour labels. One rendered interface boundary; assert state labels remain legible. Limit this secondary regression to cosmetic clipping where the order stays readable on reopening and data remains intact. Functional save/edit failures are handled in C05/C06. Rendering changes are outside this epic. |

**Total P2:** 1 scenario, approximately 1–2 hours.

### P3 (Low)

**Criteria:** Rare, cosmetic or experimental behavior with minimal impact and an easy workaround.

No additional source-supported scenarios fit this band.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |

**Total P3:** 0 scenarios; no effort allocated.

### Acceptance Traceability

| Epic acceptance criterion | Planned coverage |
| ------------------------- | ---------------- |
| AC1: no-connectivity save is listed as captured | C05a; C07a verifies durable-success ordering. |
| AC2: captured order remains editable until accepted | C06a; C07b verifies append/reconstruction behavior. |
| AC3: queue uploads without technician action when network returns | C08a; C09b/c enforce the backlog budget. |
| AC4: server-accepted order appears unchanged on dispatcher's console | C08a; C02 addresses the explicitly destructive concurrent case. |

## Execution Strategy

Run all functional scenarios in pull requests while measured wall time stays below 15 minutes. Priority controls triage order: bootstrap smoke, P0, then P1 and P2/P3. It does not determine cadence.

- **Pull request:** Run functional API, SQLite/worker integration, native component and compact native journey coverage. Use controlled network responses and isolated fixtures. Parallel execution may be configured in the eventual runner; runtime and framework availability are currently unverified.
- **Nightly:** Run actual fleet-device matrix, backlog measurements and repeated connectivity/lifecycle transitions. Physical-device infrastructure and repeated performance measurements justify this cadence.
- **Weekly:** Run extended permanent-failure soak and release containment/recovery rehearsal. Their sustained duration and release-channel dependency justify this cadence.

Release candidates require current evidence from all release-blocking suites regardless of cadence. Android instrumentation/device automation and API tooling are to be selected during setup. Playwright parallelization is inapplicable to the native client; no browser runner is prescribed. A backend load tool can diagnose server capacity, while C09 retains the real-device completion oracle.

## Resource Estimates

### Test Development Effort

| Priority | Count | Hours/Test | Total Hours | Notes |
| -------- | ----- | ---------- | ----------- | ----- |
| P0 | 20 | Varies by fixture and boundary | ~40–60 | Security storage, conflict/retry control, native journeys and release rehearsal setup. |
| P1 | 6 | Varies by device and environment | ~12–20 | Device timing/reconciliation and unchanged integration boundaries. |
| P2 | 1 | ~1–2 | ~1–2 | Existing native presentation baseline. |
| P3 | 0 | N/A | 0 | No scenarios allocated. |
| **Total** | **27** | **Varies** | **~53–82** | **~7–11 days; ~1.5–2.5 working weeks.** |

Ranges include test automation, synthetic data, response controls, cleanup and initial evidence capture. They exclude production remediation, device procurement, store review delay and organization approval lead time. Scenario counts precede device/profile parameterization; estimates need revision after the fleet matrix is established.

### Prerequisites

**Test Data:** Isolated existing work orders with parts/labour, repeated revisions, two assigned technicians, synthetic billing addresses/card references, a permanently rejected item and representative 2,000-item datasets. Stable test IDs must reconcile each queued operation with server acceptance. Restore queue state and remove server records after every run.

**Tooling:** Pending Android instrumentation/device runner, read-only SQLite/sidecar inspection, controllable transport responses, virtual-clock worker harness, server persistence inspection and monotonic device timing/profiling. No Pact dependencies or contract-testing requirement were found; no Pact tools are assumed.

**Environment:** Pending isolated installation, actual mid-range fleet devices, two-device concurrent offline setup, controllable connectivity, server/dispatcher access, and store test-channel access for recovery. Rooted/test extraction must use synthetic payloads; preserve representative runtime behavior for timing.

## Quality Gate Criteria

### Pass/Fail Thresholds

- P0: 100% pass; every planned P0 scenario must execute.
- P1: ≥95% pass; failures require triage and an approved owner/reason/expiry waiver. With six atomic scenarios, a single failure falls below 95%.
- P2/P3: ≥90% pass is informational; no P3 denominator applies.
- High-risk mitigations: 100% verified before release. Any exceptional waiver requires accountable approval, reason, expiry and recovery plan; none is granted here.
- Open score-9 risks block release. Security exposure and silent data-loss defects require resolution.

### Coverage Targets

- Overall planned scenarios: ≥80% implemented and executed; all four acceptance criteria, all critical journeys and all security scenarios: 100%.
- Critical paths: 100%, strengthened from the template minimum because queued orders contain sensitive data and can be lost silently.
- Business logic: ≥70%; identified edge cases: ≥50%. These are planning targets, not measured code coverage. No source exists to report code coverage.
- The explicit 2,000-item/30-second budget must pass on actual agreed fleet devices, even though its scenario priority is P1.

### Non-Negotiable Requirements

- [ ] All P0 scenarios pass; no high-severity issue remains open.
- [ ] R-001, R-002, R-004 and R-005 mitigations have approved policies and verification evidence.
- [ ] Security scenarios pass 100%; sensitive test markers have the approved storage disposition.
- [ ] Device performance evidence meets the epic's deadline and reconciles every submitted item.
- [ ] Evidence exists for every in-scope NFR; run `nfr-assess` after implementation to determine its formal outcome.

This workflow issues no implementation PASS/CONCERNS/FAIL decision. The subsequent trace workflow requires collected coverage evidence for its gate.

## Mitigation Plans

All mitigation strategies are proposals. Current source behavior remains the characterization baseline. Product and technical owners must agree new pass conditions before automation treats a proposed control as a release requirement.

### R-001: Plaintext queue exposure (Score: 6)

**Strategy:** Identify fields essential for offline work; remove unnecessary card/address copies where feasible. Decide local storage protection and key lifecycle. Include SQLite sidecars and residual bytes in the protection/retention design.  
**Owner:** Android lead + Security reviewer.  
**Timeline:** Design before C01 implementation; verify before release.  
**Status:** Planned; OPEN.  
**Verification:** C01 storage evidence matches the approved policy while offline save/edit remains usable. Residual device-compromise exposure requires a documented security disposition.

### R-002: Silent overwrites (Score: 9)

**Strategy:** Preserve submitted revisions, detect stale/concurrent edits and decide explicit merge or conflict recovery semantics. Define how both technicians' contributions remain recoverable.  
**Owner:** Server lead + Product owner.  
**Timeline:** Policy before C02 implementation; resolve before release.  
**Status:** Planned; OPEN.  
**Verification:** C02 demonstrates both arrival orders and delayed revision handling with recoverable history. A successful HTTP response alone cannot prove integrity. Residual conflicts need an operator/user recovery owner.

### R-003: Unmeasured backlog deadline (Score: 4)

**Strategy:** Agree fleet, network and payload profiles; measure the complete client/server path and improve batching/scheduling only if evidence identifies a bottleneck.  
**Owner:** Android lead + Performance QA.  
**Timeline:** Profiles before performance execution; evidence before release sign-off.  
**Status:** Planned; OPEN.  
**Verification:** C09 produces per-run timing and item reconciliation. Network conditions outside the agreed profile remain a documented limitation. An unstated critical business cutoff remains a clarification item.

### R-004: Infinite immediate retry (Score: 9)

**Strategy:** Classify transient and permanent responses, define backoff/jitter and finite retry policy, and provide durable rejected-work handling plus a recovery path. Define queue progression so rejected work cannot silently block healthy orders.  
**Owner:** Android lead + Server lead.  
**Timeline:** Policy before C03 implementation; resolve before release.  
**Status:** Planned; OPEN.  
**Verification:** C03 proves schedule, attempt bounds, valid-item progress and preserved recovery state. Resource observations during soak support diagnosis. Terminal recovery workload remains owned by operations after remediation.

### R-005: All-user release with delayed disable (Score: 6)

**Strategy:** Decide reversible containment and staged distribution before shipping. Specify how containment handles existing queue entries, accepted work and re-enable/recovery. Prepare a replacement-build path that preserves local schema and queue data.  
**Owner:** Release lead + Product owner.  
**Timeline:** Design and rehearsal before all-user release.  
**Status:** Planned; OPEN.  
**Verification:** C04 measures the approved containment procedure and reconciles backlog after recovery. Store review still takes one to three days under the source plan; any remaining dependence on it requires explicit release-risk acceptance.

## Assumptions and Dependencies

### Assumptions

1. The epic is complete for this run. PRD, architecture and sprint status are inapplicable; their absence is intentional.
2. Native Android and SQLite are source facts. OS versions, devices, server stack, endpoint routes and runner names are UNKNOWN. No endpoints, selectors or framework configuration are invented.
3. Tests use synthetic sensitive markers. The stored card reference is treated as a sensitive reference; the epic does not describe raw card numbers or a compliance certification.
4. Proposed conflict, retry, storage and release controls require approval. Characterization records current unsafe behavior and does not establish release safety.
5. Backlog size counts queued entries, including appended revisions. Final order state and every operation's disposition must reconcile; 2,000 queue entries can represent fewer distinct orders.

### Dependencies

1. Android/Server/Product must decide mitigation policies before C01–C04 automation is finalized.
2. QA/Platform must provide isolated data, server inspection and fault injection before integration execution.
3. Fleet owners must identify actual mid-range models and representative networks/payloads before C09 execution.
4. Release owners must provide a test distribution/recovery path before C04 execution.
5. Dispatcher/billing/platform owners must coordinate read access and existing regression evidence before release sign-off. No messages have been sent by this workflow.

### Risks to Plan

- Unavailable builds or test seams prevent measurement. Record affected scenarios as blocked; retain the corresponding OPEN risk.
- Unknown policies prevent defensible pass/fail oracles. Record the decision owner and use characterization results until acceptance policy exists.
- A wider device matrix or asynchronous store recovery increases elapsed time. Revise estimates after access and profiles are known.

## Follow-on Workflows (Manual)

Run `/bmad-tea-automate` explicitly in red mode for approved P0 scenarios, then broaden coverage after implementation. Framework and CI setup are separate work. Run `nfr-assess` once evidence exists and trace coverage before release. This run generates no tests.

## Approval

**Test Design Approved By:**

- [ ] Product owner: unassigned; date pending.
- [ ] Tech lead: unassigned; date pending.
- [ ] QA lead: unassigned; date pending.

**Comments:** Exclusions, mitigation policies and residual-risk acceptance require stakeholder review. No approval or waiver is claimed.

## Interworking & Regression

No existing test inventory is present. The scopes below define required future validation and evidence to request from owners.

| Service/Component | Impact | Regression Scope |
| ----------------- | ------ | ---------------- |
| Android order screen | Offline captured/edit state uses the existing screen. | C05/C06/C11; existing online save/edit flows must remain valid. Android + QA coordinate. |
| SQLite outbound queue | Durable capture, appended revisions, sensitive payload storage. | C01/C07; restart reconstruction and acceptance cleanup. Android owns evidence. |
| Network-driven worker | OS usable-network event starts uploads and retry handling. | C03/C08/C09; acceptance boundaries, terminal handling and automatic resume. Android/Server coordinate. |
| Order API and database | Concurrent submissions can overwrite earlier work. | C02/C07/C10; existing online order persistence and retrieval checks must pass. Server owns conflict oracle. |
| Dispatcher read view | Displays accepted order without feature changes. | C08 exact-content read assertion; console owner retains existing display regression. |
| Billing service | Nightly stored-reference charge path remains unchanged. | C10 verifies no sync-triggered call and unchanged schedule binding; billing owner retains charge regression. |
| Regional routing and installation deployment | Existing regional route and dedicated persistence remain in force. | C10 verifies unchanged bindings; Platform retains established routing/deployment checks. |
| Store release/recovery | Feature currently reaches all technicians with slow disable. | C04 contains and recovers defective build while preserving queued work. Release owner supplies rehearsal evidence. |

## Appendix

### Knowledge Base References

- `risk-governance.md`: category ownership, mitigation and release-risk tracking.
- `probability-impact.md`: 1–3 scoring scales and action thresholds.
- `test-levels-framework.md`: observable boundary and test-level selection.
- `test-priorities-matrix.md`: priority by consequence, reach and recoverability.
- `nfr-criteria.md`: threshold/evidence planning with UNKNOWN values preserved.

The deterministic fragment selection loaded the four mandatory epic fragments and NFR criteria. Config flags for browser and integration libraries were unspecified. No optional browser/Pact branch matched. Native Android is explicit in the epic; repository manifests were absent. No browser session was opened and capability probing remained disabled.

### Related Documents

- Epic and sole requirements source: [Epic 7](../../docs/epics/epic-7-offline-order-capture.md), Context, Stories 7.1–7.4, Acceptance criteria and Out of scope.
- Configuration: [TEA/core config](../../_bmad/config.toml).
- Template: `skill/test-design-template.md`.
- Workflow validation: `skill/checklist.md`.
- PRD, architecture, tech spec, sprint status and prior system design: N/A for this run.

### Quality & Testing Progress

2026-10-14: Steps 1–5 completed sequentially for `epic-7`; output checked against applicable epic-level checklist items. Five unique risks have integer scores, correct products and one primary coverage row each. Twenty-seven scenarios cover all acceptance criteria. Empty risk/priority bands remain empty. Effort is interval-based. Decisions, evidence, stakeholder approval and test execution remain pending as stated above. System-level deliverables, Playwright/browser instructions and external status-file integration are inapplicable. No requirements files were changed.

**Generated by:** BMad TEA Test Architect workflow  
**Workflow:** `bmad-tea-test-design`  
**Template version:** 4.0
