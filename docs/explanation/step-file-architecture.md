---
title: TEA Step-File and Orchestration Architecture
description: How TEA splits workflows into granular step files, how those steps dispatch to parallel workers, and how execution mode is resolved
---

# TEA Step-File and Orchestration Architecture

TEA workflows are not one long instruction file. They are a chain of small step files, and some of those steps fan out into isolated workers whose outputs are merged back into a single artifact. This page covers both halves: the step-file format, and the orchestration that runs it.

## Why Step Files

A single 5000-word instruction file produces a predictable set of failures. The model skims it, improvises past the vague parts ("analyze codebase then generate tests" specifies nothing), keeps going because nothing told it where to stop, and returns a different result on the next run.

Step files break the workflow into self-contained units that each do one thing:

- **One step, one action.** Each file contains exactly one task.
- **Explicit exit conditions.** The step states what "finished" means.
- **Context injection.** Each step restates what it needs, assuming nothing about what the model still remembers.
- **Strict boundaries.** Each step lists what it must not do, so out-of-scope work has an explicit prohibition rather than an implicit one.
- **Just-in-time loading.** The agent reads one step file, executes it, then loads the next. It never loads them all at once.

The result is consistent output for the same input, which is what makes the rest of the architecture possible: you cannot parallelize work whose boundaries are undefined.

Layout in the repository, per workflow skill:

```text
bmad-testarch-automate/
├── workflow.yaml        # Metadata, config source, variables, output paths
├── instructions.md      # Entry point
├── checklist.md         # Validation checklist
├── resources/           # tea-index.csv + knowledge/ fragments
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

A worker step is the same shape with two differences: its exit condition ends the worker rather than advancing the chain, and it writes structured JSON to a temp file for the aggregation step to read:

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

Step frontmatter declares `knowledgeIndex: './resources/tea-index.csv'`, resolved from the skill root, and the step body names the fragments it wants:

```markdown
Use `{knowledgeIndex}` to load:

1. **fixture-architecture** - composable fixture patterns
2. **api-request** - API test patterns
3. **network-first** - network handling patterns

Generated tests MUST follow these patterns:

✅ Fixture composition (fixture-architecture)
✅ `await apiRequest()` (api-request)
✅ Intercept before navigate (network-first)

❌ Do NOT substitute custom patterns
```

See [Knowledge Base System](/docs/explanation/knowledge-base-system.md) for how fragments are selected and maintained.

## How Workflows Split Into Workers

Four workflows ship dedicated worker step files. Four resolve execution mode inside a step but run their work in order. `teach-me-testing` does neither; it is a sequential, session-based learning flow.

| Workflow      | Shape               | Workers                                                                   | Aggregation                                                 |
| ------------- | ------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `automate`    | Parallel generation | API, backend, E2E, mobile test generation                                 | Merges tests, fixtures, and summary stats                   |
| `atdd`        | Parallel generation | Failing API tests, failing E2E tests                                      | Validates red-phase output, merges artifacts                |
| `test-review` | Parallel validation | Determinism, isolation, maintainability, performance                      | Computes the combined quality score and report              |
| `nfr-assess`  | Parallel validation | Security, performance, reliability, maintainability                       | Computes overall risk, compliance summary, priority actions |
| `framework`   | Sequential + probe  | Scaffold work units (structure/config, fixtures, samples)                 | Consolidates the generated framework setup                  |
| `ci`          | Sequential + probe  | Pipeline generation                                                       | One deterministic pipeline artifact                         |
| `test-design` | Sequential + probe  | Output generation                                                         | One deterministic design artifact                           |
| `trace`       | Two-phase, ordered  | Phase 1 builds the coverage matrix; Phase 2 reads it and decides the gate | Merges gap analysis with coverage and gate data             |

Workers are isolated. They exchange nothing directly and communicate only through the structured outputs that the aggregation step validates.

## Execution Modes

`tea_execution_mode` picks the orchestration strategy. Default `auto`.

| Mode         | Behavior                                                          |
| ------------ | ----------------------------------------------------------------- |
| `auto`       | Probe capabilities and pick the best supported mode (recommended) |
| `agent-team` | Prefer team/delegation orchestration when the runtime supports it |
| `subagent`   | Prefer isolated worker orchestration when the runtime supports it |
| `sequential` | Run worker steps one at a time                                    |

With `tea_capability_probe: true` (the default), TEA falls back safely: `auto` tries `agent-team`, then `subagent`, then `sequential`; an explicitly requested `agent-team` or `subagent` falls back to the next supported mode; `sequential` always stays sequential. With `tea_capability_probe: false`, TEA honors the requested mode strictly and fails if the runtime cannot execute it.

In `agent-team` and `subagent` modes, the runtime decides concurrency and timing. TEA imposes no parallel worker limit of its own.

Recommended configuration:

```yaml
tea_execution_mode: 'auto'
tea_capability_probe: true
```

Choose `sequential` when you need strict single-threaded execution or debugging clarity. Choose `agent-team` or `subagent` explicitly only when you want that mode specifically and know your runtime supports it.

### Overriding a mode for one run

Explicit phrasing during a run overrides config for that run only. Normalized terms:

- `agent team`, `agent teams`, `agentteam` → `agent-team`
- `subagent`, `subagents`, `sub agent`, `sub agents` → `subagent`
- `sequential` → `sequential`
- `auto` → `auto`

Precedence: explicit run-level request, then `tea_execution_mode` in config, then runtime fallback when probing is enabled.

### What mode never changes

Across every mode TEA holds the same guarantees: the same output schema per workflow, the same validation and aggregation rules, the same deterministic fallback semantics, and the same failure behavior when a worker output is missing or invalid. Mode selection changes orchestration, never artifact contracts.

## Performance

Parallel dispatch is the reason worker splits exist. The figures below are rough development-run estimates, not a published benchmark; treat them as the shape of the effect rather than as measurements.

| Workflow      | Sequential | Parallel workers | Approx. change |
| ------------- | ---------- | ---------------- | -------------- |
| `automate`    | ~10 min    | ~5 min           | ~50% faster    |
| `test-review` | ~5 min     | ~2 min           | ~60% faster    |
| `nfr-assess`  | ~12 min    | ~4 min           | ~67% faster    |

Users do not need to know any of this to run a workflow. What they see is consistent output for the same input, faster runs where parallelism applies, and progress reporting per step:

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

Every workflow is validated with BMad Builder, which checks for granular instructions, explicit exit conditions, context injection in every step, strict action boundaries, and subagent support where the workflow supports it. Validation runs against the working tree at the time it is invoked, so its output is a point-in-time reading rather than a durable artifact; the reports are not committed. Re-run BMad Builder validation after editing a step file, and read the result from that run.

All nine workflows have been exercised against real projects: `teach-me-testing` across a multi-session flow with persisted progress, `test-design` against a real story and epic, `automate` against real codebases, `atdd` for the red phase with failing tests confirmed, `test-review` against known good and bad suites, `nfr-assess` against a complex system, `trace` for both the coverage matrix and the gate decision, `framework` for Playwright and Cypress scaffolds, and `ci` for GitHub Actions and GitLab CI generation.

## Maintaining Step Files

Update a step file when knowledge fragments change, a new pattern needs enforcing, the model improvises past an existing boundary, a step is slow enough to warrant splitting or parallelizing, or user feedback says an instruction is ambiguous.

**Practices that hold:** keep each step to 200-500 words; restate context rather than assuming recall; be explicit ("generate 3-5 test cases", not "generate some tests"); list forbidden actions rather than implying them; re-run BMad Builder validation after every edit.

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

- [Knowledge Base System](/docs/explanation/knowledge-base-system.md) - how steps select and load fragments
- [Test Review CLI Architecture](/docs/explanation/test-review-cli-architecture.md) - running one of these workflows headless
- [TEA Configuration](/docs/reference/configuration.md) - `tea_execution_mode` and `tea_capability_probe`
- [Extend TEA with Custom Workflows](/docs/how-to/customization/extend-tea-with-custom-workflows.md) - authoring your own steps
- [TEA Overview](/docs/explanation/tea-overview.md) - the nine workflows in the lifecycle
