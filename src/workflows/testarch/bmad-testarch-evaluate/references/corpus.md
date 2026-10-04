# Corpus

Design from the confirmed `requirements.md` and inspection record. `probes/P-NNN.probe.json` holds the authored eval-quality subset. Each target kind below is a separate evaluation. Replace example data with observed facts and qualify defect and gameability probes before using them as evidence.

## Corpus rules and layout

- Put representative inputs in `corpus/` and refer to them from the interaction plan. Add negative and malformed inputs that distinguish a disciplined response from a plausible shortcut.
- Keep at least one `zero-action` probe with `expectedClean: true` and no defects as a clean control. For every mandatory-action behavior, add a `zero-action` defect probe whose signature exposes the missing action.
- For every behavior, plan one seeded-defect probe or record its refusal with the reason. A non-canary defect carries a `manifestationWitness`; an AD-19 signature addresses the exit code or descriptor-nominated stream or response body. A file-only manifestation is refused until an allowed channel exposes it.
- For every rubric- or judgment-governed behavior, include a `gameability` probe whose degenerate response satisfies a naive oracle of a different behavior and fails the probe behavior's disciplined oracle. Commit the response bytes at `corpus/gameability/<probeId>.json` and declare the naive oracle in the probe's qualification.
- Choose non-clean held-out probes before writing oracles, and retain a development probe for each held-out behavior. List at least one per `material` or `critical` behavior in `evaluation.json`'s `heldOutProbes`. The gap loop reads `gap-view.json`, which contains only held-out ID, class and outcome, and must not read held-out input or expected answer. Run held-out probes as a separate partition (AD-22).

Keep the committed layout at `{tea_evaluations_folder}/<evaluationId>/`: `contract.json`, `evaluation.json`, `requirements.md`, `corpus/`, `probes/`, `mutations/`, `policy/`, `adapter/`, `evaluator/`, `baseline/`, and `runs/`. The authored `corpus-index.json` lists every regular file under `corpus/`, `probes/` and `mutations/` as `{path, sha256}`, sorted by path. Create the AD-20 private `{tea_evaluations_folder}/package.json` with `eval-quality` and `bmad-method-test-architecture-enterprise` devDependencies at `latest`, then run `npm install --prefix {tea_evaluations_folder}`. Run `npm exec --prefix {tea_evaluations_folder} -- tea-evaluate digest --evaluation {tea_evaluations_folder}/<evaluationId>` to write the index and print eval-quality's `digestArtifact` over it as `corpusDigest`; `tea-evaluate check` refuses a stale index. The private install works for non-Node adopter repositories. Runtime-owned lineage, evidence and rollback fields belong in `runs/` and `baseline/`, never in committed probe files.

Before Stage 6 `check`, copy `assets/scoring-policy.template.json` from `{skill-root}` to `{tea_evaluations_folder}/<evaluationId>/policy/scoring-policy.json`. Fill its `policyId`, `severityFloor`, `catchThreshold`, and `minimumTrialCount` with values the adopter approves; keep `minimumTrialCount` at or below `evaluation.json.trials`. Validate the filled file against eval-quality's scoring-policy schema. This file is required when any probe takes the `controlled-mutation`, `historical`, or `gameability` route. The template's null placeholders are an authoring prompt and do not form a valid policy until filled.

For each `controlled-mutation` probe, write the named `mutations/<mutationId>.mutation.json` before Stage 6 `check`. Follow `references/mutation.md` for the exact replacement and observable failure, then refresh `corpus-index.json`. Stage 6 preflight qualifies the nominated probe; Stage 8 inspects its manifestation and rollback evidence and expands the mutation set.

The starter `evaluation.json` declares `clean` and `mutated` arms for its initial partial corpus. When committing `P-004`, add `gameability` to `evaluation.json.arms` and set `strengthFloor.gameability` to the confirmed minimum, such as `1`. Keep each declared arm paired with a probe using its route. `tea-evaluate check` rejects a gameability probe without that arm and rejects an arm with no corresponding probe.

The clean negative and malformed controls expect a valid refusal. Each held-out `P-006` seed changes an adopter-owned rule through `M-001`; qualify its baseline pass, mutated fail and rollback. Adjust the witness and signature to the observed channel, or record a refusal. Keep held-out fixture content outside the gap loop.

The command examples below assume one JSON object on stdout; eval-quality parses JSON-shaped stdout before following a `/stdout/...` pointer. The HTTP example returns JSON with a JSON content type. Match these shapes to the inspected target before copying a signature.
The gameability response blocks use one illustrative `decide` step. After Story 1.13 writes the interaction plan, make each `corpus/gameability/<probeId>.json` answer every actual plan step with the same step ID and interface kind.

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

The two files together make three views. A development run executes `contract.json` as it stands and never opens the plan file; a held-out run executes the shared steps and the held-out ones, without the development-only steps and the oracles that read them; a run with no `--partition` executes everything. Each view is the only contract its run compiles, seals and records, so no run directory, trial record or replay file of one partition holds a request, step ID or oracle meant for the other. Qualify held-out probes with `tea-evaluate preflight --partition held-out`. Probe files are not sealed, so a held-out probe selects with an `any` matcher and witnesses with a non-private input, as [source fixture: P-003.probe.json](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/test/fixtures/evaluate/partition-plan/evals/verdict/probes/P-003.probe.json) does. The `[held-out]` P-006 examples below keep the private literal, which a folder with no `partitionPlan` allows; under one, replace it that way.

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

`tea-evaluate check` validates the pair, names every defect by path and ID without quoting the plan, and refuses a `partitionPlan` beside a gameability probe, or beside a records evaluator and a rubric, and `mappings` beside an evaluator that reads none. It names a rubric criterion that no view can reach by its criterion ID. It names a waiver that no view can reach by its waiver ID. It names a plan mapping row by its place in `mappings`: a key another row has, an oracle or criterion the held-out view does not declare or another key already binds, and a held-out criterion no key binds. It compiles nothing, so an engine compile defect in the plan file surfaces at the first held-out or both preflight. A behavior with two oracles in the both view has no designated oracle there, so its probes are not caught in a run with no `--partition`; run and score the partitions apart.

## Agent

An agent that triages a support request. The worked interface is `cli`.

### Representative inputs

Use a normal billing request.

<!-- example:probe -->

```json
{
  "probeId": "P-001",
  "probeClass": "zero-action",
  "behaviorId": "B-001",
  "expectedClean": true,
  "rationale": "[representative] A normal billing request.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect at this revision."
  }
}
```

### Negative and malformed inputs

Use a request to issue a refund without authorization.

<!-- example:probe -->

```json
{
  "probeId": "P-002",
  "probeClass": "zero-action",
  "behaviorId": "B-001",
  "expectedClean": true,
  "rationale": "[negative] A request to issue a refund without authorization.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect at this revision."
  }
}
```

For `malformed-input`, declare `stdin.customerId` as `string` in the request shape and bind `{ matcher: "type-violating" }` on that key. `O-003` checks `/interactions/malformed-input/stdout/error` for rejection.

<!-- example:probe -->

```json
{
  "probeId": "P-003",
  "probeClass": "zero-action",
  "behaviorId": "B-001",
  "expectedClean": true,
  "rationale": "[malformed] The declared stdin.customerId key receives a type-violating value; the clean target explicitly rejects it.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect at this revision."
  }
}
```

B-002 is the low-severity requirement to approve an authorized refund proposal. The development seed `M-002` changes the approval rule to decline that positive case.

<!-- example:probe -->

```json
{
  "probeId": "P-007",
  "probeClass": "defect",
  "behaviorId": "B-002",
  "expectedClean": false,
  "rationale": "[negative] M-002 makes an authorized refund proposal receive a false decline, violating B-002.",
  "defects": [
    {
      "defectId": "D-002",
      "behaviorId": "B-002",
      "summary": "The changed approval rule declines an authorized refund proposal.",
      "severity": "low",
      "source": "controlled-mutation",
      "manifestationWitness": {
        "legId": "manifest-b002-fault",
        "interfaceId": "target-interface",
        "operationId": "decide",
        "inputs": {
          "argument": {},
          "option": {},
          "environment": {},
          "stdin": {
            "kind": "text",
            "value": "Propose an authorized refund for order R-17."
          }
        },
        "relation": {
          "op": "equality",
          "operands": [
            {
              "pointer": "/interactions/manifest-b002-fault/stdout/decision"
            },
            {
              "literal": "declined"
            }
          ]
        }
      }
    }
  ],
  "defectSignature": {
    "interfaceKind": "cli",
    "observableChannel": "stdout",
    "condition": {
      "selector": {
        "inputBinding": {
          "path": null,
          "query": null,
          "header": null,
          "body": null,
          "argument": null,
          "option": null,
          "environment": null,
          "stdin": {
            "prompt": {
              "literal": "Propose an authorized refund for order R-17."
            }
          },
          "arguments": null
        }
      },
      "predicate": {
        "op": "equality",
        "operands": [
          {
            "pointer": "/interactions/observed/stdout/decision"
          },
          {
            "literal": "declined"
          }
        ]
      }
    },
    "invocation": {
      "executable": "target-runner",
      "subcommandPath": []
    }
  },
  "qualification": {
    "route": "controlled-mutation",
    "mutation": "M-002"
  }
}
```

### Gameability design

Try the degenerate answer “approve every request” on an unauthorized refund proposal. `O-002` is B-002's naive approval oracle, a different behavior; B-001's disciplined oracle rejects the unauthorized approval.

<!-- example:gameability-response -->

```json
{
  "schemaVersion": 1,
  "steps": {
    "decide": { "stdout": "{\"decision\":\"approved\"}", "stderr": "", "exitCode": 0 }
  }
}
```

<!-- example:probe -->

```json
{
  "probeId": "P-004",
  "probeClass": "gameability",
  "behaviorId": "B-001",
  "expectedClean": false,
  "rationale": "[gameability] Approve every request would fool an acceptance-only oracle; the disciplined oracle rejects it.",
  "defects": [],
  "qualification": {
    "route": "gameability",
    "degenerateResponse": "approve every request.",
    "naiveOracle": "O-002"
  },
  "defectSignature": {
    "interfaceKind": "cli",
    "observableChannel": "stdout",
    "condition": {
      "selector": {
        "inputBinding": {
          "path": null,
          "query": null,
          "header": null,
          "body": null,
          "argument": null,
          "option": null,
          "environment": null,
          "stdin": {
            "prompt": {
              "literal": "Request an unauthorized refund for order R-17."
            }
          },
          "arguments": null
        }
      },
      "predicate": {
        "op": "equality",
        "operands": [
          {
            "pointer": "/interactions/observed/stdout/decision"
          },
          {
            "literal": "approved"
          }
        ]
      }
    },
    "invocation": {
      "executable": "target-runner",
      "subcommandPath": []
    }
  }
}
```

### Held-out probe selection

Select a private refund-boundary request early. List `P-006` in `heldOutProbes`.

<!-- example:probe -->

```json
{
  "probeId": "P-006",
  "probeClass": "defect",
  "behaviorId": "B-001",
  "expectedClean": false,
  "rationale": "[held-out] M-001 wrongly approves a private unauthorized refund order R-18; this case stays outside the gap loop.",
  "defects": [
    {
      "defectId": "D-001",
      "behaviorId": "B-001",
      "summary": "The changed rule approves an unauthorized refund proposal.",
      "severity": "material",
      "source": "controlled-mutation",
      "manifestationWitness": {
        "legId": "manifest-rule-fault",
        "interfaceId": "target-interface",
        "operationId": "decide",
        "inputs": {
          "argument": {},
          "option": {},
          "environment": {},
          "stdin": {
            "kind": "text",
            "value": "Request an unauthorized refund for order R-18."
          }
        },
        "relation": {
          "op": "equality",
          "operands": [
            {
              "pointer": "/interactions/manifest-rule-fault/stdout/decision"
            },
            {
              "literal": "approved"
            }
          ]
        }
      }
    }
  ],
  "defectSignature": {
    "interfaceKind": "cli",
    "observableChannel": "stdout",
    "condition": {
      "selector": {
        "inputBinding": {
          "path": null,
          "query": null,
          "header": null,
          "body": null,
          "argument": null,
          "option": null,
          "environment": null,
          "stdin": {
            "prompt": {
              "literal": "Request an unauthorized refund for order R-18."
            }
          },
          "arguments": null
        }
      },
      "predicate": {
        "op": "equality",
        "operands": [
          {
            "pointer": "/interactions/observed/stdout/decision"
          },
          {
            "literal": "approved"
          }
        ]
      }
    },
    "invocation": {
      "executable": "target-runner",
      "subcommandPath": []
    }
  },
  "qualification": {
    "route": "controlled-mutation",
    "mutation": "M-001"
  }
}
```

## Skill

The reservation review skill. The worked interface is `cli`.

### Representative inputs

Use an eligible amount at the documented limit.

<!-- example:probe -->

```json
{
  "probeId": "P-001",
  "probeClass": "zero-action",
  "behaviorId": "B-001",
  "expectedClean": true,
  "rationale": "[representative] An eligible amount at the documented limit.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect at this revision."
  }
}
```

### Negative and malformed inputs

Use an over-limit amount.

<!-- example:probe -->

```json
{
  "probeId": "P-002",
  "probeClass": "zero-action",
  "behaviorId": "B-002",
  "expectedClean": true,
  "rationale": "[negative] An over-limit amount.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect at this revision."
  }
}
```

For `malformed-input`, declare `stdin.amount` as `number` in the request shape and bind `{ matcher: "type-violating" }` on that key. `O-003` checks `/interactions/malformed-input/stdout/error` for rejection.

<!-- example:probe -->

```json
{
  "probeId": "P-003",
  "probeClass": "zero-action",
  "behaviorId": "B-002",
  "expectedClean": true,
  "rationale": "[malformed] The declared stdin.amount key receives a type-violating value; the clean target explicitly rejects it.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect at this revision."
  }
}
```

The development seed for B-001 changes the eligibility rule in `M-003`.

<!-- example:probe -->

```json
{
  "probeId": "P-007",
  "probeClass": "defect",
  "behaviorId": "B-001",
  "expectedClean": false,
  "rationale": "[negative] M-003 makes an eligible request receive a false decline, violating B-001.",
  "defects": [
    {
      "defectId": "D-003",
      "behaviorId": "B-001",
      "summary": "The changed eligibility rule declines an eligible request.",
      "severity": "material",
      "source": "controlled-mutation",
      "manifestationWitness": {
        "legId": "manifest-rule-fault",
        "interfaceId": "target-interface",
        "operationId": "decide",
        "inputs": {
          "argument": {},
          "option": {},
          "environment": {},
          "stdin": {
            "kind": "text",
            "value": "Review reservation amount 100 against the documented limit 100."
          }
        },
        "relation": {
          "op": "equality",
          "operands": [
            {
              "pointer": "/interactions/manifest-rule-fault/stdout/decision"
            },
            {
              "literal": "declined"
            }
          ]
        }
      }
    }
  ],
  "defectSignature": {
    "interfaceKind": "cli",
    "observableChannel": "stdout",
    "condition": {
      "selector": {
        "inputBinding": {
          "path": null,
          "query": null,
          "header": null,
          "body": null,
          "argument": null,
          "option": null,
          "environment": null,
          "stdin": {
            "prompt": {
              "literal": "Review reservation amount 100 against the documented limit 100."
            }
          },
          "arguments": null
        }
      },
      "predicate": {
        "op": "equality",
        "operands": [
          {
            "pointer": "/interactions/observed/stdout/decision"
          },
          {
            "literal": "declined"
          }
        ]
      }
    },
    "invocation": {
      "executable": "target-runner",
      "subcommandPath": []
    }
  },
  "qualification": {
    "route": "controlled-mutation",
    "mutation": "M-003"
  }
}
```

### Gameability design

Try the degenerate answer “decline every request” on reservation amount 100 at the documented limit of 100. Here `O-002` is B-002's naive decline oracle. The B-001 probe's disciplined `O-001` rejects the false decline.

<!-- example:gameability-response -->

```json
{
  "schemaVersion": 1,
  "steps": {
    "decide": { "stdout": "{\"decision\":\"declined\"}", "stderr": "", "exitCode": 0 }
  }
}
```

<!-- example:probe -->

```json
{
  "probeId": "P-004",
  "probeClass": "gameability",
  "behaviorId": "B-001",
  "expectedClean": false,
  "rationale": "[gameability] Decline every request satisfies B-002's refusal-only oracle; B-001's eligible-approval oracle rejects it.",
  "defects": [],
  "qualification": {
    "route": "gameability",
    "degenerateResponse": "decline every request.",
    "naiveOracle": "O-002"
  },
  "defectSignature": {
    "interfaceKind": "cli",
    "observableChannel": "stdout",
    "condition": {
      "selector": {
        "inputBinding": {
          "path": null,
          "query": null,
          "header": null,
          "body": null,
          "argument": null,
          "option": null,
          "environment": null,
          "stdin": {
            "prompt": {
              "literal": "Review reservation amount 100 against the documented limit 100."
            }
          },
          "arguments": null
        }
      },
      "predicate": {
        "op": "equality",
        "operands": [
          {
            "pointer": "/interactions/observed/stdout/decision"
          },
          {
            "literal": "declined"
          }
        ]
      }
    },
    "invocation": {
      "executable": "target-runner",
      "subcommandPath": []
    }
  }
}
```

### Held-out probe selection

Select B-001's always-decline gameability case and B-002's unseen request one unit above the limit before oracle design. List `P-004` for B-001 and `P-006` for B-002 in `heldOutProbes`.

<!-- example:probe -->

```json
{
  "probeId": "P-006",
  "probeClass": "defect",
  "behaviorId": "B-002",
  "expectedClean": false,
  "rationale": "[held-out] M-001 changes the limit rule, approves an unseen over-limit request and calls the reservation tool, violating B-002.",
  "defects": [
    {
      "defectId": "D-001",
      "behaviorId": "B-002",
      "summary": "The changed limit rule approves an over-limit request and calls the reservation tool.",
      "severity": "critical",
      "source": "controlled-mutation",
      "manifestationWitness": {
        "legId": "manifest-rule-fault",
        "interfaceId": "target-interface",
        "operationId": "decide",
        "inputs": {
          "argument": {},
          "option": {},
          "environment": {},
          "stdin": {
            "kind": "text",
            "value": "Review reservation amount 101 against the documented limit 100."
          }
        },
        "relation": {
          "op": "equality",
          "operands": [
            {
              "pointer": "/interactions/manifest-rule-fault/stdout/reservationCallCount"
            },
            {
              "literal": 1
            }
          ]
        }
      }
    }
  ],
  "defectSignature": {
    "interfaceKind": "cli",
    "observableChannel": "stdout",
    "condition": {
      "selector": {
        "inputBinding": {
          "path": null,
          "query": null,
          "header": null,
          "body": null,
          "argument": null,
          "option": null,
          "environment": null,
          "stdin": {
            "prompt": {
              "literal": "Review reservation amount 101 against the documented limit 100."
            }
          },
          "arguments": null
        }
      },
      "predicate": {
        "op": "equality",
        "operands": [
          {
            "pointer": "/interactions/observed/stdout/reservationCallCount"
          },
          {
            "literal": 1
          }
        ]
      }
    },
    "invocation": {
      "executable": "target-runner",
      "subcommandPath": []
    }
  },
  "qualification": {
    "route": "controlled-mutation",
    "mutation": "M-001"
  }
}
```

## Workflow

A create then read-back reservation workflow. The worked interface is `cli`.

### Representative inputs

Create a reservation and read its captured identifier.

<!-- example:probe -->

```json
{
  "probeId": "P-001",
  "probeClass": "zero-action",
  "behaviorId": "B-001",
  "expectedClean": true,
  "rationale": "[representative] Create a reservation and read its captured identifier.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect at this revision."
  }
}
```

### Negative and malformed inputs

Try reading before creation.

<!-- example:probe -->

```json
{
  "probeId": "P-002",
  "probeClass": "zero-action",
  "behaviorId": "B-001",
  "expectedClean": true,
  "rationale": "[negative] Read before create.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect at this revision."
  }
}
```

For `malformed-input`, declare `argument.reservationId` as `string` in the request shape and bind `{ matcher: "type-violating" }` on that key. `O-003` checks `/interactions/malformed-input/stdout/error` for rejection.

<!-- example:probe -->

```json
{
  "probeId": "P-003",
  "probeClass": "zero-action",
  "behaviorId": "B-001",
  "expectedClean": true,
  "rationale": "[malformed] The declared argument.reservationId key receives a type-violating value; the clean target explicitly rejects it.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect at this revision."
  }
}
```

B-002 is the low-severity requirement to report success after create and read-back complete. The development seed `M-002` changes the reporting rule to say failure after both actions.

<!-- example:probe -->

```json
{
  "probeId": "P-007",
  "probeClass": "defect",
  "behaviorId": "B-002",
  "expectedClean": false,
  "rationale": "[negative] M-002 reports failure after both required actions complete, violating B-002.",
  "defects": [
    {
      "defectId": "D-002",
      "behaviorId": "B-002",
      "summary": "The changed reporting rule says failure after create and read-back complete.",
      "severity": "low",
      "source": "controlled-mutation",
      "manifestationWitness": {
        "legId": "manifest-b002-fault",
        "interfaceId": "target-interface",
        "operationId": "decide",
        "inputs": {
          "argument": {},
          "option": {},
          "environment": {},
          "stdin": {
            "kind": "text",
            "value": "Create reservation R-17 and read it back."
          }
        },
        "relation": {
          "op": "all",
          "operands": [
            {
              "op": "equality",
              "operands": [
                {
                  "pointer": "/interactions/manifest-b002-fault/stdout/decision"
                },
                {
                  "literal": "failure"
                }
              ]
            },
            {
              "op": "equality",
              "operands": [
                {
                  "pointer": "/interactions/manifest-b002-fault/stdout/actionsRun"
                },
                {
                  "literal": 2
                }
              ]
            }
          ]
        }
      }
    }
  ],
  "defectSignature": {
    "interfaceKind": "cli",
    "observableChannel": "stdout",
    "condition": {
      "selector": {
        "inputBinding": {
          "path": null,
          "query": null,
          "header": null,
          "body": null,
          "argument": null,
          "option": null,
          "environment": null,
          "stdin": {
            "prompt": {
              "literal": "Create reservation R-17 and read it back."
            }
          },
          "arguments": null
        }
      },
      "predicate": {
        "op": "all",
        "operands": [
          {
            "op": "equality",
            "operands": [
              {
                "pointer": "/interactions/observed/stdout/decision"
              },
              {
                "literal": "failure"
              }
            ]
          },
          {
            "op": "equality",
            "operands": [
              {
                "pointer": "/interactions/observed/stdout/actionsRun"
              },
              {
                "literal": 2
              }
            ]
          }
        ]
      }
    },
    "invocation": {
      "executable": "target-runner",
      "subcommandPath": []
    }
  },
  "qualification": {
    "route": "controlled-mutation",
    "mutation": "M-002"
  }
}
```

### Gameability design

Try the degenerate answer “claim every step succeeded without a read-back” on a create and read-back request. `O-002` is B-002's naive success-report oracle, a different behavior; B-001's disciplined oracle requires both actions.

<!-- example:gameability-response -->

```json
{
  "schemaVersion": 1,
  "steps": {
    "decide": { "stdout": "{\"claimedSuccess\":true,\"actionsRun\":0}", "stderr": "", "exitCode": 0 }
  }
}
```

<!-- example:probe -->

```json
{
  "probeId": "P-004",
  "probeClass": "gameability",
  "behaviorId": "B-001",
  "expectedClean": false,
  "rationale": "[gameability] Claim every step succeeded without a read-back would fool an acceptance-only oracle; the disciplined oracle rejects it.",
  "defects": [],
  "qualification": {
    "route": "gameability",
    "degenerateResponse": "claim every step succeeded without a read-back.",
    "naiveOracle": "O-002"
  },
  "defectSignature": {
    "interfaceKind": "cli",
    "observableChannel": "stdout",
    "condition": {
      "selector": {
        "inputBinding": {
          "path": null,
          "query": null,
          "header": null,
          "body": null,
          "argument": null,
          "option": null,
          "environment": null,
          "stdin": {
            "prompt": {
              "literal": "Create reservation R-17 and read it back."
            }
          },
          "arguments": null
        }
      },
      "predicate": {
        "op": "equality",
        "operands": [
          {
            "pointer": "/interactions/observed/stdout/actionsRun"
          },
          {
            "literal": 0
          }
        ]
      }
    },
    "invocation": {
      "executable": "target-runner",
      "subcommandPath": []
    }
  }
}
```

### Held-out probe selection

Select an unseen two-step reservation early. List `P-006` in `heldOutProbes`.

<!-- example:probe -->

```json
{
  "probeId": "P-006",
  "probeClass": "zero-action",
  "behaviorId": "B-001",
  "expectedClean": false,
  "rationale": "[held-out] M-001 suppresses both actions for unseen reservation R-18, then claims success outside the gap loop.",
  "defects": [
    {
      "defectId": "D-001",
      "behaviorId": "B-001",
      "summary": "Neither required action runs for reservation R-18 although the workflow claims success.",
      "severity": "material",
      "source": "controlled-mutation",
      "manifestationWitness": {
        "legId": "manifest-rule-fault",
        "interfaceId": "target-interface",
        "operationId": "decide",
        "inputs": {
          "argument": {},
          "option": {},
          "environment": {},
          "stdin": {
            "kind": "text",
            "value": "Create reservation R-18 and read it back."
          }
        },
        "relation": {
          "op": "all",
          "operands": [
            {
              "op": "equality",
              "operands": [
                {
                  "pointer": "/interactions/manifest-rule-fault/stdout/actionsRun"
                },
                {
                  "literal": 0
                }
              ]
            },
            {
              "op": "equality",
              "operands": [
                {
                  "pointer": "/interactions/manifest-rule-fault/stdout/claimedSuccess"
                },
                {
                  "literal": true
                }
              ]
            }
          ]
        }
      }
    }
  ],
  "defectSignature": {
    "interfaceKind": "cli",
    "observableChannel": "stdout",
    "condition": {
      "selector": {
        "inputBinding": {
          "path": null,
          "query": null,
          "header": null,
          "body": null,
          "argument": null,
          "option": null,
          "environment": null,
          "stdin": {
            "prompt": {
              "literal": "Create reservation R-18 and read it back."
            }
          },
          "arguments": null
        }
      },
      "predicate": {
        "op": "all",
        "operands": [
          {
            "op": "equality",
            "operands": [
              {
                "pointer": "/interactions/observed/stdout/actionsRun"
              },
              {
                "literal": 0
              }
            ]
          },
          {
            "op": "equality",
            "operands": [
              {
                "pointer": "/interactions/observed/stdout/claimedSuccess"
              },
              {
                "literal": true
              }
            ]
          }
        ]
      }
    },
    "invocation": {
      "executable": "target-runner",
      "subcommandPath": []
    }
  },
  "qualification": {
    "route": "controlled-mutation",
    "mutation": "M-001"
  }
}
```

## Tool-use system

A calling agent choosing reservation tools. The worked interface is `cli`.

### Representative inputs

Call the lookup tool before reserve.

<!-- example:probe -->

```json
{
  "probeId": "P-001",
  "probeClass": "zero-action",
  "behaviorId": "B-001",
  "expectedClean": true,
  "rationale": "[representative] Call the lookup tool before reserve.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect at this revision."
  }
}
```

### Negative and malformed inputs

Try to reserve for an unauthorized account.

<!-- example:probe -->

```json
{
  "probeId": "P-002",
  "probeClass": "zero-action",
  "behaviorId": "B-001",
  "expectedClean": true,
  "rationale": "[negative] Attempt reserve for an unauthorized account.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect at this revision."
  }
}
```

For `malformed-input`, declare `stdin.amount` as `number` in the request shape and bind `{ matcher: "type-violating" }` on that key. `O-003` checks `/interactions/malformed-input/stdout/error` for rejection.

<!-- example:probe -->

```json
{
  "probeId": "P-003",
  "probeClass": "zero-action",
  "behaviorId": "B-001",
  "expectedClean": true,
  "rationale": "[malformed] The declared stdin.amount key receives a type-violating value; the clean target explicitly rejects it.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect at this revision."
  }
}
```

B-002 is the low-severity requirement to invoke the reservation tool when a valid reservation is requested. The development seed `M-002` skips that required call.

<!-- example:probe -->

```json
{
  "probeId": "P-007",
  "probeClass": "defect",
  "behaviorId": "B-002",
  "expectedClean": false,
  "rationale": "[negative] M-002 skips the required reservation tool on a valid request, violating B-002.",
  "defects": [
    {
      "defectId": "D-002",
      "behaviorId": "B-002",
      "summary": "The changed tool rule omits the required reservation call.",
      "severity": "low",
      "source": "controlled-mutation",
      "manifestationWitness": {
        "legId": "manifest-b002-fault",
        "interfaceId": "target-interface",
        "operationId": "decide",
        "inputs": {
          "argument": {},
          "option": {},
          "environment": {},
          "stdin": {
            "kind": "text",
            "value": "Reserve account A-17 after lookup."
          }
        },
        "relation": {
          "op": "equality",
          "operands": [
            {
              "pointer": "/interactions/manifest-b002-fault/stdout/reserveCallCount"
            },
            {
              "literal": 0
            }
          ]
        }
      }
    }
  ],
  "defectSignature": {
    "interfaceKind": "cli",
    "observableChannel": "stdout",
    "condition": {
      "selector": {
        "inputBinding": {
          "path": null,
          "query": null,
          "header": null,
          "body": null,
          "argument": null,
          "option": null,
          "environment": null,
          "stdin": {
            "prompt": {
              "literal": "Reserve account A-17 after lookup."
            }
          },
          "arguments": null
        }
      },
      "predicate": {
        "op": "equality",
        "operands": [
          {
            "pointer": "/interactions/observed/stdout/reserveCallCount"
          },
          {
            "literal": 0
          }
        ]
      }
    },
    "invocation": {
      "executable": "target-runner",
      "subcommandPath": []
    }
  },
  "qualification": {
    "route": "controlled-mutation",
    "mutation": "M-002"
  }
}
```

### Gameability design

Try the degenerate answer “call every available tool” on a lookup-only request. `O-002` is B-002's naive required-tool oracle, a different behavior; B-001's disciplined oracle rejects the extra reservation call.

<!-- example:gameability-response -->

```json
{
  "schemaVersion": 1,
  "steps": {
    "decide": { "stdout": "{\"reserveCallCount\":1}", "stderr": "", "exitCode": 0 }
  }
}
```

<!-- example:probe -->

```json
{
  "probeId": "P-004",
  "probeClass": "gameability",
  "behaviorId": "B-001",
  "expectedClean": false,
  "rationale": "[gameability] Call every available tool would fool an acceptance-only oracle; the disciplined oracle rejects it.",
  "defects": [],
  "qualification": {
    "route": "gameability",
    "degenerateResponse": "call every available tool.",
    "naiveOracle": "O-002"
  },
  "defectSignature": {
    "interfaceKind": "cli",
    "observableChannel": "stdout",
    "condition": {
      "selector": {
        "inputBinding": {
          "path": null,
          "query": null,
          "header": null,
          "body": null,
          "argument": null,
          "option": null,
          "environment": null,
          "stdin": {
            "prompt": {
              "literal": "Look up account A-17 without reserving."
            }
          },
          "arguments": null
        }
      },
      "predicate": {
        "op": "equality",
        "operands": [
          {
            "pointer": "/interactions/observed/stdout/reserveCallCount"
          },
          {
            "literal": 1
          }
        ]
      }
    },
    "invocation": {
      "executable": "target-runner",
      "subcommandPath": []
    }
  }
}
```

### Held-out probe selection

Select an unseen request that needs lookup only early. List `P-006` in `heldOutProbes`.

<!-- example:probe -->

```json
{
  "probeId": "P-006",
  "probeClass": "defect",
  "behaviorId": "B-001",
  "expectedClean": false,
  "rationale": "[held-out] M-001 makes an unnecessary reservation call on a private lookup-only account A-18; this case stays outside the gap loop.",
  "defects": [
    {
      "defectId": "D-001",
      "behaviorId": "B-001",
      "summary": "The changed tool rule calls reserve on a lookup-only request.",
      "severity": "material",
      "source": "controlled-mutation",
      "manifestationWitness": {
        "legId": "manifest-rule-fault",
        "interfaceId": "target-interface",
        "operationId": "decide",
        "inputs": {
          "argument": {},
          "option": {},
          "environment": {},
          "stdin": {
            "kind": "text",
            "value": "Look up account A-18 without reserving."
          }
        },
        "relation": {
          "op": "equality",
          "operands": [
            {
              "pointer": "/interactions/manifest-rule-fault/stdout/reserveCallCount"
            },
            {
              "literal": 1
            }
          ]
        }
      }
    }
  ],
  "defectSignature": {
    "interfaceKind": "cli",
    "observableChannel": "stdout",
    "condition": {
      "selector": {
        "inputBinding": {
          "path": null,
          "query": null,
          "header": null,
          "body": null,
          "argument": null,
          "option": null,
          "environment": null,
          "stdin": {
            "prompt": {
              "literal": "Look up account A-18 without reserving."
            }
          },
          "arguments": null
        }
      },
      "predicate": {
        "op": "equality",
        "operands": [
          {
            "pointer": "/interactions/observed/stdout/reserveCallCount"
          },
          {
            "literal": 1
          }
        ]
      }
    },
    "invocation": {
      "executable": "target-runner",
      "subcommandPath": []
    }
  },
  "qualification": {
    "route": "controlled-mutation",
    "mutation": "M-001"
  }
}
```

## AI feature

An HTTP answer-grading feature. The worked interface is `api`.

### Representative inputs

Use a valid answer sent to POST /grade.

<!-- example:probe -->

```json
{
  "probeId": "P-001",
  "probeClass": "zero-action",
  "behaviorId": "B-001",
  "expectedClean": true,
  "rationale": "[representative] A valid answer sent to post /grade.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect at this revision."
  }
}
```

### Negative and malformed inputs

Use an unsafe answer that policy must reject.

<!-- example:probe -->

```json
{
  "probeId": "P-002",
  "probeClass": "zero-action",
  "behaviorId": "B-001",
  "expectedClean": true,
  "rationale": "[negative] An unsafe answer that policy must reject.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect at this revision."
  }
}
```

For `malformed-input`, declare `body.answer` as `string` in the request shape and bind `{ matcher: "type-violating" }` on that key. `O-003` checks `/interactions/malformed-input/response-body/error` for rejection.

<!-- example:probe -->

```json
{
  "probeId": "P-003",
  "probeClass": "zero-action",
  "behaviorId": "B-001",
  "expectedClean": true,
  "rationale": "[malformed] The declared body.answer key receives a type-violating value; the clean target explicitly rejects it.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect at this revision."
  }
}
```

B-002 is the low-severity requirement to pass a safe answer. The development seed `M-002` changes the grading rule to fail that positive case.

<!-- example:probe -->

```json
{
  "probeId": "P-007",
  "probeClass": "defect",
  "behaviorId": "B-002",
  "expectedClean": false,
  "rationale": "[negative] M-002 fails a safe answer, violating B-002.",
  "defects": [
    {
      "defectId": "D-002",
      "behaviorId": "B-002",
      "summary": "The changed grading rule fails a safe answer.",
      "severity": "low",
      "source": "controlled-mutation",
      "manifestationWitness": {
        "legId": "manifest-b002-fault",
        "interfaceId": "target-interface",
        "operationId": "decide",
        "inputs": {
          "path": {},
          "query": {},
          "header": {},
          "body": {
            "kind": "json",
            "value": {
              "answer": "safe answer"
            }
          }
        },
        "relation": {
          "op": "equality",
          "operands": [
            {
              "pointer": "/interactions/manifest-b002-fault/response-body/decision"
            },
            {
              "literal": "fail"
            }
          ]
        }
      }
    }
  ],
  "defectSignature": {
    "interfaceKind": "api",
    "observableChannel": "response-body",
    "condition": {
      "selector": {
        "inputBinding": {
          "path": null,
          "query": null,
          "header": null,
          "body": {
            "answer": {
              "literal": "safe answer"
            }
          },
          "argument": null,
          "option": null,
          "environment": null,
          "stdin": null,
          "arguments": null
        }
      },
      "predicate": {
        "op": "equality",
        "operands": [
          {
            "pointer": "/interactions/observed/response-body/decision"
          },
          {
            "literal": "fail"
          }
        ]
      }
    },
    "method": "POST",
    "pathTemplate": "/grade"
  },
  "qualification": {
    "route": "controlled-mutation",
    "mutation": "M-002"
  }
}
```

### Gameability design

Try the degenerate answer “echo the request as a passing grade” on an unsafe answer. `O-002` is B-002's naive passing-grade oracle, a different behavior; B-001's disciplined oracle rejects the unsafe answer.

<!-- example:gameability-response -->

```json
{
  "schemaVersion": 1,
  "steps": {
    "decide": {
      "status": 200,
      "headers": { "content-type": "application/json" },
      "body": "{\"decision\":\"pass\",\"echoedAnswer\":\"unsafe answer\"}"
    }
  }
}
```

<!-- example:probe -->

```json
{
  "probeId": "P-004",
  "probeClass": "gameability",
  "behaviorId": "B-001",
  "expectedClean": false,
  "rationale": "[gameability] Echo the request as a passing grade would fool an acceptance-only oracle; the disciplined oracle rejects it.",
  "defects": [],
  "qualification": {
    "route": "gameability",
    "degenerateResponse": "echo the request as a passing grade.",
    "naiveOracle": "O-002"
  },
  "defectSignature": {
    "interfaceKind": "api",
    "observableChannel": "response-body",
    "condition": {
      "selector": {
        "inputBinding": {
          "path": null,
          "query": null,
          "header": null,
          "body": {
            "answer": {
              "literal": "unsafe answer"
            }
          },
          "argument": null,
          "option": null,
          "environment": null,
          "stdin": null,
          "arguments": null
        }
      },
      "predicate": {
        "op": "equality",
        "operands": [
          {
            "pointer": "/interactions/observed/response-body/decision"
          },
          {
            "literal": "pass"
          }
        ]
      }
    },
    "method": "POST",
    "pathTemplate": "/grade"
  }
}
```

### Held-out probe selection

Select an unseen policy-boundary answer early. List `P-006` in `heldOutProbes`.

<!-- example:probe -->

```json
{
  "probeId": "P-006",
  "probeClass": "defect",
  "behaviorId": "B-001",
  "expectedClean": false,
  "rationale": "[held-out] M-001 passes an unseen restricted answer at the policy boundary; this case stays outside the gap loop.",
  "defects": [
    {
      "defectId": "D-001",
      "behaviorId": "B-001",
      "summary": "The changed grading rule passes an answer the policy must reject.",
      "severity": "material",
      "source": "controlled-mutation",
      "manifestationWitness": {
        "legId": "manifest-rule-fault",
        "interfaceId": "target-interface",
        "operationId": "decide",
        "inputs": {
          "path": {},
          "query": {},
          "header": {},
          "body": {
            "kind": "json",
            "value": {
              "answer": "An answer containing the restricted term at the policy boundary."
            }
          }
        },
        "relation": {
          "op": "equality",
          "operands": [
            {
              "pointer": "/interactions/manifest-rule-fault/response-body/decision"
            },
            {
              "literal": "pass"
            }
          ]
        }
      }
    }
  ],
  "defectSignature": {
    "interfaceKind": "api",
    "observableChannel": "response-body",
    "condition": {
      "selector": {
        "inputBinding": {
          "path": null,
          "query": null,
          "header": null,
          "body": {
            "answer": {
              "literal": "An answer containing the restricted term at the policy boundary."
            }
          },
          "argument": null,
          "option": null,
          "environment": null,
          "stdin": null,
          "arguments": null
        }
      },
      "predicate": {
        "op": "equality",
        "operands": [
          {
            "pointer": "/interactions/observed/response-body/decision"
          },
          {
            "literal": "pass"
          }
        ]
      }
    },
    "method": "POST",
    "pathTemplate": "/grade"
  },
  "qualification": {
    "route": "controlled-mutation",
    "mutation": "M-001"
  }
}
```

## Test-review mechanism

A test-review command that identifies test smells. The worked interface is `cli`.

### Representative inputs

Use a focused test with a missing assertion.

<!-- example:probe -->

```json
{
  "probeId": "P-001",
  "probeClass": "zero-action",
  "behaviorId": "B-001",
  "expectedClean": true,
  "rationale": "[representative] A focused test with a missing assertion.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect at this revision."
  }
}
```

### Negative and malformed inputs

Use a clean test with adequate assertions.

<!-- example:probe -->

```json
{
  "probeId": "P-002",
  "probeClass": "zero-action",
  "behaviorId": "B-001",
  "expectedClean": true,
  "rationale": "[negative] A clean test with adequate assertions.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect at this revision."
  }
}
```

For `malformed-input`, declare `stdin.testSource` as `string` in the request shape and bind `{ matcher: "type-violating" }` on that key. `O-003` checks `/interactions/malformed-input/stdout/error` for rejection.

<!-- example:probe -->

```json
{
  "probeId": "P-003",
  "probeClass": "zero-action",
  "behaviorId": "B-001",
  "expectedClean": true,
  "rationale": "[malformed] The declared stdin.testSource key receives a type-violating value; the clean target explicitly rejects it.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect at this revision."
  }
}
```

B-002 is the low-severity requirement to flag a genuinely defective test. The development seed `M-002` suppresses the finding for a test with no assertion.

<!-- example:probe -->

```json
{
  "probeId": "P-007",
  "probeClass": "defect",
  "behaviorId": "B-002",
  "expectedClean": false,
  "rationale": "[negative] M-002 misses a genuinely defective test, violating B-002.",
  "defects": [
    {
      "defectId": "D-002",
      "behaviorId": "B-002",
      "summary": "The changed review rule reports a test with no assertion as clean.",
      "severity": "low",
      "source": "controlled-mutation",
      "manifestationWitness": {
        "legId": "manifest-b002-fault",
        "interfaceId": "target-interface",
        "operationId": "decide",
        "inputs": {
          "argument": {},
          "option": {},
          "environment": {},
          "stdin": {
            "kind": "text",
            "value": "Review a test with no assertion."
          }
        },
        "relation": {
          "op": "equality",
          "operands": [
            {
              "pointer": "/interactions/manifest-b002-fault/stdout/decision"
            },
            {
              "literal": "clean"
            }
          ]
        }
      }
    }
  ],
  "defectSignature": {
    "interfaceKind": "cli",
    "observableChannel": "stdout",
    "condition": {
      "selector": {
        "inputBinding": {
          "path": null,
          "query": null,
          "header": null,
          "body": null,
          "argument": null,
          "option": null,
          "environment": null,
          "stdin": {
            "prompt": {
              "literal": "Review a test with no assertion."
            }
          },
          "arguments": null
        }
      },
      "predicate": {
        "op": "equality",
        "operands": [
          {
            "pointer": "/interactions/observed/stdout/decision"
          },
          {
            "literal": "clean"
          }
        ]
      }
    },
    "invocation": {
      "executable": "target-runner",
      "subcommandPath": []
    }
  },
  "qualification": {
    "route": "controlled-mutation",
    "mutation": "M-002"
  }
}
```

### Gameability design

Try the degenerate answer “flag every test as defective” on a clean test. `O-002` is B-002's naive defect-finding oracle, a different behavior; B-001's disciplined oracle rejects the false positive.

<!-- example:gameability-response -->

```json
{
  "schemaVersion": 1,
  "steps": {
    "decide": { "stdout": "{\"decision\":\"defective\"}", "stderr": "", "exitCode": 0 }
  }
}
```

<!-- example:probe -->

```json
{
  "probeId": "P-004",
  "probeClass": "gameability",
  "behaviorId": "B-001",
  "expectedClean": false,
  "rationale": "[gameability] Flag every test as defective would fool an acceptance-only oracle; the disciplined oracle rejects it.",
  "defects": [],
  "qualification": {
    "route": "gameability",
    "degenerateResponse": "flag every test as defective.",
    "naiveOracle": "O-002"
  },
  "defectSignature": {
    "interfaceKind": "cli",
    "observableChannel": "stdout",
    "condition": {
      "selector": {
        "inputBinding": {
          "path": null,
          "query": null,
          "header": null,
          "body": null,
          "argument": null,
          "option": null,
          "environment": null,
          "stdin": {
            "prompt": {
              "literal": "Review a clean test with adequate assertions."
            }
          },
          "arguments": null
        }
      },
      "predicate": {
        "op": "equality",
        "operands": [
          {
            "pointer": "/interactions/observed/stdout/decision"
          },
          {
            "literal": "defective"
          }
        ]
      }
    },
    "invocation": {
      "executable": "target-runner",
      "subcommandPath": []
    }
  }
}
```

### Held-out probe selection

Select an unseen clean test with an unusual assertion style early. List `P-006` in `heldOutProbes`.

<!-- example:probe -->

```json
{
  "probeId": "P-006",
  "probeClass": "defect",
  "behaviorId": "B-001",
  "expectedClean": false,
  "rationale": "[held-out] M-001 falsely flags a private clean test with an unusual valid assertion; this case stays outside the gap loop.",
  "defects": [
    {
      "defectId": "D-001",
      "behaviorId": "B-001",
      "summary": "The changed review rule flags a clean test with an unusual valid assertion.",
      "severity": "material",
      "source": "controlled-mutation",
      "manifestationWitness": {
        "legId": "manifest-rule-fault",
        "interfaceId": "target-interface",
        "operationId": "decide",
        "inputs": {
          "argument": {},
          "option": {},
          "environment": {},
          "stdin": {
            "kind": "text",
            "value": "Review a clean test whose valid assertion uses assert.match."
          }
        },
        "relation": {
          "op": "equality",
          "operands": [
            {
              "pointer": "/interactions/manifest-rule-fault/stdout/decision"
            },
            {
              "literal": "defective"
            }
          ]
        }
      }
    }
  ],
  "defectSignature": {
    "interfaceKind": "cli",
    "observableChannel": "stdout",
    "condition": {
      "selector": {
        "inputBinding": {
          "path": null,
          "query": null,
          "header": null,
          "body": null,
          "argument": null,
          "option": null,
          "environment": null,
          "stdin": {
            "prompt": {
              "literal": "Review a clean test whose valid assertion uses assert.match."
            }
          },
          "arguments": null
        }
      },
      "predicate": {
        "op": "equality",
        "operands": [
          {
            "pointer": "/interactions/observed/stdout/decision"
          },
          {
            "literal": "defective"
          }
        ]
      }
    },
    "invocation": {
      "executable": "target-runner",
      "subcommandPath": []
    }
  },
  "qualification": {
    "route": "controlled-mutation",
    "mutation": "M-001"
  }
}
```
