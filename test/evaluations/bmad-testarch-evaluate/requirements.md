# Requirements statement: bmad-testarch-evaluate

## What must be proven

Evaluate's guidance, followed by an agent, produces the decisions SPEC.md names. Stage 11 keeps the failure classes apart: it names the AD-10 class its exit table assigns to a failed `tea-evaluate` command, so exit 11 is an evaluation weakness and exit 12 an infrastructure failure (B-001, material; SPEC CAP-10 and CAP-11). Stage 1 maps a web application to target kind `ai-feature` and interface `api` through its HTTP surface and never emits `web` (B-002, critical; SPEC CAP-1 and the interface-kind constraint). Stage 11 lists every exit its table holds and drops none, each with the class its row gives (B-003, material; SPEC CAP-10 and CAP-11). Stage 11 refuses a request that names no usable exit and gives it no class, as its gaps guide says (B-004, material; SPEC CAP-10).

## Admissible evidence

The skill runner's stdout and exit code are admissible. Each request holds the reply to one JSON object, and an oracle reads its named fields: `status`, the answer fields `exit11`, `exit12`, `targetKind` and `interface`, the `exits` array with each record's `id` and `class`, and the absence of `class` on a refusal. The exit table oracle also reads the `exit11` and `exit12` answers, as the class to match for the two records those exits name. The free-text `basis` field is never evidence. `status` is the skill's own claim to have answered or refused, so every oracle reads it beside the answer fields and accepts neither alone. A class or interface kind mentioned elsewhere in the prose establishes nothing. Files the skill writes are inadmissible, and the runs are read-only.

## Interfaces and resources in scope

Use TeA's generic skill runner over `src/workflows/testarch/bmad-testarch-evaluate/`, run from a disposable copy of this repository with `_bmad/` and `node_modules/` provisioned read-only. The agent may read the skill and the repository copy and may not write, run commands or reach any other service. The evaluation folder stays out of the copy.

## Boundary conditions

Ask about adjacent exits in one request, exit 11 and exit 12, since they share a runtime and differ only by class; a mapping that collapses them must fail. Describe the web application with no AI features, so the classification rests on the web-application rule alone. The witness pair changes only the exit code, 11 against 10. Ask for the whole exit table in one request, so a missing row shows as a missing record and a swapped class as a record whose class differs from its row. Send one request whose `exit` field is a value of the wrong type, so it names no usable exit and the skill has nothing to classify.

## Operational constraints

Live legs run through the local Claude Code CLI on the owner's subscription, with no API key and no spending approval. The model `claude-sonnet-5` is a fixed condition. Each runner call has a 300 second ceiling inside a 430 second registry limit, at most four plan steps per trial, and the environment keys `HOME`, `USER` and `LOGNAME` with no recorded value. The targets run unconfined (`confinement: false` in `evaluation.json`): the Claude Code CLI keeps its subscription login under the real home directory, a confined target's private home does not hold it, and the evaluation may not use an API key. The recorded runs execute from a committed, clean tree. A run with `--from-working-tree` records `dirty: true` and is never accepted as a baseline.

## Feared or observed failure modes

The exit table has been edited by hand and drifted before: Story 1.14's review removed and restored a row, and a class swap could pass the guidance gate until that gate read AD-10. A swapped class sends an adopter to rerun infrastructure when the evaluation itself is weak, or the reverse. A listing that swaps the classes of two rows passes a test of each class against the table's vocabulary, so each record is held to the class its own row gives. A dropped row leaves an adopter with no class for that source and exit. An agent may answer `web` for a web application, guess a class for a request that names no usable exit, or answer from general knowledge when a guide change leaves a stage without its rule.

Confirmed by: the TEA maintainer for Story 1.16, answering from `_bmad-output/planning-artifacts/evaluate/SPEC.md`, 2026-09-28, for B-001 and B-002. Story 1.46 added B-003 and B-004 on 2026-10-03, and they await the owner's confirmation at Story H.1.
