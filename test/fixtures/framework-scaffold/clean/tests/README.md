# Test Suite

Frontend Playwright + TypeScript suite, scaffolded with Playwright Utils fixtures.

## Setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and fill in `TEST_ENV`, `BASE_URL`, `API_URL`
3. Use the Node version pinned in `.nvmrc`

## Running Tests

- Local: `npm run test:e2e`
- Headed: `npx playwright test --headed`
- Debug: `npx playwright test --debug`

## Architecture

- `tests/support/merged-fixtures.ts` — the single entry point every test imports `test`/`expect` from; merges the API request, recurse, intercept-network-call, network-error-monitor, and project-owned auth fixtures via `mergeTests`.
- `tests/support/auth-fixture.ts` — the project's `AuthProvider`, registered with `setAuthProvider` and extended via `createAuthFixtures()`.
- `tests/e2e/` — sample and feature tests. Factories and helpers live alongside as the suite grows.

## Best Practices

- Select elements with `data-testid`, never CSS classes or text content.
- Declare `interceptNetworkCall` before `page.goto` and await it after, so the network-first principle is visible in the code.
- Use `apiRequest` for setup and teardown so UI tests are not the only path to test data.
- Keep tests isolated: no shared mutable state between tests, cleanup runs even on failure.

## CI Integration

CI runs `npm run test:e2e` with the HTML and JUnit reporters enabled; the JUnit XML at `test-results/results.xml` is what the pipeline uploads and parses for the PR check.

## Write-Time Enforcement

`.claude/hooks/tea-enforce.cjs` blocks a write that violates one of the Absolute rows in TEA's criteria registry (`.only`, a hard wait, a tautological assertion, and the like). Severity comes from the registry, never from the hook itself. To turn a rule off for this project, add its id to `disabledRules` in `.tea/enforce-config.json` and say why in the commit — a blocking rule the team cannot find the source of is a rule the team will delete.

## Knowledge Base References

- `playwright-config.md`, `fixtures-composition.md`, `auth-session.md`, `api-request.md`, `intercept-network-call.md` in the TEA knowledge base document the patterns used above.
