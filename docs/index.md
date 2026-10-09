---
title: Test Engineering Architect (TEA)
description: Test Engineering Architect (TEA) workflows for risk-based testing, automation, evaluation, and release gates
---

# Test Engineering Architect (TEA)

TEA is a BMad module for test strategy and automation.
Its ten workflows cover learning, test design, setup, automation, evaluation, review, and release decisions.
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
Each workflow also works directly in a fresh session.

## Choose a starting point

- [TEA Lite](/tutorials/tea-lite-quickstart) adds coverage to an existing project.
- [TEA Academy](/tutorials/learn-testing-tea-academy) teaches testing through seven sessions.
- [TEA Overview](/explanation/tea-overview) shows the workflow order and BMad lifecycle.
- [Evaluate Your First Skill](/tutorials/evaluate-your-first-skill) runs an evaluation from requirements to an accepted baseline.
- [Enterprise projects](/how-to/brownfield/use-tea-for-enterprise) and [existing test suites](/how-to/brownfield/use-tea-with-existing-tests) have their own guides.
- [Custom workflows](/how-to/customization/extend-tea-with-custom-workflows) explains how to extend the agent menu.

## Workflows

Use the command in chat.
On Codex, replace the leading `/` with `$`.
Menu codes work after loading `bmad-tea`.

See [Commands](/reference/commands) for every invocation and menu code.

- [Teach Me Testing](/how-to/workflows/teach-me-testing) teaches testing through seven sessions.
- [Test Design](/how-to/workflows/run-test-design) plans risks, coverage, and NFR evidence.
- [Framework Setup](/how-to/workflows/setup-test-framework) scaffolds a test framework.
- [CI Setup](/how-to/workflows/setup-ci) connects tests and quality checks to CI.
- [ATDD](/how-to/workflows/run-atdd) writes acceptance scaffolds before implementation.
- [Automate](/how-to/workflows/run-automate) adds coverage to implemented features.
- [Test Review](/how-to/workflows/run-test-review) audits test quality and scores findings.
- [NFR Evidence Audit](/how-to/workflows/run-nfr-assess) assesses performance, security, and reliability evidence.
- [Evaluate](/tutorials/evaluate-your-first-skill) builds and runs a behavioral evaluation.
- [Trace](/how-to/workflows/run-trace) maps requirements to tests and decides a release gate.

The agent menu's `GATE` intent routes you through test review, NFR evidence audit, and trace Phase 2.
It produces no artifact of its own.

Report problems through [GitHub Issues](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/issues).
