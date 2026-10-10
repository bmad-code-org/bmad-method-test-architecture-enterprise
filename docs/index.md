---
title: Test Engineering Architect (TEA)
description: Test Engineering Architect (TEA) skills for risk-based testing, automation, evaluation, and release gates
---

# Test Engineering Architect (TEA)

TEA is a BMad module for test strategy and automation.
Its eight skills cover learning, test design, setup, automation, evaluation, review, and release decisions.
You can use it on its own or alongside BMad Method.

Risk assessment, NFR planning, traceability, and release gates apply across stacks.
Generation and execution support vary by target.
See the [execution-target matrix](/reference/execution-targets) for the supported stacks and their limits.

## Install

```bash
npx skills add bmad-code-org/bmad-method-test-architecture-enterprise
```

Setup needs [uv](https://docs.astral.sh/uv/) and BMad Method's `bmad` and `bmod-core-tools` skills.
If those skills are missing, install them:

```bash
npx skills add bmad-code-org/BMAD-METHOD --skill bmad bmod-core-tools
```

Then type `bmad setup tea` in your assistant chat to answer TEA's setup questions.
See [Configuration](/reference/configuration) for the settings and output folders.

Run `/bmad-testarch-test-design` in Claude Code, Cursor, or Windsurf, or `$bmad-testarch-test-design` in Codex.
For the agent menu, load `/bmad-tea` or `$bmad-tea` and type `TD`.
Each skill also works directly in a fresh session.

## Choose a starting point

- [TEA Lite](/tutorials/tea-lite-quickstart) adds coverage to an existing project.
- [TEA Academy](/tutorials/learn-testing-tea-academy) teaches testing through seven sessions.
- [TEA Overview](/explanation/tea-overview) shows the skill order and BMad lifecycle.
- [Evaluate Your First Skill](/tutorials/evaluate-your-first-skill) runs an evaluation from requirements to an accepted baseline.
- [Enterprise projects](/how-to/brownfield/use-tea-for-enterprise) and [existing test suites](/how-to/brownfield/use-tea-with-existing-tests) have their own guides.
- [Custom skills](/how-to/customization/extend-tea-with-custom-workflows) explains how to extend the agent menu.

<a id="workflows"></a>

## Skills

Use the command in chat.
On Codex, replace the leading `/` with `$`.
Menu codes work after loading `bmad-tea`.
Ten direct capability commands start the eight canonical skills.
See [Commands](/reference/commands) for every invocation and menu code.

- [Test Review](/how-to/workflows/run-test-review): Audit test quality and score findings.
- [Automate](/how-to/workflows/run-automate): Generate red acceptance scaffolds or expand coverage.
- [Test Design](/how-to/workflows/run-test-design): Plan risks, coverage, and NFR evidence.
- [Framework](/how-to/workflows/setup-test-framework): Set up a test framework, CI, or both.
- [NFR](/how-to/workflows/run-nfr-assess): Audit implemented NFR evidence.
- [Teach Me Testing](/how-to/workflows/teach-me-testing): Learn testing through seven sessions.

### Additional Skills

- [Trace](/how-to/workflows/run-trace) maps requirements to tests and decides a release gate.
- [Evaluate](/tutorials/evaluate-your-first-skill) builds and runs a behavioral evaluation.

[Automate red mode](/how-to/workflows/run-automate#red-mode) keeps the ATDD command and `AT` menu code. [Framework CI setup](/how-to/workflows/setup-test-framework#ci-setup) keeps the CI command and `CI` menu code. Existing customizations and progress remain usable.

The agent menu's `GATE` intent routes you through test review, NFR evidence audit, and trace Phase 2.
It produces no artifact of its own.

Report problems through [GitHub Issues](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/issues).
