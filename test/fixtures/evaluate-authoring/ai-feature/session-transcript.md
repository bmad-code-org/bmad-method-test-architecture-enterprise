# Evaluate authoring session transcript

## 2026-09-28 22:45 UTC: Intake and source inspection

Read `REQUEST.md`, `evaluate/SKILL.md`, `evaluate/customize.toml`, the installed `evaluate/references/inspection.md`, `intake.md`, `corpus.md`, `contract.md`, `oracles.md`, `adapters.md`, `evaluator.md`, `mutation.md`, `harness.md`, `run.md`, and `gaps.md`. Read the installed starter assets for the contract, evaluation manifest, requirements, inspection, policy, conditions, HTTP port, and conformance test. Read only `target/DESCRIPTION.md`, `target/intake-answers.md`, `target/rules/policy.json`, and `target/server/grade.mjs` from the target. No repository or prior evaluation was read.

Decision: classify the adopter feature as an HTTP `ai-feature` reached through an `api` interface. Its grade result must be checked using HTTP status and parsed response body, including agreement between decision and reason. The intake confirms three trials per probe and snapshot `fixture-model-1`.

Vendor-model redirect: the request asked whether the underlying vendor model is good at answer grading. I scoped this evaluation to the adopter's answer-grading feature with `fixture-model-1` fixed. I will mutate adopter-owned policy or feature code. I will not evaluate or mutate vendor weights, version, or provider.

## 2026-09-28 22:46 UTC: Safe endpoint observation

Started the frozen target from this folder with `PORT=43210 node target/server/grade.mjs`. Called `POST /grade` over loopback for a safe answer, a restricted answer, a strict short answer, and a missing answer. Observed, respectively: `200 pass/accepted`; `200 reject/restricted-term`; `200 reject/too-short` with `mode:strict`; `400` with `answer must be a string`. Stopped the server. These are spot checks and no eval-quality verdict.

## 2026-09-28 22:47 UTC: Authored draft

Wrote `inspection-record.md` and `requirements-statement.md`, and copied the confirmed statement bytes to `evaluation/requirements.md`. Authored `evaluation/contract.json`, `evaluation/evaluation.json`, `evaluation/policy/scoring-policy.json`, `evaluation/policy/evaluator-conditions.json`, `evaluation/evaluator/selection.md`, `evaluation/evaluator/mapping.json`, seven controlled mutations, twelve probes, development and held-out corpus inputs, gameability response, corpus index, HTTP adapter copies, and `completion-notes.md`. The local authoring script is `authoring.py`.

Evaluator decision: select TeA deterministic checks, since the target promises exact status and JSON fields. A model judge or semantic rubric would add unnecessary variability. The target model snapshot remains a fixed condition.

Policy decision: the adopter confirmed three trials and severity ranking but did not supply policy ID or thresholds. I authored `answer-grade-critical-v1-proposed` with floor `low`, catch threshold `0.9`, and minimum trial count `3` as an explicit proposal for confirmation at import. No claim of adopter approval is made.

Held-out decision: listed P-011 through P-013 in `heldOutProbes`; kept their corpus files under `corpus/held-out/`. Development gap repair must read only held-out IDs, classes, and outcomes through `gap-view.json`. The invalid-JSON raw request is recorded in the development corpus; the installed HTTP port does not send raw request bodies, so this case needs an adapter extension before sealed live coverage can be claimed.

## 2026-09-28 22:48 UTC: Static checks

Parsed every authored JSON file. Counted each mutation's `find` text in its corresponding frozen target file; all seven occurred exactly once. Counted twelve probe files. No TEA runtime or eval-quality executable is present in this isolated folder. `tea-evaluate digest`, `check`, `preflight`, `run`, `score`, and eval-quality `compile` and `seal` were not attempted. No engine verdict, strength, qualification, or rollback evidence was produced.

## 2026-09-28 22:50 UTC: Correction and final local audit

I found that P-007's first signature could not distinguish a malformed response from clean behavior. I changed M-003 to emit a grade-like `200 reject/invalid-type` response, changed P-007 to sign its `decision` in the nominated response body, and tightened O-003 to check both missing and non-string requests. I changed M-005 to reverse case normalization; it now affects the development restricted case and a separately sealed held-out case. I aligned each mutation manifestation witness operation with its behavior. Refreshed the local corpus index after those edits.

Reparsed every authored JSON file, verified every mutation `find` string appears exactly once in its frozen target file, and recalculated every local corpus-index hash. All three static checks passed. Recorded frozen target SHA-256 values: `DESCRIPTION.md` cec6a03842ad30f772ebebac32b37130987257e0a66ad0a11bf635a3c5206a03; `intake-answers.md` 71082ddea341bc72580dc1a0259c46729bd7027b3fbb2f007d77fa37a8f8926d; `rules/policy.json` 1645dc943ad0833cf1dd79ed3073864bffd24425d5b55c3fb028d7a8bcf2d71e; `server/grade.mjs` 44003d0495db12a6b2f463ae6cfc395877ca83e4694cde3107902dde75f843b5. The target and intake were never edited.

Final handoff: deliver the authored suite and notes to the maintainer for runtime import. The policy choice requires adopter confirmation. The local index needs the official `tea-evaluate digest`. Schema validation, port conformance, mutation qualification, rollback, sealed scoring, and invalid-JSON HTTP coverage remain unverified here because no TEA runtime or eval-quality executable is available and the stock HTTP port cannot send a raw invalid JSON body.

## 2026-09-28 22:51 UTC: Frozen-input verification

Read `authoring-inputs.sha256` without editing it. The four recorded hashes match the independently computed target hashes above. An attempted `git status --short` produced no repository status because this isolated folder is not a Git worktree.

## 2026-09-28 22:51 UTC: Artifact naming

Renamed one held-out input file so its name matches its contents. Refreshed the local corpus index. The probe itself retains only the P-012 ID in the development-facing manifest.
