# Corpus

Design from the confirmed `requirements.md` and inspection record. `probes/P-NNN.probe.json` holds the authored eval-quality subset. Each target kind below is a separate evaluation. Replace example data with observed facts and qualify defect and gameability probes before using them as evidence.

## Corpus rules and layout

- Put representative inputs in `corpus/` and refer to them from the interaction plan. Add negative and malformed inputs that distinguish a disciplined response from a plausible shortcut.
- Keep at least one `zero-action` probe with `expectedClean: true` and no defects as a clean control. For every mandatory-action behavior, add a `zero-action` defect probe whose signature exposes the missing action.
- For every behavior, plan one seeded-defect probe or record its refusal with the reason. A non-canary defect carries a `manifestationWitness`; an AD-19 signature addresses the exit code or descriptor-nominated stream or response body. A file-only manifestation is refused until an allowed channel exposes it.
- For every rubric- or judgment-governed behavior, include a `gameability` probe whose degenerate response satisfies a naive oracle of a different behavior and fails the probe behavior's disciplined oracle. Commit the response bytes at `corpus/gameability/<probeId>.json` and declare the naive oracle in the probe's qualification.
- Choose non-clean held-out probes before writing oracles, and retain a development probe for each held-out behavior. List at least one per `material` or `critical` behavior in `evaluation.json`'s `heldOutProbes`. The gap loop reads `gap-view.json`, which contains only held-out ID, class and outcome, and must not read held-out input or expected answer. Run held-out probes as a separate partition (AD-22).

Keep the committed layout at `{tea_evaluations_folder}/<evaluationId>/`: `contract.json`, `evaluation.json`, `requirements.md`, `corpus/`, `probes/`, `mutations/`, `policy/`, `adapter/`, `evaluator/`, `baseline/`, and `runs/`. The authored `corpus-index.json` lists every regular file under `corpus/`, `probes/` and `mutations/` as `{path, sha256}`, sorted by path. Create the AD-20 private `{tea_evaluations_folder}/package.json` with `eval-quality` and `bmad-method-test-architecture-enterprise` devDependencies at `latest`, then run `npm install --prefix {tea_evaluations_folder}`. Run `npm exec --prefix {tea_evaluations_folder} -- tea-evaluate digest --evaluation {tea_evaluations_folder}/<evaluationId>` to write the index and print eval-quality's `digestArtifact` over it as `corpusDigest`; `tea-evaluate check` refuses a stale index. The private install works for non-Node adopter repositories. Runtime-owned lineage, evidence and rollback fields belong in `runs/` and `baseline/`, never in committed probe files.

The starter `evaluation.json` declares `clean` and `mutated` arms for its initial partial corpus. When committing `P-004`, add `gameability` to `evaluation.json.arms` and set `strengthFloor.gameability` to the confirmed minimum, such as `1`. Keep each declared arm paired with a probe using its route. `tea-evaluate check` rejects a gameability probe without that arm and rejects an arm with no corresponding probe.

The clean negative and malformed controls expect a valid refusal. Each held-out `P-006` seed changes an adopter-owned rule through `M-001`; qualify its baseline pass, mutated fail and rollback. Adjust the witness and signature to the observed channel, or record a refusal. Keep held-out fixture content outside the gap loop.

The command examples below assume one JSON object on stdout; eval-quality parses JSON-shaped stdout before following a `/stdout/...` pointer. The HTTP example returns JSON with a JSON content type. Match these shapes to the inspected target before copying a signature.
The gameability response blocks use one illustrative `decide` step. After Story 1.13 writes the interaction plan, make each `corpus/gameability/<probeId>.json` answer every actual plan step with the same step ID and interface kind.

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
