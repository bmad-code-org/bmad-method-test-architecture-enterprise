# Corpus

Design from the confirmed `requirements.md` and inspection record. `probes/P-NNN.probe.json` holds the authored eval-quality subset. Each target kind below is a separate evaluation. Replace example data with observed facts and qualify defect and gameability probes before using them as evidence.

## Corpus rules and layout

- Put representative inputs in `corpus/` and refer to them from the interaction plan. Add negative and malformed inputs that distinguish a disciplined response from a plausible shortcut.
- Keep at least one `zero-action` probe with `expectedClean: true` and no defects as a clean control. For every mandatory-action behavior, add a `zero-action` defect probe whose signature exposes the missing action.
- For every behavior, plan one seeded-defect probe or record its refusal with the reason. A non-canary defect carries a `manifestationWitness`; an AD-19 signature addresses the exit code or descriptor-nominated stream or response body. A file-only manifestation is refused until an allowed channel exposes it.
- For every rubric- or judgment-governed behavior, include a `gameability` probe whose degenerate response satisfies a naive oracle of a different behavior and fails the probe behavior's disciplined oracle. Commit the response bytes at `corpus/gameability/<probeId>.json` and declare the naive oracle in the probe's qualification.
- Choose non-clean held-out probes before writing oracles, and retain a development probe for each held-out behavior. List at least one per `material` or `critical` behavior in `evaluation.json`'s `heldOutProbes`. The gap loop reads `gap-view.json`, which contains only held-out ID, class and outcome, and must not read held-out input or expected answer. Run held-out probes as a separate partition (AD-22).

Keep the committed layout at `{tea_evaluations_folder}/<evaluationId>/`: `contract.json`, `evaluation.json`, `requirements.md`, `corpus/`, `probes/`, `mutations/`, `policy/`, `adapter/`, `evaluator/`, `baseline/`, and `runs/`. The authored `corpus-index.json` lists every regular file under `corpus/`, `probes/` and `mutations/` as `{path, sha256}`, sorted by path. Create the AD-20 private `{tea_evaluations_folder}/package.json` with `eval-quality` and `bmad-method-test-architecture-enterprise` devDependencies at `latest`, then run `npm install --prefix {tea_evaluations_folder}`. Run `npm exec --prefix {tea_evaluations_folder} -- tea-evaluate digest --evaluation {tea_evaluations_folder}/<evaluationId>` to write the index and print eval-quality's `digestArtifact` over it as `corpusDigest`; `tea-evaluate check` refuses a stale index. The private install works for non-Node adopter repositories. Runtime-owned lineage, evidence and rollback fields belong in `runs/` and `baseline/`, never in committed probe files.

The clean negative and malformed controls expect a valid refusal. Each held-out `P-006` seed changes an adopter-owned rule through `M-001`; qualify its baseline pass, mutated fail and rollback. Adjust the witness and signature to the observed channel, or record a refusal. Keep held-out fixture content outside the gap loop.

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

### Gameability design

Try the degenerate answer “approve every request.” `O-002` is B-002's naive oracle, a different behavior; B-001's disciplined oracle rejects it.

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

Select a private refund-boundary request early. List `P-006` in `heldOutProbes`.

<!-- example:probe -->

```json
{
  "probeId": "P-006",
  "probeClass": "defect",
  "behaviorId": "B-001",
  "expectedClean": false,
  "rationale": "[held-out] M-001 exposes the seeded failure on a private refund-boundary request; this case stays outside the gap loop.",
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

Try the degenerate answer “decline every request.” Here `O-002` is B-002's naive decline oracle. The B-001 probe's disciplined `O-001` rejects an always-decline answer.

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
            "value": "Exercise the documented decision."
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

### Gameability design

Try the degenerate answer “claim every step succeeded without a read-back.” `O-002` is B-002's naive oracle, a different behavior; B-001's disciplined oracle rejects it.

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

Select an unseen two-step reservation early. List `P-006` in `heldOutProbes`.

<!-- example:probe -->

```json
{
  "probeId": "P-006",
  "probeClass": "zero-action",
  "behaviorId": "B-001",
  "expectedClean": false,
  "rationale": "[held-out] M-001 suppresses both create and read-back, then claims success for an unseen workflow request.",
  "defects": [
    {
      "defectId": "D-001",
      "behaviorId": "B-001",
      "summary": "Neither required action runs although the workflow claims success.",
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
              "pointer": "/interactions/manifest-rule-fault/stdout/actionsRun"
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
            "pointer": "/interactions/observed/stdout/claimedSuccess"
          },
          {
            "literal": true
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

### Gameability design

Try the degenerate answer “call every available tool.” `O-002` is B-002's naive oracle, a different behavior; B-001's disciplined oracle rejects it.

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

Select an unseen request that needs lookup only early. List `P-006` in `heldOutProbes`.

<!-- example:probe -->

```json
{
  "probeId": "P-006",
  "probeClass": "defect",
  "behaviorId": "B-001",
  "expectedClean": false,
  "rationale": "[held-out] M-001 exposes the seeded failure on an unseen lookup-only request; this case stays outside the gap loop.",
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

### Gameability design

Try the degenerate answer “echo the request as a passing grade.” `O-002` is B-002's naive oracle, a different behavior; B-001's disciplined oracle rejects it.

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

Select an unseen policy-boundary answer early. List `P-006` in `heldOutProbes`.

<!-- example:probe -->

```json
{
  "probeId": "P-006",
  "probeClass": "defect",
  "behaviorId": "B-001",
  "expectedClean": false,
  "rationale": "[held-out] M-001 exposes the seeded failure on an unseen policy-boundary answer; this case stays outside the gap loop.",
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

### Gameability design

Try the degenerate answer “flag every test as defective.” `O-002` is B-002's naive oracle, a different behavior; B-001's disciplined oracle rejects it.

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

Select an unseen clean test with an unusual assertion style early. List `P-006` in `heldOutProbes`.

<!-- example:probe -->

```json
{
  "probeId": "P-006",
  "probeClass": "defect",
  "behaviorId": "B-001",
  "expectedClean": false,
  "rationale": "[held-out] M-001 exposes the seeded failure on an unseen clean test with unusual assertions; this case stays outside the gap loop.",
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
