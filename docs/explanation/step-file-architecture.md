---
title: TEA Step-File and Orchestration Architecture
description: How TEA splits workflows into granular step files, how those steps dispatch to parallel workers, and how execution mode is resolved
---

# TEA Step-File and Orchestration Architecture

TEA workflows load one step file at a time.
Some steps dispatch isolated workers, then merge their structured outputs.

## Why Step Files

Step files give the model a bounded task, the context it needs, and an exit condition.

Step files break the workflow into self-contained units that each do one thing:

- **One step, one action.** Each file contains exactly one task.
- **Explicit exit conditions.** The step states what "finished" means.
- **Context injection.** Each step restates what it needs, assuming nothing about what the model still remembers.
- **Strict boundaries.** Each step lists what it must not do, so the scope is explicit.
- **Just-in-time loading.** The agent reads one step file, executes it, then loads the next.

These boundaries let independent workers produce outputs the aggregation step can validate.

Layout in the repository, per workflow skill:

```text
bmad-testarch-automate/
├── SKILL.md             # Entry point: loads config and customization, picks the mode
├── workflow.yaml        # Metadata, variables, output paths
├── instructions.md      # Workflow summary and operator notes
├── checklist.md         # Validation checklist
├── resources/           # example outputs
├── steps-c/             # Create mode, one file per step
├── steps-e/             # Edit mode
└── steps-v/             # Validate mode
```

## The Step File Template

```markdown
# Step N: [Action Name]

## Context (from previous steps)

- What was accomplished in Steps 1 through N-1
- Key information the model needs
- Current state of the workflow

## Your Task (Step N Only)

[One explicit task]

## Requirements

- ✅ Requirement 1, 2, 3

## What You MUST Do

- Action 1, 2, 3

## What You MUST NOT Do

- ❌ Don't do X (that's Step N+1)
- ❌ Don't do Y (out of scope)

## Exit Condition

You may proceed to Step N+1 when:

- ✅ Condition 1, 2, 3 met

Do NOT proceed until all conditions met.

## Next Step

Load `steps-c/step-[N+1]-[action].md` and execute.
```

A worker step is the same shape with two differences: its exit condition ends the worker, and it writes structured JSON to a temp file for the aggregation step to read:

```json
{
  "success": true,
  "tests": [
    {
      "file": "tests/api/auth.spec.ts",
      "content": "[full test file content]",
      "description": "API tests for Auth feature"
    }
  ],
  "fixtures": ["authData", "userData"],
  "summary": "Generated 5 API test cases for 3 features"
}
```

### Loading knowledge fragments from a step

Step frontmatter declares `knowledgeIndex: '{tea-knowledge}/tea-index.csv'`.
`{tea-knowledge}` is the `knowledge/` folder of the `bmod-tea` skill installed beside the workflow, and the step body names the fragments it wants:

```markdown
Use `{knowledgeIndex}` to load:

1. **fixture-architecture**: composable fixture patterns
2. **api-request**: API test patterns
3. **network-first**: network handling patterns

Generated tests MUST follow these patterns:

✅ Fixture composition (fixture-architecture)
✅ `await apiRequest()` (api-request)
✅ Intercept before navigate (network-first)

❌ Do NOT substitute custom patterns
```

See [Knowledge Base System](/docs/explanation/knowledge-base-system.md) for how fragments are selected and maintained.

## How Workflows Split Into Workers

Three workflows ship dedicated worker step files.
The setup, design, and trace workflows resolve execution mode inside a step and run their work in order.
`teach-me-testing` is a sequential, session-based learning flow.
`evaluate` uses its own authoring stages and the `tea-evaluate` runtime.

| Workflow             | Shape                          | Workers                                                                   | Aggregation                                                 |
| -------------------- | ------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `automate`           | Parallel generation            | API, backend, E2E, mobile test generation                                 | Merges tests, fixtures, and summary stats                   |
| `automate` red mode  | Parallel generation            | Failing API tests, failing E2E tests                                      | Validates red-phase output, merges artifacts                |
| `test-review`        | Parallel validation            | Determinism, isolation, maintainability, performance                      | Computes the combined quality score and report              |
| `nfr-assess`         | Parallel validation            | Security, performance, reliability, maintainability                       | Computes overall risk, compliance summary, priority actions |
| `framework`          | Sequential or parallel with CI | Scaffold work units; framework and CI generation for both scope           | Validates outputs against the agreed setup contract         |
| `framework` CI phase | Sequential + probe             | Pipeline generation                                                       | One deterministic pipeline artifact                         |
| `test-design`        | Sequential + probe             | Output generation                                                         | One deterministic design artifact                           |
| `trace`              | Two-phase, ordered             | Phase 1 builds the coverage matrix; Phase 2 reads it and decides the gate | Merges gap analysis with coverage and gate data             |

For both setup scopes, framework and CI workers can run in parallel after the stack, framework, and test commands are agreed.

Workers are isolated.
They exchange nothing directly and communicate only through the structured outputs that the aggregation step validates.

## Execution Modes

`tea_execution_mode` picks the orchestration strategy.
Default `auto`.

| Mode         | Behavior                                                          |
| ------------ | ----------------------------------------------------------------- |
| `auto`       | Probe capabilities and pick the best supported mode (recommended) |
| `agent-team` | Prefer team/delegation orchestration when the runtime supports it |
| `subagent`   | Prefer isolated worker orchestration when the runtime supports it |
| `sequential` | Run worker steps one at a time                                    |

With `tea_capability_probe: true` (the default), TEA falls back safely: `auto` tries `agent-team`, then `subagent`, then `sequential`; an explicitly requested `agent-team` or `subagent` falls back to the next supported mode; `sequential` always stays sequential.
With `tea_capability_probe: false`, TEA honors the requested mode strictly and fails if the runtime cannot execute it.

In `agent-team` and `subagent` modes, the runtime decides concurrency and timing.
TEA imposes no parallel worker limit of its own.

Recommended configuration, under `[modules.tea]` in `_bmad/config.toml`:

```toml
tea_execution_mode = "auto"
tea_capability_probe = "true"
```

Choose `sequential` when you need strict single-threaded execution or debugging clarity.
Choose `agent-team` or `subagent` explicitly only when you want that mode specifically and know your runtime supports it.

### Overriding a mode for one run

Explicit phrasing during a run overrides config for that run only.
Normalized terms:

- `agent team`, `agent teams`, `agentteam` → `agent-team`
- `subagent`, `subagents`, `sub agent`, `sub agents` → `subagent`
- `sequential` → `sequential`
- `auto` → `auto`

Precedence: explicit run-level request, then `tea_execution_mode` in config, then runtime fallback when probing is enabled.

### What mode never changes

Every mode uses the same output schemas, validation rules, and aggregation checks.
A missing or invalid worker output fails validation.

## Performance

Parallel workers can shorten a run when their tasks are independent.
Actual duration depends on the runtime, model, input size, and worker count.
Workflow progress reports the current step and active workers:

```text
✓ Step 1: Setup complete
✓ Step 2: Knowledge fragments loaded
⟳ Step 3: Generating tests (2 subagents running)
  ├── Subagent A: API tests... ✓
  └── Subagent B: E2E tests... ✓
✓ Step 4: Aggregating results
✓ Step 5: Validation complete
```

## Validation

Every workflow is validated with BMad Builder, which checks for granular instructions, explicit exit conditions, context injection in every step, strict action boundaries, and subagent support where the workflow supports it.
Validation reports describe the working tree at the time of the run and are not committed.
Re-run BMad Builder validation after editing a step file, and read the result from that run.

Earlier runs exercised the learning, design, setup, automation, review, NFR, and trace workflows against real projects: `teach-me-testing` across a multi-session flow with persisted progress, `test-design` against a real story and epic, `automate` against real codebases, `atdd` for the red phase with failing tests confirmed, `test-review` against known good and bad suites, `nfr-assess` against a complex system, `trace` for both the coverage matrix and the gate decision, `framework` for Playwright and Cypress scaffolds, and the earlier `ci` workflow for GitHub Actions and GitLab CI generation. These runs predate the combined framework and CI setup skill and the combined red/expand automation skill.
`evaluate` was first proved on itself: it authored and ran its own suite live.

## Maintaining Step Files

Update a step file when knowledge fragments change, a new pattern needs enforcing, the model improvises past an existing boundary, a step is slow enough to warrant splitting or parallelizing, or user feedback says an instruction is ambiguous.

Keep steps focused, restate their context, and state the required output and exit condition.
Use exact ranges such as "generate 3-5 test cases" and list forbidden actions.
Re-run BMad Builder validation after edits.

**Anti-patterns:** steps over 1000 words defeat the purpose; vague verbs like "analyze codebase" specify nothing; a missing exit condition leaves no stopping point; assumed knowledge across steps breaks under context pressure; more than one task in a step reintroduces everything step files were built to prevent.

## Troubleshooting

| Symptom                                 | Likely cause                                           | Fix                                                                      |
| --------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------ |
| Model still improvising                 | Step instructions too vague                            | Add explicit requirements and forbidden actions                          |
| Worker output not aggregating           | Temp file path mismatch or malformed JSON              | Check the temp file naming convention and validate the JSON shape        |
| Knowledge fragments not applied         | Fragment loading instructions unclear                  | Name the fragments and state the patterns they must produce              |
| Slow despite subagents                  | Not enough parallelization                             | Identify further independent steps to split into workers                 |
| Workflow ran in an unexpected mode      | Run-level override took precedence over config         | Check the resolved mode in the workflow execution report                 |
| Requested mode did not run              | Runtime lacked support and fallback changed the mode   | Check the resolved mode; disable probing only if you want a hard failure |
| Workflow failed instead of falling back | `tea_capability_probe: false` with an unsupported mode | Set the probe to `true`, or pick a mode the runtime supports             |

## Related

- [Knowledge Base System](/docs/explanation/knowledge-base-system.md): how steps select and load fragments
- [Test Review CLI Architecture](/docs/explanation/test-review-cli-architecture.md): running one of these workflows headless
- [TEA Configuration](/docs/reference/configuration.md): `tea_execution_mode` and `tea_capability_probe`
- [Extend TEA with Custom Workflows](/docs/how-to/customization/extend-tea-with-custom-workflows.md): authoring your own steps
- [TEA Overview](/docs/explanation/tea-overview.md): the eight workflows in the lifecycle
