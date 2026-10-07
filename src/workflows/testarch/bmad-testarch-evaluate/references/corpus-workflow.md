# Workflow corpus

A create then read-back reservation workflow.
The worked interface is `cli`.
The floor, partition and held-out rules live in `references/corpus.md`.

## Representative inputs

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

## Negative and malformed inputs

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

## Gameability design

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

## Held-out probe selection

Select an unseen two-step reservation and an unseen reporting request early. List `P-006` and `P-008` in `heldOutProbes`. `P-006` is a `zero-action` defect probe and fills no `defect` floor, so `P-008` holds out a `defect` probe of B-002, whose development probe is `P-007`, and the starter's `defect` floor has an eligible probe in both partitions. No `zero-action` defect probe stays in development, so the evaluation declares the `defect` floor alone.

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

`P-008` seeds the reporting rule for unseen reservation R-19 through `M-003`; qualify it as `P-006` is.

<!-- example:probe -->

```json
{
  "probeId": "P-008",
  "probeClass": "defect",
  "behaviorId": "B-002",
  "expectedClean": false,
  "rationale": "[held-out] M-003 reports failure after both required actions complete for unseen reservation R-19, violating B-002 outside the gap loop.",
  "defects": [
    {
      "defectId": "D-003",
      "behaviorId": "B-002",
      "summary": "The changed reporting rule says failure after create and read-back complete for reservation R-19.",
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
            "value": "Create reservation R-19 and read it back."
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
              "literal": "Create reservation R-19 and read it back."
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
    "mutation": "M-003"
  }
}
```
