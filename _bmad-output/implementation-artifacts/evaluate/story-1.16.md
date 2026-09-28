---
title: 'Evaluate authors its own suite, run live and recorded'
type: 'feature'
created: '2026-09-28'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'a2a032587e72f1c36b265dcb261dab160ba21d99'
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md'
  - '_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="Story 1.16 is approved in the Evaluate epic and delegated through the relay protocol">

## Intent

**Problem:** Evaluate has a manifest admission path, yet its own authoring loop has no committed proof against a real target.

**Approach:** Run the Evaluate skill against `bmad-testarch-evaluate` through the local Claude Code CLI, record the generated evaluation and proof artifacts, and register the result as the first `evaluate-authored` suite.

## Boundaries & Constraints

**Always:** Use the installed published eval-quality CLI for compile, seal, preflight and score. Run mutation and rollback only in a disposable copy. Keep the adopter worktree unchanged. Use `--from-working-tree` and record the dirty run. Keep canonical evaluation JSON outside Prettier formatting.

**Never:** Hand-build a runner, adapter or corpus. Invoke a generator-owned harness for this suite. Compute verdicts or scores in TeA. Commit `runs/` output.

## I/O & Edge-Case Matrix

| Scenario                  | Input / State                                              | Expected Output / Behavior                                                                                        | Error Handling                                         |
| ------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Live dogfood run          | `SPEC.md`, skill path, gitignored TEA config and local CLI | Clean control passes, seeded mutation is caught, rollback restores the baseline, and proof artifacts are recorded | Record the first failing command, exit code and stderr |
| Registered authored suite | Manifest entry and evaluation policy agree                 | Schema and coverage gates pass with `evaluate-authored`                                                           | Threshold drift fails `test:eval-schemas`              |
| Observable mutation       | One `references/` source controls the seeded output        | Mutation changes the observed stdout or exit code and the restored baseline passes                                | A mutation without a distinct signature is rejected    |

</frozen-after-approval>

## Code Map

- `src/workflows/testarch/bmad-testarch-evaluate/SKILL.md` -- stage order, config keys and repository-root command forms for check, compile, seal, preflight, run and score.
- `cli/skill-runner.js`, `cli/lib/resolve-tea-config.js`, `cli/lib/evaluate/arm.js`, `cli/lib/evaluate/registry.js` -- runner-driven arms, config propagation, disposable workspaces and authorized target execution.
- `test/evals/suite-manifest.json`, `test/schema/suite-manifest.js`, `tools/validate-eval-schemas.js` -- authored-suite registration, thresholds and coverage accounting. Preserve generator-owned entries.
- `test/evaluations/bmad-testarch-evaluate/` -- committed evaluation, contract, probes, mutation, corpus, digest and policy artifacts. Keep `runs/` ignored.
- `_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md` -- Dogfood Proof artifact contract and replay expectations.

## Tasks & Acceptance

**Execution:**

- [x] Prepare the gitignored TEA config and run EV from the skill path with intake answers from `SPEC.md`.
- [x] Commit the generated evaluation folder, manifest registration, `.prettierignore` rule and `epic-1-proof.md`; retain only runtime runs in the ignored path.
- [x] Validate the recorded contract with `tea-evaluate check`, eval-quality compile and seal, then run live, rollback, preflight and independent score checks.
- [ ] Update the sprint row, changelog and outcome record, then complete local gates, review, CI, CodeRabbit and merge.

**Acceptance Criteria:**

- Given a configured local target and the Evaluate skill, when EV runs from the working tree, then it creates `evaluation.json`, `contract.json`, probes, a mutation, `corpus-index.json` and `policy/` under the evaluation folder.
- Given the generated contract, when check, compile and seal run in order, then each exits 0 and the committed proof records the commands and engine version.
- Given clean and mutated arms, when preflight and the live run complete, then the clean control resolves `passed-clean-control`, the seeded probe resolves `caught` at `minimumTrialCount`, and rollback proves unequal mutated and pre-mutation digests plus equal restored and pre-mutation digests.
- Given the adopter worktree before and after the run, when its file digest and status are compared, then both remain unchanged and `run.json` records `dirty: true`.
- Given persisted records, isolation manifests and evaluator configuration, when eval-quality score runs directly, then each evidence artifact matches the TeA-produced bytes exactly and the named gaps are recorded once.
- Given the suite manifest, when the authored entry points to the evaluation policy and replaces the deferred entry, then `test:eval-schemas` and the full quality gate pass without generator-harness invocation.

## Implementation Notes

- The maintainer session ran EV by path from `SKILL.md`, answering intake from `SPEC.md`, with the gitignored `_bmad/tea/config.yaml` (`tea_evaluations_folder: test/evaluations`, `test_artifacts: test/eval-artifacts`) provisioned read-only into each workspace beside `node_modules`. TeA's own package takes the guides' repository-root branch (`node cli/evaluate.js`, `./node_modules/.bin/eval-quality`), so no private `test/evaluations/package.json` was written.
- Evaluate authored two behaviors. B-001 (material): Stage 11 names the AD-10 class of `tea-evaluate` exits 11 and 12; its class is stated once, in the exit table of `references/gaps.md`, so M-001 (development) and M-002 (held-out) each swap one row. B-002 (critical): Stage 1 maps a web application to `ai-feature` over `api`; its seed is refused because the rule is stated four times across two guides, recorded in `corpus/README.md`.
- The runner registry target is `cli/skill-runner.js` in the workspace, since `tea-skill-runner` is not on `PATH` in TeA's own checkout. Each request holds the reply to one JSON object through claude's `--json-schema`, passed by the runner's `--agent-arg`, with `basis` the one volatile field. Without it, about one reply in fourteen printed prose before the JSON, which fails preflight's `state-reset` and the oracles' field pointers.
- The recorded run: the Stage 6 preflight passed all eight checks and each run's own preflight its six; P-001 and P-004 `passed-clean-control` and P-002 and P-003 `caught` in 5 of 5 trials; both rollbacks proved; the adopter tree unchanged; an independent `eval-quality score` reproduced all four evidence artifacts byte for byte. Every artifact records `contractVerdict: CONCERNS` for four unsatisfied coverage rules, recorded as found in `epic-1-proof.md`; closing them needs a new contract and run, appended as Story 1.46.
- The folder's JSON came from a throwaway generator in `/tmp`, disclosed in the proof; drift found by review (the requirements' answer-line wording, a shared defect ID, a miscounted rule, the asset `.gitignore`) is recorded there and carried by Story 1.46, since the digested files cannot change without a new run.
- The manifest's `deferred` entry is replaced by the `evaluate-authored` entry `evaluate`, and its header comment, the README, the roadmap, the adoption guide, How TEA Is Tested and the step-file architecture page no longer describe the skill as deferred or behavioral suites as the only covering type.

## Spec Change Log

- None. The acceptance criteria stand as written; the CONCERNS verdict is the "recorded as found" branch of the live-run criterion.

## Review Triage Log

- The first Stage 6 preflight exited 12 because the maintainer edited `test/evals/suite-manifest.json` while it ran; the runtime's adopter-tree guard refused the qualification as designed. Every later command ran with the tree frozen, recorded in `epic-1-proof.md`.
- Revert checks observed: a changed manifest `trials` fails `test:eval-schemas` (`threshold trials differs`); removing the `evaluate-authored` entry fails it (`has no covering suite and no deferred declaration`); removing the `.prettierignore` rule makes `prettier --check` flag the evaluation folder's JSON.
- Adversarial review of the uncommitted diff found twelve items, each verified against the files. Fixed: the README and How TEA Is Tested still described the skill as deferred; the proof claimed eight preflight checks in each run (each run's own preflight has six), called the manual manifestation replies "schema-held" (they predate the `--json-schema` flag), counted three statements of the web-to-`api` rule (there are four), and claimed every `run.json` unchanged (the refused first preflight records `unchanged: false`); the proof now discloses the `/tmp` generator and maps the gap report's G-5; the evaluation's `.gitignore` ignores the compile and seal outputs; the fourth task stays open until merge. Carried by Story 1.46, since each touches a digested file and needs a new run: the requirements' answer-line wording, the shared defect ID `D-001`, `corpus/README.md`'s rule count and the skill asset `.gitignore`.
- The first full `npm test` stopped at `test:doc-count-sources`: `test/lib/doc-count-sources.js` read `runnerCapabilities` from every manifest suite, and the first real `evaluate-authored` entry has none. It now counts only the suites `eval:all` preflights, which the README's "ten of the twelve suites" sentence describes. The second run stopped at `test:doc-claims`: a hash-pinned claim keyed on the old "names exactly one skill" sentence and the adoption guide's manifest table. The roadmap claim and its trigger now read "`deferred` array is empty", the table gains the `evaluate` row, both pins carry the new manifest hash, and two restatements of the empty array were dropped.
- No file under `src/workflows/testarch/bmad-testarch-evaluate/` changed, so the builder Analyze and Validate Module gates do not apply.
- The third run stopped at `test:doc-invocations`, whose `npm run test:cli` example failed: `test/test-test-review-cli.js` expected one `eval:all` invocation per manifest suite. It now counts the suites with a harness, since `eval:all` skips the Evaluate-authored one.

## Verification

**Commands:**

- `npm test` -- expected: all quality gates pass.
- `npm run test:release-metadata` -- expected: release metadata remains synchronized.
- `npm run docs:validate-links` and `npm run docs:build` -- expected: documentation remains valid.
- Engine export check from the Build Rules -- expected: installed eval-quality exports required runtime symbols.
- Live proof and independent eval-quality score commands -- expected: recorded evidence and direct score are byte-identical.

**Results:**

- Engine export check: exit 0 at the start and the end (eval-quality 4.3.0).
- Live proof: `check`, `compile` and `seal` exit 0; the Stage 6 preflight and both runs exit 0 with preflight passed; `score` exits 0 for all four probes; the independent `eval-quality score` reproduces all four evidence artifacts byte for byte with equal exit codes. `epic-1-proof.md` records each command, digest and outcome.
- `npm test`: the final full chain passed every script through `lint`; `lint:md` then failed on two gitignored working drafts and a story frontmatter delimiter, and after those fixes `lint`, `lint:md` and `format:check` pass. The pre-commit hook runs the full chain again.
- `npm run test:release-metadata`: synchronized for v1.27.2. `npm run docs:validate-links`: all links valid. `npm run docs:build`: exit 0.
