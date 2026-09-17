# atdd-eval fixtures

Fixture corpus for the `bmad-testarch-atdd` behavioral eval.

```text
reservations/   quay-locker-service: a small HTTP service with one existing route
                (GET /lockers/{id}) and one story, docs/stories/4-2-reserve-a-locker.md,
                that adds reservations. Nothing the story asks for is implemented.
cases/          hand-authored generated-scaffold sets, one per outcome the suite has to
                tell apart, each executed once to capture test/replay/atdd/'s stored reports
ground-truth.json   the five criteria, each with the failure pattern a scaffold that reads
                    the story correctly produces against the unimplemented service
```

## What this corpus is for

The manifest carried `bmad-testarch-atdd` under `deferred`: fragment selection measured which
knowledge a run loads, and nothing executed the tests a run generated, so nothing showed they
fail before implementation for the intended reason. `cli/atdd-red-check.js` is that execution,
and this corpus is what it is measured against.

Four of the five criteria ask for a route the service does not have, so a scaffold that reads
the story correctly fails with Playwright's own `Expected: <value>\nReceived: 404` shape. The
fifth, AC-5, extends a route the service already has, and a scaffold that asserts only what the
route already returns passes without any implementation at all: the vacuous-pass trap this suite
exists to catch, carried by the fixture design rather than stated as a fact about any run.

## `cases/`

Eleven hand-authored scaffold sets, each one deviation from a correct run:

```text
correct-run       all five criteria, each failing with its own declared pattern
vacuous-pass      AC-5's scaffold asserts only the status code, which already passes
wrong-reason-red  AC-1's scaffold asserts the wrong expected value; still red, wrong reason
load-error        a syntax error; the file never parses and no test in it ever runs
still-skipped     AC-4 uses test.fixme(), which activation's test.skip() replacement does not touch
not-mapped        every criterion covered, plus one scaffold naming no criterion's id
criterion-id-on-describe
                  every criterion id appears only on a parent describe title, leaving every
                  executable leaf test unmapped
setup-assertion-masks-target
                  AC-2 and AC-4 assert an unimplemented prerequisite before their own promise,
                  so neither reaches its criterion-defining assertion
baseline-ac5-branch
                  AC-5 checks the baseline false branch while the intended red-phase scaffold
                  exercises the active-reservation transition named by the criterion
e2e-operation-masks-target
                  a real browser interaction times out before the criterion-defining assertion,
                  producing a deterministic non-assertion exit
broad-object-assertion-masks-target
                  AC-5 compares the complete locker object before directly asserting the new
                  reserved property, so the object diff cannot match the criterion's exact promise
```

Each is executed once through `cli/atdd-red-check.js` against a fresh copy of `reservations/`,
and the resulting `test-artifacts/atdd-red-report.json` is stored under
`test/replay/atdd/<case>/`, which `test/eval-atdd.js`'s scorer and `test/test-eval-replay.js`
both read with no re-execution. A production-mutation case needs no scaffold of its own: it is
the stub agent's own `mutate` mode editing a file under `reservations/src/` after it writes a
correct set of scaffolds, scored by the harness's before/after digest of the staged workspace
around the generation step, the same digest `test/eval-nfr.js` takes around an evidence bundle.

## Rules for anyone editing this directory

- Do not repair, extend, rename, or reformat `reservations/`'s existing behavior. The suite
  measures a run against exactly what this service does and does not do today.
- `ground-truth.json` is authored from the story and from the fixture's own routes, never from a
  run's output. If the story or the service changes, re-derive every declared pattern by reading
  the fixture, and re-capture every stored report under `test/replay/atdd/`.
- A test maps to a criterion by carrying its id, `AC-<n>`, in its title, which is the workflow's
  own convention in every scaffold example its step files show.
- No fixture file states which criteria the service does or does not support. The measurement is
  whether a run reads the story and the fixture and reaches the same conclusion unprompted.
