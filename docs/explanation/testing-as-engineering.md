---
title: 'AI-Generated Testing: Why Most Approaches Fail'
description: Why prompt-driven test generation produces unreliable suites, and how standardized utilities, structured workflows, and deterministic interfaces fix it (worked through a JavaScript stack)
---

AI-generated tests need planning, execution, and review.
TEA supplies that process, with shared utilities and optional access to live systems.

:::note[Source]
This article is adapted from [The Testing Meta Most Teams Have Not Caught Up To Yet](https://dev.to/muratkeremozcan/the-testing-meta-most-teams-have-not-caught-up-to-yet-o5i) by Murat K Ozcan.
:::

## The Problem with AI-Generated Tests

Common failures include:

| Issue                | Description                                          |
| -------------------- | ---------------------------------------------------- |
| Redundant coverage   | Multiple tests covering the same functionality       |
| Incorrect assertions | Tests that pass but don't actually verify behavior   |
| Flaky tests          | Non-deterministic tests that randomly pass or fail   |
| Unreviewable diffs   | Generated code too verbose or inconsistent to review |

## The Solution: A Three-Part Stack

TEA combines shared utilities, testing workflows, and live verification tools.

### 1. Utilities: Playwright-Utils + Pact.js Utils

`@seontechnologies/playwright-utils` standardizes commonly reinvented testing primitives across UI, API, web, and non-web flows.
`@seontechnologies/pactjs-utils` standardizes Pact.js contract-testing primitives for provider state setup, request filtering, and provider/message verifier configuration.

| Track              | Utility Layer                        | Purpose                                                  |
| ------------------ | ------------------------------------ | -------------------------------------------------------- |
| UI/API/Web/Non-web | `@seontechnologies/playwright-utils` | Reusable testing primitives and fixtures                 |
| Contract           | `@seontechnologies/pactjs-utils`     | Reusable Pact consumer/provider helpers and verification |

**Playwright-Utils examples:** `api-request`, `auth-session`, `intercept-network-call`, `recurse`, `log`, `network-recorder`, `burn-in`, `network-error-monitor`, `file-utils`.

**pactjs-utils examples:** `createProviderState`, `toJsonMap`, `setJsonBody`, `setJsonContent`, `createRequestFilter`, `noOpRequestFilter`, `buildVerifierOptions`, `buildMessageVerifierOptions`.

### 2. Process: TEA (Test Architect)

Eight workflows cover learning, planning, test generation, evaluation, and release gates.

| Workflow                   | Purpose                                        |
| -------------------------- | ---------------------------------------------- |
| `teach-me-testing`         | Guided testing education                       |
| `test-design`              | Risk-based planning plus NFR planning          |
| `framework`                | Scaffold production-ready test infrastructure  |
| `ci`                       | CI pipeline with selective testing             |
| `evaluate`                 | Scored, evidence-backed evaluation of a target |
| `automate` red mode (ATDD) | Acceptance test-driven development             |
| `automate` expand mode     | Prioritized test automation                    |
| `test-review`              | Test quality audits (0-100 score)              |
| `nfr-assess`               | NFR Evidence Audit                             |
| `trace`                    | Coverage traceability and gate decisions       |

### 3. Automation Interfaces: Playwright CLI + MCPs

Automation interfaces enable real-time verification during test generation and review across browser and contract tracks:

- **Playwright CLI**: token-efficient browser automation for stateless execution and fast checks in workflows.
- **Playwright MCP**: stateful browser automation with richer context for interactive exploration and DOM validation.
- **Pact MCP**: broker-aware contract automation for verification matrix queries, provider-state discovery, compatibility analysis, and `can-i-deploy` deployment decisions.

These interfaces let agents:

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

## Why This Matters

Traditional AI testing approaches fail because they:

- Use inconsistent test patterns
- Generate tests before assessing risk
- Leave generated tests unexecuted
- Skip quality review

The workflow and tools address these gaps:

| Gap             | Solution                                                                 |
| --------------- | ------------------------------------------------------------------------ |
| No standards    | Playwright-Utils + pactjs-utils provide production-ready patterns        |
| No planning     | TEA `test-design` creates risk-based test plans                          |
| No verification | Playwright CLI + Playwright MCP + Pact MCP validate against live systems |
| No review       | TEA `test-review` audits quality with scoring                            |

This approach is sometimes called _context engineering_: loading domain standards into the model's context before it starts work.
TEA's `tea-index.csv` manifest loads relevant knowledge fragments so the AI doesn't relearn testing patterns each session.
See [Knowledge Base System](/docs/explanation/knowledge-base-system.md) for how the manifest selects fragments per workflow.

## Related

- [Knowledge Base System](/docs/explanation/knowledge-base-system.md): the manifest that loads the standards
- [Test Quality Standards](/docs/explanation/test-quality-standards.md): the Definition of Done those standards encode
- [Network-First Patterns](/docs/explanation/network-first-patterns.md): the determinism rule in detail
- [TEA Overview](/docs/explanation/tea-overview.md): the eight workflows in the lifecycle
- [Engagement Models](/docs/explanation/engagement-models.md): the five ways to adopt TEA
