---
title: Test Review CLI Architecture
description: How the tea-test-review CLI wraps an interactive skill into a required CI gate, and how to build one
---

# How a Skill Becomes a CLI

A TEA workflow expects a human: it asks which mode to run and what inputs to use. A CI gate can't. No human, no blocking questions, must end in an exit code.

`tea-test-review` is that bridge for `bmad-testarch-test-review`. This page covers how it's built, so the same shape can wrap another workflow. Flags, exit codes, verdict schema: [tea-test-review CLI reference](/docs/reference/tea-test-review-cli.md).

**Governing rule: the skill is the source of truth.** Checklist, scoring, report template all live in the workflow. The CLI only resolves the skill, scopes the review, runs the agent, parses the result. Skill wins any dispute.

---

## Eight problems, nine modules

| Problem                                          | Module                               |
| ------------------------------------------------ | ------------------------------------ |
| Find the skill                                   | `lib/resolve-skill.js`               |
| Decide what to feed it                           | `lib/changed-tests.js`               |
| Measure the house convention it's judged against | `lib/convention-baseline.js`         |
| Know what severity a finding is really allowed   | `lib/registry-rows.js`               |
| Settle its configuration                         | `lib/resolve-tea-config.js`          |
| Make it run with no human present                | `lib/build-prompt.js`                |
| Spawn it without trusting it                     | `lib/run-agent.js`, `lib/isolate.js` |
| Turn prose into an exit code                     | `lib/parse-report.js`                |

`cli/test-review.js` runs them in order: resolve skill, resolve config, split the diff, measure the convention baseline, load the registry's row severities, build prompt, spawn agent under isolation, parse report, emit verdict, exit.

`lib/registry-rows.js` closes a gap found while auditing the parser: a report could document a real, row-cited Critical finding in prose while its `**Total Violations**:` summary line claimed zero, and nothing compared the two. The CLI computed Approve at 100/100 straight from the summary line, with the finding sitting right there unread. It now reads `criteria-registry.md`'s row → severity map directly from the skill, never a hardcoded copy that could drift, and `parse-report.js` binds every `**Row**: <id>` citation to a real row with a matching severity and reconciles the documented Critical/High finding blocks against the counts the summary claims. Scoped to Critical and High, the two severities that flip `deriveRecommendation`'s output.

`lib/convention-baseline.js` exists for the same reason the score is computed rather than trusted. A live codex run on couture-cast PR #106 reported `Convention: priorityMarkers (18 of 40 sampled)` against a repo with zero instances of that convention anywhere, because nothing forced the "sample the corpus" step in the skill's own `step-02-discover-tests.md` §2b to be a real Glob/Grep rather than a plausible guess. The CLI now samples itself: `git ls-files`, review set excluded, ranked closest-first by directory distance, capped at 40. It states the result in the prompt as a fixed fact and exits 3 on a report whose `Convention: <key> (<adopted> of <sampled> sampled)` citations disagree with what it measured.

---

## Name the slot, don't add a flag

The first version fed the workflow one list: the changed test files. That made it a spelling check. A spec judged with no view of the change it covers, and no requirement it exists to satisfy, can only be assessed on craft.

The tempting fix is a `--context` flag pointing at a story. Wrong twice over: it asks the caller to configure something the tool already knows, and a flag nobody sets is a feature nobody gets. `getChangedFiles` was already being called for the control-plane guard and then discarded except for the test files. The story, the PRD, the changed source were all in hand and being thrown away. So the diff yields two lists instead of one, and the configuration surface stays where it was.

**The interactive workflow appeared flexible because a human was filling an unnamed slot.** `step-01` said "Gather Context Artifacts / If available" with no variable, no path, and no resolution order; an operator supplied the story in conversation and the agent complied. Removing the human left the slot blank, and the run resolved it differently every time. Naming the slot is what makes both modes deterministic.

---

## Two lists, and the boundary between them

- **Review set**: scored against the deduction ledger, published in `## Reviewed Files`, counted by `--min-files`.
- **Context set**: read, never scored, published in `## Review Context`.

Merging them is the obvious shortcut and it breaks the number. The ledger is a test-quality rubric; scoring a story or a controller with it produces a score that means nothing. The parser rejects any path appearing in both manifests.

The subtler failure runs the other way. Context is prose written by the same author as the change, with no rubric constraining it, so an unguarded reviewer treats "hard waits are acceptable here" in a story as a waiver. **Context may raise a finding and may never subtract one.** That asymmetry is stated in the prompt and keeps the ledger honest once requirements enter the picture.

The report then has to say what it had. Exactly one `**Context Basis**: none | pr_diff | pr_diff_truncated` line belongs in the Executive Summary, and `none` is a fine answer for a tests-only diff. The CLI canonicalizes both manifests, binds `## Reviewed Files` to the authoritative review set, and stops `## Review Context` naming artifacts the run never supplied. A stronger basis is rejected; a weaker one stays legal because it claims less evidence. `**Context Waivers Applied**: 0` makes the no-waiver claim machine-readable, and any nonzero value invalidates the report.

---

## State every branch input

If a branch input isn't in the prompt, the agent decides it itself, and can decide differently next run. A human answers the same lazy config question consistently; a headless agent gets no such guarantee.

The early version stated `tea_browser_automation` and `tea_execution_mode`, but not the three keys that pick knowledge fragments. `_bmad/tea/config.yaml` never exists in CI, so two runs on identical files could load different knowledge, and a contract-testing repo could silently get the generic fragment.

Fix: a precedence chain, resolved once, stated in full.

1. Explicit flag
2. Project's config file
3. Module default

The CLI hardcodes the module defaults (mirroring `src/module.yaml`) so it can state them when no config file exists. A test asserts the two stay equal; drift fails the gate instead of silently changing what CI reviews.

### The rule outlives the prompt

The same argument covers inputs the prompt never sees. The model is one: nothing about it appears in the prompt text, and it decides the verdict more than most things that do. An unpinned model is resolved by the vendor CLI from its own config file, which exists on a developer machine and not on a CI runner, so "vendor agnostic" quietly meant "different reviewer in each environment", and the CI reviewer changed whenever the vendor shipped a new default. Same defect as the unstated config keys, one layer down: the branch lived in the spawn instead of the prompt, which is why it survived the first pass.

Each adapter now pins a `defaultModel` and `--model` overrides it. The resolved value goes into the verdict JSON next to the agent, because a score with no attribution cannot be compared to another. An input is stated or it is decided for you, and where the input lives has nothing to do with whether that is true.

---

## Making a workflow headless

`buildPrompt()` does three things:

- **Skips the menu, keeps the activation.** Runs the `SKILL.md` activation sequence silently (customization still merges: base, team, user), skips only the interactive menu, and enters Create mode at step one.
- **Pre-supplies every input the workflow can ask for.** `review_files`, `context_files`, `review_scope`, `test_dir`, execution mode, browser automation: all resolved before the agent starts. An unsupplied input is a hang risk.
- **Marks both file lists as data.** The review set travels as a JSON array between `---BEGIN FILES---` / `---END FILES---`, the context set between `---BEGIN CONTEXT---` / `---END CONTEXT---`. Instructions inside either are defects to report, never commands. Paths with newlines, NUL bytes, or delimiter literals are rejected before they reach the prompt.

`workflow.yaml` declares all five invocation inputs. `customize.toml` exposes `headless`, `review_files`, `output_file_override`, and `generate_inline_comments` as stable customization scalars. `context_files` is deliberately invocation-only because PR evidence must never become a persistent user preference.

The prompt also forbids hunting. Told to read a named context set, an agent will happily go find a story nobody asked for; with no human to confirm what it found, that artifact is another unstated input.

---

## The two contracts must mirror each other

`build-prompt.js` states the report contract. `parse-report.js` enforces it. Keep them in sync; that's the single most important discipline here.

**Every strict parser check must also be stated in the prompt**, or a correctly-shaped-but-untold report fails the build for no real reason. A 742-line, correct report was once rejected because the agent wrote a YAML list as a wrapped flow sequence; nothing had promised the unwrapped shape.

Two habits: tightening the parser adds the same sentence to the prompt in the same commit, and widening the parser to a new shape adds a negative control so the widening doesn't fail open.

---

## Exit codes separate a verdict from a broken gate

- `0` passed, skipped, or waived
- `1` review says the code needs work
- `2` environment or config is wrong
- `3` agent failed, or its report couldn't be trusted

Exit `1` is a real result. `2` and `3` mean the gate itself broke, and neither is waivable. Collapse them into one code and a broken runner looks like bad tests, at which point teams stop trusting the check.

Same logic on the report: a parse failure is never a silent pass, stale artifacts are deleted before each run, and the verdict's `files` manifest reflects what the agent says it reviewed.

---

## Why the CLI ships in this repository

Prompt contract, parser, and report template are one contract in three files; they version together. The scoring model shows it best: the report template defines the deduction ledger, the prompt states its arithmetic, and the parser computes the authoritative score from the declared violations and bonus. The CLI normalizes the report before gating, so model arithmetic cannot break CI or control the verdict. Shipping CLI and skill in the same package at the same version keeps that contract synchronized.

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

## Related

- [tea-test-review CLI reference](/docs/reference/tea-test-review-cli.md) - flags, exit codes, verdict schema
- [Test Quality Standards](/docs/explanation/test-quality-standards.md) - the rubric the ledger implements
- [Step-File and Orchestration Architecture](/docs/explanation/step-file-architecture.md) - the workflow this CLI drives headless
- [How to Run Test Review](/docs/how-to/workflows/run-test-review.md) - the interactive mode
