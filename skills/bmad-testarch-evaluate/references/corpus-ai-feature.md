# AI feature corpus

An HTTP answer-grading feature.
The worked interface is `api`.
The floor, partition and held-out rules live in `references/corpus.md`.

## Representative inputs

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

## Negative and malformed inputs

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

## Gameability design

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

## Held-out probe selection

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
