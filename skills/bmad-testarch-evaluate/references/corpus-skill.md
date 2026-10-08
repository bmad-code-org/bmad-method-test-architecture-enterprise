# Skill corpus

The reservation review skill.
The worked interface is `cli`.
The floor, partition and held-out rules live in `references/corpus.md`.

## Representative inputs

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

## Negative and malformed inputs

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

## Gameability design

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

## Held-out probe selection

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
