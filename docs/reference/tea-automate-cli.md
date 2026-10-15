---
title: tea-automate CLI
description: Generate red acceptance scaffolds or expand test coverage through a headless agent
---

# tea-automate CLI

`tea-automate` runs the merged Automate skill shipped in the npm package.
It supplies project configuration and mode customizations, runs the agent, and validates the generated manifest and summary.

Needs Node.js 22.20.0+ and an installed, authenticated agent CLI ([prerequisites](/docs/reference/tea-test-review-cli.md#prerequisites)).

A live run writes tests and runs the project's tests.

```bash
npm install -g bmad-method-test-architecture-enterprise
tea-automate --agent codex --mode expand --target src \
  "Add API coverage for the voucher redemption rules"

tea-automate --agent codex --mode red --story docs/stories/reserve-a-locker.md
```

Preview with `--agent none` first. Add `--allow-network` only when the tests need it (see below).

An explicit `--mode` selects red or expand.
Without it, acceptance-test wording selects red, coverage wording selects expand, and unspecified requests default to expand.
Resume restores the checkpoint's mode.
Conflicting explicit modes stop before the agent runs.

Create executes generated tests and repairs confirmed test defects, using up to three repair rounds.
Red retains skipped permanent scaffolds and verifies intended failures in a disposable copy.
Expand keeps generated tests active.
Product defects and execution blockers appear in the saved summary and JSON output.

`tea-automate` does not grant Codex workspace network access by default. The user's Codex configuration can still enable it.
Pass `--allow-network` when project tests need local HTTP services or other network calls. This grants unrestricted outbound network access for that Automate run.
The flag requires `--agent codex`. An explicit `--agent-arg=-c --agent-arg=sandbox_workspace_write.network_access=false` takes precedence over the flag.
OpenAI documents this setting in [agent approvals and security](https://developers.openai.com/codex/agent-approvals-security).

## Operations

```bash
# Print the resolved prompt without generating files or calling a model.
tea-automate --agent none --mode expand --target src "Cover the checkout service"

# Continue the exact saved run, preserving its scope and repair budget.
tea-automate --agent codex --operation resume \
  --checkpoint _bmad-output/test-artifacts/atdd/atdd-checklist-reserve-a-locker.md

# Validate the saved artifact and its execution evidence.
tea-automate --agent codex --operation validate \
  --checkpoint _bmad-output/test-artifacts/automate/automation-summary-checkout.md

# Apply the requested changes to the exact saved artifact.
tea-automate --agent codex --operation edit \
  --checkpoint _bmad-output/test-artifacts/automate/automation-summary-checkout.md \
  "Add the missing expired-voucher coverage"
```

Generation operations require zero transport retries.
Resume the retained checkpoint explicitly after an interrupted run so its saved scope and repair budget remain authoritative.

Validate leaves the selected checkpoint unchanged and records a PASS, WARN, or FAIL report identifying that checkpoint.
Edit updates the selected checkpoint while preserving its identity, progress, and repair settings.
Both preserve skill boundaries and run no automatic repairs.

## Inputs and configuration

The command runs in the current directory.
`--project-root` selects a consuming project.
Supply a request as the positional argument or UTF-8 text on standard input.
A story, target, or checkpoint can supply the scope without additional text.
Red Create requires `--story`.
Edit requires change instructions.

The CLI uses the [TEA configuration layers](./configuration.md) and module defaults when setup files are absent.
Red resolves the `bmad-tea-atdd` customization surface.
Expand resolves `bmad-tea-automate`.
Prepend steps, facts, append steps, and completion hooks retain their order.

| Option                                       | Meaning                                                        |
| -------------------------------------------- | -------------------------------------------------------------- |
| `--agent <name>`                             | Required adapter; `none` prints the prompt                     |
| `--mode red\|expand`                         | Explicit generation mode                                       |
| `--operation create\|resume\|validate\|edit` | Operation; default Create                                      |
| `--story <path>`                             | Story file inside the selected project                         |
| `--target <path>`                            | Target file or directory; repeat as needed                     |
| `--checkpoint <path>`                        | Exact saved artifact for Resume, Validate, or Edit             |
| `--project-root <dir>`                       | Consuming project directory                                    |
| `--project-skill`                            | Select the project-installed canonical Automate skill          |
| `--skill-root <dir>`                         | Explicit canonical skill copy with sibling TEA knowledge       |
| `--evidence-dir <dir>`                       | Project directory for retained run evidence                    |
| `--json <path>`                              | Additional JSON result file inside the project                 |
| `--model <name>`                             | Model override; not accepted with `custom` or `none`.          |
| `--timeout-ms <n>`                           | Wall-clock limit per attempt; default 1,200,000 ms             |
| `--retries <n>`                              | Validate transport/timeout retries, 0-3; generation requires 0 |
| `--allow-network`                            | Codex only: allow outbound network access (see above)          |
| `--agent-cmd <path>`                         | Agent executable override                                      |
| `--agent-arg <arg>`                          | Extra agent argument; repeat as needed                         |
| `--env-pass <NAME>`                          | Additional environment variable passed to the agent            |

Claude and Codex default to an adapter model (Codex: `gpt-6.1-sol`) and Agy to its session model. A `custom` runner takes its model via `--agent-arg` ([details](/docs/reference/tea-test-review-cli.md#which-model-does-the-reviewing)).

## Results and evidence

Live commands create a unique directory under `_bmad-output/test-artifacts/automate-cli/`.
Each attempt keeps its prompt, agent stdout and stderr, timing, and generation manifest.
`run.json` records the selected adapter, model, timeout, capability, and attempt outcomes.
The workflow's original summary/checklist path stays intact.

JSON output includes request identity, selected mode and operation, execution status, generated files, final execution reports, initial/final counts, repair rounds, remaining failures, and the Validate report path.
Each Create summary identifies the current request, story, and targets.
Its summary and generated files must be saved during that attempt.
Resume updates the exact selected checkpoint and retains its saved scope and spent repair budget.

### Which generated tests can be verified

Tests registered at runtime (loops, table registrations, computed titles, reassigned test bindings) cannot produce a verified success: dynamic scopes cannot be verified from source, so the outcome is failed.
The rest of this section applies to statically registered tests.

Passing expand and verified red outcomes require supported native Playwright JSON or ATDD verifier reports for every final scope.
Counts must match recorded attempts.
Verified red requires an assertion failure for every executed test.
Timeouts, interruptions, runner errors, and source changes reject success.
Unsupported report formats retain evidence and produce a failed or unmeasured outcome.
JSON result destinations are checked before and after generation against input and artifact paths, including hardlink aliases.

Before accepting success, the controller derives each generated JavaScript or TypeScript test leaf from its saved source.
Playwright results must identify the same file, suite/title, source line, column, and matching configured project, including configured repetitions.
Native ATDD results must identify a unique file and leaf title.
Missing files, leaves, or project scopes reject success.

Static literal registrations support named imports, CommonJS destructuring, module namespaces, and aliases returned by `extend` or `mergeTests`.
Native source locations follow the binding and module format, including `.mjs` and package `type: module`.
Nested Playwright configs keep the consuming project root as the file identity base.
Project selection follows native glob and serialized RegExp `testMatch`/`testIgnore` rules, including flags.
A filtered native run must still cover every generated leaf in each matching project.

### Completion and retained inventories

Each successful attempt retains `generated-test-inventory.json` with source hashes and `validated-test-scopes.json` with reconciled runner identities.
These are controller checks of the final generated source.
The skill owns its pre-execution scope freeze and execution history.

Create and Resume require the selected mode's completed preflight, strategy/target, aggregation or generation, and terminal steps.
A completed flag alone cannot finish generation.
When validation or healing is disabled, fresh Create consumes zero repair rounds and Resume preserves its saved counter.
Directory targets protect every existing file descendant and its inode aliases before execution.
New JSON paths remain available inside those directories.

| Exit | Meaning                                                                                                                 |
| ---- | ----------------------------------------------------------------------------------------------------------------------- |
| `0`  | Passing expand execution, verified red execution, completed operation, configured validation opt-out, or prompt preview |
| `1`  | Failed/unmeasured execution or reported unresolved work                                                                 |
| `2`  | Invalid arguments, configuration, required inputs, or paths                                                             |
| `3`  | Agent failure, malformed result, incomplete summary, or missing artifact                                                |

The [Automate guide](../how-to/workflows/run-automate.md) describes the generation workflow and handoff.
