---
title: 'Drive the run and interpret the gaps'
type: 'feature'
created: '2026-09-28'
status: 'done'
route: 'dispatch'
review_loop_iteration: 3
baseline_commit: '1012274bb123e34ef6f30b42288109ca961a2dc2'
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md'
  - '_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="owner delegated Story 1.14 and RELAY.md grants build and merge authority">

## Intent

**Problem:** Evaluate stops after choosing an evaluation layer. Its mutation, harness, run, and gap guides are placeholders, so an adopter cannot drive and improve a scored evaluation through the skill.

**Approach:** Teach realistic mutation choice, risk-based policy setting, the executable run sequence, and evidence-led gap repair. Validate the guidance and worked artifacts against the installed runtime and eval-quality contracts.

## Boundaries & Constraints

**Always:** Meet Story 1.14's approved criteria and test-design revert checks. Use the runtime mutation schema and installed eval-quality exports as sources of truth. Keep the adopter in control of thresholds. Read held-out results only from `gap-view.json`. Preserve eval-quality as the only verdict and strength authority. Use workflow-builder Edit and its Analyze gate for skill edits, then run `npm test`.

**Never:** Change model weights or provider as a mutation, evaluate a vendor dependency itself, duplicate scoring or ingest logic, add framework-specific imports to `cli/`, or publish private employer details.

## I/O & Edge-Case Matrix

| Scenario      | Input / State                                        | Expected Output / Behavior                                                       | Error Handling                                                    |
| ------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Mutation plan | Behavior and reachable observable channel            | M-NNN file uses one realistic single-source edit and a valid signature           | Refuse unobservable or vendor-changing mutation with reason       |
| Run plan      | Chosen layer, contract, policy and evaluation folder | Install private latest-spec dependencies, preflight, run and score; record exits | Halt on nonzero stage exit and retain diagnostics                 |
| Gap repair    | CONCERNS, FAIL, Invalid or weak strength             | Cite evidence, author a specific repair, rerun development and rescore           | Record before/after or adopter's decline; hold out remains closed |

</frozen-after-approval>

## Code Map

- `src/workflows/testarch/bmad-testarch-evaluate/references/{mutation,harness,run,gaps}.md`: replace four placeholders with worked stage guides.
- `src/workflows/testarch/bmad-testarch-evaluate/SKILL.md`: enable Stages 8 through 11 while retaining the Stage 12 stop.
- `src/workflows/testarch/bmad-testarch-evaluate/assets/{scoring-policy.template.json,evaluator-conditions.template.json,evaluation-folder.gitignore}`: installed starter inputs; values stay unfilled until adopter choice.
- `cli/lib/evaluate/schemas/mutation.schema.json` and `cli/lib/evaluate/check.js`: exact M-NNN shape and additional validation.
- `cli/lib/evaluate/score.js`, `test/test-evaluate-interpret.js`, and `cli/lib/evaluate/partition.js`: persisted diagnostics, interpretation, and redacted held-out views.
- `test/test-evaluate-guidance.js`: extend its heading, tagged-example, runtime-schema and engine-backed guidance checks.
- `node_modules/eval-quality/schemas/preflight-verdict.schema.json`: installed preflight check kinds; `OUTCOME_STATES` and `DISCIPLINE_RULES` come from the installed package.

## Tasks & Acceptance

**Execution:**

- [x] Author the four guides through the workflow-builder Edit procedure in Codex, with each named lesson, worked reading, tagged mutation example, risk row, command and repair step.
- [x] Extend the guidance gate to validate every dynamic mapping, heading, table row, tagged mutation and ordered loop step, including one removal or corruption check per acceptance area.
- [x] Run the builder Analyze procedure, the focused guidance gate, each revert check, the engine export check and `npm test`; record the unavailable official slash invocation accurately.
- [x] Update `CHANGELOG.md`, the Story 1.14 sprint row and this outcome record in the same PR.

**Acceptance Criteria:**

- Given a behavior and its observation channel, when the mutation guide is followed, then the adopter can select and validate a realistic M-NNN edit for each named mutation class and refuse an invalid vendor change.
- Given a target's risk and evaluator conditions, when the harness guide is followed, then the adopter chooses every threshold, creates the policy and conditions from installed templates, and understands strict catch-rate and comparable-trial rules.
- Given a sealed evaluation, when the run guide is followed, then its private latest-spec installation and the correct in-repository or adopter commands drive preflight, run and score while preserving exits and diagnostics.
- Given an evidence artifact or score exit 3 without one, when the gap guide is followed, then every engine outcome, discipline rule, preflight check and AD-10 exit maps to a concrete repair, with development rerun before the held-out run.
- Given a required example, mapping, reading or loop step is removed or corrupted, when `test:evaluate-guidance` runs, then it fails.

## Implementation Notes

- Followed the installed workflow-builder Edit process directly in Codex and authored `mutation.md`, `harness.md`, `run.md` and `gaps.md`. The slash skill was unavailable in this runtime; no official builder invocation succeeded. Stage 8 through Stage 11 are available; Stage 12 retains its placeholder stop.
- The mutation guide carries seven tagged runtime-schema-valid files. The harness keeps policy choices with the adopter. The run guide uses the private latest-spec installation and runtime commands. Gap mappings match installed outcome states, discipline rules and preflight check kinds.
- The guidance gate checks exact headings, risk rows, command order, tagged mutation files, mapping key sets and ordered repair steps. Its negative cases remove or corrupt one item in each acceptance area.
- The direct Analyze procedure ran `prepass-prompt-metrics.py`, `prepass-workflow-integrity.py`, `scan-path-standards.py`, `scan-scripts.py` and `quick_validate.py`, followed by two independent reviewers covering five lenses. Their first pass found engine-reading and guidance issues. The corrected guides describe unique probe-ID class rates, per-probe comparability, the held-out reduced outcome object, Stage 6 policy timing, runtime isolation validation, durable gap-report resume and the invocation ID used by `score`. The second lens pass found zero critical and zero high findings.

## Spec Change Log

- The Epic 1 Build Rules and Story 1.14 authoring criterion now name the Codex fallback procedure. The official slash skill was unavailable, so the local builder's Edit process, scanners and independent Analyze lenses supplied the authoring gate. The product acceptance criteria remain the same.

## Review Triage Log

- Direct Analyze synthesis: `../../../src/workflows/testarch/bmad-testarch-evaluate/.analysis/2026-09-28-0625/skill-analysis-report.md`. It was rendered from scanner output and reviewer findings; it is not an official builder invocation. Its ignored report and memlog files, an explanatory `_bmad/` fragment and an existing adapter path trigger baseline path-scanner flags. The changed guides introduce no path-scanner finding.
- Blind 1, `mutation.md:5`: medium, patch. The corpus guide and CLI require a fresh `corpus-index.json` after a mutation file changes; a direct `check` can reject the stale index. Add `digest` before `check`.
- Blind 2, `gaps.md:85`: medium, patch. Authoring a probe or mutation changes indexed files, so the repair loop also needs `digest` before `check`.
- Blind 3, `harness.md:3`: medium, patch. The installed scoring policy template has `policyId: null` and the schema requires a value. Ask the adopter to name it.
- Blind 4, `harness.md:9`: medium, patch. `evaluation.json` starts at three trials; `check.js` rejects a trial count below `minimumTrialCount`. Align the manifest with the selected policy.
- Blind 5, `run.md:7`: medium, patch. Stage 6 preflight creates `runs/` before the Stage 10 installation instruction. Put the ignore rule before the first preflight.
- Blind 6, `gaps.md:78`: medium, patch. `cli/evaluate.js` defines exits 0, 10, 11, 12 and 64, so the exit 13 row describes an unreachable code. Remove it.
- Blind 7, `run.md:37`: medium, patch. `evaluation.json.strengthFloor` sets the adopter's class targets, yet the guide gives no instruction to read the scored class rates against them. Add that reading before held-out execution.
- Blind 8, `mutation.md:75`: medium, patch. The example changes a denied tool result to approved, which makes the create call consistent with the agent's stated rule. State the faulty behavior in the tool that returned false approval.
- Blind 9, `SKILL.md:3`: low, patch. Discovery text still advertises only Stage 7 even though Stages 8 through 11 are available. Correct its one-line description.
- Blind 10, `test/test-evaluate-guidance.js:1929`: medium, patch. The command-order check can pass a run command missing `--evaluation`; require executable command forms with their arguments and a removal check.
- Edge 1, `harness.md:3`: medium, patch. The absent-policy path leaves required `policyId` null if the adopter fills only the three named thresholds. This is the same root cause as Blind 3.
- Edge 2, `harness.md:3`: medium, patch. A selected minimum above `evaluation.json.trials` makes `check` exit 10. This is the same root cause as Blind 4.
- Edge 3, `gaps.md:19`: medium, patch. The permitted held-out view exposes probe ID, class and outcome without behavior ID, so the guide cannot infer the same behavior from a missed row. Direct repair planning by class.
- Edge 4, `test/test-evaluate-guidance.js:2005`: medium, patch. The gaps gate does not assert the strict catch-rate operator; changing `>` to `<` can pass it. Add an exact reading check and a corruption case.
- Verification Gap: no findings.
- Review fixes: all verified patch findings were corrected in the guides and guidance gate. The first full run after review reached lint, which rejected an absent-index comparison in the new Stage 6 test; the corrected assertion passed focused guidance, lint and formatting checks before the final full rerun.
- Final PR review round 1: three fresh reviewers verified that `tea-evaluate score` emits one evidence artifact per probe. The previous worked two-of-five class rate and per-artifact `strengthFloor` comparison would make a false run-wide claim. The guides now read each artifact as per-probe evidence, record the absent run-wide gate, and ask the adopter to confirm held-out readiness. Story 1.45 carries the engine-owned aggregate and floor gate; the Epic 1 dependency, test design and sprint row were added in this PR.
- Final PR review round 1: the earlier Blind 6 removal decision was wrong. AD-10 reserves `tea-evaluate` exit 13 for the planned PR replay even though the current CLI cannot emit it. The guide restores that row with its future-stage scope; the guidance gate derives its exit key set from AD-10 and checks every class value.
- Final PR review round 1: the reviewers also found bare commands outside the installed private prefix, a TeA self-run path that could mix engine versions, and a remedy check satisfied by the key text when its remedy cell was blank. Stages 6, 8, 9, 10 and 11 now give the executable paths, while the guidance gate checks the local engine, class mapping, remedy cells and corruption cases.
- Final review checkout limitation: the first round's three isolated checkouts linked `node_modules` to the main checkout. Their full `npm test` runs reached `test:evaluate-promptfoo`, where a path-identity assertion failed on that symlink's real path. The source commit's own full test and commit-hook full test passed. The next review round will use copied dependencies.
- Final PR review round 2: CodeRabbit and the adversarial reviewer reproduced a Stage 6 blocker. A controlled-mutation probe named `M-001`, while its file was absent; `digest` passed and `check` exited 10 before Stage 8. Stage 6 now authors and digests nominated mutation files before `check`. Its preflight qualifies them; Stage 8 reads the evidence and expands the set. The guidance gate removes that early authoring instruction to prove the check rejects the regression.
- Final PR review round 2: the edge reviewer found that eval-quality divides class catches by exercised qualified probe IDs. The gap guide now states that denominator and keeps held-out score diagnostics closed. A held-out `outcome: null` routes to a development reproduction or a blocked gap. The test-quality reviewer found that AD-10 class changes, placeholder remedies and a wrong mutation signature channel could escape the guidance gate. The gate now reads AD-10 source classes, rejects placeholder remedies and checks the channel in each signature clause, with negative cases.

## Verification

**Commands:**

- `npm run test:evaluate-guidance`: passed with seven runtime-schema-valid mutation examples and negative removal or corruption checks.
- `node --input-type=module -e "const m = await import('eval-quality'); if (typeof m.evaluateTarget !== 'function') process.exit(1)"`: passed.
- `npm test`: passed after the direct Analyze fixes, the first PR review fixes, and the round-two fixes. The latest full run ended with clean ESLint, markdownlint and Prettier checks. Each round-two reviewer also passed `npm test` on the prior pushed commit in an isolated checkout with copied dependencies.
- `npm run docs:validate-links`: passed with 44 files scanned and zero issues.
- First and second PR reviews: changes requested and verified. Their Story 1.14 findings were corrected; one engine-owned aggregate remains as Story 1.45. Two fresh round-three reviewers found no material source defect on the corrected commit. The coordinator's full suite and every source-head CI check, including coverage, passed.
