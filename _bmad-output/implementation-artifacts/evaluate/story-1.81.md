---
title: "Story 1.81: Record how much of the macOS audit the kernel's log lost"
type: 'feature'
created: '2026-10-03'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'f74ae848'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 1.81)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.81 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-7, AD-8)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.60.md (the audit this extends)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** Story 1.60's macOS audit reads the kernel's sandbox reports through `log stream`, which loses reports without a trace when the host is saturated (none of 3,000 at a quiet 440 a second, one to five of 1,600 on a saturated host, 7 to 20 percent of a burst of 40,000 a second). A run records nothing about that loss, so an empty `observedMounts` from a macOS run means only that no report arrived.

**Approach:** Each audited trial's `ReportStream` reads a canary file beneath the audit directory (one no target can reach) through the sandbox's own token every 50 ms while the trial runs, and once more when it ends, and counts the canaries the log delivered against the canaries sent. The counts travel from the observer through the sandbox and the probe port to the trial, and `run.json` records one `observedMountsChannel` entry for each audited trial of the sealed trial sets. The run's summary line names every `lossy` trial with its counts. A Linux trial records `complete` with no canary sent.

## Boundaries & Constraints

**Always:** The canary reads use the sandbox's own token and a file in the audit directory, which a target cannot reach, so no target can forge a canary report. Canary reports never enter `observedMounts` (the isolation manifest's strict schema keeps what the audit listed). A trial that lost no canary and saw no loss event from the log records `complete`. The engine check runs at start and end. No eval-quality change, no new dependency.

**Never:** a canary count that a target can lower to hide a loss, an entry for a trial nothing audited, a change to what the profiles allow, a change to the isolation manifest.

**Decisions (build worker, owner-delegated):**

- Field and shape: `run.json`'s `observedMountsChannel`, an array in trial order of `{ conditionArm, trialIndex, completeness, canariesSent, canariesDelivered, logReportedLoss }`. The isolation manifest is eval-quality's strict schema and has no slot, so `run.json` holds it, beside `unreportedResourceUse`, the one other per-trial list there. A `records` run has no trials and omits the field, as it omits `unreportedResourceUse`.
- `completeness` is `lossy` when fewer canaries arrived than were sent or the log itself reported lost events (a `lossEvent`), and `complete` otherwise, whether the trial listed a read or not: a listed read does not make the log complete, and the acceptance criterion's "listed no read" names the case the field exists for. `logReportedLoss` keeps the log's own statement visible; without it a trial whose log said it lost events would read `complete`.
- A canary counts as sent once its read process has started. The first design counted a canary only when `cat` exited 0, and the adversarial review showed a same-user target can kill or stop canary processes (the target profile is `(allow default)` and carries no signal rule) so the loss stays invisible, and a starved host that could not finish any canary recorded `complete` with 0 of 0. A killed canary now counts as undelivered and can only make the trial `lossy`.
- A final canary after the trial's calls end guarantees at least two canaries on macOS (the first at start, the final at the end), so a trial shorter than 50 ms still has a count. A final canary whose process cannot start throws a `ConfinementError` (exit 12 through `readObservedMounts`): nothing was measured, which a complete record would claim.
- At most eight canary reads run at once (`CANARY_IN_FLIGHT`), so a host too busy to start them promptly does not pile up processes. A tick that finds eight running skips, which sends fewer canaries and never records a false loss.
- Entries exist for audited trials of the sealed trial sets' arms only. A trial that launched nothing (gameability), a run that opted out (`registry.createProbePort` returns `auditChannel: () => null` when no sandbox exists) and a sealed-brief evaluator qualification attempt have none. Recording qualification attempts would add a second list with its own shape; their manifests still carry `observedMounts`, and the reference states the omission.
- Linux: `strace` loses nothing, so the Linux observer's `channel()` is `{ 0, 0, false }` and its trials are `complete`.
- The summary is the run's outcome message, which the command prints and `run.json`'s `outcome.message` holds. It gains `; the kernel's log lost audit reports in <arm> trial <n> (<lost> of <sent>), ...`, and for a trial whose log reported lost events `(the log reported lost events)`.
- The stub `log` reaches the real CLI through `TEA_EVALUATE_AUDIT_LOG`, a test-only seam like `TEA_EVALUATE_CONFINEMENT_PLATFORM` (selection otherwise fixes `/usr/bin/log`, which a PATH lookup would let an environment replace). It takes an absolute path, and the selection probe confirms the stub like the real executable. The runtime trusts its own environment as it trusts the `strace` on `PATH`; recording the observer executable in `run.json` is not built, since nothing but a test sets it.
- The canary sets hold one string per canary (about 20 a second). Trial ceilings are minutes, so a trial holds thousands of strings, and the reader parses the file once at the end as it did before; counters would save nothing that matters.
- The reference's measurements and the field are stated under `### File-system confinement`, with the caveat that a canary samples the log every 50 ms (a single report can drop between two canaries; a trial of a few seconds sends too few canaries to catch every loss at the measured rates). The gaps guide gains one sentence (edited through `/bmad-workflow-builder` Edit, headless).

## I/O & Edge-Case Matrix

| Scenario                   | Input / State                                   | Expected Output / Behavior                                                              | Error Handling                    |
| -------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------- |
| Quiet macOS host           | real `log`, trials of 100 to 150 ms             | each entry `complete`, canariesSent at least 2, delivered equal, no note in the summary | n/a                               |
| Lossy log                  | stub that drops every second line               | entries `lossy` with counts, the summary names each with `<lost> of <sent>`             | run exits 0                       |
| Log reports a loss event   | `{"eventType":"lossEvent"}` line, a read listed | `logReportedLoss: true`, `lossy`, the mounts still listed                               | no read listed: exit 12 (as 1.60) |
| Target kills its canaries  | `sandbox-exec` of a canary ends by a signal     | counted as sent and undelivered, `lossy`                                                | n/a                               |
| Final canary cannot start  | `sandbox-exec` gone at the end of the trial     | `ConfinementError`, the trial yields no record                                          | exit 12                           |
| Linux trial                | `strace` observer                               | `complete`, 0 sent, 0 delivered, `logReportedLoss: false`                               | n/a                               |
| Nothing launched / opt-out | gameability arm, `"confinement": false`         | no entry (`[]` when no trial was audited)                                               | n/a                               |
| Records run                | `records` evaluator                             | no `observedMountsChannel`                                                              | n/a                               |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/confinement-audit.js`: `ReportStream` (`tokenRead`, `canaryRead`, `startCanaries`, `stopCanaries`, `canaries`; `take` routes `canary-` reports to the delivered set and never to `paths`), the header text.
- `cli/lib/evaluate/confinement.js`: `LOG_ENV` and the selection's log executable, the observer's `start` (canaries start after the first barrier), `observedMounts` (stop, final canary, barrier), `channel()` for both observers, `auditChannel()` on the sandbox.
- `cli/lib/evaluate/registry.js`: `createProbePort` returns `auditChannel`.
- `cli/lib/evaluate/run.js`: `channelEntry`, `lostCanaryNote`, the facts of both `conclude` paths, `completeRun`'s field and summary.
- `cli/lib/evaluate/records.js`: one comment.
- `test/test-evaluate-run.js`: `checkChannelRecords`, `auditedTrials`, `lossyLogStub`, `checkAuditChannelRun`, `checkAuditChannelUnits`, the shape check in `checkRunShape`, the opt-out check in `checkPlatformRefusal`, the reference reading in `checkConfinementReference`.
- `test/test-evaluate-arms.js`: the gameability run records no entry.
- `test/test-evaluate-guidance.js`: the gaps guide's markers.
- `test/fixtures/evaluate/lossy-log.cjs`: the stub `log`.
- `docs/reference/tea-evaluate-cli.md`, `src/workflows/testarch/bmad-testarch-evaluate/references/gaps.md`, `CHANGELOG.md`, `sprint-status.yaml`, `epics.md`, `test-design-epic-1.md`, `ARCHITECTURE-SPINE.md` (AD-7 and AD-8 amendments), `tools/test-shard-weights.json`.

## Tasks & Acceptance

**Execution:**

- [x] Reproduce the gap through the real CLI (a confined `tea-evaluate run` with a stub `log` that drops every second report): the run exits 0 and `run.json` holds no record of the loss.
- [x] `confinement-audit.js`, `confinement.js`, `registry.js`, `run.js` -- the canaries, the counts, the entries and the summary note
- [x] `test/test-evaluate-run.js`, `test-evaluate-arms.js`, `test-evaluate-guidance.js`, the stub -- the cases, each with its revert check below
- [x] The reference, the gaps guide, `CHANGELOG.md`, `epics.md`, `test-design-epic-1.md`, `ARCHITECTURE-SPINE.md`, `sprint-status.yaml`, `tools/test-shard-weights.json`

**Acceptance Criteria:** as in `epics.md` Story 1.81, with the two amendments dated 2026-10-03 there (the field and its shape, and `complete` for every trial without a loss).

## Implementation Notes

- Reproduction first: the real CLI cannot take a stub `log` (selection fixes `/usr/bin/log`), so the reproduction used a scratch copy of the unfixed tree plus only the `TEA_EVALUATE_AUDIT_LOG` seam, the new case and the stub. The lossy run exited 0, `run.json` had no `observedMountsChannel`, and 3 of 6 checks failed (the field absent, no recorded loss, and the summary helper missing from the unfixed `run.js`).
- Canary cost on this host: a trial of 100 to 150 ms sends three or four canaries; the long trials of the units case (1.2 s) send at least five. Each canary is one `sandbox-exec` of `/bin/cat`.
- The unit that stands in for Linux (`stub bwrap` and `strace` paths) checks the observer's constant only: the Linux trace is the ubuntu job's. The Linux half of `checkAuditChannelRun` (a real run, every entry `complete` with none sent) and the shape check in `checkRunShape` run in the ubuntu job; a macOS host skips the Linux half and a Linux host skips the macOS halves, each printing its reason.
- Not run here: Bubblewrap (this host is macOS). Nothing in this change touches a profile, and the isolation golden is unchanged.

## Revert observations

REVERTS_PLACEHOLDER

## Gates

GATES_PLACEHOLDER

## Build review

REVIEW_PLACEHOLDER

## Spec Change Log

## Review Triage Log
