---
title: 'TEA Knowledge Base Index'
description: Complete index of TEA's 54 knowledge fragments for context engineering
---

# TEA Knowledge Base Index

TEA loads domain standards into context from 54 knowledge fragments, selected per workflow by the `tea-index.csv` manifest. Why that beats prompting, and how loading is wired: [Knowledge Base System](/docs/explanation/knowledge-base-system.md).

This page indexes every row of that manifest. Each entry is named by its manifest `id`, which differs from the file name for a few fragments; the link resolves to the file. The `Tier` column is the manifest's own `tier` value and decides when the fragment loads (see [Loading tiers](#loading-tiers)).

## Fragment Categories

### Architecture & Fixtures

Core patterns for test infrastructure and fixture composition.

| Fragment                                                                                                                                                                    | Tier     | Description                                                          | Key Topics                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------- | -------------------------------------- |
| [fixture-architecture](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/fixture-architecture.md) | core     | Pure function → Fixture → mergeTests composition with auto-cleanup   | Testability, composition, reusability  |
| [network-first](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/network-first.md)               | core     | Intercept-before-navigate workflow, HAR capture, deterministic waits | Flakiness prevention, network patterns |
| [playwright-config](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/playwright-config.md)       | extended | Environment switching, timeout standards, artifact outputs           | Configuration, environments, CI        |
| [fixtures-composition](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/fixtures-composition.md) | extended | mergeTests composition patterns for combining utilities              | Fixture merging, utility composition   |

**Used in:** `framework`, `test-design`, `atdd`, `automate`, `test-review`

---

### Data & Setup

Patterns for test data generation, authentication, and setup.

| Fragment                                                                                                                                                        | Tier        | Description                                                  | Key Topics                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------ | --------------------------------- |
| [data-factories](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/data-factories.md) | core        | Factory patterns with faker, overrides, API seeding, cleanup | Test data, factories, cleanup     |
| [auth-session](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/auth-session.md)     | core        | Token persistence, multi-user, API/browser authentication    | Auth patterns, session management |
| [email-auth](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/email-auth.md)         | specialized | Magic link extraction, state preservation, negative flows    | Authentication, email testing     |

**Used in:** `framework`, `atdd`, `automate`, `test-review`

---

### Network & Reliability

Network interception, error handling, and reliability patterns.

| Fragment                                                                                                                                                                        | Tier     | Description                                                    | Key Topics                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------- | ------------------------------- |
| [network-recorder](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/network-recorder.md)             | extended | HAR record/playback, CRUD detection for offline testing        | Offline testing, network replay |
| [intercept-network-call](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/intercept-network-call.md) | extended | Network spy/stub, JSON parsing for UI tests                    | Mocking, interception, stubbing |
| [error-handling](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/error-handling.md)                 | extended | Scoped exception handling, retry validation, telemetry logging | Error patterns, resilience      |
| [network-error-monitor](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/network-error-monitor.md)   | extended | HTTP 4xx/5xx detection for UI tests                            | Error detection, monitoring     |

**Used in:** `atdd`, `automate`, `test-review`

---

### Test Execution & CI

CI/CD patterns, burn-in testing, and selective test execution.

| Fragment                                                                                                                                                              | Tier     | Description                                        | Key Topics                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------- | ---------------------------- |
| [ci-burn-in](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/ci-burn-in.md)               | extended | Staged jobs, shard orchestration, burn-in loops    | CI/CD, flakiness detection   |
| [burn-in](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/burn-in.md)                     | extended | Smart test selection, git diff for CI optimization | Test selection, performance  |
| [selective-testing](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/selective-testing.md) | extended | Tag/grep usage, spec filters, diff-based runs      | Test filtering, optimization |

**Used in:** `ci`, `test-review`

---

### Quality & Standards

Test quality standards, test level selection, TDD patterns, and the generation-safety gate.

| Fragment                                                                                                                                                                      | Tier     | Description                                                                                                                | Key Topics                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| [test-quality](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/test-quality.md)                   | core     | Execution limits, isolation rules, green criteria                                                                          | DoD, best practices, anti-patterns   |
| [test-levels](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/test-levels-framework.md)           | core     | Guidelines for choosing unit, integration, or end-to-end coverage                                                          | Test pyramid, level selection        |
| [test-priorities](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/test-priorities-matrix.md)      | core     | P0–P3 criteria, coverage targets, execution ordering                                                                       | Prioritization, risk-based testing   |
| [test-healing-patterns](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/test-healing-patterns.md) | core     | Common failure patterns and automated fixes                                                                                | Debugging, healing, fixes            |
| [confidence-gate](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/confidence-gate.md)             | core     | 1-10 confidence score with a stop-and-ask rule below threshold, so the agent declares unknowns instead of fabricating them | Agent safety, generation, governance |
| [component-tdd](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/component-tdd.md)                 | extended | Red→green→refactor workflow, provider isolation                                                                            | TDD, component testing               |

**Used in:** `test-design`, `atdd`, `automate`, `test-review`, `trace`

`confidence-gate` covers selectors, endpoints, risk classification, fixtures, schemas, and data factories. Any generation step that cannot establish a value from the repo records it as an unknown rather than inventing it.

---

### Risk & Gates

Risk assessment, governance, and gate decision frameworks.

| Fragment                                                                                                                                                                                          | Tier     | Description                                                          | Key Topics                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------- | ------------------------------------- |
| [risk-governance](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/risk-governance.md)                                 | core     | Scoring matrix, category ownership, gate decision rules              | Risk assessment, governance           |
| [probability-impact](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/probability-impact.md)                           | core     | Probability × impact scale for scoring matrix                        | Risk scoring, impact analysis         |
| [nfr-criteria](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/nfr-criteria.md)                                       | extended | Security, performance, reliability, maintainability status           | NFRs, compliance, enterprise          |
| [adr-quality-readiness-checklist](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/adr-quality-readiness-checklist.md) | extended | 8-category, 29-criteria framework for testability and NFR compliance | Quality readiness, ADR, NFR checklist |

**Used in:** `test-design`, `nfr-assess`, `trace`

---

### Selectors & Timing

Selector resilience, race condition debugging, and visual debugging.

| Fragment                                                                                                                                                                  | Tier        | Description                                           | Key Topics                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------- | ---------------------------------- |
| [selector-resilience](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/selector-resilience.md) | core        | Robust selector strategies and debugging              | Selectors, locators, resilience    |
| [timing-debugging](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/timing-debugging.md)       | extended    | Race condition identification and deterministic fixes | Race conditions, timing issues     |
| [visual-debugging](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/visual-debugging.md)       | specialized | Trace viewer usage, artifact expectations             | Debugging, trace viewer, artifacts |

**Used in:** `atdd`, `automate`, `test-review`

---

### Feature Flags & API Patterns

Feature flag testing and pure API testing patterns.

| Fragment                                                                                                                                                                    | Tier        | Description                                             | Key Topics                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------- | ---------------------------- |
| [feature-flags](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/feature-flags.md)               | specialized | Enum management, targeting helpers, cleanup, checklists | Feature flags, toggles       |
| [api-testing-patterns](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/api-testing-patterns.md) | specialized | Pure API patterns without browser                       | API testing, backend testing |

**Used in:** `test-design`, `atdd`, `automate`

---

### Pact & Contract Testing Integration

Contract testing fundamentals plus Pact.js Utils, Pact MCP, and broker operations.

| Fragment                                                                                                                                                                                        | Tier        | Description                                                                                                                           | Key Topics                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| [contract-testing](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/contract-testing.md)                             | specialized | Raw Pact patterns, publishing, verification, resilience, PactV4 four-rule determinism and FFI safety block                            | Contract testing, Pact fundamentals            |
| [pactjs-utils-overview](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/pactjs-utils-overview.md)                   | specialized | Installation, flow decision tree, utility map                                                                                         | pactjs-utils, CDCT/BDCT, integration strategy  |
| [pactjs-utils-zod-to-pact](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/pactjs-utils-zod-to-pact.md)             | specialized | `zodToPactMatchers` for consumer-curated schemas, example precedence, Pact V3 matcher mapping, anti-patterns                          | pactjs-utils, zod, consumer schemas, matchers  |
| [pactjs-utils-consumer-helpers](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/pactjs-utils-consumer-helpers.md)   | specialized | Provider-state helpers: `createProviderState`, `toJsonMap`; request/response callback helpers: `setJsonBody`, `setJsonContent`        | pactjs-utils, consumer testing, provider state |
| [pactjs-utils-provider-verifier](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/pactjs-utils-provider-verifier.md) | specialized | `buildVerifierOptions`, `buildMessageVerifierOptions`, broker selectors, tagging                                                      | pactjs-utils, provider verification, CI        |
| [pactjs-utils-request-filter](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/pactjs-utils-request-filter.md)       | specialized | `createRequestFilter`, `noOpRequestFilter` auth/header patterns                                                                       | pactjs-utils, request filter, auth injection   |
| [pact-mcp](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/pact-mcp.md)                                             | specialized | SmartBear MCP tools for provider states, review, can-i-deploy, matrix                                                                 | pact-mcp, broker interaction, pactflow         |
| [pact-consumer-framework-setup](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/pact-consumer-framework-setup.md)   | specialized | Consumer CDC framework scaffolding: directory layout, scripts, CI workflow, and PactV4 test patterns                                  | pactjs-utils, consumer CDC, framework setup    |
| [pact-broker-webhooks](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/pact-broker-webhooks.md)                     | specialized | PactFlow → GitHub `repository_dispatch` auth via a dedicated machine user and classic PAT, staleness monitoring, PAT rotation runbook | pact broker, webhooks, CI operations, security |
| [pact-consumer-di](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/pact-consumer-di.md)                             | extended    | Dependency-injection pattern for Pact consumer tests using real client code                                                           | pact, consumer, DI, contract accuracy          |

**Used in:** `framework`, `test-design`, `atdd`, `automate`, `test-review`, `ci` (conditioned by `tea_use_pactjs_utils` and `tea_pact_mcp`)

An expired PAT on the PactFlow webhook is the most common non-code cause of `can-i-deploy` timing out with `There is no verified pact between ...`. `pact-broker-webhooks` carries the rotation runbook.

---

### Webhook Testing

Delivery-side testing for asynchronous, eventually-consistent webhook flows using the `@seontechnologies/playwright-utils` webhook module.

| Fragment                                                                                                                                                                            | Tier     | Description                                                                                                                                                                       | Key Topics                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| [webhook-fundamentals](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/webhook-testing-fundamentals.md) | core     | Why webhook delivery is hard: async arrival, parallel pollution, opaque timeouts, cleanup drift. Polling, typed matchers, rich errors, `startedAt` isolation                      | Async, event-driven, eventually consistent |
| [webhook-setup](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/webhook-module-setup.md)                | core     | Fixture wiring for WireMock/MockServer/Mockoon providers, matched-only vs full-reset cleanup, the `fullyParallel` race fix                                                        | Fixtures, providers, setup                 |
| [webhook-matchers](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/webhook-template-matchers.md)        | core     | `matchField` (dot-path exact), `matchPartial` (deep subset), `matchPredicate` (arbitrary fn), AND semantics, template factories, `clone`, `withTimeout`, `withInterval`           | Matchers, templates, patterns              |
| [webhook-waiting](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/webhook-waiting-querying.md)          | core     | `waitFor`, `waitForCount`, `getReceived`, the drain pattern for sequential events, parallel worker safety via ID-scoped templates                                                 | Polling, querying, parallel safety         |
| [webhook-risk](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/webhook-risk-guidance.md)                | core     | When webhook tests are required, the P2×I3 default risk score, the test checklist, failure patterns and mitigations                                                               | Risk assessment, governance, TA checklist  |
| [webhook-timeout-error](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/webhook-timeout-error.md)       | extended | `WebhookTimeoutError` fields (`templateName`, `timeoutMs`, `totalReceived`, `receivedWebhooks`, `matcherDetails`, `toJSON`) for inspecting what arrived against what was expected | Debugging, errors                          |
| [webhook-providers](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/webhook-providers.md)               | extended | WireMock (`deleteById` supported), MockServer (`deleteById` no-op), Mockoon (`deleteById` no-op, 100-entry limit), the custom `WebhookProvider` interface                         | Providers, capability differences          |

**Used in:** `framework`, `test-design`, `atdd`, `automate`, `test-review`, `ci`, `trace`

---

### Mobile Native

Maestro device flows and the level discipline that decides what becomes a flow at all. Loaded when `test_stack_type` is `mobile` or when the review set contains a Maestro flow (`.yaml`/`.yml` under `maestro/` or `.maestro/`, or `*.flow.yaml` or `*.flow.yml`).

| Fragment                                                                                                                                                                    | Tier        | Description                                                                                                     | Key Topics                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| [mobile-test-strategy](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/mobile-test-strategy.md) | specialized | Mobile test level framework, what belongs in a device flow, mobile risk categories, device matrix, CI shape     | Levels, risk, device matrix, permissions, lifecycle |
| [maestro-flows](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/maestro-flows.md)               | specialized | Flow structure, selector hierarchy, `clearState` isolation, synchronization without sleeps, subflow composition | Maestro, selectors, isolation, anti-patterns        |

**Used in:** `framework`, `automate`, `atdd`, `test-design`, `test-review`, `ci` (when `test_stack_type` is `mobile` or a Maestro flow is present)

The browser fragments (`network-first`, `playwright-config`, `intercept-network-call`, `selector-resilience`) are deliberately NOT loaded for a mobile stack: a device flow has no DOM and no request interceptor.

---

### Browser Automation

CLI and MCP integration for AI-driven browser automation during test generation.

| Fragment                                                                                                                                                        | Tier | Description                                                                                     | Key Topics                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------- | ----------------------------------------- |
| [playwright-cli](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/playwright-cli.md) | core | Token-efficient CLI for AI coding agents: element refs, sessions, snapshots, browser automation | CLI, browser, agent, automation, snapshot |

**Used in:** `atdd`, `automate`, `test-design`, `test-review`, `nfr-assess` (when `tea_browser_automation` is `cli` or `auto`)

---

### Playwright-Utils Integration

Patterns for the `@seontechnologies/playwright-utils` package (10 utility modules).

| Fragment                                                                                                                                                  | Tier     | Description                                                                    | Key Topics                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------ | ---------------------------------- |
| [overview](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/overview.md)       | core     | Installation, design principles, fixture-based utility patterns for API and UI | Overview, architecture, principles |
| [api-request](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/api-request.md) | core     | Typed HTTP client, schema validation, retry logic, operation-based overload    | API calls, HTTP, OpenAPI, codegen  |
| [recurse](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/recurse.md)         | extended | Async polling for API responses, background jobs, eventual consistency         | Polling, eventual consistency      |
| [log](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/log.md)                 | extended | Report logging and structured output for API and UI tests                      | Logging, debugging, reporting      |
| [file-utils](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/src/agents/bmad-tea/resources/knowledge/file-utils.md)   | extended | CSV/XLSX/PDF/ZIP validation for API exports and UI downloads                   | File validation, exports           |

The package's remaining fragments are indexed under the category that matches what they do: `auth-session` (Data & Setup); `network-recorder`, `intercept-network-call`, and `network-error-monitor` (Network & Reliability); `burn-in` (Test Execution & CI); `fixtures-composition` (Architecture & Fixtures, since `mergeTests` applies to all fixtures); and the seven `webhook-*` fragments (Webhook Testing).

**Used in:** `framework` (when `tea_use_playwright_utils: true`), `atdd`, `automate`, `test-review`, `ci`

**Official Docs:** <https://seontechnologies.github.io/playwright-utils/>

---

## Fragment Manifest (tea-index.csv)

**Location:** `src/agents/bmad-tea/resources/tea-index.csv`

**Fragment location:** `src/agents/bmad-tea/resources/knowledge/` (all 54 fragments in a single directory)

**Structure:**

```csv
id,name,description,tags,tier,fragment_file
test-quality,Test Quality Definition of Done,"Execution limits, isolation rules, green criteria","quality,definition-of-done,tests",core,knowledge/test-quality.md
risk-governance,Risk Governance,"Scoring matrix, category ownership, gate decision rules","risk,governance,gates",core,knowledge/risk-governance.md
```

**Columns:**

- `id` - Unique fragment identifier (kebab-case). This is the name workflows cite, and it is not always the file stem
- `name` - Human-readable fragment name
- `description` - What the fragment covers
- `tags` - Searchable tags (comma-separated)
- `tier` - Loading priority (see below)
- `fragment_file` - Path to the fragment markdown file, relative to `resources/`

### Loading tiers

Workflows do not carry per-workflow fragment lists. Each workflow step declares `knowledgeIndex: './resources/tea-index.csv'` and selects fragments at run time by tier, then narrows by stack and config:

- **Core:** loaded whenever the workflow starts.
- **Extended:** loaded when the workflow's context calls for it, such as `auth-session` once the tests involve authentication.
- **Specialized:** loaded only on a matching use case, such as `contract-testing` for microservices or `email-auth` for email flows.

Loading core fragments alone cuts context usage 40-50% against loading everything.

Four config keys narrow the set further: `tea_use_playwright_utils`, `tea_use_pactjs_utils`, `tea_pact_mcp`, and `tea_browser_automation`. `test_stack_type: mobile` swaps the browser fragments for the Maestro pair. See [TEA Configuration](/docs/reference/configuration.md).

---

## Related

- [Knowledge Base System](/docs/explanation/knowledge-base-system.md) - How context engineering works and why
- [TEA Overview](/docs/explanation/tea-overview.md) - How the knowledge base fits in TEA
- [TEA Command Reference](/docs/reference/commands.md) - Workflows that use fragments
