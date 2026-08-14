---
title: 'Execution Targets'
description: Which test technologies TEA supports, at what depth, and what you supply for the rest
---

# Execution Targets

TEA Core (risk scoring, test design, NFR criteria, traceability, gate decisions) applies to every project regardless of stack. This page covers the other layer: which execution technologies TEA has built-in depth for, and where that depth stops.

See [Verification Architecture](/docs/explanation/verification-architecture.md) for why the two layers are separate.

## How to read the tiers

An execution target needs six things from TEA: detection, project layout, runner configuration, commands, CI wiring, and review criteria. How many of the six are present determines the tier.

| Tier           | Detection | Project layout | Runner configuration | Commands | CI wiring | Review criteria |
| -------------- | --------- | -------------- | -------------------- | -------- | --------- | --------------- |
| **Full**       | Yes       | Yes            | Yes                  | Yes      | Yes       | Yes             |
| **Generation** | Yes       | Yes            | Yes                  | Yes      | Yes       | Partial         |
| **Evidence**   | n/a       | No             | No                   | No       | No        | No              |
| **Core only**  | No        | No             | No                   | No       | No        | No              |

**Core only is not "unsupported."** Risk assessment, test design, NFR planning, traceability, and the release gate all work on a Core-only target. What you do not get is scaffolding, generated tests, or a quality score.

## Full support

| Target                     | Frameworks                                               | Notes                                                                                                                                                   |
| -------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web browser E2E            | Playwright (default), Cypress                            | The deepest path. Fixture architecture, network-first patterns, selector resilience, burn-in, sharding, healing, and browser automation via CLI or MCP. |
| HTTP and service tests     | Typed API clients, OpenAPI-driven suites                 | Schema validation, retries, polling for eventual consistency, operation-level coverage.                                                                 |
| Consumer-driven contracts  | Pact (PactJS)                                            | Consumer and provider verification, message contracts for async and Kafka boundaries, broker and PactFlow integration, determinism configuration.       |
| Component tests            | Testing Library, Cypress component, Playwright component | Red-green-refactor loop, interaction-over-implementation criteria.                                                                                      |
| Webhook and async delivery | Provider-agnostic (WireMock, MockServer, Mockoon)        | Polling, template matching, timeout diagnostics.                                                                                                        |
| Mobile native              | Maestro (iOS, Android, React Native, Expo, Flutter)      | `mobile` stack detection, Maestro suite scaffolding, a dedicated generation worker, two-tier device CI, and mobile rows in the review ledger.           |

## Generation support

TEA detects the stack, scaffolds the framework, and generates tests. It has no curated knowledge fragments for these frameworks, so generated tests follow the conventions named in the workflow step plus whatever conventions exist in your repository. Review scoring is partial: most registry criteria are written against JavaScript and browser constructs.

| Language      | Frameworks                     | Scaffolds                                                                                                                          | Coverage of the six |
| ------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Python        | pytest (default), unittest     | Layout, `pyproject.toml`, `.python-version`, `pytest --cov`, CI commands                                                           | 5 of 6              |
| Java / Kotlin | JUnit 5 (default), TestNG      | Layout, `pom.xml`, `.java-version`, `mvn test` / `gradle test`, CI commands and caching                                            | 5 of 6              |
| Go            | `go test` (with testify)       | Layout, `go test -race ./...`, module caching                                                                                      | 5 of 6              |
| C# / .NET     | xUnit (default), NUnit, MSTest | Layout, `.csproj`, `global.json`, `dotnet test`, NuGet restore                                                                     | 5 of 6              |
| Ruby          | RSpec (default), Minitest      | Layout, `.rspec`, `.ruby-version`, `bundle exec rspec`, bundle caching                                                             | 5 of 6              |
| Rust          | `cargo test`                   | Directory layout only. Offered at framework selection but not carried into config generation, scripts, or CI. Treat as incomplete. | 2 of 6              |
| Node backend  | Jest, Vitest                   | Layout, config, commands, CI                                                                                                       | 5 of 6              |

Burn-in is enabled by default for frontend and fullstack stacks and skipped by default for backend-only stacks, on the assumption that backend suites are deterministic. Override it if your backend suite touches shared state.

## Evidence support

TEA plans these, sets thresholds, requires the evidence, and audits what you produce. It does not run the tools or parse their output.

| Category                    | Tools named                              | What TEA does                                                                                                                               |
| --------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Performance and load        | k6 (worked examples), JMeter, Gatling    | Sets SLO and SLA thresholds during test design, requires results during the NFR evidence audit, scores the category PASS / CONCERNS / FAIL. |
| Security                    | OWASP ZAP, Burp Suite, `npm audit`, Snyk | Same. Threshold definition and evidence audit; no scanner is invoked or parsed.                                                             |
| Reliability and scalability | Your telemetry and chaos tooling         | Same.                                                                                                                                       |

The NFR gate defaults to CONCERNS when a threshold or its evidence is undefined, so an unmeasured category does not silently pass.

## Core only

TEA has no execution support for these. Risk, design, NFR planning, traceability, and gating all apply.

| Target                                                 | Status                                                                                               |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Mobile native via Appium, XCUITest, Espresso, or Detox | No scaffolding and no review criteria. TEA scaffolds Maestro for mobile; configure these as `other`. |
| Desktop applications (Electron, WinAppDriver, Tauri)   | No support.                                                                                          |
| Embedded, firmware, hardware-in-the-loop               | No support.                                                                                          |
| Mainframe and legacy (COBOL, AS/400)                   | No support.                                                                                          |
| Data pipelines (dbt, Airflow, Great Expectations, ETL) | No support. Contract testing covers the service boundary, not the pipeline.                          |
| LLM and agent evaluation                               | No support as a test target.                                                                         |

Mobile _web_ is covered by the web browser target through device emulation. That runs a resized desktop browser engine, not a device, and should not be reported as native mobile coverage; native apps use the Maestro target above.

## CI platforms

| Platform       | Template | Notes                                                           |
| -------------- | -------- | --------------------------------------------------------------- |
| GitHub Actions | Yes      | Default when detection is ambiguous.                            |
| GitLab CI      | Yes      |                                                                 |
| Jenkins        | Yes      |                                                                 |
| Azure DevOps   | Yes      | The only template with a machine-checkable backend conditional. |
| Harness        | Yes      |                                                                 |
| CircleCI       | No       | Generated from first principles.                                |

All shipped templates are written around a Node and browser toolchain and are adapted to your stack during generation. On a non-Node backend, review the generated pipeline's install and test commands before merging rather than assuming they are correct.

## Known gaps

Published deliberately, so an evaluation does not have to discover them:

- **No knowledge fragments exist for any backend test framework.** 38 of 56 fragments name Playwright or Cypress and 3 cover mobile; zero cover pytest, JUnit, Go test, xUnit, or RSpec. Generation for those stacks relies on inline workflow conventions rather than a curated pattern library.
- **Review criteria are still mostly JavaScript-shaped.** The registry carries 32 rows: 7 are portable across languages, 4 are mobile-specific, and the rest key on browser, Testing Library, Vitest, or Pact constructs. Scores on non-JavaScript, non-Maestro suites are directionally useful and not comparable to scores on a JavaScript suite.
- **Rust is declared but incomplete.** See the generation table above.
- **CI templates are Node-first.** See the CI section above.

## Requesting a target

Open an issue at [GitHub Issues](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/issues) describing the stack, the runner, and the file format its tests are written in. The last item matters most: a target becomes reviewable once the criteria registry has rows that can attach to its format.

To extend TEA yourself, see [Extend TEA with Custom Workflows](/docs/how-to/customization/extend-tea-with-custom-workflows.md) and [Knowledge Base System](/docs/explanation/knowledge-base-system.md).
