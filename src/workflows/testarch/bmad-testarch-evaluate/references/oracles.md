# Oracles

Read the contract's behaviors and committed probes together. Give each behavior discharged by a defect or gameability probe exactly one oracle. Add a rubric only where judgment needs an anchored scale. Keep checks and calibration labels away from the sealed evaluator brief.

## One oracle per discharged behavior

`test/fixtures/evaluate-workflow/evals/records/contract.json` binds `B-001` to `O-001`. Its read-back observation proves that the created record can be retrieved. Bind each other discharged behavior through its own `oracles` array to exactly one oracle ID, as AD-19 requires. A rubric can supplement that oracle when a criterion needs judgment.

## Oracle relation choice

Choose `expects-hold` when the desired observation must satisfy the relation. Choose `expects-violation` when the desired observation must break it. Write `direction` for a sealed evaluator: polarity, relation, scope, negative domain and evidence targets in prose. A resampled identifier needs a relational comparison between the create and read-back observations. A fixed identifier would reject a valid run that minted a new one.

The workflow fixture provides a complete oracle for this relation. Adapt the step IDs to the adopter's plan before compiling.

<!-- example:oracle -->

```json
{
  "id": "O-001",
  "polarity": "expects-hold",
  "commentary": "Read-back finds the record made in this run under the ID that create returned.",
  "direction": {
    "polarity": "expects-hold",
    "relation": "all",
    "scope": "The create and read-back stdout observations in one arm.",
    "negativeDomain": "Read-back misses the record or returns another identifier.",
    "evidenceTargets": ["/interactions/create/stdout/id", "/interactions/read-back/stdout/id", "/interactions/read-back/stdout/found"]
  },
  "check": {
    "op": "all",
    "operands": [
      { "op": "equality", "operands": [{ "pointer": "/interactions/read-back/stdout/found" }, { "literal": true }] },
      {
        "op": "equality",
        "operands": [{ "pointer": "/interactions/read-back/stdout/id" }, { "pointer": "/interactions/create/stdout/id" }]
      }
    ]
  }
}
```

## Exact checks and evidence pointers

Name the channel and pointer every check reads. Command evidence can live at `/interactions/<step>/stdout/<field>`, `/interactions/<step>/exit-code`, or `/interactions/<step>/artifact/<id>`; MCP and HTTP use `response-body` and `response-status`. Read the adapter projection before choosing a pointer. An impossible pointer fails compilation with `unreachable-check-evidence`. The valid fixture declares both channels below.

<!-- example:oracle -->

```json
{
  "id": "O-001",
  "polarity": "expects-hold",
  "commentary": "The generation run exited cleanly and wrote its scaffold.",
  "direction": {
    "polarity": "expects-hold",
    "relation": "all",
    "scope": "The command exit code and named scaffold artifact.",
    "negativeDomain": "The command failed or left no scaffold artifact.",
    "evidenceTargets": ["/interactions/tea-atdd-runner-run/exit-code", "/interactions/tea-atdd-runner-run/artifact/scaffold"]
  },
  "check": {
    "op": "all",
    "operands": [
      { "op": "equality", "operands": [{ "pointer": "/interactions/tea-atdd-runner-run/exit-code" }, { "literal": 0 }] },
      { "op": "existence", "operands": [{ "pointer": "/interactions/tea-atdd-runner-run/artifact/scaffold" }] }
    ]
  }
}
```

## Semantic rubrics

Use a rubric for a question an exact predicate cannot settle. Give every scale level a concrete anchor. Each criterion asks one question and names a reachable evidence pointer. Name failure-mode penalties and bound the evidence length with `maxLength`. Judge observable output, since hidden reasoning provides no admissible evidence. This rubric reads the scaffold artifact declared by `test/fixtures/evaluate/valid/contract.json`.

<!-- example:rubric -->

```json
{
  "id": "R-001",
  "scaleLevels": [
    { "level": 0, "anchor": "For the criterion being scored, no named item meets the stated question." },
    { "level": 1, "anchor": "For the criterion being scored, some but not all named items meet the stated question." },
    { "level": 2, "anchor": "For the criterion being scored, every named item meets the stated question with observable evidence." }
  ],
  "failureModePenalties": [
    { "name": "missing-criterion", "description": "Lower the score when a named criterion has no test case." },
    { "name": "placeholder-assertion", "description": "Lower the score when an assertion has no specific expected outcome." }
  ],
  "maxLength": 4000,
  "criteria": [
    {
      "id": "RC-001",
      "text": "Does each story criterion have a test case?",
      "evidence": "/interactions/tea-atdd-runner-run/artifact/scaffold"
    },
    {
      "id": "RC-002",
      "text": "Does each test case assert a specific expected result?",
      "evidence": "/interactions/tea-atdd-runner-run/artifact/scaffold"
    }
  ]
}
```

## Judge calibration design

For each criterion, prepare a labelled item at every anchored level. For `RC-001`, use excerpts with zero, some and all named criteria covered. Repeat for `RC-002` with absent, partial and specific assertions. Withhold the labels from the judge. Ask the adopter for `evaluation.json.judgeCalibration.minimumAgreement`, the exact agreement threshold, and record labelled items in `policy/judge-calibration.json`. Calibrate before accepting scores, with the judge model snapshot and prompt digest in the conditions. AD-22 governs calibration and held-out probes. A zero-rubric contract makes no judge call.

The labelled set below covers each level of both questions. The judge receives only each `response`; the runtime compares its returned level with `expectedLevel` after judging.

<!-- example:calibration -->

```json
{
  "items": [
    {
      "rubricId": "R-001",
      "criterionId": "RC-001",
      "response": "No story criterion has a test case.",
      "expectedLevel": 0
    },
    {
      "rubricId": "R-001",
      "criterionId": "RC-001",
      "response": "One of two story criteria has a test case.",
      "expectedLevel": 1
    },
    {
      "rubricId": "R-001",
      "criterionId": "RC-001",
      "response": "Every story criterion has a test case.",
      "expectedLevel": 2
    },
    {
      "rubricId": "R-001",
      "criterionId": "RC-002",
      "response": "No test has a specific expected result.",
      "expectedLevel": 0
    },
    {
      "rubricId": "R-001",
      "criterionId": "RC-002",
      "response": "One of two tests has a specific expected result.",
      "expectedLevel": 1
    },
    {
      "rubricId": "R-001",
      "criterionId": "RC-002",
      "response": "Every test has a specific expected result.",
      "expectedLevel": 2
    }
  ]
}
```

## Loose oracle and degenerate response

A loose oracle that checks only a clean exit accepts this degenerate response. It exits 0 and writes no scaffold:

<!-- example:degenerate-response -->

```json
{
  "schemaVersion": 1,
  "steps": {
    "tea-atdd-runner-run": { "stdout": "{\"filesWritten\":1}", "stderr": "", "exitCode": 0 }
  }
}
```

<!-- example:oracle -->

```json
{
  "id": "O-001",
  "polarity": "expects-hold",
  "commentary": "The command reported a clean exit.",
  "direction": {
    "polarity": "expects-hold",
    "relation": "equality",
    "scope": "The command exit code.",
    "negativeDomain": "A command that reports a nonzero exit.",
    "evidenceTargets": ["/interactions/tea-atdd-runner-run/exit-code"]
  },
  "check": {
    "op": "equality",
    "operands": [{ "pointer": "/interactions/tea-atdd-runner-run/exit-code" }, { "literal": 0 }]
  }
}
```

Tighten it to read the artifact and its required `test.skip(` call. The tightened oracle below rejects the degenerate response because the artifact pointer cannot resolve. The `test.skip(` rule comes from `test/fixtures/evaluate/valid/contract.json`; use the adopter's own observable rule for another target.

<!-- example:oracle -->

```json
{
  "id": "O-001",
  "polarity": "expects-hold",
  "commentary": "The command completed and emitted a skipped test in the scaffold artifact.",
  "direction": {
    "polarity": "expects-hold",
    "relation": "all",
    "scope": "The scaffold artifact and command exit code.",
    "negativeDomain": "A claimed file count with no file, an active test, or a failed command.",
    "evidenceTargets": ["/interactions/tea-atdd-runner-run/exit-code", "/interactions/tea-atdd-runner-run/artifact/scaffold"]
  },
  "check": {
    "op": "all",
    "operands": [
      { "op": "equality", "operands": [{ "pointer": "/interactions/tea-atdd-runner-run/exit-code" }, { "literal": 0 }] },
      {
        "op": "containment",
        "operands": [{ "pointer": "/interactions/tea-atdd-runner-run/artifact/scaffold" }, { "literal": "test.skip(" }]
      }
    ]
  }
}
```
