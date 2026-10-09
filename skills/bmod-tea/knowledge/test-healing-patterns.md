# Test Healing Patterns

## Principle

Run generated tests, diagnose the cause from runtime and source evidence, repair confirmed test defects, and execute again. Acceptance criteria and assertions define the behavior to preserve. Error text suggests a hypothesis; it cannot establish that a test is wrong.

The merged `bmad-testarch-automate` skill applies these patterns during Create in red and expand modes through `resources/run-and-heal.md`. Execution and healing default to enabled, with at most three repair rounds. Validate and Edit never heal. Expand seeks passing tests. Red verifies that the criterion executes and fails for the intended missing behavior, which remains unchanged.

## Diagnose Before Editing

For each failure, read the generated test, its criterion, fixture setup, relevant application source, and fresh runner output. Inspect DOM/network snapshots or traces when needed. Record the file:line, class, supporting evidence and proposed repair. A timeout can mean a stale locator, unfinished setup, unavailable environment or absent product behavior. A numeric mismatch can be a product defect. Preserve uncertain failures and report what must be investigated.

| Class               | Confirm the cause                                                                  | Repair boundary                                                                         |
| ------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Selector            | Intended element exists, generated locator misses it                               | Use its observed test ID, role/name or scoped locator                                   |
| Timing              | Correct effect finishes after an unawaited operation or missed event               | Await operation; register the observable wait before its trigger                        |
| Data                | Generated setup uses a stale/invalid value; authoritative factory has correct data | Fix setup input/identity and retain exact expected business values                      |
| Network             | Test URL, declared service or existing external double is configured incorrectly   | Repair test wiring; preserve the real SUT boundary                                      |
| Hard wait           | Sleep races a demonstrated state transition                                        | Replace sleep with the matching event/state wait                                        |
| Syntax/import/setup | Generated code cannot parse/load or initialize its fixture                         | Repair generated code using actual project imports and fixture conventions              |
| Product defect      | Valid setup reaches behavior that violates the criterion                           | Keep the failing assertion and report reproduction, expected/actual result and evidence |
| Intended red        | Assertion executes and fails for the criterion's unimplemented behavior            | Keep the scaffold unchanged and record the verified missing behavior                    |
| Unknown/environment | Required evidence, dependency, service or credential is unavailable                | Report could not measure or investigation needed; preserve test and source              |

## Selector Repairs

Use `selector-resilience.md`. Observe the same intended element in the live page or source first. Prefer its existing data-testid, then an accessible role/name, then scoped meaningful text. A class name does not establish a test ID. Adding production attributes belongs to product work outside the healing loop. An absent feature in red remains an intended missing-behavior failure.

```typescript
// Evidence: the checkout source and DOM expose this existing button.
// Original generated locator: page.locator('.submit-payment-old')
await page.getByRole('button', { name: 'Complete Payment', exact: true }).click();
await expect(page.getByTestId('receipt-status')).toHaveText('Paid');
```

Keep the action target and receipt expectation. Ambiguous or unobserved replacement locators require investigation.

## Timing and Hard-Wait Repairs

Use `timing-debugging.md` and `network-first.md`. Await promise-returning setup and actions. Register the wait before the trigger so a fast event cannot be missed. Observe the exact request or state transition under test. A genuine slow or broken product path remains a product issue. Preserve its timeout budget.

```typescript
// The trace shows the response completes before the old wait was registered.
const responsePromise = page.waitForResponse(
  (response) => response.url().endsWith('/api/orders') && response.request().method() === 'POST',
);
await page.getByRole('button', { name: 'Place Order' }).click();
const response = await responsePromise;
expect(response.status()).toBe(201);
await expect(page.getByTestId('order-status')).toHaveText('Confirmed');
```

When `tea_use_playwright_utils` is true, use the project's merged fixtures, `interceptNetworkCall` and `recurse` as required by `playwright-utils-mandate.md`. Register the helper before the triggering action and retain exact response assertions. Cypress uses a named intercept registered before navigation/action; backend suites await real operations through their own runner. Restore fake clocks in teardown when controlled time is relevant.

```typescript
// Replace a generated sleep with the observed terminal state.
await page.getByTestId('loading-spinner').waitFor({ state: 'detached' });
await expect(page.getByTestId('balance')).toHaveText('$42.00');
```

## Data Repairs

Use `data-factories.md`. Trace identity to the factory or setup response, isolate fixture data and clean it up. Fix generated setup without changing the business expectation. Do not replace an exact value with a regex, substring, any-value matcher or the actual product output simply because it failed. Format-only matchers are appropriate when the original acceptance criterion explicitly specifies only a format.

```typescript
// Evidence: createOrder returns the seeded order's ID; 'order-123' was invented.
const seededOrder = await createOrder({ totalCents: 4200 });
await page.goto(`/orders/${seededOrder.id}`);
await expect(page.getByTestId('order-total')).toHaveText('$42.00');
```

## Network Repairs

Read the configured base URL, service readiness, route method and actual response. Correct a generated typo or a missing declared test fixture. A 500 from a real application endpoint is evidence to investigate and reproduce. Keep the real endpoint and the expected status assertion intact.

An external double already specified by the scenario may have a wrong URL/method or may be registered after its request starts. Correct that wiring before the trigger within the declared boundary. Preserve response semantics. Never introduce an external double for the SUT endpoint under test or synthesize success to conceal a failure. Contract tests retain the real consumer and provider-source scrutiny, with `pactjs-utils-mandate.md` respected when enabled.

```typescript
// Evidence: the project config names '/api/orders'; the generated path was '/api/order'.
const response = await request.post('/api/orders', { data: { quantity: 1, sku: seededProduct.sku } });
expect(response.status()).toBe(201);
expect((await response.json()).totalCents).toBe(4200);
```

When `tea_use_playwright_utils` is true, use the project's `apiRequest` fixture for API calls. The raw runner example above applies when that flag is false.

## Syntax, Import and Setup Repairs

A parser error or unresolved import prevents the acceptance criterion from executing. Read the existing project exports, dependency declarations and fixture composition. Correct generated syntax, import paths, asynchronous fixture lifetime or setup order. Keep the scenario/assertion intact. Missing dependencies or unavailable credentials are environment blockers when they cannot be supplied within the run's authorized setup.

## Red Verification

Permanent Playwright acceptance scaffolds keep `test.skip('title', ...)`. Verify a disposable copy, preserving original files and every business assertion. Prefer the available `tea-atdd-red-check` for compatible browserless loopback projects: it uses a minimal worker environment, refuses worker child processes including browser launches, and supports `*.spec.ts` scaffolds. Derive its per-file process bound from the project's existing execution budgets; the default 15 seconds cannot replace a longer declared test budget. Its successful exit means the report exists.

For browser tests, required project environment/services, non-loopback endpoints, another runner/format or a skill-only install with no verifier, use the actual project-native runner on the disposable activated copy with the original configuration and environment. Activate only the generated leaf scaffold wrappers. Preserve other skips and all test bodies. Run files separately when a load error would mask sibling results; capture fresh per-file JSON, every project/attempt's actual status, full assertion messages and load/setup errors. Compare production/config content and permissions before and after execution. Record the fallback reason and runner/budget in the summary. Keep the evaluation CLI's isolation unchanged.

Map each result to the criterion's recorded failure signature and establish that the assertion executed. Skipped, empty, unmapped, timed-out and wrong-reason results cannot count as verified red. Repair wrong-reason syntax/import/locator/setup defects only until the expected missing-behavior failure is reached. Preserve that failure and keep production unchanged. A runner without usable per-test evidence reports could not measure.

## Bounded Loop and Report

1. Execute the generated scope and record fresh results.
2. Classify with evidence and identify confirmed test defects.
3. Persist the round count, apply scoped repairs and re-run.
4. Stop when expand passes, red is verified, only preserved/blocked failures remain, or three repair rounds are used.
5. Report commands, counts, healed file:line and change, criteria preserved, intended red failures, product defects and blockers.

Never introduce `test.fixme()`, additional skip calls, expected-failure annotations, weakened assertions, arbitrary sleeps, enlarged timeout budgets or catch-and-ignore logic during healing. Unresolved expand tests stay active. Red retains its existing scaffold convention. Resume retains the round count. Report remaining failures without claiming green.

## Healing Checklist

- [ ] Generated scope, assertions, acceptance criteria and production baseline saved
- [ ] Fresh execution evidence collected for every generated test
- [ ] Each proposed repair supported by runtime/source evidence
- [ ] Only generated tests and support files within this run repaired
- [ ] Playwright Utils and Pact.js Utils mandates preserved when applicable
- [ ] Correct red failures and real product defects left unchanged
- [ ] At most three repair rounds, including rounds before interruption
- [ ] Unresolved results reported with reproduction and next action

## Integration Points

- **Used in workflows**: `*automate` Create in red/expand modes; `*atdd` Create enters red mode through its existing command
- **Related fragments**: `selector-resilience.md`, `timing-debugging.md`, `network-first.md`, `data-factories.md`, `test-quality.md`
- **Tools**: project test runners, `tea-atdd-red-check`, runner traces and reports, optional browser evidence tools
