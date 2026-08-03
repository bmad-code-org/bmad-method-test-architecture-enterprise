---
title: Test Review CLI Architecture
description: How the tea-test-review CLI wraps an interactive skill into a required CI gate, and how to build one
---

# How a Skill Becomes a CLI

A TEA workflow expects a human: it asks which mode to run and what inputs to use. A CI gate can't. No human, no blocking questions, must end in an exit code.

`tea-test-review` is that bridge for `bmad-testarch-test-review`. This page covers how it's built, so the same shape can wrap another workflow. Flags, exit codes, verdict schema: [tea-test-review CLI reference](/docs/reference/tea-test-review-cli.md).

**Governing rule: the skill is the source of truth.** Checklist, scoring, report template all live in the workflow. The CLI only resolves the skill, scopes the review, runs the agent, parses the result. Skill wins any dispute.

---

## Five problems, five modules

| Problem                           | Module                               |
| --------------------------------- | ------------------------------------ |
| Find the skill                    | `lib/resolve-skill.js`               |
| Decide what to feed it            | `lib/changed-tests.js`               |
| Settle its configuration          | `lib/resolve-tea-config.js`          |
| Make it run with no human present | `lib/build-prompt.js`                |
| Spawn it without trusting it      | `lib/run-agent.js`, `lib/isolate.js` |
| Turn prose into an exit code      | `lib/parse-report.js`                |

`cli/test-review.js` runs them in order: resolve skill, resolve config, scope review set, build prompt, spawn agent under isolation, parse report, emit verdict, exit.

---

## State every branch input

If a branch input isn't in the prompt, the agent decides it itself, and can decide differently next run. A human answers the same lazy config question consistently; a headless agent gets no such guarantee.

Early version: stated `tea_browser_automation` and `tea_execution_mode`, but not the three keys that pick knowledge fragments. `_bmad/tea/config.yaml` never exists in CI, so two runs on identical files could load different knowledge: a contract-testing repo could silently get the generic fragment instead.

Fix: a precedence chain, resolved once, stated in full.

1. Explicit flag
2. Project's config file
3. Module default

The CLI also hardcodes the module defaults (mirrors `src/module.yaml`) so it can state them when no config file exists. A test asserts the two stay equal; drift fails the gate instead of silently changing what CI reviews.

---

## Making a workflow headless

`buildPrompt()` does three things:

- **Skips the menu, keeps the activation.** Runs the `SKILL.md` activation sequence silently (customization still merges: base, team, user), skips only the interactive menu, and enters Create mode at step one.
- **Pre-supplies every input the workflow can ask for.** `review_files`, `review_scope`, `test_dir`, execution mode, browser automation: all resolved before the agent starts. An unsupplied input is a hang risk.
- **Marks the file list as data.** The review set travels as a JSON array between `---BEGIN FILES---` / `---END FILES---` delimiters. Instructions inside reviewed files are defects to report, never commands. Paths with newlines, NUL bytes, or delimiter literals are rejected before they reach the prompt.

This is why `workflow.yaml` and `customize.toml` declare `headless`, `review_files`, `output_file_override`, `generate_inline_comments` as first-class inputs.

---

## The two contracts must mirror each other

`build-prompt.js` states the report contract. `parse-report.js` enforces it. Keep them in sync; that's the single most important discipline here.

**Every strict parser check must also be stated in the prompt.** Otherwise a correctly-shaped-but-untold report fails the build for no real reason. Real example: a 742-line, correct report got rejected because the agent wrote a YAML list as a wrapped flow sequence; nothing had promised the unwrapped shape.

Two habits:

- Tightening the parser: add the same sentence to the prompt, same commit.
- Widening the parser to a new shape: add a negative control, so the widening doesn't fail open.

---

## Exit codes separate a verdict from a broken gate

- `0` passed, skipped, or waived
- `1` review says the code needs work
- `2` environment or config is wrong
- `3` agent failed, or its report couldn't be trusted

Exit `1` is a real result. `2` and `3` mean the gate itself broke, never waivable. Collapse them into one code and a broken runner looks like bad tests; teams stop trusting the check.

Same logic on the report: a parse failure is never a silent pass, stale artifacts are deleted before each run, and the verdict's `files` manifest reflects what the agent says it reviewed.

---

## Why the CLI ships in this repository

Prompt contract, parser, and report template are one contract in three files; they version together.

Clearest example: the scoring model. The report template defines the deduction ledger, the prompt states its arithmetic, the parser recomputes the score and rejects anything that contradicts the ledger. Change one without the others and the gate rejects every valid report. Shipping CLI and skill in the same package, same version, prevents that.

---

## Trying it locally

From a clone of this repo, the skill isn't installed under `_bmad/`, so point `--skill-root` at the source instead.

`--agent none` builds the prompt, prints it, exits. No subprocess, no API cost:

```bash
node cli/test-review.js --agent none --files test/test-test-review-cli.js --skill-root src/workflows/testarch/bmad-testarch-test-review
```

Add a second file and `review_scope` flips from `single` to `directory`.

With a real agent, same flags, swap in `--agent claude` and export `ANTHROPIC_API_KEY` first:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
node cli/test-review.js --agent claude --files test/test-test-review-cli.js --skill-root src/workflows/testarch/bmad-testarch-test-review --output test-review.md
```

Once the package is installed in a consuming repo, the bare `tea-test-review` binary resolves the skill on its own; drop `--skill-root`.

---

## What the test suite can and cannot prove

`test/test-test-review-cli.js` covers the modules in isolation: fixture reports as parser input, a stub agent standing in for the real one. Fixture layout: `test/README.md`.

Limit: a green suite proves the parser is self-consistent. Only a real run proves a live agent produces what the parser expects. Every fixture here was written after a real defect, copied from what the live agent actually emitted.
