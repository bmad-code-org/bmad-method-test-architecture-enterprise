# Corpus: bmad-testarch-evaluate

The target is TeA's Evaluate skill, run by the generic skill runner over `src/workflows/testarch/bmad-testarch-evaluate/` with the read-only capability. Each request asks one stage one question and holds the reply to one JSON object through claude's `--json-schema` flag, passed by the runner's `--agent-arg`. The answer fields are what the oracles read; the free-text `basis` field is declared volatile. The `status` field is the skill's claim to have answered or refused, and every oracle reads it beside the answer fields.

## Probes

| Probe | Section            | Behavior | Class       | Route               | What it seeds                                                                              |
| ----- | ------------------ | -------- | ----------- | ------------------- | ------------------------------------------------------------------------------------------ |
| P-001 | `[representative]` | B-001    | zero-action | clean-control       | Nothing: exit 11 is evaluation weakness, exit 12 infrastructure                            |
| P-002 | `[representative]` | B-001    | defect      | controlled-mutation | M-001: the exit 11 row of the exit table reads infrastructure                              |
| P-003 | `[held-out]`       | B-001    | defect      | controlled-mutation | M-002: the exit 12 row of the exit table reads evaluation weakness                         |
| P-004 | `[representative]` | B-002    | zero-action | clean-control       | Nothing: a web application with no AI features is `ai-feature` over `api`                  |
| P-005 | `[representative]` | B-002    | defect      | controlled-mutation | M-003: the sentence that states the web-application rule names the `web` interface kind    |
| P-006 | `[representative]` | B-003    | zero-action | clean-control       | Nothing: Stage 11 lists all thirteen exit table rows with a class the table uses           |
| P-007 | `[representative]` | B-003    | defect      | controlled-mutation | M-004: the `tea-evaluate 13` row is gone, so Stage 11 lists twelve rows                    |
| P-008 | `[malformed]`      | B-004    | zero-action | clean-control       | Nothing: a request whose prompt has the wrong type names no exit, and gets no class        |

`P-003` is listed in `evaluation.json` `heldOutProbes`. The gap loop reads it only through `gap-view.json`.

## Contract coverage

The four engine rules that Story 1.16's run left unsatisfied are closed in the contract, each with the step and oracle that closes it.

- **`success-indicator-separation`:** the operation nominates `/status` as its success indicator and gives the answer fields their own roles. Every oracle reads `status` and an answer field in both its direction and its check.
- **`malformed-input`:** the step `refuse-no-exit` binds the `type-violating` matcher on the declared string key `stdin.prompt`, and O-004 addresses it. The request the skill receives is `{"prompt":42}`, which names no command and no exit.
- **`per-record`:** the operation declares `/exits` as a collection location, and O-003 quantifies over it with `for-all`, testing each record's class.
- **`omission-and-completeness`:** that location names the reference set `exit-table`, which holds the thirteen ids of the exit table in `references/gaps.md`, and O-003 reconciles the records against it with `covers-by-key`. `test:evaluate-dogfood` holds the set equal to the table.

## Single source of the web-application rule

The web-application rule is stated once in the skill: the sentence in `references/inspection.md` that sends a web application to `ai-feature` reached as `api`. `references/adapters.md` no longer restates it, and the guidance test fails when a second statement appears. M-003 edits that one sentence, so the rule cannot survive the mutation and P-005 qualifies. B-002 has no held-out probe: P-003 is the held-out probe of the folder, and one mutation of a single sentence does not give a second, independent seed for the same rule.

## Refused and uncovered

- **B-004 seeded probe: refused.** The refusal comes from the request naming no exit, and no sentence of the skill states it, so no edit of one guide removes it. A mutation would have to add text, and `replace-exact` changes existing bytes only.
- **Gameability: not required.** Every oracle is an exact check over named JSON fields or a reconciliation against a declared set; no rubric or judgment-based relation governs a behavior.
