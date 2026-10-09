---
title: 'Execution Targets'
description: Which test technologies TEA supports, at what depth, and what you supply for the rest
---

# Execution Targets

TEA Core covers risk scoring, test design, NFR criteria, traceability, and gate decisions for any stack.
This page lists the test technologies TEA can scaffold, generate, and review.

See [Verification Architecture](/docs/explanation/verification-architecture.md) for why the two layers are separate.

## How to read the tiers

An execution target needs six things from TEA: detection, project layout, runner configuration, commands, CI wiring, and review criteria.
How many of the six are present determines the tier.

| Tier           | Detection | Project layout | Runner configuration | Commands | CI wiring | Review criteria |
| -------------- | --------- | -------------- | -------------------- | -------- | --------- | --------------- |
| **Full**       | Yes       | Yes            | Yes                  | Yes      | Yes       | Yes             |
| **Generation** | Yes       | Yes            | Yes                  | Yes      | Yes       | Partial         |
| **Evidence**   | n/a       | No             | No                   | No       | No        | No              |
| **Core only**  | No        | No             | No                   | No       | No        | No              |

Core-only targets use risk assessment, test design, NFR planning, traceability, and the release gate.
Execution support begins with the Generation tier.

## Full support

| Target                     | Frameworks                                               | Notes                                                                                                                                                   |
| -------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web browser E2E            | Playwright (default), Cypress                            | The deepest path. Fixture architecture, network-first patterns, selector resilience, burn-in, sharding, healing, and browser automation via CLI or MCP. |
| HTTP and service tests     | Typed API clients, OpenAPI-driven suites                 | Schema validation, retries, polling for eventual consistency, operation-level coverage.                                                                 |
| Consumer-driven contracts  | Pact (PactJS)                                            | Consumer and provider verification, message contracts for async and Kafka boundaries, broker and PactFlow integration, determinism configuration.       |
| Component tests            | Testing Library, Cypress component, Playwright component | Red-green-refactor loop, checks of observable interactions.                                                                                             |
| Webhook and async delivery | Provider-agnostic (WireMock, MockServer, Mockoon)        | Polling, template matching, timeout diagnostics.                                                                                                        |
| Mobile native              | Maestro (iOS, Android, React Native, Expo, Flutter)      | `mobile` stack detection, Maestro suite scaffolding, a dedicated generation worker, two-tier device CI, and mobile rows in the review ledger.           |

## Generation support

TEA detects the stack, scaffolds the framework, and generates tests.
It has no curated knowledge fragments for these frameworks, so generated tests follow the conventions named in the workflow step plus whatever conventions exist in your repository.
Review scoring is partial: most registry criteria are written against JavaScript and browser constructs.

| Language      | Frameworks                     | Scaffolds                                                                                                                          | Coverage of the six |
| ------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Python        | pytest (default), unittest     | Layout, `pyproject.toml`, `.python-version`, `pytest --cov`, CI commands                                                           | 5 of 6              |
| Java / Kotlin | JUnit 5 (default), TestNG      | Layout, `pom.xml`, `.java-version`, `mvn test` / `gradle test`, CI commands and caching                                            | 5 of 6              |
| Go            | `go test` (with testify)       | Layout, `go test -race ./...`, module caching                                                                                      | 5 of 6              |
| C# / .NET     | xUnit (default), NUnit, MSTest | Layout, `.csproj`, `global.json`, `dotnet test`, NuGet restore                                                                     | 5 of 6              |
| Ruby          | RSpec (default), Minitest      | Layout, `.rspec`, `.ruby-version`, `bundle exec rspec`, bundle caching                                                             | 5 of 6              |
| Rust          | `cargo test`                   | Directory layout only. Offered at framework selection but not carried into config generation, scripts, or CI. Treat as incomplete. | 2 of 6              |
| Node backend  | Jest, Vitest                   | Layout, config, commands, CI                                                                                                       | 5 of 6              |

Burn-in is enabled by default for frontend and fullstack stacks and skipped by default for backend-only stacks, on the assumption that backend suites are deterministic.
Override it if your backend suite touches shared state.

## Evidence support

TEA plans these, sets thresholds, requires the evidence, and audits what you produce.
You run the tools and supply their reports.

| Category             | Tools named                              | What TEA does                                                                                                                               |
| -------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Performance and load | k6 (worked examples), JMeter, Gatling    | Sets SLO and SLA thresholds during test design, requires results during the NFR evidence audit, scores the category PASS / CONCERNS / FAIL. |
| Security             | OWASP ZAP, Burp Suite, `npm audit`, Snyk | Same. Threshold definition and evidence audit; no scanner is invoked or parsed.                                                             |
| Reliability          | Your telemetry and chaos tooling         | Same.                                                                                                                                       |
| Maintainability      | CI coverage report, jscpd, `npm audit`   | Same. Reads coverage, duplication, and vulnerability reports your CI already produces; does not run them.                                   |

The NFR gate defaults to CONCERNS when a threshold or its evidence is undefined, so an unmeasured category does not silently pass.
Each category's status is declared in the audit's gate artifact, under `audited_domains`, so a pipeline reads it without parsing the report.

## Core only

TEA has no execution support for these.
Risk, design, NFR planning, traceability, and gating all apply.

| Target                                                 | Status                                                                                               |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Mobile native via Appium, XCUITest, Espresso, or Detox | No scaffolding and no review criteria. TEA scaffolds Maestro for mobile; configure these as `other`. |
| Desktop applications (Electron, WinAppDriver, Tauri)   | No support.                                                                                          |
| Embedded, firmware, hardware-in-the-loop               | No support.                                                                                          |
| Mainframe and legacy (COBOL, AS/400)                   | No support.                                                                                          |
| Data pipelines (dbt, Airflow, Great Expectations, ETL) | No pipeline scaffolding or review criteria. Contract patterns cover service calls.                   |

Mobile _web_ uses the web browser target with device emulation.
Playwright emulates browser size and device settings; native device coverage uses the Maestro target above.

## AI and agent evaluation

The `evaluate` workflow builds evaluations for skills, agents, workflows, tool-use systems, AI features, and test-review mechanisms.
The `tea-evaluate` runtime runs CLI, MCP, and HTTP targets through a declared registry, scores the evidence, compares baselines, and runs CI tiers.
This has its own evaluation contract and scoring policy.
See [Evaluate Your First Skill](/docs/tutorials/evaluate-your-first-skill.md) and the [tea-evaluate CLI reference](/docs/reference/tea-evaluate-cli.md).

## CI platforms

| Platform       | Template | Notes                                                           |
| -------------- | -------- | --------------------------------------------------------------- |
| GitHub Actions | Yes      | Default when detection is ambiguous.                            |
| GitLab CI      | Yes      |                                                                 |
| Jenkins        | Yes      |                                                                 |
| Azure DevOps   | Yes      | The only template with a machine-checkable backend conditional. |
| Harness        | Yes      |                                                                 |
| CircleCI       | No       | Generated from first principles.                                |

The shipped templates start from a Node and browser toolchain and are adapted to your stack during generation.
Review the generated install and test commands before merging, especially for a non-Node backend.

## Known gaps

- **Backend framework patterns:** pytest, JUnit, Go test, xUnit, and RSpec use conventions in the workflow steps and your repository.
  The knowledge base has no dedicated fragment for those runners.
- **Review criteria:** the 35-row registry includes four mobile-specific rows (`C7`, `H9`, `M8`, `L8`), two Playwright Utils rows (`M9`, `L9`), and one Pact.js Utils row (`M10`).
  The utility rows require the relevant flag and installed package.
  Some other rules apply across languages; others depend on browser, Testing Library, Vitest, or Pact constructs.
  Compare scores within the same stack and applicable criteria.
- **Rust is declared but incomplete.** See the generation table above.
- **CI templates are Node-first.** See the CI section above.

## Requesting a target

[Open an issue](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/issues) with the stack, runner, and test file format.
Review support needs criteria that can identify violations in that format.

To extend TEA yourself, see [Extend TEA with Custom Workflows](/docs/how-to/customization/extend-tea-with-custom-workflows.md) and [Knowledge Base System](/docs/explanation/knowledge-base-system.md).
