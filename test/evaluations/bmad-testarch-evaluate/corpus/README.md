# Corpus: bmad-testarch-evaluate

The target is TeA's Evaluate skill, run by the generic skill runner over `src/workflows/testarch/bmad-testarch-evaluate/` with the read-only capability. Each request asks one stage one question and holds the reply to one JSON object through claude's `--json-schema` flag, passed by the runner's `--agent-arg`. The answer fields are what the oracles read; the free-text `basis` field is declared volatile.

## Probes

| Probe | Section            | Behavior | Class       | Route               | What it seeds                                                             |
| ----- | ------------------ | -------- | ----------- | ------------------- | ------------------------------------------------------------------------- |
| P-001 | `[representative]` | B-001    | zero-action | clean-control       | Nothing: exit 11 is evaluation weakness, exit 12 infrastructure           |
| P-002 | `[representative]` | B-001    | defect      | controlled-mutation | M-001: the exit 11 row of the exit table reads infrastructure             |
| P-003 | `[held-out]`       | B-001    | defect      | controlled-mutation | M-002: the exit 12 row of the exit table reads evaluation weakness        |
| P-004 | `[representative]` | B-002    | zero-action | clean-control       | Nothing: a web application with no AI features is `ai-feature` over `api` |

`P-003` is listed in `evaluation.json` `heldOutProbes`. The gap loop reads it only through `gap-view.json`.

## Refused and uncovered

- **B-002 seeded probe: refused.** The web-to-`api` rule is stated three times in the skill: the prose and the mapping table of `references/inspection.md`, and the prose of `references/adapters.md`. A `replace-exact` mutation changes one occurrence in one file, so the rule survives it and the probe could not qualify. Seeding it needs the rule stated in one place first.
- **B-002 held-out probe: none.** A held-out probe is a non-clean probe, and B-002 has no qualifiable seed for the reason above.
- **Negative and malformed inputs: none yet.** An exit the table does not list, or a request naming no exit, would test that Stage 11 refuses to guess a class. The run records this as an uncovered section.
- **Gameability: not required.** Both oracles are exact equality checks over named JSON fields; no rubric or judgment-based relation governs either behavior.
