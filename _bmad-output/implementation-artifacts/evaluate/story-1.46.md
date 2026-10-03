---
title: "Story 1.46: Close the dogfood suite's coverage gaps"
type: 'feature'
created: '2026-10-03'
status: 'in-review'
baseline_commit: '76356837d84193880b2de8472b3e82376dc713d9'
route: 'dispatch'
review_loop_iteration: 1
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules and Story 1.46)'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (Story 1.46)'
  - '_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-15, AD-19, AD-20)'
  - '_bmad-output/implementation-artifacts/evaluate/epic-1-proof.md'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.16.md'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.51.md'
---

<frozen-after-approval reason="The owner gave GO for the Evaluate relay and assigned Story 1.46 to lane 3">

## Intent

**Problem:** Every evidence artifact of Story 1.16's dogfood run records `contractVerdict: CONCERNS`: four coverage rules are unsatisfied at `critical`, B-002 has no seeded probe because its rule is stated four times, and four pieces of drift sit in the digested files. Story H.1 cannot accept a baseline with a coverage gap at or above the severity floor.

**Approach:** Run Evaluate's Stage 11 loop over `test/evaluations/bmad-testarch-evaluate/` through the local Claude Code CLI. Author the step, oracle and reference set each rule names, state the web-application rule once so B-002 can be seeded, correct the drift, rerun and rescore on a clean tree, and hold every repair offline with a replay over real eval-quality.

## Boundaries & Constraints

**Always:** Live legs use the local Claude Code CLI, no API key. The suite's thresholds stay equal in `evaluation.json`, the scoring policy and the suite manifest. Guide edits go through `bmad-workflow-builder` Edit, headless, with an Analyze run. Compute no verdict or rate in TeA.

**Never:** Edit `SKILL.md` (a `sessionRead` key of the live capture records) or `references/ci.md`. Add a model call to a test. Commit `runs/`, `compiled-contract.json` or `sealed-brief.json`.

## I/O & Edge-Case Matrix

| Scenario              | Input / State                                                          | Expected Output / Behavior                                                          | Error Handling                                                  |
| --------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Clean control         | Committed folder, unmutated guides                                     | `passed-clean-control` in five of five trials, artifact `PASS`, no unsatisfied rule | N/A                                                             |
| Seeded probe          | One mutation of one guide sentence or table row                        | `caught` in five of five trials at `minimumTrialCount`, rollback proved             | A mutation that does not manifest exits 11                      |
| Repair removed        | Contract without the indicator, matcher, quantifier or `covers-by-key` | `CONCERNS` naming exactly that rule                                                 | N/A                                                             |
| Second rule statement | A second web-application sentence in any guide                         | `test:evaluate-guidance` names both lines                                           | `test:evaluate-guidance` fails; the seed's single place is gone |

</frozen-after-approval>

## Code Map

- `test/evaluations/bmad-testarch-evaluate/` -- the repaired folder: `contract.json` (four behaviors, four oracles, reference set `exit-table`, `/status` indicator, `/exits` collection, four plan steps), `probes/P-001` to `P-009`, `mutations/M-001` to `M-005`, `requirements.md`, `corpus/README.md`, `evaluation.json` (`confinement: false`), `corpus-index.json`.
- `src/workflows/testarch/bmad-testarch-evaluate/references/inspection.md`, `adapters.md`, `corpus.md`, `gaps.md`, `run.md`, `assets/README.md`, `assets/evaluation-folder.gitignore` -- the web-application rule stated once, the refusal sentence, the ignore list.
- `test/test-evaluate-dogfood.js`, `test/fixtures/evaluate-dogfood/skill-reader.js` -- the offline replay and its deterministic reader; `package.json`, `tools/test-shard-weights.json`, `README.md` count.
- `test/test-evaluate-guidance.js` -- single-statement guard, mutation-occurrence loop, refusal-sentence marker.
- `epic-1-proof.md`, `epics.md`, `test-design-epic-1.md`, `sprint-status.yaml`, `CHANGELOG.md` -- record, plan amendments, Stories 1.112 to 1.115.

## Tasks & Acceptance

**Execution:**

- [x] Contract, probes, mutations, requirements, README, `evaluation.json` -- author the repairs through a throwaway generator (`author.cjs`, session scratch) -- closes G-1 to G-5 and the drift
- [x] Skill guides through `bmad-workflow-builder` Edit -- one web-application statement, one refusal sentence, ignore list -- lets M-003 and M-005 edit a single place
- [x] `test:evaluate-dogfood` and the reader -- offline replay plus revert variants -- every repair has a failing revert
- [x] Live Stage 6 preflight, development run, held-out run and scores from a clean clone -- recorded in `epic-1-proof.md`
- [x] Plan amendments, Stories 1.112 to 1.115, CHANGELOG, sprint row `review`
- [x] Revert each acceptance check once and record it below

**Acceptance Criteria:**

- Given the repaired folder, when `tea-evaluate check`, `eval-quality compile` and `seal` run, then each exits 0 and the engine's coverage reports no unsatisfied rule.
- Given a clean tree, when the Stage 6 preflight, a development run and a held-out run execute live, then preflight passes, every clean control resolves `passed-clean-control`, every seeded probe resolves `caught` at five trials, and all nine evidence artifacts record `PASS`.
- Given the gap report and `epic-1-proof.md`, when the rerun is scored, then each of G-1 to G-5 records its before and after outcome in both.
- Given `requirements.md`, `corpus/README.md`, the defect IDs and the `.gitignore` asset, when `test:evaluate-dogfood` runs, then the digests agree, the JSON fields are named as evidence, the rule count is one, each defect ID is unique and the asset lists what Stage 6 writes.

## Implementation Notes

- The folder came from a session-scratch generator, as Story 1.16's did, with the model's place in the offline test taken by `skill-reader.js`. The generator is not committed; `tea-evaluate check` guards the authored files.
- A reference set holds one key, so `exit-table` holds the thirteen ids and O-003 tests each record's class against the table's eleven-class vocabulary. Pairing each id with its class would make M-001 and M-002 fail O-003 as well, and a mutation that moves two oracles breaks `seeded-faults-scoped`.
- The first design of B-004 sent a malformed `prompt`. The model then never reached Stage 11 and refused because the schema described refusal, so no guide edit could change the outcome. The type-violating value moved to a second declared key (`stdin.exit`), the request kept its Stage 11 question, and `references/gaps.md` gained the sentence M-005 edits. Live: five of five `refused` unmutated, five of five `answered` with a class mutated.
- The first design of B-002 left the rule in the table rows and removed the prose sentence. A live Stage 1 reply then said `AI feature` or `web application` for `targetKind`, because the prose sentence is the only place that names the machine value `ai-feature`. The prose sentence stayed as the single statement and the table row labels lost the web mention.
- The suite opts out of confinement. A confined target's private home holds no Claude login, so every call exited 4. Story 1.113 files the confined route.
- A lane worktree shares its refs with the other lanes, so a commit elsewhere fails a long run with exit 12. The recorded runs came from a standalone clone of the branch at a clean commit. Story 1.112 files it.
- A preflight's `seeded-faults-scoped` check evaluates every seeded probe's witness relation on the other probes' legs, so P-009's relation names the class as well as the status; a status alone fires on every leg that answered.

## Spec Change Log

- Epics amended: Story 1.46 gains the offline replay criterion and an amendment paragraph (B-003, B-004, the single statement, the opt-out); the `epics.md` header counts, the FR map, the lane 3 list, the dependency table and H.1's dependencies carry Stories 1.112 to 1.115.

## Review Triage Log

Round 1 (builder Analyze, test review, adversarial review; every finding verified against the files)

| Finding                                                                                                                                                         | Verdict                              | Evidence and fix                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Analyze: four highs (`SKILL.md` Stage 6 restatement and the missing `--partition development`, `corpus.md` over its 9,000-token budget, model-computed digests) | Present on `main` before this branch | Stage 6 is Story 1.111's, the `corpus.md` carve is filed as Story 1.114 and the digest command as Story 1.115. The AD-16 gate (zero critical and zero high) is not met as written: the four highs predate this branch, and Stories 1.111, 1.114 and 1.115 clear them. The branch adds none. |
| Analyze: `assets/README.md` and `run.md` still name `runs/` alone as ignored                                                                                    | Valid                                | Both name `compiled-contract.json` and `sealed-brief.json`.                                                                                                                                                                                                                                 |
| B-004 tested the schema's wording                                                                                                                               | Valid                                | The type-violating value moved to `stdin.exit` and the guide gained the refusal sentence; P-009 and M-005 seed it.                                                                                                                                                                          |
| The single-statement guard missed most restatements, and its comment overclaimed                                                                                | Valid                                | The guard flags any line naming a web application beside `api` or `ai-feature`, and a planted restatement in either spelling must fail it. `corpus.md`'s worked example dropped "in a web application".                                                                                     |
| The reader refused every refuse-step request                                                                                                                    | Valid                                | It reads the guide's sentence and the request's `exit` field.                                                                                                                                                                                                                               |
| `check` ran twice, variants asserted the full rule list, the mutation loop passed on an empty folder                                                            | Valid                                | One `check`, variants assert `CONCERNS` and the expected rule, the loop fails on an empty folder.                                                                                                                                                                                           |
| Prettier failed on the planning files; ordering and Story 1.113 criteria contradicted themselves; writing-rule breaks; requirements left out `ai-feature`       | Valid                                | Files formatted; lane paragraph and 1.115 and 1.113 criteria rewritten; sentences cut; requirements state the kind.                                                                                                                                                                         |
| M-003 might fail to manifest beside other passages that point a web application at `api`                                                                        | Disproved live                       | Four of four mutated Stage 1 replies named `web`, with the table row and the adapters sentence still present; the preflight qualified P-005 in the recorded run.                                                                                                                            |

Round 1 revert observations (each change applied locally, the named suite run, file restored with `git checkout`):

- A second web-application statement in `adapters.md` failed `test:evaluate-guidance` (`found ["references/adapters.md:201","references/inspection.md:7"]`).
- Dropping the `tea-evaluate 64` row of the exit table failed `test:evaluate-dogfood` (`the exit table holds thirteen rows`).
- Giving P-003 the defect ID `D-001` failed it (`defect IDs are shared across probes`).
- One byte appended to `requirements.md` failed it (`contract.json sourceSpecDigest is stale`).
- The `.gitignore` asset reduced to `runs/` failed it (`the .gitignore asset lists compiled-contract.json`).
- Removing the refusal sentence from `gaps.md` failed `test:evaluate-guidance` (`holds 0 of the 1 occurrence(s) of the text M-005 replaces`).
- Rewording the web sentence failed `test:evaluate-guidance` the same way for M-003.
- The four variants in `test:evaluate-dogfood` are the engine-rule reverts: no success indicator gives `CONCERNS` with `success-indicator-separation`, a literal where the matcher was gives `malformed-input`, no `for-all` gives `per-record`, no `covers-by-key` gives `omission-and-completeness`.

Round 2 (coordinator's Opus review of head `b733df61`; every finding verified against the files)

| Finding                                                                    | Verdict   | Evidence and fix                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1: nothing holds that preflight passes                                    | Valid     | `test:evaluate-dogfood` runs `preflight` first in the replay and asserts exit 0 and `qualified` for P-002, P-003, P-005, P-007 and P-009.                                                                                                               |
| T2, A3: the single-statement guard missed other spellings                  | Valid     | The word `web` appears in one line of the skill. The guard fails on any other line with `web`, and seven planted spellings (web app, bare API, unquoted AI feature, passive voice) must fail it.                                                        |
| T3: two revert checks in the test-design table were false                  | Valid     | The first now names what the variants remove (the `stdin.exit` type-violating binding, O-003's `covers-by-key`), the second states what the live record observed: a second statement fails `test:evaluate-guidance`. The matrix row here says the same. |
| T4: a dead branch in the reader                                            | Disproved | The contract's sensitivity witness legs ask about one exit and reply with `basis` and `class` alone, which is that branch. Deleting it made the replay's preflight exit 3. A comment now says so.                                                       |
| T5: the adoption guide's description of the suite                          | Valid     | Restated as five seeded probes and four clean controls.                                                                                                                                                                                                 |
| C1, A1: no gap report; the proof claimed a Stage 11 loop                   | Valid     | `gap-report.md` written (gitignored, sha256 in the proof), the AC clause restored above, and the proof says the repairs came from a generator and the rerun and rescore ran live.                                                                       |
| C2, C4, C6: lane sentence, Story 1.113 overstatement, "X, not Y" sentences | Valid     | Reworded in `epics.md`; Stories 1.112 and 1.113 moved to lane 2 as Kerem decided.                                                                                                                                                                       |
| C3: Story 1.115's stage numbers and premise                                | Valid     | `intake.md` is Stage 2 and gives an inline one-off digest command; Stage 4's `contract.md` gives none; `assets/README.md` joins the guides the criterion holds.                                                                                         |
| C5: the Analyze gate                                                       | Valid     | Said above.                                                                                                                                                                                                                                             |
| C7, A5: the proof understated what moved after `bced8a86`                  | Valid     | The proof lists both differences (`gaps.md` and `evaluator.md`, eight `cli/` files) and that H.1's clean run measures the merged head.                                                                                                                  |
| C8: shard weight                                                           | Valid     | 58.7, measured in this PR's chain 6/12.                                                                                                                                                                                                                 |
| A2: `requirements.md` false about dirty runs and the confirmation          | Valid     | Reworded; B-003 and B-004 await the owner at H.1; digests restamped (`sha256:79298cd4…`), `check`, `compile` and `seal` pass, and the proof notes that the live evidence predates the restamp. `corpusDigest` is unchanged.                             |
| A4: `inspection.md` calls its table AD-4's while AD-4's row differs        | Valid     | A dated amendment in `ARCHITECTURE-SPINE.md` AD-4.                                                                                                                                                                                                      |

## Design Notes

The coverage rules read the contract alone, so a deterministic reader of the guides is enough to hold every repair in CI, and the live run measures what the reader cannot: the model's reading of the guides. The reader takes the first statement of a rule it finds and does not follow `SKILL.md` to a stage, so stage routing and a contradicting second statement belong to the live run and to the guidance test.

## Verification

**Commands:**

- `node cli/evaluate.js check --evaluation test/evaluations/bmad-testarch-evaluate` -- expected: no authoring defects
- `npm run test:evaluate-dogfood && npm run test:evaluate-guidance` -- expected: pass
- `npm run lint && npm run lint:md && npm run format:check && npm run test:release-metadata && npm run docs:validate-links` -- expected: pass
- `npm test` -- expected: exit 0 (CI carries the full chain in shards)

**Results:**

- Live proof: Stage 6 preflight, development run and held-out run exit 0 from a clean clone at `bced8a86`; nine artifacts `PASS`; clean controls `passed-clean-control` and seeded probes `caught` in five of five; `eval-quality score` reproduces all nine byte for byte (`epic-1-proof.md`).
