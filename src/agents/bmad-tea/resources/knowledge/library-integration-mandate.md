# Library Integration Mandate

## Principle

A TEA config flag that enables an integration library is an **instruction to write the suite that way**, not a note that the library exists. When the flag is `true` and the package is installed, that library is the default implementation for every capability it covers. The vanilla or hand-rolled equivalent becomes a documented deviation.

This fragment is the general contract. Each library has its own mandate fragment carrying the substitution table for that package. Load this one plus the per-library one; this fragment decides _how_ a mandate binds, the per-library one decides _what_ it swaps.

The failure this exists to prevent: a flag that only changes which fragments load, while the code templates the agent copies from stay vanilla. The user then has to name a utility by hand to get it, which makes the flag decorative.

## The Two Gates

A mandate binds only when **both** hold:

1. **The flag is `true`** in `{config_source}`.
2. **The package is a dependency** in the project's manifest (`package.json` for the Node libraries).

A flag with no install is an intention, not a capability. Generation must not scaffold imports against a package the project does not have, and review must not deduct per file for not using one. In that state: say so once, recommend the `framework` workflow, and generate the vanilla path.

## Enforcement Levels

Every substitution in a per-library mandate carries one of two levels.

| Level           | Meaning                                                                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **REQUIRED**    | Drop-in. Nothing beyond the import is needed. Emitting the vanilla equivalent instead is a defect, not a style preference.               |
| **RECOMMENDED** | Needs project-side wiring, or an input the project may not have. Propose it, scaffold the wiring when the workflow's scope covers setup. |

For a RECOMMENDED item, when the wiring is missing and the active workflow cannot create it: say in the output that the utility is the intended pattern, and name the wiring the project still needs. Never fall back silently. A run that quietly hand-rolled the thing and said nothing has hidden the one item the next person needs to fix.

## Deviation Protocol

A hand-rolled implementation is allowed when the library genuinely does not cover the case. When it happens:

1. Put a one-line comment above the code: `// <library> deviation: <reason>`
2. List it in the workflow's output summary under a `<Library> deviations` heading, with file, line, and reason.

An unexplained hand-rolled implementation is a finding. A stated one is a decision.

## Self-Check Before Emitting

Before writing any generated file, run the per-library mandate's self-check list against it. A surviving vanilla call is either fixed or converted into a stated deviation. Emitting it unresolved is the defect.

## Scope Discipline

Every mandate names the runner and language it binds, and names what it does not touch. A mandate that does not state its scope will be over-applied — into a Maestro flow that has no DOM, into a pytest suite that cannot import a Node package, into a Cypress spec with a different fixture model.

Scope is decided by **the runner the file executes under**, never by what the code under test is written in. A Node/TypeScript backend service tested through the Playwright runner is in Playwright Utils scope; the same service tested with Jest is not.

## Registry

| Config flag                | Mandate fragment              | Package                                            | Binds                                                        |
| -------------------------- | ----------------------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| `tea_use_playwright_utils` | `playwright-utils-mandate.md` | `@seontechnologies/playwright-utils`               | JS/TS suites on the Playwright test runner, browser and API  |
| `tea_use_pactjs_utils`     | `pactjs-utils-mandate.md`     | `@seontechnologies/pactjs-utils`                   | JS/TS Pact consumer and provider suites, HTTP and message    |
| `tea_pact_mcp`             | `pact-mcp.md`                 | `@smartbear/mcp` (an MCP server, not a dependency) | Broker-aware steps in test-design, automate, test-review, ci |

`tea_pact_mcp` is the odd one: an MCP server is a runtime capability rather than a project dependency, so its second gate is "the MCP tools are actually reachable in this session" rather than a manifest entry. When they are not, degrade to the documented non-broker path and say the broker was unreachable. Never block a workflow on it, and never invent broker data.

No other config flag carries a mandate. `tea_browser_automation`, `tea_execution_mode`, `tea_capability_probe`, `test_stack_type`, `ci_platform`, and `test_framework` select behavior, not an implementation library.

## Adding a New Library

When TEA takes on another integration library, these are the places it has to land. A library wired into fewer than all of them produces the decorative-flag failure again.

1. **Config flag** in `src/module.yaml`, with the default and a `post-install-notes` entry carrying the install command and any prerequisites.
2. **CLI defaults** in `cli/lib/resolve-tea-config.js` (`MODULE_DEFAULTS`), which the test suite asserts stays equal to `module.yaml`.
3. **Knowledge fragments**: the per-utility reference fragments, plus a `<library>-mandate.md` following the shape of the two that exist. Index every one of them in `tea-index.csv`, and copy them into every workflow's `resources/knowledge/`.
4. **A row in the registry table above.**
5. **Loading**: each consuming workflow's context step loads the mandate FIRST, before the per-utility fragments, and states that it binds the run.
6. **Generation**: every worker step that emits code in that library's scope carries the mandated template as the primary shape, the vanilla template as the flag-off branch, and the substitutions in its success and failure metrics.
7. **Aggregation**: whatever shared file the mandated style requires (a merged-fixtures module, a support directory) is created by the aggregation step, and the deviation roll-up reaches the summary.
8. **Review**: a `criteria-registry.md` row for "configured utility bypassed", gated on flag plus install, plus a published criterion row in `test-review-template.md`. Where partial migration is expected, a convention key in `step-02-discover-tests.md` and `cli/lib/convention-baseline.js` so adoption reads as a ratio rather than a pass or fail.
9. **Docs**: `docs/reference/configuration.md` (what `true` actually means), `docs/reference/knowledge-base.md` (the fragment rows and the used-in line), and a how-to under `docs/how-to/customization/`.
10. **Changelog** under `[Unreleased]`.
11. **Verify the copies.** `test/test-knowledge-base.js` asserts, per workflow, that the fragment set matches the agent's and that every shared file is byte-identical. Run `npm run test:knowledge` after copying. This step exists because it is the one that was missing: a mandate edited only at the agent level ships one rule to the reviewer and a different one to the generator, and the workflows load their own copy.

## Relationship to Principle Fragments

A mandate never overrides a principle; it chooses the mechanism that expresses it.

- `network-first.md` says intercept before you navigate. Under the Playwright Utils mandate the interception is `interceptNetworkCall`.
- `fixture-architecture.md` says pure function, then fixture, then compose once. Under the mandate the composition is `mergeTests`.
- `contract-testing.md` says the consumer's expectations must reflect what the provider actually returns. Under the Pact.js Utils mandate the matchers come from `zodToPactMatchers` or from provider-scrutinized values, not from hand-written helpers.

When a flag is `false`, its principle fragments govern mechanism as well.

## Related Fragments

- `playwright-utils-mandate.md`, `pactjs-utils-mandate.md` — the per-library instances
- `overview.md`, `pactjs-utils-overview.md` — installation and the utility inventories
- `pact-mcp.md` — the broker capability and its degradation path
- `confidence-gate.md` — stop and ask rather than invent an endpoint, selector, schema, or provider state
