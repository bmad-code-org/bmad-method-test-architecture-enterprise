# Corpus: bmad-testarch-test-review

The target is TeA's test-review mechanism: the `tea-test-review` CLI driving the `bmad-testarch-test-review` skill with Claude Code.
The registry entry is `test/fixtures/test-review-evaluation/review-fixture.mjs`, an adopter-owned wrapper.
It reads one JSON request on stdin, builds a temporary git repository from a synthetic fixture under `test/fixtures/test-review-evaluation/repos/`, and runs the workspace's own `cli/test-review.js` against it with the workspace's own skill.
The CLI's exit code and verdict JSON pass through unchanged, so every oracle reads what an adopter's CI reads.
Every fixture is a small Python and pytest repository; none holds adopter code, report text or a repository name.

## Steps

- `beside-old` reviews the `beside-old` fixture: branch tip against `main`. One clean test appended to a file with an old hard wait, an old conditional assertion and an old shape-only assertion.
- `adds-defects` reviews the `adds-defects` fixture: branch tip against `main`. Six tests appended to an existing file: two hard waits, the H3 pair, the H10 pair; the repository's CI runs mypy.
- `merge-review` reviews the `merge-review` fixture: merge commit after `main` moved. One test appended to an existing file whose only assertion compares a value with itself.
- `setup-change` reviews the `setup-change` fixture: branch tip against `main`. One changed setup line that makes an unchanged assertion compare a value with itself.
- `full-file` reviews the `full-file` fixture: `--files`, no diff. Twelve tests, each seeding one defect: C1, C3, C4, C5, C6, H1, H2, H3 (swallowed failure), H4, H10, H3 (loop that runs zero times), M3.

## Probes

| Probe | Section            | Behavior | Class       | Route               | What it seeds                                                                         |
| ----- | ------------------ | -------- | ----------- | ------------------- | ------------------------------------------------------------------------------------- |
| P-001 | `[representative]` | B-001    | zero-action | clean-control       | Nothing                                                                               |
| P-002 | `[representative]` | B-002    | zero-action | clean-control       | Nothing                                                                               |
| P-003 | `[representative]` | B-002    | defect      | controlled-mutation | M-001: `classifyFinding` treats no reported line as changed                           |
| P-004 | `[boundary]`       | B-003    | zero-action | clean-control       | Nothing                                                                               |
| P-005 | `[negative]`       | B-004    | zero-action | clean-control       | Nothing                                                                               |
| P-006 | `[representative]` | B-005    | zero-action | clean-control       | Nothing                                                                               |
| P-007 | `[boundary]`       | B-006    | zero-action | clean-control       | Nothing                                                                               |
| P-008 | `[boundary]`       | B-007    | zero-action | clean-control       | Nothing                                                                               |
| P-009 | `[negative]`       | B-008    | zero-action | clean-control       | Nothing                                                                               |
| P-010 | `[representative]` | B-009    | zero-action | clean-control       | Nothing                                                                               |
| P-011 | `[held-out]`       | B-002    | defect      | controlled-mutation | M-002: `applyFindingProvenance` gives introduced findings no verdict impact           |

`P-011` is listed in `evaluation.json` `heldOutProbes`.

## Before state

The confirmed requirements expect these clean controls to fail on the release this evaluation was authored against: P-001 (old-line findings in a pull request review), P-007 (H3 on a redundant branch), P-008 (H10 on a type-checked covariance test) and P-010 (no `reviewMode` field).
Their `noKnownDefectStatement` says so.
The first live run records that state and is not accepted as a baseline.

## Seeded defects and refusals

Both mutations sit in `cli/lib/diff-evidence.js`, the single source of line provenance, and both surface on the `adds-defects` step as an `Approve` recommendation: the introduced hard waits no longer gate.
Each mutated arm repeats every step of the plan with a live review, so the corpus seeds B-002 alone, the gate itself, and refuses a seed for the other behaviors to keep a run within the confirmed time budget.

- **B-001, B-003, B-004, B-005: refused.** Each would need its own mutated arm, three more live trials of all five steps. The clean controls still measure each behavior on every trial.
- **B-006, B-007: refused.** The defect these behaviors guard against is present at this revision; a seed would add a second copy of it.
- **B-008: partly refused.** The verdict JSON carries findings but no criteria table, so an inapplicable criterion rendered as a pass and a duration marked PASS from a static read are visible only in the Markdown report, a written file. O-008 reads what stdout carries: no finding under a Playwright-utils or Pact row. The table half becomes observable once the verdict carries criterion statuses.
- **B-009: refused.** The before state already fails its clean control.

## Line locations

Oracles locate a finding by its `line` within the span of the test that seeds it, from its decorator or `def` line to its last line.
A finding counts by row and location; a title or keyword establishes nothing.
H4's span also includes the module-level `SEEN_CODES = []` line, since a reviewer may cite the shared state where it is declared.

## Gameability: not required

Every oracle is an exact check over named fields of the verdict JSON and the exit code; no rubric or judgment-based relation governs a behavior.
