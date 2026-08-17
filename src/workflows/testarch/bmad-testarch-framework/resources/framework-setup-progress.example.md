---
stepsCompleted:
  [
    'step-01-preflight',
    'step-02-select-framework',
    'step-03-scaffold-framework',
    'step-04-docs-and-scripts',
    'step-05-validate-and-summary',
  ]
lastStep: 'step-05-validate-and-summary'
lastSaved: '2026-08-17'
---

# Framework Setup Progress: Meridian Retail Storefront

**Stack:** frontend (React 18 + Vite 5, TypeScript)
**Framework:** Playwright + `@seontechnologies/playwright-utils`
**Execution mode:** sequential
**Date:** 2026-08-17

This is an example illustration of a finished `framework` workflow run, not a real project.

---

## Step 1: Preflight Checks

### Stack Detection

`config.test_stack_type` was `auto`. Scanned the project root: `package.json` present with `react` `18.3.1` and `vite` `5.4.10`, no `pyproject.toml`/`pom.xml`/`go.mod`/other backend manifest, no mobile indicators. Result: detected stack is `frontend`.

### Prerequisites Validated

- `package.json` exists in the project root: confirmed
- No existing E2E framework: no `playwright.config.*`, `cypress.config.*`, or `cypress.json` found
- Write permissions to create directories and files: confirmed

### Project Context

- Project type: React SPA, bundler Vite
- No test framework previously installed
- `docs/platform/test-interfaces.md` documents the test-session endpoint and cookie contract used by the auth fixture
- The storefront's checkout flow calls an external payment gateway, but no provider source for it lives in this repo

---

## Step 2: Framework Selection

### Decision

Playwright, selected over Cypress.

### Rationale

The detected stack is `frontend`, so this is browser-based testing. The repo is a growing multi-team storefront with roughly forty routed views, needs Chromium and WebKit coverage on the checkout flow, and the team's PR gate budget depends on parallel workers. That combination (large repo, multi-browser need, heavy API plus UI integration, CI parallelism) favors Playwright over Cypress's simpler-setup and component-testing strengths. `config.test_framework` was `auto`, so no explicit override applied.

---

## Step 3: Scaffold Framework

Execution mode resolved to `sequential`: the requested mode was `auto` and this run's runtime reported no subagent or agent-team capability, so sections 1 through 5 ran in order rather than in parallel workers.

### Directory Structure

- `tests/e2e/`
- `tests/support/fixtures/`
- `tests/support/fixtures/factories/`
- `tests/support/helpers/`

`tests/support/page-objects/` was not created: the playwright-utils fixture and factory pattern below supersedes it for this project.

### Framework Configuration

Created `tests/playwright.config.ts` in TypeScript:

- Action timeout 15s, navigation timeout 30s, test timeout 60s
- `baseURL` from `BASE_URL` with a local fallback
- Trace `retain-on-failure-and-retries`, screenshot `only-on-failure`, video `retain-on-failure`
- Reporters: HTML, JUnit, console
- Parallel execution on, worker count reduced on CI

### Environment Setup

`.env.example` created with `TEST_ENV`, `BASE_URL` (defaulting to `http://localhost:5173`), and `API_URL` (defaulting to `https://api.meridianretail.example`). `.nvmrc` pinned to Node `24`.

### Fixtures & Factories

`config.tea_use_playwright_utils` was enabled. User confirmed installing `@seontechnologies/playwright-utils` as a dev dependency (peer `@playwright/test >= 1.54.1`), plus `zod` for the checkout response schema; `ajv` was skipped as not needed yet.

Loaded knowledge fragments: `playwright-utils-mandate.md`, `overview.md`, `fixtures-composition.md`, `auth-session.md`, `api-request.md`, `recurse.md`, `log.md`, `burn-in.md`, `network-error-monitor.md`, `data-factories.md`, `intercept-network-call.md`.

`tests/support/merged-fixtures.ts` created as the single entry point every test imports `test` from:

```typescript
import { mergeTests } from '@playwright/test';
import { log } from '@seontechnologies/playwright-utils';
import { test as apiRequestFixture } from '@seontechnologies/playwright-utils/api-request/fixtures';
import { test as recurseFixture } from '@seontechnologies/playwright-utils/recurse/fixtures';
import { test as interceptFixture } from '@seontechnologies/playwright-utils/intercept-network-call/fixtures';
import { test as networkErrorFixture } from '@seontechnologies/playwright-utils/network-error-monitor/fixtures';
import { test as authFixture } from './auth-fixture';

export const test = mergeTests(apiRequestFixture, recurseFixture, interceptFixture, networkErrorFixture, authFixture);

export { expect } from '@playwright/test';
export { log };
```

`tests/support/auth-fixture.ts` scaffolded from the custom `AuthProvider` pattern, implementing all six members (`getEnvironment`, `getUserIdentifier`, `extractToken`, `extractCookies`, `isTokenExpired`, `manageAuthToken`), passed to `setAuthProvider`, then `base.extend(createAuthFixtures())`. Architecture documentation identifies `POST /api/test/session` as the test-session endpoint and `meridian_session` as its cookie, so both are wired with no placeholder values. `authStorageInit()` and `configureAuthSession()` are wired into `tests/global-setup.ts`, and the token storage directory is added to `.gitignore`.

`tests/support/fixtures/factories/order-factory.ts` created: `@faker-js/faker`-based, tracks created orders, exposes `cleanup()`, integrates with the merged fixture index for auto-teardown.

### Sample Tests & Helpers

- `tests/e2e/checkout.spec.ts`: UI sample. Given/When/Then structure, `data-testid` selectors, declares `interceptNetworkCall({ url })` before `page.goto` and awaits it after, builds the cart with `OrderFactory`, takes `authToken` from the auth fixture rather than driving a login form.
- `tests/e2e/orders-api.spec.ts`: API sample. Uses `apiRequest` for setup and teardown, `recurse` to poll order status until it settles, `log.step` at each milestone.
- `tests/support/helpers/api-client.ts`: thin wrapper over the storefront's order and catalog endpoints.
- `tests/support/helpers/network.ts`: shared route-mocking helpers for the checkout and catalog network stubs.

### Contract Testing

`config.tea_use_pactjs_utils` is enabled by default, but the relevance gate in `pactjs-utils-mandate.md` did not open: the checkout flow calls a third-party payment gateway, and no provider source for that gateway exists in or is started by this repo. No Pact artifacts were created. This can be revisited with a future `framework` run if a boundary this repo owns (or starts) ever needs a consumer contract.

---

## Step 4: Documentation & Scripts

### tests/README.md

Created with:

- Setup instructions (copy `.env.example` to `.env`, `npm install`, browser install)
- Running tests: local, headed (`--headed`), debug (`--debug`)
- Architecture overview: `merged-fixtures.ts` as the single import point, `auth-fixture.ts`, `order-factory.ts`
- Best practices: `data-testid` selectors, network interception before navigation, no hard-coded waits
- CI integration notes: HTML and JUnit reporters, retries and worker count on CI
- Knowledge base references: `playwright-utils-mandate.md`, `fixtures-composition.md`, `data-factories.md`

### Build & Test Scripts

Added to `package.json`:

- `test:e2e`: `npx playwright test --config tests/playwright.config.ts`

### Write-Time Enforcement Hook

This project runs on Claude Code, which supports tool hooks, so the hook was installed.

- `.claude/hooks/tea-enforce.cjs` copied byte for byte from the workflow resource.
- `.tea/enforce-config.json` written for the detected surface only:

  ```json
  {
    "testGlobs": ["tests/e2e/**/*.spec.{ts,js}"],
    "pactConfigGlobs": [],
    "excludeGlobs": [],
    "disabledRules": [],
    "maxFileLines": 1000,
    "stopScanWindowSeconds": 900,
    "maxScannedFiles": 5000,
    "hookSha256": "f2ede9d399358d8810c660a29590f0c1683f7164bb3199038d26787f8324491c"
  }
  ```

  `pactConfigGlobs` stayed empty: no pact vitest config exists (see Contract Testing above). `excludeGlobs` stayed empty: no k6 scripts in this project.

- All three hooks (`--pre`, `--post`, `--stop`) registered under `hooks` in `.claude/settings.json`, merged into the file's existing content: the project already had an unrelated `permissions` block, which was preserved as-is.
- `tests/README.md` now documents that enforced rules come from the `Absolute`-severity rows of the `bmad-testarch-test-review` criteria registry (for example, the H1 hard-wait pattern and the H5 file-length ceiling), not from the hook itself, and that a rule can be turned off per project via `disabledRules` in `.tea/enforce-config.json` provided the reason is stated in the commit.

---

## Step 5: Validate & Summary

### Checklist Validation

Validated against `checklist.md`:

- Preflight: stack detected, manifest parsed, no framework conflict: pass
- Framework selection: Playwright chosen and justified: pass
- Directory structure: `tests/e2e/`, `tests/support/fixtures/`, `tests/support/fixtures/factories/`, `tests/support/helpers/` all present: pass
- Config correctness: timeouts, base URL fallback, artifact policy, reporters, and parallelism all match the required values: pass
- Fixtures and factories: merged fixture index, auth fixture, `OrderFactory` all present and wired: pass
- Docs and scripts: `tests/README.md`, `test:e2e` script, and the enforcement hook (script, config, and registered hooks) all present: pass
- Static execution check: `npm run test:e2e -- --list` discovered both sample tests with no configuration or import errors: pass
- Hook integrity check: the copied hook's sha256 matched `.tea/enforce-config.json`, and its `--stop` check exited successfully: pass

The target application was not running during scaffolding, so a full browser execution remains a documented post-workflow action. This does not conceal an auth placeholder or an import failure; the generated suite is complete and statically loadable.

### Completion Summary

- **Framework selected:** Playwright with `@seontechnologies/playwright-utils`
- **Artifacts created:** `tests/playwright.config.ts`, `tests/global-setup.ts`, `tests/support/merged-fixtures.ts`, `tests/support/auth-fixture.ts`, `tests/support/fixtures/factories/order-factory.ts`, `tests/e2e/checkout.spec.ts`, `tests/e2e/orders-api.spec.ts`, `tests/support/helpers/api-client.ts`, `tests/support/helpers/network.ts`, `tests/README.md`, `.env.example`, `.nvmrc`, `.claude/hooks/tea-enforce.cjs`, `.tea/enforce-config.json`, updated `.gitignore`, `.claude/settings.json`, and `package.json`
- **Next steps:** copy `.env.example` to `.env`, fill in real values, start the storefront and API, install the pinned Playwright browser, then run `npm run test:e2e` for live confirmation
- **Knowledge fragments applied:** `playwright-utils-mandate.md`, `overview.md`, `fixtures-composition.md`, `auth-session.md`, `api-request.md`, `recurse.md`, `log.md`, `burn-in.md`, `network-error-monitor.md`, `data-factories.md`, `intercept-network-call.md`

Recommended next workflows: `ci` to wire this into the pipeline, `test-design` to plan coverage beyond the sample suite, `atdd` once the next story is ready.
