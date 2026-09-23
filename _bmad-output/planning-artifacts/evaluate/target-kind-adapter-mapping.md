# Target kind to adapter mapping

Verified against `bmad-eval-quality` v3.4.0 source, and re-verified on 2026-09-23 against v4.0.0 (`origin/main` `aa1b724`), where `INTERFACE_KINDS`, the `unsupported-interface-kind` rejection in `src/core/compile/interface-inventory.ts` and the five `docs/how-to/evaluate-*-behavior.md` guides are unchanged. Sources: `schemas/eval-contract.schema.json`, `src/core/schemas/interface.ts`, and the five `docs/how-to/evaluate-*-behavior.md` guides; `git diff 467e3a3 origin/main` over them is empty. The input notes' list of target kinds was checked against these sources before use.

## Two separate vocabularies

Nothing in the Behavioral Evaluation Contract schema carries a "target kind" field. The schema only knows **interface kinds**, declared per operation under `permittedInterfaces[].kind`: `api`, `web`, `cli`, `mcp`. `compile` accepts three of the four and rejects `web` outright as `unsupported-interface-kind`.

"Agent," "skill," "workflow," "tool-use system," "AI feature," and "test-review mechanism" are TeA's own classification layer on top of that: a way to reason about what is being evaluated before choosing which interface kind and adapter shape the contract declares. Evaluate's target-inspection capability (CAP-1) performs that classification; eval-quality never sees it.

## The mapping

| Target kind | Interface kind | Adapter shape | Precedent |
| --- | --- | --- | --- |
| Agent (a program invoked from the command line) | `cli` | A runner command: prompt on stdin, no vendor knowledge, one declared capability, registered in an execution-target registry | TeA's own `cli/fragment-selection-runner.js`, `cli/trace-runner.js`; `createCommandLineAdapter` |
| Skill (instructions an agent loads; never invoked directly) | `cli` | Same as agent: a command wraps the agent with the skill's instructions loaded, and the contract addresses what the command produced | TeA's own sixteen contracts are all `cli`; a skill is observed through the agent that runs it |
| Workflow (ordered steps where a later step depends on an earlier one) | Whichever interface kind the target itself uses (`cli`, `api`, or `mcp`) | An interaction-plan pattern layered on top of any interface kind: temporal clauses (`after: "..."`) and captured-value bindings (`{ captured }`) that bind a later step to a value an earlier step produced | eval-quality's own workflow walkthrough runs over `api`; a TeA workflow target would run over `cli` |
| Tool-use, the calling agent (did it choose the right tool, the right arguments, interpret the result correctly) | `cli` | Same shape as agent behavior; the agent's tool calls are observable output if it writes them down | `docs/how-to/evaluate-tool-use-behavior.md` |
| Tool-use, the tool server itself (is the server's behavior correct) | `mcp` | An MCP-specific operation shape and stdio adapter | `docs/how-to/evaluate-tool-use-behavior.md` |
| AI feature, or any web application (an HTTP surface where a model produces part of the answer) | `api` | An adopter-owned HTTP `EnvironmentProbePort` (eval-quality ships no `api` adapter); `web` parses against the schema and `compile` refuses it, so every web application is declared as `api` through its HTTP surface | `docs/how-to/evaluate-ai-feature-behavior.md` |
| Test-review mechanism (a skill, agent, or tool that judges tests) | The interface kind of how it runs, usually `cli` | The adapter of the kind it runs as: the skill runner or its own command | TeA's own `bmad-testarch-test-review` suite. This is TeA's classification for corpus design (seeded test smells, clean tests, and the degenerate response that flags every test); eval-quality has no such concept. Added 2026-09-23 (AD-4) |

## Where TeA itself sits

Every one of TeA's sixteen existing contracts declares `cli`. TeA is developer tooling driven by commands and files with no HTTP surface, so it has never built an `api` or `mcp` interface. That makes TeA the reference case for the agent, skill, and workflow-over-`cli` shapes. For `api` (AI feature, web application) and `mcp` (tool server), TeA offers no precedent, and Evaluate still has to support both for adopters outside TeA.

## Web targets

Owner ruling: web = api for eval-quality. Evaluate never declines a web target. Target inspection (CAP-1) classifies a web application by its HTTP surface and declares that surface as `api`; because `compile` refuses kind `web`, no contract Evaluate generates ever declares it.
