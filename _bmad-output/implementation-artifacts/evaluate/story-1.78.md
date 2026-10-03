---
title: 'Prove a sealed-brief accepted-baseline replay through ci starts no agent version probe'
type: 'feature'
created: '2026-10-03'
status: 'review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '7364dc4a'
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
- The plan is the verdict fixture's `pr` entries with the folder rewritten, committed with the project, so the case runs the same seven checks an adopter's plan runs (api-conformance is absent because the fixture declares no HTTP target).
- Evidence bytes compared: each probe's `evidence-artifact.json`, `strength-aggregate.json` and `strength-floors.json`, the set the ci suite compares. The replay does not rewrite the other score files.
- The two rows of the test design are one case: the wire is one log for the whole `ci` run, and the case asserts the plan's ids ran, each exited 0 and the log stayed empty.

Sprint rows: Story 1.77 and Story 1.76 flipped from `review` to `done` here, as both merged (TeA #318 and #316) and their records said the next coordinator flips them.

## Verification

- Revert observations: a child process that starts the agent with `--version`, injected at the head of `replayCheck`, `gameabilityCheck` and `oracleAgreementCheck` in turn, fails the case on the tripwire assertion each time; `ci.js` restored after each.
- Gates: filled in at merge.

## Review Triage Log

Filled in as the review rounds complete.
