# Pact.js Utils Provider Verifier

## Principle

Use `buildVerifierOptions`, `buildMessageVerifierOptions`, `handlePactBrokerUrlAndSelectors`, `getProviderVersionTags`, and `isBreakingChangeTolerantBranch` from `@seontechnologies/pactjs-utils` to assemble provider verification and classify coordinated breaking-change branches. These utilities handle local/remote flow detection, broker URL resolution, consumer version selector strategy, named consumer branches, and CI-aware version tagging. The caller controls breaking change behavior via the required `includeMainAndDeployed` parameter.

## Rationale

### Problems with manual VerifierOptions

- **30+ lines of scattered config**: Assembling `VerifierOptions` manually requires broker URL, token, selectors, state handlers, request filters, version info, publish flags — all in one object
- **Environment variable logic**: Different env vars for local vs remote, CI vs local dev, breaking change vs normal flow
- **Consumer version selector complexity**: Choosing between `mainBranch`, `deployedOrReleased`, `matchingBranch`, and `includeMainAndDeployed` requires understanding Pact Broker semantics
- **Breaking change coordination**: When a provider intentionally breaks a contract, manual selector switching is error-prone
- **Short-lived branch mismatch**: `matchingBranch` cannot find a consumer pact when the provider and consumer branch names differ
- **Cross-execution protection**: `PACT_PAYLOAD_URL` webhook payloads need special handling to verify only the triggering pact

### Solutions

- **`buildVerifierOptions`**: Single function that reads env vars, selects the right flow, and returns complete `VerifierOptions`
- **`buildMessageVerifierOptions`**: Same as above for message/Kafka provider verification
- **`handlePactBrokerUrlAndSelectors`**: Pure function for broker URL + selector resolution (used internally, also exported for advanced use)
- **`getProviderVersionTags`**: Extracts CI branch/tag info from environment for provider version tagging
- **`consumerBranch`**: Adds one explicitly named consumer branch without removing matching, main, or deployed selectors
- **`isBreakingChangeTolerantBranch`**: Classifies only `main`, `master`, and
  `release/**` for an explicitly enabled breaking-change tolerance policy

## Pattern Examples

### Example 1: HTTP Provider Verification (Remote Flow)

```typescript
import { Verifier } from '@pact-foundation/pact';
import { buildVerifierOptions, createRequestFilter } from '@seontechnologies/pactjs-utils';
import type { StateHandlers } from '@seontechnologies/pactjs-utils';

const stateHandlers: StateHandlers = {
  'movie with id 1 exists': {
    setup: async (params) => {
      await db.seed({ movies: [{ id: params?.id ?? 1, name: 'Inception' }] });
    },
    teardown: async () => {
      await db.clean('movies');
    },
  },
  'no movies exist': async () => {
    await db.clean('movies');
  },
};

// buildVerifierOptions reads these env vars automatically:
// - PACT_BROKER_BASE_URL (broker URL)
// - PACT_BROKER_TOKEN (broker auth)
// - PACT_PAYLOAD_URL (webhook trigger — cross-execution protection)
// - PACT_CONSUMER_BRANCH (optional named consumer branch for mismatched PR branches)
// - PACT_PROVIDER_VERSION / PACT_PROVIDER_BRANCH (webhook-selected provider revision)
// - PACT_BREAKING_CHANGE (if "true", uses includeMainAndDeployed selectors)
// - GITHUB_SHA (provider version)
// - CI (publish verification results if "true")

const opts = buildVerifierOptions({
  provider: 'SampleMoviesAPI',
  port: '3001',
  includeMainAndDeployed: process.env.PACT_BREAKING_CHANGE !== 'true',
  stateHandlers,
  requestFilter: createRequestFilter({
    tokenGenerator: () => process.env.TEST_AUTH_TOKEN ?? 'test-token',
  }),
});

await new Verifier(opts).verifyProvider();
```

**Key Points**:

- Set `PACT_BROKER_BASE_URL` and `PACT_BROKER_TOKEN` as env vars — `buildVerifierOptions` reads them automatically
- `port` is a string (e.g., `'3001'`) — the function builds `providerBaseUrl: http://localhost:${port}` internally
- `includeMainAndDeployed` is **required** — set `true` for normal flow, `false` for breaking changes
- State handlers support both simple functions and `{ setup, teardown }` objects
- `params` in state handlers correspond to the `JsonMap` from consumer's `createProviderState`
- Verification results are published by default (`publishVerificationResult` defaults to `true`)

### Example 2: Verify a Named Consumer Branch

When the provider and consumer PR branch names differ, set both `consumer` and
`consumerBranch`. The builder adds the explicit branch selector to the normal
selector set; it does not replace the safety selectors.

```typescript
const opts = buildVerifierOptions({
  provider: 'SampleMoviesAPI',
  port: '3001',
  includeMainAndDeployed: true,
  consumer: 'SampleAppConsumer',
  consumerBranch: process.env.PACT_CONSUMER_BRANCH,
  stateHandlers,
});
```

With `PACT_CONSUMER_BRANCH=feature/new-movie-client`, the selectors are:

```typescript
[
  { consumer: 'SampleAppConsumer', matchingBranch: true },
  { consumer: 'SampleAppConsumer', branch: 'feature/new-movie-client' },
  { consumer: 'SampleAppConsumer', mainBranch: true },
  { consumer: 'SampleAppConsumer', deployedOrReleased: true },
];
```

`consumerBranch` requires `consumer`. The utility throws when an explicit branch
is unscoped because `{ branch: name }` could select that branch from every
consumer of the provider. `buildMessageVerifierOptions` has the same parameter,
default, and guard.

### Example 3: Local Flow (Monorepo, No Broker)

```typescript
import { Verifier } from '@pact-foundation/pact';
import { buildVerifierOptions } from '@seontechnologies/pactjs-utils';

// When PACT_BROKER_BASE_URL is NOT set, buildVerifierOptions
// falls back to local pact file verification
const opts = buildVerifierOptions({
  provider: 'SampleMoviesAPI',
  port: '3001',
  includeMainAndDeployed: true,
  // Specify local pact files directly — skips broker entirely
  pactUrls: ['./pacts/movie-web-SampleMoviesAPI.json'],
  stateHandlers: {
    'movie exists': async (params) => {
      await db.seed({ movies: [{ id: params?.id }] });
    },
  },
});

await new Verifier(opts).verifyProvider();
```

### Example 4: Message Provider Verification (Kafka/Async)

```typescript
import { Verifier } from '@pact-foundation/pact';
import { buildMessageVerifierOptions } from '@seontechnologies/pactjs-utils';

const opts = buildMessageVerifierOptions({
  provider: 'OrderEventsProducer',
  includeMainAndDeployed: process.env.PACT_BREAKING_CHANGE !== 'true',
  // Message handlers return the message content that the provider would produce
  messageProviders: {
    'an order created event': async () => ({
      orderId: 'order-123',
      userId: 'user-456',
      items: [{ productId: 'prod-789', quantity: 2 }],
      createdAt: new Date().toISOString(),
    }),
    'an order cancelled event': async () => ({
      orderId: 'order-123',
      reason: 'customer_request',
      cancelledAt: new Date().toISOString(),
    }),
  },
  stateHandlers: {
    'order exists': async (params) => {
      await db.seed({ orders: [{ id: params?.orderId }] });
    },
  },
});

await new Verifier(opts).verifyProvider();
```

**Key Points**:

- `buildMessageVerifierOptions` adds `messageProviders` to the verifier config
- Each message provider function returns the expected message payload
- State handlers work the same as HTTP verification
- Broker integration works identically (same env vars)

### Example 5: Breaking Change Coordination

```typescript
// When a provider intentionally introduces a breaking change:
//
// 1. Set PACT_BREAKING_CHANGE=true in CI environment
// 2. Your test reads the env var and passes includeMainAndDeployed: false
//    to buildVerifierOptions — this verifies ONLY against the matching
//    branch, skipping main/deployed consumers that would fail
// 3. Coordinate with consumer team to update their pact on a matching branch
// 4. Remove PACT_BREAKING_CHANGE flag after consumer updates

// In CI environment (.github/workflows/provider-verify.yml):
// env:
//   PACT_BREAKING_CHANGE: 'true'

// Your provider test code reads the env var:
const isBreakingChange = process.env.PACT_BREAKING_CHANGE === 'true';

const opts = buildVerifierOptions({
  provider: 'SampleMoviesAPI',
  port: '3001',
  includeMainAndDeployed: !isBreakingChange, // false during breaking changes
  stateHandlers: {
    /* ... */
  },
});
// When includeMainAndDeployed is false and consumerBranch is unset:
//   selectors = [{ matchingBranch: true }]
// When includeMainAndDeployed is true (normal):
//   selectors = [{ matchingBranch: true }, { mainBranch: true }, { deployedOrReleased: true }]
```

### Example 6: handlePactBrokerUrlAndSelectors (Advanced)

```typescript
import { handlePactBrokerUrlAndSelectors } from '@seontechnologies/pactjs-utils';
import type { VerifierOptions } from '@pact-foundation/pact';

// For advanced use cases — mutates the options object in-place (returns void)
const options: VerifierOptions = {
  provider: 'SampleMoviesAPI',
  providerBaseUrl: 'http://localhost:3001',
};

handlePactBrokerUrlAndSelectors({
  pactPayloadUrl: process.env.PACT_PAYLOAD_URL,
  pactBrokerUrl: process.env.PACT_BROKER_BASE_URL,
  consumer: undefined, // or specific consumer name
  includeMainAndDeployed: true,
  consumerBranch: undefined, // requires consumer when set
  options, // mutated in-place: sets pactBrokerUrl, consumerVersionSelectors, or pactUrls
});

// After call, options has been mutated with:
// - options.pactBrokerUrl (from pactBrokerUrl param)
// - options.consumerVersionSelectors (based on includeMainAndDeployed)
// OR if pactPayloadUrl matches: options.pactUrls = [pactPayloadUrl]
```

**Note**: `handlePactBrokerUrlAndSelectors` is called internally by `buildVerifierOptions`. You rarely need it directly — use it only for advanced custom verifier assembly.

### Example 7: getProviderVersionTags

```typescript
import { getProviderVersionTags } from '@seontechnologies/pactjs-utils';

// Extracts version tags from CI environment
const tags = getProviderVersionTags();

// In GitHub Actions on branch "feature/add-movies" (non-breaking):
//   tags = ['feature/add-movies']
//
// In GitHub Actions on main branch (non-breaking):
//   tags = ['dev', 'main']
//
// In GitHub Actions with PACT_BREAKING_CHANGE=true:
//   tags = ['feature/add-movies']  (no 'dev' tag)
//
// Locally (no CI):
//   tags = ['local']
```

Only `main` and `master` receive the legacy `dev` tag. Feature and `release/**`
branches receive only their branch tag, so a PR verification cannot masquerade
as the version deployed in `dev`.

### Breaking-Change Tolerant Branch Classification

`isBreakingChangeTolerantBranch(branch)` returns `true` for `main`, `master`,
and names starting with `release/`. It returns `false` for feature branches and
for lookalikes such as `releases/week-32`.

Use it only when repository policy deliberately tolerates a provider
verification failure while `PACT_BREAKING_CHANGE=true`:

```typescript
import { isBreakingChangeTolerantBranch } from '@seontechnologies/pactjs-utils';

try {
  await verifier.verifyProvider();
} catch (error) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const noPactsFound = message.includes('no pacts found') || message.includes('no pacts were found');

  // A hand-typed consumer branch that selects nothing is always a failed check.
  if (noPactsFound && process.env.PACT_CONSUMER_BRANCH) throw error;

  const tolerated = process.env.PACT_BREAKING_CHANGE === 'true' && isBreakingChangeTolerantBranch(process.env.GITHUB_BRANCH ?? '');

  if (!tolerated) throw error;
}
```

The explicit-consumer-branch guard must run first. Otherwise a typo in
`PACT_CONSUMER_BRANCH` becomes a false green whenever breaking-change tolerance
is active. This tolerance is a visible coordination policy, not a default:
without `PACT_BREAKING_CHANGE=true`, every verification failure still fails the
build.

### Example 8: Provider Vitest Configuration (Required for Multi-File Verification)

**Context**: The Pact Rust FFI that powers the JS `Verifier` holds process-wide state (native handles for messages, matchers, mocks). Vitest's default parallel file workers each spin up their own FFI instance and quickly corrupt that state — causing `MessagePact`/`Verifier` errors like `"Unable to get the MessageHandle"`, or non-deterministic verification passes/fails — as soon as you have more than one provider `.spec.ts` file.

**Rule**: Provider verification suites **must** run in a single fork. Use Vitest's `forks` pool with `singleFork: true` in `vitest.config.contract.ts` (or equivalent).

```typescript
// vitest.config.contract.ts — provider verification config
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/contract/**/*.spec.ts'],
    testTimeout: 60000,
    // MANDATORY for multi-file provider verification.
    // The Pact Rust FFI backing the Verifier holds process-wide state; parallel workers corrupt it
    // and produce flaky verification results / "Unable to get the MessageHandle" errors.
    // This is especially important for message providers (Kafka/async) where verifier construction
    // allocates native handles per file — singleFork keeps them in one process so state is coherent.
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
```

**Key Points**:

- **Required for message providers** (`buildMessageVerifierOptions`) — the message-handle FFI state is almost guaranteed to corrupt under parallel workers.
- **Required for HTTP providers with multiple contract test files** — even if each file works in isolation, running them together in parallel produces intermittent failures.
- `pool: 'forks'` (rather than `threads`) + `singleFork: true` is the exact combo that keeps all verifier runs in a single child process with a single FFI instance.
- Treat `pool: 'forks'` + `singleFork: true` as the required baseline for all provider suites, including single-file HTTP-only ones. A suite that works today with one file will flake the moment a second file is added, and removing the setting later introduces a regression window.
- **The same `pool: 'forks'` + `singleFork: true` rule applies on the consumer side.** Consumer `vitest.config.pact.ts` sets it alongside `fileParallelism: false` — see `pact-consumer-framework-setup.md` Example 2. The rule is needed on either side wherever more than one pact test file exists per consumer+provider pair.
- Use a dedicated `vitest.config.contract.ts` so unit tests still get full parallelism — only contract tests pay the serialization cost.
- Related `package.json` entry:

  ```json
  {
    "scripts": {
      "test:pact:provider": "vitest run --config vitest.config.contract.ts"
    }
  }
  ```

## Environment Variables Reference

| Variable                | Required        | Description                                                                                                                           | Default     |
| ----------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `PACT_BROKER_BASE_URL`  | For remote flow | Pact Broker / PactFlow URL                                                                                                            | —           |
| `PACT_BROKER_TOKEN`     | For remote flow | API token for broker authentication                                                                                                   | —           |
| `PACT_PROVIDER_VERSION` | Webhook flow    | Exact provider revision selected by webhook checkout; takes precedence over `GITHUB_SHA`                                              | —           |
| `PACT_PROVIDER_BRANCH`  | Branch override | Provider branch selected by webhook checkout; takes precedence over `GITHUB_BRANCH`                                                   | —           |
| `PACT_CONSUMER_BRANCH`  | Optional        | Named consumer branch to add to selectors; requires a specific `consumer`                                                             | —           |
| `GITHUB_SHA`            | Recommended     | Provider version for verification result publishing (auto-set by GitHub Actions)                                                      | `'unknown'` |
| `GITHUB_BRANCH`         | Recommended     | Branch name for provider version branch and version tags (**not auto-set** — define as `${{ github.head_ref \|\| github.ref_name }}`) | `'main'`    |
| `PACT_PAYLOAD_URL`      | Optional        | Webhook payload URL — triggers verification of specific pact only                                                                     | —           |
| `PACT_BREAKING_CHANGE`  | Optional        | Set to `"true"` to use breaking change selector strategy                                                                              | `'false'`   |
| `CI`                    | Auto-detected   | When `"true"`, enables verification result publishing                                                                                 | —           |

## Key Points

- **Flow auto-detection**: If `PACT_BROKER_BASE_URL` is set → remote flow; otherwise → local flow (requires `pactUrls`)
- **`port` is a string**: Pass port number as string (e.g., `'3001'`); function builds `http://localhost:${port}` internally
- **`includeMainAndDeployed` is required**: `true` includes mainBranch + deployedOrReleased; `false` removes those two for breaking changes. `matchingBranch` always remains, and a configured `consumerBranch` remains additive in either mode.
- **Selector strategy**: Normal flow (`includeMainAndDeployed: true`) includes all selectors; breaking change flow (`false`) includes only `matchingBranch`
- **Named consumer branch**: `consumerBranch` adds `{ consumer, branch }`; it requires `consumer` and remains additive to the other selectors
- **Webhook support**: `PACT_PAYLOAD_URL` takes precedence — verifies only the specific pact that triggered the webhook
- **State handler types**: Both `async (params) => void` and `{ setup: async (params) => void, teardown: async () => void }` are supported
- **Version publishing**: Verification results are published by default (`publishVerificationResult` defaults to `true`)
- **Provider Vitest config is MANDATORY for multi-file suites**: Set `pool: 'forks'` + `poolOptions.forks.singleFork: true` in `vitest.config.contract.ts`. Without this the Rust FFI corrupts under parallel workers (see Example 8).

## Related Fragments

- `pactjs-utils-overview.md` — installation, decision tree, design philosophy
- `pactjs-utils-consumer-helpers.md` — consumer-side state parameter creation, **one-interaction-per-`it()` rule**
- `pactjs-utils-request-filter.md` — auth injection for provider verification
- `pact-consumer-framework-setup.md` — consumer-side framework setup, Vitest `fileParallelism: false`, CI wiring
- `pact-broker-webhooks.md` — PactFlow → GitHub webhook auth/staleness for webhook-triggered provider verification (`contract_requiring_verification_published`)
- `contract-testing.md` — foundational patterns with raw Pact.js

## Anti-Patterns

### Wrong: Manual broker URL and selector assembly

```typescript
// ❌ Manual environment variable handling
const opts: VerifierOptions = {
  provider: 'my-api',
  providerBaseUrl: 'http://localhost:3001',
  pactBrokerUrl: process.env.PACT_BROKER_BASE_URL,
  pactBrokerToken: process.env.PACT_BROKER_TOKEN,
  publishVerificationResult: process.env.CI === 'true',
  providerVersion: process.env.GIT_SHA || process.env.GITHUB_SHA || 'dev',
  providerVersionBranch: process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME,
  consumerVersionSelectors:
    process.env.PACT_BREAKING_CHANGE === 'true'
      ? [{ matchingBranch: true }]
      : [{ matchingBranch: true }, { mainBranch: true }, { deployedOrReleased: true }],
  pactUrls: process.env.PACT_PAYLOAD_URL ? [process.env.PACT_PAYLOAD_URL] : undefined,
  stateHandlers: {
    /* ... */
  },
  requestFilter: (req, res, next) => {
    req.headers['authorization'] = `Bearer ${process.env.TEST_TOKEN}`;
    next();
  },
};
```

### Right: Use buildVerifierOptions

```typescript
// ✅ All env var logic handled internally
const opts = buildVerifierOptions({
  provider: 'my-api',
  port: '3001',
  includeMainAndDeployed: process.env.PACT_BREAKING_CHANGE !== 'true',
  stateHandlers: {
    /* ... */
  },
  requestFilter: createRequestFilter({
    tokenGenerator: () => process.env.TEST_TOKEN ?? 'test-token',
  }),
});
```

### Wrong: Hardcoding consumer version selectors

```typescript
// ❌ Hardcoded selectors — breaks when flow changes
consumerVersionSelectors: [{ mainBranch: true }, { deployedOrReleased: true }],
```

### Right: Let buildVerifierOptions choose selectors

```typescript
// ✅ Selector strategy adapts to PACT_BREAKING_CHANGE env var
const opts = buildVerifierOptions({
  /* ... */
});
// Selectors chosen automatically based on environment
```

### Wrong: Unscoped Explicit Consumer Branch

```typescript
// ❌ A branch name can exist on several consumers
handlePactBrokerUrlAndSelectors({
  consumerBranch: 'release/week-32',
  consumer: undefined,
  /* ... */
});
```

### Right: Pair Consumer and Branch

```typescript
// ✅ The explicit branch applies to one pacticipant
buildVerifierOptions({
  provider: 'my-api',
  port: '3001',
  includeMainAndDeployed: true,
  consumer: 'my-web',
  consumerBranch: process.env.PACT_CONSUMER_BRANCH,
});
```

### Wrong: Parallel Vitest workers for provider verification

```typescript
// ❌ vitest.config.contract.ts — uses default parallel workers
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/contract/**/*.spec.ts'],
    // NO pool/singleFork config — defaults to parallel file workers
  },
});
// Symptoms: "Unable to get the MessageHandle", non-deterministic verification pass/fail,
// green locally on single-file run but red in CI with multiple files
```

### Right: Single fork for provider verification

```typescript
// ✅ vitest.config.contract.ts — serializes provider verification files
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/contract/**/*.spec.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
```

_Source: @seontechnologies/pactjs-utils provider-verifier module, pact-js-example-provider CI workflows_
