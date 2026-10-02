---
title: 'Story 1.70: Refuse promptfoo assertions that run adopter code or call a model'
type: 'bugfix'
created: '2026-10-02'
status: 'review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '349bf6f3'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Stories 1.43 and 1.70)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.70 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-10, AD-21)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/evaluation-framework-facts.md (the promptfoo section)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.43.md (the refusal this story extends, and the model for the record)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** The promptfoo fixture evaluator (`test/fixtures/evaluate-promptfoo/evals/summary/evaluator/promptfoo.mjs`) and the Evaluate skill's starter template (`src/workflows/testarch/bmad-testarch-evaluate/assets/evaluators/promptfoo-assertions.mjs`) turn every graded promptfoo assertion into a target row. The installed promptfoo (0.123.1) also grades assertions that run adopter code: a `javascript` assertion that throws, and a `contains` whose `value` is a `file://` reference to a Python or Ruby file that raises, yield a graded `pass: false` whose `reason` is the crash text, and promptfoo sets `error` on every ordinary failed assertion, so neither `error` nor the result shape tells a crash from a violated oracle. A `transform` rewrites the output before the assertion grades it, so the row grades text the target never produced. Both reach the evidence as a caught target defect.

**Approach:** Both evaluators admit only assertions that run no adopter code and call no model. The allow-list is the deterministic built-in types `contains`, `icontains`, `contains-all`, `contains-any`, `icontains-all`, `icontains-any`, `equals`, `starts-with`, `regex` and `is-json`, with their `not-` forms. A result whose `testCase.assert` holds any other type, an allow-listed assertion whose `value` loads code (a `file://` reference to a JavaScript, TypeScript, Python or Ruby file, or a string `value` that is a `package:` reference), or an assertion that carries a `transform`, is refused with a diagnostic naming the type and the reason. The evaluator exits non-zero, so `tea-evaluate run` ends as evaluator infrastructure failure (exit 12) and seals no trial record. Allow-listed assertions still grade as before: a graded `pass: false` is a cited `fail` row and a graded `pass: true` a `pass` row. The evaluator guide teaches the allow-list, the value guard, `transform` and the route for an assertion that needs code (a `command` evaluator the adopter owns, where a crash exits non-zero). No eval-quality change: this is TeA-side adopter code and guidance.

## Boundaries & Constraints

**Always:** change the fixture evaluator and the starter template in step, keeping their existing differences (the starter reads `mapping.json`, the fixture hard-codes its keys). The refusal sits in `rowsFromResults`, before any other check of a result's assertions, so the type or the value names itself whatever else is wrong with the result; every existing refusal keeps its message and its precedence among the later checks. Each file exports its allow-list so a unit can compare the two. The diagnostic names the assertion type and the reason, and caps a quoted `value` at 200 characters. Verify every listed type, and its `not-` form, against the installed version's assertion enumeration in the test (`AssertionTypeSchema` of the installed `promptfoo`), never from a hand-copied list in the test. The skill is edited through `/bmad-workflow-builder` Edit run headless on `src/workflows/testarch/bmad-testarch-evaluate/` (Build Rules: skill gates), with the builder Analyze at zero critical and zero high findings (a finding that contradicts a repository test is skipped with the reason in the completion notes). Exercise every revert check once in a scratch copy and record the observation. Pre-existing defects found on the way are fixed in this PR.

**Never:** an assertion that runs adopter code or calls a model becoming a target `fail` or `pass` row, a sealed trial record or a finding; an allow-listed assertion refused for its type or its literal value alone (a `package:` string inside an array `value` is a literal substring to promptfoo and stays admitted); matching promptfoo's `reason` or `error` text to tell a crash from a failure; importing promptfoo into `cli/`; any change to `cli/` behavior, to eval-quality, to `package.json` dependencies, the lockfile or the peer floor; raising a timeout; adding a script that is not chained; weight added to a heavy suite without the measured weight reported to the coordinator; a commit, push, pull request, merge or release.

**Decisions (coordinator, owner-delegated):**

- Engine change: none. Lane 3 owns releases; nothing here needs a new export.
- The refusal reads the result's `testCase.assert`, the assertions promptfoo reports it ran. A pre-check of `asserts.yaml` would duplicate promptfoo's parser. The consequence is stated in the guide: promptfoo has already run the adopter's code when the wrapper refuses.
- Verified live on promptfoo 0.123.1, 2026-10-02, and recorded in `evaluation-framework-facts.md`: a string `value` starting `file://` is split at its first `:` into a path and a function name; the path runs as code when it ends in `.js`, `.cjs`, `.mjs`, `.ts`, `.cts` or `.mts` (case-insensitive), `.py` or `.rb` (case-sensitive), and any other extension is read as data (`.json`, `.yaml`, `.yml`, `.txt`) or throws `Unsupported file type`; `file://x.mjs:pick` runs `pick` and its return value becomes the expected value, so adopter code decides the verdict; a string `value` starting `package:` loads and calls a package export; an element of an array `value` is read through the data loader only, so a code file there throws (ungraded) and a `package:` element is a literal string; `contextTransform`, `provider` and `rubricPrompt` on an allow-listed type are inert (a throwing `contextTransform` and an `exec:` provider on `contains` both graded `pass: true`), so the guard names only `transform`; a `not-` form runs the same code (`not-contains` with `file://boom.py` returns the same graded crash).
- The code-file guard tests the path before the first `:` of the reference against `.js`, `.cjs`, `.mjs`, `.ts`, `.cts`, `.mts`, `.py` and `.rb`, case-insensitively, a superset of promptfoo's own tests, so a `.PY` reference is refused with its reason where promptfoo would only fail to load it. The plan text named `.js`, `.mjs`, `.cjs`, `.py` and `.rb`; the three TypeScript extensions come from the installed version's `JAVASCRIPT_EXTENSIONS`.
- `type` is read once, one `not-` prefix stripped, and compared for exact membership: `not-not-contains`, a missing type and a non-string type are refused (the type is named, or `(none)`).
- `transform` is refused when the key holds any value other than `null` or `undefined` (a YAML key left empty is inert).
- `asserts-error.yaml` (a `javascript` assertion that throws) stays in the fixture as the refused case; the fixture's `assertionKey` loses its `javascript` exemption, since that type no longer reaches it. Test cases that mapped the real crashed JavaScript assertion to a graded fail flip to refusals.

## I/O & Edge-Case Matrix

| Scenario                                  | Input / State                                                                          | Expected Output / Behavior                                                         | Error Handling |
| ----------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------- |
| Code-running type                         | `javascript`, `python`, `ruby`, `webhook`, `not-javascript`                            | refuse naming the type and the allow-list; `run` exits 12, no record               | exit 12        |
| Model-graded or other non-listed type     | `llm-rubric`, `g-eval`, `factuality`, `levenshtein`, `word-count`, `assert-set`        | same refusal                                                                       | exit 12        |
| Allow-listed pass and fail                | each listed type and its `not-` form, graded `pass: true` and `pass: false`            | `pass` row and cited `fail` row as before, in the fixture and the rendered starter | n/a            |
| Code file as `value`                      | `contains` with `file://boom.py`, `file://boom.rb`, `file://x.mjs:pick`, `file://x.PY` | refuse naming the type and the reason; the live `boom.py` case is a `run` exit 12  | exit 12        |
| `package:` string as `value`              | `contains` with `package:pkg:fn`                                                       | refuse naming the type and the reason                                              | exit 12        |
| Code file inside an array `value`         | `contains-any` with `["file://boom.py"]`                                               | refuse naming the type and the reason (promptfoo alone leaves it ungraded)         | exit 12        |
| `package:` string inside an array `value` | `contains-any` with `["package:x:y"]` against output holding that text                 | admitted, graded as before                                                         | n/a            |
| Data file as `value`                      | `contains-all` with `file://list.json` or `file://words.txt`                           | admitted, graded as before                                                         | n/a            |
| `transform`                               | `contains` with a rewriting `transform`, one that throws, and a falsy non-null value   | the first two refused; a `null` value admitted                                     | exit 12        |
| Second assertion carries the code         | three assertions, the third a `javascript` type or a code `value`                      | refused although the first two are allow-listed                                    | exit 12        |
| Second result carries the code            | two results, the second holds the refused assertion                                    | refused although the first graded                                                  | exit 12        |
| Refusal beats later checks                | a refused assertion beside an ungraded row, a wrong output or an incomplete grade set  | the assertion refusal is the diagnostic                                            | exit 12        |
| Allow-list matches the installed version  | every listed type and `not-` form                                                      | `AssertionTypeSchema.safeParse` accepts each                                       | n/a            |

</frozen-after-approval>

## Code Map

- `test/fixtures/evaluate-promptfoo/evals/summary/evaluator/promptfoo.mjs`: `assertionKey`, `rowsFromResults`, the exported allow-list.
- `src/workflows/testarch/bmad-testarch-evaluate/assets/evaluators/promptfoo-assertions.mjs`: the same refusal and export in the starter.
- `test/fixtures/evaluate-promptfoo/evals/summary/evaluator/`: `asserts-error.yaml` (stays), and new assertion files and a code file for the live cases, selected by a wrapper flag the way `--ungraded` selects `asserts-ungraded.yaml`; the wrapper copies a selected code file beside `asserts.yaml` in its temporary directory.
- `src/workflows/testarch/bmad-testarch-evaluate/references/evaluator.md`: the `## Separate ungraded framework errors from graded target failures` section (the allow-list, the value guard, `transform`, the reason, the `command` route, a tagged refused example), the learn procedure's step 4 sentence about a thrown assertion; `references/gaps.md` exit 12 repair; `assets/README.md` if it states the old behavior.
- `test/test-evaluate-promptfoo.js` (`test:evaluate-promptfoo`): `resultShapes` flips the crashed-JavaScript graded-fail case to a refusal; new units for every matrix row through `--map-results`; live promptfoo cases and a `run` exit 12 case; the installed-enumeration unit; the fixture-and-starter allow-list comparison.
- `test/test-evaluate-guidance.js` (`test:evaluate-guidance`): the rendered starter against the same cases, the guide's markers and the new tagged example.
- `_bmad-output/planning-artifacts/evaluate/evaluation-framework-facts.md` (a dated amendment with the verified facts), `epics.md` and `test-design-epic-1.md` (the observed behavior, dated), `CHANGELOG.md` (`Changed` or `Fixed`), `sprint-status.yaml`, `tools/test-shard-weights.json` (only if a measured weight moves).

## Tasks & Acceptance

**Execution:**

- [x] Allow-list, value guard and `transform` guard in the fixture evaluator and the starter, exported, in step -- AC 1, 2, 3
- [x] `test:evaluate-promptfoo` cases: every matrix row through `--map-results`, the live code-file and `transform` cases through promptfoo, the `run` exit 12 case with no sealed record, the installed-enumeration unit, the two-file allow-list comparison -- AC 1 to 4
- [x] `test:evaluate-guidance` cases through the rendered starter, the guide section with its tagged example, the learn step and gaps sentence -- AC 1 to 5
- [x] facts amendment, CHANGELOG, plan amendments, sprint row, story record with every revert observation -- all

**Acceptance Criteria:**

- A result whose `testCase.assert` holds a type outside the allow-list (`javascript`, `python`, `ruby`, `webhook`, `not-javascript`, a model-graded kind) is refused by the fixture evaluator and the rendered starter with a diagnostic naming the type, and `tea-evaluate run` exits 12 and seals no trial record (revert: removing the allow-list lets `asserts-error.yaml`'s crashing `javascript` assertion become a target `fail` row and seals a record).
- Each allow-listed type and its `not-` form still maps a graded `pass: false` to a cited `fail` row and a graded `pass: true` to a `pass` row in both evaluators (revert: refusing a listed type, or passing its failure as `pass`, changes the expected rows).
- An allow-listed assertion whose `value`, or an element of an array `value`, is a `file://` reference to a code file, or whose string `value` is a `package:` reference, or that carries a `transform`, is refused naming the type and the reason; a live `contains` with `value: file://boom.py` runs through promptfoo and the rendered starter (revert: removing the value guard makes it a `fail` row, in `test:evaluate-promptfoo` and `test:evaluate-guidance`; removing the `transform` guard lets the rewritten output grade).
- Every listed type and `not-` form is accepted by the installed promptfoo's `AssertionTypeSchema`, read in the test, and the fixture and the starter export the same allow-list (revert: listing a type the installed version does not define, or adding one to a single file, fails).
- The evaluator guide's `## Separate ungraded framework errors from graded target failures` section names the allow-list, the code-running values, `transform` and the reason (an assertion that runs adopter code, or grades text the target did not produce, belongs in a `command` evaluator the adopter owns, where a crash exits non-zero) and that promptfoo has already run the code when the wrapper refuses; `test:evaluate-guidance` fails when the allow-list, a refused type, the value guard, `transform`, the reason or the `command` route is removed, and the guide's tagged refused example runs through the rendered starter (revert: removing each fails the assertion).
- Each refusal is tried on a later element: the second or third assertion of a result, the second result, the second `not-` form, not only the first.
- Gate: `test:evaluate-promptfoo`, `test:evaluate-guidance`, `npm test`, engine check.

## Verification

**Commands:**

- `node --input-type=module -e "const m = await import('eval-quality'); if (typeof m.evaluateTarget !== 'function') process.exit(1)"` -- expected: exit 0 (at the start and at the end)
- `npm run test:evaluate-promptfoo && npm run test:evaluate-guidance && npm run test:evaluate-evaluators && npm run test:evaluate-learned-framework && npm run test:evaluate-check` -- expected: green
- `npm run test:evaluate-boundaries && npm run test:direction && npm run test:shards && npm run test:ci-coverage && npm run test:doc-counts && npm run test:doc-claims && npm run test:changelog` -- expected: green
- `npm run lint && npm run lint:md && npm run format:check && npm run docs:validate-links` -- expected: green
- `npm test` -- expected: green (CI shards)

## Implementation Notes

- `test/fixtures/evaluate-promptfoo/evals/summary/evaluator/promptfoo.mjs` and `src/workflows/testarch/bmad-testarch-evaluate/assets/evaluators/promptfoo-assertions.mjs` change in step.
  Both export `ALLOWED_ASSERTION_TYPES` and call `refuseAssertion` for every entry of `result.testCase.assert` as the first statement of the per-result loop in `rowsFromResults`, before the cited-output check, the metadata check and `assertionKey`.
  The refusal reads `type` once, strips one `not-` prefix and tests exact membership (`not-not-contains`, a missing type and a non-string type are refused, the type named or `(none)`); then tests a string `value` and each string element of an array `value` with `loadsCode`; then refuses a `transform` that is neither `null` nor `undefined`.
  `loadsCode` takes the text after `file://`, cuts it at the first colon, resolves it with `path.resolve('/', ...)` as promptfoo does before it tests an extension, and refuses a lower-cased path ending in `.js`, `.cjs`, `.mjs`, `.ts`, `.cts`, `.mts`, `.py` or `.rb`; `package:` is tested for a string `value` only.
  Every diagnostic names the type (a quoted value or type is cut at 200 characters) and the reason, and ends with the repair (`an assertion that needs code belongs in a command evaluator you own`, a builder Analyze enhancement).
  The fixture's `assertionKey` lost its `javascript` exemption and its `knownKeys` set (a metric must equal the key its type and value give).
- The fixture's `main()` selects live assertion files through a `LIVE_CASES` table of flags (`--single`, `--error`, `--code-file`, `--transform`) and copies the companion code file (`boom.py`) beside `asserts.yaml`, because promptfoo resolves `file://` from its working directory.
  New files: `asserts-code-file.yaml`, `asserts-transform.yaml`, `boom.py`.
  `asserts-ungraded.yaml` is now a `contains` with an object `value` (the one real ungraded result left, see Departures); the `--ungraded` flag is gone.
- The skill edit went through `/bmad-workflow-builder` Edit run headless on `src/workflows/testarch/bmad-testarch-evaluate/` (memlog direction logged, the starter, `references/evaluator.md` and `references/gaps.md` edited, Analyze afterwards).
  `references/evaluator.md`: the failure-boundary section replaces the "until Story 1.70" sentence with the allow-list, the refused types, the value guard, the data-file exception, `transform`, the `command` route and the sentence that promptfoo has already run the code; its opening sentence is qualified for admitted kinds; the third tagged example `promptfoo-refused` (a graded failure of `file://boom.py`) runs through the rendered starter; the promptfoo paragraph of the framework landscape points to it; learn steps 4 and 6 ask the wrapper to refuse the kinds that run code or call a model.
  `references/gaps.md`: the `tea-evaluate 12` row names an assertion that runs adopter code or calls a model.
- `test/test-evaluate-promptfoo.js`: `resultShapes` asserts the real results (the thrown `javascript` assertion arrives graded, a raising `file://boom.py` arrives graded, a rewriting `transform` arrives graded for an output that holds the value, an object `value` arrives ungraded) and refuses each through `--map-results`; `refusedRuns` runs six projects through `tea-evaluate run` (the `javascript` assertion, the raising Python value and the rewriting transform with the fixture's flags; an ungraded row, a partial grade set and a grade without a boolean `pass` rewritten after promptfoo returns), each exit 12 with the diagnostic in `evaluator/clean/trial-1.stderr` and no `trial-sets.json` or `trial-sets/` (the positive control stays in `pipeline`).
  `allowList` adds the units (the suite grows from 165 to 2317 checks), run in one child process per evaluator (the fixture and the starter beside a copy of its mapping): every type outside the list, every reference of an independent table (45 references, each as a string and as an array element, for a type and its `not-` form), transforms, placements first, third of three, in a second result and third in a second result, precedence over five other faults, the 200-character caps, the two files' exported lists, and the installed `BaseAssertionTypesSchema` and `NotPrefixedAssertionTypesSchema` (every installed type outside the list refused, every listed type and `not-` form admitted; the starter maps pass and fail rows of each).
- `test/test-evaluate-guidance.js`: `REFUSAL_MARKERS` (sixteen guide sentences), the third tagged example, six negative guide cases, the gaps pin, and `checkPromptfooRefusals`, which runs the rendered starter through payloads (the guide's refused example, 12 types and a missing type, 8 code references each as a string and as an array element, a `package:` string, 7 admitted values, 5 transforms and a `null` one, each as the third assertion and in a second result; precedence; the cap; every listed type and `not-` form graded pass and fail; the guide's list equal to the starter's export) and once through promptfoo itself (a raising `boom.py` by absolute path in a three-assertion `asserts.yaml`).
- `tools/test-shard-weights.json`: `test:evaluate-promptfoo` 60.1 to 96 and `test:evaluate-guidance` 75.2 to 92, scaled from the CPU time (user plus system) the suites took before and after on a loaded machine (28.5 to 45.7 seconds, and 33.6 to 40.9), since the wall time moved with the load.
- Plan text: `epics.md` and `test-design-epic-1.md` carry the dated amendment (the three TypeScript extensions, the resolved-path match, `package:` for a string `value` only, the array literal, `transform` null, `AssertionTypeSchema`, the ungraded case); `evaluation-framework-facts.md` carries the dated Story 1.70 check; Story 1.43's pointers in both plan files and its CHANGELOG entry no longer say a thrown assertion becomes a `fail` row.
  `CHANGELOG.md` `### Fixed` entry added; `sprint-status.yaml` row `1-70` is `review`.
- No committed baseline, manifest or test pins the digest of the `test/fixtures/evaluate-promptfoo` tree: `project()` and the guidance template run copy the tree and run `tea-evaluate digest` on the copy, and no `baseline/` exists for it. Nothing was re-accepted.
- Matrix audit: every row ran and passed (`allowList` units for the type, value, array, `package:`, data-file, `transform`, later-element, later-result, precedence and enumeration rows; `refusedRuns` for the three live `run` rows; `checkPromptfooRefusals` for each row through the rendered starter, and the live `boom.py` case).

### Departures from the plan text

- The matrix row "a `transform` ... and a falsy non-null value" reads two ways; the Decisions bullet (refused for any value but `null` or `undefined`) governs, so `''`, `0` and `false` are refused (promptfoo treats `transform: ""` as inert) and `null` is admitted.
- The criterion names `AssertionTypeSchema`; its union ends in `custom()`, which accepts any string (`bogus`, `not-not-contains`), so the unit reads its two enumerating members, `BaseAssertionTypesSchema` and `NotPrefixedAssertionTypesSchema`, and refuses every installed type outside the list as well.
- After the `transform` guard no assertion the fixture admits makes promptfoo return an ungraded result (a failing `transform` was the only source; an object or absent `value` on `contains` is ungraded in promptfoo, but the fixture maps by type and value and refuses that metric first).
  The `run` case for an ungraded row therefore rewrites the result after promptfoo returns, like its two siblings, and `resultShapes` holds the real shape from `asserts-ungraded.yaml` (with the assertion list set to the keyed one before the import).
- AC 2's "in both evaluators" holds for the starter only: the fixture maps by type and value, so it carries pass and fail rows for `contains:pears` and `not-contains:shellfish` alone; for every other listed form `test/test-evaluate-promptfoo.js` checks that the fixture does not refuse it, and the starter maps the pass and fail rows of every listed form. `epics.md` carries a dated clause on the AC (Review round 1).
- The match for a code file runs on the resolved path, which the plan text did not say: promptfoo resolves the path first, so `file://boom.py/` and `file://./a/../boom.py` run the Python file (verified live).
- The fixture's `javascript` exemption in `assertionKey` was removed as the Decisions say; nothing observable depends on it once the type refusal comes first, so no revert check exists for its removal alone (the combined revert below restores both).
- The guidance live case writes `boom.py` into the project and gives its absolute path, because the starter copies only `asserts.yaml` into promptfoo's temporary directory.
- `test:direction` forbids a computed dynamic import in a test file, so the units import each evaluator in a child process (`node --input-type=module -e`, the module path in `TEA_BATCH_MODULE`).

## Revert observations

Each exercised once on a scratch copy of the final tree (`cp -c -R` of the checkout, under the scratchpad directory): apply the one edit that undoes the change to the fixture and the starter, run the named test, record the failed-check count, restore.
The unmodified scratch copy passes: `test:evaluate-promptfoo` 2317 checks, 0 failures; `test:evaluate-guidance` green.
The guidance test stops a template block at its first failed assertion, so its count is one for any template regression and the guide checks report each missing marker.
Counts are failed checks of the total of 2317 unless the run aborted sooner.

- AC 1, the type allow-list removed (both files): 384 failures in `test:evaluate-promptfoo`; the guidance test fails (1).
  With the old `javascript` exemption restored beside it, the `run` case of `asserts-error.yaml` exits 0 and seals `trial-sets.json` and `trial-sets/` (198 failures): the crash becomes a target `fail` row, as the criterion says.
  With the exemption gone the fixture still stops the crash, but at `assertionKey` with the metric message, so the diagnostic checks fail.
- AC 1, later elements: refusal only on the first assertion of a result: 458; only on the first result: 448 (the guidance test, 1 each); the refusal moved after the ungraded check: 581.
- AC 2, `not-` prefix not stripped (every listed `not-` form refused): 1110 failures (2298 checks, the run stopped); the starter's graded fail passed as `pass`: 20 (starter) and 7 (fixture); a type added to both lists that the installed version does not define: 6; an installed type outside the list added to both: 10; added to the fixture only: 6; dropped from the starter only: 2 (the guidance test fails for the starter-only edits).
- AC 3, the `file://` value guard removed: 615; with the allow-list kept, the live starter prints a `fail` row quoting stdout with the crash text and exits 0 (checked directly); the guidance test fails (1).
  The `package:` guard removed: 48; applied to array elements too: 48; the array element guard removed: 304; the `transform` guard removed: 103; refusing only truthy transforms: 48.
  The matcher: case-sensitive extensions 96; path not resolved before the extension test 32; the reference not cut at its first colon 128; the three TypeScript extensions dropped 96; the quoted value not capped at 200 characters 4.
  The guidance test fails (1 each) for every one of these starter edits.
- AC 4, covered by the AC 2 rows: a list that differs between the files, or names a type the installed version does not define, fails; every installed type outside the list is checked to be refused.
- AC 5, the guide in `test:evaluate-guidance` (failures reported): allow-list sentence removed 4; refused types 2; value guard 5; data-file sentence 2; `transform` 3; `command` route 2; "promptfoo has already run the code" 1; the reason sentence 1; the "neither `error` nor the shape" sentence 1; the opening sentence 1; the refused example tag removed 3; the example made a `pears` value 2; the gaps exit 12 pointer removed 1.
- The six builder-gate negative cases run inside the guidance test itself.

## Gates

- Engine check (`evaluateTarget` is a function) exit 0 at the end of the build (not run at the start; `package.json`, the lockfile and `cli/` are untouched, so the installed engine did not change).
- Green on the last state of the tree: `test:evaluate-promptfoo` (2317 checks), `test:evaluate-guidance`, `test:evaluate-evaluators`, `test:evaluate-learned-framework`, `test:evaluate-check`, `test:evaluate-boundaries`, `test:schema-versions`, `test:schemas`, `test:boundary`, `test:direction`, `test:doc-counts`, `test:doc-claims`, `test:shards`, `test:ci-coverage`, `test:changelog`, `test:bmad-output-gated`, `test:conflict-markers`, `test:evaluate-gap-loop`, `test:evaluate-ci`, `test:release-metadata`, `lint`, `lint:md`, `format:check`, `docs:validate-links`.
- `git diff --stat -- cli package.json package-lock.json` is empty: no `cli/` change, no dependency or lockfile change, no timeout raised, no script added.
- Measured weight of the two heavy suites, before and after (one machine, other lanes running, load average 12 to 27): `test:evaluate-promptfoo` 41.7 seconds wall and 28.5 CPU (user plus system) with 165 checks, then 58 to 65 wall and 45.7 CPU with 2317 checks; `test:evaluate-guidance` 40.7 wall and 33.6 CPU, then 45 to 54 wall and 40.9 CPU.
  `tools/test-shard-weights.json` follows: 60.1 to 96 and 75.2 to 92 (the CPU ratios 1.6 and 1.22 applied to the CI weights).
  The added `run` cases are the three live refusals (about 5 seconds each) and the units are one child process per evaluator.
- Unrun: the full `npm test` (CI shards), as the owner directed.
- This record's frozen table may be reflowed by Prettier (whitespace only) so `format:check` passes with the file tracked.

## Build review

Builder Analyze (delta, five lenses, `.analysis/2026-10-02-story-1-70/`) found 0 critical, 0 high, 3 medium and 5 low; the customization and determinism lenses found nothing.
The path scan matches the baseline (two high findings, `SKILL.md` bare `_bmad` and `references/adapters.md` explanatory `../`, in files this story did not touch).
`quick_validate.py` and `scan-scripts.py` are clean.

### Fixed

- Architecture 1 (medium): the section opened with "a graded `pass: false` becomes a `fail` row" and the later paragraphs qualified it; the opening sentence now carries the admitted-kind condition, with its pinned marker intact.
- Architecture 2 (low): the promptfoo authoring paragraph and learn step 6 point to the admitted-assertion contract.
- Enhancement 2 (medium): the value and `transform` refusals name the repair (a `command` evaluator the adopter owns), in both files, as the type refusal's allow-list already does.
- Leanness 1 to 3 (low): the repeated rationale, the repeated exit 12 clause and the long learn-step clause are cut to their pinned prefixes.
- Lint on the way: `forEach` with a function reference and an unused constant in the new code; `test:direction` flagged the computed dynamic imports in the first draft of the units (see Departures).

### Skipped

- Enhancement 1 (medium, validate `asserts.yaml` before spawning promptfoo): the story's Decisions state the trade, since a pre-check would duplicate promptfoo's parser and the guide carries the consequence (promptfoo has already run the code when the wrapper refuses); a pinned sentence says so.
- Enhancement 3 (low, move the exit 12 causes out of the `gaps.md` table cell): `test:evaluate-guidance` holds the exit mapping and one concrete repair per row, and the padding comes from the repository's formatter.

## Review round 1

Three reviewers on PR #301 (adversarial, compliance, test quality) raised seven findings.
Each was reproduced against the installed promptfoo 0.123.1 before its plan text was written, and each revert was run once on a scratch copy of the final tree (`cp -c -R`, under the scratchpad directory).
The unmodified scratch copy passes: `test:evaluate-promptfoo` 3306 checks, 0 failures; `test:evaluate-guidance` green.
The skill edit went through `/bmad-workflow-builder` Edit run headless again (memlog direction logged, Analyze afterwards: 0 critical, 0 high, 2 medium, 3 low).

### Fixed

1. Adversarial 1 (high): a template value runs adopter code.
   promptfoo renders a string `value` that is neither a `file://` nor a `package:` reference, and a string element of an array `value` that is not a `file://` reference, through nunjucks, which reaches `Function` (`range.constructor`).
   Reproduced: `not-contains` with a `{{ range.constructor("...writeFileSync(...marker...)")() }}` value wrote the marker file in promptfoo's working directory and its return value decided the expected value; `{{ output }}` derived the expected value from the output; `{# c #}pears` and `{% if true %}pears{% endif %}` rendered to `pears`.
   Both evaluators now refuse a string `value`, or a string element of an array `value`, that contains `{{`, `{%` or `{#`, naming the type and the reason (the value is a template promptfoo renders, which can run code) and the lighter route for literal braces (a `regex` or `not-regex` pattern such as `[{][{]`, verified live).
   Tests: units for a string, an array element, the third of three, a second result and the `not-` form, with `{{`, `{#`, `{%` and near misses (`{pears}`, `{ {`, `}}`, `[{][{]`, `\{\{user`); the rendered starter (four templates, four near misses, string and array element); live promptfoo in `resultShapes` (the template writes `marker` in the test's temporary directory only, the test asserts the marker exists, so the code had run, and the result is refused through the fixture and, with a metric the starter keys, through the starter in process); live through the rendered starter in `test:evaluate-guidance` (the marker path is inside the guidance project's temporary directory; the test asserts the marker exists after the refusal).
   The guide's value-guard paragraph names the template guard, and its framing no longer says admitted values run no code on their own: the types run none and the guards keep a value or a key from doing so.
   Reverts (promptfoo suite failures, of 3306): guard removed 290; only `{{` tested 128; only `{{` and `{%` 64; array elements skipped 144; the guidance test fails (1) for each, and 3 for the guide sentence removed.
   With the guard removed the live starter prints a `fail` row quoting stdout and the marker exists (checked directly); with it, the refusal fires and the marker exists, since promptfoo had already run the code.
2. Adversarial 2 (medium, a pre-existing defect found on the way): `weight: 0`.
   Reproduced: `contains figs` with `weight: 0` against an output without `figs` returned a component `pass: true` with the failure text as its reason.
   Both evaluators refuse `weight` equal to `0`, naming the type and the reason (a zero weight turns a failed assertion into a pass); `weight: 1`, `0.5`, `2`, the string `'0'`, `null` and an absent weight stay admitted.
   Tests: units in both placements (string and array assertions, third of three, second result, `not-` form), the rendered starter (payloads and live), live promptfoo in `resultShapes`.
   Reverts: guard removed 18; refusing any falsy weight 2496 (the run aborted at 3287 checks); refusing a weight below 1 48; the guidance test fails (1) each.
3. Compliance 1 (medium): an invalid `regex` pattern became a `fail` row.
   Reproduced: `regex` with `[`, and `not-regex` with `(`, return a graded `pass: false` `Invalid regex pattern: ...`.
   Both evaluators compile a string `value` of a base type `regex` with `new RegExp` (the call promptfoo's handler makes, no flags) and refuse a pattern that throws, naming the type and that the pattern does not compile; other types take the same text as a literal, and a non-string value is left to promptfoo.
   Tests as for finding 2, plus `contains` with `[` admitted in the units and the rendered starter.
   Reverts: guard removed 82; applied to `regex` only 40; applied to every type 40 (the guidance test fails for that one once the literal-bracket case exists); the guidance test fails (1) each.
4. Compliance 2: the CHANGELOG entry says which refusals run through promptfoo itself (`javascript`, `file://boom.py`, `transform`, template, `weight: 0` and invalid `regex`) and which through the fixture and the rendered starter, and lists the three new refusals in plain words.
5. Compliance 3: the parenthesis in `test-design-epic-1.md` around the Story 1.43 note matches `epics.md`.
6. Compliance 4: the AC 2 departure is in this record, and a dated clause is on the AC in `epics.md`.
7. Test quality 1 (low): `allowList` pins the ten specified types as a literal list that each export must equal, apart from the installed enumeration, and derives the types to refuse from the installed `BaseAssertionTypesSchema.options` minus that list.
   Reverts: `is-json` replaced by `similar` in the fixture only 7, in the starter only 11, in both files 14 (it passed before).
   The refusal blocks are compared byte for byte by one unit (a comment added in the fixture only: 1 failure), and the fixture's `transform` throw is wrapped as the starter's is (compliance 5).
8. Builder Analyze (Fixed): architecture 1 (the section framing and the starter comment name a grade the target did not earn), leanness 1 (the Function-constructor parenthetical is cut from the guide and stays in the code comment), enhancement 1 (the template refusal and the guide name the regex route for literal braces), enhancement 2 (the regex and weight refusals name their repair).

### Skipped

- Builder enhancement 3 (low, report every violation at once): the refusal contract is single-error, and every precedence test reads the first violation.
- A `run` case through `tea-evaluate run` for each new refusal: the fixture maps by type and value, so it refuses these results at `assertionKey` even without the guard; the live promptfoo case in `resultShapes`, the starter in process and the live rendered-starter case carry the revert.

### Gates

Green on the last state of the tree (see the list in Gates, rerun after this round).
Measured local wall time before this round and after it (machine under load, other lanes running): see the Gates section.

## Left undone, reported

Nothing.
No finding is left that this change does not close.
