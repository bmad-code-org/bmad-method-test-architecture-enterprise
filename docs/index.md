---
title: Test Architect (TEA)
description: Risk-based test strategy, automation guidance, and release gate decisions for quality-driven development
template: splash
hero:
  title: Test Architect (TEA)
  tagline: Risk-based test strategy, automation guidance, and release gate decisions for quality-driven development
  actions:
    - text: Quick Start
      link: https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/tutorials/tea-lite-quickstart/
      icon: right-arrow
      variant: primary
    - text: View on GitHub
      link: https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise
      icon: external
---

## What is TEA?

TEA (Test Architect) is a standalone BMAD module that delivers expert test architecture guidance through 8 comprehensive workflows. It provides risk-based test strategy, automation planning, and measurable quality gates for software projects of any size.

## Why TEA?

- **Risk-Based Testing**: P0-P3 prioritization based on probability and impact
- **Consistent Outputs**: Knowledge-base driven guidance ensures standardized results
- **Measurable Quality**: Objective scoring (0-100) for test coverage and quality
- **Release Gates**: Go/No-Go decisions backed by requirements traceability
- **Framework Agnostic**: Works with Playwright, Cypress, and other test frameworks

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

## Getting Started

Choose your engagement model:

- **TEA Lite**: Start with [Test Automation](/how-to/workflows/run-automate) only (30 minutes)
- **Full TEA**: Complete [Quick Start Tutorial](https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/tutorials/tea-lite-quickstart/) (1-2 hours)
- **Enterprise**: Integrate all 8 workflows into your development process

## Quick Install

```bash
npx bmad-method install
# Select: Test Architect (TEA)
```

Then trigger workflows via chat:

```
tea              # Load TEA agent
test-design      # Run Test Design workflow
```

## Learn More

<div class="sl-flex">
  <a href="https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/tutorials/tea-lite-quickstart/" class="action primary">
    Quick Start Tutorial →
  </a>
  <a href="/explanation/tea-overview/" class="action secondary">
    How TEA Works →
  </a>
</div>

## Key Features

### 🎯 Risk-Based Testing

TEA evaluates test priorities using a probability × impact matrix, focusing effort where it matters most.

### 📚 Knowledge Base System

34 curated testing patterns loaded dynamically per workflow ensure consistent, high-quality outputs.

### ⚡ Subprocess Architecture

Parallel test generation for API and E2E tests speeds up workflow execution while maintaining quality.

### 📊 Measurable Quality

Objective 0-100 scoring across 5 quality dimensions: Determinism, Isolation, Maintainability, Coverage, Performance.

### 🚪 Release Gates

Requirements traceability with automated gap analysis provides clear Go/No-Go recommendations.

## Engagement Models

- **No TEA**: Continue with your existing testing approach
- **TEA Solo**: Use TEA standalone on non-BMAD projects
- **TEA Lite**: Fast onboarding with Test Automation workflow only
- **Integrated**: Full TEA integration with BMAD Method (Phases 3-4)
- **Enterprise**: Complete quality governance with all 8 workflows

## Documentation Structure

- **[Tutorials](https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/tutorials/tea-lite-quickstart/)**: Learn TEA step-by-step
- **[How-To Guides](/how-to/workflows/run-test-design)**: Task-focused instructions
- **[Explanation](/explanation/tea-overview)**: Understand concepts and architecture
- **[Reference](/reference/commands)**: Commands, configuration, knowledge base
- **[Glossary](/glossary)**: Terminology and definitions

## Support

- **Documentation**: [test-architect.bmad-method.org](https://test-architect.bmad-method.org)
- **Issues**: [GitHub Issues](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/issues)
- **Discussions**: [GitHub Discussions](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/discussions)

---

Ready to improve your test architecture? Start with the [Quick Start Tutorial](https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/tutorials/tea-lite-quickstart/).
