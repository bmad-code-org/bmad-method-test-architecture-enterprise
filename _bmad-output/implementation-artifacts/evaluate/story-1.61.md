---
title: 'Story 1.61: Teach file-system confinement in the Evaluate skill'
type: 'feature'
created: '2026-10-02'
status: 'done'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: '3401cbfb'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 1.61)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.61 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-16, AD-18)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.60.md (the audit)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.63.md (the network declaration)'
  - '{project-root}/AGENTS.md'
---

## What changed

The Evaluate skill's guides now teach file-system confinement, each passage verified against the code as of `3401cbfb` (`cli/lib/evaluate/confinement.js`, `registry.js`, `preflight.js`, `check.js`, `score.js`, `schemas/evaluation.schema.json`, the reference's `### File-system confinement`).

- `references/harness.md` gains `## Declare what a confined target reads`: what the audit lists as `observedMounts` and why `score` exits 3 for each, the registry entry's `systemPaths` (absolute paths, reads only, command, tool-server and HTTP entries, the same `systemPaths` and `network` for two entries over one target or `check` exits 10, nothing under the evaluation folder, the git directory or the private root is grantable) and one tagged `evaluation-fragment` example. The existing `network` passage and `registry` example from Story 1.63 stay.
- `references/run.md` gains `## Run confined`: Seatbelt through `/usr/bin/sandbox-exec` on macOS and Bubblewrap through `bwrap` on Linux, the observer each needs (`/usr/bin/log stream`, `strace` 6.1 or later), the trivial-process probe, the exit 12 refusal of a host with no mechanism, a mechanism the host refuses or an observer that cannot confirm itself, the opt-out (`"confinement": false`, `run.json` records `"opt-out"`, no audit, the target can reach the evaluation folder), the network namespace and the `"network": "host"` declaration, and what `run.json` records (`confinement` and `hostNetwork`).
- `references/gaps.md` gains `## Map an isolation violation to its repair`: where `observedMounts` is read, a four-row table (declare in `systemPaths`, repair the target, repair the target for a protected path, write inside the workspace), what an empty list proves on each platform (opt-out observes nothing, macOS log loss, `io_uring`), the Linux connection-failure repair (`"network": "host"`) and the pointer for an exit 12.
- `test/test-evaluate-guidance.js`: a marker for every taught passage in the three sections, scoped to each section by heading; `checkSystemPathsFragment` validates the tagged fragment against the runtime `evaluation.json` schema merged into the starter manifest, pins its entry (`verdict`, `["/opt/verdict-rules"]`, default confinement and network) and proves the validation can fail (the schema refuses the same fragment with a relative path); `checkIsolationViolationGuidance` pins the gaps table's rows, causes and repair phrases; a byte-stability check holds the two exit-table rows the dogfood mutations M-001 and M-002 replace (`replace-exact`, one occurrence each).
- `CHANGELOG.md`, `sprint-status.yaml` (this story `review`, Story 1.63 `done`, Story 1.84 `backlog`), `story-1.63.md` status `done`.

## Scope decisions (owner, relayed by Kerem)

1. `references/ci.md` stays byte-identical to `main`. Editing it invalidates the committed capture records in `test/fixtures/evaluate-ci-repos/` (they pin the SHA-256 of `ci.md`, `SKILL.md` and the plan template), and rerunning the two live `claude -p` sessions that Story 2.4's record describes is denied by the auto-mode classifier. This story neither edits `ci.md` nor runs those sessions.
2. The `ci.md` part (the `ci-registry` example gains `"network": "host"` and the sentence that on Linux the live checks need it, the matching marker in `checkCiGuidance`, and the rerun of both sessions with regenerated `capture-record.json`) is Story 1.84, appended in this PR: `epics.md` section with acceptance criteria and revert checks (dependency 1.61), `test-design-epic-1.md` section, Epic Dependencies row (later rows renumbered, 97 stories), a `backlog` row in `sprint-status.yaml`, and the end of lane 2 in the `epics.md` lane list and `parallel_lanes`.
3. Story 1.61's criterion and test-design section no longer name `ci.md` or the live sessions. The criterion gains an `And` that holds `ci.md` and the two exit-table rows byte-stable, with the revert checks named. The amendment says why.
4. The `gaps.md` exit-table rows that M-001 and M-002 replace are byte-stable: the new section sits before `## Map AD-10 exits and classes to repairs`, and `test:evaluate-guidance` asserts both `find` strings still occur once. No offline suite applies the dogfood mutations, so that occurrence check is the holder.
5. Lane 2 runs Story 1.83 before 1.84, and 1.83's criterion would edit the ci guide. Story 1.83's criterion now leaves `ci.md` to Story 1.84, which depends on 1.61 and 1.83 and teaches the authorization 1.83 introduces in place of `"network": "host"` (1.83 removes that field from the schema), so one rerun of the live sessions covers the edit.

## Skill gate (AD-16, AD-18)

The three guides were edited through `bmad-workflow-builder` (the installed project skill at `/Users/murat/opensource/.claude/skills/bmad-workflow-builder`), Edit intent, headless, in two rounds, by a subagent that read `SKILL.md`, `references/build-process.md` and `references/scan-orchestration.md`, resolved customization, kept a memlog and applied the reviewed text.
The builder has no delta mode: Analyze ran its pre-pass scripts over the whole skill and its five lenses scoped to the added sections.
Round 1 Analyze: 0 critical, 0 high, 4 medium, 11 low.
Round 2 (after review fixes), delta: 0 critical, 0 high, 0 medium, 5 low.
The builder's memlog and analysis (`.memlog.md`, `.analysis/2026-10-02-0902/`) are gitignored.

Findings left, with reasons:

- `scan-path-standards.py` reports `/usr/bin/sandbox-exec` and `/usr/bin/log` in `run.md` as high. They are the host's system binaries, the reference names them the same way and `checkRunGuidance` requires the strings, so the finding contradicts a repository test.
- Its other highs are the builder's own `.memlog.md`, a bare `_bmad` reference in `SKILL.md` and a `../` in `adapters.md`, all outside this change.
- architecture-1 (route the exit 12 repair from Stage 6): a routing sentence in `SKILL.md` is outside the three guides this story scopes; the gaps guide now points at `## Run confined` and the CLI reference.
- determinism-1 (a CLI pre-pass that classifies observed mounts): a code change, outside this story.
- The low findings are repetition of the network rule across the three guides and `until Story 1.83`; the criterion names the passages and the tests assert them.

## Review

Round 1 ran two subagent lenses (bounded, read-only on source apart from restored mutations): an adversarial review of the three sections against the code, and test quality by mutation of the new checks (about 1,240 in-process mutations).

Fixed (each verified against current code first):

- `gaps.md` exit 12 sentence said "before any trial" and "a host condition", but exit 12 also covers a partial clone, a history too large to pack and a mid-run observer failure. It now says "a host or project condition" and points at the CLI reference for each further cause.
- An empty `observedMounts` claim omitted the audit's blind spots: `io_uring` on Linux and a macOS read after the trial's last log read. Both are named.
- Row 4 (a write outside the workspace) lacked the opt-out for a target that must commit or write elsewhere.
- `strace` had no version floor; it now says 6.1 or later, the version the reference and the probe require.
- The opt-out sentence said "only"; it now lists the targets that must write outside the workspace, commit or read the git directory, and a project whose history the runtime cannot pack.
- `hostNetwork` lists entries on every platform; the guide now says only a `bubblewrap` run isolates the entries it leaves out.
- Row 3 used "the user's private root" undefined; the cause now says "the runtime's private scratch root".
- 17 surviving mutations: each is now killed. Added markers for the exit 12 cause list, the opt-out condition, the platform of the namespace, the `run.json` sentence, the empty-list readings, the Linux connection-failure sentence and the fragment prose; the table check compares the observed path and the cause cell exactly and requires the repair phrases; the fragment check pins the entry the prose names.

Skipped:

- `until Story 1.83` in adopter-facing text goes stale when 1.83 ships. Story 1.63 put the same phrase in `harness.md`, and Story 1.83's criterion already requires replacing it in every guide.
- "reads the whole host except ... the project's git directory" omits that the worktree's own entry stays readable. The distinction does not change any `systemPaths` decision and the reference states it.
- Analyze enhancement-2 (a pointer from the harness section to `isolation-manifest.json`): the harness section names the `observedMounts` entry of the trial set's isolation manifest, and `gaps.md` gives the full path.

## Revert checks (each observed once)

- Deleting the fragment's tag, changing its `systemPaths` entry to a relative path, or changing its `interfaceId`: `test:evaluate-guidance` fails.
- Deleting or altering a passage of any of the three sections (about 40 mutations over harness, run and gaps, then the 10 survivors the review found): `test:evaluate-guidance` fails on each.
- Appending one byte to `references/ci.md`: `test:evaluate-ci` fails with "references/ci.md changed since the live session read it".
- Changing the padding of the `tea-evaluate 12` row in `gaps.md`: `test:evaluate-guidance` fails with "gaps.md holds 0 of the 1 occurrence(s) of the row M-002 replaces". `tea-evaluate check` over the dogfood evaluation does not read the target artifact, so it passes; the guidance check is the gate.

## Gate summary

Run locally: `test:evaluate-guidance`, `test:evaluate-ci` (ci.md untouched), `test:evaluate-gap-loop`, `test:install`, `test:conflict-markers`, `format:check`, `lint`, `lint:md`, `test:release-metadata`.
`docs:validate-links` and `docs:build` are not run: no file under `docs/` changed.
The full `npm test` chain and `test:evaluate-arms` run in CI on eight shards.
Builder Analyze: 0 critical, 0 high.

## Round 1 review

Three Opus lenses (accuracy, test quality, compliance) returned 11 findings. Each was verified against current code or the plan files first.

Fixed:

- A1: the audit grants the operating system's directories and the whole Node installation prefix, so `harness.md` now says a toolchain outside those grants is listed (`confinement-audit.js` `SYSTEM_ROOTS`, `nodeInstallRoot`).
- A2: the opt-out for a partial clone is reworded. A partial clone is refused with a fetch-the-full-history message (`workspace.js`), and a history is unpackable above about six million objects; `run.md` says both.
- A3: `run.md` now says an isolated HTTP service must listen on `127.0.0.1` or `::1`, since any other address stops the call (`http-target.js`, `confinement-relay.js` `bridgeHostOf`).
- A4: `gaps.md` links the CLI reference by URL as `evaluator.md` does, since `docs/` is not shipped in an installed skill.
- A5: the refused character is a double quote only (schema pattern `^/[^"\\\u0000-\u001f]*$`); both guides say "double quote".
- T1: the `network` passage under `## Run a skill or agent target confined` is held by markers scoped to that heading, including the model-call clause, the namespace sentence and the default-network clause.
- T2: `harness.md` names `/opt/verdict-rules` beside the fragment and the test marks it, so the fragment comment's claim holds.
- T3: the `eval-quality records each one as an isolation violation` marker joins `checkIsolationViolationGuidance`.
- C1: `epics.md`, `test-design-epic-1.md` and this record name `test:evaluate-guidance` (the occurrence check) as the holder of the two exit-table rows, with the matching revert check.
- C2: Story 1.63's two round notes are restored to `origin/main` verbatim in `epics.md` and `test-design-epic-1.md`; the 1.61 notes say they supersede the `ci.md` clauses.
- C3: Story 1.83's criterion and test-design row leave the ci guide to Story 1.84; 1.84 gains the dependency on 1.83 (section, Epic Dependencies row, test-design) and teaches the authorization 1.83 introduces.

Skipped: none.

The builder Analyze delta over the changed sentences found 0 critical, 0 high, 0 medium and 3 low (sentence length, a Bubblewrap-only condition in a dense paragraph, a URL that resolves once the docs reach `main`).
Its path-standards script again flags `/usr/bin/sandbox-exec`, `/usr/bin/log` and the example path `/opt/verdict-rules` as high; they are system binaries and an example value the tests require, so they stay.

## Round 2 review

One Opus regression lens at a373aae4 confirmed the round 1 fixes against the code (17 mutants killed, gates green) and found one material defect: after C3 made 1.84 depend on 1.83, its criterion still required a `"network": "host"` example that 1.83 removes from the schema. Fixed in `epics.md` and `test-design-epic-1.md`: 1.84 teaches the authorization 1.83 introduces. No further rounds, per the owner's limit instruction.
