---
title: 'Evaluate authors strong suites for two more target kinds'
type: 'feature'
created: '2026-09-28'
status: 'review'
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
- Both suites passed `check`, eval-quality compile and seal, live preflight, development and held-out three-trial runs. Their final evidence artifacts are `PASS` with zero unsatisfied coverage gaps. Every clean control passed three of three trials; every seeded, zero-action and gameability probe was caught three of three. Replay captures the sealed observations, records, isolation manifests, evaluator configuration, policy and evidence from each partition.
- `test:evaluate-authoring` is chained into `npm test`. It verifies frozen authoring inputs, corpus sections, complete replay hashes, partition probe inventories, compile and seal bytes, independent preflight and score bytes, `PASS`, votes and class rates. It launches no target and calls no model.
- The generic CLI runner rejects `type-violating` mutations on string-only arguments, options, environment values and headers. JSON stdin and JSON HTTP bodies remain typed. The HTTP probe port now applies one elapsed cap across resolution, preparation, send and redirects, with caller abort distinguished from cap expiry and large caps handled without timer overflow. Focused regressions exercise these paths.
- The pre-commit gate clears hook-local Git selectors while running the test chain. The test-review CLI fixture also clears inherited Git selectors and proves with a disposable sentinel that its nested commits leave the caller's branch and files unchanged.

## Live proof

| Target      | Partition   | Run                            | Score                          | Result               |
| ----------- | ----------- | ------------------------------ | ------------------------------ | -------------------- |
| AI feature  | Development | `20260928T233657627Z-70ab2549` | `20260928T233749867Z-8fc29c63` | 10 `PASS`, zero gaps |
| AI feature  | Held-out    | `20260928T233806427Z-5c534b20` | `20260928T233838321Z-f794865d` | 3 `PASS`, zero gaps  |
| Test review | Development | `20260928T230839868Z-4d00f346` | `20260928T230924332Z-d0065037` | 12 `PASS`, zero gaps |
| Test review | Held-out    | `20260928T230939180Z-7dcac3a6` | `20260928T231012894Z-d0352c76` | 4 `PASS`, zero gaps  |

The source run directories are ignored. The four selected replay bundles are committed with a SHA-256 file inventory and their original run IDs. The AI session's first post-sync development attempt hit an occupied loopback port; the next invocation passed. Its gap report records the attempt and final score IDs. The fixture intakes set `minimumTrialCount` to three and confirm the policy severity, evidence and boundaries.

## Spec changes and open findings

- The original local Claude CLI authoring attempt reached the subscription's weekly quota. The owner directed a fresh `gpt-6-sol` high-reasoning authoring session. Story 1.24's criterion in `epics.md` records the amendment. The incomplete attempt remains historical; the final proof comes from the two isolated sessions above.
- The original strong-state sentence gave zero-action clean controls both `passed-clean-control` and `caught` outcomes. The criterion now assigns `passed-clean-control` to those controls and `caught` to defect and gameability probes. The live votes and replay checks use those states.
- The published eval-quality 4.3.0 body schema cannot express malformed raw HTTP JSON bytes. Story 1.50 now owns an engine release, byte-preserving HTTP port and scored parser-defect proof.
- `run --partition` filters scored probes while a shared contract interaction plan can execute an input intended for the other partition. These fixtures use shared request inputs with distinct private mutations and probes, so their development records reveal no held-out-only input. Story 1.51 owns partition-specific execution and a canary test.
- The two gap reports record authoring and schema repairs. No remaining coverage gap is claimed closed by a failed score.

## Builder and review

The changed Evaluate skill asset was edited directly under the documented Codex builder exception. The installed builder's quick validation, prompt metrics, workflow-integrity prepass and script scan passed. Its path scanner reported two unchanged high findings in `SKILL.md` and `references/adapters.md`; the same lines fail on main and concern neither changed asset. Independent five-lens Analyze found zero new critical or high findings. The HTTP port conformance passed 19 portable and six focused adapter checks. Final code review and CI results are recorded below after completion.

## Verification

- `npm run test:evaluate-authoring`: pass; both suites replay byte for byte.
- `npm run test:evaluate-api`: 264 checks passed.
- `npm test`: passed all chained scripts, including lint, Markdown lint and Prettier, on the final source and plan. The first attempt reached ESLint and exposed one new regex style issue; it was fixed before the passing run.
- `npm run test:release-metadata`: passed for v1.27.2.
- Engine export check: installed eval-quality exports `evaluateTarget`.
- Revert checks: appending one byte to the committed AI contract and one replay observation separately made `test:evaluate-authoring` fail; both files were restored byte for byte and the test passed again. The HTTP large-cap regression failed before its timer fix and passed afterward.
- Pre-commit E2E reproduction: with inherited hook Git selectors, `test:doc-invocations` ran `test:cli`, moved the caller's worktree branch to its fixture branch `append-spec`, and failed when the fixture file disappeared. The staged Story 1.24 tree was recovered exactly from lint-staged's index commit `fc473eba` into `feat/evaluate-1.24-recovered`. A normal Suite 8 run passed 27/27 after the fix, and a hook-style run with selectors aimed at a disposable sentinel passed while its branch, HEAD and file remained unchanged.
- `git diff --check`: pass.

## Review triage and merge

Pending fresh review, CI, CodeRabbit and merge.
