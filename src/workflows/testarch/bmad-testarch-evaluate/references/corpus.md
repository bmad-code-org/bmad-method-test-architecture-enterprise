# Corpus

Design from the confirmed `requirements.md` and inspection record.
`probes/P-NNN.probe.json` holds the authored eval-quality subset.
Each target kind is a separate evaluation.
Replace example data with observed facts and qualify defect and gameability probes before using them as evidence.

## Per-kind guides

Load only the guide for the target kind recorded as `targetKind` at inspection.
Both tool-use rows of the inspection mapping (a calling agent and a tool server) load the tool-use guide, and a tool server reached over `mcp` takes its channel pointers from `references/oracles.md` and its registry shape from `references/adapters.md`.

- Agent: `references/corpus-agent.md`
- Skill: `references/corpus-skill.md`
- Workflow: `references/corpus-workflow.md`
- Tool-use system: `references/corpus-tool-use-system.md`
- AI feature: `references/corpus-ai-feature.md`
- Test-review mechanism: `references/corpus-test-review-mechanism.md`

## Corpus rules and layout

- Put representative inputs in `corpus/` and refer to them from the interaction plan. Add negative and malformed inputs that distinguish a disciplined response from a plausible shortcut.
- Keep at least one `zero-action` probe with `expectedClean: true` and no defects as a clean control. For every mandatory-action behavior, add a `zero-action` defect probe whose signature exposes the missing action. A clean control never fills a strength floor, because eval-quality's strength vector leaves every `expectedClean` probe out. Declare a `zero-action` floor only when a `zero-action` defect probe sits in the partition `baseline/` records, which the twin run repeats (the whole corpus for a `both` baseline, the corpus without `heldOutProbes` for a development baseline), and in the `heldOutProbes` list; otherwise declare `defect` alone.
- For every behavior, plan one seeded-defect probe or record its refusal with the reason. A non-canary defect carries a `manifestationWitness`; an AD-19 signature addresses the exit code or descriptor-nominated stream or response body. A file-only manifestation is refused until an allowed channel exposes it.
- For every rubric- or judgment-governed behavior, include a `gameability` probe whose degenerate response satisfies a naive oracle of a different behavior and fails the probe behavior's disciplined oracle. Commit the response bytes at `corpus/gameability/<probeId>.json` and declare the naive oracle in the probe's qualification.
- Choose non-clean held-out probes before writing oracles, and retain a development probe for each held-out behavior. List at least one per `material` or `critical` behavior in `evaluation.json`'s `heldOutProbes`. The held-out partition is scored on its own and the twin run repeats the partition `baseline/` recorded, so every class `strengthFloor` declares needs an eligible probe in the partition `baseline/` records (the corpus without `heldOutProbes` for the development baseline the authoring loop records) and one in the `heldOutProbes` list: hold one probe of the class out and keep another in development, or declare no floor for the class. A floor with no eligible probe in a partition it is read on exits `ci --tier release` 2 with `no-eligible-probe`. The gap loop reads `gap-view.json`, which contains only held-out ID, class and outcome, and must not read held-out input or expected answer. Run held-out probes as a separate partition (AD-22).

Keep the committed layout at `{tea_evaluations_folder}/<evaluationId>/`: `contract.json`, `evaluation.json`, `requirements.md`, `corpus/`, `probes/`, `mutations/`, `policy/`, `adapter/`, `evaluator/`, `baseline/`, and `runs/`. The authored `corpus-index.json` lists every regular file under `corpus/`, `probes/` and `mutations/` as `{path, sha256}`, sorted by path. Create the AD-20 private `{tea_evaluations_folder}/package.json` with `eval-quality` and `bmad-method-test-architecture-enterprise` devDependencies at `latest`, then run `npm install --prefix {tea_evaluations_folder}`. Run `npm exec --prefix {tea_evaluations_folder} -- tea-evaluate digest --evaluation {tea_evaluations_folder}/<evaluationId>` to write the index and print eval-quality's `digestArtifact` over it as `corpusDigest`; `tea-evaluate check` refuses a stale index. The private install works for non-Node adopter repositories. Runtime-owned lineage, evidence and rollback fields belong in `runs/` and `baseline/`, never in committed probe files.

Before Stage 6 `check`, copy `assets/scoring-policy.template.json` from `{skill-root}` to `{tea_evaluations_folder}/<evaluationId>/policy/scoring-policy.json`. Fill its `policyId`, `severityFloor`, `catchThreshold`, and `minimumTrialCount` with values the adopter approves; keep `minimumTrialCount` at or below `evaluation.json.trials`. Validate the filled file against eval-quality's scoring-policy schema. This file is required when any probe takes the `controlled-mutation`, `historical`, or `gameability` route. The template's null placeholders are an authoring prompt and do not form a valid policy until filled.

For each `controlled-mutation` probe, write the named `mutations/<mutationId>.mutation.json` before Stage 6 `check`. Follow `references/mutation.md` for the exact replacement and observable failure, then refresh `corpus-index.json`. Stage 6 preflight qualifies the nominated probe; Stage 8 inspects its manifestation and rollback evidence and expands the mutation set.

The starter `evaluation.json` declares `clean` and `mutated` arms for its initial partial corpus. When committing `P-004`, add `gameability` to `evaluation.json.arms`. Set `strengthFloor.gameability` to the confirmed minimum, such as `1`, once the development partition and `heldOutProbes` each hold a gameability probe: `P-004` fills the partition it sits in, so commit a second gameability probe for the other partition first and leave the floor undeclared until then. Under a `partitionPlan` each gameability probe answers the whole plan from two files (see the partition section), and the floor reads the partition its probes sit in as it does with no plan. Keep each declared arm paired with a probe using its route. `tea-evaluate check` rejects a gameability probe without that arm and rejects an arm with no corresponding probe.

The clean negative and malformed controls expect a valid refusal.
Each held-out seed changes an adopter-owned rule through its mutation, as the held-out seeds of the per-kind guides do; qualify its baseline pass, mutated fail and rollback.
Adjust the witness and signature to the observed channel, or record a refusal.
Keep held-out fixture content outside the gap loop.

The command examples in the per-kind guides assume one JSON object on stdout; eval-quality parses JSON-shaped stdout before following a `/stdout/...` pointer.
The HTTP example in `references/corpus-ai-feature.md` returns JSON with a JSON content type.
Match these shapes to the inspected target before copying a signature.
The gameability response blocks in the per-kind guides use one illustrative `decide` step.
After the interaction plan is authored, make each `corpus/gameability/<probeId>.json` answer every actual step of `contract.json`'s plan with the same step ID and interface kind; under a `partitionPlan` the plan file's steps are answered in a second file (see the partition section).

## Isolate held-out steps from the development plan

A held-out probe that needs a request of its own must not put that request in `contract.json`, because a development run launches the whole plan and records every step's request and response, and the gap loop edits that same file. Declare a `partitionPlan` in `evaluation.json` instead, and keep the held-out request in a sealed plan file beside the corpus. Every step stays one of three kinds: shared (in `contract.json`, run by every partition), development-only (in `contract.json` and named by `developmentOnlySteps`) and held-out (only in the plan file). Add no `partition` field to a step. The authoring loop reads neither the plan file nor a held-out baseline under `baseline/`.

<!-- example:partition-plan -->

```json
{
  "partitionPlan": {
    "developmentOnlySteps": ["development-run"],
    "heldOutPlan": "corpus/held-out/plan.json"
  }
}
```

The plan file lives directly under `corpus/held-out/`, so `corpus-index.json` digests it, and holds the held-out steps, their oracles and the oracles each behavior gains in the held-out view. A step or oracle ID must differ from every ID in `contract.json`. Every behavior keeps at least one oracle in the held-out view, because the engine compiles each behavior against the oracles it names: a behavior whose only oracle reads a development-only step needs an entry under `behaviorOracles`, and a behavior a held-out probe discharges names exactly one oracle there.

<!-- example:held-out-plan -->

```json
{
  "schemaVersion": 1,
  "interactionPlan": [
    {
      "stepId": "held-out-run",
      "interfaceId": "verdict",
      "operationId": "judge-request",
      "after": null,
      "cardinality": "exactly-one",
      "inputBinding": {
        "argument": null,
        "option": null,
        "environment": null,
        "stdin": { "prompt": { "literal": "Judge the private held-out case." } }
      }
    }
  ],
  "oracles": [
    {
      "id": "O-101",
      "polarity": "expects-hold",
      "commentary": "The held-out run says verdict: accepted.",
      "direction": {
        "polarity": "expects-hold",
        "relation": "containment",
        "scope": "The stdout of the held-out call.",
        "negativeDomain": "A run whose stdout does not say verdict: accepted.",
        "evidenceTargets": ["/interactions/held-out-run/stdout"]
      },
      "check": {
        "op": "containment",
        "operands": [{ "pointer": "/interactions/held-out-run/stdout" }, { "literal": "verdict: accepted" }]
      }
    }
  ],
  "behaviorOracles": { "B-002": ["O-101"] }
}
```

The two files together make three views.
A development run executes `contract.json` as it stands and never opens the plan file; a held-out run executes the shared steps and the held-out ones, without the development-only steps and the oracles that read them; a run with no `--partition` executes everything.
Each view is the only contract its run compiles, seals and records, so no run directory, trial record or replay file of one partition holds a request, step ID or oracle meant for the other.
Qualify held-out probes with `tea-evaluate preflight --partition held-out`.
Probe files are not sealed, so a held-out probe selects with an `any` matcher and witnesses with a non-private input, as [source fixture: P-003.probe.json](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/test/fixtures/evaluate/partition-plan/evals/verdict/probes/P-003.probe.json) does.
The `[held-out]` examples in the per-kind guides keep the private literal, which a folder with no `partitionPlan` allows; under one, replace it that way.

A rubric criterion follows the step its evidence reads.
A criterion in `contract.json` that reads a shared step is in every view, and one that reads a development-only step is in the development and both views.
A criterion only the held-out partition judges goes in the plan file's `rubrics` array under its own rubric ID, which differs from every rubric ID in `contract.json`; it is in the held-out and both views, and its evidence reads a shared or a held-out step.
Each run calibrates and judges the criteria of its own view from the one `policy/judge-calibration.json`, so keep an item at every anchored level for every criterion, the held-out ones included.
The items that label a criterion of the plan's `rubrics` sit in that same file and are closed to the authoring loop like the plan: the loop reads and edits only the items of `contract.json`'s criteria, and the held-out items change in the held-out review.
`evaluation.json` declares the judge once.

<!-- example:held-out-rubrics -->

```json
{
  "rubrics": [
    {
      "id": "R-101",
      "scaleLevels": [
        { "level": 0, "anchor": "The held-out run does not say the verdict is accepted." },
        { "level": 1, "anchor": "The held-out run says the verdict is accepted." }
      ],
      "failureModePenalties": [{ "name": "silent", "description": "No verdict is stated." }],
      "maxLength": 100,
      "criteria": [
        { "id": "RC-101", "text": "Does the held-out run say the verdict is accepted?", "evidence": "/interactions/held-out-run/stdout" }
      ]
    }
  ]
}
```

A waiver follows the step its condition reads.
A waiver names a discipline rule and no oracle, so its `condition` is the one field that places it.
A `condition` is a sentence, and every `/interactions/<stepId>` pointer in it names a step wherever the pointer sits, so write each step a condition reads as that pointer: a step named any other way is not read.
A waiver in `contract.json` whose condition reads a shared step, or no step, is in every view, and one whose condition reads a development-only step anywhere, beside a shared step or alone, is in the development and both views.
A waiver that reads a held-out step stays out of `contract.json`, because the development view would name the step.
A waiver only the held-out partition carries goes in the plan file's `waivers` array under its own waiver ID, which differs from every waiver ID in `contract.json`; it is in the held-out and both views, and a step its condition reads is a shared or a held-out one.

<!-- example:held-out-waivers -->

```json
{
  "waivers": [
    {
      "id": "W-101",
      "rule": "omission-and-completeness",
      "rationale": "The held-out seed is unavailable in the sandbox environment.",
      "condition": "/interactions/held-out-run/exit-code is absent",
      "approval": "gate-c-reviewer",
      "expiresAt": "2027-01-01T00:00:00Z"
    }
  ]
}
```

An evaluator mapping row follows the oracle or criterion it binds.
A command or sealed-brief-agent evaluator binds each key it prints to an oracle and behavior, or to a rubric criterion, in `evaluator/mapping.json` (shape in `references/evaluator.md`), which the development partition reads, so a held-out oracle's or criterion's ID stays out of that file.
A row in `evaluator/mapping.json` binds what `contract.json` declares: it is in the development and both views, and in the held-out view unless the held-out view drops what it binds.
A row for what only the held-out partition declares goes in the plan file's `mappings` array, and it is in the held-out and both views.
Give a plan row the `key` and the binding of a row of `evaluator/mapping.json`.
Its key differs from every other key, and each held-out criterion has a row, because a criterion no key binds scores nothing.
A command evaluator's files under `evaluator/` are read by the development partition, so it derives a held-out key from its input and never spells one.
A records harness's records name only the oracles, behaviors and criteria of the run's view.
Under a partition plan a records harness names each observation `<label>-<stepId>`, or `<label>-call-<n>` for a call the agent chose.
The label is `trial-<n>`, `attempt-<n>`, `baseline`, `degenerate`, `mutated` or `re-pass-<n>`.
The import admits an observation only when its ID is `<label>-<a step the run's view declares>` or `<label>-call-<n>`, and refuses every other ID, because a development run never opens the plan and cannot know a held-out step ID.
A disposition or finding that cites an observation its record does not hold is refused too.
A step ID of the form `call-<n>` is refused by `check` under a plan, because its observation would look like an agent's chosen call.

<!-- example:held-out-mappings -->

```json
{
  "mappings": [
    { "key": "accepted:held-out-run", "oracleId": "O-101", "behaviorId": "B-002" },
    { "key": "score:RC-101", "rubricId": "R-101", "criterionId": "RC-101", "levels": [0, 1] }
  ]
}
```

A gameability probe's degenerate response follows the plan too.
`corpus/gameability/<probeId>.json` answers the steps of `contract.json`, shared and development-only, and `corpus/held-out/gameability/<probeId>.json`, beside the plan, answers the steps of the plan file in the same shape.
The development and both views answer from the first file, and the held-out and both views also from the second, which a development run never opens, so the arm of each view answers only that view's steps.
Give every gameability probe both files, each answering every step its own source declares (the steps of `contract.json` in the first, the steps of the plan file in the second), because the both view runs each probe over both.
Name a held-out probe's naive oracle among the oracles of `contract.json` that read no development-only step, since the held-out view drops the others.
When every oracle another behavior has reads a development-only step, add an oracle on a shared step to `contract.json` for it, or keep that behavior's gameability probe in the development partition.
Those answers can violate an oracle of either partition that belongs to the probe's behaviors, and each violation files a finding that cites the probe.
eval-quality reads a finding at a step the signature does not admit, or whose predicate the answer does not satisfy, as an unwitnessed claim and scores the probe Invalid (exit 3).
Give a gameability probe a `defectSignature` that selects with an `any` matcher on the channel that differs by step, and make the answer at every step where such an oracle is violated satisfy the signature's predicate.
The per-kind guides' gameability probes select a literal input, so replace that selector under a `partitionPlan`.

<!-- example:held-out-gameability-response -->

```json
{
  "schemaVersion": 1,
  "steps": {
    "held-out-run": { "stdout": "verdict: pending\n", "stderr": "", "exitCode": 0 }
  }
}
```

`tea-evaluate check` validates the pair, names every defect by path and ID without quoting the plan, and refuses a `partitionPlan` beside a records evaluator and a rubric, and `mappings` beside an evaluator that reads none. It names a rubric criterion that no view can reach by its criterion ID. It names a waiver that no view can reach by its waiver ID. It names a gameability answer left out, misplaced or unreadable by probe and step ID, and a held-out step by its ID only when the ID has the schema's shape, and a held-out probe whose naive oracle reads a development-only step. It names a plan mapping row by its place in `mappings`: a key another row has, an oracle or criterion the held-out view does not declare or another key already binds, and a held-out criterion no key binds. It compiles nothing, so an engine compile defect in the plan file surfaces at the first held-out preflight or run with no `--partition`.

A run with no `--partition` scores each probe against the oracle of its own partition: the one oracle that partition's view lists for its behavior (held-out when `heldOutProbes` lists the probe, development otherwise), so probes of one behavior in the two partitions meet different oracles in the same run.
When that view lists none or several, the probe is scored with no designated oracle, as in its partition's own run, and reads `caught: true` only when a finding cites the contract's first-declared oracle.
When the both view lists exactly one oracle, eval-quality designates it.
