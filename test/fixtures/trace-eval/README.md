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
