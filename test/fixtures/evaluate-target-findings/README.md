# Target findings fixtures

`flaws.json` names, for each target kind, the real fixture evaluation `test/test-evaluate-target-findings.js` runs and the target defect it plants in a copy of that evaluation's target:

- `skill`: the refund-check skill of `test/fixtures/evaluate-tutorial`, through `tea-skill-runner`. The planted defect is an ambiguous line in `skill/SKILL.md`; the tutorial's stand-in model (`model`, its `agent.js`) reads that line one way in one workspace, the way a model reads an ambiguous instruction differently across runs.
- `mcp`: the grader tool server of `test/fixtures/evaluate-mcp`. The planted defect makes `server/grader.js` reject the answer in one workspace.
- `api`: the grader HTTP service of `test/fixtures/evaluate-api`, an AI feature. The same defect in its `server/grader.js`.

`{{workspace}}` is the workspace label the defect fires in: `trial-clean-2` for a clean control that fails one trial of three, and `qualify-clean` for a clean control whose qualification baseline fails, so `run` stops at exit 11 before any score.
The test runs `tea-evaluate run` and `score` over the defect, drafts the target findings with `tea-evaluate target-findings`, records and decides them, removes the defect (the this-PR fix), reruns, and holds the measurement with `tea-evaluate check --ready`.
