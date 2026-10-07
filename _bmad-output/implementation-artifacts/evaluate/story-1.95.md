---
title: 'Story 1.95: Gate the replay totals, the story count and the lane lists'
type: 'feature'
created: '2026-10-06'
status: 'review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'b41d8b78'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 1.95; the overview and "Parallel lanes")'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.95 section)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.123.md (the record format)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.122.md'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** Three groups of hand-written numbers describe the Evaluate plan and nothing holds them to the files they describe.
The replay totals in `test/README.md` and the header of `test/test-eval-replay.js` (cases, cases that produce a number, constructed cases, cases that carry captured bytes), the story count and the appended-story list in the overview of `epics.md`, and the five lane lists that `epics.md` and `sprint-status.yaml` each carry.
A count changed by one passes `test:doc-counts`, `test:eval-replay` and every other gate today.

**Approach:** `doc-counts` entries of `eval-quality.config.json` hold each sentence against a module that reads the committed files.
`test/lib/doc-count-sources.js` gains the replay counts that were missing, and `test/lib/planning-doc-sources.js` reads `epics.md` and `sprint-status.yaml` and refuses a plan whose appended-story lists or lane lists disagree.
`test:planning-doc-sources` hands every check data that changed by one and observes the failure.

## Boundaries & Constraints

**Always:**

- The gates read the committed `epics.md`, `sprint-status.yaml`, `test/README.md`, `test/test-eval-replay.js` and `test/replay/**/expected.json`.
  `LANES.md` lives outside the repository and no gate reads it.
- The story count is the number of `### Story <id>: <title>` headings outside fenced blocks, H.1 included, and the overview states it.
- The appended stories are the Epic 1 sections numbered 1.27 and up, and both lists that name them, expanded, equal that set.
- Each of the five lanes holds the same stories in the same order in both files, no story sits in two lanes, a lane missing from either file fails, and every entry has a status row under its exact key.
- `test:doc-counts` keeps its meaning: no existing entry or source changes, and the new entries read the replay and planning subjects only.

**Never:**

- A story appended to `epics.md`, `test-design-epic-1.md` or `sprint-status.yaml`, and a rewrite of another lane's rows.
- A live session, `claude -p`, an `eval:ci` run against a real agent, Docker, `npm pack`, `npm install` or `npm ci`.
- A gate that reads only a generator's output and not the committed files.

**Decisions (build worker, owner-delegated):** the owner delegated every decision of this build, so none waited at a checkpoint; `/bmad-build` renders here and halts at human checkpoints, so its steps were followed by hand without stopping, and the Decisions list below carries each choice with its reason.

## I/O & Edge-Case Matrix

| Scenario                         | Input / State                                                                              | Expected Output / Behavior                                                                              | Error Handling                              |
| -------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| The committed files              | the tree as committed                                                                      | `test:doc-counts` passes with 0 disagreements and the module returns 130, 2, 97 and 5                   | none                                        |
| A replay total off by one        | `test/README.md` or the header states 159 for 158, or any of the other totals moved by one | the entry names the file, the line and both numbers                                                     | `test:doc-counts` exits 1                   |
| A replay case added              | one more `expected.json` under `test/replay/ci/`                                           | every sentence that states the total fails, and the `ci` count moves only for a `full` or `minimal` set | same                                        |
| An unmeasurable case added       | a case whose result is `null` or `{ "unmeasurable": ... }`                                 | the total moves and the count of cases that produce a number does not                                   | same                                        |
| A result of another shape        | a case whose result is a string, or an origin the counts do not know                       | the source module refuses and names the file                                                            | the gate exits 64 with the module's message |
| The story count off by one       | the overview states 131 or 129 for 130                                                     | the entry names the line and both numbers                                                               | `test:doc-counts` exits 1                   |
| A story section added or removed | one more or one fewer `### Story` heading                                                  | the count entry fails, and both appended lists name the id they omit or list without a section          | the gate exits 1 or 64                      |
| An appended list drifts          | an id dropped, listed twice, out of order or past the last section, or a count that is off | the module names the sentence and the ids                                                               | the gate exits 64 with the module's message |
| A lane entry removed             | one entry removed from any of the five lanes in either file                                | the module names the lane, the story and the file that leaves it out                                    | same                                        |
| A story moved or duplicated      | moved to another lane in one file only, or listed in two lanes or twice in one             | the module names both lanes, or the lanes the story sits in                                             | same                                        |
| An order swap                    | two neighbours swapped in one lane of one file                                             | the module names the lane, the position and both stories                                                | same                                        |
| A lane missing                   | one lane absent from either file, or the fifth absent from both                            | the module names the lane, and the sentence that says five fails when both files lose it                | the gate exits 64 or 1                      |
| An entry with no status row      | a lane entry whose key is not under `development_status`, or a story with two rows         | the module names the entry or the story                                                                 | the gate exits 64 with the module's message |

</frozen-after-approval>

## Code Map

- `test/lib/planning-doc-sources.js`: new. `readStoryHeadings`, `countEpicHeadings`, `appendedStoryIds`, `checkAppendedStories`, `readEpicLanes`, `readSprintLanes` and `checkLanes` each return what they found; `loadPlanningSources(root)` collects the problems, refuses with all of them and returns `STORY_COUNT`, `EPIC_COUNT`, `APPENDED_STORY_COUNT` and `LANE_COUNT`, each computed by the check that verified it.
- `test/lib/doc-count-sources.js`: gained `REPLAY_SCORED`, `REPLAY_SCORED_CONSTRUCTED`, `REPLAY_CAPTURED_BYTES`, its three per-suite parts and `REPLAY_CI_FULL_AND_MINIMAL`; `replayCases` also records whether a stored result produces a number and the fixture set.
  No existing export changed value.
- `eval-quality.config.json`: eleven sources and twelve entries added after the existing ones, none edited.
- `test/test-planning-doc-sources.js`: new, 102 checks (`test:planning-doc-sources`).
- `test/test-doc-count-sources.js`: one check that recomputes the new replay counts without the module's code.
- `package.json`, `tools/test-shard-weights.json`: the script joins the `npm test` chain after `test:doc-count-sources` and carries a weight.
- Prose: `test/README.md` (the replay totals as digits, three stale per-suite counts), the header of `test/test-eval-replay.js`, the `epics.md` overview (130 stories, 97 appended, with an amendment line) and the Story 1.95 amendment, `test-design-epic-1.md`, `README.md` (the `test:doc-counts` bullet and the chain length 134), `CHANGELOG.md`.
- Not changed: another lane's rows, the lane lists (both files already agreed), `package-lock.json`, any capture or digest.

## Tasks & Acceptance

- [x] Reproduce the drift on the untouched tree.
- [x] The replay sources and entries, with the README and header sentences they hold.
- [x] The planning module and its entries.
- [x] `test:planning-doc-sources`, wired into the chain and the shard weights.
- [x] Self-exercise of every gate, mutants of every new check, prose and counts.
- [x] CHANGELOG, planning amendments, `sprint-status.yaml` row 1.95 `review`, this record.

**Acceptance Criteria:** as in `epics.md` Story 1.95, with the amendment dated 2026-10-06 there.

## Decisions

1. **The gates are `doc-counts` entries, and the plan checks live in the source module.**
   The `doc-counts` engine holds a sentence against a number and a module throws when it cannot answer, which is how `test/lib/doc-count-sources.js` already refuses a CSV tier mismatch.
   A lane list is not a number, so `planning-doc-sources.js` compares the two files while it loads and refuses with every disagreement; the gate then reports the module's message.
   Each export is returned by the check that verified it, so a check nobody calls leaves its sentence failing, and the lane count sentence (`five parallel lanes`) fails when a lane disappears from both files.
2. **The story count rule is every `### Story` heading, H.1 included.**
   The overview said 129 and a plain heading grep gave 130, because the 129 was written before Story 2.6's section existed (`3487a918` counted 129 headings, and the diff to this tree adds only `### Story 2.6`).
   The overview now says 130 and the amendment line says what happened.
3. **The overview states its numbers as digits.**
   The engine renders words from zero to ninety-nine and the counts are 130 and 97.
   The sentence also states the number of appended stories (97) so the list has a count to hold, and the module compares it with the sections.
4. **The appended stories are the Epic 1 sections from 1.27.**
   Stories 1.17 to 1.26 came from the 2026-09-23 amendment and sit in the original order.
   The lists group by the batch that appended them (1.27 to 1.79, 1.80 to 1.89, 1.90 to 1.116 and singles after), so the check compares sets and requires ascending order and no repeated id.
   `FIRST_APPENDED_STORY` is a named constant with that reason.
5. **The header of `test/test-eval-replay.js` states the totals.**
   It stated none and said the `evaluation-gate` project held a constructed run until its live capture was stored, which the corpus contradicts (`evaluation-gate-live-capture` is a real capture).
   It now states the corpus size, the cases that produce a number, the constructed ones among them and the cases that carry captured bytes, and the gate holds them.
6. **Three stale per-suite counts in `test/README.md` are fixed and held.**
   The README said 14 trace, 20 `nfr` and 21 `ci` cases against 15, 29 and 21.
   The `ci` count was right for the `full` and `minimal` projects and wrong as written ("both projects", with six in the corpus), so the sentence names them and the source counts the cases of those two fixture sets.
   The trace and `nfr` sentences list a subset of their cases, so they now say so and name what the rest cover, from the case names and their stored comments.
7. **"Produces a number" is a stored result that is an object with no `unmeasurable` key.**
   A run the harness could not measure stores `null` or `{ "unmeasurable": <class> }` (the harness's `differences` names both).
   A result of any other shape throws, since a guess would be a wrong count.
8. **No gate reads `LANES.md`, and the lane lists already agreed.**
   After Story 1.92's merge both files list 1.92 in lane 3 and every lane in the same order, so no row moved.
9. **The self-exercise runs the real gate over scratch trees.**
   A scratch tree links every path of the repository except the files it overrides, and the replay corpus keeps real directories because the replay counts read directory entries without following links (the first draft counted one case).
   Prose files and the two source modules are copies in the scratch tree, so a module reads the mutated files.
10. **A lane note in parentheses after an id is read, a list must end at a full stop followed by a space or the line end, and a row key needs its slug.**
    Lane 3 carries `2.6 (starts only once every other story has merged)`.
    The id list is read item by item so a note holding a comma stays whole, and mutants of the three regular expressions each have a case (M21 to M23).

## Reproduction

On the untouched tree (`b41d8b78`), in four scratch copies, each focused gate (`test:doc-counts`, `test:doc-claims`, `test:eval-replay`, `test:doc-count-sources`) passed after the change below, which is the defect:

| Change in the scratch copy                                                                          | `test:doc-counts` | `test:doc-claims` | `test:eval-replay` | `test:doc-count-sources` |
| --------------------------------------------------------------------------------------------------- | ----------------- | ----------------- | ------------------ | ------------------------ |
| `test/README.md` says one hundred fifty-three of the one hundred fifty-eight cases produce a number | exit 0            | exit 0            | exit 0, 185 passed | exit 0                   |
| the overview says one hundred thirty-one stories                                                    | exit 0            | exit 0            | exit 0, 185 passed | exit 0                   |
| `1.101` removed from lane 3 of `epics.md`                                                           | exit 0            | exit 0            | exit 0, 185 passed | exit 0                   |
| `1-95-...` moved from lane 4 to lane 5 of `sprint-status.yaml` only                                 | exit 0            | exit 0            | exit 0, 185 passed | exit 0                   |

The real tree also held two stale statements that nothing noticed: the overview said 129 stories for 130 sections, and the README said 14 trace, 20 `nfr` and 21 `ci` cases.
The four replay totals of `test/README.md` (158, 152, 134, 18) were true.

## Revert observations

Each observation is one run in a scratch copy of the final tree (a unique directory per case), `npm run test:doc-counts` unless the line names the exit code of the module.
The first line printed is recorded.

| Subject changed by one                                                  | Failing output                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| overview story count 131                                                | `epics.md:26: the story count of the overview (every ### Story section, H.1 included) reads "131" and is 130 (130)`                                                                                                                                                                                                                                                                                |
| README replay total 159                                                 | `test/README.md:308: the replay corpus size, the cases that produce a number and the constructed ones among them reads "159" and is 158 (158)`                                                                                                                                                                                                                                                     |
| header captured bytes 17                                                | `test/test-eval-replay.js:107: the cases that carry captured bytes (header) reads "17" and is 18 (18)`                                                                                                                                                                                                                                                                                             |
| appended count 98                                                       | exit 64, `the overview says 98 stories were appended and the file holds 97`                                                                                                                                                                                                                                                                                                                        |
| entry removed from lane 1, 2, 3, 4, 5 of `epics.md`                     | exit 64, `Lane 1: sprint-status lists 1.75, which epics.md leaves out of Lane 1`; the same line for lane 2 (1.81), 3 (1.56), 4 (1.121) and 5 (1.116)                                                                                                                                                                                                                                               |
| entry removed from lane 1 to 5 of `sprint-status.yaml`                  | exit 64, `Lane 1: epics.md lists 1.75, which sprint-status leaves out of lane-1`; the same line for lane 2 (1.81), 3 (1.56), 4 (1.121) and 5 (1.116)                                                                                                                                                                                                                                               |
| 1.95 moved from lane 4 to lane 5 in `sprint-status.yaml` only           | exit 64, `Lane 4: epics.md lists 1.95, which sprint-status leaves out of lane-4` and `Lane 5: sprint-status lists 1.95, which epics.md leaves out of Lane 5`                                                                                                                                                                                                                                       |
| 1.95 moved from lane 4 to lane 5 in `epics.md` only                     | exit 64, `Lane 4: sprint-status lists 1.95, which epics.md leaves out of Lane 4` and `Lane 5: epics.md lists 1.95, which sprint-status leaves out of lane-5`                                                                                                                                                                                                                                       |
| 1.95 duplicated into lane 2 of `epics.md`                               | exit 64, `epics.md puts Story 1.95 in lanes 2 and 4`                                                                                                                                                                                                                                                                                                                                               |
| 1.95 duplicated into lane 2 of `sprint-status.yaml`                     | exit 64, `sprint-status puts Story 1.95 in lanes 2 and 4`                                                                                                                                                                                                                                                                                                                                          |
| order swap in lane 3 of `sprint-status.yaml`                            | exit 64, `Lane 3: the order differs from position 1, where epics.md has 1.45 and sprint-status has 2.1`                                                                                                                                                                                                                                                                                            |
| order swap in lane 1 of `epics.md`                                      | exit 64, `Lane 1: the order differs from position 1, where epics.md has 1.68 and sprint-status has 1.41`                                                                                                                                                                                                                                                                                           |
| lane 5 paragraph removed from `epics.md`                                | exit 64, `sprint-status has lane-5 and epics.md has no Lane 5 paragraph`                                                                                                                                                                                                                                                                                                                           |
| lane 5 removed from both files                                          | `epics.md:305: how many parallel lanes the plan holds (every lane list of this file and of sprint-status.yaml) reads "five" and is four (4)`                                                                                                                                                                                                                                                       |
| AC4: the adoption guide's `replayTotal` entry pointed at `replayScored` | `docs/explanation/eval-quality-adoption-guide.md:242: the replay section's stored output total reads "158" and is 152 (152)`; `test:planning-doc-sources` fails `every doc-counts entry and source that existed before Story 1.95 reads what it read` with `"the replay section's stored output total" of docs/explanation/eval-quality-adoption-guide.md reads replayScored and read replayTotal` |

`test:planning-doc-sources` runs each of these (and the README and header cases for every replay total, a stored case added, an unmeasurable case added, a result and an origin the counts refuse) as a permanent check, with the untouched scratch tree as the negative control.

### Mutants of the new checks

Each mutant is one edit to a scratch copy of the final tree.
A mutant is killed when `test:planning-doc-sources`, `test:doc-counts` or `test:doc-count-sources` fails on it.
Round 1 left four survivors, and each got the case that kills it.

| Mutant                                                                                       | Killed by                                                                 |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| M01 the lane comparison loop body replaced by `continue`                                     | planning test, doc-counts                                                 |
| M02 the loop narrowed to the first lane                                                      | planning test, doc-counts                                                 |
| M03 the order comparison replaced by the set comparison                                      | planning test                                                             |
| M04 the five lanes narrowed to four                                                          | planning test, doc-counts                                                 |
| M05 the duplicate-story check of `epics.md` removed                                          | planning test                                                             |
| M06 the duplicate-story check of `sprint-status.yaml` removed                                | planning test                                                             |
| M07 the status-row existence check removed                                                   | planning test                                                             |
| M08 the exactly-one-row check removed                                                        | planning test                                                             |
| M09 the story count reading a different heading level                                        | planning test, doc-counts                                                 |
| M10 the first appended story moved to 26                                                     | planning test, doc-counts                                                 |
| M11 the appended sentences narrowed to the first                                             | planning test, doc-counts                                                 |
| M12 the omitted-story check removed                                                          | planning test                                                             |
| M13 the extra-story check removed                                                            | planning test                                                             |
| M14 the loader's refusal guard made unreachable                                              | planning test                                                             |
| M15 the overview count comparison removed                                                    | planning test                                                             |
| M16 the ascending-order check removed                                                        | planning test                                                             |
| M17 the repeated-id check removed                                                            | planning test                                                             |
| M18 fence tracking removed                                                                   | planning test                                                             |
| M19 the appended export replaced by a literal (survived round 1)                             | planning test, after `the loader counts the appended stories it verified` |
| M20 the lane export replaced by a literal                                                    | planning test                                                             |
| M21 the slug dash dropped from the row prefix                                                | planning test                                                             |
| M22 the full-stop lookahead of a lane list dropped                                           | planning test                                                             |
| M23 the lane note pattern removed from the id list                                           | planning test, doc-counts                                                 |
| M24 the lane number gap check removed                                                        | planning test                                                             |
| M25 the missing-in-sprint check removed (round 1 pattern did not match)                      | planning test                                                             |
| M26 the missing-in-epics check removed (round 1 pattern did not match)                       | planning test                                                             |
| M27 the overview count check removed from the appended sentences                             | planning test, doc-counts                                                 |
| M28 the repeated story id refusal removed                                                    | planning test                                                             |
| M29 `real-capture` dropped from the captured-bytes origins                                   | planning test, doc-counts, doc-count-sources test                         |
| M30 unmeasurable results counted as numbers                                                  | planning test, doc-counts, doc-count-sources test                         |
| M31 null results counted as numbers                                                          | planning test, doc-counts, doc-count-sources test                         |
| M32 the `full` and `minimal` fixture-set pattern widened by one character (survived round 1) | planning test, after `only a ci case over the full or minimal project`    |
| M33 the refusal of a sprint lane held under two keys removed                                 | planning test                                                             |
| M34 the refusal of an epics lane opened twice removed                                        | planning test                                                             |
| C1 the lane count entry deleted from the configuration                                       | planning test, doc-counts                                                 |
| C2 the story count entry reading the appended count source                                   | planning test, doc-counts                                                 |
| C3 the header entries deleted from the configuration                                         | planning test                                                             |

### Round 1 mutants

Review round 1 reported four surviving mutants (H, R, K2, O) and the fence, heading and note defects behind them.
Each was reproduced first: on the module of the first commit, four appended texts hid or kept a `### Story` heading wrongly (a four-backtick fence holding a three-backtick line, a plain fence holding a line that opens with three backticks and an info string, a marker line indented four spaces; the double-backtick line counted correctly there), and each of the four changes below passed every suite.
Each now fails on the final tree, and a second pass over the changed lines found further survivors that got their own cases.

| Mutant                                                                                                                         | Killed by                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| H the fence opening widened to two backticks (a line of `alone, and` code ``)                                                  | `story sections are counted outside fences` (survived once while the info-string rule masked it)         |
| R the lane opening restricted to lanes 1 to 5                                                                                  | `a sixth lane in one file only is named, whichever file holds it`                                        |
| K2a the heading regular expression widened to two or three hashes                                                              | `story sections are counted outside fences`                                                              |
| K2b the second heading regular expression widened (an equivalent mutant of the old code, since the first filter ran before it) | removed by reading the heading with one regular expression, so K2a covers it                             |
| K2c the heading regular expression widened to three or four hashes                                                             | `story sections are counted outside fences`                                                              |
| O the lane note allowed to run to the last parenthesis of the line                                                             | `a lane note in parentheses after an id stays out of the id, notes on two ids keep the ids between them` |
| F1 a closing fence that must be strictly longer than the opening                                                               | planning test, doc-counts                                                                                |
| F2 the closing fence character not compared                                                                                    | `story sections are counted outside fences`                                                              |
| F3 the fence indentation unlimited                                                                                             | `story sections are counted outside fences`                                                              |
| F4 a backtick info string allowed to hold a backtick                                                                           | `story sections are counted outside fences`                                                              |
| F5 a closing fence that may carry text                                                                                         | `story sections are counted outside fences`                                                              |
| F6 the closing fence indentation unlimited (survived once)                                                                     | `story sections are counted outside fences`                                                              |
| F7 the closing length not compared                                                                                             | `story sections are counted outside fences`                                                              |
| F8 the epic-list sentence colon changed to a comma                                                                             | planning test, doc-counts                                                                                |
| F9 an array result counted as a number                                                                                         | `a stored result of another shape than null or an object is refused`                                     |
| F10 the epic count reading level three                                                                                         | `story sections are counted outside fences`                                                              |
| F11 the colon before a lane list made optional (survived once)                                                                 | `the lane readers refuse a paragraph or a key they cannot read`                                          |
| F12 an unreadable story heading skipped                                                                                        | planning test, doc-counts                                                                                |
| F13 the story id duplicate check keyed on the title                                                                            | `story sections are counted outside fences`                                                              |

## Gates

Run in this checkout, one at a time, at the commit of review round 1: `npm run test:boundary` (0 violations over 869 entries), `test:doc-counts` (0 disagreements), `test:eval-replay` (185 passed), `test:doc-claims`, `test:doc-count-sources`, `test:planning-doc-sources` (102 checks), `test:shards`, `test:ci-coverage` (134 chain steps), `test:changelog`, `test:release-metadata`, `lint`, `lint:md`, `format:check`, `docs:validate-links`.
`test:boundary` rejects a dev-tree path such as `test/test-eval-replay.js` in the published `README.md`, and runs before every report of completed.
No full `npm test` ran locally; CI carries the chain.

## Build review

One read-only pass with a general-purpose review subagent over the diff against `b41d8b78`.
It found no way for the new checks to pass on drifted data, confirmed the replay counts, the case descriptions in `test/README.md`, the 129 to 130 history and the additions-only diff of `eval-quality.config.json`, and reported three defects:

| Finding                                                                                                                                                                                      | Change                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The check for a lane entry without a status row pinned the status `in-progress` and the id 1.95, and the no-slug case pinned the status of row 1.96, so a status flip broke the suite in CI. | Both cases read the row's own `development_status` line and derive the id from the row key, so the suite holds for any status. The first run after the flip to `review` had failed. |
| The record said the review findings were recorded below and recorded none.                                                                                                                   | This table.                                                                                                                                                                         |
| The `CHANGELOG.md` correction entry sat under `Added`.                                                                                                                                       | It already sits under `Fixed` (the first bullet of the Unreleased `Fixed` section); the reviewer read the neighbouring `Added` bullet. No change.                                   |

The shard weight of `test:planning-doc-sources` moved from 6 to 8 after the suite measured about 8 seconds.

### Round 1

Review round 1 on PR #365 reported twelve defects, and the build fixed each:

| Finding                                                                                                                         | Change                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The published `README.md` named `test/test-eval-replay.js`, which `test:boundary` rejects (CI job `layering-boundary-lineage`). | The bullet names the test README and the header of the replay suite without a path; `test:boundary` is in Gates and runs before every report of completed.                                                                            |
| Decision 8 said lane 1 holds 1.92 and a coordinator would move it.                                                              | It says both files list 1.92 in lane 3 after Story 1.92's merge.                                                                                                                                                                      |
| `CHANGELOG.md` placed the lane count in the overview.                                                                           | It says the overview states the story count, the epic count and the appended count, and the parallel-lanes section states the lane count.                                                                                             |
| Acceptance criterion 4 had no case.                                                                                             | `every doc-counts entry and source that existed before Story 1.95 reads what it read` pins the 13 entries and 31 sources of origin/main by name and by the sources they read, with no git read; its AC4 revert is in the table above. |
| The epic list said findings "are appended", which the shared lane rule contradicts and the gate pinned.                         | The sentence is in the past tense (`were appended as stories at the end of the epic: Stories ...`), `APPENDED_SENTENCES` matches it, and a case covers the sentence gone.                                                             |
| Several new sentences held two or more sentences on a line.                                                                     | One sentence per line in `test/README.md`, the replay and planning comments, and both test headers.                                                                                                                                   |
| A clause that exists only to be turned down in Decision 4, and other shapes of that kind.                                       | The clause is gone, and the sweep rewrote the mutant rows and the pin messages that read "no longer".                                                                                                                                 |
| The fence tracker closed a fence on any marker line.                                                                            | `proseLines` follows CommonMark: the opening fixes character and length, a closer is at least as long with only whitespace after it, and markers indent at most three spaces.                                                         |
| The revert observations named 1.76 for lane 1 after the rebase moved the count.                                                 | Every observation was re-run at the current tree; lane 1 names 1.75, and the README sentence sits at line 308.                                                                                                                        |
| Mutant R (lane opening restricted to digits 1 to 5) survived.                                                                   | Cases for a sixth lane in `epics.md` only and in `sprint-status.yaml` only.                                                                                                                                                           |
| Mutant K2 (heading levels widened) survived.                                                                                    | Cases for `## Story` and `#### Story` lines, and one heading regular expression.                                                                                                                                                      |
| Mutant O (a note running past its parenthesis) survived.                                                                        | A lane with notes on two ids and an id between them.                                                                                                                                                                                  |
