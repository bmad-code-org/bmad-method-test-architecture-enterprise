---
title: 'AI-Generated Testing: Why Most Approaches Fail'
description: How Playwright-Utils, pactjs-utils, TEA workflows, Playwright CLI, and MCPs solve AI test quality problems
---

AI-generated tests frequently fail in production because they lack systematic quality standards. This document explains the problem and presents a solution combining utility standards, TEA workflows, and automation interfaces across both UI, API and contract testing.

:::note[Source]
This article is adapted from [The Testing Meta Most Teams Have Not Caught Up To Yet](https://dev.to/muratkeremozcan/the-testing-meta-most-teams-have-not-caught-up-to-yet-5765) by Murat K Ozcan.
:::

## The Problem with AI-Generated Tests

When teams use AI to generate tests without structure, they often produce what can be called "slop factory" outputs:

| Issue                | Description                                          |
| -------------------- | ---------------------------------------------------- |
| Redundant coverage   | Multiple tests covering the same functionality       |
| Incorrect assertions | Tests that pass but don't actually verify behavior   |
| Flaky tests          | Non-deterministic tests that randomly pass or fail   |
| Unreviewable diffs   | Generated code too verbose or inconsistent to review |

The core problem is that prompt-driven testing paths lean into nondeterminism, which is the exact opposite of what testing exists to protect.

:::caution[The Paradox]
AI excels at generating code quickly, but testing requires precision and consistency. Without guardrails, AI-generated tests amplify the chaos they're meant to prevent.
:::

## The Solution: A Three-Part Stack

The solution combines three components that work together to enforce quality:

### 1. Utilities: Playwright-Utils + Pact.js Utils

`@seontechnologies/playwright-utils` standardizes commonly reinvented testing primitives across UI, API, web, and non-web flows. `@seontechnologies/pactjs-utils` standardizes Pact.js contract-testing primitives for provider state setup, request filtering, and provider/message verifier configuration.

| Track              | Utility Layer                        | Purpose                                                  |
| ------------------ | ------------------------------------ | -------------------------------------------------------- |
| UI/API/Web/Non-web | `@seontechnologies/playwright-utils` | Reusable testing primitives and fixtures                 |
| Contract           | `@seontechnologies/pactjs-utils`     | Reusable Pact consumer/provider helpers and verification |

**Playwright-Utils examples:** `api-request`, `auth-session`, `intercept-network-call`, `recurse`, `log`, `network-recorder`, `burn-in`, `network-error-monitor`, `file-utils`.

**pactjs-utils examples:** `createProviderState`, `toJsonMap`, `setJsonBody`, `setJsonContent`, `createRequestFilter`, `noOpRequestFilter`, `buildVerifierOptions`, `buildMessageVerifierOptions`.

Together, these utility libraries eliminate the need to reinvent core testing primitives across UI, API, web, non-web, and contract testing.

### 2. Process: TEA (Test Architect Agent)

A quality operating model packaged as eight executable workflows spanning test design, CI/CD gates, and release readiness. TEA encodes test architecture expertise into repeatable processes.

| Workflow      | Purpose                                       |
| ------------- | --------------------------------------------- |
| `test-design` | Risk-based test planning per epic             |
| `framework`   | Scaffold production-ready test infrastructure |
| `ci`          | CI pipeline with selective testing            |
| `atdd`        | Acceptance test-driven development            |
| `automate`    | Prioritized test automation                   |
| `test-review` | Test quality audits (0-100 score)             |
| `nfr-assess`  | Non-functional requirements assessment        |
| `trace`       | Coverage traceability and gate decisions      |

:::tip[Key Insight]
TEA doesn't just generate tests—it provides a complete quality operating model with workflows for planning, execution, and release gates.
:::

### 3. Automation Interfaces: Playwright CLI + MCPs

Automation interfaces enable real-time verification during test generation and review across browser and contract tracks:

- **Playwright CLI**: token-efficient browser automation for stateless execution and fast checks in workflows.
- **Playwright MCP**: stateful browser automation with richer context for interactive exploration and DOM validation.
- **Pact MCP**: broker-aware contract automation for verification matrix queries, provider-state discovery, compatibility analysis, and `can-i-deploy` deployment decisions.

Instead of inferring behavior from documentation alone, these interfaces allow agents to:

- Run browser flows and confirm the DOM against the accessibility tree
- Validate UI/API network behavior in real-time
- Query Pact verification matrix results across consumer/provider versions
- Check provider states and contract compatibility before release
- Execute `can-i-deploy` checks against target environments

## How They Work Together

The three components form a quality pipeline:

| Stage        | Component                                  | Action                                                       |
| ------------ | ------------------------------------------ | ------------------------------------------------------------ |
| Standards    | Playwright-Utils + pactjs-utils            | Provides production-ready patterns for UI and contract tests |
| Process      | TEA Workflows                              | Enforces systematic test planning and review                 |
| Verification | Playwright CLI + Playwright MCP + Pact MCP | Validates tests and contracts against live systems           |

**Before (AI-only):** 20 tests with redundant coverage, incorrect assertions, and flaky behavior.

**After (Full Stack):** Risk-based selection, verified selectors, validated behavior, contract compatibility checks, reviewable code.

## Why This Matters

Traditional AI testing approaches fail because they:

- **Lack quality standards** — No consistent patterns or utilities
- **Skip planning** — Jump straight to test generation without risk assessment
- **Can't verify** — Generate tests without validating against actual behavior
- **Don't review** — No systematic audit of generated test quality

The three-part stack addresses each gap:

| Gap             | Solution                                                                 |
| --------------- | ------------------------------------------------------------------------ |
| No standards    | Playwright-Utils + pactjs-utils provide production-ready patterns        |
| No planning     | TEA `test-design` creates risk-based test plans                          |
| No verification | Playwright CLI + Playwright MCP + Pact MCP validate against live systems |
| No review       | TEA `test-review` audits quality with scoring                            |

This approach is sometimes called _context engineering_—loading domain-specific standards into AI context automatically rather than relying on prompts alone. TEA's `tea-index.csv` manifest loads relevant knowledge fragments so the AI doesn't relearn testing patterns each session.
