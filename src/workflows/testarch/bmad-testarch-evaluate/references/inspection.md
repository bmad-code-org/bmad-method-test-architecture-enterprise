# Inspection

Read the target before choosing probes. Copy `assets/inspection-record.md` to `{test_artifacts}/evaluate/<evaluationId>/inspection-record.md`, then fill that run-specific record with source paths and the behavior each source supports. Keep the installed asset as a template. Resolve missing facts with the adopter. The worked record follows a reservation review skill throughout this stage.

## Classify the target and choose its adapter

Record `targetKind` only in `evaluation.json`. The contract names permitted interfaces and operations, never a target kind. The following mapping is AD-4's choice table. A web application is an `ai-feature` target reached as `api`, including a web application with no AI behavior. An HTTP tool server is reached as `api`; a stdio tool server is reached as `mcp`.

| Target kind                    | Interface kind                          | Adapter                              | Generated shape                                                                                          |
| ------------------------------ | --------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Skill                          | `cli`                                   | `createCommandLineAdapter`           | Generic skill runner registry entry with explicit `--skill-root` inside the disposable copy              |
| Agent                          | `cli`                                   | `createCommandLineAdapter`           | Adopter's non-interactive command registry entry; use the skill runner when no command exists            |
| Workflow                       | target's own `cli`, `api` or `mcp` kind | adapter for that kind                | Interaction plan with ordered `after` steps and `captured` bindings from earlier observations            |
| Tool-use system: calling agent | `cli`                                   | `createCommandLineAdapter`           | Agent command and tool-call trajectory on stdout for its oracle                                          |
| Tool-use system: tool server   | `mcp`                                   | `createMcpAdapter`                   | Registry entry supplying `McpTargetAuthorization`                                                        |
| AI feature                     | `api`                                   | adopter-owned `EnvironmentProbePort` | `adapter/http-probe-port.mjs` and its conformance file, with address decisions delegated to eval-quality |
| Tool server reached over HTTP  | `api`                                   | adopter-owned `EnvironmentProbePort` | HTTP port as above; eval-quality's MCP adapter is for stdio                                              |
| Test-review mechanism          | kind of how it runs, usually `cli`      | adapter for that kind                | Skill runner or own command, with seeded test smells and clean tests in its corpus                       |

The six corpus-design kinds are agent, skill, workflow, tool-use system, AI feature and test-review mechanism. The two tool-use rows distinguish the caller from the server. When a description fits two kinds, ask a clarifying question before assigning one: “Are we evaluating the reservation review skill's decisions and tool choices, or the reservation tool server's responses?” The worked answer is “the skill's decisions.” Record `skill`, `cli`, and the generic skill runner in `evaluation.json`; the inspection record keeps the observed scope and source facts.

## Entry points

Find every executable entry point: commands and their arguments, HTTP endpoints, MCP tools, skill activation instructions and workflow triggers. Try a safe representative invocation and write down how input enters. For the reservation review skill, `skills/reservation-review/SKILL.md` activates the skill and the generic runner reads a reservation request on stdin. The runner receives `--skill-root skills/reservation-review` inside a disposable copy. Inspect configuration and name needed environment keys without recording values.

## Behaviors

Read documented promises, prompts, step files and configuration together. Record a behavior ID, source, observable outcome and importance for each promise. In the example, `B-001` approves an eligible reservation and cites the controlling rule; `B-002` declines an over-limit request before making a reservation call. `references/limits.md` may contradict the top-level prompt, so inspection records the discrepancy for the adopter.

## Surfaces

Inventory every channel on which each behavior appears: exit code, stdout, stderr, HTTP response body, MCP tool result and written files. For `B-002`, stdout carries the decline and the tool-call trajectory carries whether a reservation call happened; an audit file is corroborating evidence. Nominate the stream or response-body descriptor that can show a controlled defect. Under AD-19, a defect signature may address an exit code or that nominated stream or response body. A written file can support an oracle, yet a seed visible only in a file must be recorded as refused with a reason until a permitted signature channel can expose it.

## Existing tests

Read the test's input and assertions, then separate its actual proof from its name. `checks/reservation-review.test.js` makes a keyword assertion that one output contains `approve`; it cannot catch an approval with a false rule citation. `checks/limits.snapshot.js` captures one decline's text, so a consistently wrong decision could remain green. Put these limits in the inspection record and use them to choose stronger probes.

## Failure history

Read issues, reverted commits, incident notes and earlier evaluation results. Record a source and the corpus consequence. An earlier limit edit approved an over-limit request, so the corpus includes the exact boundary. An earlier evaluator accepted an always-decline answer, so the corpus includes an eligible case and a gameability response that always declines. Keep links and commit IDs when available; an unverified anecdote is labelled as such.

## Vendor-model redirect

If the request asks which provider model is better, or whether a vendor model can perform a task by itself, ask for the adopter-owned use that matters: its prompt, skill, agent configuration, tool wiring or feature. For example, “Compare Provider A and Provider B on reservation review” becomes “Evaluate our reservation review skill's eligibility decision and rule citation while Provider A is its fixed model.” Record that model in `policy/evaluator-conditions.json` as `modelSnapshot`. A probe cannot declare a mutation to model weights or a provider switch, so refuse either proposed seed and record why. Use a controlled change to the adopter's rule file or prompt when testing detection.

Finish by filling the run-specific inspection record with real source paths, observed channels, test limitations, history and any resolved ambiguity. `assets/evaluation.json` is a worked starter: copy it into the evaluation folder and replace its registry target, launch paths and environment keys with inspected facts before `tea-evaluate check`. Then proceed to intake.
