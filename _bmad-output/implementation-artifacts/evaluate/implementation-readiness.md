# Implementation Readiness: Evaluate

Date: 2026-09-22. Scope: `_bmad-output/planning-artifacts/evaluate/` (`SPEC.md` and companions, `ARCHITECTURE-SPINE.md`, `epics.md`, `test-design-epic-1.md`, `test-design-epic-2.md`).

## Verdict

**PASS**, after the gaps below were fixed in `epics.md`, the two test designs and AD-11 during this check and its review.

## What Was Checked

| Question | Result |
| --- | --- |
| Every capability has a story | CAP-1 to CAP-12 each trace to at least one story (`epics.md` FR Coverage Map and Traceability) |
| Every story traces back to recorded intent | Each story cites a CAP or an AD, except Story 1.2, an enabling story that puts TeA's gate on the engine build every later story needs |
| No forward dependencies | Every entry in the Epic Dependencies table points at an earlier story; Epic 2 depends only on Epic 1 |
| Every AD the stories rely on has an owning story | AD-1 to AD-20 checked; AD-5's seven subcommands land in 1.4 (`check`, `digest`), 1.6 (`preflight`), 1.8 (`run`, `score`), 2.1 (`compare`) and 2.2 (`ci`) |
| Acceptance criteria agree with the spine | One contradiction found and fixed (gap 3); exit codes 10 to 13 and 64 match the AD-10 table |
| Every story has a test plan | Each of the 21 stories has a coverage section with revert checks in its epic's test design |
| UX | None needed: Evaluate has no graphical interface |

## Gaps Fixed

1. **`score` diagnostics were never captured (Story 1.8).** AD-10 classifies a `score` exit 3 from "`score` diagnostics captured to `runs/`", and AD-12 lists them in the evidence bundle. Story 1.8 now persists each `score` call's exit code, stdout and stderr under `runs/<invocationId>/`, keyed by probe ID so the Invalid case (no evidence artifact) is covered. A shim with distinct bytes per stream is the revert check, and the omitted-manifest case asserts a non-empty stderr and no artifact.
2. **Nothing consumed those diagnostics (Story 1.14).** `gaps.md` now reads the persisted `score` diagnostics for a `score` exit 3, and the guidance test asserts it. The same story now runs `npm install --prefix` before `npm exec --prefix`, as AD-20 states.
3. **Fixture runs were recorded dirty, contradicting AD-8 (Stories 1.4, 1.7, 1.10, 1.11).** Story 1.7 made every non-git temp copy `dirty: true`, so Story 2.1 would refuse the fixture baselines Story 2.5 needs. The `evaluation.json` schema gains a `workspace` field (`git` or `copy`), only `--from-working-tree` records `dirty: true`, both fixtures declare `copy`, and a `test:evaluate-mutation` case holds it.
4. **Gate outputs had no owner (Stories 2.2, 2.4; AD-11).** AD-12 lists gate outputs in `runs/`, and the plan schema allowed only `tea-evaluate` commands. A plan check now has kind `evaluate` or `gate`, Story 2.4 adds each adopted gate as a `gate` check, and `tea-evaluate ci` persists every check's exit code, stdout and stderr, held by a byte-equality `test:evaluate-ci` case. AD-11 carries the one-clause amendment.

## Tracking Notes

- `sprint-status.yaml` lists 2 epics and 21 worker stories in `epics.md` order. Story 1.1 is `in-progress`, matching `story-1.1.md`; every other story is `backlog`.
- The file lives at `_bmad-output/implementation-artifacts/evaluate/sprint-status.yaml`, as the coordinator directed. `/bmad-build` syncs `{implementation_artifacts}/sprint-status.yaml`, which resolves to `_bmad-output/implementation-artifacts/sprint-status.yaml`, so workers do not update this file on their own. The coordinator either passes this path to each worker or syncs statuses itself.
- `sprint_plan.py` upgrades a story from disk only for a file named `<story-key>.md`. The Story 1.1 worker wrote `story-1.1.md`, so that upgrade does not fire for it.
- Story H.1 is owner-only. It sits under a top-level `owner_handoff` key outside `development_status`, so no worker picks it up. A regeneration by `sprint_plan.py` keeps it, except with `--fresh`.
- Story 1.1 runs in the eval-quality repository; its status is still tracked here.
