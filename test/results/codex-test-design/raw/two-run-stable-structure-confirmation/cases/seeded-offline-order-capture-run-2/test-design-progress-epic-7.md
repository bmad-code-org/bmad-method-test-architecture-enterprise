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

## Step 1: Mode and prerequisites

Create mode; epic-level; full design; sequential execution; capability probe disabled.
Epic 7 requirements and acceptance criteria verified in docs/epics/epic-7-offline-order-capture.md.
This epic is the sole requirements source. Architecture, PRD and sprint status are outside this run's required inputs.
Run identity: epic / epic-7. No existing checkpoint found. English communication and output.

## Step 2: Loaded context

Config utility flags, Pact MCP and browser automation are unset. test_stack_type defaults to auto. Repository scan contains requirements and configuration only; the epic explicitly identifies native Android, so detected_stack is mobile with a server integration boundary. No browser/web view exists in the technician client. Capability probe disabled; no browser exploration applies.
Knowledge selection, in order: risk-governance, probability-impact, test-levels-framework, test-priorities-matrix, nfr-criteria. NFR loading is triggered by security, performance, reliability and release operation facts. No Pact artifacts, packages or explicit contract request; contract branches stay closed.
No existing tests, source code, fixtures, prior system-level plans or flakiness evidence were found. Coverage is entirely planned; execution results are unavailable.
Requirements: AC1 offline save/captured listing; AC2 edit until server acceptance; AC3 automatic upload on usable network; AC4 unchanged order on dispatcher console. Stories add append-only SQLite edits, concurrent technicians, 2,000 queued items within 30 seconds, unbounded retries and fleet-wide release.
Integration points: native order screen -> local SQLite -> Android usable-network notification -> upload client -> server order storage -> existing dispatcher read path. Billing, regional routing and other offline entities are outside scope. Single-tenant installations have separate servers and databases.
All required inputs are loaded. No question or supplemental requirements source is needed.

## Step 3: Risk assessment

System-level architecture review does not apply. Five distinct source gap statements are registered in source order. No residual story risks are added because explicit gaps exist. Satisfied single-tenant isolation, regional routing and billing constraints remain regression boundaries.
Probability: 1 unlikely, 2 possible, 3 likely/known unsafe control. Impact: 1 minor, 2 degraded with workaround, 3 critical data exposure/loss or core service disruption. Score = probability times impact. Scores 6+ require mitigation; unresolved scores 9 block release.

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

### NFR planning

Security R-001: protection-at-rest target and key/retention policy UNKNOWN; plan synthetic queue extraction and recoverability evidence.
Performance R-003: 2,000 accepted items in ≤30 seconds from restored usable connectivity on real fleet mid-range hardware; network profile, payload distribution and device models UNKNOWN; plan monotonic timing, device resource traces and server acceptance counts.
Reliability R-002/R-004: silent loss and permanent retry loops are source gaps; conflict policy, backoff schedule, attempt cap and dead-letter recovery SLA UNKNOWN; plan arrival-order and fault-injection evidence.
Operations R-005: existing disable delay 1–3 days; desired containment SLA UNKNOWN; plan timed containment/recovery rehearsal.
Maintainability: numeric coverage/quality thresholds UNKNOWN; no implementation evidence. Plan CI reports when code exists. Compliance rules UNKNOWN; card reference is not established as a PAN. Residency and installation isolation unchanged, verified by regression scope.
Highest mitigation priorities: customer data exposure, silent edit loss and retry storms (score 9); then containment (score 6) and the measured backlog deadline (score 4). All risks OPEN. Proposed controls require downstream decisions; no input is modified and no final NFR audit is claimed.

## Step 4: Coverage, execution and gates

Coverage rows use one canonical level; exactly one primary row per scored risk. Priority follows business consequence separately from risk score. R-003 is P1: an unmet acceptance window gives material latency degradation; critical consequences of lateness are UNKNOWN. Its impact was refined to 2 and score to 4 to match the documented consequence.

### P0 (Critical)

Critical business, security, data-integrity or compliance impact with no safe workaround.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |
| 7.1 queued customer data protection | Integration | R-001 | 3 | Android + security QA | Plaintext exposure first observable across the owned SQLite file boundary, hence Integration. Scenarios: extracted active queue; extracted queue after edit; residual files after acceptance. Assert approved protection/minimization policy. Screen lock supplies no file-level mitigation. |
| 7.2 concurrent offline edits | API | R-002 | 3 | Server + QA | Silent overwrite first observable at one server's HTTP acceptance/persistence boundary, hence API. Scenarios: A then B; B then A; replay an earlier A after B. Capture both technicians' lines and conflict/history evidence under a policy approved downstream. Original spec loses data without recovery. |
| 7.3 rejection loop containment | Integration | R-004 | 4 | Android + QA | Immediate unbounded retry first observable across queue/uploader event boundary, hence Integration. Scenarios: permanent rejection alone; poison followed by valid entry; transient rejection then success; continued failure across network flaps/restart. Observe request cadence, retained failures, valid progress and recovery under approved retry policy. Source gives no bounded recovery path. |
| 7.4 fleet release containment | E2E | R-005 | 2 | Release + QA | Disable and recovery span installed Android builds and deployed control/store release path, hence E2E. Scenarios: containment with pending queue; re-enable/replacement build with pending queue. Require approved containment SLA and zero captured-data loss. Current store-only recovery takes 1–3 days across every technician; rapid safe recovery is unresolved. |
| AC1, AC4 offline capture to dispatcher | E2E | - | 2 | QA | Native Android user journey through server and existing dispatcher. Scenarios: parts-only and mixed parts/labour. Disable device network before saving; verify newly captured listing, then restore usable network and compare dispatcher order with submitted lines and payload. Critical capture/data delivery; paper re-keying is the current manual workaround described in Context. |

Total P0: 14 scenarios; approximately 42 to 70 hours.

### P1 (High)

Core, frequent or complex behavior with material user reach and a limited workaround.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |
| 7.3 2,000 items within 30 seconds | E2E | R-003 | 3 | Performance QA | Deadline first observable on real fleet mid-range devices across native queue and server, hence E2E. Scenarios: full parts payload backlog; mixed parts/labour backlog; backlog containing successive edits. Measure from usable connectivity to all 2,000 acceptances and queue acknowledgement, require ≤30 seconds and content integrity. Late delivery is documented degradation; critical consequence and permissible late recovery window UNKNOWN. |
| AC2 editing until acceptance | E2E | - | 2 | QA | Native user journey: edit while offline; edit while upload is held before server acceptance. Verify latest lines and editable captured state until actual acceptance. Core frequent behavior; offline re-keying workaround is manual. |
| AC3 automatic usable-network upload | E2E | - | 1 | QA | Device offline -> OS usable network -> unattended upload. Require acceptance without tap/relaunch; record state transitions. |
| 7.2 each edit appends a queue entry | Integration | - | 2 | Android | Owned SQLite boundary: one edit appends while original remains; multiple edits survive app process restart. Assert payload and ordered queue entries. |
| AC4 full order payload unchanged | Unit | - | 2 | Android | Pure serialization: parts payload round trip; mixed parts/labour with synthetic card reference/address round trip. Exact semantic equality; independent of dispatcher journey. |
| Installation isolation scope constraint | API | - | 1 | Server | Existing isolation regression across one server HTTP boundary: credentials/order ID from installation A queried against B yield no A data. Separate databases/servers already specified; no scored isolation gap. |
| Regional routing scope constraint | API | - | 1 | Platform | Existing regional-routing regression: captured/synced fixture uses its installation's configured regional endpoint/storage path. Routing unchanged. |
| Charging unchanged scope constraint | Integration | - | 1 | Android + server | Capture/edit/sync boundary emits zero billing-service calls; inspect dependency call recording. Existing nightly billing behavior remains an upstream regression responsibility. |

Total P1: 13 scenarios; approximately 20 to 39 hours.
P2 and P3: zero scenarios. The scoped requirements concern core capture, integrity, security, sync and fleet recovery; no secondary or cosmetic changes are specified.
NFR evidence: synthetic SQLite file inspection; API persisted-order/history records; uploader request cadence and queue states; monotonic real-device timing/device traces and acceptance counts; timed containment/recovery logs; future CI reports. Unknown policies and device/network profile are prerequisites for final verdicts. No final NFR verdict is issued.
Execution: PR all functional classes while measured duration <15 minutes, using sequential run configuration; nightly expensive real-device backlog and prolonged rejection/lifecycle runs; weekly broad physical-fleet performance baseline and containment drill. Promote deferred classes on release candidates and relevant changes. Timing tiers are independent of priority.
Effort ranges: P0 ~42–70h; P1 ~20–39h; P2/P3 0h; total ~62–109h (~8–14 person-days at 8h/day), excluding product remediation and shared harness provisioning. No tests generated.
Gates: P0 100%, P1 ≥95% with approved waivers for failures, applicable critical paths ≥80%, all four ACs covered, security 100%, all high-risk mitigations verified before release, ≤30s backlog target proven. Evidence required per in-scope NFR; formal NFR audit deferred. All 27 scenarios remain planned.

## Step 5: Generation, validation and completion

Explicit sequential execution took precedence; capability probe false. Epic-level template produced one deliverable: field-order-capture/test-artifacts/test-design/test-design-epic-7.md. System-level handoff is N/A.
Final polish refined ordinary AC1/AC4 journey coverage to P1 because Context supplies paper capture/later re-keying as a limited workaround. Final totals supersede step 4 interim estimates: P0 12 scenarios (~36–60 hours), P1 15 (~23–45 hours), total 27 (~59–105 hours; 8–14 person-days; approximately 2–3 working weeks after prerequisites). Five risks, four high scores, three score-9 blockers remain OPEN. No risk IDs or levels changed.
Checklist reviewed in full and applied to epic-level scope. Optional PRD/architecture/sprint/status and all system-level artifact checks are N/A under the user configuration. Android has no browser surface; Playwright-specific execution guidance is N/A. No browser sessions were opened; no browser cleanup is needed. No temporary artifacts remain. Stakeholder acceptance and execution evidence remain explicitly pending, as required for a draft.
Validation: numeric score multiplication/ranges, canonical unique IDs, one primary coverage row per risk, canonical level values, all four AC mappings, totals, 12 consistent Markdown tables, template headings and absence of unresolved placeholders passed. Complete output read and polished. Source-bounded risks, unknown thresholds, NFR evidence, estimates and owner/timeline mapping verified. Source requirements were not edited. No tests generated or executed.
Completion report: Create mode, epic-level/full, epic 7, sequential. Deliverable path above. P0 gate 100%, P1 ≥95%, high-risk remediation required and 2,000 valid items within 30 seconds. Open assumptions: hardware/network/payload profile and security/conflict/retry/containment policies, role names and implementation evidence. Formal NFR verdict deferred to later nfr-assess. Workflow complete; human approval pending.
