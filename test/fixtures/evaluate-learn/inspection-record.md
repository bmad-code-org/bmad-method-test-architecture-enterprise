# Inspection record: pantry summary CLI

## Target and scope

- Evaluation ID: `pantry-summary`.
- Adopter-owned deterministic Node CLI: `target/summarizer.js`.
- Rule data: `target/rules/items.json`.
- The evaluation exercises the CLI's exact stdout, malformed-request refusal, and controlled mutations of rule data and the request guard.
- Stage 1 classification: `evaluation.json.targetKind` is `agent` and `interface` is `cli`. The copied skill's adapter table maps a target's own non-interactive CLI command to the command-line adapter under `agent`; that is the available execution category used here. This fixture's implementation is deterministic and has no agent or model behavior. The `ai-feature` row in that table requires an HTTP `api` interface, which this target does not expose.

## Entry point

- Run `node target/summarizer.js` from the project root, with `List pantry\n` on stdin.
- No environment keys or network services are required.
- A representative invocation exited 0 and printed `Summary for List pantry: apples, pears\n`.

## Behaviors

| ID | Source | Observable promise | Importance |
| --- | --- | --- | --- |
| B-001 | `target/summarizer.js`, adopter confirmation | Read stdin, then print the exact summary using `required` from the rules JSON | Critical |
| B-002 | `target/summarizer.js`, later adopter confirmation | Reject malformed or unsupported request text with exit code 2 and stderr diagnostic | Material |

## Surfaces

| Behavior | Exit code | stdout | stderr | Written files | Defect-signature channel |
| --- | --- | --- | --- | --- | --- |
| B-001 | 0 on success | Exact summary and final newline | Runtime faults | None | stdout |
| B-002 | 2 on refusal | Empty on refusal; summary under guard bypass | Exact invalid request diagnostic on refusal | None | exit code, stderr, and stdout |

## Existing tests and history

- No tests or failure-history files were included in the supplied target. The adopter supplied the controlled rule mutation that removes `pears`. Story 1.56 added the copied-target guard-bypass mutation and its development and held-out defect probes.
