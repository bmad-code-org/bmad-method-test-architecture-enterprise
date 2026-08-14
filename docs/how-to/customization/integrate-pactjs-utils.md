---
title: 'Integrate Pact.js Utils with TEA'
description: What TEA generates for consumer-driven contract testing when tea_use_pactjs_utils is on, and how to turn it off
---

# Integrate Pact.js Utils with TEA

`@seontechnologies/pactjs-utils` wraps `@pact-foundation/pact` with type-safe helpers for provider states, PactV4 builders, verifier configuration, and request filters. TEA integrates with it through the `tea_use_pactjs_utils` config flag, which is **on by default**.

## What the Flag Actually Does

`tea_use_pactjs_utils: true` does not mean "the library is available if you ask for it", and it does not mean "add contract tests to this project". It means: **whenever TEA writes a Pact artifact, it writes it with these utilities.**

The rule lives in the `pactjs-utils-mandate` knowledge fragment, which every generating and reviewing workflow loads first. It instantiates the same general contract as the Playwright Utils mandate, documented in `library-integration-mandate`.

### Two gates

The mandate binds only when both hold:

1. `tea_use_pactjs_utils` is `true`.
2. `@seontechnologies/pactjs-utils` is a dependency in your `package.json`.

A flag with no install is an intention, not a capability. TEA will not scaffold imports against a package you do not have, and `test-review` will not deduct for not using one.

### The relevance gate

Separately from the two gates above, TEA decides whether a Pact suite belongs in your project at all. It scaffolds one only with evidence of a real consumer-provider boundary:

- An outbound call to a service this repo does not deploy with
- An existing `pact/` or `tests/contract/` directory, `@pact-foundation/pact` in `package.json`, or `PACT_BROKER_*` in the environment
- A microservices layout where multiple deployable services call each other
- You asked for contract testing

With none of those, TEA creates no Pact artifacts and says why in the summary. A dead contract suite that fails CI for a boundary the project does not have is worse than no suite, so the default-on flag never turns into unwanted scaffolding.

## Substitutions

**REQUIRED** — drop-in. Generating the raw-Pact equivalent instead is a defect:

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

**RECOMMENDED** — needs something the project may not have, so TEA proposes it and names what is missing rather than silently hand-rolling the alternative:

- `zodToPactMatchers(schema)` where a Zod schema already exists, instead of a parallel hand-written matcher tree
- The `pact-consumer-di` injection, so `executeTest` calls your real client with `mockServer.url` instead of raw `fetch`. It needs an optional `baseUrl` on your API context type: two lines of production code

**Real exceptions still ship.** `MatchersV3` used directly for something `zodToPactMatchers` cannot express is correct and is not a deviation. Where a genuine gap exists, generated code carries `// pactjs-utils deviation: <reason>` and the workflow summary lists it.

## What Never Relaxes

The mandate does not soften the correctness rules from the per-utility fragments. They apply with or without the utilities:

- **One `pact.addInteraction()` per `it()` block.** PactV4's Rust FFI drops interactions non-deterministically otherwise. Use `it.each` for parameterized cases.
- **Consumer Vitest config** carries `fileParallelism: false` AND `pool: 'forks'` AND `poolOptions.forks.singleFork: true`.
- **Provider Vitest config** carries the `pool: 'forks'` + `singleFork` pair.
- **Provider scrutiny before matchers.** Response matchers come from provider source, an OpenAPI spec, or broker data, never from consumer-side types alone.
- **Postel's Law.** Matchers in `willRespondWith` only; request bodies in `withRequest` use exact values.
- **A `// Provider endpoint:` comment** on every interaction.

## Canonical Shapes

### Consumer test

```typescript
import { PactV3, MatchersV3 } from '@pact-foundation/pact';
import { createProviderState } from '@seontechnologies/pactjs-utils';
import { getMovieById } from '../../src/api/movies-client';

const provider = new PactV3({ consumer: 'movie-web', provider: 'SampleMoviesAPI', dir: './pacts' });

describe('Movie API Contract', () => {
  it('returns a movie by id', async () => {
    // Provider endpoint: server/src/routes/movies.ts -> GET /movies/:id
    await provider
      .given(...createProviderState({ name: 'movie with id 1 exists', params: { id: 1 } }))
      .uponReceiving('a request for movie 1')
      .withRequest({ method: 'GET', path: '/movies/1' })
      .willRespondWith({ status: 200, body: MatchersV3.like({ id: 1, name: 'Inception' }) })
      .executeTest(async (mockServer) => {
        // The real client, pointed at the mock server
        const movie = await getMovieById(1, { baseUrl: mockServer.url });
        expect(movie.name).toBe('Inception');
      });
  });
});
```

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

State handler names and their `params` must match the consumer's `createProviderState` exactly. That pairing is the contract's own contract.

## Which Workflows Change

| Workflow      | What the flag changes                                                                                                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `framework`   | Installs `@seontechnologies/pactjs-utils` and `@pact-foundation/pact`, then scaffolds directories, Vitest configs, scripts, CI workflow, and mandated samples — only when the relevance gate opens |
| `atdd`        | Red-phase contract scaffolds generated in the mandated style. A scaffold is the file the developer un-skips and keeps                                                                              |
| `automate`    | The API worker emits contract artifacts in the mandated style and reports deviations                                                                                                               |
| `test-design` | Pact code examples in design documents match what `automate` will generate                                                                                                                         |
| `test-review` | Scores registry row `M10` (a configured contract utility bypassed with no stated deviation, MEDIUM), gated on flag plus install                                                                    |
| `ci`          | Adds the contract-test stage and quality gates                                                                                                                                                     |

## Pact MCP (`tea_pact_mcp`)

Also on by default, and safe without a broker. It gates a runtime capability rather than a dependency, so its second gate is "are the SmartBear MCP tools reachable in this session".

When they are, TEA prefers real broker data for provider states, the verification matrix, and `can-i-deploy`. When they are not, it degrades: falls back to provider source or an OpenAPI spec, states in the output that the broker was unreachable, and continues. No workflow blocks on it, nothing retries in a loop, and inferred provider states are never presented as broker data.

Set `tea_pact_mcp: 'none'` to stop TEA attempting a broker call at all.

## Turning It Off

```yaml
# _bmad/tea/config.yaml
tea_use_pactjs_utils: false # TEA writes raw @pact-foundation/pact instead
tea_pact_mcp: 'none' # TEA never attempts a broker call
```

Turning `tea_use_pactjs_utils` off does not disable contract testing. It changes which API the generated tests are written against; the determinism rules and provider scrutiny still apply.

## Installation

```bash
npm install -D @seontechnologies/pactjs-utils @pact-foundation/pact
# peer dependency: @pact-foundation/pact >= 16.2.0, Node.js >= 18
```

For the remote broker flow, set `PACT_BROKER_BASE_URL` and `PACT_BROKER_TOKEN`, plus `GITHUB_SHA` (GitHub Actions sets this) and `GITHUB_BRANCH` (set it explicitly: `${{ github.head_ref || github.ref_name }}`). The local monorepo flow needs no broker.

## Related Guides

- [Integrate Playwright Utils](/docs/how-to/customization/integrate-playwright-utils.md) — the same mandate shape for browser and API suites
- [TEA Configuration Reference](/docs/reference/configuration.md) — every key and its default
- [Knowledge Base Index](/docs/reference/knowledge-base.md) — the contract-testing fragments

## Reference

- [Pact.js Utils docs](https://seontechnologies.github.io/pactjs-utils/)
- [Pact.js Utils on npm](https://www.npmjs.com/package/@seontechnologies/pactjs-utils)
