---
title: "Story 1.58: Keep the bridge's admission token and the run's private directories from a confined target"
type: 'bugfix'
created: '2026-10-01'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'd654b5d3e789c26ff7a37f6abf1440ec3b78e972'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 1.58)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.58 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-8, AD-21)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.57.md (git access carried to the sandbox; the golden)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** A sealed-brief agent evaluator's bridge configuration (`mcp-config.json`, which carries the one admission token), its socket, and the evaluator, judge and command-evaluator working directories are `mkdtemp` directories under the temp directory, outside the evaluation folder. A confined target runs as the adopter's user, so it can read the token before the agent connects, take the bridge's one admission, and read an evaluator's or judge's working files (AD-21).

**Approach:** The run makes one private parent directory when it starts, registered in its `scratch` list, and every evaluation-layer private directory is created beneath it. The confinement withholds that one parent from a target under both mechanisms. The parent exists before any sandbox is built, so a leftover process keeps a profile that still covers directories made later.

## Boundaries & Constraints

**Always:** Move into the private parent the directories `sealed-brief-agent.js`, `bridge.js` (config dir and socket dir), `judge.js`, `command-evaluator.js`, and the engine, qualification, score and aggregate directories make through `makeScratchDirectory`; a directory the target is deliberately granted (target tmp, audit report, status, port, the workspace) stays where it is. The parent is removed with `removeScratch` like any scratch directory, and the existing `finally` releases still run. Carry the parent to `targetSandbox` the way Story 1.57 carried the git access: through every `registry.createProbePort` call (`run.js`, `historical.js`, `preflight.js`), with the source scan over those calls extended to the new option. Withhold it under Seatbelt (`deny file-read* file-write*` over the subpath, plus a rule that refuses `connect()` to a unix socket under it, proved by the case) and Bubblewrap (`--tmpfs` over the parent), and add it to the audit's `withheld` list. The agent's own connection and every layer process stay admitted: layer processes are not target-confined. Every profile path goes through `assertProfileSafePath`. The socket path keeps its length fallback (`socketPlace`: temp directory, then `/tmp`), so the parent is made where a socket path still fits. Evidence, records and digests are unchanged. A profile change updates `test/fixtures/isolation-primitives/golden.json` with `TEA_UPDATE_ISOLATION_GOLDEN=1 npm run test:isolation-primitives`; read the diff and keep only the added rules. The engine check runs at start and end. No eval-quality change. `docs/reference/tea-evaluate-cli.md` gets a sub-heading of its own for the bridge passage (`#### The bridge's admission token` under `### The evaluation layer`) and the passage states that the confinement withholds the run's private directories, so the token is unreadable to a confined target; a case reads the passage under that exact heading. Amend AD-21 (or AD-8) by one sentence. Finish Story 1.57's housekeeping in this PR: its `sprint-status.yaml` row to `done` and `story-1.57.md` status to `done`. Update `CHANGELOG.md` under `[Unreleased]`.

**Never:** a token or private path written into evidence, records or logs, a change to what the profiles grant for the workspace, target tmp, report, status or port, withholding by name prefix across the shared temp directory (it would catch another run's directories and the granted ones), a new dependency, an opt-out run changed (`"confinement": false` keeps today's layout reachable), a Windows named-pipe change (Windows has no confinement).

## I/O & Edge-Case Matrix

| Scenario                      | Input / State                                                          | Expected Output / Behavior                                                       | Error Handling |
| ----------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------- |
| Token file read               | confined run, sealed-brief agent mid-trial, stub reads the config path | refused (EPERM under Seatbelt, no file under Bubblewrap); the agent connects     | n/a            |
| Working directories listed    | stub lists the evaluator and judge working directories                 | refused or empty                                                                 | n/a            |
| Socket connect                | stub, and a process it left running, connects to `bridge.sock`         | refused; the bridge still admits the agent's one connection                      | n/a            |
| Directory made after the stub | a leftover process started before the judge's directory exists         | still refused (the parent's profile covers later children)                       | n/a            |
| Granted directories           | stub writes its target tmp, report and status paths                    | unchanged                                                                        | n/a            |
| Opt-out run                   | `"confinement": false`                                                 | the target can still read the directories; nothing withheld                      | n/a            |
| Killed run                    | SIGKILL mid-trial                                                      | no new reclaim here (Story 1.54); the private parent is the one path 1.54 tracks | n/a            |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/preflight.js`: `scratch` array (near line 523), `removeScratch`, `make`; create the private parent here and hand it to the callers. `createProbePort` call near lines 770, 1169, 1218.
- `cli/lib/evaluate/workspace.js`: `makeScratchDirectory`, `removeScratchDirectory` (near line 491); add a helper that makes a child of the parent.
- `cli/lib/evaluate/sealed-brief-agent.js` (near lines 765 to 797): evaluator working directory and bridge config directory; `bridge.js` (`socketPlace` near line 128, `openBridge`, token near line 168); `judge.js` (near line 275); `command-evaluator.js` (near line 74); `run.js` (qualification near line 1313; probe ports near lines 303, 544), `score.js` (near lines 597, 838): create their directories under the parent.
- `cli/lib/evaluate/registry.js` (near line 715): forward the parent to `targetSandbox` beside `git`.
- `cli/lib/evaluate/historical.js` (near lines 373, 630, 717, 735): the other `createProbePort` call sites.
- `cli/lib/evaluate/confinement.js`: `seatbeltTargetProfile`, `bubblewrapTargetArguments`, `targetSandbox`, `environment()` (the `withheld` list), `selectConfinement` (unsafe-path refusals).
- `test/test-evaluate-evaluators.js` (`test:evaluate-evaluators`): `makeProject`, `useSealedBriefAgent`, `checkSignalMidTrial` (which asserts the evaluator and config directories exist mid-trial and are gone after; update its paths to the parent), `checkBridge`; `test/fixtures/evaluate/evaluators/stub-evaluator-agent.js` (`--mode hang`, capture holds the config and socket paths).
- `test/fixtures/evaluate/mutation/bin/verdict.js`: stub target acts (`VERDICT_DO`, `VERDICT_WHEN`); add a private-directory act (read the token file, list the directories, connect to the socket).
- `test/test-evaluate-run.js`: the source scan over `createProbePort` calls (near line 3956), `checkConfinementReference` pattern for a heading-sliced doc reading.
- `test/test-isolation-primitives.js`, `test/lib/isolation-golden.js`, `test/fixtures/isolation-primitives/golden.json`.
- `docs/reference/tea-evaluate-cli.md` (near lines 842 to 843 and 390 to 391), `CHANGELOG.md`, `sprint-status.yaml` (1.57 and 1.58 rows), `test-design-epic-1.md` (Story 1.58 section), `ARCHITECTURE-SPINE.md`, `story-1.57.md`.
- Do not change: a directory the target is granted, `sharedStateDigest`, the journal and reclaim logic (Story 1.54 owns reclaim of these directories after a kill).

## Tasks & Acceptance

**Execution:**

- [ ] `preflight.js`, `workspace.js` -- one private parent per run in `scratch`, a helper for children, released by `removeScratch` -- the single path to withhold
- [ ] `sealed-brief-agent.js`, `bridge.js`, `judge.js`, `command-evaluator.js`, `run.js`, `score.js` -- create each private directory under the parent, keep the socket length fallback and every `finally` release -- the directories to withhold
- [ ] `registry.js`, `run.js`, `historical.js`, `preflight.js`, `confinement.js` -- carry the parent to `targetSandbox`; Seatbelt file and unix-socket `connect` denial, Bubblewrap `--tmpfs`, audit `withheld` -- the withholding under both mechanisms
- [ ] `test/test-evaluate-evaluators.js`, `verdict.js` -- a confined sealed-brief case with the stub target's private-directory act and the matrix rows, each with its revert check (parent not withheld, token readable); update `checkSignalMidTrial` and the evaluator suites for the new paths
- [ ] `test/test-evaluate-run.js` -- extend the `createProbePort` source scan to the new option; a reading case for `#### The bridge's admission token`
- [ ] `golden.json` -- regenerate, read the diff, keep only the added parent rules
- [ ] `docs/reference/tea-evaluate-cli.md`, `CHANGELOG.md`, `sprint-status.yaml` (1.58 `in-progress` now, `review` at PR open; 1.57 `done`), `test-design-epic-1.md`, AD-21, `story-1.57.md` (`done`), this record -- documentation and wiring
- [ ] `tools/test-shard-weights.json` -- refresh for any script added or split; new cases stay light (shards run 11 to 14 minutes against a 15 minute cap)

**Acceptance Criteria:**

- Given a confined run with a sealed-brief agent evaluator, when a stub target and a process it leaves running try to read the bridge's configuration file, list the evaluator's and the judge's working directories and connect to the bridge's socket, then each attempt is refused on both mechanisms, the agent's own connection is admitted, and the trial's evidence and records are unchanged; reverting the change lets the stub print the token, which the case catches.
- Given `docs/reference/tea-evaluate-cli.md`, when the bridge passage is read under its exact heading, then it states the withholding and the old sentence (a target can read the token) is gone; a case fails while it remains.
- Given the 1.57 housekeeping, then the 1.57 sprint row and story record read `done`.

## Implementation Notes

- The private parent is `workspace.js` `makePrivateParent(scratch)`: `mkdtemp` of `tea-evaluate-run-<6>` in the temp directory, or in `/tmp` where the longest socket path beneath it (`<parent>/bridge-<6>/bridge.sock`) would pass `MAX_SOCKET_PATH` (100 bytes), unshifted to the front of `scratch` (so the run's end removes it with everything beneath it) and recorded as a non-enumerable `scratch.privateParent`. `makeScratchDirectory` makes its directory beneath `scratch.privateParent` when set and in the temp directory otherwise, so the callers (`sealed-brief-agent.js`, `judge.js`, `command-evaluator.js`, `run.js`, `score.js`, `preflight.js`) needed no change, and a unit that passes `[]` keeps today's layout. `preflight.js` `pipeline` and `score.js` make the parent first thing in their `try`, before any sandbox exists. `bridge.js` `socketPlace(scratch)` makes the socket directory beneath it (`SOCKET_DIRECTORY_PREFIX`, `MAX_SOCKET_PATH` now exported by `bridge.js`, which `workspace.js` imports, since the relay process runs `bridge.js` and must not load the workspace module); with no parent it keeps the old temp directory then `/tmp` fallback.
- The parent reaches `targetSandbox` as `privateParent`. Deviation from "through every `createProbePort` call": each call passes `privateParent: registry.privateParent`, a getter on the registry that reads the `scratch` list it was built with, because the nine call sites (`run.js`, `historical.js`, `preflight.js`) have the registry and not the scratch list, and threading the list through their callers would add parameters to a dozen functions for the same value. The source scan in `checkProbePortGitAccess` requires the option beside `git` in every call. A confined run whose registry has no parent (a unit that builds one by hand) withholds nothing, as a port with no `git` option does.
- Seatbelt: after the git rules and before the evaluation folder's denial, `(deny file-read* file-write* (subpath <parent>))` and `(deny network-outbound (remote unix-socket (subpath <parent>)))`. The second is needed: a probe on this host (macOS) showed the file denial alone leaves `connect()` to a socket under the parent open (`allowed`), and with the rule it answers `EPERM`; the case's Seatbelt revert check (rule removed) fails on exactly the two socket attempts. Bubblewrap: `--tmpfs <parent> --remount-ro <parent>` after the git rules, the evaluation folder's mount as before (the story names `--tmpfs`; the read-only remount matches the evaluation folder's and the git directory's). Every path goes through `assertProfileSafePath`; the audit's `withheld` list gains the parent; `targetSandbox` refuses a workspace inside it. The forbidden-input note of the isolation manifests is unchanged text, since it is part of the records ("evidence, records and digests are unchanged").
- Golden: three new outputs (`confinement.targetSandbox.wrap.seatbelt.privateParent`, `.bubblewrap.privateParent` and `environment.privateParent`, a git workspace with a parent); the diff has 71 added lines and no changed or removed line, so every existing profile is byte-identical. Bubblewrap is held by the golden only (this host is macOS).
- Test layout. `checkBridgePrivateDirectories` (`test/test-evaluate-evaluators.js`, group `evaluators`) runs two real CLI runs of a sealed-brief agent (qualification and trials, about 17 s together): confined, and with `"confinement": false` as the control that proves the attempts can see the directories. The stub agent (`--announce <file>`) writes the paths of its configuration file, working directory and socket (never the token) and a working file in its directory; the stub target's `probe-private` act (`test/fixtures/evaluate/mutation/bin/verdict.js`, `private-attempts.js`) acts only in the agent's own call and reads the announcement, reads the configuration (printing `token` when it holds a 48-hex admission token, never the value), lists the working directory and the parent, connects to the socket from a second process, scans the temp directory for the parent and writes its own temp directory (the granted-directory row). It leaves `verdict-private-leftover.js` running, which waits for the agent's next announcement (directories made after it started) and reports its attempts to a listener over `127.0.0.1`, as the existing leftover cases do. Revert checks observed: `privateParent: null` in the probe port (token printed, directories listed, socket connected, 8 failures confined) and the Seatbelt socket rule removed (the two socket checks fail).
- The judge's directory is covered by the arms suite's judge case, which now asserts each judge working directory sits in a `tea-evaluate-run-*` parent, and by `checkPrivateDirectorySources`, a scan holding every `mkdtempSync` of `cli/lib/evaluate` to the granted directories and the parent. The agent's own connection is admitted in every trial of both runs (records carry the `evaluator-chosen` observation, the stub ran once per attempt and trial). The probing run is not scored: the audit reports the target's attempts on the parent, as it does for the git directory (Story 1.57), so a probing trial scores Invalid by design.
- Existing cases moved with the layout. `checkSignalMidTrial` and `checkScratchRemoval` read the directories beneath the parent. A project's temp directory in `test-evaluate-evaluators.js` is now short (`/tmp/tea-ev-<pid>-<6>/t-<6>`, `scratchDirectories`' new `base` option), since under the suite's long temp path the parent falls back to `/tmp` and the cases that read the temp directory would no longer see it; `checkPrivateParent` covers both placements (short temp directory, and a temp directory too long for a socket, which falls back to `/tmp`) and the bridge's socket beneath the parent. `test-evaluate-run.js` reads the score staging directory two levels under the temp directory.
- The reference: `#### The bridge's admission token` under `### The evaluation layer` (after the fixed-conditions paragraph, since a sub-heading placed where the old two sentences were would absorb the paragraphs that follow), a pointer sentence where the old text was, a bullet in `### File-system confinement` and the audit sentence naming the parent. `checkBridgeTokenReference` (group `confinement`) reads the passage under the exact heading and fails while `can read that token before the agent connects` remains anywhere in the reference.
- Housekeeping: Story 1.57's sprint row and record read `done`; this story's row stays `in-progress` until the pull request opens (the coordinator sets `review`). No script was added or split, so `tools/test-shard-weights.json` is unchanged; the two new evaluators cases add about 20 s to the evaluators shard (weight 411.7 s in the 15 minute cap).
- Not changed, per the boundaries: what the profiles grant for the workspace, target tmp, report, status and port; the journal and reclaim logic (a killed run leaves the parent for Story 1.54, which now tracks one path); `sharedStateDigest`; opt-out runs; the Windows named pipe.
- Not run here: Bubblewrap (this host is macOS); the full `npm test`.

## Spec Change Log

## Review Triage Log

## Design Notes

A static list of private directories at `createProbePort` time would miss directories made later in the run, and a Seatbelt profile is fixed when a process starts, so a leftover process would reach any directory its profile does not name. One parent made at run start fixes both: the sandbox is built over a path that already exists, and its `subpath` rule covers children made afterwards. Withholding by prefix would hit other runs' directories and the directories a target must keep. The same parent gives Story 1.54 one path to mark and reclaim after a kill.

## Verification

**Commands:**

- `npm run test:isolation-primitives` -- expected: exit 0 after the golden is regenerated and its diff read
- `npm run test:evaluate-evaluators && npm run test:evaluate-run && npm run test:evaluate-confinement && npm run test:evaluate-preflight` -- expected: exit 0
- `npm run format:check && npm run lint && npm run lint:md && npm run docs:validate-links && npm run test:release-metadata` -- expected: exit 0
