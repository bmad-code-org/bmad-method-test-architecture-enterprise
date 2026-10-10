---
title: tea-automate CLI
description: Generate red acceptance scaffolds or expand test coverage through a headless agent
---

# tea-automate CLI

`tea-automate` runs the merged Automate skill shipped in the npm package. It supplies project configuration and the selected mode's customization, runs the agent, and validates the generated summary and result manifest.

```bash
npm install -g bmad-method-test-architecture-enterprise
tea-automate --agent codex --mode expand --target src \
  "Add API coverage for the voucher redemption rules"

tea-automate --agent codex --mode red --story docs/stories/reserve-a-locker.md
```

An explicit `--mode` selects red or expand. Without it, acceptance-test wording selects red, coverage wording selects expand, and an unspecified or conflicting request defaults to expand. Resume restores its checkpoint's mode. A conflicting explicit mode stops before the agent runs.

Create executes generated tests and repairs confirmed test defects by default, using the skill's maximum of three repair rounds. Red retains skipped permanent scaffolds and verifies their intended failures in a disposable copy. Expand keeps generated tests active. Real product defects and execution blockers appear in the saved summary and JSON output.

Codex command execution enables network access within its workspace sandbox so local HTTP services and project test commands can run. Read-only and artifact-write runs keep their existing network settings. An explicit `--agent-arg=-c --agent-arg=sandbox_workspace_write.network_access=false` disables network access for this command. OpenAI documents this setting in [agent approvals and security](https://learn.chatgpt.com/docs/agent-approvals-security).

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

Generation operations require zero transport retries. Resume the retained checkpoint explicitly after an interrupted run so its saved scope and repair budget remain authoritative.

Validate leaves the selected checkpoint unchanged and records a fresh PASS, WARN, or FAIL report identifying that checkpoint. Edit updates the selected checkpoint while preserving its identity, progress, and repair settings. Both preserve the skill's operation boundaries and perform no automatic repair.

## Inputs and configuration

The command runs in the current directory. `--project-root` selects a consuming project. Supply a request as the positional argument or UTF-8 text on standard input. A story, target, or checkpoint can supply the scope without additional text. Red Create requires `--story`; Edit requires change instructions.

The CLI uses the [TEA configuration layers](./configuration.md) and module defaults when setup files are absent. Red resolves the `bmad-testarch-atdd` customization surface; expand resolves `bmad-testarch-automate`. Their prepend steps, facts, append steps, and completion hooks retain their existing order.

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
| `--model <name>`                             | Model override; default is the adapter's pinned model          |
| `--timeout-ms <n>`                           | Wall-clock limit per attempt; default 1,200,000 ms             |
| `--retries <n>`                              | Validate transport/timeout retries, 0–3; generation requires 0 |
| `--agent-cmd <path>`                         | Agent executable override                                      |
| `--agent-arg <arg>`                          | Extra agent argument; repeat as needed                         |
| `--env-pass <NAME>`                          | Additional environment variable passed to the agent            |

## Results and evidence

Live commands create a unique directory under `_bmad-output/test-artifacts/automate-cli/`. Each attempt keeps its prompt, agent stdout and stderr, timing, and generation manifest. `run.json` records the selected adapter, model, timeout, capability, and attempt outcomes. The workflow's original summary/checklist path stays intact.

JSON output includes the request identity, selected mode and operation, execution status, generated files, final execution reports, initial/final counts, repair rounds, remaining failures, and the Validate report path when applicable. Each Create summary identifies the current request, story, and targets; its summary and generated files must be saved during that attempt. Resume updates the exact selected checkpoint and retains its saved scope and spent repair budget.

Passing expand and verified red outcomes require supported native Playwright JSON or ATDD verifier reports for every final scope. Counts must match recorded attempts. Verified red requires an assertion failure for every executed test; timeouts, interruptions, runner errors, and source changes reject success. Unsupported report formats retain their evidence and require a failed or unmeasured outcome. JSON result destinations are checked before and after generation against input and artifact paths, including hardlink aliases.

Before accepting success, the controller derives each generated JavaScript or TypeScript test leaf from its saved source. Playwright results must identify the same file, suite/title, source line, column, and matching configured project, including configured repetitions. Native ATDD results must identify a unique file and leaf title. Missing files, leaves, or project scopes reject success. Static literal registrations and imported test aliases are supported. Runtime loops, table registrations, computed titles, and unresolved callbacks require a failed or unmeasured outcome because the controller cannot enumerate their complete scope from source.

Each successful attempt retains `generated-test-inventory.json` with source hashes and `validated-test-scopes.json` with reconciled runner identities. These are controller checks of the final generated source. The skill owns its pre-execution scope freeze and execution history. The controller inventory alone cannot prove that source stayed unchanged during model execution.

Create and Resume require the selected mode's completed preflight, strategy/target, aggregation or generation, and terminal steps. A completed flag alone cannot finish generation. When validation or healing is disabled, fresh Create consumes zero repair rounds and Resume preserves its saved counter. Directory targets protect every existing file descendant and its inode aliases before execution; new JSON paths remain available inside those directories.

| Exit | Meaning                                                                                                                 |
| ---- | ----------------------------------------------------------------------------------------------------------------------- |
| `0`  | Passing expand execution, verified red execution, completed operation, configured validation opt-out, or prompt preview |
| `1`  | Failed/unmeasured execution or reported unresolved work                                                                 |
| `2`  | Invalid arguments, configuration, required inputs, or paths                                                             |
| `3`  | Agent failure, malformed result, incomplete summary, or missing artifact                                                |

The [Automate guide](../how-to/workflows/run-automate.md) describes the generation workflow and handoff.
