# Playwright Utils Mandate

## Principle

When `tea_use_playwright_utils` is `true`, `@seontechnologies/playwright-utils` is the **default implementation** for every capability it covers. Vanilla Playwright equivalents are a documented deviation, never a default. The flag is not a hint that the library exists; it is an instruction to write the suite in that style without being asked.

This fragment instantiates `library-integration-mandate.md`. Read that one for the two gates, the enforcement levels, and the deviation protocol; this one carries the substitutions. The per-utility fragments (`api-request.md`, `intercept-network-call.md`, `auth-session.md`, and the rest) are the reference for how each utility is called.

## Scope

**Applies when all of these hold:**

- `tea_use_playwright_utils` is `true` in `{config_source}`
- `@seontechnologies/playwright-utils` is a dependency in the project's `package.json`
- The suite runs on the Playwright test runner (`@playwright/test`)
- The language is JavaScript or TypeScript

**Does not apply to** — nothing in this fragment overrides these:

- Cypress suites
- Backend suites in pytest, JUnit, Go test, xUnit, or RSpec
- Maestro mobile flows (no DOM, no request interceptor)
- Pact consumer/provider suites running under Vitest (see `pactjs-utils-mandate.md`)

A Node.js/TypeScript backend service tested through the Playwright runner **is** in scope: seven of the ten utilities work without a browser.

## Enforcement Levels

| Level           | Meaning                                                                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **REQUIRED**    | Drop-in. Nothing beyond the import is needed. Emitting the vanilla equivalent instead is a defect, not a style preference.        |
| **RECOMMENDED** | Needs project-side wiring (auth provider, webhook provider, HAR directory, CI script). Propose it, and scaffold it when in scope. |

For a RECOMMENDED utility: generate the wiring when the active workflow's scope includes setup (`framework`, `ci`), otherwise state in the output that the utility is the intended pattern and name the wiring the project still needs. Do not silently fall back to the vanilla approach and say nothing.

Schema validation sits at RECOMMENDED for the same reason: it needs a schema to exist. Where the project already has one (a Zod model, an OpenAPI spec, a JSON Schema file), pass it to `apiRequest` rather than hand-writing the shape assertions. Where none exists, assert the fields the test is about **and say so in the output**: "no response schema found for `<endpoint>`; assertions cover the fields under test only". A silent fallback reads as a deliberate choice to assert less, and the reader cannot tell it from an oversight.

## Substitution Table

| Need                                                 | Vanilla Playwright — do not emit                                          | playwright-utils — emit this                                              | Level       | Fragment                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------- | --------------------------- |
| Observe or stub an HTTP call in a UI test            | `page.route()`, `page.waitForResponse()`, manual `JSON.parse`             | `interceptNetworkCall({ url, fulfillResponse? })`                         | REQUIRED    | `intercept-network-call.md` |
| HTTP call from a test (API or setup)                 | `request.get/post/put/delete`, `await response.json()`, hand-rolled retry | `apiRequest({ method, path, body?, headers? })`                           | REQUIRED    | `api-request.md`            |
| Response body validation                             | Hand-written field-by-field `expect` chains for shape                     | `apiRequest` schema validation (JSON Schema, Zod, OpenAPI)                | RECOMMENDED | `api-request.md`            |
| Wait for an async or eventually consistent condition | `page.waitForTimeout()`, `while` + `sleep`, bare `expect.poll`            | `recurse(fn, predicate, { timeout })`                                     | REQUIRED    | `recurse.md`                |
| Test-visible logging                                 | `console.log`                                                             | `log.info` / `log.step` / `log.success` / `log.warning` / `log.error`     | REQUIRED    | `log.md`                    |
| Combining fixtures                                   | Ad hoc `base.extend` chains per spec file                                 | `mergeTests` in one `support/merged-fixtures.ts`                          | REQUIRED    | `fixtures-composition.md`   |
| Reading a downloaded CSV/XLSX/PDF/ZIP                | `page.waitForEvent('download')` + `saveAs` + a parser per format          | `handleDownload()` plus `readCSV` / `readXLSX` / `readPDF` / `readZIP`    | REQUIRED    | `file-utils.md`             |
| Catching backend 4xx/5xx a green UI hides            | `page.on('response')` handlers written per spec                           | `network-error-monitor` fixture (auto-fails on 4xx/5xx)                   | REQUIRED    | `network-error-monitor.md`  |
| Authentication and token reuse                       | A login `setup` project writing `storageState`, re-login per run          | `setAuthProvider(provider)` + `createAuthFixtures()`, `authToken` fixture | RECOMMENDED | `auth-session.md`           |
| Offline UI runs / backend-free E2E                   | Hand-maintained fixture JSON per endpoint                                 | `networkRecorder.setup(context)` with HAR record/playback                 | RECOMMENDED | `network-recorder.md`       |
| Webhook / async event assertions                     | Custom polling of a mock server, ad hoc sleeps                            | `webhookTemplate` + `waitFor` / `waitForCount` / `getReceived`            | RECOMMENDED | `webhook-*.md`              |
| Running only tests affected by a diff                | `--only-changed`, hand-written CI grep filters                            | `runBurnIn({ configPath, baseBranch })`                                   | RECOMMENDED | `burn-in.md`                |

## Banned Patterns

When this mandate is active, these are defects in generated or reviewed code:

- `import { test } from '@playwright/test'` in a spec file. Specs import `test` from the project's merged fixtures, which re-export Playwright's `expect` alongside it. playwright-utils exports no `expect` of its own, so importing `expect` from `@playwright/test` directly is correct too and never a violation.
- `page.route(...)` or `page.waitForResponse(...)` used to spy on or stub an application API call.
- `request.get/post/put/patch/delete` on the raw `APIRequestContext` for application endpoints.
- `await response.json()` followed by manual status assertions, where `apiRequest` returns `{ status, body }` already parsed.
- `page.waitForTimeout(...)` as a synchronization mechanism.
- `console.log` for anything the test report should show.
- A bespoke login helper or a `storageState`-producing setup project, where the project already has an auth provider configured.

### Legitimate exceptions

These are not violations and need no deviation note:

- `page.route` used to **block or stub non-API traffic** — third-party scripts, analytics beacons, fonts, images.
- `page.waitForResponse` on a call the test does not own and cannot pattern-match by URL, where the response object itself is required.
- `page.waitForTimeout` inside a debugging aid that is not committed.
- Raw `request` inside the **auth provider implementation itself** — it runs before the fixtures exist.

## Relationship to the Traditional Fragments

`network-first.md` and `fixture-architecture.md` state principles that stay true under this mandate; only the mechanism changes.

- `network-first` — "intercept before you navigate" still holds. The interception is `interceptNetworkCall`, declared before `page.goto`, not `page.route`.
- `fixture-architecture` — "pure function core, fixture shell, compose once" still holds. The composition is `mergeTests` over the playwright-utils fixtures plus the project's own.

When `tea_use_playwright_utils` is `true`, load these two fragments for the principles and take every code shape from the playwright-utils fragments. When the flag is `false`, both fragments govern mechanism as well.

## Canonical Shapes

### Merged fixtures — one per project

There is exactly one, and it lives under the project's configured `test_dir`. A workflow that hardcodes a different directory creates a second entry point, which is the one outcome this file exists to prevent.

**The other fragments show `playwright/support/merged-fixtures.ts`.** That is the upstream playwright-utils repository's own layout in its examples, not a path to copy. `fixtures-composition.md`, `overview.md`, `network-error-monitor.md`, and `webhook-module-setup.md` all use it, and they are read for API shape rather than for where files go. In a TEA-scaffolded project the file is at `{test_dir}/support/merged-fixtures.ts`, and `{test_dir}` is whatever the project configured — `tests/`, `e2e/`, `playwright/`. Resolve it; do not assume it.

```typescript
// <test_dir>/support/merged-fixtures.ts  (playwright/, tests/, or e2e/ — whatever the project's test_dir is)
import { mergeTests } from '@playwright/test';
import { log } from '@seontechnologies/playwright-utils';
import { test as apiRequestFixture } from '@seontechnologies/playwright-utils/api-request/fixtures';
import { test as interceptFixture } from '@seontechnologies/playwright-utils/intercept-network-call/fixtures';
import { test as networkErrorFixture } from '@seontechnologies/playwright-utils/network-error-monitor/fixtures';
import { test as recurseFixture } from '@seontechnologies/playwright-utils/recurse/fixtures';
// Project-owned, built with setAuthProvider + createAuthFixtures
import { test as authFixture } from './auth-fixture';

export const test = mergeTests(apiRequestFixture, interceptFixture, networkErrorFixture, recurseFixture, authFixture);

export { expect } from '@playwright/test';
export { log };
```

### API test

```typescript
import { test, expect, log } from '../support/merged-fixtures';

test.describe('Users API', () => {
  test('[P0] returns the created user', async ({ apiRequest, authToken }) => {
    await log.step('Create user');

    const { status, body } = await apiRequest<User>({
      method: 'POST',
      path: '/api/users',
      body: userFactory(),
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(status).toBe(201);
    expect(body.email).toBe('...');
  });
});
```

### UI test

```typescript
import { test, expect } from '../support/merged-fixtures';

test('[P0] dashboard renders the user list', async ({ page, interceptNetworkCall }) => {
  const usersCall = interceptNetworkCall({ url: '**/api/users' });

  await page.goto('/dashboard');

  const { responseJson, status } = await usersCall;
  expect(status).toBe(200);

  await expect(page.getByRole('row')).toHaveCount(responseJson.length);
});
```

## Self-Check Before Emitting a Test File

Run this against every generated or edited spec. Any `yes` in the left column is a blocker.

1. Does the file import `test` from `@playwright/test` instead of the merged fixtures?
2. Does it call `page.route` or `page.waitForResponse` on an application API endpoint?
3. Does it call `request.<method>` on the raw request context for an application endpoint?
4. Does it contain `page.waitForTimeout`?
5. Does it contain `console.log`?
6. Does it parse a downloaded file by hand?
7. Does it re-authenticate inline instead of using the `authToken` fixture, with no note saying why?

Fix the file, or record a deviation. Do not emit it unresolved.

## Deviation Protocol

A vanilla implementation is allowed when the utility genuinely does not cover the case. When it happens:

1. Add a one-line comment above the code: `// playwright-utils deviation: <reason>`
2. List the deviation in the workflow's output summary under a `Playwright Utils deviations` heading, with file, line, and reason.

An unexplained vanilla implementation is a finding, not a deviation.

## Review Behavior

Under `test-review`, with the flag `true`, each of the Banned Patterns above is a **maintainability** finding on the file where it appears, with the substitution named in the recommendation. Report adoption as a ratio (files using merged fixtures over files sampled) rather than a pass/fail, so partial migration is visible instead of collapsing to a single red mark.

## Related Fragments

- `library-integration-mandate.md` — the general contract this instantiates
- `overview.md` — installation, design principles, the full utility table
- `api-request.md`, `intercept-network-call.md`, `auth-session.md`, `recurse.md`, `log.md`, `file-utils.md`, `network-recorder.md`, `network-error-monitor.md`, `burn-in.md`
- `fixtures-composition.md` — `mergeTests` patterns
- `network-first.md`, `fixture-architecture.md` — the principles this mandate keeps
- `confidence-gate.md` — stop and ask rather than invent an endpoint, selector, or schema
