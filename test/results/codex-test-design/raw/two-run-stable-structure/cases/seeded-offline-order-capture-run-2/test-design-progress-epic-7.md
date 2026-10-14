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
  - field-order-capture/_bmad/config.toml
  - field-order-capture/docs/epics/epic-7-offline-order-capture.md
  - bmod-tea/knowledge/tea-index.csv
  - bmod-tea/knowledge/risk-governance.md
  - bmod-tea/knowledge/probability-impact.md
  - bmod-tea/knowledge/test-levels-framework.md
  - bmod-tea/knowledge/test-priorities-matrix.md
  - bmod-tea/knowledge/nfr-criteria.md
---

# Epic 7 test-design progress

## Step 1: Mode and prerequisites

Create mode; epic-level; full design; sequential execution; capability probe disabled.
Run scope: epic. Run key: epic-7. Epic number: 7.
Requirements source: `field-order-capture/docs/epics/epic-7-offline-order-capture.md`.
The epic contains stories 7.1–7.4 and acceptance criteria. Architecture context is unavailable and optional. PRD and sprint status are outside this run's inputs.
No existing current or legacy checkpoint was found. This is a fresh run.
Output: `field-order-capture/test-artifacts/test-design/test-design-epic-7.md`.
Config: user tea-eval-harness; project field-service-platform; communication and document language English.

## Step 2: Loaded context

The four integration/browser flags are unset; their conditional branches remain closed. test_stack_type defaults to auto. The repository contains the epic and config, with no source, manifests, existing tests, fixtures, or prior system-level plans. Test flakiness and coverage cannot be measured.
The epic explicitly identifies native Android, SQLite outbound storage, server sync, and dispatcher readback. Detected planning stack: mobile with server integration; manifest-based detection is unavailable. Browser exploration has no applicable configured branch or native-client surface. Capability probing is disabled.
Requirements: offline save and captured status; edit until server acceptance; automatic connectivity-triggered upload; unchanged dispatcher readback; 2,000 queued items synced within 30 seconds on fleet mid-range devices.
Known hazards: plaintext customer billing data, append-only revisions, silent concurrent overwrites, immediate unbounded retries, and universal release with 1–3 day disable latency.
Loaded knowledge, in deterministic order: risk-governance, probability-impact, test-levels-framework, test-priorities-matrix, nfr-criteria. NFR branch matches security, performance, reliability and release operations. No Pact evidence exists. All requirements inputs are present for this run.

## Step 3: Risk and NFR assessment

System-level architecture review is inapplicable to epic-level mode. Five distinct gap statements produce five scored risks. The append-only queue is a stated behavior covered through tests. No residual story risks are added because explicit gaps exist.

### High-Priority Risks (Score ≥6)

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Timeline |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ---------- | ----- | -------- |
| R-001 | SEC | Plain SQLite file holds full order payload and is not encrypted at rest (7.1); readable queue bytes expose stored card reference and billing address if device/file access is obtained. | 2 | 3 | 6 | Minimize sensitive queued fields and encrypt retained data with protected keys; verify persistence artifacts. | Android + Security leads | Before release candidate |
| R-002 | DATA | No version check and no timestamp check; later arrival overwrites earlier technician lines with no record (7.2), causing unrecoverable work-order data loss. | 3 | 3 | 9 | Add conflict detection and durable revision history with a product-approved resolution rule. | Server + Product leads | Before release candidate |
| R-004 | TECH | Failed upload is retried immediately and indefinitely, with no backoff, attempt cap, or dead-letter path (7.3); permanent rejection loops consume device/network/server capacity and obstruct recovery. | 3 | 3 | 9 | Classify failures, bound and back off transient retries, isolate terminal failures durably. | Android + Server leads | Before release candidate |
| R-005 | OPS | No feature flag, no staged rollout, and no way to disable without store review taking 1–3 days (7.4); a release incident affects every technician throughout recovery. | 2 | 3 | 6 | Design a disable/containment mechanism that preserves queued work and rehearse recovery; document current store latency. | Release + Product leads | Before distribution |

### Medium-Priority Risks (Score 3-4)

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ---------- | ----- |
| R-003 | PERF | Full backlog of 2,000 queued items must finish within 30 seconds on mid-range fleet devices (7.3); unmeasured throughput can miss the deadline and delay queued-work acceptance. | 2 | 2 | 4 | Benchmark actual client/server on fleet devices and optimize from evidence. Timeline: before release approval. | Android + Server performance leads |

### Low-Priority Risks (Score 1-2)

No identified risks in this band.

| Risk ID | Category | Description | Probability | Impact | Score | Action |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ------ |

Probability 1 unlikely, 2 possible, 3 likely; impact 1 minor, 2 degraded, 3 critical. Score equals probability × impact. Known destructive overwrite and unbounded retries justify probability 3. File compromise, deadline breach, and release incidents are conditional and justify probability 2. R-003 impact is 2: delayed acceptance is the supported consequence; a critical cutoff or permanent loss from latency is unspecified. All five are open; four score ≥6, and scores 9 require resolution before release. Proposed mitigations are design recommendations and have no implementation evidence.
NFR planning: security protection threshold UNKNOWN; performance 2,000 items / 30 seconds / fleet mid-range Android devices; reliability retry intervals, cap, terminal path and conflict resolution UNKNOWN; operations containment latency UNKNOWN with current store review 1–3 days. Device models, OS versions, network profile, payload sizes and fleet concurrency are UNKNOWN test prerequisites. Maintainability targets are UNKNOWN. Compliance obligations are unspecified. Single-tenant isolation and regional routing are unchanged scope constraints. Planned evidence: SQLite artifact inspection, server persistence/readback, correlated queue/request traces, monotonic device benchmark and release rehearsal. No final NFR verdict is asserted.

## Step 4: Coverage and execution design

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |
| Protect sensitive persisted queue | Integration | R-001 | 3 | Android + Security | P0: plaintext full payload crosses owned SQLite/file boundary. Inspect DB and journal after capture; append edit; acceptance cleanup. Critical disclosure; recoverability unresolved. |
| Detect concurrent queued revisions | API | R-002 | 4 | Server | P0: last-arrival overwrite first observable at one server HTTP/persistence boundary. Two technician arrivals in each order; stale same-device revision; concurrent edit during acceptance. Verify conflict and retained history against approved rule. Irrecoverable line loss; source says no record. |
| Bound retries and isolate rejection | Integration | R-004 | 4 | Android | P0: queued upload scheduler crosses queue/event boundary. Permanent rejection; transient failure then acceptance; rejection followed by valid item; connectivity flapping. Capture attempt timing, retention and forward progress. Essential upload remains unresolved under unbounded rejection; source supplies no recovery. |
| Contain release incidents with queue preservation | E2E | R-005 | 2 | Release | P0: native fleet release and replacement distribution span deployed build/store recovery journey. Rehearse disable during pending uploads and replacement build preserving queued work. Universal exposure with 1–3 day recovery and no flag; containment unresolved. |
| Offline capture/edit to dispatcher readback | E2E | - | 2 | QA | P0: native Android → real server → existing dispatcher console. Save parts/labour offline and verify captured, then reconnect; edit repeatedly before acceptance and verify newest payload unchanged after reconnect. Covers AC1–AC4 with user-visible and persistence assertions. |
| Full backlog sync deadline | E2E | R-003 | 3 | Performance | P1: deadline spans real fleet device, OS network signal, actual queue and server. 2,000 distinct entries; 2,000 mixed revision entries; 2,000 after a full offline day. Measure complete acceptance within 30 seconds; retain content. Material latency degradation; critical deadline/loss consequence unstated, eventual acceptance is the intended recovery path. |
| Append edits and preserve pending editability | Integration | - | 3 | Android | P1: SQLite writer/editor boundary. Capture plus multiple edits append separate entries; reopen pending data after process restart; hold acceptance and edit pending item. AC2 persistence detail complements user journey. |
| Automatic OS network transition handling | E2E | - | 1 | QA | P1: native connectivity journey on real server. Usable-network signal drains pending queue with zero technician action after offline foreground/background transition. AC3 recovery scheduling. Background policy UNKNOWN. |
| Payload preservation | Unit | - | 2 | Android | P1: pure encode/decode behavior with parts and labour; edited revisions preserve billing address and synthetic card reference. AC4 field oracle before boundary checks. |
| Installation isolation regression | API | - | 1 | Server | P2: separate installation HTTP endpoints preserve explicitly satisfied single-tenant isolation. Confirm test identifiers read only in own installation. |
| Regional routing regression | Integration | - | 1 | Platform | P2: unchanged routing boundary sends synthetic sync data to the installation's configured region; platform baseline required. |
| Billing schedule/invocation regression | Integration | - | 1 | Server | P2: capture/sync integration emits zero billing calls and leaves nightly schedule unchanged; full charge flow excluded. |

Priority totals: P0 15 scenarios (~30–45 hours); P1 9 (~15–27 hours); P2 3 (~3–6 hours); P3 0. Total 27 (~48–78 hours; ~6–10 person-days at 8 hours). Estimates cover future test development and exclude environment provisioning and mitigation implementation. P3 empty because no cosmetic/rare feature is introduced.
NFR evidence: Security file/journal results; DATA server revision outcomes; PERF device/server timestamp report with device/network profiles; TECH retry traces and queue outcomes; OPS recovery timeline and retained queue readback. Approved thresholds absent in the epic remain UNKNOWN. Maintainability: future CI/static analysis reports with target UNKNOWN. Compliance unspecified.
Execution: PR functional suites with target <15 minutes using native Android, server API and isolated integration runners; no configured browser runner. Nightly fleet devices, full offline-day datasets, repeated sync/recovery and performance; weekly costly release rehearsal and device matrix/load soak. Release evidence must correspond to candidate build regardless of cadence. Serial Android device access and independent fixtures prevent pollution.
Gates: P0 100%, P1 ≥95% with triaged/approved failures, P2 ≥90% informational; all high-risk mitigations verified before release, all five risks linked once, ≥80% critical-path planned coverage with 100% AC and security scenarios. Capture full 2,000 items within 30 seconds on approved fleet profiles. Later nfr-assess evaluates final implementation evidence. Roles are proposed; actual ownership assignment and threshold decisions are execution prerequisites.

## Step 5: Output and validation

Execution mode resolved from user override: sequential. Capability probe false; no agents or browser sessions launched. Epic number 7 and run key epic-7 carried unchanged. Used `skill/test-design-template.md` to write `field-order-capture/test-artifacts/test-design/test-design-epic-7.md` as the single declared epic deliverable. System-level output/handoff generation is inapplicable.
Validated the full document against `skill/checklist.md`. Applicable checks cover source traceability, exact risk/coverage schemas, probability/impact/score arithmetic, canonical IDs and levels, one risk-linked coverage row per risk, counts, priority rationale, NFR UNKNOWNs/evidence, ranges, prerequisites, gates, mitigation ownership/timelines, regression, and template sections. Automated structure checks passed: five risks, four high risks, two score-9 risks, P0 15/P1 9/P2 3/P3 0, total 27. R-003 impact refined to 2 during validation to align with the source-supported delayed acceptance consequence; its final score is 4. Other scores unchanged.
PRD, architecture, sprint status, system-level document/handoff and configured Playwright/Pact checks are N/A. Product/team approvals, assigned names, implementation coverage and NFR execution evidence are explicitly pending; no successful release gate or executed-test claim is made. No tests generated and no input files modified. No temporary browser artifacts or sessions exist.
Completion summary: full epic-level plan; sensitive local data, concurrent overwrite, throughput, infinite retry and release containment addressed. Gate thresholds P0 100%, P1 ≥95%, explicit 2,000-item/30-second performance target. Open assumptions include device/network profiles, protection/conflict/retry/containment policies and execution access.
