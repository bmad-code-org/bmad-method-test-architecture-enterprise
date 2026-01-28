---
title: Test Architect (TEA)
description: Risk-based testing workflows, automation guidance, and release gates for BMad Method
template: splash
hero:
  title: Test Architect (TEA)
  tagline: Risk-based testing workflows, automation guidance, and release gates for BMad Method
  actions:
    - text: Tutorial
      link: https://bmad-code-org.github.io/tutorials/tea-lite-quickstart/
      icon: right-arrow
      variant: primary
    - text: View on GitHub
      link: https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise
      icon: external
---

## What is TEA?

TEA (Test Engineering Architect) is a BMAD module for testing strategy and automation. It provides eight workflows covering setup, design, automation, review, and release gates.

- **Workflow‑Driven**: Multiple workflows covering covering day to day activities of a test architect.
- **Consistent Outputs**: Knowledge-base guidance keeps standards consistent, no matter the agent being used.
- **Risk‑Based**: P0–P3 prioritization from probability × impact.
- **Release Gates**: Evidence‑backed go/no‑go decisions with traceability.

## Quick Install

```bash
npx bmad-method install
# Select: Test Architect (TEA)
```

Then trigger workflows via chat:

```
tea         # Load TEA agent
test-design # Run Test Design workflow
```

## Getting Started

Pick a path:

- **TEA Lite**: Start with [Test Automation](/how-to/workflows/run-automate) only (30 minutes)
- **Full TEA**: Start with the [TEA Overview](/explanation/tea-overview) for the complete workflow map
- **Enterprise**: Choose [Greenfield](/how-to/brownfield/use-tea-for-enterprise) or [Brownfield](/how-to/brownfield/use-tea-with-existing-tests)

## Core Workflows

| Workflow                                                  | Trigger | Purpose                                |
| --------------------------------------------------------- | ------- | -------------------------------------- |
| [Framework Setup](/how-to/workflows/setup-test-framework) | TF      | Scaffold test framework                |
| [CI/CD Integration](/how-to/workflows/setup-ci)           | CI      | Set up quality pipeline                |
| [Test Design](/how-to/workflows/run-test-design)          | TD      | Risk-based test planning               |
| [ATDD](/how-to/workflows/run-atdd)                        | AT      | Failing acceptance tests (TDD)         |
| [Test Automation](/how-to/workflows/run-automate)         | TA      | Expand automation coverage             |
| [Test Review](/how-to/workflows/run-test-review)          | RV      | Quality audit with scoring             |
| [Requirements Tracing](/how-to/workflows/run-trace)       | TR      | Coverage mapping + gate decision       |
| [NFR Assessment](/how-to/workflows/run-nfr-assess)        | NR      | Non-functional requirements evaluation |

## Documentation Structure

- **[Tutorial](https://bmad-code-org.github.io/tutorials/tea-lite-quickstart/)**: Learn TEA step-by-step
- **[How-To Guides](/how-to/workflows/run-test-design)**: Task-focused instructions
- **[Explanation](https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/explanation/testing-as-engineering/)**: Understand concepts and architecture
- **[Reference](/reference/commands)**: Commands, configuration, knowledge base
- **[Glossary](/glossary)**: Terminology and definitions

## Support

- **Issues**: [GitHub Issues](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/issues)
