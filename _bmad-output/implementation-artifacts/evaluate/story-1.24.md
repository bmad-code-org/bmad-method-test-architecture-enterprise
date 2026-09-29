---
title: 'Evaluate authors strong suites for two more target kinds'
type: 'feature'
created: '2026-09-28'
status: 'done'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: '83f7b6b664d9ae2ee14c5f8919348c2c9cf291ae'
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md'
  - '_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md'
---

## Intent

Prove that Evaluate can author strong, replayable suites from only a target description and confirmed intake for two further target kinds: an HTTP AI feature and a CLI test-review mechanism.

## Delivered

- Two isolated `gpt-6-sol` high-reasoning authoring sessions received the installed Evaluate skill, a frozen target copy, its description and its confirmed intake. The committed fixtures include those inputs and their SHA-256 inventory, inspection and requirements records, session transcripts, evaluator selections, contracts, corpora, mutations, policies and gap reports.
- The AI-feature suite covers answer acceptance, restricted content, malformed structured inputs, label-and-reason agreement and gameability. The test-review suite covers valid assertions, absent assertions, disabled tests, malformed requests and all-flagging gameability. Both selected deterministic evaluation because their observable outputs have exact predicates.
- Both suites passed `check`, eval-quality compile and seal, live preflight, development and held-out three-trial runs. Their evidence artifacts are `PASS` with zero unsatisfied coverage gaps under the adopter-confirmed scoring policies. Every clean control passed three of three trials; every seeded and gameability probe was caught three of three. Replay captures sealed observations, raw preflight request and response traces, mutation qualification and rollback files, records, isolation manifests, evaluator configuration, policy and evidence from each partition.
- `test:evaluate-authoring` is chained into `npm test`. It verifies frozen authoring inputs against run target digests, canonical corpus sections, authored probe and policy binding, complete replay hashes, qualification and rollback evidence, held-out input isolation, partition inventories, compile and seal bytes, independent preflight and score bytes, `PASS`, votes and class rates. It launches no target and calls no model.
- The generic CLI runner rejects `type-violating` mutations on string-only arguments, options, environment values and headers. JSON stdin and JSON HTTP bodies remain typed. The HTTP probe port now applies one elapsed cap across resolution, preparation, send and redirects, with caller abort distinguished from cap expiry and large caps handled without timer overflow. Focused regressions exercise these paths.
- The pre-commit gate clears hook-local Git selectors while running the test chain. The test-review CLI fixture also clears inherited Git selectors and proves with a disposable sentinel that its nested commits leave the caller's branch and files unchanged.

## Live proof

| Target      | Partition   | Run                            | Score                          | Result               |
| ----------- | ----------- | ------------------------------ | ------------------------------ | -------------------- |
| AI feature  | Development | `20260929T015026071Z-cd62054f` | `20260929T015138101Z-9aa9324d` | 10 `PASS`, zero gaps |
| AI feature  | Held-out    | `20260929T015150075Z-d649d588` | `20260929T015241073Z-e81c8e10` | 3 `PASS`, zero gaps  |
| Test review | Development | `20260929T013519187Z-9e9381ce` | `20260929T013558463Z-ae8d217a` | 12 `PASS`, zero gaps |
| Test review | Held-out    | `20260929T013608696Z-4571b7ff` | `20260929T013645779Z-83e3a563` | 4 `PASS`, zero gaps  |

The source run directories are ignored. The four selected replay bundles are committed with a SHA-256 file inventory and their original run IDs. The AI session's first post-sync development attempt hit an occupied loopback port; the next invocation passed. Its gap report records that attempt and the refreshed score IDs. The fixture intakes set three trials and confirm the risk ranking, evidence and boundaries. The adopter confirmed both policy IDs, `low` severity floors and `0.9` catch thresholds during review; each evaluation records that decision under `policy/decision.md`. The AI policy ID dropped its draft suffix before the final two runs.

## Spec changes and open findings

- The original local Claude CLI authoring attempt reached the subscription's weekly quota. The owner directed a fresh `gpt-6-sol` high-reasoning authoring session. Story 1.24's criterion in `epics.md` records the amendment. The incomplete attempt remains historical; the final proof comes from the two isolated sessions above.
- The original strong-state sentence gave zero-action clean controls both `passed-clean-control` and `caught` outcomes. The criterion now assigns `passed-clean-control` to those controls and `caught` to defect and gameability probes. The live votes and replay checks use those states.
- The confirmed AI intake requires rejection of malformed raw HTTP JSON. The published eval-quality 4.3.0 body schema cannot express those bytes. The authoring session recorded this refusal and supplied the raw input as an unscored corpus item. Story 1.50 owns the engine release, byte-preserving HTTP port and scored parser-defect proof. This boundary is open and is excluded from Story 1.24's strong verdict.
- `run --partition` filters scored probes while a shared contract interaction plan can execute an input intended for the other partition. These fixtures use shared request inputs with distinct private mutations and probes, so their development records reveal no held-out-only input. Story 1.51 owns partition-specific execution and a canary test.
- The held-out AI mutation preflight observations record the uppercase restricted answer and array-valued answer named in P-011 and P-013, including each request and the mutated target's passing response. Their three scored trials use shared development request inputs selected by the same defect signatures. The verdict proves a three-trial catch of each held-out mutation; each named case has one recorded preflight manifestation. The replay checks both claims separately.
- The two gap reports record authoring and schema repairs. No remaining coverage gap is claimed closed by a failed score.

## Builder and review

The changed Evaluate skill asset was edited directly under the documented Codex builder exception. The installed builder's quick validation, prompt metrics, workflow-integrity prepass and script scan passed. Its path scanner reported two unchanged high findings in `SKILL.md` and `references/adapters.md`; the same lines fail on main and concern neither changed asset. Independent five-lens Analyze found zero new critical or high findings. The HTTP port conformance passed 19 portable and six focused adapter checks. Final code review and CI results are recorded below after completion.

## Verification

- `npm run test:evaluate-authoring`: pass on the final confirmed-policy bundles; both suites replay byte for byte with bound qualification and witness traces.
- `npm run test:evaluate-api`: 264 checks passed.
- `npm test`: passed all chained scripts, including lint, Markdown lint and Prettier, on the final source and plan. The first attempt reached ESLint and exposed one new regex style issue; it was fixed before the passing run. The final standalone run passed after the replay and policy repairs.
- `npm run docs:validate-links`: passed, 44 files and zero broken links. `npm run docs:build`: passed.
- `npm run test:release-metadata`: passed for v1.27.2.
- Engine export check: installed eval-quality exports `evaluateTarget`.
- Revert checks: appending one byte to the committed AI contract and one replay observation separately made `test:evaluate-authoring` fail; both files were restored byte for byte and the test passed again. Changing an authored probe's canonical rationale and regenerating its corpus index failed the authored-to-sealed semantic check. Inserting a private held-out canary into a development run record and updating the replay manifest hash failed the privacy scan. Each original file was restored and the replay passed again. The HTTP large-cap regression failed before its timer fix and passed afterward.
- Pre-commit E2E reproduction: with inherited hook Git selectors, `test:doc-invocations` ran `test:cli`, moved the caller's worktree branch to its fixture branch `append-spec`, and failed when the fixture file disappeared. The staged Story 1.24 tree was recovered exactly from lint-staged's index commit `fc473eba` into `feat/evaluate-1.24-recovered`. A normal Suite 8 run passed 27/27 after the fix, and a hook-style run with selectors aimed at a disposable sentinel passed while its branch, HEAD and file remained unchanged.
- `git diff --check`: pass.

## Review triage and merge

Three independent `gpt-6-sol` high reviewers passed the repaired proof after earlier findings were fixed: source-to-replay binding, primary qualification and rollback files, canonical rationale tags, development input privacy, raw manifestation traces, gameability evidence and policy confirmation. PR #257 exceeds CodeRabbit's 100-file review limit, so it cannot receive a CodeRabbit review. All source-head CI checks on `f9cb3dbc`, including five test shards and coverage, passed. The completion-only status commit is subject to a fresh final-head CI pass before merge.
