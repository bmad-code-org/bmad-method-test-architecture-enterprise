# TEA setup answers and integrations

Each setup answer is `modules.tea.<key>` in `_bmad/config.toml`. `bmad setup tea` changes it.

## Detection

- `test_stack_type = "auto"` detects the project type from manifest files. Mobile: `.maestro/` or `maestro/` flows, `app.json` with expo or react-native, `Podfile`, `android/app/build.gradle`, `*.xcodeproj`, `pubspec.yaml`. Frontend: `package.json` with react, vue or angular, `playwright.config.*`, `vite.config.*`. Backend: `pyproject.toml`, `pom.xml`, `go.mod`, `*.csproj`, `Gemfile`, `Cargo.toml`. Full-stack: both frontend and backend indicators. Mobile is checked first, because a React Native project also has `package.json` with react.
- `test_framework = "auto"` detects the framework the same way.
- The CI platform is detected by `bmad-testarch-ci` from `.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile`, `azure-pipelines.yml`, `.harness/` or `.circleci/config.yml`. To fix one, set `ci_platform` in `_bmad/custom/bmad-testarch-ci.toml`.

## Execution mode

`tea_execution_mode = "auto"` picks agent-team, then subagent, then sequential, whichever the tool supports. `subagent` and `agent-team` prefer that mode and fall back when `tea_capability_probe` is true and the tool lacks it. `sequential` runs worker steps one by one, which helps when debugging.

## Playwright Utils (`tea_use_playwright_utils = "true"`)

`npm install -D @seontechnologies/playwright-utils`, with `@playwright/test` 1.54.1 or later; `ajv` 8+ or `zod` 3+ for schema validation. `bmad-testarch-framework` installs it. Once installed, TEA generates against these utilities by default and flags a hand-rolled equivalent that has no stated reason. Docs: <https://seontechnologies.github.io/playwright-utils/>

## Pact.js Utils (`tea_use_pactjs_utils = "true"`)

`npm install -D @seontechnologies/pactjs-utils @pact-foundation/pact` (Pact 16.2.0 or later). With a Pact Broker, set `PACT_BROKER_BASE_URL` and `PACT_BROKER_TOKEN` as environment variables or CI secrets, plus `GITHUB_SHA` (set by GitHub Actions) and `GITHUB_BRANCH` (`${{ github.head_ref || github.ref_name }}`). In a monorepo no broker is needed: the consumer generates pacts and the provider verifies them locally. Docs: <https://seontechnologies.github.io/pactjs-utils/>

## SmartBear MCP (`tea_pact_mcp = "mcp"`)

Requires Node.js 20+. For Claude Code: `claude mcp add-json -s user smartbear '{"type":"stdio","command":"npx","args":["-y","@smartbear/mcp@latest"],"env":{"PACT_BROKER_BASE_URL":"https://{tenant}.pactflow.io","PACT_BROKER_TOKEN":"<your-api-token>"}}'`. When no broker is reachable, TEA falls back to provider source or OpenAPI and says so. Docs: <https://developer.smartbear.com/smartbear-mcp/docs/getting-started>

## Browser automation (`tea_browser_automation`)

- `cli` or `auto`: `npm install -g @playwright/cli@latest`, then `playwright-cli install --skills` from the project root. Node.js 18+.
- `mcp` or `auto`: configure two MCP servers in the tool, `playwright` (`npx @playwright/mcp@latest`) and `playwright-test` (`npx playwright run-test-mcp-server`). See <https://github.com/microsoft/playwright-mcp>
