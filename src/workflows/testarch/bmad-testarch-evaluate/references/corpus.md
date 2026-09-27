# Corpus

Design the corpus from the confirmed `requirements.md` and inspection record. A probe file holds the authored subset of eval-quality's probe: `probes/P-NNN.probe.json`. The tagged files below are separate worked evaluations for the six target kinds; each ID restarts within its own evaluation. Replace the worked data with observed target facts, then qualify every defect and gameability probe before treating it as evidence.

## Corpus rules and layout

- Put representative inputs in `corpus/` and refer to them from the interaction plan. Add negative and malformed inputs that distinguish a disciplined response from a plausible shortcut.
- Keep at least one `zero-action` probe with `expectedClean: true` and no defects as a clean control. For every mandatory-action behavior, add a `zero-action` defect probe whose signature exposes the missing action.
- For every behavior, plan one seeded-defect probe or record its refusal with the reason. A non-canary defect carries a `manifestationWitness`; an AD-19 signature addresses the exit code or descriptor-nominated stream or response body. A file-only manifestation is refused until an allowed channel exposes it.
- For every rubric- or judgment-governed behavior, include a `gameability` probe whose degenerate response satisfies a naive oracle and fails the disciplined oracle. Commit the response bytes at `corpus/gameability/<probeId>.json` and declare the naive oracle in the probe's qualification.
- Choose held-out probes before writing oracles. List at least one per `material` or `critical` behavior in `evaluation.json`'s `heldOutProbes`. The gap loop reads `gap-view.json`, which contains only held-out ID, class and outcome, and must not read held-out input or expected answer. Run held-out probes as a separate partition (AD-22).

Keep the committed layout at `{tea_evaluations_folder}/<evaluationId>/`: `contract.json`, `evaluation.json`, `requirements.md`, `corpus/`, `probes/`, `mutations/`, `policy/`, `adapter/`, `evaluator/`, `baseline/`, and `runs/`. The authored `corpus-index.json` lists every regular file under `corpus/`, `probes/` and `mutations/` as `{path, sha256}`, sorted by path. `tea-evaluate digest --evaluation <folder>` writes the index and prints eval-quality's `digestArtifact` over it as `corpusDigest`; `tea-evaluate check` refuses a stale index. Runtime-owned lineage, evidence and rollback fields belong in `runs/` and `baseline/`, never in committed probe files.

The negative and malformed examples are clean controls: a valid refusal is expected. Each `P-006` seed changes one adopter-owned rule through `M-001`. Qualify its baseline pass, mutated fail and rollback; adjust its witness and signature to the observed channel, or record a refusal. Select `[held-out]` cases before oracle design and keep their content outside the gap loop. Gameability signatures are illustrative until qualified.

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
  "rationale": "[representative] A normal billing request; the clean target must meet the confirmed behavior.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect in the agent interface at this revision."
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
  "rationale": "[negative] A request to issue a refund without authorization; the clean target must meet the confirmed behavior.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect in the agent interface at this revision."
  }
}
```

Also use a request with no customer identifier. Apply the `malformed-input` rule.

<!-- example:probe -->

```json
{
  "probeId": "P-003",
  "probeClass": "zero-action",
  "behaviorId": "B-001",
  "expectedClean": true,
  "rationale": "[malformed] A request with no customer identifier; the clean target must meet the confirmed behavior.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect in the agent interface at this revision."
  }
}
```

<!-- example:probe -->

```json
{
  "probeId": "P-006",
  "probeClass": "defect",
  "behaviorId": "B-001",
  "expectedClean": false,
  "rationale": "[negative] M-001 changes the agent rule so a forbidden case receives an incorrect decision.",
  "defects": [
    {
      "defectId": "D-001",
      "behaviorId": "B-001",
      "summary": "The changed rule yields an incorrect decision for the negative case.",
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
            "value": "Exercise the documented decision."
          }
        },
        "relation": {
          "op": "equality",
          "operands": [
            {
              "pointer": "/interactions/manifest-rule-fault/stdout/decision"
            },
            {
              "literal": "incorrect"
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
              "matcher": "any"
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
            "literal": "incorrect"
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

### Gameability design

Try the degenerate answer “approve every request.” `O-001` stands for the naive oracle; replace it during contract authoring.

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
    "naiveOracle": "O-001"
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
              "matcher": "any"
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
            "literal": "degenerate"
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

Select a private refund-boundary request before oracles are authored. List `P-005` in `heldOutProbes`.

<!-- example:probe -->

```json
{
  "probeId": "P-005",
  "probeClass": "zero-action",
  "behaviorId": "B-001",
  "expectedClean": true,
  "rationale": "[held-out] A private refund-boundary request; the clean target must meet the confirmed behavior.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect in the agent interface at this revision."
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
  "rationale": "[representative] An eligible amount at the documented limit; the clean target must meet the confirmed behavior.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect in the skill interface at this revision."
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
  "behaviorId": "B-001",
  "expectedClean": true,
  "rationale": "[negative] An over-limit amount; the clean target must meet the confirmed behavior.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect in the skill interface at this revision."
  }
}
```

Also use a nonnumeric amount. Apply the `malformed-input` rule.

<!-- example:probe -->

```json
{
  "probeId": "P-003",
  "probeClass": "zero-action",
  "behaviorId": "B-001",
  "expectedClean": true,
  "rationale": "[malformed] A nonnumeric amount; the clean target must meet the confirmed behavior.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect in the skill interface at this revision."
  }
}
```

<!-- example:probe -->

```json
{
  "probeId": "P-006",
  "probeClass": "defect",
  "behaviorId": "B-001",
  "expectedClean": false,
  "rationale": "[negative] M-001 changes the skill rule so a forbidden case receives an incorrect decision.",
  "defects": [
    {
      "defectId": "D-001",
      "behaviorId": "B-001",
      "summary": "The changed rule yields an incorrect decision for the negative case.",
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
            "value": "Exercise the documented decision."
          }
        },
        "relation": {
          "op": "equality",
          "operands": [
            {
              "pointer": "/interactions/manifest-rule-fault/stdout/decision"
            },
            {
              "literal": "incorrect"
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
              "matcher": "any"
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
            "literal": "incorrect"
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

### Gameability design

Try the degenerate answer “decline every request.” `O-001` stands for the naive oracle; replace it during contract authoring.

<!-- example:probe -->

```json
{
  "probeId": "P-004",
  "probeClass": "gameability",
  "behaviorId": "B-001",
  "expectedClean": false,
  "rationale": "[gameability] Decline every request would fool an acceptance-only oracle; the disciplined oracle rejects it.",
  "defects": [],
  "qualification": {
    "route": "gameability",
    "degenerateResponse": "decline every request.",
    "naiveOracle": "O-001"
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
              "matcher": "any"
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
            "literal": "degenerate"
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

Select an unseen request one unit above the limit before oracles are authored. List `P-005` in `heldOutProbes`.

<!-- example:probe -->

```json
{
  "probeId": "P-005",
  "probeClass": "zero-action",
  "behaviorId": "B-001",
  "expectedClean": true,
  "rationale": "[held-out] An unseen request one unit above the limit; the clean target must meet the confirmed behavior.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect in the skill interface at this revision."
  }
}
```

## Workflow

A create then read-back reservation workflow. The worked interface is `cli`.

### Representative inputs

Use create a reservation and read its captured identifier.

<!-- example:probe -->

```json
{
  "probeId": "P-001",
  "probeClass": "zero-action",
  "behaviorId": "B-001",
  "expectedClean": true,
  "rationale": "[representative] Create a reservation and read its captured identifier; the clean target must meet the confirmed behavior.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect in the workflow interface at this revision."
  }
}
```

### Negative and malformed inputs

Use read before create.

<!-- example:probe -->

```json
{
  "probeId": "P-002",
  "probeClass": "zero-action",
  "behaviorId": "B-001",
  "expectedClean": true,
  "rationale": "[negative] Read before create; the clean target must meet the confirmed behavior.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect in the workflow interface at this revision."
  }
}
```

Also use a missing captured identifier. Apply the `malformed-input` rule.

<!-- example:probe -->

```json
{
  "probeId": "P-003",
  "probeClass": "zero-action",
  "behaviorId": "B-001",
  "expectedClean": true,
  "rationale": "[malformed] A missing captured identifier; the clean target must meet the confirmed behavior.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect in the workflow interface at this revision."
  }
}
```

<!-- example:probe -->

```json
{
  "probeId": "P-006",
  "probeClass": "zero-action",
  "behaviorId": "B-001",
  "expectedClean": false,
  "rationale": "[negative] M-001 skips the mandatory read-back step after create; stdout reports the missing verification.",
  "defects": [
    {
      "defectId": "D-001",
      "behaviorId": "B-001",
      "summary": "The workflow omits the mandatory read-back after create.",
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
            "value": "Exercise the documented decision."
          }
        },
        "relation": {
          "op": "equality",
          "operands": [
            {
              "pointer": "/interactions/manifest-rule-fault/stdout/readBack"
            },
            {
              "literal": false
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
              "matcher": "any"
            }
          },
          "arguments": null
        }
      },
      "predicate": {
        "op": "equality",
        "operands": [
          {
            "pointer": "/interactions/observed/stdout/readBack"
          },
          {
            "literal": false
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

### Gameability design

Try the degenerate answer “claim every step succeeded without a read-back.” `O-001` stands for the naive oracle; replace it during contract authoring.

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
    "naiveOracle": "O-001"
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
              "matcher": "any"
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
            "literal": "degenerate"
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

Select an unseen two-step reservation before oracles are authored. List `P-005` in `heldOutProbes`.

<!-- example:probe -->

```json
{
  "probeId": "P-005",
  "probeClass": "zero-action",
  "behaviorId": "B-001",
  "expectedClean": true,
  "rationale": "[held-out] An unseen two-step reservation; the clean target must meet the confirmed behavior.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect in the workflow interface at this revision."
  }
}
```

## Tool-use system

A calling agent choosing reservation tools. The worked interface is `cli`.

### Representative inputs

Use call the lookup tool before reserve.

<!-- example:probe -->

```json
{
  "probeId": "P-001",
  "probeClass": "zero-action",
  "behaviorId": "B-001",
  "expectedClean": true,
  "rationale": "[representative] Call the lookup tool before reserve; the clean target must meet the confirmed behavior.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect in the tool-use system interface at this revision."
  }
}
```

### Negative and malformed inputs

Use attempt reserve for an unauthorized account.

<!-- example:probe -->

```json
{
  "probeId": "P-002",
  "probeClass": "zero-action",
  "behaviorId": "B-001",
  "expectedClean": true,
  "rationale": "[negative] Attempt reserve for an unauthorized account; the clean target must meet the confirmed behavior.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect in the tool-use system interface at this revision."
  }
}
```

Also use tool arguments with a malformed amount. Apply the `malformed-input` rule.

<!-- example:probe -->

```json
{
  "probeId": "P-003",
  "probeClass": "zero-action",
  "behaviorId": "B-001",
  "expectedClean": true,
  "rationale": "[malformed] Tool arguments with a malformed amount; the clean target must meet the confirmed behavior.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect in the tool-use system interface at this revision."
  }
}
```

<!-- example:probe -->

```json
{
  "probeId": "P-006",
  "probeClass": "defect",
  "behaviorId": "B-001",
  "expectedClean": false,
  "rationale": "[negative] M-001 changes the tool-use system rule so a forbidden case receives an incorrect decision.",
  "defects": [
    {
      "defectId": "D-001",
      "behaviorId": "B-001",
      "summary": "The changed rule yields an incorrect decision for the negative case.",
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
            "value": "Exercise the documented decision."
          }
        },
        "relation": {
          "op": "equality",
          "operands": [
            {
              "pointer": "/interactions/manifest-rule-fault/stdout/decision"
            },
            {
              "literal": "incorrect"
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
              "matcher": "any"
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
            "literal": "incorrect"
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

### Gameability design

Try the degenerate answer “call every available tool.” `O-001` stands for the naive oracle; replace it during contract authoring.

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
    "naiveOracle": "O-001"
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
              "matcher": "any"
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
            "literal": "degenerate"
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

Select an unseen request that needs lookup only before oracles are authored. List `P-005` in `heldOutProbes`.

<!-- example:probe -->

```json
{
  "probeId": "P-005",
  "probeClass": "zero-action",
  "behaviorId": "B-001",
  "expectedClean": true,
  "rationale": "[held-out] An unseen request that needs lookup only; the clean target must meet the confirmed behavior.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect in the tool-use system interface at this revision."
  }
}
```

## AI feature

An HTTP answer-grading feature in a web application. The worked interface is `api`.

### Representative inputs

Use a valid answer sent to POST /grade.

<!-- example:probe -->

```json
{
  "probeId": "P-001",
  "probeClass": "zero-action",
  "behaviorId": "B-001",
  "expectedClean": true,
  "rationale": "[representative] A valid answer sent to post /grade; the clean target must meet the confirmed behavior.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect in the ai feature interface at this revision."
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
  "rationale": "[negative] An unsafe answer that policy must reject; the clean target must meet the confirmed behavior.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect in the ai feature interface at this revision."
  }
}
```

Also use a request body with no answer. Apply the `malformed-input` rule.

<!-- example:probe -->

```json
{
  "probeId": "P-003",
  "probeClass": "zero-action",
  "behaviorId": "B-001",
  "expectedClean": true,
  "rationale": "[malformed] A request body with no answer; the clean target must meet the confirmed behavior.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect in the ai feature interface at this revision."
  }
}
```

<!-- example:probe -->

```json
{
  "probeId": "P-006",
  "probeClass": "defect",
  "behaviorId": "B-001",
  "expectedClean": false,
  "rationale": "[negative] M-001 changes the ai feature rule so a forbidden case receives an incorrect decision.",
  "defects": [
    {
      "defectId": "D-001",
      "behaviorId": "B-001",
      "summary": "The changed rule yields an incorrect decision for the negative case.",
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
            "kind": "absent"
          }
        },
        "relation": {
          "op": "equality",
          "operands": [
            {
              "pointer": "/interactions/manifest-rule-fault/response-body/decision"
            },
            {
              "literal": "incorrect"
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
              "matcher": "any"
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
            "literal": "incorrect"
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

### Gameability design

Try the degenerate answer “echo the request as a passing grade.” `O-001` stands for the naive oracle; replace it during contract authoring.

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
    "naiveOracle": "O-001"
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
              "matcher": "any"
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
            "literal": "degenerate"
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

Select an unseen policy-boundary answer before oracles are authored. List `P-005` in `heldOutProbes`.

<!-- example:probe -->

```json
{
  "probeId": "P-005",
  "probeClass": "zero-action",
  "behaviorId": "B-001",
  "expectedClean": true,
  "rationale": "[held-out] An unseen policy-boundary answer; the clean target must meet the confirmed behavior.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect in the ai feature interface at this revision."
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
  "rationale": "[representative] A focused test with a missing assertion; the clean target must meet the confirmed behavior.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect in the test-review mechanism interface at this revision."
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
  "rationale": "[negative] A clean test with adequate assertions; the clean target must meet the confirmed behavior.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect in the test-review mechanism interface at this revision."
  }
}
```

Also use a truncated test file. Apply the `malformed-input` rule.

<!-- example:probe -->

```json
{
  "probeId": "P-003",
  "probeClass": "zero-action",
  "behaviorId": "B-001",
  "expectedClean": true,
  "rationale": "[malformed] A truncated test file; the clean target must meet the confirmed behavior.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect in the test-review mechanism interface at this revision."
  }
}
```

<!-- example:probe -->

```json
{
  "probeId": "P-006",
  "probeClass": "defect",
  "behaviorId": "B-001",
  "expectedClean": false,
  "rationale": "[negative] M-001 changes the test-review mechanism rule so a forbidden case receives an incorrect decision.",
  "defects": [
    {
      "defectId": "D-001",
      "behaviorId": "B-001",
      "summary": "The changed rule yields an incorrect decision for the negative case.",
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
            "value": "Exercise the documented decision."
          }
        },
        "relation": {
          "op": "equality",
          "operands": [
            {
              "pointer": "/interactions/manifest-rule-fault/stdout/decision"
            },
            {
              "literal": "incorrect"
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
              "matcher": "any"
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
            "literal": "incorrect"
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

### Gameability design

Try the degenerate answer “flag every test as defective.” `O-001` stands for the naive oracle; replace it during contract authoring.

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
    "naiveOracle": "O-001"
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
              "matcher": "any"
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
            "literal": "degenerate"
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

Select an unseen clean test with an unusual assertion style before oracles are authored. List `P-005` in `heldOutProbes`.

<!-- example:probe -->

```json
{
  "probeId": "P-005",
  "probeClass": "zero-action",
  "behaviorId": "B-001",
  "expectedClean": true,
  "rationale": "[held-out] An unseen clean test with an unusual assertion style; the clean target must meet the confirmed behavior.",
  "defects": [],
  "qualification": {
    "route": "clean-control",
    "noKnownDefectStatement": "No known defect in the test-review mechanism interface at this revision."
  }
}
```
