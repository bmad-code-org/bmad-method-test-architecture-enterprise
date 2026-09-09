# trace-eval fixtures

Fixture corpus for the `bmad-testarch-trace` behavioral eval. Two independent fixture sets, each a small slice of the same fictional product, Tidewater Support Desk.

```text
seeded/   an epic with ten acceptance criteria, its tests, a recorded live
          verification file, and a waiver register
clean/    an epic with five acceptance criteria and its tests
```

Each set is a separate coverage oracle with its own gate decision. Trace one set per run. Combining the two changes every coverage percentage, and the expected answers in `ground-truth.json` are stated per set.

## Rules for anyone editing this directory

- Do not repair, extend, rename, or reformat a fixture file. The harness measures a trace run against these exact files, so an edit silently moves the benchmark. That applies to both sets, whatever a file appears to need.
- `ground-truth.json` is authored from the fixture design, never from a run's output. If a fixture changes, re-derive every line span in it by reading the files.
- Do not put `ground-truth.json` into the context handed to the agent under evaluation.
- No fixture file states what its own coverage establishes or fails to establish. That is deliberate. The measurement is whether a run reads the evidence, and a note in the file would hand it the answer. Keep any new commentary neutral.

## Running the workflow against a set

Point the workflow's `test_dir` at the set's `tests/` directory and its `source_dir` at the set's `src/` directory. For `seeded/`, `test_artifacts` must resolve to `seeded/test-artifacts/` so the recorded live verification file is read. The epic document names both artifact paths, so an agent that reads the epic finds them either way.

## What `ground-truth.json` declares, and what reads it

Every top-level key in the ground truth is read by `test/eval-trace.js`. `fixtureSets` is the corpus itself. `skillRuleCitations` is checked against the step files it cites. `negativeControls` names three things a run must not do, and each id has a row in the harness's `NEGATIVE_CONTROL_ENFORCEMENT` table naming the threshold that catches it; a control with no row fails `--validate-only`. `rejectedCases` names four cases the corpus deliberately leaves out, and each id has a predicate in `REJECTED_CASE_EXCLUSIONS` that every fixture set is held to; a set that carries a rejected case fails the same way. `expectedTestInventory` on each set is recomputed from the evidence entries and compared, like `coverageArithmetic`. `mustNotReport` and `commonFalsePositives` on each set are documentation for whoever adjudicates a false positive later, and the ground truth's own comment says so.

One case the corpus leaves out has nothing a check could read, so `rejectedCases` carries only the four a predicate can check and this one is recorded here: a test-quality defect planted inside a covering test, such as a hard wait. It would make the expected coverage status depend on how strictly a run applies the checklist's quality section, which is a different contract, and coverage and quality would become entangled so that neither number meant anything on its own. The fixtures are deliberately clean on test quality for the same reason, which is what the `test-quality-out-of-scope` negative control states.

## What the harness scores deterministically, and what needs judgment

These are functions of a run's output and the corpus, and each has a check in the harness:

- Every criterion id in the oracle document appears in the matrix exactly once, and no id outside it appears.
- Every reported coverage status is inside the five-value enum.
- `coverage.inventory` and `coverage.priority_breakdown` match the counts and percentages recomputed from `criteria[].trueCoverage`, and each percentage equals `round(covered / total * 100)` with an empty priority resolving to 100.
- `gate_status` is the decision Rules 1 to 5 produce from those percentages, `gate_criteria` carries the thresholds and the statuses they give, and `gate_basis` is `priority_thresholds` for both sets.
- `risk_summary` matches the gap buckets, `coverage.by_level.*.criteria_covered` matches `byLevelCriteriaCovered`, and `tests.files`, `tests.cases` and `coverage.by_level.*.tests` match `expectedTestInventory`.
- `collection_status` is `COLLECTED`, the oracle block names the epic as its source, and the run metadata step-05 fixes has its fixed values.
- The recommendations name every criterion in the critical, high and partial buckets.
- Every evidence citation resolves to a span this file records for that criterion, within `evidenceLineTolerance`, and the one rejected test is named in `rejected_evidence`.
- For the seeded set, `live_evidence.counted` is 0, `invalid` is 1, `requirements_live_only` is 0, and both live records appear in `blockers` at the declared severities; for the clean set, `blockers` is empty and `live_evidence.present` is false.
- The waiver block reports W-1 valid and W-2 invalid with every check id the corpus records a violation against, and is absent on the set with no register.

These need a reading of the evidence against a sentence, and the corpus exists to measure whether a run makes them:

- The per-criterion coverage status. Deciding that the test titled for AC-2 does not establish AC-2, and that the AC-8 test establishes only half of AC-8, is the judgment everything in the list above is a function of.
- Mapping AC-4 in the clean set to two tests that never name it.
- Whether W-2's stated reason is a business justification or technical convenience, whether its approver holds authority, and whether a P0 authorization criterion counts as security for the no-security-waiver rule. The harness checks that the run reached each of those conclusions; reaching them is the semantic step.
- Whether a gap recommendation is specific enough to act on. Nothing scores this.
