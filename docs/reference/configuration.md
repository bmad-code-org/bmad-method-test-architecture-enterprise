---
title: 'TEA Configuration Reference'
description: Complete reference for TEA configuration options and file locations
---

# TEA Configuration Reference

Every TEA (Test Engineering Architect) configuration key, its default, and the workflows it changes.

## Configuration File Locations

**Your project:** `_bmad/tea/config.yaml`. The BMad installer writes it from your answers. Edit it to change TEA behavior. Typically gitignored, since values are user-specific.

**The schema:** `src/module.yaml` in the [BMAD TEA repository](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise). It defines the available keys, their defaults, and the installer prompts. It does not ship into your project; reference it only when contributing to BMAD.

TEA reads `_bmad/tea/config.yaml` once at workflow start. After editing it, start a fresh chat before running a workflow.

## Recommended Configuration

```yaml
# _bmad/tea/config.yaml
project_name: my-project
output_folder: _bmad-output
tea_use_playwright_utils: true # production-ready fixtures and utilities
tea_use_pactjs_utils: true # pactjs-utils is the implementation whenever contract tests are written
tea_pact_mcp: 'mcp' # use a broker when one is reachable; skipped automatically when it is not
tea_browser_automation: 'auto' # smart CLI/MCP selection with fallback
tea_execution_mode: 'auto' # capability-aware orchestration
tea_capability_probe: true # fall back safely when a mode is unsupported
```

```bash
npm install -D @seontechnologies/playwright-utils
npm install -g @playwright/cli@latest  # needed for 'cli' and 'auto' browser modes
```

**Contract testing:** `tea_use_pactjs_utils` is on by default, and it decides _how_ Pact suites are written, not _whether_ a project gets one. TEA still requires a real consumer-provider boundary before scaffolding any contract test. Set it to `false` to have TEA write raw `@pact-foundation/pact` instead. `tea_pact_mcp` is likewise on by default and costs nothing without a broker: every broker-dependent step degrades to provider source or an OpenAPI spec and reports that the broker was unreachable.

---

## TEA Configuration Options

### test_artifacts

Base output folder for TEA-generated artifacts (test designs, reports, traceability).

**Type:** `string` · **Default:** `{output_folder}/test-artifacts`

Resolves to `{project-root}/{value}`, so it can live outside the core BMM output folder. Each workflow writes into its own folder under it, as described in [Output Layout](#output-layout).

```yaml
test_artifacts: docs/testing-artifacts
```

---

### tea_evaluations_folder

Base folder for Evaluate (`bmad-testarch-evaluate`) evaluation folders.

**Type:** `string` · **Default:** `evals`

Resolves to `{project-root}/{value}`, independent of `test_artifacts`.

```yaml
tea_evaluations_folder: evals
```

---

### tea_use_playwright_utils

Enable Playwright Utils integration for production-ready fixtures and utilities.

**Type:** `boolean` · **Default:** `true`

**Installer prompt:** `Enable Playwright Utils integration?`

**What `true` means.** Not "the library is available if you ask for it." It makes `@seontechnologies/playwright-utils` the default implementation for every capability it covers, in generation and in review, without the user naming a utility. The binding rule is the `playwright-utils-mandate` knowledge fragment: `interceptNetworkCall` instead of `page.route`, `apiRequest` instead of the raw `request` fixture, `recurse` instead of `page.waitForTimeout`, `log` instead of `console.log`, and `test` imported from the project's merged fixtures rather than from `@playwright/test`. A vanilla Playwright equivalent still ships when the utility genuinely does not cover the case, but it carries a `// playwright-utils deviation: <reason>` comment and appears in the workflow's output summary.

`auth-session`, `network-recorder`, the webhook module, and `burn-in` sit one level down as recommended rather than required, because they need project-side wiring. Workflows propose them and name the wiring; they never silently fall back to the vanilla equivalent without saying so.

**The flag alone does not activate it.** The mandate binds only when `tea_use_playwright_utils` is `true` **and** `@seontechnologies/playwright-utils` is in the project's `package.json`. With the flag on and the package absent, TEA generates the vanilla path, `test-review` produces no per-file findings, and you get one recommendation to run the `framework` workflow. `tea_use_pactjs_utils` works the same way against `@seontechnologies/pactjs-utils`.

The mandate applies only to JavaScript/TypeScript suites on the Playwright runner. Cypress, Maestro flows, Pact/Vitest contract suites, and backend suites in pytest, JUnit, Go test, xUnit, or RSpec are unaffected.

**Affects workflows** (each reads the key and branches on it):

- `atdd` loads the mandate, selects a playwright-utils fragment profile, and passes `use_playwright_utils` to generation workers. Red-phase scaffolds are generated in playwright-utils style, since the scaffold is the file the developer un-skips and keeps
- `automate` same fragment profile and worker flag, plus a `merged-fixtures.ts` entry point and an auth fixture built on `auth-session` during aggregation
- `test-design` loads the mandate so every code example in the design document matches what `automate` will generate
- `test-review` scores registry rows `M9` (a configured utility bypassed with no stated deviation, MEDIUM) and `L9` (a spec importing `test` from `@playwright/test` against a merged-fixtures convention, LOW). `M9` also requires the package to be a project dependency: the flag alone never produces a deduction
- `framework` installs the package, scaffolds `merged-fixtures.ts` and the auth fixture, and generates samples in the mandated style
- `ci` drives burn-in selection through `runBurnIn` instead of `--only-changed` when the stack is Playwright

The `trace` and `nfr-assess` workflows do not read this key.

```yaml
tea_use_playwright_utils: true # false generates from scratch instead
```

**Prerequisites:**

```bash
npm install -D @seontechnologies/playwright-utils
```

**Related:**

- [Integrate Playwright Utils Guide](/docs/how-to/customization/integrate-playwright-utils.md)
- [Playwright Utils on npm](https://www.npmjs.com/package/@seontechnologies/playwright-utils)

---

### tea_use_pactjs_utils

Enable Pact.js Utils integration for consumer-driven contract testing utilities.

**Type:** `boolean` · **Default:** `true`

**Installer prompt:** `Enable Pact.js Utils for consumer-driven contract testing?`

**What `true` means, and what it does not.** It makes `@seontechnologies/pactjs-utils` the default implementation for every Pact artifact TEA writes, the same way `tea_use_playwright_utils` does for Playwright. The binding rule is the `pactjs-utils-mandate` knowledge fragment: `createProviderState` instead of a hand-cast `.given()`, `buildVerifierOptions` instead of a literal `VerifierOptions` object, `createRequestFilter` instead of bespoke auth middleware, `setJsonContent` / `setJsonBody` instead of repeated PactV4 builder lambdas. Raw Pact still ships where the utilities do not reach, with a `// pactjs-utils deviation: <reason>` comment and an entry in the workflow's summary.

**It is not an instruction to add contract testing.** The mandate carries a relevance gate that TEA applies before scaffolding anything: an outbound call to a service this repo does not deploy with, an existing `pact/` directory or `@pact-foundation/pact` dependency, `PACT_BROKER_*` in the environment, a microservices layout, or the user asking. With none of those, TEA creates no Pact artifacts and says why. A dead contract suite failing CI for a boundary that does not exist is worse than no suite.

`zodToPactMatchers` and the `pact-consumer-di.md` injection sit one level down as recommended rather than required: one needs a Zod schema, the other a two-line production-code change. TEA proposes them and names what is missing rather than silently hand-rolling the alternative.

The determinism rules never relax under the mandate: one `addInteraction()` per `it()`, `fileParallelism: false` plus `pool: 'forks'` plus `singleFork: true` on the consumer config, the pool pair on the provider config, and provider scrutiny before any response matcher.

**Affects workflows:**

- `framework` installs the packages, then creates pact folders and mandated sample patterns — only when the relevance gate opens
- `atdd` loads the mandate and generates contract scaffolds in that style
- `automate` loads the mandate and passes pact config to subagents
- `test-design` loads the mandate so Pact code examples in design documents match what `automate` generates
- `test-review` scores registry row `M10` (a configured contract utility bypassed with no stated deviation, MEDIUM), gated on the flag plus the package being installed
- `ci` adds a contract-test stage and quality gates

**Use this when:** you want TEA to write Pact well. Set it to `false` only if you deliberately want raw `@pact-foundation/pact` output.

```yaml
tea_use_pactjs_utils: true # false generates raw Pact from scratch instead
```

**Prerequisites:**

```bash
npm install -D @seontechnologies/pactjs-utils @pact-foundation/pact
# peer dependency: @pact-foundation/pact >= 16.2.0
```

For the remote flow with a Pact Broker, set `PACT_BROKER_BASE_URL` and `PACT_BROKER_TOKEN`, plus `GITHUB_SHA` (GitHub Actions sets this) and `GITHUB_BRANCH` (you must set it explicitly: `${{ github.head_ref || github.ref_name }}`). The local monorepo flow needs no broker: the consumer generates pacts and the provider verifies them locally.

**Related:**

- [Integrate Pact.js Utils Guide](/docs/how-to/customization/integrate-pactjs-utils.md)
- [Pact.js Utils docs](https://seontechnologies.github.io/pactjs-utils/)
- [TEA Overview: Library Integrations](/docs/explanation/tea-overview.md#library-integrations)

---

### tea_pact_mcp

Pact MCP strategy for broker interaction during contract testing workflows.

**Type:** `string` · **Default:** `"mcp"` · **Options:** `"mcp"` | `"none"`

**Installer prompt:** `Enable SmartBear MCP for PactFlow/Pact Broker? Used when a broker is reachable; skipped automatically when it is not.`

Controls whether TEA can use SmartBear MCP tools for provider-state discovery, Pact test review assistance, and can-i-deploy/matrix guidance.

**Why the default is `"mcp"` and why that is safe without a broker.** Unlike the two library flags, this one gates a runtime capability rather than a project dependency, so its second gate is "are the MCP tools actually reachable in this session". Every broker-dependent step probes once and degrades per the `pact-mcp` fragment when they are not: it falls back to provider source or an OpenAPI spec, states in the output that the broker was unreachable, and continues. No workflow blocks on it, nothing retries in a loop, and inferred provider states are never presented as broker data. Real broker data beats a guess when it is there, and its absence costs a sentence in the report.

**Affects workflows:** `test-design`, `atdd`, `automate`, `framework`, `test-review`, `ci`.

**Set it to `none` when:** you want TEA never to attempt a broker call at all — an air-gapped environment, or a policy against outbound calls from the agent's session.

```yaml
tea_pact_mcp: 'mcp' # 'none' disables all broker/MCP integration
```

**Prerequisites:**

```bash
npm install -g @smartbear/mcp    # Node.js 20+ required
# or run on demand: npx -y @smartbear/mcp@latest
```

**Required broker env vars:**

- `PACT_BROKER_BASE_URL` (for example `https://{tenant}.pactflow.io`)
- `PACT_BROKER_TOKEN` (or username/password for basic auth)

**Related:**

- [Configure Browser Automation Guide](/docs/how-to/customization/configure-browser-automation.md)
- [SmartBear MCP docs](https://developer.smartbear.com/smartbear-mcp/docs/getting-started)

---

### tea_browser_automation

Browser automation strategy. Controls how TEA interacts with live browsers during test generation.

**Type:** `string` · **Default:** `"auto"` · **Options:** `"auto"` | `"cli"` | `"mcp"` | `"none"`

**Installer prompt:** `How should TEA interact with browsers during test generation?`

| Mode   | Behavior                                                                                 |
| ------ | ---------------------------------------------------------------------------------------- |
| `auto` | **Recommended.** CLI for stateless tasks, MCP for stateful flows. Falls back gracefully. |
| `cli`  | CLI only (`@playwright/cli`). MCP ignored.                                               |
| `mcp`  | MCP only. CLI ignored. Same as the old `tea_use_mcp_enhancements: true`.                 |
| `none` | No browser interaction. Pure AI generation from docs and code.                           |

**Affects workflows:**

- `test-design` exploratory mode (CLI snapshots for page discovery)
- `atdd` recording mode (CLI for selector verification, MCP for complex interactions)
- `automate` healing mode (MCP for debugging) plus recording mode (CLI for snapshots)
- `nfr-assess` browser-based evidence collection when the mode is `cli` or `auto`
- `test-review` evidence collection (CLI for traces and screenshots)

**Prerequisites:**

```bash
# CLI mode (and 'auto')
npm install -g @playwright/cli@latest
playwright-cli install --skills   # run from project root; Node.js 18+

# MCP mode (and 'auto') needs two servers configured in your IDE:
#   playwright        -> npx @playwright/mcp@latest
#   playwright-test   -> npx playwright run-test-mcp-server
```

```yaml
tea_browser_automation: 'auto' # 'cli' | 'mcp' | 'none'
```

**Migration from the old flag:**

| Old setting                       | New equivalent                   |
| --------------------------------- | -------------------------------- |
| `tea_use_mcp_enhancements: true`  | `tea_browser_automation: "auto"` |
| `tea_use_mcp_enhancements: false` | `tea_browser_automation: "none"` |

**Related:**

- [Configure Browser Automation Guide](/docs/how-to/customization/configure-browser-automation.md)
- [TEA Overview: Browser Automation](/docs/explanation/tea-overview.md#browser-automation-playwright-cli-mcp)

---

### tea_execution_mode

Execution strategy for orchestration-capable TEA workflows.

**Type:** `string` · **Default:** `"auto"` · **Options:** `"auto"` | `"subagent"` | `"agent-team"` | `"sequential"`

**Installer prompt:** `How should TEA orchestrate multi-step generation and evaluation?`

Applies to `automate`, `atdd`, `test-review`, `nfr-assess`, `framework`, `ci`, `test-design`, and `trace`. `teach-me-testing` does not use this setting.

| Mode         | Behavior                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------- |
| `auto`       | **Recommended.** Picks the best supported mode using runtime capability checks when probing. |
| `agent-team` | Prefer runtime team/delegation orchestration.                                                |
| `subagent`   | Prefer isolated subagent-style orchestration.                                                |
| `sequential` | Force one-by-one execution. Most deterministic, typically slowest.                           |

**Per-workflow effect:**

| Workflow      | Orchestrated unit                              | What the mode changes |
| ------------- | ---------------------------------------------- | --------------------- |
| `automate`    | API + E2E/backend generation workers           | Dispatch style only   |
| `atdd`        | failing API + failing E2E workers              | Dispatch style only   |
| `test-review` | quality-dimension workers                      | Dispatch style only   |
| `nfr-assess`  | domain assessment workers                      | Dispatch style only   |
| `framework`   | scaffold work units                            | Dispatch style only   |
| `ci`          | orchestration-capable pipeline generation step | Orchestration policy  |
| `test-design` | orchestration-capable output generation step   | Orchestration policy  |
| `trace`       | phase/work-unit separation with dependencies   | Orchestration policy  |

**Important:** in `agent-team` and `subagent` modes the runtime decides scheduling and concurrency; TEA enforces no separate parallel-worker cap. Output contracts stay the same across modes for a given workflow.

**Resolution order:**

1. Normalize an explicit run-level request when one is present: `agent team` / `agent teams` / `agentteam` become `agent-team`; `subagent` / `subagents` / `sub agent` / `sub agents` become `subagent`; `sequential` and `auto` pass through.
2. With no explicit override, use `tea_execution_mode` from `_bmad/tea/config.yaml`.
3. With `tea_capability_probe: true`, detect runtime support for `agent-team` and `subagent`.
4. Resolve: `auto` walks `agent-team` then `subagent` then `sequential`; an explicit `agent-team` or `subagent` falls back only when probing is enabled; `sequential` is always sequential.

```yaml
tea_execution_mode: 'auto' # 'sequential' forces deterministic single-threaded runs
```

---

### tea_capability_probe

Whether TEA probes runtime capabilities before resolving the execution mode.

**Type:** `boolean` · **Default:** `true`

When enabled, TEA checks whether `agent-team` or `subagent` execution is actually supported and falls back safely. When disabled, TEA honors the configured mode strictly and fails if it is unsupported.

```yaml
tea_capability_probe: true # false honors tea_execution_mode strictly
```

---

### test_stack_type

Detected or configured project stack type. Controls CI pipeline generation and framework selection.

**Type:** `string` · **Default:** `"auto"` · **Options:** `"auto"` | `"frontend"` | `"backend"` | `"fullstack"` | `"mobile"`

**Installer prompt:** `What type of project is this?`

| Stack type  | Behavior                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `auto`      | Auto-detect from project manifests (`playwright.config.*`, `jest.config.*`, `pyproject.toml`, `go.mod`, `pubspec.yaml`, and similar)  |
| `frontend`  | Browser-based tests (Playwright/Cypress), browser install in CI, burn-in enabled                                                      |
| `backend`   | API/unit tests (pytest, JUnit, Go test, Jest/Vitest), no browser install, burn-in skipped by default                                  |
| `fullstack` | Both frontend and backend tests, full CI pipeline                                                                                     |
| `mobile`    | Native app: Maestro device flows plus the app's unit/component suite, no browser install, burn-in enabled and scoped to changed flows |

Detection checks mobile first: a React Native or Expo project carries `package.json` with react and would otherwise misdetect as `frontend`.

**Affects workflows:**

- `ci` stack-conditional pipeline stages (browser install, burn-in, device/emulator legs)
- `framework` scaffold adapts to the stack type
- `automate` selects which generation workers launch (`mobile` runs the API worker plus the mobile worker)
- `test-design` scopes the planned test levels to the stack
- `atdd` picks stack-appropriate failing-test patterns
- `test-review` applies stack-appropriate review criteria

```yaml
test_stack_type: 'fullstack'
```

---

### ci_platform

CI/CD platform for pipeline generation.

**Type:** `string` · **Default:** `"auto"`

**Options:** `"auto"` | `"github-actions"` | `"gitlab-ci"` | `"jenkins"` | `"azure-devops"` | `"harness"` | `"circle-ci"` | `"other"`

**Installer prompt:** `Which CI/CD platform do you use?`

Controls which CI template the `ci` workflow uses and where it writes. With `"auto"`, TEA scans for `.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile`, `azure-pipelines.yml`, `.harness/`, and `.circleci/config.yml`, then falls back to inferring from the git remote. Installations predating this key default to `"auto"`.

**Affects workflows:** `ci` only.

```yaml
ci_platform: 'github-actions'
```

---

### test_framework

Detected or configured test framework preference.

**Type:** `string` · **Default:** `"auto"`

**Options:** `"auto"` | `"playwright"` | `"cypress"` | `"jest"` | `"vitest"` | `"pytest"` | `"junit"` | `"go-test"` | `"dotnet-test"` | `"rspec"` | `"maestro"` | `"other"`

**Installer prompt:** `Which test framework are you using?`

Controls which framework patterns TEA uses for code generation. With `"auto"`, TEA detects from project configuration files and manifests.

**Affects workflows:** `framework` (scaffold generation), `ci` (test commands in the pipeline), `atdd` and `automate` (test code generation patterns).

```yaml
test_framework: 'playwright'
```

---

## Core BMM Configuration (Inherited by TEA)

The installer copies these core values into `_bmad/tea/config.yaml`. Every TEA `workflow.yaml` reads `user_name`, `output_folder`, `test_artifacts`, `communication_language`, and `document_output_language` from that file at startup.

### output_folder

**Type:** `string` · **Default:** `_bmad-output`

Base output folder for core BMM artifacts. TEA writes its own artifacts under `test_artifacts`, which defaults to `{output_folder}/test-artifacts`.

```yaml
output_folder: _bmad-output
```

In a monorepo, give each package its own `_bmad/tea/config.yaml` with a relative `output_folder` so artifacts land in one place:

```yaml
# apps/api/_bmad/tea/config.yaml
project_name: api-service
output_folder: ../../_bmad-output/api
```

### user_name

**Type:** `string` · **Default:** set during installation

Your name. Every TEA `workflow.yaml` pulls it from `_bmad/tea/config.yaml`, and `teach-me-testing` uses it to name your progress and session-notes files.

```yaml
user_name: Jane Doe
```

### project_name

**Type:** `string` · **Default:** directory name

Used in report headers, documentation titles, CI configuration comments, and the `test-design` handoff filename `{test_artifacts}/test-design/{project_name}-handoff.md`.

```yaml
project_name: my-awesome-app
```

### communication_language

**Type:** `string` · **Default:** `english`

Language for TEA chat responses. Any language works.

```yaml
communication_language: english
```

### document_output_language

**Type:** `string` · **Default:** `english`

Language for TEA-generated documents (test designs, reports). It can differ from `communication_language`: chat in Spanish, generate docs in English.

```yaml
document_output_language: english
```

---

## Declared but Not Yet Wired

`src/module.yaml` declares one more key and marks it FUTURE. The installer prompts for it and writes it to `_bmad/tea/config.yaml`, but no workflow reads it yet. Setting it changes nothing today:

| Key              | Prompted default | Intended purpose                     |
| ---------------- | ---------------- | ------------------------------------ |
| `risk_threshold` | `p1`             | Risk level requiring mandatory tests |

Earlier releases also declared three FUTURE output-folder keys: `test_design_output`, `test_review_output`, and `trace_output`. No workflow ever read them, and they are removed. Every workflow now writes to a fixed folder of its own, described in [Output Layout](#output-layout).

Wiring the three keys was turned down for two reasons. First, the installer cannot carry them reliably. It fills `{test_artifacts}` inside a `result:` template from the raw install answer, so the key is saved as a relative path without `{project-root}`. Upstream BMAD's main branch has since dropped `result:` processing. Second, a configurable folder per workflow multiplies the places every workflow that reads another workflow's output has to search.

A `_bmad/tea/config.yaml` written by an earlier install can still carry the three keys. Nothing reads them, so they are safe to delete.

---

## Output Layout

Outputs land in one folder per workflow under `{test_artifacts}`, named after the workflow's skill without its `bmad-testarch-` prefix: `test-design/`, `atdd/`, `automate/`, `test-review/`, `nfr/`, `trace/`, `ci/`, and `framework/`. The folder names are fixed, and no configuration key moves them. `teach-me-testing` keeps its per-learner folders, and Evaluate writes under [`tea_evaluations_folder`](#tea_evaluations_folder).

Earlier releases wrote every output flat into the root of `{test_artifacts}` with fixed names. That layout was a placeholder carried over from the module migration. Per-workflow folders with scoped file names are the recommended layout at any project size, from one story to a monorepo with dozens of epics. Commit the outputs to version control to keep a history per scope: each scope's files change only when that scope is re-run.

A file produced once per scope carries that scope's `run_key` in its name, so a trace run for epic 16 never opens, rewrites, or appends to epic 15's matrix or gate decision. A file that exists once per project keeps a plain name: `test-design-architecture.md`, `test-design-qa.md`, `{project_name}-handoff.md`, `ci-pipeline-progress.md`, and `framework-setup-progress.md`.

### TEA Output Files

Paths are relative to `{test_artifacts}` unless noted. Deliverables are declared in the workflow's `workflow.yaml`; resume checkpoints are declared in the step files that write them.

| Workflow           | Output                                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------------------------- |
| `test-design`      | `test-design/test-design-architecture.md` and `test-design/test-design-qa.md` (system-level writes both)        |
| `test-design`      | `test-design/{project_name}-handoff.md` (system-level; feeds BMAD `create-epics-and-stories`)                   |
| `test-design`      | `test-design/test-design-epic-{epic_num}.md` (epic-level)                                                       |
| `test-design`      | `test-design/test-design-progress-{run_key}.md` (resume checkpoint; `run_key` is `system` or `epic-{epic_num}`) |
| `test-design`      | `test-design/exploration/explore-{run_key}-<page>.png` (browser exploration screenshots)                        |
| `framework`        | `{project-root}/tests/README.md`                                                                                |
| `framework`        | `framework/framework-setup-progress.md` (resume checkpoint)                                                     |
| `ci`               | `{project-root}/.github/workflows/test.yml` (GitHub Actions default; per-platform otherwise)                    |
| `ci`               | `ci/ci-pipeline-progress.md` (resume checkpoint)                                                                |
| `atdd`             | `atdd/atdd-checklist-{story_key}.md`                                                                            |
| `automate`         | `automate/automation-summary-{run_key}.md`                                                                      |
| `test-review`      | `test-review/test-review-{run_key}.md` (a non-empty `output_file_override` replaces this path for one run)      |
| `test-review`      | `test-review/review-evidence-{run_key}.png` (browser evidence screenshot)                                       |
| `nfr-assess`       | `nfr/nfr-assessment-{run_key}.md`                                                                               |
| `nfr-assess`       | `nfr/perf-{run_key}-<page>.png` (browser evidence screenshots)                                                  |
| `trace`            | `trace/traceability-matrix-{run_key}.md`                                                                        |
| `trace`            | `trace/e2e-trace-summary-{run_key}.json` (machine-readable summary for CI/CD and reporting)                     |
| `trace`            | `trace/gate-decision-{run_key}.json` (emitted only when the collection is gate-eligible)                        |
| `teach-me-testing` | `teaching-progress/{user_name}-tea-progress.yaml`                                                               |
| `teach-me-testing` | `tea-academy/{user_name}/session-{N}-notes.md`                                                                  |
| `teach-me-testing` | `tea-academy/{user_name}/tea-completion-summary.md`                                                             |

`trace` also reads two optional inputs it never writes, and both stay at the root of `{test_artifacts}` because other tools and people produce them: `live-verification-results.json` and `gate-waivers.md`. Any producer may write `live-verification-results.json` (an agent, a shell script, a CI job, or a person recording an outcome by hand). See [Live Verification Results](/docs/reference/live-verification-results.md) for the contract.

### Run Keys

Each workflow that runs once per scope resolves its `run_key` in its first step, before it writes anything, and records it as `runScope` and `runKey` in the output's frontmatter. Later steps carry both forward unchanged.

- `system`: the whole project or system, or no narrower scope could be resolved.
- `epic-{epic_num}`: one epic. An epic with no number uses the slug of its title.
- `story-{story_key}`: one story. `story_key` is the BMM story file basename without `.md` (for example `1-2-user-authentication`). Without a story file, it is the story id with `.` replaced by `-` (`1.2` becomes `1-2`).
- `release-{slug}` and `hotfix-{slug}`: `trace` only, from `gate_type` and the release version or hotfix id.
- `target-{slug}`: `automate` and `test-review` only, when no story or epic applies. The slug comes from the automated or reviewed path or feature name. A `test-review` run with `review_scope: suite` and no story or epic is `system`.

The slug rule applies to every `{slug}` and to an epic title with no number: lowercase; replace every run of characters outside `a-z` and `0-9` with a single `-`; trim leading and trailing `-`; truncate to 64 characters. For example, release `v1.2.0` becomes `release-v1-2-0`, and the review target `tests/e2e/checkout.spec.ts` becomes `target-tests-e2e-checkout-spec-ts`.

A workflow resolves the scope in this order:

1. The scope you name when you invoke it ("run trace for epic 16").
2. The scope the loaded artifacts carry: a story file name, an epic document's metadata, heading, or filename, or trace's `gate_type` and its id.
3. When several candidates remain, an interactive run lists them, asks which one this run covers, and waits. A headless or autonomous run never asks: it uses `system`, or `target-{slug}` where a target applies, and says so in its output. The one exception is a `test-design` epic plan, which has no system-level fallback: a headless epic-level run whose epic stays ambiguous halts with a message naming the candidate epics.

`atdd` runs once per story, so its checklist is named by `story_key` directly. `test-design` uses `system` or `epic-{epic_num}`.

### Re-running a Scope

A run reads and writes only its own `run_key`'s files. Files for other scopes are never opened.

When a file for the same `run_key` already exists:

- **No file:** a fresh run.
- **An earlier run of this scope was interrupted** (the file is marked in progress): an interactive run asks whether to resume or start over, and a headless or autonomous run starts over.
- **An earlier run of this scope finished:** the new run replaces the file entirely.

Two runs are never merged into one file. A file grows only while the run that created it is still adding its later sections. To keep an earlier result for the same scope, commit or copy it before you re-run. A `trace` run that evaluates no gate also removes an earlier `gate-decision-{run_key}.json` for the same `run_key`, so the folder never pairs a new summary with a stale decision.

`ci` and `framework` scaffold once per project, so each keeps one fixed checkpoint in its folder with no `run_key` in its name. The same three cases apply to that checkpoint, and a new run never merges into it.

### Files From Earlier TEA Versions

Earlier TEA versions wrote everything flat under `{test_artifacts}` with fixed names, such as `traceability-matrix.md`, `gate-decision.json`, `test-review.md`, `nfr-assessment.md`, and `automation-summary.md`. Upgrading leaves those files where they are:

- New runs never treat an old flat file as their own output, so they never rewrite it or append to it.
- Workflows that read another workflow's output look in the producing workflow's folder first, then at the old root location, and name both. For example, `nfr-assess` looks for test-design documents in `test-design/` and then at the root of `{test_artifacts}`, and `automate` looks for ATDD checklists in `atdd/` and then at the root.
- Resume migrates an old file only while it is still in progress. A completed flat file stays where it is.
  Resume first resolves the file's scope. `atdd` recovers the story from the checklist's `storyKey`, a `test-design` checkpoint that already carries a `runKey` (`test-design-progress-{run_key}.md` at the root) keeps it, and for any other old file Resume asks which scope it covers.
  It then writes the file into the workflow's folder under its scoped name with `runScope` and `runKey` added, deletes the old copy, and continues.
  It never writes over a scoped file that already exists for the same scope.
  `ci` and `framework` have no scope to resolve, so they move their root checkpoint into their folder under the same rules.

Once nothing you run still reads an old file, archive or delete it.

### Upgrading Scripts That Read Old Paths

CI jobs, dashboards, and scripts that read TEA's old flat paths need the new ones:

| Old path under `{test_artifacts}`                                    | New path under `{test_artifacts}`                                          |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `gate-decision.json`                                                 | `trace/gate-decision-{run_key}.json`                                       |
| `e2e-trace-summary.json`                                             | `trace/e2e-trace-summary-{run_key}.json`                                   |
| `traceability-matrix.md`                                             | `trace/traceability-matrix-{run_key}.md`                                   |
| `test-review.md`                                                     | `test-review/test-review-{run_key}.md`                                     |
| `nfr-assessment.md`                                                  | `nfr/nfr-assessment-{run_key}.md`                                          |
| `automation-summary.md`                                              | `automate/automation-summary-{run_key}.md`                                 |
| `atdd-checklist-{story_key}.md`                                      | `atdd/atdd-checklist-{story_key}.md`                                       |
| `test-design-architecture.md`, `test-design-qa.md`                   | `test-design/test-design-architecture.md`, `test-design/test-design-qa.md` |
| `test-design-epic-{epic_num}.md`                                     | `test-design/test-design-epic-{epic_num}.md`                               |
| `test-design-progress-{run_key}.md`                                  | `test-design/test-design-progress-{run_key}.md`                            |
| `test-design-progress.md`                                            | `test-design/test-design-progress-{run_key}.md` (after Resume migrates it) |
| `ci-pipeline-progress.md`                                            | `ci/ci-pipeline-progress.md`                                               |
| `framework-setup-progress.md`                                        | `framework/framework-setup-progress.md`                                    |
| `{workflow}-validation-report-{validation_scope}-{run_timestamp}.md` | the same name inside the workflow's folder                                 |

A job that gates one scope reads that scope's file, for example `trace/gate-decision-epic-16.json` or `trace/gate-decision-release-v1-2-0.json`. A job that wants the latest gate of any scope globs `trace/gate-decision-*.json` and picks the file with the newest `evaluated_at`. The `run_key` in each file name identifies the scope, and the `target` field inside gives the gate type and target id.

The `tea-test-review` CLI is unaffected: it passes its own `--output` path (default `test-review.md`, resolved under `--project-root`, which defaults to the working directory) as `output_file_override`, which replaces the workflow's default path.

### Rebinding `{test_artifacts}` From a Customization

Before this layout existed, some projects got per-workflow folders with an `activation_steps_append` rule in `_bmad/custom/bmad-testarch-*.toml` that rebinds `{test_artifacts}` to a subfolder before the first step runs. Remove that rule when you upgrade. Each workflow already appends its own folder, so a rebound `{test_artifacts}` nests a second level, such as `test-artifacts/traceability/trace/`.

The rule was fragile even before, because `{test_artifacts}` also locates files that are shared across workflows and live at its root. `trace` reads its optional inputs `live-verification-results.json` and `gate-waivers.md` from `{test_artifacts}`, and the workflows that read another workflow's output (`nfr-assess`, `automate`, and `trace` looking for test-design documents, `automate` looking for ATDD checklists, and `trace` looking for the NFR audit) resolve those paths through the same variable. A rebound value points each of those reads into a subfolder, where it finds nothing and the run proceeds as if the input never existed.

### Validation Report History

Validate mode preserves every report as a separate artifact. The eight artifact-producing workflows write `{workflow}-validation-report-{validation_scope}-{run_timestamp}.md` into their own folder under `{test_artifacts}`, next to the outputs they validate. The workflow identifier is `atdd`, `automate`, `ci`, `framework`, `nfr-assess`, `test-design`, `test-review`, or `trace`; `nfr-assess` reports land in `nfr/`.

`validation_scope` identifies what was checked, such as `story-1-2`, `epic-9`, `system`, or `pull-request-123`. `run_timestamp` is the UTC start time with milliseconds in `YYYYMMDDTHHmmssSSSZ` format. Each report also records the exact project-relative paths of its validated artifacts. Validate mode atomically reserves the resolved path with exclusive creation. A collision produces a fresh timestamp and retry, so two concurrent runs cannot claim the same report.

The `teach-me-testing` workflow validates its own workflow definition rather than a selected output scope. Its reports use `workflow-validation/teach-me-testing-validation-{run_timestamp}.md` under `{test_artifacts}` and follow the same no-overwrite rule.

---

## Environment Variables

TEA workflows use environment variables for test configuration, not for TEA settings themselves.

**Playwright:**

```bash
# .env
BASE_URL=https://todomvc.com/examples/react/dist/
API_BASE_URL=https://api.example.com
TEST_USER_EMAIL=test@example.com
TEST_USER_PASSWORD=password123
```

**Cypress:**

```bash
# cypress.env.json or .env
CYPRESS_BASE_URL=https://example.com
CYPRESS_API_URL=https://api.example.com
```

Split them per environment (`.env.development`, `.env.staging`, `.env.production`) and keep the production file pointed at read-only tests only. Add `.env` and `.env.local` to `.gitignore`.

**CI/CD:** set the same names as secrets in your CI platform.

```yaml
# .github/workflows/test.yml
env:
  BASE_URL: ${{ secrets.STAGING_URL }}
  API_KEY: ${{ secrets.API_KEY }}
  TEST_USER_EMAIL: ${{ secrets.TEST_USER }}
```

---

## Verify Your Configuration

```bash
# 1. Confirm the file exists and print the TEA keys you set
grep -E '^(tea_|test_|ci_platform|project_name|output_folder|user_name)' _bmad/tea/config.yaml

# 2. Confirm the YAML parses (prints the parsed object, or the syntax error)
npx --yes js-yaml _bmad/tea/config.yaml

# 3. Confirm playwright-utils is installed when tea_use_playwright_utils is true
npm ls @seontechnologies/playwright-utils
```

A key you set that does not appear in step 1 is misspelled. Compare it against the key list on this page: `_bmad/tea/config.yaml` holds your values, and the schema that names the valid keys lives in the BMAD repository, not in your project.

For anything that stays broken, see the [Troubleshooting guide](/docs/reference/troubleshooting.md).

---

## See Also

### How-To Guides

- [Set Up Test Framework](/docs/how-to/workflows/setup-test-framework.md)
- [Integrate Playwright Utils](/docs/how-to/customization/integrate-playwright-utils.md)
- [Configure Browser Automation](/docs/how-to/customization/configure-browser-automation.md)

### Reference

- [TEA Command Reference](/docs/reference/commands.md)
- [Knowledge Base Index](/docs/reference/knowledge-base.md)
- [Live Verification Results](/docs/reference/live-verification-results.md)
- [Troubleshooting](/docs/reference/troubleshooting.md)
- [Glossary](/docs/glossary/index.md)

### Explanation

- [TEA Overview](/docs/explanation/tea-overview.md)
- [Testing as Engineering](/docs/explanation/testing-as-engineering.md)
