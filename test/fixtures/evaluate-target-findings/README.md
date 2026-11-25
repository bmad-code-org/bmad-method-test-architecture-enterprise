# Target findings fixtures

One `target-findings.json` per target kind, as the adopter left it after the Stage 11 decision point, with the handoff its `new-pr` findings name.
`test/test-evaluate-target-findings.js` copies each beside a temporary copy of a real fixture evaluation and runs `tea-evaluate check` over it:

- `skill/` beside `test/fixtures/evaluate-tutorial/evaluation` (the refund-check skill, through `tea-skill-runner`);
- `mcp/` beside `test/fixtures/evaluate-mcp/evals/grader` (the grader tool server over stdio);
- `api/` beside `test/fixtures/evaluate-api/evals/grader` (the grader HTTP service, an AI feature).

Every finding cites the development run `20261125T100000000Z-0a1b2c3d` and its score `20261125T100100000Z-0a1b2c3d`.
The test writes that run from the evaluation's accepted baseline, adding the isolation path and the interpretation finding the findings cite, so `check` resolves every citation against evidence on disk.
Each `this-pr` finding is measured from that run to the evaluation's accepted run, the rerun that carried every applied change.
