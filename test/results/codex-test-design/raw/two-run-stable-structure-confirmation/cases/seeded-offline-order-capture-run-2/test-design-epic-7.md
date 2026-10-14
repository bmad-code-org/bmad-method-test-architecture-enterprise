---
runScope: 'epic'
runKey: 'epic-7'
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-10-14'
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

# Test Design: Epic 7: Offline order capture for field technicians

**Date:** 2026-10-14
**Author:** tea-eval-harness
**Status:** Draft; all scenarios planned; approval pending

---

## Executive Summary

**Scope:** Full epic-level test design for Epic 7; run key `epic-7`; Create mode; sequential execution; capability probe disabled.

Native Android offline work-order capture, append-only queued edits, automatic sync and fleet release are in scope. The epic is the sole requirements source. The repository contains no implementation or existing tests. All coverage and evidence described here are planned.

**Risk Summary:**

- Total risks identified: 5.
- High-priority risks (≥6): 4, including 3 critical risks with score 9.
- Critical categories: SEC, DATA and TECH. OPS is high; PERF is medium.
- All risks remain OPEN. Plaintext queued customer data, silent concurrent-edit loss and unbounded immediate retries require remediation before release.

**Coverage Summary:**

- P0 scenarios: 12; approximately 36 to 60 hours.
- P1 scenarios: 15; approximately 23 to 45 hours.
- P2/P3 scenarios: 0; 0 hours.
- **Total effort:** approximately 59 to 105 hours; 8 to 14 person-days at 8 hours/day, excluding shared harness setup and product remediation.

Risk score determines mitigation urgency. Test priority separately reflects business consequence, reach and recoverability. The 30-second backlog target remains a release acceptance condition with P1 coverage; the epic does not establish permanent loss or a critical business cutoff when the target is missed.

---

## Not in Scope

| Item | Reasoning | Mitigation |
| ---- | --------- | ---------- |
| Offline entities other than work orders | Explicitly excluded by the epic. | Keep their existing online behavior under the owning teams' regression coverage. |
| Dispatcher console implementation and visual changes | Epic excludes console changes; technician client is native Android with no browser or web view. | AC4 checks the unchanged order through the existing console read path; console owners retain their existing regression suite. |
| Card charging and billing schedule | Context and scope state that the nightly billing service is untouched and never called by this epic. | Verify zero billing-service invocations from capture/edit/sync; billing owners run their existing nightly-charge regression. Use synthetic stored card references. |
| Regional routing redesign and residency policy | Context states regional routing already enforces residency and is unchanged. | Run the existing configured-region routing regression for a synced order. |
| Shared-storage multi-tenant isolation design | One customer organization per installation; each has separate database and application servers. | Retain separate-installation isolation regression; no new shared-storage exposure is asserted. |
| Test generation and implementation changes | This run produces a design artifact. | Tests, control changes and implementation evidence belong to subsequent authorized work. |

---

## Risk Assessment

Five gap statements are registered in source order: unprotected SQLite payload, absent concurrent-edit checks/history, unmeasured backlog deadline, unbounded retry policy and absent rapid release containment. The deadline and retry policy have different missing controls and remain separate. Intended behavior adds acceptance coverage. Already satisfied isolation, billing and residency controls remain scope constraints.

Probability: 1 unlikely; 2 possible; 3 likely or explicitly unsafe behavior. Impact: 1 minor; 2 degraded operation with pending work; 3 critical exposure, lost data or core/fleet disruption. Score = Probability × Impact. Scores ≥6 require mitigation; an unresolved score 9 blocks release under the planned risk gate. Scores 3 to 4 are monitored; scores 1 to 2 are documented. Role owners are proposed and must be confirmed before execution.

### High-Priority Risks (Score ≥6)

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Timeline |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ---------- | ----- | -------- |
| R-001 | SEC | Plain SQLite file holds the full order payload and is not encrypted at rest; screen lock is the only protection (7.1). Extracted queue files expose card references and billing addresses. Exposure is present by design; sensitive customer data has critical impact. | 3 | 3 | 9 | Protect queued data at rest, minimize sensitive fields and verify extracted files; security policy approval required. | Android lead + security lead (role assignments proposed) | Before security sign-off and fleet release |
| R-002 | DATA | No version check and no timestamp check; later arrival overwrites earlier lines with no record (7.2). Concurrent offline technicians lose work silently. Deterministic loss under the stated concurrency has critical impact. | 3 | 3 | 9 | Approve conflict detection/resolution and retained edit history; verify both arrival orders. | Server lead + product owner (proposed) | Before sync acceptance sign-off |
| R-004 | TECH | Failed upload is retried immediately and indefinitely with no backoff, attempt cap or dead-letter path (7.3). A permanently rejected payload loops at network speed, consumes device/server resources and may delay valid orders. This behavior is explicit and can disrupt core sync. | 3 | 3 | 9 | Approve bounded transient retries and durable isolation/recovery of permanent failures. | Android lead + server lead (proposed) | Before resilience sign-off |
| R-005 | OPS | Enabled for every technician in a single release; no feature flag, staged rollout or disable path without a store build taking one to three days (7.4). A faulty rollout exposes the whole fleet until replacement. Incident probability is possible; impact is critical fleet-wide disruption. | 2 | 3 | 6 | Approve rapid containment and controlled rollout capability; rehearse disabling sync while preserving captured data. | Release lead + product owner (proposed) | Before release approval |

### Medium-Priority Risks (Score 3-4)

One performance risk in this band.

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ---------- | ----- |
| R-003 | PERF | Up to 2,000 queued items must finish syncing within 30 seconds on fleet mid-range devices (7.3); the target is unmeasured. A full-day backlog may remain pending beyond the required window. Probability is possible; impact is degraded timely delivery. The epic supplies no permanent-loss consequence for exceeding 30 seconds. | 2 | 2 | 4 | Profile complete device-to-server drain and tune bottlenecks; deadline: before performance sign-off. | Android lead + performance QA (proposed) |

### Low-Priority Risks (Score 1-2)

No identified risks in this band.

| Risk ID | Category | Description | Probability | Impact | Score | Action |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ------ |

### Risk Category Legend

- **TECH:** Technical fragility and integration behavior.
- **SEC:** Access controls and data exposure.
- **PERF:** Performance budget and resource limits.
- **DATA:** Data loss, corruption and inconsistency.
- **BUS:** Business logic and user impact.
- **OPS:** Release, containment and monitoring operations.

---

## NFR Planning

**Purpose:** Plan validation evidence for later `nfr-assess`. Implementation evidence has not been collected.

| NFR Category | Requirement / Threshold | Risk Link | Planned Validation | Evidence Needed |
| ------------ | ----------------------- | --------- | ------------------ | --------------- |
| Security | Full payload includes stored card reference/address in unencrypted SQLite. Approved at-rest protection, key lifecycle and field minimization policies: UNKNOWN. | R-001 | Inspect active, edited and post-acceptance SQLite files and associated journal/WAL files using synthetic canary data. Validate proposed protection and recoverability against the approved policy. | File inspection report, protection/key-handling evidence and security approval. |
| Data integrity | Source permits concurrent work-order edits to overwrite earlier technician lines without record. Conflict detection, reconciliation and retained-history policy: UNKNOWN. | R-002 | API arrival-order permutations and stale replay against real server persistence; verify the approved conflict policy preserves both contributions or exposes an explicit recoverable conflict. | Request ordering, persisted lines, conflict responses and retained history. |
| Performance | Full 2,000-item backlog completes within 30 seconds of regaining usable connectivity on fleet mid-range devices. | R-003 | Measure real-device full queue drain using a monotonic clock through final server acceptance and local acknowledgement; verify item identity/count/content. | Device model/OS/network/payload profile, elapsed timings, queue counts, server acceptance records and CPU/memory traces. |
| Reliability | Immediate indefinite retries lack backoff, attempt cap and dead-letter path. Desired bounded retry and permanent-failure recovery policy: UNKNOWN. | R-004 | Fault injection across uploader/queue boundary with permanent rejection, transient failure and lifecycle/network changes; assert approved retry cadence, durable failure state and valid-item progress. | Upload attempt timestamps, error class, queue transitions, recovery evidence and resource traces. |
| Operations | Entire fleet enabled at once; disabling requires a store build with 1–3 days review delay. Desired containment SLA: UNKNOWN. | R-005 | Rehearse approved containment and resume/replacement path with pending orders on representative installed clients and server. | Timed containment/recovery logs, build/control identifiers and before/after queue reconciliation. |
| Maintainability | Numeric source quality and coverage thresholds: UNKNOWN in requirements. Plan targets are specified below. | - | Later CI/static checks and ownership review for implemented capture/sync logic. | Source quality report, executed-test inventory, coverage reports and reproducible build/run instructions. |
| Compliance / residency | Regional routing unchanged; applicable privacy/retention requirements: UNKNOWN. No card PAN is stated. | - | Existing configured-region regression; security owner determines applicable rules without assuming a certification regime. | Regional routing regression and approved retention/data-classification policy. |

**Unknown thresholds:** Exact fleet models and Android versions; representative network bandwidth/latency; maximum payload size and field distribution; conflict resolution/history retention; key/protection policy; transient retry cadence/cap; permanent-failure recovery deadline; containment SLA; maintenance quality thresholds. Product, security and engineering owners must resolve these before the affected tests can receive final verdicts. The supplied 2,000-item/30-second acceptance threshold remains fixed. No general-purpose example SLO from the knowledge base is adopted.

---

## Entry Criteria

- [ ] QA, Dev and Product confirm this design, scope and proposed ownership.
- [ ] A representative release-like native Android build and isolated server installation are accessible; existing work orders can be preloaded before connectivity is removed.
- [ ] Synthetic customer/card-reference/address data, dual-technician identities and a 2,000-item backlog fixture are ready with cleanup.
- [ ] Device connectivity, OS lifecycle and server rejection/acknowledgement timing can be controlled; queue/server state and attempt timestamps are observable.
- [ ] Representative fleet hardware and a recorded network/payload profile are available for deadline validation.
- [ ] Approved security, conflict, retry and containment policies are available for remediation verification. Characterization of the current stated failures can start earlier.
- [ ] Dispatcher console read access and existing isolation/routing/billing regression owners are available.

---

## Exit Criteria

- [ ] All P0 scenarios pass; P1 pass rate is ≥95% and each remaining failure has an authorized documented waiver.
- [ ] All four acceptance criteria have executed coverage; planned critical-path coverage reaches ≥80% and security coverage reaches 100%.
- [ ] No open high-severity bugs or unmitigated score ≥6 risks remain. Score 9 risks have verified remediation.
- [ ] All 2,000 valid queue entries reach the server within 30 seconds on the approved fleet/device/network profile with content intact.
- [ ] Customer data protection, concurrent-edit recovery, poison-item handling and fleet containment have the planned evidence and owner sign-off.
- [ ] Installation isolation, regional routing, online order editing, dispatcher visibility and charging regressions pass or have documented upstream evidence.
- [ ] Each in-scope NFR has evidence for subsequent `nfr-assess`; unknown policy thresholds are resolved or have explicit time-bound waivers. This document supplies no execution verdict.

---

## Project Team

Names are unknown. The following role assignments are proposed to make execution ownership explicit.

| Name | Role | Testing Responsibilities |
| ---- | ---- | ------------------------ |
| TBD | Android lead | SQLite protection, queue append behavior, serializer, retry and device lifecycle fixtures. |
| TBD | Server lead | Concurrent-edit policy, persisted-state/API verification and dispatcher data parity. |
| TBD | QA lead / performance QA | Native journeys, physical-device backlog measurements, traceability and evidence collection. |
| TBD | Security lead | Customer-data threat review, protection policy and security sign-off. |
| TBD | Release / platform lead | Fleet containment rehearsal and existing routing/isolation coordination. |
| TBD | Tech lead / architect | Confirm cross-boundary control decisions, testability interfaces and build/persistence compatibility. |
| TBD | Product owner | Conflict/recovery acceptance, unknown business consequences and release approval. |

---

## Test Coverage Plan

P0–P3 indicate business priority. The separate Execution Strategy section determines run timing.

AC1: offline save and captured listing. AC2: edit until server acceptance. AC3: automatic upload on usable network. AC4: unchanged order in the existing dispatcher console. These identifiers follow the epic's acceptance-criteria order.

Each scored risk appears in exactly one primary row, at the level where its failure first becomes observable. Rows with `-` cover intended behavior or satisfied constraints. Notes enumerate atomic scenarios; Test Count is their count. Layered acceptance checks have distinct oracles: serializer equality, SQLite append persistence and complete user-visible delivery. No existing executable coverage or flakiness history is present in this repository.

### P0 (Critical)

**Criteria:** Critical business, security, data-integrity or compliance impact with no safe workaround. Risk score is supporting evidence and is not a required condition.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |
| 7.1 queued customer data protection | Integration | R-001 | 3 | Android + security QA | Plaintext exposure first observable across the owned SQLite file boundary, hence Integration. Scenarios: extracted active queue; extracted queue after edit; residual files after acceptance. Assert approved protection/minimization policy. Screen lock supplies no file-level mitigation. |
| 7.2 concurrent offline edits | API | R-002 | 3 | Server + QA | Silent overwrite first observable at one server's HTTP acceptance/persistence boundary, hence API. Scenarios: A then B; B then A; replay an earlier A after B. Capture both technicians' lines and conflict/history evidence under a policy approved downstream. Original spec loses data without recovery. |
| 7.3 rejection loop containment | Integration | R-004 | 4 | Android + QA | Immediate unbounded retry first observable across queue/uploader event boundary, hence Integration. Scenarios: permanent rejection alone; poison followed by valid entry; transient rejection then success; continued failure across network flaps/restart. Observe request cadence, retained failures, valid progress and recovery under approved retry policy. Source gives no bounded recovery path. |
| 7.4 fleet release containment | E2E | R-005 | 2 | Release + QA | Disable and recovery span installed Android builds and deployed control/store release path, hence E2E. Scenarios: containment with pending queue; re-enable/replacement build with pending queue. Require approved containment SLA and zero captured-data loss. Current store-only recovery takes 1–3 days across every technician; rapid safe recovery is unresolved. |

**Total P0:** 12 scenarios; approximately 36 to 60 hours.

### P1 (High)

**Criteria:** Core, frequent or complex behavior with material user reach and a limited workaround. Risk score is supporting evidence and is not a required condition.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |
| AC1, AC4 offline capture to dispatcher | E2E | - | 2 | QA | Native Android user journey through server and existing dispatcher. Scenarios: parts-only and mixed parts/labour. Disable device network before saving; verify newly captured listing, then restore usable network and compare dispatcher order with submitted lines and payload. Core capture/delivery journey with material field-user reach; Context gives paper capture and later re-keying as a limited manual workaround. Integrity failures are addressed in the primary risk rows. |
| 7.3 2,000 items within 30 seconds | E2E | R-003 | 3 | Performance QA | Deadline first observable on real fleet mid-range devices across native queue and server, hence E2E. Scenarios: full parts payload backlog; mixed parts/labour backlog; backlog containing successive edits. Measure from usable connectivity to all 2,000 acceptances and queue acknowledgement, require ≤30 seconds and content integrity. Late delivery is documented degradation; critical consequence and permissible late recovery window UNKNOWN. |
| AC2 editing until acceptance | E2E | - | 2 | QA | Native user journey: edit while offline; edit while upload is held before server acceptance. Verify latest lines and editable captured state until actual acceptance. Core frequent behavior; offline re-keying workaround is manual. |
| AC3 automatic usable-network upload | E2E | - | 1 | QA | Device offline -> OS usable network -> unattended upload. Require acceptance without tap/relaunch; record state transitions. |
| 7.2 each edit appends a queue entry | Integration | - | 2 | Android | Owned SQLite boundary: one edit appends while original remains; multiple edits survive app process restart. Assert payload and ordered queue entries. |
| AC4 full order payload unchanged | Unit | - | 2 | Android | Pure serialization: parts payload round trip; mixed parts/labour with synthetic card reference/address round trip. Exact semantic equality; independent of dispatcher journey. |
| Installation isolation scope constraint | API | - | 1 | Server | Existing isolation regression across one server HTTP boundary: credentials/order ID from installation A queried against B yield no A data. Separate databases/servers already specified; no scored isolation gap. |
| Regional routing scope constraint | API | - | 1 | Platform | Existing regional-routing regression: captured/synced fixture uses its installation's configured regional endpoint/storage path. Routing unchanged. |
| Charging unchanged scope constraint | Integration | - | 1 | Android + server | Capture/edit/sync boundary emits zero billing-service calls; inspect dependency call recording. Existing nightly billing behavior remains an upstream regression responsibility. |

**Total P1:** 15 scenarios; approximately 23 to 45 hours.

### P2 (Medium)

**Criteria:** Secondary behavior with narrower user reach and an acceptable workaround. Priority follows business consequence separately from risk score.

No P2 scenarios: the epic specifies core capture/sync and its security, integrity and release controls.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |

**Total P2:** 0 scenarios; 0 hours.

### P3 (Low)

**Criteria:** Rare, cosmetic or experimental behavior with minimal impact and an easy workaround. Priority follows business consequence separately from risk score.

No P3 scenarios: the epic states that order-screen rendering is unchanged.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |

**Total P3:** 0 scenarios; 0 hours.

---

## Execution Strategy

**Philosophy:** Execution timing is separate from P0–P3 priority. This design run is sequential. Proposed execution uses a measured PR budget below 15 minutes with isolated state and deterministic event/acceptance waits.

- **Pull request:** All functional classes from the coverage plan, including negative and regression scenarios, while measured suite duration remains below 15 minutes. Use native Android/device instrumentation, API and SQLite harnesses as appropriate. Keep complete journeys small. Record any class deferred because of material device/infrastructure cost.
- **Nightly:** Physical-device full backlogs, prolonged permanent-rejection/resource runs and extended network/lifecycle fault sequences whose setup or duration exceeds the PR budget.
- **Weekly:** Broad fleet/device profiling, repeated performance baselines and coordinated fleet containment/replacement drills. Use this lane for expensive environment coordination.

Within each run lane, execute an environment readiness smoke check, then P0, P1 and any applicable P2/P3 classes; this ordering does not change the PR/nightly/weekly scope.

Release candidates and changes affecting performance, queue safety or release controls run the relevant deferred classes before sign-off. A nightly/weekly label provides no release exemption. CI runner/framework choices await implementation; no browser runner is prescribed for the native client. Later tests should use stable native resource identifiers, controlled response gates and observable transitions. Separate test identities/queues, reset device and server fixtures, and retain failure logs/device traces without real customer data.

---

## Resource Estimates

### Test Development Effort

Ranges include per-scenario fixture setup, cleanup, test implementation and first verification after the shared harness is available. These ranges estimate development effort.

| Priority | Count | Hours/Test | Total Hours | Notes |
| -------- | ----- | ---------- | ----------- | ----- |
| P0 | 12 | Approximately 3 to 5 | Approximately 36 to 60 | Security extraction, concurrency, faults and fleet coordination. |
| P1 | 15 | Approximately 1.5 to 3 | Approximately 23 to 45 | Device backlog, native editing and boundary regression. |
| P2 | 0 | N/A | 0 | No secondary scope. |
| P3 | 0 | N/A | 0 | No cosmetic scope. |
| **Total** | **27** | **N/A** | **Approximately 59 to 105** | **Approximately 8 to 14 person-days at 8 hours/day.** |

Elapsed test-development schedule: approximately 2 to 3 working weeks for one available engineer after prerequisites, excluding waiting. Product remediation, device procurement, shared framework provisioning and store review lead time are outside these estimates. Those durations remain UNKNOWN until assigned owners assess them.

### Prerequisites

**Test Data:**

- Proposed order-payload factory with parts, labour, synthetic card reference/address and deterministic expected line values.
- Proposed queue/backlog fixture for 2,000 entries, including successive edits; track every expected entry and final order state.
- Proposed dual-technician shared-work-order fixture; separate-installation credentials/orders; explicit setup and cleanup.

**Tooling:**

- Native Android instrumentation or existing device automation runner once selected; physical fleet devices for the deadline oracle.
- SQLite/file inspection, API request/persistence observation and controllable HTTP fault/acknowledgement harness.
- Monotonic device timers, queue/attempt event records, device profiling and server acceptance evidence.
- Existing dispatcher read interface and coordinated release/control rehearsal tooling. No Pact/browser package is assumed.

**Environment:**

- Isolated single-tenant staging servers/databases, representative region routing and test credentials.
- Release-like Android build, controlled connectivity and representative mid-range hardware; record OS/model/network profile.
- Observable build/control status and approved containment/recovery path. Shared environments require scheduled owner coordination.

---

## Quality Gate Criteria

### Pass/Fail Thresholds

- **P0 pass rate:** 100%, with every declared assertion executed.
- **P1 pass rate:** ≥95%; failures require authorized waivers with reason, owner, approver and expiry. With 15 scenarios, 14/15 is about 93.3%, so all 15 currently must pass to meet the threshold.
- **P2/P3 pass rate:** ≥90% when applicable; currently N/A because their scenario counts are zero.
- **High-risk mitigations:** 100% verified before release. Unresolved score 9 risks block release; no waiver is granted by this plan.
- **Backlog deadline:** All 2,000 valid entries accepted and locally acknowledged within 30 seconds from usable-network restoration on the approved physical-fleet profile; no lost/altered entries.

### Coverage Targets

- **Critical paths:** ≥80%, measured against the agreed scenario inventory; all four acceptance criteria require coverage.
- **Security scenarios:** 100%.
- **Business logic:** ≥70% once implemented code permits measurement.
- **Edge cases:** ≥50% of the agreed applicable boundary inventory.

These are proposed test-plan gates from the template. Source code coverage and runtime evidence are unavailable today.

### Non-Negotiable Requirements

- [ ] All P0 scenarios pass.
- [ ] No high-risk (≥6) item remains unmitigated; resolved risks are reassessed with evidence.
- [ ] SEC validation passes 100% against the approved protection policy.
- [ ] The 2,000-item/30-second acceptance target passes.
- [ ] Source-stated silent loss, plaintext exposure and unlimited rejection loops have verified corrective controls.
- [ ] Each applicable NFR has the planned evidence or subsequent `nfr-assess` records unresolved concerns and authorized waivers.

This workflow has designed the gate; it has not evaluated release or final NFR readiness. Run `nfr-assess` after implementation evidence exists.

---

## Mitigation Plans

### R-001: Unencrypted full queue payload (Score: 9)

**Mitigation Strategy:** Security and Android owners approve data minimization and effective protection at rest, including SQLite sidecar files and key handling. Stored card reference/address retention and required recoverability need explicit policy. Screen lock alone leaves the source-described file exposure open.
**Owner:** Android lead and security lead, proposed.
**Timeline:** Before security sign-off and fleet release.
**Status:** Planned; OPEN.
**Verification:** The three Integration scenarios in the R-001 coverage row inspect extracted active, edited and post-acceptance queue artifacts against approved protection/retention rules. Demonstrate legitimate application recovery as well as absence of readable protected canaries.

### R-002: Concurrent edits overwrite earlier lines (Score: 9)

**Mitigation Strategy:** Product/server owners approve version or conflict detection, reconciliation and a recoverable record of each technician's contribution. Current arrival-order overwrite behavior remains a characterization failure against data-safety objectives. The planned remedy requires a downstream product decision.
**Owner:** Server lead and product owner, proposed.
**Timeline:** Before sync acceptance sign-off.
**Status:** Planned; OPEN.
**Verification:** The three API scenarios in the R-002 row compare both arrival orders and stale replay with persisted order/history. Require retained contributions or an explicit conflict with an approved recovery path; silent line loss fails.

### R-003: Unmeasured 2,000-item drain target (Score: 4)

**Mitigation Strategy:** Establish physical device, payload and network profiles, measure full drain and profile bottlenecks before choosing optimizations. Preserve append-only edit semantics and final content correctness. Clarify business consequences and recovery window for late delivery.
**Owner:** Android lead and performance QA, proposed.
**Timeline:** Before performance sign-off.
**Status:** Planned; OPEN.
**Verification:** The three E2E scenarios in the R-003 row time final acceptance and local acknowledgement from restored usable connectivity. Every valid entry must complete within 30 seconds; intermediate order edits need corresponding acceptance evidence even when final state retains the last revision.

### R-004: Immediate indefinite retries (Score: 9)

**Mitigation Strategy:** Approve transient/permanent failure classification, bounded retry/backoff behavior, durable isolation of rejected payloads and a recovery path that permits valid queued items to progress. Clarify retry schedule/cap and rejected-item recovery ownership; this plan does not invent numeric limits.
**Owner:** Android lead and server lead, proposed.
**Timeline:** Before resilience sign-off.
**Status:** Planned; OPEN.
**Verification:** The four Integration scenarios in the R-004 row record attempt cadence, rejected-item retention and valid-item progress through error/network/lifecycle transitions. Closing the app is not established as recovery for a rejected order; recoverability is unresolved in the source.

### R-005: Fleet-wide release lacks rapid containment (Score: 6)

**Mitigation Strategy:** Release/Product owners approve an effective containment path and rollout controls with a measurable containment SLA. Preserve captured orders during containment and restoration. The stated store-only disable path requires 1–3 days; a safe rapid recovery control remains a proposal requiring implementation and approval.
**Owner:** Release lead and product owner, proposed.
**Timeline:** Before release approval.
**Status:** Planned; OPEN.
**Verification:** The two E2E scenarios in the R-005 row demonstrate containment and resume/replacement across representative installed clients and deployed server/control paths with pending-queue reconciliation and timing evidence.

---

## Assumptions and Dependencies

### Assumptions

1. Story statements describe current proposed behavior; unsafe controls are characterized faithfully, and remediation verification uses separately approved policies. This design changes no requirements document.
2. Existing work orders can be made available before the device goes offline. Initial offline retrieval of an uncached work order is outside the described capture flow.
3. The stored card reference is synthetic in all fixtures. Its source classification is a reference; card PAN, legal obligations and vendor choices are unspecified.
4. OS background/lifecycle policy, accepted-order edit behavior and queue-retention semantics require confirmation before parameterizing the affected checks. These clarification items sit outside the scored register.
5. The exact supported fleet/device/network profile and allowable lateness consequence are UNKNOWN. No browser, UI rendering change or multi-tenant shared-storage design is assumed.

### Dependencies

1. Android/Server/QA owners provide a runnable build, owned storage/server observations and deterministic fault controls before implementation of tests.
2. Security/Product/Engineering approve protection, conflict and rejection-recovery policies before remediation verdicts.
3. Fleet/Performance owners establish hardware, OS, network and payload profiles before deadline validation.
4. Release/Product owners establish containment SLA and approved implementation before the release drill.
5. Dispatcher, Platform and Billing owners provide existing regression inventory or execution evidence before release sign-off. None is present in the supplied repository.

### Risks to Plan

- **Evidence availability:** Source/build/test infrastructure is absent from this fixture repository. Execution cannot substantiate this plan yet. Contingency: keep all scenarios planned and collect evidence after the implementation/harness is provided.
- **Unknown test oracles:** Security/conflict/retry/containment policies are unresolved. Contingency: characterize stated failures first, then obtain owner-approved criteria for remediation checks.
- **Shared environment/device access:** Containment and real-device profiling need coordinated infrastructure. Contingency: schedule isolated runs and preserve PR functional coverage while expensive lanes are provisioned.

### Implementation Planning Handoff

Schedule the five mitigation decisions and associated SQLite/API/fault/timing/containment observability setup before their sign-off deadlines. Android, Server, Security and Release roles own the control changes; QA owns evidence traceability. Product confirms policy and business impact. No tests or product files are generated by this run.

---

## Follow-on Workflows (Manual)

- Run `/bmad-tea-automate` in red mode to generate the planned failing P0 checks after an authorized implementation task begins.
- Run `/bmad-tea-automate` for broader coverage once a runnable implementation exists.
- Run `nfr-assess` and traceability/gate evaluation after execution evidence is available.

These workflows are separate manual follow-on work.

---

## Approval

**Test Design Approved By:**

- [ ] Product Manager: TBD; date pending.
- [ ] Tech Lead: TBD; date pending.
- [ ] QA Lead: TBD; date pending.
- [ ] Security and Release owners: TBD; scope-specific approval pending.

**Comments:** Draft design complete; role assignments, unknown policies and implementation evidence remain pending. No human approval or waiver has been inferred.

---

## Interworking & Regression

| Service/Component | Impact | Regression Scope |
| ----------------- | ------ | ---------------- |
| Native Android order screen / payload serializer | Existing order editing gains offline persistence and captured state. | Existing online save/edit, parts/labour parity and accepted-state transitions must pass. Verify captured status and editability in native journeys. Rendering is unchanged. |
| SQLite outbound queue / uploader | New capture/append/drain and retry behavior. | Existing persistence/upgrade/lifecycle suite if available; proposed append/restart and error/acknowledgement checks above. Preserve unresolved entries across recovery. |
| Server order storage / existing dispatcher console | Arrival-order application affects stored work-order content and read visibility. | Existing order write/read and dispatcher display tests must pass; AC4 compares the submitted content on the current read path. Coordinate server and console owners. |
| Platform installation isolation / regional routing | Boundaries explicitly unchanged. | Existing separate-installation access and configured-region routing assertions must pass. Coordinate isolated staging and platform owners. |
| Billing service | Captured payload carries an existing card reference; charging is unchanged. | Zero invocation regression for epic capture/edit/sync plus upstream existing nightly schedule and stored-reference charging evidence. Billing owner supplies that evidence. |
| Store release / fleet clients | All technicians receive one enabled release with delayed disable. | Existing build install/upgrade and pending-data compatibility regression plus the planned containment/recovery drill. Coordinate Release and fleet owners. |

The repository scan found no executable existing regression suite. References above name the required regression behaviors; owners must locate or supply the actual suite before sign-off.

---

## Appendix

### Knowledge Base References

- `bmod-tea/knowledge/risk-governance.md`: risk category, owner and gate governance.
- `bmod-tea/knowledge/probability-impact.md`: 1–3 scoring and remediation actions.
- `bmod-tea/knowledge/test-levels-framework.md`: test boundary/level choice and duplication guard.
- `bmod-tea/knowledge/test-priorities-matrix.md`: P0–P3 business-impact priority.
- `bmod-tea/knowledge/nfr-criteria.md`: measurable evidence and unknown thresholds.

Selected in that order from `bmod-tea/knowledge/tea-index.csv`. No conditional browser or Pact fragments apply: flags are unset, the technician surface is native, and no relevant Pact artifacts/packages are present. No runtime capability probe or browser session was created.

### Related Documents

- Sole requirements source: [Epic 7](../../docs/epics/epic-7-offline-order-capture.md), Context, stories 7.1–7.4, Acceptance criteria and Out of scope.
- Configuration: `field-order-capture/_bmad/config.toml`, `[core]` and `[modules.tea]`.
- Template: `skill/test-design-template.md`.
- PRD, architecture, tech spec and sprint status: N/A for this run; no missing required input.

### Workflow Validation

Create steps 1–5 executed in order with sequential generation. Checklist validation covers source-bounded risk rows, canonical IDs/numeric scores, one primary risk-linked coverage row per risk, scenario totals, NFR evidence planning and unchanged requirements inputs. No tests have run or been generated.

---

**Generated by**: BMad TEA Agent: Test Architect Module
**Workflow**: `bmad-tea-test-design`
**Workflow instructions version**: 5.0; epic template version 4.0
