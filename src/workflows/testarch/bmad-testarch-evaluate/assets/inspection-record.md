# Inspection record: reservation review skill

## Target and scope

- Adopter-owned target: `skills/reservation-review/`, a skill that reads a reservation request and emits a decision.
- Ambiguity resolved with the adopter: the skill invokes tools, but the behavior under evaluation is the skill's final decision and tool trajectory, not a standalone tool server.
- Evaluation ID: `reservation-review`.

## Entry points

- Activation: `skills/reservation-review/SKILL.md`.
- Command: `tea-skill-runner --skill-root skills/reservation-review` with the request on stdin.
- Required configuration and environment keys: list names, never secret values.

## Behaviors

| ID    | Source                       | Observable promise                                             | Importance |
| ----- | ---------------------------- | -------------------------------------------------------------- | ---------- |
| B-001 | `SKILL.md`, eligibility step | Approve an eligible request and explain the cited rule         | material   |
| B-002 | `references/limits.md`       | Decline an over-limit request without attempting a reservation | critical   |

## Surfaces

| Behavior | Exit code               | stdout                     | stderr         | Response or tool result        | Written files    | Defect-signature channel                 |
| -------- | ----------------------- | -------------------------- | -------------- | ------------------------------ | ---------------- | ---------------------------------------- |
| B-001    | 0 on completed decision | Decision and rule citation | Runtime faults | Tool-call trajectory when used | Decision receipt | stdout                                   |
| B-002    | 0 on valid decline      | Decline and reason         | Runtime faults | Reservation call, if made      | Audit log        | stdout or the nominated tool-result body |

The contract may cite written files as evidence. An AD-19 defect signature addresses an exit code or a descriptor-nominated stream or response body. Refuse a seed when none can expose its effect.

## Existing tests

| Test                                | What it proves                          | Limit                                          |
| ----------------------------------- | --------------------------------------- | ---------------------------------------------- |
| `checks/reservation-review.test.js` | One eligible request contains `approve` | Keyword assertion misses a wrong rule citation |
| `checks/limits.snapshot.js`         | One decline's exact printed shape       | A snapshot can preserve a wrong decision       |

## Failure history

| Source                        | Observed failure                                     | Corpus consequence                                        |
| ----------------------------- | ---------------------------------------------------- | --------------------------------------------------------- |
| Issue 42, reverted limit edit | Over-limit request was approved                      | Seed a boundary fault in `references/limits.md`           |
| Earlier evaluation run        | All requests were declined and a loose oracle passed | Add a gameability probe against the always-decline answer |

## CI

Stage 12 appends this section as each inspection finishes.

- Existing CI: `.github/workflows/ci.yml` on `pull_request`; `nightly.yml` on `schedule` with `RESERVATION_MODEL_KEY`; required check `test` (the adopter's answer).
- Merge flow: squash merges after one review, no queue.
- Release flow: `release.yml` on `v*` tags, with `docs/RELEASING.md` naming the tag as the gate.
- Risk profile: one `critical` behavior, three trials over thirteen probes, a missed defect ships within a day.
- Tier exits: `pr` 0, `merge` 0, `release` 2 (returned to Stage 3).
- Hand-off status: done, or an open item such as a declined baseline or a missing `bmad-testarch-ci`.

Replace this worked record with the inspected target's facts and source paths. Record the selected target kind and interface in `evaluation.json` alone.
