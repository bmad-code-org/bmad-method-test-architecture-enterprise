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

Each revert was applied once to a scratch copy of the final tree under the scratchpad directory (never the working tree and never `/tmp`), the named case run, the failed-check count recorded and the copy restored. The host is macOS, so the canary cases ran for real; the Linux half runs in the ubuntu job.

| Revert (the one edit)                                                      | Case run                              | Observed                                                                                                                  |
| -------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Send no canaries (`startCanaries` returns at once)                         | `--only=channel`                      | 17 of 76 checks fail: each entry holds one canary (the final), every lossy and lossless count check follows               |
| Same revert                                                                | `--only="the run and its scores"`     | 6 of 278 fail: the shape check of `observedMountsChannel` in `checkRunShape`                                              |
| Record `complete` unconditionally                                          | `--only=channel`                      | 10 of 76 fail: the stub-log run leaves entries `complete` with 3 sent and 1 delivered, and the summary names nothing      |
| Drop the summary note (`lostCanaryNote` returns `''`)                      | `--only=channel`                      | 2 of 76 fail: the run's summary and the note's unit                                                                       |
| Drop the final canary                                                      | `--only="channel's units"`            | 2 of 20 fail: a trial that ended at once sent one canary; the vanished-executable case no longer reaches the final canary |
| A final canary that cannot start is not a failure                          | `--only="channel's units"`            | 1 of 20 fails: no `ConfinementError`                                                                                      |
| Count a canary as sent only when its read ended cleanly (the first design) | `--only="channel's units"`            | 1 of 20 fails: canaries a target killed are recorded as 0 sent                                                            |
| Ignore the log's own loss event                                            | `--only="channel's units"`            | 1 of 20 fails: `logReportedLoss` stays false                                                                              |
| Let canary reports into `paths`                                            | `--only="channel's units"`            | 4 of 20 fail: the canary files are listed as observed mounts and the delivered count is 0                                 |
| The Linux observer sends one canary                                        | `--only="channel's units"`            | 1 of 20 fails: the Bubblewrap sandbox's channel                                                                           |
| An opt-out port reports a channel                                          | `--only="channel's units"`            | 1 of 20 fails                                                                                                             |
| An opted-out run records entries                                           | `--only="platform refusal"`           | 1 of 12 fails: the opted-out run's `observedMountsChannel` is not `[]`                                                    |
| A gameability trial gets an entry                                          | `node test/test-evaluate-arms.js`     | 1 of 733 fails: the gameability run's `observedMountsChannel` is not `[]`                                                 |
| The stub `log` does not reach the CLI (`LOG_ENV` ignored)                  | `--only=channel`                      | 2 of 76 fail: no trial of the lossy run records a lost canary, and the summary names none                                 |
| Drop `observedMountsChannel` and the field's passage from the reference    | `--only="confinement reference"`      | 1 of 12 fails                                                                                                             |
| Drop one of the three measurements from the reference                      | `--only="confinement reference"`      | 1 of 12 fails                                                                                                             |
| Restore "No run records the loss yet; Story 1.81 adds a per-trial count"   | `--only="confinement reference"`      | 1 of 12 fails                                                                                                             |
| Drop the gaps guide's `observedMountsChannel` sentence                     | `node test/test-evaluate-guidance.js` | 1 failure naming the missing sentence                                                                                     |

Before the build the same real-CLI case failed as the revert checks predict: 3 of 6 checks (the field absent, no loss recorded, the summary helper missing).

## Gates

Run on the final tree, one host-heavy gate at a time, on a machine shared with the other lanes. No full local `npm test`: the hook and CI carry the chain.

- `test:evaluate-confinement` 912, `test:evaluate-run` 591, `test:evaluate-arms` 733, `test:evaluate-evaluators` 577, `test:evaluate-agents` 500, `test:evaluate-held-attempts` 462, `test:evaluate-held-inputs` 210, `test:evaluate-aggregate` 142, `test:evaluate-records` 330, `test:evaluate-private` 110, `test:evaluate-mutation` 727, `test:evaluate-preflight` 324, `test:evaluate-ci`, `test:evaluate-api` 4,453, `test:evaluate-mcp` 227, `test:evaluate-workflow` 165, `test:evaluate-check` 1,098, `test:evaluate-boundaries` 448, `test:evaluate-guidance`, `test:evaluate-tool-use` 99, `test:evaluate-promptfoo`, `test:evaluate-learned-framework`, `test:evaluate-gap-loop`, `test:evaluate-authoring`, `test:evaluate-compare`, `test:isolation-primitives` (golden unchanged), `test:direction`, `test:boundary`, `test:bmad-output-gated` 112: green.
- `test:doc-counts`, `test:doc-claims`, `test:shards` (the confinement weight is 418.4 plus 32 seconds, the new cases' 21 seconds of local time at the 1.517 CI ratio), `test:ci-coverage`, `test:changelog`: green.
- `npm run lint`, `npm run lint:md`, `npm run format:check`, `npm run docs:validate-links`, `npm run docs:build`: green.
- The lossy-attempt reruns of the suite (a lost report of the macOS log, by design) occurred in the confinement gate; the Linux abstract-socket and Linux audit-channel cases are skipped on this host with their reason printed and run in the ubuntu CI job.
- Engine check at the start and the end: exit 0. `git diff -- package.json package-lock.json` is empty.
- Builder Edit of the gaps guide's one sentence: path-standards scan 5 findings before and 5 after on the tracked files (the extra findings of the working tree sit in ignored `.memlog.md` and `.analysis/` files), `quick_validate` ok, `scan-scripts` clean. Zero new findings.

## Build review

Three fresh Opus subagents reviewed the diff in layers (code, tests, adversarial), read only, in place of `/bmad-code-review`, `/bmad-testarch-test-review` and `/bmad-review`, whose lenses the prompts carried. Every finding was checked against the code before it was acted on.

| Finding                                                                                                                                            | Verdict                                | Route                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| High (adversarial): a target kills or stops canary processes during a burst and the loss stays invisible, `complete` with 1 of 1                   | valid (the profile has no signal rule) | Fixed: a canary counts as sent once its process started, so a killed canary is undelivered; a unit stands in for the killer                                                          |
| High (adversarial), Medium (code), Low (tests): zero canaries sent on macOS records `complete`                                                     | valid                                  | Fixed: the final canary must start or the trial exits 12; the first canary and the final one make two at least; a unit removes `sandbox-exec` before the final canary                |
| Medium (adversarial): the log's own `lossEvent` is ignored when a path was listed                                                                  | valid                                  | Fixed: `logReportedLoss` in each entry makes the trial `lossy`; the summary names it; a unit with a loss-reporting stub                                                              |
| Medium (adversarial): the docs say `complete` shows the log kept every report; sparse single drops between canaries pass                           | valid                                  | Reworded in the reference, the gaps guide and CHANGELOG: `complete` means every canary sent arrived, and a single report can drop between two canaries                               |
| Medium (adversarial gate): ESLint `unicorn/no-useless-spread`, Prettier on three files                                                             | valid                                  | Fixed                                                                                                                                                                                |
| Medium (tests): the "brief trial has the final canary" check passes without the final canary                                                       | valid                                  | Fixed: the check needs two canaries (first and final); the revert is observed                                                                                                        |
| Low (code, adversarial): the docs say "each audited trial"; qualification attempts and refused arms have no entry, a `records` run omits the field | valid                                  | Reference narrowed to the sealed trial sets, with the qualification attempts and `records` run named as having none; recording the attempts would add a second list and is not built |
| Low (code, adversarial): `TEA_EVALUATE_AUDIT_LOG` can replace the observer and nothing records it                                                  | valid                                  | Absolute path required, header and comment document it as a test seam; recording the executable in `run.json` is not built, as nothing but a test sets it (see the decision)         |
| Low (code, adversarial): memory grows with trial length                                                                                            | accepted                               | A trial runs minutes, so thousands of strings; see the decision                                                                                                                      |
| Low (adversarial): `score` does not mention `lossy` trials                                                                                         | accepted                               | `run`'s summary and `outcome.message` carry it, and `ci` repeats the message; `score` reads sealed records and has no per-trial channel                                              |
| Low (tests): `lossyLogStub.end` kill can throw ESRCH; the fixture matched the literal `4h`; negative summary checks keyed on one wording           | valid                                  | Fixed: guarded kill, the argument after `--timeout`, a pattern on the counts and on `lost audit reports`                                                                             |
| Low (tests): the quiet unit retried back to back with a hard check; adversarial: the same flake                                                    | valid                                  | The delivery check is a `checkReport`, and the units case is `lossy`, so `runCase` reruns it after a pause                                                                           |
| Low (tests): a trial that launched nothing and an opted-out run had no case                                                                        | valid                                  | `test-evaluate-arms.js` asserts the gameability run records `[]`; the opt-out run in `checkPlatformRefusal` asserts `[]`                                                             |
| Low (tests): the skip line named only the lossy half; `sandbox.start()` outside the try; the trial list written four times                         | valid                                  | Fixed                                                                                                                                                                                |
| Low (tests): `>= 5` canaries in 1.2 s does not pin the 50 ms cadence                                                                               | accepted                               | Robust under load, which a tighter bound would not be; the loop's cadence is a constant                                                                                              |
| Low (tests): the Bubblewrap stand-in scripts never run                                                                                             | accepted                               | The Linux observer has no process to start; the unit holds its constant and the ubuntu job runs the real trace                                                                       |
| Low (tests): the stub case and the real-log case share one body under the lossy retry                                                              | accepted                               | A rerun costs about 20 seconds                                                                                                                                                       |
| Note (code): a late canary reads as lost when the barrier times out with paths listed                                                              | accepted                               | Conservative: the trial reads `lossy`                                                                                                                                                |
| Medium (tests, coverage): no macOS CI job runs the canary cases                                                                                    | accepted                               | Stated in the PR note: `test:evaluate-confinement` ran on macOS here; the ubuntu job runs the Linux half and the shape check                                                         |
| Nit (adversarial): the CHANGELOG said "each audited trial now reads a file"                                                                        | valid                                  | Reworded: the audit of each trial reads                                                                                                                                              |

Undone: Bubblewrap and the real `strace` trace were not run here (macOS host; no profile changed and the isolation golden is unchanged); the Linux half of `checkAuditChannelRun` and the Linux branch of `checkChannelRecords` run in the ubuntu CI job.

## Spec Change Log

## Review Triage Log
