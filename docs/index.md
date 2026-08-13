---
title: Welcome
description: Test Architect (TEA) - Risk-based testing workflows, automation guidance, and release gates for BMad Method
---

# Test Architect (TEA)

## What is TEA?

TEA (Test Engineering Architect) is a BMAD module for testing strategy and automation. It provides nine workflows covering learning, setup, design, automation, review, and release gates.

- **Workflow‑Driven**: Multiple workflows covering day-to-day activities of a test architect.
- **Consistent Outputs**: Knowledge-base guidance keeps standards consistent, no matter the agent being used.
- **Risk‑Based**: P0–P3 prioritization from probability × impact.
- **Release Gates**: Evidence‑backed go/no‑go decisions with traceability.
- **Two Layers**: Stack-neutral verification reasoning, plus swappable execution targets. See [Verification Architecture](/explanation/verification-architecture).

## What TEA Works On

Risk assessment, test design, NFR planning, traceability, and release gates apply to any stack. Execution depth varies: browsers, HTTP services, and contracts are covered end to end; Python, Java, Go, .NET, and Ruby backends get detection, scaffolding, and generation; performance and security are planned and audited rather than executed. [Execution Targets](/reference/execution-targets) publishes the full matrix, including the gaps.

## Quick Install

```bash
npx bmad-method install
# Select: Test Architect (TEA)
```

Then run a workflow. Each one has a command you can type in a fresh session:

- **Claude Code / Cursor / Windsurf:** `/bmad-testarch-test-design`
- **Codex:** `$bmad-testarch-test-design`
- **Agent menu:** load `/bmad-tea` (or `$bmad-tea`) first, then type the two-letter code `TD`

## Getting Started

The sidebar follows Diátaxis: tutorials teach, how-to guides solve one task, explanation covers concepts and architecture, reference is for lookup, and the glossary defines terms.

Pick a path:

- **New to Testing?** Start with [TEA Academy](/tutorials/learn-testing-tea-academy) - Learn testing from fundamentals to advanced practices (7 sessions, 1-2 weeks)
- **TEA Lite**: Start with [Getting Started with Test Architect](/tutorials/tea-lite-quickstart) (30 minutes)
- **Full TEA**: Start with the [TEA Overview](/explanation/tea-overview) for the complete workflow map
- **Enterprise**: Choose [Greenfield](/how-to/brownfield/use-tea-for-enterprise) or [Brownfield](/how-to/brownfield/use-tea-with-existing-tests)
- **Custom Extensions**: See [Extend TEA with Custom Workflows](/how-to/customization/extend-tea-with-custom-workflows)

## Core Workflows

The Command column works in a fresh session. The Menu code works only after `/bmad-tea` is loaded. On Codex, swap the leading `/` for `$`.

| Workflow                                                  | Command                      | Menu code | Purpose                               |
| --------------------------------------------------------- | ---------------------------- | --------- | ------------------------------------- |
| [Teach Me Testing](/how-to/workflows/teach-me-testing)    | `/bmad-teach-me-testing`     | `TMT`     | Learn testing (7 sessions, 1-2 weeks) |
| [Test Design](/how-to/workflows/run-test-design)          | `/bmad-testarch-test-design` | `TD`      | Risk-based planning + NFR planning    |
| [Framework Setup](/how-to/workflows/setup-test-framework) | `/bmad-testarch-framework`   | `TF`      | Scaffold test framework               |
| [CI/CD Integration](/how-to/workflows/setup-ci)           | `/bmad-testarch-ci`          | `CI`      | Set up quality pipeline               |
| [ATDD](/how-to/workflows/run-atdd)                        | `/bmad-testarch-atdd`        | `AT`      | Failing acceptance tests (TDD)        |
| [Test Automation](/how-to/workflows/run-automate)         | `/bmad-testarch-automate`    | `TA`      | Expand automation coverage            |
| [Test Review](/how-to/workflows/run-test-review)          | `/bmad-testarch-test-review` | `RV`      | Quality audit with scoring            |
| [NFR Evidence Audit](/how-to/workflows/run-nfr-assess)    | `/bmad-testarch-nfr`         | `NR`      | Non-functional evidence evaluation    |
| [Requirements Tracing](/how-to/workflows/run-trace)       | `/bmad-testarch-trace`       | `TR`      | Coverage mapping + gate decision      |

> **Agent menu shortcut:** The TEA agent menu also provides a `GATE` intent, typed in chat after loading `bmad-tea`. It has no command of its own because it is a routing helper rather than a workflow: it walks you through the release gate sequence (optional test-review → optional nfr-assess → trace Phase 2 gate decision) and produces no artifact.

## Support

- **Issues**: [GitHub Issues](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/issues)
