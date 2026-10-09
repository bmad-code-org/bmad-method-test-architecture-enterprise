---
title: 'Integrate Pact.js Utils with TEA'
description: What TEA generates for consumer-driven contract testing when tea_use_pactjs_utils is on, and how to turn it off
---

# Integrate Pact.js Utils with TEA

`@seontechnologies/pactjs-utils` wraps `@pact-foundation/pact` with type-safe helpers for provider states, PactV4 builders, verifier configuration, and request filters.
TEA integrates with it through the `tea_use_pactjs_utils` config flag, which is **on by default**.

## What the Flag Actually Does

When the flag is enabled and the package is installed, TEA uses Pact.js Utils for the Pact artifacts it writes.

The rule lives in the `pactjs-utils-mandate` knowledge fragment, which every generating and reviewing skill loads first.
The shared integration rules are documented in `library-integration-mandate`.

### Two gates

The mandate binds only when both hold:

1. `tea_use_pactjs_utils` is `true`.
2. `@seontechnologies/pactjs-utils` is a dependency in your `package.json`.

Install the package before enabling the mandate.
Without the dependency, TEA skips utility imports and the utility-bypass review rule.

### The relevance gate

Separately from the two gates above, TEA decides whether a Pact suite belongs in your project at all.
It scaffolds one only with evidence of a real consumer-provider boundary:

**Any one of these settles it:**

- An existing `pact/` or `tests/contract/` directory
- `@pact-foundation/pact` already in `package.json`
- `PACT_BROKER_*` in the environment or `.env.example`
- A microservices layout: two or more independently deployable services in the repo that call each other
- You asked for contract testing

**These are weak on their own** and need corroboration: an outbound HTTP call, a generated API client, a service URL in `.env.example`.
Most frontends have all three and call a backend that ships in the same deploy.
They count only when the called service has no source in this repo and is not started by this repo's compose file, dev script, or CI, and a second signal is present.

When no boundary is established, TEA skips Pact scaffolding and records why.

## Substitutions

Use these helpers whenever the package supports the operation:

| You need                                    | TEA emits                                                    | Not                                                      |
| ------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------- |
| A provider state on an interaction          | `.given(...createProviderState({ name, params }))`           | `.given('name', obj as JsonMap)`                         |
| Params coerced to Pact's `JsonMap`          | `toJsonMap(value)`                                           | Manual casts, per-call-site `null` and `Date` handling   |
| PactV4 request/response builder callbacks   | `setJsonContent({ query?, headers?, body? })`, `setJsonBody` | Repeated inline `(b) => { b.query(...); ... }` lambdas   |
| HTTP provider verification options          | `buildVerifierOptions({ provider, port, ... })`              | A hand-assembled 30-line `VerifierOptions` object        |
| Message/Kafka provider verification         | `buildMessageVerifierOptions({ ... })`                       | A second hand-assembled options object                   |
| Broker URL and consumer version selectors   | `handlePactBrokerUrlAndSelectors(...)`                       | Hand-written env-var branching per flow                  |
| Provider version tags in CI                 | `getProviderVersionTags()`                                   | Hand-written branch/tag extraction per CI platform       |
| Auth injection during provider verification | `createRequestFilter({ tokenGenerator })`                    | Bespoke Express middleware, with its `Bearer Bearer` bug |
| A provider that needs no auth               | `noOpRequestFilter`                                          | An empty inline function                                 |

TEA proposes these helpers and identifies their setup requirements:

- `zodToPactMatchers(schema)` when a Zod schema already exists
- The `pact-consumer-di` pattern to point your real client at `mockServer.url`. Add an optional `baseUrl` to your API context type.

Direct `MatchersV3` usage is valid for shapes `zodToPactMatchers` cannot express.
For other package gaps, TEA adds `// pactjs-utils deviation: <reason>` and lists the reason in its summary.

## What Never Relaxes

The correctness rules from the per-utility fragments apply with or without the utilities:

- **One `pact.addInteraction()` per `it()` block.** PactV4's Rust FFI drops interactions non-deterministically otherwise. Use `it.each` for parameterized cases.
- **Consumer Vitest config** carries `fileParallelism: false` AND `pool: 'forks'` AND `poolOptions.forks.singleFork: true`.
- **Provider Vitest config** carries the `pool: 'forks'` + `singleFork` pair.
- Derive response matchers from provider source, an OpenAPI spec, or broker data.
- **Postel's Law.** Matchers in `willRespondWith` only; request bodies in `withRequest` use exact values.
- **A `// Provider endpoint:` comment** on every interaction.

## Canonical Shapes

### Consumer test

```typescript
import { PactV4, MatchersV3 } from '@pact-foundation/pact';
import { createProviderState, setJsonBody, setJsonContent } from '@seontechnologies/pactjs-utils';
import { getMovieById } from '../../src/api/movies-client';

const { integer, string } = MatchersV3;

const pact = new PactV4({ consumer: 'movie-web', provider: 'SampleMoviesAPI', dir: './pacts' });

describe('Movie API Contract', () => {
  it('returns a movie by id', async () => {
    // Provider endpoint: server/src/routes/movies.ts -> GET /movies/:id
    await pact
      .addInteraction()
      .given(...createProviderState({ name: 'movie with id 1 exists', params: { id: 1 } }))
      .uponReceiving('a request for movie 1')
      .withRequest('GET', '/movies/1', setJsonContent({ headers: { Accept: 'application/json' } }))
      .willRespondWith(200, setJsonBody({ id: integer(1), name: string('Inception') }))
      .executeTest(async (mockServer) => {
        // The real client, pointed at the mock server
        const movie = await getMovieById(1, { baseUrl: mockServer.url });
        expect(movie.name).toBe('Inception');
      });
  });
});
```

Put each additional scenario in a separate `it()` or an `it.each` case.

Where a Zod schema for the response already exists, `zodToPactMatchers(MovieSchema)` replaces the inline `MatchersV3` tree so the schema stays the single source of the shape.

### Provider verification

```typescript
import { Verifier } from '@pact-foundation/pact';
import { buildVerifierOptions, createRequestFilter } from '@seontechnologies/pactjs-utils';
import type { StateHandlers } from '@seontechnologies/pactjs-utils';

const stateHandlers: StateHandlers = {
  'movie with id 1 exists': {
    setup: async (params) => db.seed({ movies: [{ id: params?.id ?? 1 }] }),
    teardown: async () => db.clean('movies'),
  },
};

await new Verifier(
  buildVerifierOptions({
    provider: 'SampleMoviesAPI',
    port: '3001',
    includeMainAndDeployed: process.env.PACT_BREAKING_CHANGE !== 'true',
    stateHandlers,
    requestFilter: createRequestFilter({ tokenGenerator: () => process.env.TEST_AUTH_TOKEN ?? 'test-token' }),
  }),
).verifyProvider();
```

State handler names and their `params` must match the consumer's `createProviderState` exactly.

## Coordinate Different PR Branch Names

`matchingBranch: true` covers teams that use the same branch name in consumer and provider repositories.
Pact.js Utils 1.2.0 also covers short-lived branches with different names.

On the provider side, `buildVerifierOptions` and `buildMessageVerifierOptions` accept `consumerBranch`, defaulting to `PACT_CONSUMER_BRANCH`:

```typescript
buildVerifierOptions({
  provider: 'SampleMoviesAPI',
  port: '3001',
  includeMainAndDeployed: true,
  consumer: 'SampleAppConsumer',
  consumerBranch: process.env.PACT_CONSUMER_BRANCH,
});
```

The explicit selector is scoped to `consumer`; the builders throw when a consumer branch is supplied without one.
It stays alongside the matching, main, and deployed selectors.

On the consumer side, copy the package's `detect-provider-branch` composite action and add `Pact provider branch: <name>` to the PR template.
During the PR, `can-i-deploy.sh`:

1. checks the target environment while ignoring only that named provider;
2. checks the same consumer version against the provider branch tip.

Both calls are required.
A branch check proves less than an environment check, so the override is read on pull requests only and disappears on push to main.

The provider has a mirror `detect-consumer-branch` action for manual coordination.
Keep that PR flow separate from PactFlow's `contract_requiring_verification_published` webhook.
The webhook identifies an exact provider version that needs a result.
Check out its `providerVersionNumber`, verify that commit belongs to `providerVersionBranch`, and publish against those values.

Provider suites with an explicit breaking-change tolerance policy should use `isBreakingChangeTolerantBranch`.
It recognizes only `main`, `master`, and `release/**`.
Check and reject a missing hand-entered `PACT_CONSUMER_BRANCH` before applying that tolerance, so a typo cannot turn an unexecuted cross-branch verification green.

<a id="which-workflows-change"></a>

## Which Skills Change

| Skill                      | What the flag changes                                                                                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `framework`                | Installs `@seontechnologies/pactjs-utils` and `@pact-foundation/pact`, then scaffolds directories, Vitest configs, scripts, CI workflow, and samples when the relevance gate opens |
| `automate` red mode (ATDD) | Red-phase contract scaffolds generated in the mandated style. A scaffold is the file the developer un-skips and keeps                                                              |
| `automate` expand mode     | The API worker emits contract artifacts in the mandated style and reports deviations                                                                                               |
| `test-design`              | Pact code examples in design documents match what `automate` will generate                                                                                                         |
| `test-review`              | Scores registry row `M10` (a configured contract utility bypassed with no stated deviation, MEDIUM), gated on flag plus install                                                    |
| `framework` CI phase       | Adds the contract-test stage and quality gates                                                                                                                                     |

## Pact MCP (`tea_pact_mcp`)

`tea_pact_mcp` is enabled by default.
TEA uses the broker only when the SmartBear MCP tools are reachable.

When the tools are reachable, TEA uses broker data for provider states, the verification matrix, and `can-i-deploy`.
Otherwise it continues using provider source or an OpenAPI spec and records the unavailable broker.
It labels inferred provider states with their source.

Set `tea_pact_mcp = "none"` under `[modules.tea]` to skip broker calls.

## Turning It Off

```toml
# _bmad/config.toml
[modules.tea]
tea_use_pactjs_utils = "false" # TEA writes raw @pact-foundation/pact instead
tea_pact_mcp = "none"          # TEA never attempts a broker call
```

With `tea_use_pactjs_utils` off, TEA writes contract tests against raw `@pact-foundation/pact`.
The determinism rules and provider scrutiny still apply.

## Installation

```bash
npm install -D @seontechnologies/pactjs-utils @pact-foundation/pact
# peer dependency: @pact-foundation/pact >= 16.2.0, Node.js >= 18
```

For the remote broker flow, set `PACT_BROKER_BASE_URL` and `PACT_BROKER_TOKEN`, plus `GITHUB_SHA` (GitHub Actions sets this) and `GITHUB_BRANCH` (set it explicitly: `${{ github.head_ref || github.ref_name }}`).
The local monorepo flow needs no broker.

## Related Guides

- [Integrate Playwright Utils](/docs/how-to/customization/integrate-playwright-utils.md): the same mandate shape for browser and API suites
- [TEA Configuration Reference](/docs/reference/configuration.md): every key and its default
- [Knowledge Base Index](/docs/reference/knowledge-base.md): the contract-testing fragments

## Reference

- [Pact.js Utils docs](https://seontechnologies.github.io/pactjs-utils/)
- [Pact.js Utils on npm](https://www.npmjs.com/package/@seontechnologies/pactjs-utils)
