---
title: 'Story 2.6: Document Evaluate for the people who use it'
type: 'feature'
created: '2026-10-07'
status: 'done'
baseline_commit: '2421c294'
route: 'dispatch'
review_loop_iteration: 2
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules and Story 2.6)'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-2.md (Story 2.6)'
  - '_bmad-output/planning-artifacts/evaluate/SPEC.md'
  - '_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md'
---

## Intent

**Problem:** The Evaluate documentation described the build.
`docs/reference/tea-evaluate-cli.md` mixed the user reference with design rationale and build names, `how-tea-is-tested.md` called Evaluate "in progress", and no page took a reader from a first evaluation to CI.

**Approach:** Write the pages an adopter needs in the site's Diataxis sections, one tutorial, eight how-to pages and two explanation pages, rewrite the CLI reference as a user reference, describe Evaluate as shipped in the existing pages, and hold the result with three checks in the `npm test` chain.
Every command, flag, exit code and output in new prose comes from a real run of the merged CLI.

## Boundaries & Constraints

- `docs/` names no story, decision id, requirement id, epic narrative, lane, pull request or planning path.
- The reference keeps the headings and sentences that suites pin, or the suite reads the page that now holds them.
- The reference's `### File-system confinement` heading stays, because `cli/lib/evaluate/registry.js` links its anchor.
- The LLM bundle stays under 600,000 characters; the pages that carry long material join the exclusion list in `tools/build-docs.js`.
- The owner reads the pages before the pull request merges.

## Code Map

- `docs/tutorials/evaluate-your-first-skill.md`: the tutorial over `test/fixtures/evaluate-tutorial/`, a skill target with a stub agent, one seeded probe, two clean controls and a baseline recorded by `compare --accept`.
- `docs/how-to/evaluate/*.md`: evaluate a skill or agent, an MCP tool server, an HTTP API; choose an evaluator and calibrate a judge; read the gaps and fix them; compare runs and accept a baseline; put an evaluation in CI; bring an existing suite.
- `docs/explanation/how-evaluate-works.md` and `why-evaluate-confines-the-target.md`: the stack, what TeA owns, oracles and evaluator kinds, held-out probes and calibration, gameability, the arms and rollback, confinement, and how CI placement is derived.
- `docs/reference/tea-evaluate-cli.md`: each command's purpose, options, exit codes, output and one example, the `evaluation.json` fields, and "Where the runner lives".
- `test/test-docs-tutorial.js` with `test/lib/docs-tutorial.js`, `test/test-docs-evaluate-sidebar.js`, `test/test-docs-build-names.js`, and `test/lib/docs-pages.js` for the suites that moved their reads.
- `tools/validate-doc-links.js` slugs headings as the site does.
- `src/workflows/testarch/bmad-testarch-evaluate/assets/evaluation.json`, `references/adapters.md`, `harness.md` and `ci.md` register the runner by its path inside `launch.root`.

## Premise Check

- The plan's wording says the scan "fails on any match" of story numbers, `AD-` identifiers, epics, sprints, lanes and the relay.
  The bare words epic, story, sprint and relay are ordinary words in TEA's user documentation (BMad Method stories, the sealed-brief relay), about 130 uses.
  The check scans the build forms (`Story 1.42`, `AD-10`, `CAP-11`, `NFR9`, a line of epic narrative, `epics.md`, planning paths, pull request numbers, review-process words) and each pattern fails on its own example.
- The plan's tutorial runs "against a fixture shipped in the repository".
  None of the existing fixtures was a runnable skill evaluation (one had no seeded probe, one needed an uninstalled dependency, one was a 15 MB test-review mechanism), so the story authored `test/fixtures/evaluate-tutorial/` and gave it the pr-tier wiring every fixture has.

## Revert Observations

| Criterion                                         | Mutation                                                                                                                            | Result                                                       |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Pages linked from the sidebar and the overview    | remove one sidebar entry, remove one overview link, add an unlisted page, add a dead slug                                           | `test:docs-evaluate-sidebar` fails each                      |
| No build names                                    | append "Story 1.42", "AD-10", "NFR9 and CAP-11", a planning path, "Lane 3", a pull request number to a copy of a page               | `test:docs-build-names` fails each                           |
| Tutorial commands run                             | change a flag, misspell a subcommand, change or drop a key line, relabel or empty a key block, edit a quoted file or registry entry | `test:docs-tutorial` fails each (12 revert cases)            |
| Moved reference sentences stay held               | remove 12 pinned sentences from their new homes, plant old sentences                                                                | the pinning case fails each                                  |
| Reference lists every command's options and exits | remove a documented exit or command                                                                                                 | `test:doc-claims` fails                                      |
| Evaluate described as shipped                     | restore "In Progress" wording                                                                                                       | `test:docs-build-names` and the doc-claims page entries fail |

## Review Round 1

Three Opus lenses found 24 defects and a fourth check (re-homed assertions) found none; each was fixed in the pull request.

- Reference accuracy (7): the example `evaluation.json` could not produce the outputs the page quoted and its runner target made `score` exit 3; a false sentence that the runtime checks no citation; two claims about host services contradicted elsewhere; wrong wording for a strength vector, for the baseline and for runner exit 6; missing exit 64 pass-through entries.
- Tutorial and how-to accuracy (9): a failed qualification exits 11, not 3; the runner setup that keeps `score` from exit 3 was missing; an emptied key block passed the tutorial check; the skill how-to example reached `score` exit 3; a truncated output line; the `release` row over-stated blocking; the promptfoo example lacked `metric`; `not-comparable` omitted unreached oracles; a command printed another shape than shown.
- Structure and checks (8): a wrong how-to count in the CHANGELOG, `NFR9` in six lines, build-names patterns too narrow, a relabelled output block left a step unchecked, the sidebar check missed pages by path, bare `cd` broke later steps, one negation-then-correction sentence, and multi-sentence lines.
- Reproduced three times: a registry `target` that is the bare name `tea-skill-runner`, with TeA installed under `evals/node_modules`, makes `score` exit 3 ("mount outside allowlist") while `preflight` and `run` pass.
  The reference now gives both working setups (a path inside `launch.root`, or the bare name plus `systemPaths`), and the skill guide, the starter template and `references/ci.md` register the path.
  `references/ci.md` is pinned by both capture records, so the two live `ci-repos` sessions were rerun through the Claude Code CLI and both records regenerated.

## Review Round 2

Two Opus lenses found four defects, all fixed: the reference example's `target` did not match the `npm install --prefix evals` layout, an `adapters.md` sentence over-stated what the allowlist refuses, an unqualified sentence left in the confinement page, and two tutorial lines with two sentences.
The same review found four heading anchors that the site's slugger does not resolve because the link validator collapsed double hyphens; the validator now slugs as the site does and the five links are corrected.
CI found one more: `test:planning-doc-sources` holds each pre-existing `doc-counts` entry to what it read, and the README sentence "Twelve of the" had been reworded; the sentence and its entry are restored and the three new checks have their own list.

## Completion Notes

- The reference keeps its pinned behavior statements and moves the mechanism text to `why-evaluate-confines-the-target.md`; the 81 network claims are split 44 on the reference and 37 on the confinement page, and every moved assertion kept its pattern and its revert behavior.
- Pages added to the LLM bundle exclusion list: the tutorial and both explanation pages.
- The pull request waits for the owner's review of the pages before it merges.

## Verification

- `docs:validate-links`, `docs:build`, `lint:md`, `format:check`, `lint`, `test:doc-counts`, `test:doc-claims`, `test:doc-count-sources`, `test:planning-doc-sources`, `test:ci-coverage`, `test:ci-coverage-filters`, `test:shards` pass.
- The three new checks pass with their revert cases; `test:evaluate-pr-tutorial` passes.
- The suites that read the reference pass one at a time: guidance, check, ci, arms, api, mcp, workflow, mutation, partition-plans, evaluators, preflight, and the reference cases of the run suite.
- `test:evaluate-ci` and the seven `test:evaluate-ci-repositories` scripts pass over the regenerated capture records.
- CI carries the full `npm test` chain.
