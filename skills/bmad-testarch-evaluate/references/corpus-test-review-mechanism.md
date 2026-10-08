# Test-review mechanism corpus

A test-review command that identifies test smells.
The worked interface is `cli`.
The floor, partition and held-out rules live in `references/corpus.md`.

## Representative inputs

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

## Negative and malformed inputs

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

## Gameability design

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

## Held-out probe selection

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
