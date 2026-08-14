# Pact.js Utils Mandate

## Principle

When `tea_use_pactjs_utils` is `true` and `@seontechnologies/pactjs-utils` is installed, that package is the **default implementation** for every capability it covers in a Pact suite. Raw `@pact-foundation/pact` boilerplate is a documented deviation, never a default. The flag is not a hint that the library exists; it is an instruction to write consumer and provider suites in that style without being asked.

This fragment instantiates `library-integration-mandate.md`. Read that one for the two gates, the enforcement levels, and the deviation protocol; this one carries the substitutions. The per-utility fragments (`pactjs-utils-consumer-helpers.md`, `pactjs-utils-provider-verifier.md`, `pactjs-utils-request-filter.md`, `pactjs-utils-zod-to-pact.md`) are the reference for how each function is called.

## Scope

**Applies when all of these hold:**

- `tea_use_pactjs_utils` is `true` in `{config_source}`
- `@seontechnologies/pactjs-utils` is a dependency in the project's `package.json`
- The file is a JavaScript or TypeScript Pact artifact: a consumer test (`.pacttest.ts`), a provider verification test, a message consumer or provider test, or their support files

**Does not apply to** — nothing here overrides these:

- Playwright specs, which follow `playwright-utils-mandate.md`
- Pact suites in other languages (pact-jvm, pact-python, pact-go)
- Projects with no contract-testing relevance at all. The flag being `true` is not a reason to introduce Pact into a repo that has no consumer/provider boundary; see "Relevance Before Scaffolding" below.

## Relevance Before Scaffolding

`tea_use_pactjs_utils` defaults to `true`, which means "use these utilities when you write contract tests", not "write contract tests everywhere".

This is the one gate for the decision. Every workflow defers to it rather than restating its own list.

**Sufficient on its own.** Any one of these settles it:

- An existing `pact/` or `tests/contract/` directory
- `@pact-foundation/pact` already in `package.json`
- `PACT_BROKER_BASE_URL` or another `PACT_BROKER_*` variable in the environment or `.env.example`
- A microservices layout: two or more independently deployable services in this repo that call each other
- The user asked for contract testing

**Not sufficient on its own.** An outbound HTTP call, a generated API client, or a service URL in `.env.example` is weak evidence: most frontends have all three and call a backend that ships in the same deploy. Treat these as evidence only when **both** hold:

1. The called service has **no source in this repo**, and is not started by this repo's compose file, dev script, or CI, and
2. A second signal is present — another item from this list, or one of the sufficient signals above.

The disqualifier in (1) is the whole test, so check it rather than assume it. A repo whose frontend calls its own backend has no consumer-provider boundary in the Pact sense: both sides deploy together, so a contract adds ceremony and no safety.

**With none of that, create no Pact artifacts.** Say in the summary that contract scaffolding was skipped because no consumer-provider boundary was found, and that the `framework` workflow can add it later. When the evidence is ambiguous, apply `confidence-gate.md` and ask rather than scaffolding on a guess.

Getting this wrong is worse than a missing utility: it leaves a dead contract suite that fails CI for a boundary the project does not have.

## What Never Relaxes

These are correctness rules from the per-utility fragments, not style preferences, and the mandate does not soften them. They apply whether or not pactjs-utils is in use:

- **One `pact.addInteraction()` per `it()` block.** PactV4's Rust FFI drops interactions non-deterministically when several are chained in one test. Use `it.each` for parameterized cases.
- **Consumer Vitest config** carries `fileParallelism: false` AND `pool: 'forks'` with `poolOptions.forks.singleFork: true`.
- **Provider Vitest config** carries `pool: 'forks'` with `singleFork: true`.
- **Provider scrutiny before matchers.** Response matchers come from provider source, an OpenAPI spec, or broker data — never from consumer-side types alone. See the Seven-Point Scrutiny Checklist in `contract-testing.md`.
- **Postel's Law for matchers.** Matchers belong in `willRespondWith` only. Request bodies in `withRequest` use exact values; the consumer controls what it sends.
- **A `// Provider endpoint: <path> -> <METHOD> <route>` comment** on every interaction.

## Substitution Table

| Need                                         | Raw Pact — do not emit                                                             | pactjs-utils — emit this                                                            | Level       | Fragment                            |
| -------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------- | ----------------------------------- |
| Provider state on an interaction             | `.given('name', { id: 1 } as JsonMap)`, hand-cast params                           | `.given(...createProviderState({ name, params }))`                                  | REQUIRED    | `pactjs-utils-consumer-helpers.md`  |
| Coercing params to Pact's `JsonMap`          | Manual casts, `String(date)`, `null` handling per call site                        | `toJsonMap(value)`                                                                  | REQUIRED    | `pactjs-utils-consumer-helpers.md`  |
| PactV4 request/response builder callbacks    | Repeated inline `(b) => { b.query(...); b.headers(...); b.jsonBody(...) }` lambdas | `setJsonContent({ query?, headers?, body? })`, or `setJsonBody(body)` for body-only | REQUIRED    | `pactjs-utils-consumer-helpers.md`  |
| HTTP provider verification options           | A hand-assembled 30-line `VerifierOptions` object                                  | `buildVerifierOptions({ provider, port, includeMainAndDeployed, stateHandlers })`   | REQUIRED    | `pactjs-utils-provider-verifier.md` |
| Message/Kafka provider verification options  | A second hand-assembled options object                                             | `buildMessageVerifierOptions({ ... })`                                              | REQUIRED    | `pactjs-utils-provider-verifier.md` |
| Broker URL and consumer version selectors    | Hand-written env-var branching for local vs remote vs breaking-change flows        | `handlePactBrokerUrlAndSelectors(...)` (or let `buildVerifierOptions` read the env) | REQUIRED    | `pactjs-utils-provider-verifier.md` |
| Provider version tags in CI                  | Hand-written branch/tag extraction per CI platform                                 | `getProviderVersionTags()`                                                          | REQUIRED    | `pactjs-utils-provider-verifier.md` |
| Auth injection during provider verification  | A bespoke Express middleware, with its recurring `Bearer Bearer` bug               | `createRequestFilter({ tokenGenerator })`                                           | REQUIRED    | `pactjs-utils-request-filter.md`    |
| A provider that needs no auth injection      | Omitting `requestFilter`, or an empty inline function                              | `noOpRequestFilter`                                                                 | REQUIRED    | `pactjs-utils-request-filter.md`    |
| Response matchers where a Zod schema exists  | Hand-written `MatchersV3` trees duplicating the schema                             | `zodToPactMatchers(schema, examples?)`                                              | RECOMMENDED | `pactjs-utils-zod-to-pact.md`       |
| Exercising the consumer inside `executeTest` | Raw `fetch(`${mockServer.url}/...`)`                                               | Inject `mockServer.url` as `baseUrl` and call the real client                       | RECOMMENDED | `pact-consumer-di.md`               |

`zodToPactMatchers` is RECOMMENDED because it needs a Zod schema to exist. Where the project has one, derive the matchers from it rather than maintaining a parallel matcher tree. Where it does not, write matchers from provider scrutiny and say so.

The DI pattern is RECOMMENDED because it needs a two-line change in production code (an optional `baseUrl` on the API context type). Propose it and name the change. Falling back to raw `fetch` without saying so ships a contract that is a hand-crafted guess at what the consumer sends, which is the failure `pact-consumer-di.md` exists to prevent.

## Banned Patterns

When this mandate is active, these are defects in generated or reviewed code:

- `.given('state name', someObject as JsonMap)` — a hand-cast provider state where `createProviderState` applies.
- A literal `VerifierOptions` object passed to `new Verifier(...)`, where `buildVerifierOptions` applies.
- A bespoke `requestFilter` middleware that prefixes a bearer token by hand.
- Repeated inline PactV4 builder lambdas that `setJsonContent` or `setJsonBody` would replace.
- Raw `fetch` inside `executeTest` in a project whose consumer client is importable, with no note saying why.
- Importing a **pactjs-utils symbol** from anywhere other than `@seontechnologies/pactjs-utils`. `@pact-foundation/pact` remains the correct and required import for Pact's own API — `PactV3`, `PactV4`, `MatchersV3`, `Verifier`, `V3MockServer`, and the types. The two packages are used side by side in every example here; only the helper layer is mandated.

### Legitimate exceptions

These are not violations and need no deviation note:

- `MatchersV3` used directly for a matcher `zodToPactMatchers` cannot express, or where no schema exists.
- A raw `VerifierOptions` field passed through `buildVerifierOptions`'s own escape hatch for something it does not model.
- Raw `fetch` in a consumer test where the consumer client genuinely cannot be imported (a different package, a build artifact, a language boundary) — state it once in the summary rather than per line.

## Canonical Shapes

### Consumer test

PactV4 `addInteraction()`, one per `it()`, with `setJsonContent` on the request and
`setJsonBody` on the response. That is four of the REQUIRED substitutions in one
shape, which is the point: a worker copies this, so it has to demonstrate the rules
rather than describe them.

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
        // DI: the real client, pointed at the mock server
        const movie = await getMovieById(1, { baseUrl: mockServer.url });
        expect(movie.name).toBe('Inception');
      });
  });
});
```

Exactly one `addInteraction()` in that `it()`. A second scenario is a second `it()`,
or `it.each` — never a second chain in the same block. See
`pactjs-utils-consumer-helpers.md` Example 6 for what the FFI does otherwise.

Where the project already has a Zod schema for the response, replace the inline
`MatchersV3` tree with `zodToPactMatchers(MovieSchema)` and keep the schema as the
single source of the shape. `MatchersV3` written by hand is correct only where no
schema exists.

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

State handler names and their `params` must match the consumer's `createProviderState` exactly. That pairing is the contract's own contract; a mismatch fails verification with a message that points at neither side.

## Self-Check Before Emitting a Pact File

Any `yes` is a blocker.

1. Does an interaction call `.given()` with hand-cast params instead of `createProviderState`?
2. Does a verification file build `VerifierOptions` by hand?
3. Does a request filter assemble an `Authorization` header itself?
4. Does an `it()` block contain more than one `addInteraction`?
5. Does the consumer Vitest config omit `fileParallelism: false`, `pool: 'forks'`, or `singleFork: true`?
6. Does `executeTest` call raw `fetch` while the consumer client is importable, with no stated reason?
7. Is any response matcher derived from consumer-side types rather than provider source, OpenAPI, or broker data?
8. Is any interaction missing its `// Provider endpoint:` comment?

Fix, or record a deviation. Do not emit unresolved.

## Broker Interaction

When `tea_pact_mcp` is `"mcp"` and the SmartBear MCP tools are reachable, use them for what they are authoritative about: existing provider states, the verification matrix, and `can-i-deploy`. Prefer real broker data over a guess at what states exist.

When the tools are not reachable — no broker configured, no credentials, a headless run without the server — degrade per `pact-mcp.md`: fall back to provider source or an OpenAPI spec, say in the output that the broker was unreachable, and continue. Never block the workflow on it, and never present inferred state names as if they came from the broker.

## Review Behavior

Under `test-review`, with the flag `true` and the package installed, each Banned Pattern above is a **maintainability** finding on the file where it appears (registry row `M10`), with the substitution named in the recommendation. The determinism and FFI rules keep their own existing rows (`H6`, `H7`, `H8`, `L4`) and outrank this one: a suite that flakes matters more than a suite that is verbose.

## Related Fragments

- `library-integration-mandate.md` — the general contract this instantiates
- `pactjs-utils-overview.md` — installation, the full utility table, flow decision tree
- `pactjs-utils-consumer-helpers.md`, `pactjs-utils-provider-verifier.md`, `pactjs-utils-request-filter.md`, `pactjs-utils-zod-to-pact.md`
- `pact-consumer-framework-setup.md` — directory structure, Vitest configs, scripts, CI workflow
- `pact-consumer-di.md` — injecting the mock server URL into the real client
- `contract-testing.md` — provider scrutiny, publishing, determinism
- `pact-mcp.md` — broker tools and their degradation path
- `confidence-gate.md` — stop and ask rather than invent a provider state or a response shape
