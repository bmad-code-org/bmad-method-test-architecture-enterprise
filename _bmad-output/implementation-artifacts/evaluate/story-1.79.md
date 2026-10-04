---
title: 'Hold the gameability scoring branch of a sealed-brief baseline to starting no agent version probe'
type: 'feature'
created: '2026-10-04'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '14218e7be313ba32e9c47c03c0048594a08ba913'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.78.md'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.107.md'
---

<frozen-after-approval reason="owner delegated Story 1.79 build through the Evaluate relay">

## Intent

**Problem:** Story 1.78's case runs `tea-evaluate ci --tier pr` over a sealed-brief baseline that holds no gameability probe, so `gameabilityCheck` returns at its no-probe exit and its scoring branch never runs under the tripwire. A version read added after that return passes the case. The stub agent cannot judge a gameability arm: it quotes `verdict: rejected` for any stdout that lacks `verdict: accepted`, a gameability arm's stdout is `verdict: pending`, and `eval-quality score` refuses the unwitnessed quotation (exit 3).

**Approach:** The stub agent learns one flag, `--quote-observed-verdict`. Story 1.78's case adds the gameability probe to its project, asserts the accepted baseline holds the probe, and asserts the `gameability` row took its scoring branch under the wire.

## Boundaries & Constraints

**Always:** Keep every other stub mode byte-stable in behavior. Assert the baseline holds the probe before the replay. Prove each new assertion with a mutant.

**Never:** Change `ci.js`, `run.js` or any production file; the revert checks inject a version read in a scratch copy. Add a harness or runner file.

</frozen-after-approval>

## Premise Check

What a sealed-brief baseline holds when the evaluation runs a gameability arm (observed from a real run, then read in the code):

- The run seals a trial set per arm: `trials/gameability-P-004/trial-<n>.json`, `trial-sets/P-004/` (records and isolation manifest) and an entry `gameability:P-004` in `trial-sets.json`.
- `probes/P-004.probe.json` is written by `preflight.js` (`gameabilityQualified`, after the engine verdict) and again by `run.js` (`attemptProbeFile`, when the trial set seals, refused with exit 12 if the file is absent). `compare --accept` copies `probes/` whole, and `scoreInputList` makes it a required member, so a baseline of a gameability run always holds the file, with `qualification.route === 'gameability'`.
- `qualification/P-004/naive-oracle-satisfied.json` and `disciplined-oracle-rejected.json` are baseline members too.
- The accepted score invocation holds `P-004/evidence-artifact.json` and `P-004/score.json`. With the agent judging each trial a catch, the evidence is `contractVerdict: CONCERNS` (the fixture's coverage gaps, the same CONCERNS P-001 and P-002 carry), O-001 `violated` and `caught`, O-002 `confirmed`, `reducedProbeOutcomes[0].trialVotes` three `caught`.

What `gameabilityCheck` reads and does:

- It reads `baseline/` through `locateBaseline`, lists `baseline/probes/*.probe.json` and collects the ids whose `qualification.route` is `gameability`. With none it returns OK with the note `no gameability probe` and the output `the baseline holds no gameability probe`.
- With ids it takes the scoring branch: `replayScore(context, baseline)` (cached per `ci` run in `context.once('replay-score')`, and the plan runs `gameability` before `replay`, so the gameability check is the call that does the scoring), which places the baseline in a scratch run directory and calls `runScoreCommand`, that is `eval-quality score` once per probe. Per id the check writes `P-004: gameability arm scored through eval-quality score, exit <n>; <evidence path>`, takes the probe's exit and passes CONCERNS lines of the evidence as warnings.
- Nothing in that branch reaches an agent start or a version probe. The one probe site is `observeAgentVersion` in `run.js` (the run, its qualification and its trials); `ci.js` imports `runRunCommand` from `run.js` but the `pr` checks never call it. A version read could be added at the head of the branch, after `replayScore` or in the result loop, and each of those is now covered.
- The row's recorded fields under the scoring branch: `exit 0`, `class pass`, `action warn` (one warning, `gameability P-004: eval-quality records CONCERNS in its evidence artifact`), `notes []`. The no-probe return records `notes ['no gameability probe']` and `action pass`.

What it takes for the stub to judge the arm:

- The stub calls the `verdict` tool, and the bridge answers a gameability call from the degenerate response (`degeneratePort`), so the observation's stdout is `request: Judge the request.\nverdict: pending\n`.
- The stub answers `fail` with `quote: 'verdict: rejected'` because that stdout lacks `verdict: accepted`. The quotation is not in the observation, so `eval-quality score` refuses P-004 (`finding F-001: unwitnessed quotation on channel stdout`, exit 3, no evidence artifact), and `compare --accept` refuses the run for the missing evidence. Observed: 1.78's attempt reproduced exactly.
- With `--quote-observed-verdict` the failing row quotes `verdict: pending`, which the stdout holds, so each trial is a catch.

AC amendments from the premise check: the `gameability` row's action is `warn` (exit 0, class `pass`) because the evidence carries CONCERNS, so "the row passes" is held as exit 0 and class `pass`; the row's output line and the probe's presence in the baseline are asserted too; the case extends Story 1.78's case instead of adding a sibling, because a sibling would repeat the 9-second run for no extra coverage and Story 1.78's own revert checks all still hold over the larger baseline. `epics.md` and `test-design-epic-1.md` carry the amended wording. No engine change is needed.

## Code Map

- `test/fixtures/evaluate/evaluators/stub-evaluator-agent.js`: `--quote-observed-verdict`, documented in the header; the failing row's quote is `/verdict: \S+/` of the call's stdout when the flag is present and `verdict: rejected` otherwise. Nothing else changes.
- `test/test-evaluate-evaluators.js`: `useSealedBriefAgent` takes `quoteObservedVerdict`; `checkSealedBriefCiReplayStartsNoVersionProbe` passes it, adds `addGameabilityProbe(folder)` (the helper Story 1.34's case uses), asserts the baseline's probe file, trial set and caught votes before the replay, the `gameability` row (class, notes, one warning, output line) after it, and adds P-004's evidence artifact to the byte comparison. The loop that holds each row to action `pass` now expects `warn` for `replay` and `gameability`. The case keeps its registration in `CASES` and in the `--agent-version-only` list.
- `epics.md` Story 1.79 and `test-design-epic-1.md` Story 1.79: amended wording.
- `CHANGELOG.md`: Story 1.79 entry; the Story 1.78 entry no longer says the gameability branch stays unproved.

## Design Decisions

- The flag is the narrowest stub change: it replaces one string and only when asked. The suite's other sealed-brief cases never pass it.
- The baseline assertions read the copy of the repository the `ci` run replays, so they describe what the replay saw.
- The gameability warning is asserted by exact text so a second warning or a changed row fails the case.

## Revert Observations

Mutants run in a scratch copy of HEAD with the changed files copied over (`mut-1.79-build-a`); each fails the case on the named assertion. The control column runs the same ci.js mutant against HEAD's test (`mut-1.79-build-b`).

| Revert                                                                                                     | Result on the new case                                                                | Control on HEAD's case             |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------- |
| Child process starting the agent with `--version` at the head of the scoring branch (before `replayScore`) | fails: `the pr tier invoked the removed agent CLI, a version read included`           | passes (survivor Story 1.78 filed) |
| The same child after `replayScore`                                                                         | fails on the wire                                                                     | passes                             |
| The same child in the result loop                                                                          | fails on the wire                                                                     | passes                             |
| `gameabilityCheck` returns at the no-probe exit anyway                                                     | fails 4 assertions: row action, the row and its notes, the warning, the output line   | not applicable                     |
| Probe reading skipped (no id collected)                                                                    | the same 4 assertions                                                                 | not applicable                     |
| The stub's other modes alter a quotation (`verdict: refused` in place of `verdict: rejected`)              | `--qualification-only` fails 15 checks (mutated arm agreement, unwitnessed quotation) | not applicable                     |

## Mutant Table

Each new assertion has a mutant that fails it; a mutant that survives is recorded with its reason.

| Assertion                                                              | Mutant                                                                        | Result                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Wire stays empty                                                       | version read at the head, after `replayScore`, in the result loop (3 mutants) | killed                                                                                                                                                                                                                                           |
| Row notes omit `no gameability probe`, row class and action            | return at the no-probe exit; probe reading skipped                            | killed (row action, row text, output)                                                                                                                                                                                                            |
| Row output names the arm scored through `score`                        | the output line dropped                                                       | killed (`the gameability check's output was ""`)                                                                                                                                                                                                 |
| Row warns with the one CONCERNS line                                   | `warnings: []`                                                                | killed (action and warning text)                                                                                                                                                                                                                 |
| Baseline holds the probe, trial set and caught votes                   | the case leaves `addGameabilityProbe` out                                     | killed (probe file, trial sets, votes, row)                                                                                                                                                                                                      |
| Votes are `caught`                                                     | the stub flag answers `pass` on every call                                    | killed: the run stops at qualification, exit 11 (`agreement fell below 0.9 on mutated:M-001`), before any vote exists                                                                                                                            |
| Stub judges the arm                                                    | the case leaves the flag off                                                  | killed: `score` refuses P-004 and `compare --accept` is refused                                                                                                                                                                                  |
| Baseline holds the probe file                                          | `preflight.js` and `run.js` stop writing gameability probe files              | the run itself refuses (exit 12, `probes/P-004.probe.json is not a file the runtime wrote`); the case's probe-file assertion is held by the leave-out mutant above, since no production edit can drop the file from a baseline that was accepted |
| Stub's other modes unchanged                                           | altered quotation                                                             | killed in `--qualification-only`                                                                                                                                                                                                                 |
| Stub quote altered to a substring of the original (`verdict: rejecte`) | first attempt                                                                 | survived as an equivalent mutant: the engine witnesses a quotation by containment, so the substring is still found; replaced by `verdict: refused`                                                                                               |
| Probe file removed from `probes/` only in `preflight.js`               | one writer dropped                                                            | survived as an equivalent mutant: `run.js` writes the file when the trial set seals; both writers removed gives the exit 12 above                                                                                                                |

## Verification

- `npm run test:evaluate-evaluators`: 807 checks passed (391 s wall under concurrent mutant runs, below the 491 s weight, so `tools/test-shard-weights.json` stays).
- `node test/test-evaluate-evaluators.js --agent-version-only --only=sealed-brief`: 30 checks passed (23 before; the case alone runs about 9 s).
- `npm run test:evaluate-ci`, `test:evaluate-partition-plans` (the other suite that runs the stub), `test:evaluate-agents`, `test:evaluate-held-attempts`, `test:evaluate-private` and `test:evaluate-records` (the groups of the evaluators file the stub serves): all exit 0.
- `npx eslint . --max-warnings 0`, `npm run format:check`, `npm run lint:md`, `npm run docs:validate-links`.
- No docs change: `docs/reference/tea-evaluate-cli.md` says `score` and a baseline replay read the recorded configuration without starting the agent CLI, which the case now also holds for the gameability branch. No file under `src/workflows/testarch/bmad-testarch-evaluate/` changed, so builder Analyze does not apply.

## Review Triage Log

No review round ran in the build; the coordinator runs the final review.
