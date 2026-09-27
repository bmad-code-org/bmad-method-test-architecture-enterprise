# Contract

Start from `assets/contract.skeleton.json` and fill every placeholder from the confirmed requirements and corpus. Replace each whole quoted token, such as `"{{behaviors}}"`, with the JSON serialization of its keyed value so arrays, numbers and null retain their types. Write `contract.json`. A successful compile establishes contract structure; probes and runs establish whether the target behaves as claimed.

## Identity and lineage fields

The five fields are `schemaVersion`, `parentDigest`, `revisionCount`, `contractId`, and `sourceSpecDigest`. Use the installed engine's contract schema version. Start with a null parent and revision zero; on revision carry the prior digest and increment the count. Give the contract a stable ID. Stamp `sourceSpecDigest` with eval-quality's `digestBytes` over the committed `requirements.md` Buffer. Use the exact bytes named by `evaluation.json` `requirements.path` and compare with its `requirements.digest`. Do not trim or normalize the statement before hashing.

## Authored fields

The sixteen fields are `behaviors`, `oracles`, `rubrics`, `waivers`, `permittedInterfaces`, `referenceSets`, `siblingGroups`, `interactionPlan`, `scopedResources`, `forbiddenInputs`, `testData`, `budgets`, `safetyLimits`, `requiredEvidence`, `probeStepBound`, and `fixtureReset`. Declare required fields even when their value is null. Every behavior needs a non-null `observableSuccessCriterion`; each discharged behavior declares exactly one oracle. Keep target kind and interface selection in `evaluation.json`.

`forbiddenInputs` has seven floor members: `original-spec`, `source-code`, `repository`, `builder-transcript`, `implementation-logs`, `comparator-results`, and `human-labels`.

## Authoring discipline

Each tagged JSON block below is a worked edit to the complete contract. The guidance gate replaces its `path` with `value` and compiles the result. Author probes for the stated coverage gaps.

### success-indicator-separation

Check the process indicator and substantive answer separately. An exit code of zero can accompany a wrong answer. Without this rule, a successful process earns credit for an incorrect result.

<!-- example:contract-patch -->

```json
{
  "path": "/oracles/0/check",
  "value": {
    "op": "all",
    "operands": [
      { "op": "equality", "operands": [{ "pointer": "/interactions/answer-run/exit-code" }, { "literal": 0 }] },
      { "op": "containment", "operands": [{ "pointer": "/interactions/answer-run/stdout" }, { "literal": "skill: stub-skill" }] }
    ]
  }
}
```

### whole-body

Compare the full answer when the body is the result, or parse its declared fields. A keyword search can miss contradictory text elsewhere. Without this rule, a response containing the expected token can pass while the full answer is wrong.

<!-- example:contract-patch -->

```json
{
  "path": "/oracles/0/check",
  "value": {
    "op": "all",
    "operands": [
      { "op": "equality", "operands": [{ "pointer": "/interactions/answer-run/exit-code" }, { "literal": 0 }] },
      {
        "op": "equality",
        "operands": [{ "pointer": "/interactions/answer-run/stdout" }, { "literal": "skill: stub-skill\nanswer: alpha\n" }]
      }
    ]
  }
}
```

### malformed-input

Bind a type-violating input and require a refusal on the nominated channel. The worked pair changes both the input and the oracle. Without this rule, silent coercion of malformed requests goes unseen.

<!-- example:contract-patch -->

```json
{
  "patches": [
    {
      "path": "/interactionPlan/0/inputBinding/stdin/prompt/literal",
      "value": "Review amount: NaN"
    },
    {
      "path": "/oracles/0",
      "value": {
        "id": "O-001",
        "polarity": "expects-hold",
        "commentary": "A malformed amount is refused on stdout and the command exits cleanly.",
        "direction": {
          "polarity": "expects-hold",
          "relation": "all",
          "scope": "The exit code and refusal on stdout.",
          "negativeDomain": "The malformed amount is silently accepted or the command fails before answering.",
          "evidenceTargets": ["/interactions/answer-run/exit-code", "/interactions/answer-run/stdout"]
        },
        "check": {
          "op": "all",
          "operands": [
            {
              "op": "equality",
              "operands": [
                {
                  "pointer": "/interactions/answer-run/exit-code"
                },
                {
                  "literal": 0
                }
              ]
            },
            {
              "op": "containment",
              "operands": [
                {
                  "pointer": "/interactions/answer-run/stdout"
                },
                {
                  "literal": "error: invalid amount"
                }
              ]
            }
          ]
        }
      }
    }
  ]
}
```

### per-record

For JSON stdout with a records array, declare that array in the response descriptor. Check each requested record ID and decision through its own pointer. An aggregate count can conceal an incorrect item. Without this rule, a correct total can pass with a wrong record.

<!-- example:contract-patch -->

```json
{
  "patches": [
    {
      "path": "/permittedInterfaces/0/operations/0/responseDescriptor",
      "value": {
        "requiredKeys": ["records"],
        "permittedKeys": ["records"],
        "types": {
          "records": "array"
        },
        "successIndicator": null,
        "channelRoles": null,
        "collectionLocations": null
      }
    },
    {
      "path": "/oracles/0",
      "value": {
        "id": "O-001",
        "polarity": "expects-hold",
        "commentary": "Each requested record has its own ID and decision in JSON stdout.",
        "direction": {
          "polarity": "expects-hold",
          "relation": "all",
          "scope": "The records array in the JSON stdout of answer-run.",
          "negativeDomain": "A record is omitted, duplicated under the wrong ID, or assigned the wrong decision.",
          "evidenceTargets": [
            "/interactions/answer-run/stdout/records/0/id",
            "/interactions/answer-run/stdout/records/0/decision",
            "/interactions/answer-run/stdout/records/1/id",
            "/interactions/answer-run/stdout/records/1/decision"
          ]
        },
        "check": {
          "op": "all",
          "operands": [
            {
              "op": "equality",
              "operands": [
                {
                  "pointer": "/interactions/answer-run/stdout/records/0/id"
                },
                {
                  "literal": "A"
                }
              ]
            },
            {
              "op": "equality",
              "operands": [
                {
                  "pointer": "/interactions/answer-run/stdout/records/0/decision"
                },
                {
                  "literal": "accepted"
                }
              ]
            },
            {
              "op": "equality",
              "operands": [
                {
                  "pointer": "/interactions/answer-run/stdout/records/1/id"
                },
                {
                  "literal": "B"
                }
              ]
            },
            {
              "op": "equality",
              "operands": [
                {
                  "pointer": "/interactions/answer-run/stdout/records/1/decision"
                },
                {
                  "literal": "declined"
                }
              ]
            }
          ]
        }
      }
    }
  ]
}
```

### sibling-cross-check

Cross-check parsed fields that must agree across observations. The read-back ID must equal the ID create returned; the read-back title must match the requested title. Without this rule, a success field can pass while the resulting record disagrees.

<!-- example:contract-patch -->

```json
{
  "base": "workflow",
  "path": "/oracles/0",
  "value": {
    "id": "O-001",
    "polarity": "expects-hold",
    "commentary": "The read-back step, bound to the identifier the create step returned, finds a record whose identifier is that one and whose title is the one create was given.",
    "direction": {
      "polarity": "expects-hold",
      "relation": "all",
      "scope": "The stdout of the read-back step and the identifier the create step printed.",
      "negativeDomain": "A read-back that finds nothing, or a record under another identifier or with another title.",
      "evidenceTargets": [
        "/interactions/read-back/stdout/found",
        "/interactions/read-back/stdout/id",
        "/interactions/read-back/stdout/title",
        "/interactions/create/stdout/id"
      ]
    },
    "check": {
      "op": "all",
      "operands": [
        {
          "op": "equality",
          "operands": [
            {
              "pointer": "/interactions/read-back/stdout/found"
            },
            {
              "literal": true
            }
          ]
        },
        {
          "op": "equality",
          "operands": [
            {
              "pointer": "/interactions/read-back/stdout/id"
            },
            {
              "pointer": "/interactions/create/stdout/id"
            }
          ]
        },
        {
          "op": "equality",
          "operands": [
            {
              "pointer": "/interactions/read-back/stdout/title"
            },
            {
              "literal": "Ship the workflow"
            }
          ]
        }
      ]
    }
  }
}
```

### omission-and-completeness

Require the whole promised records array, including item identities and values. This exact array check rejects omissions, duplicates and extras. Without this rule, a partial response passes by omitting hard cases.

<!-- example:contract-patch -->

```json
{
  "patches": [
    {
      "path": "/permittedInterfaces/0/operations/0/responseDescriptor",
      "value": {
        "requiredKeys": ["records"],
        "permittedKeys": ["records"],
        "types": {
          "records": "array"
        },
        "successIndicator": null,
        "channelRoles": null,
        "collectionLocations": null
      }
    },
    {
      "path": "/oracles/0",
      "value": {
        "id": "O-001",
        "polarity": "expects-hold",
        "commentary": "The agent read SKILL.md under the skill root the runner was given, so stdout names that skill, and the run exited 0.",
        "direction": {
          "polarity": "expects-hold",
          "relation": "equality",
          "scope": "Whole records array in JSON stdout",
          "negativeDomain": "An item is omitted, duplicated, or extra",
          "evidenceTargets": ["/interactions/answer-run/stdout/records"]
        },
        "check": {
          "op": "equality",
          "operands": [
            {
              "pointer": "/interactions/answer-run/stdout/records"
            },
            {
              "literal": [
                {
                  "id": "A",
                  "decision": "accepted"
                },
                {
                  "id": "B",
                  "decision": "declined"
                }
              ]
            }
          ]
        }
      }
    }
  ]
}
```

### state-change-read-back

Mark a write operation as a state change and plan a read-back after it. The worked fragment uses the workflow fixture: create mints an ID, and read-back captures that ID from create stdout in the same trial. A success message alone cannot prove persistence. Without this rule, a claimed write passes when nothing changed.

<!-- example:contract-patch -->

```json
{
  "base": "workflow",
  "patches": [
    {
      "path": "/permittedInterfaces/0/operations/0/stateChangeMarker",
      "value": true
    },
    {
      "path": "/interactionPlan",
      "value": [
        {
          "stepId": "read-back",
          "operationId": "read-back",
          "after": "create",
          "cardinality": "exactly-one",
          "inputBinding": {
            "argument": null,
            "option": {
              "id": {
                "captured": "/interactions/create/stdout/id"
              }
            },
            "environment": null,
            "stdin": null
          }
        },
        {
          "stepId": "create",
          "operationId": "create",
          "after": null,
          "cardinality": "exactly-one",
          "inputBinding": {
            "argument": null,
            "option": null,
            "environment": null,
            "stdin": {
              "title": {
                "literal": "Ship the workflow"
              }
            }
          }
        }
      ]
    }
  ]
}
```

Pair the marker with a read-back operation and a step whose `after` names the write. Bind its identifier with `captured` from the write observation. The tagged workflow fragment above shows the pair and compiles against the workflow fixture.

## Interaction-plan design

Set `cardinality` per step, identify `testData.principals` when authorization matters, and set `probeStepBound` high enough for every planned step. The worked workflow has two required steps, an operator principal, and a bound of two. `after` orders a dependent step. A `captured` binding reads a prior observation from the same trial. A missing or unsendable capture leaves the dependent step unissued and must appear in preflight.

<!-- example:contract-patch -->

```json
{
  "base": "workflow",
  "patches": [
    {
      "path": "/interactionPlan",
      "value": [
        {
          "stepId": "read-back",
          "operationId": "read-back",
          "after": "create",
          "cardinality": "exactly-one",
          "inputBinding": {
            "argument": null,
            "option": {
              "id": {
                "captured": "/interactions/create/stdout/id"
              }
            },
            "environment": null,
            "stdin": null
          }
        },
        {
          "stepId": "create",
          "operationId": "create",
          "after": null,
          "cardinality": "exactly-one",
          "inputBinding": {
            "argument": null,
            "option": null,
            "environment": null,
            "stdin": {
              "title": {
                "literal": "Ship the workflow"
              }
            }
          }
        }
      ]
    },
    {
      "path": "/testData/principals",
      "value": {
        "operator": {
          "kind": "fixture-user"
        }
      }
    },
    {
      "path": "/probeStepBound",
      "value": 2
    }
  ]
}
```

## Sensitivity-witness design

Use two legs that differ in one input and a relation that must change on the descriptor-nominated output. The starter changes only the stdin prompt from alpha to beta and requires alpha only in the first stdout and beta only in the second stdout. When an operation takes no input that can vary, set `sensitivityWitness` to `null` and record why.

<!-- example:contract-patch -->

```json
{ "path": "/permittedInterfaces/0/operations/0/sensitivityWitness/legs/1/inputs/stdin/value", "value": "Say beta." }
```

## Waiver discipline

A waiver names the rule, a rationale, a machine-checkable condition, the adopter's approval, and an RFC 3339 UTC expiry. Write one only for a decision the adopter made after seeing the coverage gap. The starter carries an empty list until that approval exists. The following illustrative fixture waiver includes all four elements; copy it only after the adopter makes that decision.

<!-- example:contract-patch -->

```json
{
  "path": "/waivers",
  "value": [
    {
      "id": "W-001",
      "rule": "malformed-input",
      "rationale": "The confirmed fixture accepts only prevalidated numeric requests.",
      "condition": "typeof request.amount === 'number' && Number.isFinite(request.amount)",
      "approval": "fixture adopter, 2026-09-27",
      "expiresAt": "2027-12-31T00:00:00Z"
    }
  ]
}
```

## Compile and seal

From the evaluation folder, run `tea-evaluate check`, `eval-quality compile`, then `eval-quality seal` in that order. Stop on each nonzero exit and report the command, exit code, and stderr. An installed evaluation runs `npm exec --prefix {tea_evaluations_folder} -- tea-evaluate`; TeA development can run `node cli/evaluate.js`.

```sh
npm exec --prefix {tea_evaluations_folder} -- tea-evaluate check --evaluation <evaluation-folder>
npm exec --prefix {tea_evaluations_folder} -- eval-quality compile --in <evaluation-folder>/contract.json --out <evaluation-folder>/compiled-contract.json
npm exec --prefix {tea_evaluations_folder} -- eval-quality seal --in <evaluation-folder>/contract.json --out <evaluation-folder>/sealed-brief.json
```

`seal` keeps behaviors, interfaces by name and kind, bounds, one prose direction per oracle, and the contract digest. It withholds oracle checks, the interaction plan, and test data. Reading checks would let an evaluator satisfy them without exercising behavior. The sealed brief digest proves both arms used one contract.

## Worked end-to-end contract

The starter skeleton and `test/fixtures/evaluate/contract-fill.json` produce this complete example. Its source digest comes from the exact bytes of `test/fixtures/evaluate/requirements.md`. The guidance gate compiles and seals the tagged contract.

<!-- example:contract -->

```json
{
  "schemaVersion": 5,
  "parentDigest": null,
  "revisionCount": 0,
  "contractId": "tea-evaluate-contract-starter",
  "sourceSpecDigest": "sha256:31a3e9c4a234f659dce6d7a120b141886929ef5f0e5149c0dffa711d42793087",
  "behaviors": [
    {
      "id": "B-001",
      "description": "The skill runner hands the agent the skill it was given and the request, and the run exits clean.",
      "severity": "critical",
      "observableSuccessCriterion": "The run names the stub skill on stdout and exits 0.",
      "requirementLinks": [
        {
          "scheme": "tea-evaluate-fixture",
          "id": "skill-root-handed-over"
        }
      ],
      "riskLinks": [
        {
          "scheme": "tea-evaluate-fixture",
          "id": "wrong-skill-evaluated"
        }
      ],
      "oracles": ["O-001"]
    }
  ],
  "oracles": [
    {
      "id": "O-001",
      "polarity": "expects-hold",
      "commentary": "The agent read SKILL.md under the skill root the runner was given, so stdout names that skill, and the run exited 0.",
      "direction": {
        "polarity": "expects-hold",
        "relation": "all",
        "scope": "The exit code and stdout of the answer run.",
        "negativeDomain": "A run that exited non-zero, or whose stdout names no skill or another skill.",
        "evidenceTargets": ["/interactions/answer-run/exit-code", "/interactions/answer-run/stdout"]
      },
      "check": {
        "op": "all",
        "operands": [
          {
            "op": "equality",
            "operands": [
              {
                "pointer": "/interactions/answer-run/exit-code"
              },
              {
                "literal": 0
              }
            ]
          },
          {
            "op": "containment",
            "operands": [
              {
                "pointer": "/interactions/answer-run/stdout"
              },
              {
                "literal": "skill: stub-skill"
              }
            ]
          }
        ]
      }
    }
  ],
  "rubrics": [],
  "waivers": [],
  "permittedInterfaces": [
    {
      "logicalId": "stub-skill",
      "kind": "cli",
      "operations": [
        {
          "operationId": "answer-request",
          "invocation": {
            "executable": "tea-skill-runner",
            "subcommandPath": []
          },
          "stateChangeMarker": false,
          "requestShape": {
            "argument": {
              "requiredKeys": [],
              "permittedKeys": [],
              "types": {}
            },
            "option": {
              "requiredKeys": ["agent", "agent-cmd", "skill-root", "timeout-ms"],
              "permittedKeys": ["agent", "agent-cmd", "skill-root", "timeout-ms"],
              "types": {
                "agent": "string",
                "agent-cmd": "string",
                "skill-root": "string",
                "timeout-ms": "string"
              }
            },
            "environment": {
              "requiredKeys": [],
              "permittedKeys": [],
              "types": {}
            },
            "stdin": {
              "requiredKeys": ["prompt"],
              "permittedKeys": ["prompt"],
              "types": {
                "prompt": "string"
              }
            }
          },
          "artifacts": [],
          "descriptorChannel": {
            "kind": "stream",
            "channel": "stdout"
          },
          "responseDescriptor": {
            "requiredKeys": [],
            "permittedKeys": [],
            "types": {},
            "successIndicator": null,
            "channelRoles": null,
            "collectionLocations": null
          },
          "volatilePointers": [],
          "sensitivityWitness": {
            "witnessId": "reply-follows-the-prompt",
            "channel": "stdin",
            "legs": [
              {
                "legId": "witness-alpha",
                "inputs": {
                  "argument": {},
                  "option": {
                    "skill-root": "skill",
                    "agent": "custom",
                    "agent-cmd": "./agent.js",
                    "timeout-ms": "30000"
                  },
                  "environment": {},
                  "stdin": {
                    "kind": "text",
                    "value": "Say alpha."
                  }
                }
              },
              {
                "legId": "witness-beta",
                "inputs": {
                  "argument": {},
                  "option": {
                    "skill-root": "skill",
                    "agent": "custom",
                    "agent-cmd": "./agent.js",
                    "timeout-ms": "30000"
                  },
                  "environment": {},
                  "stdin": {
                    "kind": "text",
                    "value": "Say beta."
                  }
                }
              }
            ],
            "relation": {
              "op": "all",
              "operands": [
                {
                  "op": "containment",
                  "operands": [
                    {
                      "pointer": "/interactions/witness-alpha/stdout"
                    },
                    {
                      "literal": "alpha"
                    }
                  ]
                },
                {
                  "op": "not",
                  "operands": [
                    {
                      "op": "containment",
                      "operands": [
                        {
                          "pointer": "/interactions/witness-alpha/stdout"
                        },
                        {
                          "literal": "beta"
                        }
                      ]
                    }
                  ]
                },
                {
                  "op": "containment",
                  "operands": [
                    {
                      "pointer": "/interactions/witness-beta/stdout"
                    },
                    {
                      "literal": "beta"
                    }
                  ]
                },
                {
                  "op": "not",
                  "operands": [
                    {
                      "op": "containment",
                      "operands": [
                        {
                          "pointer": "/interactions/witness-beta/stdout"
                        },
                        {
                          "literal": "alpha"
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          }
        }
      ]
    }
  ],
  "referenceSets": {},
  "siblingGroups": {
    "operations": [],
    "parameters": []
  },
  "interactionPlan": [
    {
      "stepId": "answer-run",
      "operationId": "answer-request",
      "after": null,
      "cardinality": "exactly-one",
      "inputBinding": {
        "argument": null,
        "option": {
          "skill-root": {
            "literal": "skill"
          },
          "agent": {
            "literal": "custom"
          },
          "agent-cmd": {
            "literal": "./agent.js"
          },
          "timeout-ms": {
            "literal": "30000"
          }
        },
        "environment": null,
        "stdin": {
          "prompt": {
            "literal": "Say alpha."
          }
        }
      }
    }
  ],
  "scopedResources": null,
  "forbiddenInputs": [
    "original-spec",
    "source-code",
    "repository",
    "builder-transcript",
    "implementation-logs",
    "comparator-results",
    "human-labels"
  ],
  "testData": {
    "setup": "Nothing is staged by hand: tea-evaluate preflight copies launch.root, the stub project under test/fixtures/evaluate/stub-agent/, into a temp directory and runs every leg there.",
    "cleanup": "Nothing to remove: the stub agent writes no file.",
    "principals": null,
    "resources": null
  },
  "budgets": {
    "maxToolCalls": 1,
    "maxWallClockMinutes": 1,
    "maxCostUsd": "0.00"
  },
  "safetyLimits": ["The stub agent writes no file and makes no network call."],
  "requiredEvidence": ["The exit code and stdout of every run."],
  "probeStepBound": 1,
  "fixtureReset": null
}
```
