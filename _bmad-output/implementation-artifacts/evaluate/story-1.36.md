---
title: 'Story 1.36: Hold an HTTP entry to eval-quality own target-policy parser'
type: 'feature'
created: '2026-09-30'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '3479b88a'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** eval-quality 4.4.0 exports `parseCommandTargetPolicy` and `parseMcpTargetPolicy` from `eval-quality/adapters` and no parser for its HTTP `ProbeTargetPolicy`. `tea-evaluate`'s `ApiRegistryEntry` therefore repeats the authorization's field rules (the schemes, the port range, the method list, the non-empty address list, the ceilings' minimums) in the runtime's own `evaluation.json` schema, and a rule eval-quality adds or changes reaches `check` only when someone copies it.

**Approach:** the coordinator adds `parseProbeTargetPolicy` to eval-quality (a minor release, the same shape as its two siblings) and TeA consumes it. `check` hands the policy the HTTP entries would become, a started server's entry at a placeholder port and each `deployments` origin as an authorization of its own, to the parser, and an entry it refuses is a `registry` finding that carries the parser's reason. The runtime builds each call's policy through the same parser before any service starts. `ApiRegistryEntry` keeps the authorization fields at their JSON types and leaves their rules to the parser.

## Boundaries & Constraints

**Always:** The parser decides what a valid authorization is (AD-1); TeA computes no verdict and copies no rule. The runtime's `port` and `server` exclusivity, `interfaceId` slug, `host` spelling, and every field that is TeA's own (`auth`, `server`, `deployments` shape, `environmentKeys`) keep their runtime schema rules. The policy handed to the parser has the exact shape `authorizationOf` and `deploymentCandidates` already build, so a policy the parser accepts is the policy the port receives. The engine check runs at start and end.

**Never:** Keep a scheme enum, a port range, a minimum or a maximum, a method enum, a `minItems` or a `minLength` on an `ApiRegistryEntry` authorization field. Copy the parser's rules into a TeA function. Change the gameability arm's degenerate-response shape. Pin the engine below the floor the story raises.

## I/O & Edge-Case Matrix

| Scenario                          | Input / State                                                 | Expected Output / Behavior                                                     | Error Handling                   |
| --------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------- |
| Entry the parser refuses          | `port: 0`, `scheme: ftp`, empty `addresses`, `maxElapsedMs` 0 | `check` exit 10, one `registry` finding naming the parser's reason and pointer | finding, no runtime error        |
| Started server's entry            | `server` set, no `port`                                       | policy read at a placeholder port; a valid entry yields no finding             | N/A                              |
| Deployment origin                 | `deployments[n]` with a refused port or empty address list    | `registry` finding naming the authorization the parser refused                 | finding                          |
| Runtime call over a refused field | registry built without `check` over a refused field           | the call's policy parse throws the parser's fault before any service starts    | fault carried, exit 12 as before |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/registry.js` (`apiRegistryProblems` about 999, `mcpRegistryProblems` 910 as the pattern): add the parser read over the HTTP entries at a placeholder port.
- `cli/lib/evaluate/http-target.js` (`authorizationOf` 394, `deploymentCandidates` 415, `portConfiguration` 525, callers 1082 and 1161): build each call's policy through `parseProbeTargetPolicy` before a service starts.
- `cli/lib/evaluate/engine.js`: the install hint and floor text.
- `cli/lib/evaluate/schemas/evaluation.schema.json` (`ApiRegistryEntry`, its `deployments` items): drop the copied rules, keep types.
- `test/test-evaluate-api.js`: the three cases and units the plan names, plus the existing `schema`-finding cases that now report under `registry`.
- `docs/reference/tea-evaluate-cli.md`: the registry passage and the `check` rule list; `CHANGELOG.md` `## [Unreleased]`; `package.json` peer floor and `package-lock.json`.
- `epics.md` and `test-design-epic-1.md`: amended in place if the build departs from the plan text.

## Tasks & Acceptance

**Execution:**

- [x] eval-quality: `parseProbeTargetPolicy` released (coordinator, before the TeA merge): eval-quality 4.5.0, bmad-eval-quality#170, squash 0f8c521, a minor release
- [x] `registry.js`, `http-target.js`, `evaluation.schema.json`: read the policy through the parser, at `check` and before each call, drop the copied rules -- AC 1, 2, 3
- [x] `test-evaluate-api.js`, docs, CHANGELOG, floors -- AC 1, 2, 3

**Acceptance Criteria:**

- Given that release, when `tea-evaluate check` reads a registry with an HTTP entry the parser refuses, then it is a `registry` finding naming the parser's reason; skipping the parser lets the case exit 0.
- Given the runtime builds a call's policy, then it does so through the parser before any service starts, so a refused field stops the call with the parser's fault; building the policy by hand lets the refused field reach the port.
- Given `ApiRegistryEntry`, then its authorization fields carry their JSON types alone; restoring a copied rule fails the read.

## Verification

**Commands:**

- `npm test` -- expected: green (about 10 minutes)
- `node --input-type=module -e "const m = await import('eval-quality/adapters'); if (typeof m.parseProbeTargetPolicy !== 'function') process.exit(1)"` -- expected: exit 0
- `npm run test:release-metadata` -- expected: green

## Implementation Notes

- Engine: the worker's build ran on the packed eval-quality PR #170 (`parseProbeTargetPolicy`, rebuilt at PR head 877f2c2, which also refuses an `addresses` entry that is no IP literal), installed with `npm install --no-save`. The coordinator then released eval-quality 4.5.0 (bmad-eval-quality#170, squash 0f8c521, a minor release), raised the optional peer floor in `package.json` to `>=4.5.0`, and moved `package-lock.json` to the published 4.5.0 (the peer range and the `node_modules/eval-quality` entry with its registry `resolved` URL and integrity hash). The install hint in `cli/lib/evaluate/engine.js` and the reference's requirements line say `>=4.5.0`. The gates below ran against the published 4.5.0.
- `cli/lib/evaluate/http-target.js`: `portConfiguration` takes `parsePolicy` and returns the parsed policy, so the port receives what the parser accepted and TeA holds no rule over an authorization's fields. The parser loads through `loadAdapters()` at the top of `createApiPort`'s and `degenerateApiPort`'s async `probe`; only the load happens there. The refusal comes from `configurationAt(...)`, which runs after the call's port directory and free port exist and before any server starts (the `finally` removes the directory); `portConfiguration` stays synchronous, and the tests that call it pass the parser in. The degenerate-response shape is untouched. `deploymentAuthorizations` is split out of `deploymentCandidates` (same objects) and exported with `authorizationOf` and `defaultPortOf`, so `check` builds exactly the shapes the runtime builds.
- `cli/lib/evaluate/registry.js`: `apiRegistryProblems` reads, for each entry that holds its schema, the entry's own authorization (a started server's at `defaultPortOf(entry)`, the port the runtime first names for it) and each `deployments` origin as an authorization of its own, each through `parseProbeTargetPolicy` as a policy of that authorization alone. A refusal is one `registry` finding: `registry[n]` or `registry[n].deployments[m]` becomes an authorization the parser refuses, then the parser's message verbatim (every issue, each with its pointer). Reading one authorization at a time names the entry or deployment refused; the pointers therefore start at `/authorizations/0`, which the finding says. The schema has no rule across authorizations, so one read each accepts what the whole policy accepts.
- `evaluation.schema.json`: `ApiRegistryEntry` and its `deployments` items drop the scheme enum, the port `minimum` and `maximum`, the method enums, `minItems`, `minLength`, `uniqueItems`, the ceilings' `minimum` and the `maxElapsedMs` `maximum`. JSON types, `required`, the port and server `oneOf`, the `interfaceId` slug, `auth`, `server` and `environmentKeys` stay.
- Tests, `test/test-evaluate-api.js` `checkPolicyParser` (header comment updated): an entry with `port` 0, `scheme` `ftp`, empty `addresses` and `maxElapsedMs` 0 is exit 10 with one `registry` finding carrying the parser's own message (computed in the test from the real parser) and no `schema` finding; a started server's entry yields none and one with `maxRequestBytes` 0 yields a finding for that field alone (the placeholder port); a deployment origin over port 0 names `registry[0].deployments[1]`; an address that is a host name gives a finding at `/authorizations/0/addresses/1` (the rule the rebuilt parser added, with no TeA change); `maxElapsedMs` of 2 \*\* 31 passes. Runtime units: `createApiPort` over a started server (reporting its port and on a chosen port), a deployed entry and `degenerateApiPort` throw the parser's fault (`schema-parse-failure`, message equal to the parser's own) with no `mechanism.run`, no leftover port directory, and a `runTrial` over such a registry stops with exit 12 and starts no service. The schema case reads `ApiRegistryEntry` and its `deployments` items and asserts, by allow-list, that each authorization field's own keys are a subset of `type`, `description` and `items`, and an array field's `items` keys a subset of `type` and `description`, so a content keyword, a `$ref` or a combinator (`allOf`, `anyOf`, `oneOf`, `not`, `if`) fails; it also asserts that the TeA-owned rules remain. A `check` case appends a second HTTP entry (a second contract interface `grader-second`, its own operation and phase, a deployed `port`): two valid entries give no finding, and one refused field (`maxResponseBytes` 0) on the second entry alone gives exit 10 and exactly one parser finding naming `registry[1]` and not `registry[0]`. A `createApiPort` unit calls a valid started-server entry beside a deployed sibling whose `methods` is empty: `portConfiguration` parses every authorization it reaches, so the sibling's refusal stops the call with the parser's fault at `/authorizations/1/methods`, with no service started and no directory left. That outcome is the intended one and the unit pins it. `test-evaluate-arms.js` and the three older `portConfiguration` callers in `test-evaluate-api.js` pass the parser in.
- No existing case expected a `schema` finding for a copied rule (the copied rules were held by nothing but the schema), so none moved to `registry`. The `check` case for a `maxElapsedMs` past 2147483647 (`test-evaluate-check.js`) is over `registry[0]` of the valid fixture, which is a command entry, so it keeps its `schema` finding.
- Docs: `docs/reference/tea-evaluate-cli.md` (requirements line, the `registry` rule list naming the parser's refusals, the HTTP field bullet, the `deployments` bullet, which no longer claims a `schema` refusal for a duplicate origin). `CHANGELOG.md` `### Changed`. `epics.md` (Story 1.36's engine paragraph and one amendment criterion) and `test-design-epic-1.md` (levels line and four rows) are amended in place, dated 2026-09-30.
- Skill gate: no file under `src/workflows/testarch/bmad-testarch-evaluate/` states a copied rule (grep for the port range, the method list, `minItems`, `ProbeTargetPolicy` and the parser names found only the port template's own comments), so no `/bmad-workflow-builder` run was needed.
- Departures from the plan text: (1) a deployment origin and a started server's entry are read one authorization at a time, not as one policy; (2) the `maxElapsedMs` maximum of 2147483647 leaves the schema with the other copied rules: eval-quality's HTTP policy sets none, the runtime holds a larger value with `timerDelay`, and a `preflight` over `maxElapsedMs` 3000000000 exits 0; (3) `uniqueItems` leaves as well. It was TeA's own rule: eval-quality's `ProbeTargetAuthorization` has no uniqueness rule, the parser accepts duplicates and `evaluateTarget` takes the first authorization that matches, so a duplicate address, method, safe method or `deployments` origin is no longer a finding. Each is recorded in the amendments above.
- Not built, on purpose: `deploymentAccess` still hands its candidates to `evaluateTarget` unparsed; whatever it admits reaches the call through `portConfiguration`, which parses it.

## Revert observations

Each check is exercised once: undo the change locally, run `node test/test-evaluate-api.js` (317 checks, 322 after the fix-round cases below), restore the file byte for byte from a saved copy (`cmp` confirmed each restore).

- AC 1, skipping the parser in `apiRegistryProblems` (the `parseProbeTargetPolicy` call replaced by a no-op): 4 of 317 fail (the refused entry exits 0 with no finding, the started server's `maxRequestBytes` 0, the deployment origin, and the host-name address).
- AC 1, the started server's entry read with no placeholder port (`authorizationOf(entry, entry.port)`): 56 of 253 fail and the run stops early, since every started-server entry is now refused (`check` over the HTTP fixture exits 10, and each case built on it).
- AC 1, leaving the `deployments` origins out of the read: 1 fails (`a deployment origin the parser refuses: check exited 0`).
- AC 2, building the policy by hand in `portConfiguration` (no `parsePolicy`): 5 of 317 fail. The refused fields reach the port: the started server's two calls and the deployed entry's end in `port-failure`, the gameability arm's port likewise, and the trial stops with "budget-exhausted in ProbeObservation: the exchange passed maxElapsedMs (0ms)" where the parser's pointer belongs.
- AC 2, by hand in `degenerateApiPort` alone: 1 fails. By hand in `createApiPort` alone: 4 fail.
- AC 3, restoring the scheme enum on `ApiRegistryEntry`: 2 fail (the JSON-type read, and the refused entry now reports under `schema`). Restoring `minItems` on a deployment's `addresses`: 2 fail. Restoring the port's `minimum` and `maximum`: 2 fail.

Fix round (two review findings), each exercised once the same way, 322 checks:

- AC 1, hard-coding `where: "registry[0]"` for the entry's own authorization in `apiRegistryProblems` (`cli/lib/evaluate/registry.js`): 1 of 322 fails, the new second-entry case (`check` exits 10 with one finding, but it names `registry[0]` where `registry[1]` belongs). Every older case edits `registry[0]` and still passed.
- AC 3, a copied rule back through a combinator, `allOf: [{ minItems: 1 }, { items: { enum: [...] } }]` on `ApiRegistryEntry.methods`: 1 of 322 fails, the allow-list (`expected the JSON type array alone, with no allOf of its own`). The deny-list it replaced passed this. A plain enum on `ApiRegistryEntry.scheme`: 2 of 322 fail (the allow-list, and the refused entry now reports under `schema`).
- AC 2, `portConfiguration` reading only the called interface's entry (`entry.interfaceId === interfaceId` added to `reached`, `cli/lib/evaluate/http-target.js`): 1 of 322 fails, the sibling unit (the call ends in `port-failure` where the parser's `/authorizations/1/methods` fault belongs).

## Gates

- Run in the last state of the tree, against the published eval-quality 4.5.0, all green: `test:evaluate-api` 322 checks, `test:evaluate-check` 713, `test:evaluate-arms` 398, `test:release-metadata`, `test:lockfile-age`, `docs:validate-links`, `lint`, `lint:md`, `format:check`, `test:doc-claims`, `test:doc-counts`. The other `test:evaluate-*` suites ran green on the packed PR head before the floor moved and are left to the full `npm test`.
- Engine check (`eval-quality/adapters` exports `parseProbeTargetPolicy`) exit 0. `git diff main -- package.json package-lock.json` shows the peer floor `>=4.4.0` to `>=4.5.0` in both files and the lockfile's eval-quality entry moved to the published 4.5.0 (registry `resolved` URL and integrity hash). `test:release-metadata` (`Release metadata is synchronized and publishable for v1.27.2`) and `test:lockfile-age` (`package-lock.json` and `website/package-lock.json` passed; `eval-quality@4.5.0` is the named exclusion) both pass.
- Formatting: Prettier realigned the frozen section's I/O matrix table in this file (whitespace only), since `lint:md` and `format:check` read the record.
- Unrun: the full `npm test` (the commit hook and CI run it) and `docs:build`.
