---
title: 'Prove a sealed-brief accepted-baseline replay through ci starts no agent version probe'
type: 'feature'
created: '2026-10-03'
status: 'review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '7364dc4aae01252f3e92a5682376cdd5c264a6d4'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.76.md'
---

<frozen-after-approval reason="owner delegated Story 1.78 build and merge through the Evaluate relay">

## Intent

**Problem:** Story 1.76 proves with a tripwire that `score` and a copied accepted baseline replayed through `score` start no agent version probe. The real replay path, `tea-evaluate ci --tier pr`, is not exercised for a sealed-brief run: `cli/lib/evaluate/ci.js` imports `run.js`, which holds the one probe site, so a version read added to the replay check would pass every test.

**Approach:** One case in `test/test-evaluate-evaluators.js` accepts a sealed-brief baseline, replaces the agent command with a tripwire, runs the `pr` tier of the plan over a copy of the repository and asserts the rows, the replayed evidence bytes and the empty wire.

## Boundaries & Constraints

**Always:** Prove the tripwire live before the run (one direct call recorded, then cleared). Run every `pr` check of the plan, the replay included.

**Never:** Change `ci.js`, `run.js` or any production file. Add a version read anywhere to prove the case; the revert checks inject one temporarily and restore the file.

</frozen-after-approval>

## Code Map

- `test/test-evaluate-evaluators.js`: `writePrCiPlan` copies the `pr` entries of the committed verdict CI plan into the sealed-brief project; `checkSealedBriefCiReplayStartsNoVersionProbe` is the case, registered in `CASES` (group `evaluators`) and in the `--agent-version-only` list.
- `test/lib/evaluate-baseline.js`: `copyOf` and `commitAll`, reused as Story 1.76's case reuses them.
- `epics.md` Story 1.78 AC 1 and `test-design-epic-1.md` Story 1.78: amended to name `test:evaluate-evaluators`.

## Design Decisions

- The case lives in the evaluators suite. The sealed-brief project, its stub agent and its baseline acceptance are there, and `test/test-evaluate-ci.js` has no sealed-brief fixture. Rebuilding that in the ci suite would duplicate it, so the AC's "`test:evaluate-ci` case" is amended to `test:evaluate-evaluators` and the gate list keeps both suites.
- The plan is the verdict fixture's `pr` entries with the folder rewritten, committed with the project, so the case runs the six `pr` checks of the verdict plan, an adopter's default seven less api-conformance (the fixture declares no HTTP target).
- Evidence bytes compared: each probe's `evidence-artifact.json`, `strength-aggregate.json` and `strength-floors.json`, the set the ci suite compares. The other files in `replay/scores` are call records, which the replay row excludes too.
- The two rows of the test design are one case: the wire is one log for the whole `ci` run, and the case asserts the plan's ids ran, each exited 0 with action `pass` (the replay `warn`, CONCERNS only) and the log stayed empty.

Story 1.79 is appended at the end of lane 1 for the gameability scoring branch (epics.md section, test-design section, dependency row, sprint row and both lane lists).

Sprint rows: Story 1.77 and Story 1.76 flipped from `review` to `done` here, as both merged (TeA #318 and #316) and their records said the next coordinator flips them.

## Verification

- Revert observations (a child process that starts the agent with `--version`, injected temporarily in a scratch copy or restored by `git checkout`): at the head of `replayCheck`, `replayScore`, `checkCheck`, `gameabilityCheck`, `oracleAgreementCheck` and `engineStageCheck`, each fails the case on the tripwire assertion; an `observeAgentVersion` call in `replayCheck` fails it; skipping `gameability` in the check loop fails the ids assertion; a replay that returns OK without scoring fails the byte comparison.
- Survivors, filed or dropped: a read in `liveRun` (no `pr` check reaches it and a live run starts the agent by design, so the AC clause is dropped); a read after the gameability no-probe return (the baseline holds no gameability probe; Story 1.79); a replay that compares a file with itself (held by `test:evaluate-ci`, whose comment names that revert).
- Gates: `npm run test:evaluate-evaluators`, `npx eslint . --max-warnings 0`, `npm run format:check`, `npm run lint:md`, `npm run docs:validate-links`, `npm run test:release-metadata`; CI carries the full `npm test` chain.

## Review Triage Log

Round 1 (blind, edge case, verification gap; three Opus reviewers):

- AC 1 and the revert column promised `liveRun` (all three): **medium**, patched. `liveRun` is unreachable on the `pr` tier; the clause is dropped with the reason in the AC and the test design.
- The gameability row passed vacuously, since the baseline holds no gameability probe and the check returns before scoring (blind 2, verification 2): **medium**, filed as Story 1.79 after an attempt to add the probe here failed (the stub agent quotes `verdict: rejected` for any stdout lacking `verdict: accepted`, and a gameability arm's observation made its quotation unwitnessed). CHANGELOG, test design and AC now say the row is held at its head only.
- The case never asserted the plan's ids by literal (blind 3): **low**, patched. `writePrCiPlan` asserts the six ids and that no entry still names the fixture folder.
- A run with no run directory returned without a failed check (edge 3): **low**, patched.
- Rows were held to `exit === 0` only (edge 4): **low**, patched. Every row must be action `pass`, the replay `warn` with CONCERNS lines alone, matching the ci suite's fixture.
- The launch-count assertion could not fire, since the tripwire replaced the stub that writes the capture (blind 5): **low**, patched. It is dropped from this case; Story 1.76's identical line stays.
- The tripwire guards `agentArgs[0]`, not `agentCommand` (edge 2): **low**, skipped. The custom adapter's `versionArgv` always prepends `agentArgs`, so the probe path is covered.
- The record said seven checks, rewrote "the other score files" wrongly and kept a short baseline SHA (blind 4 and 7, verification 3 and 4): **low**, patched.

CodeRabbit (one finding, **low**, valid, fixed and resolved): the tripwire exited 1 without a message, so a failing check's captured output gave no reason. It now writes the rejected invocation to stderr before exiting; the log assertion stays.
