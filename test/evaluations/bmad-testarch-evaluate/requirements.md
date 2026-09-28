# Requirements statement: bmad-testarch-evaluate

## What must be proven

Evaluate's guidance, followed by an agent, produces the decisions SPEC.md names. Stage 11 keeps the failure classes apart: it names the AD-10 class its exit table assigns to a failed `tea-evaluate` command, so exit 11 is an evaluation weakness and exit 12 an infrastructure failure (B-001, material; SPEC CAP-10 and CAP-11). Stage 1 maps a web application to interface `api` through its HTTP surface and never emits `web` (B-002, critical; SPEC CAP-1 and the interface-kind constraint).

## Admissible evidence

The skill runner's stdout and exit code are admissible. Each request asks for fixed answer lines, and an oracle reads the whole answer line, so a class or interface kind mentioned elsewhere in the prose establishes nothing. Files the skill writes are out of scope; the runs are read-only.

## Interfaces and resources in scope

Use TeA's generic skill runner over `src/workflows/testarch/bmad-testarch-evaluate/`, run from a disposable copy of this repository with `_bmad/` and `node_modules/` provisioned read-only. The agent may read the skill and the repository copy and may not write, run commands or reach any other service. The evaluation folder stays out of the copy.

## Boundary conditions

Ask about adjacent exits in one request, exit 11 and exit 12, since they share a runtime and differ only by class; a mapping that collapses them must fail. Describe the web application with no AI features, so the classification rests on the web-application rule alone. The witness pair changes only the exit code, 11 against 10.

## Operational constraints

Live legs run through the local Claude Code CLI on the owner's subscription, with no API key and no spending approval. The model `claude-sonnet-5` is a fixed condition. Each runner call has a 300 second ceiling inside a 360 second registry limit, at most two plan steps per trial, and the environment keys `HOME`, `USER` and `LOGNAME` with no recorded value. The evaluation runs from the working tree (`--from-working-tree`), so the run is recorded as dirty.

## Feared or observed failure modes

The exit table has been edited by hand and drifted before: Story 1.14's review removed and restored a row, and a class swap could pass the guidance gate until that gate read AD-10. A swapped class sends an adopter to rerun infrastructure when the evaluation itself is weak, or the reverse. An agent may also answer `web` for a web application, or a guide change may leave a stage answering from general knowledge.

Confirmed by: the TEA maintainer for Story 1.16, answering from `_bmad-output/planning-artifacts/evaluate/SPEC.md`, 2026-09-28.
