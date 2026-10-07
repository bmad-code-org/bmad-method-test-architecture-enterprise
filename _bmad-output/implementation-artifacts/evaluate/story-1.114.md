---
title: 'Story 1.114: Carve the corpus guide into one guide per target kind'
type: 'feature'
created: '2026-10-06'
status: 'done'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: '85b3c2c8'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 1.114; Stories 1.51 and 1.111)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.114 section)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.111.md (the record format and the builder Analyze delta)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.115.md (the record format)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** `references/corpus.md` ships the craft every target kind shares and six target-kind sections (agent, skill, workflow, tool-use system, AI feature, test-review mechanism) in one file.
The builder counts it at 16,799 tokens against its 9,000-token budget for a single-purpose guide, and every lens of Story 1.46's Analyze run named the carve as the one fix.
Stage 3 loads all of it although a run needs the shared craft and one kind.

**Approach:** `corpus.md` keeps the shared craft and gains a `## Per-kind guides` section that names six files and says to load only the one for the kind the inspection recorded.
Each `references/corpus-<kind>.md` holds one kind: `# <Kind> corpus`, the kind's intro line, and the kind's four sections (`## Representative inputs`, `## Negative and malformed inputs`, `## Gameability design`, `## Held-out probe selection`) with every tagged example moved word for word.
`test:evaluate-guidance` counts the tokens of all seven files, asserts each heading in its own file, validates each tagged example through the engine or runtime schema it meets, and fails when a guide names a heading that moved.
`SKILL.md` stays byte-identical, since both capture records pin its digest.

## Boundaries & Constraints

**Always:** The guide edit goes through `/bmad-workflow-builder` Edit with a clean Analyze gate (AD-16, AD-18).
Each of the seven files is at most 9,000 tokens, counted with the encoding the builder's `count_tokens.py` uses.
Every byte of a kind's tagged examples moves unchanged.
The tagged examples still validate through the engine or runtime schema they meet.
Markdown keeps one sentence per line.

**Never:** an edit of `SKILL.md`, `references/ci.md`, `assets/evaluation-ci-plan.template.json` or a `capture-record.json`; a live recapture or a live session; a new story; a dependency other than `js-tiktoken`, which the token count needs.

**Decisions (build worker, owner-delegated):** the Decisions list below carries each choice with its reason.

## I/O & Edge-Case Matrix

| Scenario                         | Input / State                                                                          | Expected Output / Behavior                                                                | Error Handling                 |
| -------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------ |
| Stage 3 for one kind             | the model loads `corpus.md`, then the guide for the recorded `targetKind`              | the shared craft and one kind's four sections, at most 7,298 tokens                       | n/a                            |
| Kind section back in `corpus.md` | one kind's `##` section appended to the shared file                                    | `test:evaluate-guidance` fails: `corpus.md holds the <Kind> heading`                      | the maintainer restores it     |
| Every kind back in `corpus.md`   | all six sections appended                                                              | the same failure per kind and `corpus.md is <n> tokens, over the 9000-token guide budget` | the maintainer restores them   |
| Per-kind file deleted            | `corpus-skill.md` removed                                                              | `corpus-skill.md cannot be read: ENOENT` and the kind checks over an empty guide fail     | the maintainer restores it     |
| Tagged example broken            | a probe route that the committed-probe schema refuses                                  | `corpus-agent.md <probe> fails committed-probe schema`                                    | n/a                            |
| Stale reference                  | a guide names a moved heading as `corpus.md`'s, or a per-kind file that no guide holds | the reference scan fails with the file and line                                           | the maintainer fixes the guide |
| Router removed                   | `## Per-kind guides` renamed or a file dropped from its list                           | the heading and list assertions fail                                                      | n/a                            |
| `SKILL.md` edited                | one byte appended                                                                      | `<repository> capture-record.json pins a SKILL.md other than the one on disk`             | the maintainer reruns sessions |

</frozen-after-approval>

## Code Map

- `src/workflows/testarch/bmad-testarch-evaluate/references/corpus.md`: the shared craft; `## Per-kind guides` at the top; six sentences reworded so none points at a place that moved (Decision 1 lists them).
- `src/workflows/testarch/bmad-testarch-evaluate/references/corpus-agent.md`, `corpus-skill.md`, `corpus-workflow.md`, `corpus-tool-use-system.md`, `corpus-ai-feature.md`, `corpus-test-review-mechanism.md`: one kind each.
- `test/test-evaluate-guidance.js`: `CORPUS_KINDS`, `readCorpusGuides`, `countTokens`, `checkCorpusLayout`, `corpusReferenceProblems`, `checkCorpusReferences`, `checkCorpusPins`, the reworked `checkCorpus` and the carve cases of the negative table.
- `CHANGELOG.md`, `epics.md` and `test-design-epic-1.md` (amendments), `sprint-status.yaml` (row 1.114 `done`), this record.
- `package.json` and `package-lock.json`: one line each, `js-tiktoken` at `latest` in `devDependencies` (Decision 2).
- Not changed: `SKILL.md`, `references/ci.md`, `assets/evaluation-ci-plan.template.json`, both `capture-record.json` files, `docs/`.

## Tasks & Acceptance

- [x] Carve `corpus.md` through `bmad-workflow-builder` Edit, then the full Analyze run.
- [x] Rework `checkCorpus` over the per-kind files, add the budget, router, stale-reference and pin assertions and the carve cases.
- [x] The revert checks on a scratch copy of the final tree.
- [x] `CHANGELOG.md`, planning amendments, `sprint-status.yaml` (`done`), this record.

**Acceptance Criteria:** as in `epics.md` Story 1.114, with the amendment dated 2026-10-06 there.

## Decisions

1. **Layout.**
   `corpus.md` keeps everything before the old `## Agent` heading and gains `## Per-kind guides`, which lists exactly six files in the kind order of `inspection.md`.
   Each guide starts with `# <Kind> corpus`, then the existing intro (one sentence per line), then the four sections promoted from `###` to `##`, so a reader finds each section by its exact heading in its own file.
   The kind sections held no reference by position ("above", "below", "the Skill kind"), so their text moved unchanged.
   Against the base `corpus.md`, the carve differs in these places only: the six reworded shared sentences (the opening sentence, the held-out seed sentence, the command examples sentence, the HTTP example sentence, the gameability response blocks sentence and the `[held-out]` examples sentence of the partition section), split with the rest of the five lines that held them to one sentence per line; the `## Per-kind guides` router section; and, in each guide, the `# <Kind> corpus` H1 that replaces the `## <Kind>` heading, the intro split to one sentence per line, the back-pointer line and the four sections promoted from `###` to `##`.
2. **Token metric.**
   The builder counts with tiktoken's `cl100k_base` (`scripts/count_tokens.py`).
   `js-tiktoken` (a dependency of `@langchain/core`, which `package.json` already lists, installed with every `npm ci`) returns the same count: both give 16,799 for the old `corpus.md`.
   The test calls `js-tiktoken`'s `cl100k_base` encoder.
   The first draft relied on the package arriving as a dependency of `@langchain/core`; the build review found that an undeclared import breaks the gate when that chain changes, so `package.json` lists `js-tiktoken` at `latest` in `devDependencies` beside the other versions that float.
   The two lines came from `npm install --package-lock-only` over a scratch copy of the two files (the checkout's `node_modules` and lockfile were not touched by npm); the lockfile diff is the one root entry, since 1.0.21 was already locked.
   The old file measured 14,381 tokens when Story 1.115 recorded it and 16,799 on the merged tree that Stories 1.51, 1.98 and 1.111 had grown.
3. **The router sits at the top of `corpus.md` and keys on `targetKind`.**
   The first draft put the section last and said the kind is classified in intake.
   The Analyze run showed the kind is recorded as `targetKind` at inspection, so the sentence says that, and the section moved to the top so the guide is chosen before the shared rules are read.
   `inspection.md` maps two rows to the tool-use kind (a calling agent and a tool server), so the section says both load the tool-use guide and that a tool server reached over `mcp` takes its channel pointers from `references/oracles.md` and its registry shape from `references/adapters.md`.
4. **Shared sentences that named a place that moved were reworded.**
   `corpus.md` named `P-006`, `M-001`, the Workflow guide's `P-008` and `M-003` and the HTTP example by position ("below") or by the guide that holds it, and its opening sentence said each kind is "below".
   The sentences now say "the held-out seeds of the per-kind guides", "in the per-kind guides" and "the `[held-out]` examples in the per-kind guides".
   The HTTP sentence stays a statement about the worked example and names its file: "The HTTP example in `references/corpus-ai-feature.md` returns JSON with a JSON content type."
   These six reworded sentences are the ones Decision 1 lists, and the five lines that held them carry one sentence per line.
5. **Each guide names `corpus.md` as the home of the floor, partition and held-out rules.**
   Analyze's architecture lens asked that a carved file work standalone after compaction.
   The sentence "The floor, partition and held-out rules live in `references/corpus.md`." sits on its own line under the intro, so the intro paragraph has three lines (the kind's description, its worked interface and the pointer) where the coordinator's decision named one or two sentences; the test holds the three lines.
   The old intro line held two sentences, and the build review asked for one sentence per line, so the guide splits them.
6. **The test reads one file per kind and names it.**
   Every message that said `corpus.md <Kind>` says `corpus-<kind>.md` (`corpus-agent.md P-004 must bind its concrete countercase input`).
   The kind lists, the heading list and the per-kind maps stay as they were, `sections(kind, 3)` became `sections(kind, 2)` and the guide's own H1 and the absence of a third-level heading are asserted.
   A missing file reads as empty and fails with `<file> cannot be read`, so a deleted guide names itself and does not crash the run.
7. **The stale-reference scan covers the guides, `SKILL.md`, `assets/` and `docs/`.**
   A line that names `corpus.md` must not name a heading the file lacks (a backticked heading), one of the four moved section names or a kind title followed by "section" or "kind", and no file may name a `corpus-*.md` that is not one of the six.
   The lines of `corpus.md` itself are scanned for the same moved names, since the file holds the shared headings but none of the moved ones.
   The scan runs over the real tree and over six planted lines (a moved section name, a kind heading, a heading `corpus.md` does not hold, a seventh guide file, a kind section named without backticks beside `corpus.md` and a moved section named inside `corpus.md`), each of which must fail it.
   A grep of `src/`, `docs/`, `test/`, `cli/` and `tools/` found no guide naming a `corpus.md` heading before the change, and the `docs/` tree names no `corpus.md` at all, so no docs change is made.
8. **`SKILL.md` and the capture records.**
   `checkCorpusPins` asserts that both `capture-record.json` files hold the digest of the `SKILL.md` on disk and pin no corpus guide in `sessionRead` (each pins `references/ci.md`, `SKILL.md` and `assets/evaluation-ci-plan.template.json`).
   `git diff --stat` over `SKILL.md`, `references/ci.md`, `assets/evaluation-ci-plan.template.json` and both records is empty.
9. **One kind returned to `corpus.md` fails the kind-heading assertion, and the budget assertion fails when the kinds return together.**
   `corpus.md` is 4,276 tokens, and the largest kind is 3,022, so one kind back leaves the file at 7,298 tokens at most, under the budget.
   `epics.md` and `test-design-epic-1.md` carry the amendment.
10. **Analyze.**
    The builder's Analyze ran in full after the carve: the workflow-integrity, prompt-metrics, path-standards and script prepasses, `quick_validate`, and the five lenses (leanness, architecture, determinism, customization, enhancement) as read-only subagents over the whole skill.
    The run found 0 critical and 0 high.
    The path-standards scan flags only `.memlog.md` (the process file, gitignored).
    The memlog holds the run and the deltas (rounds 12 to 15).
    The medium and low findings and what each led to are in the Analyze table below.
11. **No new story.**
    Every finding is taken or answered with its reason in the tables below.

## Analyze run

Token counts after the carve, the lens fixes and the round 1 review fixes, from the builder's prompt-metrics prepass: `corpus.md` 4,276, `corpus-agent.md` 1,938, `corpus-skill.md` 1,983, `corpus-workflow.md` 3,022, `corpus-tool-use-system.md` 1,953, `corpus-ai-feature.md` 1,937, `corpus-test-review-mechanism.md` 1,951, `SKILL.md` 1,982.
The old `corpus.md` was 16,799.

| Lens                                | Finding                                                                                                              | Route                                                                                                                                                                                                   |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| architecture, leanness, enhancement | Medium: the router named intake, which never classifies a kind, and sat at the end of the file                       | Taken: the router names `targetKind` recorded at inspection and moved to the top (Decision 3)                                                                                                           |
| architecture, leanness, enhancement | Medium and low: `corpus.md` held a stale "below" and kind-specific ids (`P-006`, `P-008`, `M-003`, the HTTP example) | Taken: the sentences name the per-kind guides generically (Decision 4)                                                                                                                                  |
| enhancement                         | Medium: the tool-use guide covers a calling agent while `inspection.md` also maps a tool server                      | Taken: the router says both rows load the tool-use guide and where the `mcp` pointers are (Decision 3)                                                                                                  |
| architecture                        | Low: the guides state no dependence on the shared rules                                                              | Taken: the back-pointer line in each guide (Decision 5)                                                                                                                                                 |
| leanness                            | Low: the opening paragraph and the section described the system to itself                                            | Taken: the section's "Each holds..." line and the opening clause were cut                                                                                                                               |
| architecture                        | Medium: the SKILL.md to `corpus.md` to guide chain is two hops                                                       | The hop is the acceptance criterion: `SKILL.md` is pinned, so `corpus.md` names the guides itself                                                                                                       |
| architecture, enhancement           | Medium: the partition-plan section is conditional and about two thirds of `corpus.md`                                | The acceptance criteria keep the partition plans in `corpus.md`; the file is 4,276 tokens, within the budget                                                                                            |
| enhancement                         | Medium: the guides hold examples only and no kind-specific heuristics                                                | The criteria move the sections word for word and a heuristic would be new craft with no run behind it; the leave-out rule applies                                                                       |
| leanness                            | Medium: the floor rule is stated in four places                                                                      | Each statement serves a different decision (the `zero-action` floor, any class, the gameability arm, the Workflow case) and a guidance marker holds each wording; the lens marks the saving unconfirmed |
| leanness                            | Low: the `check` enumeration lists refusals the tool prints itself                                                   | Pre-existing text that the partition-plan cases hold by sentence                                                                                                                                        |
| leanness                            | Low: the six guides repeat their scaffolding                                                                         | The examples are pinned and each guide stands alone                                                                                                                                                     |
| determinism                         | Medium: strength-floor eligibility is derived by hand and `check` has no early report                                | The lens asks for a new `tea-evaluate` report, a runtime feature outside a guide carve; `ci --tier release` refuses an unreachable floor with `no-eligible-probe`, and the guide states the rule        |
| determinism                         | Low: signatures and gameability answers restate data that exists elsewhere                                           | The tagged examples are pinned; a scaffold command is a runtime feature                                                                                                                                 |
| determinism                         | Low: the framework probe-time budget in `evaluator.md` is a hand multiplication                                      | `evaluator.md` is untouched by this story; the sum is three terms the file spells out                                                                                                                   |
| architecture                        | Medium: `evaluator.md`, `contract.md` and `gaps.md` run past 4,500 tokens                                            | Each is a single-purpose stage guide under the 9,000-token budget                                                                                                                                       |
| architecture                        | Low: SKILL.md Stage 6 duplicates guide text                                                                          | `SKILL.md` is pinned                                                                                                                                                                                    |
| customization                       | Low: the `customize.toml` header omits the override paths                                                            | The header is the house shape of the module's workflow skills, and `SKILL.md` Step 1 names the paths                                                                                                    |

## Implementation Notes

- `readCorpusGuides` reads the seven files once and `checkCorpus` takes the result, so every check and every carve case runs over the same strings.
- The carve cases of the negative table copy the guides, corrupt one file and name the failure the case must raise.
- `readCorpusGuides` also lists the `corpus*.md` names of `references/`, and `checkCorpusLayout` asserts they are `corpus.md` plus the six per-kind files, so a guide that `corpus.md` does not name fails.
- `checkCorpusLayout` holds the router's tool-use sentence whole, and `checkCorpus` holds the HTTP example sentence, so a reworded claim fails.
- `checkTokenMetric` pins `countTokens` to `cl100k_base` with one literal that counts 16 tokens, where a length-over-four estimate gives 18; the negative table runs it over a length-over-four count and expects the failure.
- `corpusReferenceSurface` walks `references/`, `assets/` and `docs/` for Markdown and adds `SKILL.md`.

## Revert observations

Each revert ran once on a scratch copy of the final tree under the scratchpad directory (the repository without `.git`, with `node_modules` linked), with `test:evaluate-guidance` run to its end and the copy restored after.
The planted `run.md` lines and the planted `gaps.md` line are appended directly after the file's last line (`run.md` is 63 lines, so the planted line is `run.md:64`).

| Revert (the one edit)                                                                                                                     | Observed                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Workflow section appended to `corpus.md` (one kind moved back)                                                                        | exit 1, 9 failures: `corpus.md holds the Workflow heading that belongs in a per-kind guide`, one per moved subsection heading (5 in all) and four `corpus.md:<line> names <section> as part of corpus.md` lines from the scan of `corpus.md`'s own lines; the file stays at 7,298 tokens at most, so the budget holds |
| All six sections appended to `corpus.md`                                                                                                  | exit 1, 55 failures: 30 heading failures, 24 own-line scan failures and `corpus.md is 17054 tokens, over the 9000-token guide budget`                                                                                                                                                                                 |
| `corpus-skill.md` deleted                                                                                                                 | exit 1, 30 failures: `corpus-skill.md cannot be read: ENOENT`, `references/ holds corpus guides other than corpus.md and the six per-kind files` and `corpus-skill.md headings changed` with the other Skill assertions over the empty guide                                                                          |
| `"route": "controlled-mutation"` changed to `"route": "no-such-route"` in the first probe of `corpus-agent.md` that holds it              | exit 1, 2 failures: `corpus-agent.md P-007 fails committed-probe schema` (the route enum) and `corpus-agent.md P-007 must seed B-002 with a non-null manifestation witness`                                                                                                                                           |
| A line in `run.md` naming `Gameability design` beside `corpus.md`                                                                         | exit 1, 1 failure: `references/run.md:64 names Gameability design as part of corpus.md; it moved to a per-kind guide`                                                                                                                                                                                                 |
| `## Corpus rules and layout` renamed in `corpus.md` while a line of `run.md` names it                                                     | exit 1, 2 failures: `corpus.md lacks exact heading ## Corpus rules and layout` and `run.md:64 names the heading ## Corpus rules and layout, which corpus.md does not hold`                                                                                                                                            |
| `## Per-kind guides` renamed in `corpus.md`                                                                                               | exit 1, 10 failures: the missing heading (1), the two missing router sentences (2), the missing six-file list (1) and the six missing entries (6)                                                                                                                                                                     |
| One byte appended to `SKILL.md`                                                                                                           | exit 1, 2 failures: both `capture-record.json` files pin a `SKILL.md` other than the one on disk                                                                                                                                                                                                                      |
| The router sentence of `corpus.md` reverted to name `references/adapters.md` alone for the `mcp` channel pointers (finding 1)             | exit 1, 1 failure: `corpus.md Per-kind guides lacks the whole line` for the corrected sentence                                                                                                                                                                                                                        |
| The HTTP sentence of `corpus.md` reverted to "A target reached over HTTP returns JSON with a JSON content type." (finding 2)              | exit 1, 1 failure: `corpus.md` lacks the whole sentence "The HTTP example in `references/corpus-ai-feature.md` returns JSON with a JSON content type."                                                                                                                                                                |
| A line in `gaps.md` reading "See the Workflow section of `references/corpus.md` for the held-out rule." (finding 4a)                      | exit 1, 1 failure: `references/gaps.md:131 names Workflow section as part of corpus.md; it moved to a per-kind guide` (exit 0 at 8d18a12b)                                                                                                                                                                            |
| The line "Each gameability probe follows the Gameability design of its kind below." added under `## Corpus rules and layout` (finding 4b) | exit 1, 1 failure: `references/corpus.md:22 names Gameability design as part of corpus.md; it moved to a per-kind guide` (exit 0 at 8d18a12b)                                                                                                                                                                         |
| `references/corpus-plugin.md` added as a copy of `corpus-agent.md` (finding 5)                                                            | exit 1, 1 failure: `references/ holds corpus guides other than corpus.md and the six per-kind files` (exit 0 at 8d18a12b)                                                                                                                                                                                             |
| `countTokens` body replaced with `Math.ceil(text.length / 4)` (finding 6)                                                                 | exit 1, 1 failure: `countTokens returns 18 for the pinned literal; cl100k_base returns 16` (exit 0 at 8d18a12b)                                                                                                                                                                                                       |

The gate's own carve cases run inside every `test:evaluate-guidance` pass and report a failure if a corrupted copy passes.
They cover a padded per-kind guide (`corpus-agent.md is <n> tokens, over the 9000-token guide budget`), a missing guide read, a `SKILL.md` with another byte, a capture record that pins a corpus guide, the router sentence naming `adapters.md` alone, a seventh `corpus*.md` file, a length-over-four token count and the six planted stale references.

## Gates

Run one at a time on the final tree, on a machine shared with the other lanes.
No full local `npm test`: the hook and CI carry the chain.

- `test:evaluate-guidance`: green (67 seconds), with the carve cases of the negative table.
- `test:evaluate-ci` (5 minutes 21 seconds, every case including the capture-record guard) and `test:eval-replay` (185 passed, 0 moved): green, so nothing they pin moved.
- `test:evaluate-dogfood` and `test:install`: green (they read the skill's guides and its folder shape).
- `test:doc-counts` (0 disagreements), `test:doc-claims` (0 disagreements), `test:shards` (183 checks), `test:ci-coverage` (134 chain steps, 168 scripts), `test:release-metadata`, `test:changelog`, `test:bmad-output-gated` (158 checks), `docs:validate-links` (0 issues): green.
- `npm run lint`, `npm run lint:md` and `npm run format:check`: green.
- `git diff --stat` over `SKILL.md`, `references/ci.md`, `assets/evaluation-ci-plan.template.json` and both `capture-record.json` files: empty.
- Token counts of the final tree (tiktoken `cl100k_base`, the builder's prepass and the test agree): `corpus.md` 4,276; `corpus-agent.md` 1,938; `corpus-skill.md` 1,983; `corpus-workflow.md` 3,022; `corpus-tool-use-system.md` 1,953; `corpus-ai-feature.md` 1,937; `corpus-test-review-mechanism.md` 1,951.
- Builder Analyze: 0 critical and 0 high over the whole skill (the Analyze table above); the delta after each fix ran the integrity prepass (0 issues), `quick_validate` (ok) and the path-standards scan (only `.memlog.md`).

## Build review

One fresh subagent reviewed the diff read-only in three lenses (correctness, test quality, compliance) in place of `/bmad-code-review`.
Every finding was checked against the files before it was acted on.

| Finding                                                                                                                                   | Verdict | Route                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Medium: the amendments said 4,288 tokens for `corpus.md` where the committed file measures 4,256                                          | valid   | Fixed in `epics.md` and `test-design-epic-1.md`                                                                                                     |
| Medium: the CHANGELOG and the `epics.md` amendment said the kind is classified in intake                                                  | valid   | Fixed: "recorded as `targetKind` at inspection"                                                                                                     |
| Medium: `js-tiktoken` was imported with no entry in `package.json`                                                                        | valid   | Fixed: `devDependencies` lists it at `latest`, with the lockfile root entry from `npm install --package-lock-only` over a scratch copy (Decision 2) |
| Low: one assertion message still said `corpus.md Skill`                                                                                   | valid   | Fixed: `corpus-skill.md Gameability design`                                                                                                         |
| Low: the epics amendment began with a parenthesis and said "one intro line"                                                               | valid   | Fixed: it begins with `Amended 2026-10-06 in Story 1.114's build:` and lists the intro, the interface and the pointer                               |
| Low: the tagged-example case expected only the file name                                                                                  | valid   | Fixed: it expects `corpus-tool-use-system.md P-001 fails committed-probe schema`                                                                    |
| Low: no case for a padded guide, a changed `SKILL.md` digest, a pinned corpus guide or the read failure, and `readCorpusGuides` ran twice | valid   | Fixed: four cases added, and the negative table reuses the guides the run already read                                                              |
| Low: the intro line held two sentences                                                                                                    | valid   | Fixed: each guide holds the description, the worked interface and the pointer on three lines (Decision 5)                                           |

### Round 1 review

Three Opus lenses reviewed the pushed diff (8d18a12b on 2ab15ce0), each finding reproduced by a reviewer.
Every finding was checked against the files before it was fixed, and every fix is in the round 1 fix commit.
The edit of `corpus.md` went through `/bmad-workflow-builder` (Edit, headless) with a clean Analyze delta in the memlog (round 15): the integrity prepass 0 issues, `quick_validate` ok, path-standards flagging only `.memlog.md`, and one lens pass over the changed lines with 0 critical, 0 high, 0 medium and 0 low new.

| Finding                                                                                                                                                                                                 | Verdict | Route                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. The router sentence said a tool server reached over `mcp` takes its channel pointers from `references/adapters.md`, which holds only the registry shape; the pointers are in `references/oracles.md` | valid   | Fixed: the sentence names `oracles.md` for the channel pointers and `adapters.md` for the registry shape; `checkCorpusLayout` holds the sentence whole, and the revert row shows the pin failing                                                                                                                                         |
| 2. The HTTP sentence became "A target reached over HTTP returns JSON with a JSON content type", a general claim that web-application targets can contradict                                             | valid   | Fixed: "The HTTP example in `references/corpus-ai-feature.md` returns JSON with a JSON content type."; Decision 4 states it, and `checkCorpus` holds the sentence                                                                                                                                                                        |
| 3. Five reworded lines of `corpus.md` held 4, 4, 3, 2 and 6 sentences                                                                                                                                   | valid   | Fixed: each is split at its sentence ends, one sentence per line, with no word changed; the intros, the router lines and the six guides' added lines already held one sentence per line, and every marker still matches                                                                                                                  |
| 4. The reference scan missed a kind named without backticks beside `corpus.md`, and every line of `corpus.md` itself                                                                                    | valid   | Fixed: lines that name `corpus.md` also flag a kind title followed by "section" or "kind", the moved-name check runs over `corpus.md`'s own lines, and both planted lines are cases of `checkCorpusReferences`; the current guides stay free of false positives                                                                          |
| 5. A `corpus*.md` file that `corpus.md` does not name passed the layout check                                                                                                                           | valid   | Fixed: `checkCorpusLayout` asserts the `corpus*.md` names of `references/` are exactly `corpus.md` plus the six per-kind files, and a carve case adds a seventh                                                                                                                                                                          |
| 6. Nothing pinned `countTokens` to `cl100k_base`                                                                                                                                                        | valid   | Fixed: `checkTokenMetric` holds one literal that counts 16 tokens, where length over four gives 18, and the negative table runs it over a length-over-four count                                                                                                                                                                         |
| 7. The record misstated the `test:bmad-output-gated` count, the planted `run.md` line, the carve diff and the rename revert count                                                                       | valid   | Fixed: the numbers come from reruns on the final tree (Revert observations and Gates), Decision 1 states the carve diff once with Decision 4 consistent with it, and the token counts of the record, the CHANGELOG entry and both planning amendments are recounted (`corpus.md` is 4,276 tokens, so one kind back leaves 7,298 at most) |

The mutants of findings 4 to 6 are rows of the Revert observations table; each exits 0 at 8d18a12b and exits 1 with one failure after the fix.
The earlier revert rows were rerun on the final tree: the moved-kind rows gain the own-line scan failures of `corpus.md` (9 and 55 failures), the deleted-guide row gains the layout failure (30), and the `run.md` rows report `run.md:64`.
