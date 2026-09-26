---
title: 'Story 1.11: Scaffold the HTTP probe port for `api` targets'
type: 'feature'
created: '2026-09-25'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '2d8ffc9c01084eeb9505bd54a7160d6dccbcd17b'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Stories 1.10, 1.11, 1.17, 1.31, 1.32, 1.33, 1.35)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.11 section, the Story 1.17 rows naming 1.11, the Story 1.33 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-1, AD-4, AD-7, AD-8, AD-10, AD-21)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.10.md (the MCP sibling this story mirrors)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** `tea-evaluate` drives command targets and stdio tool servers only: `preflight` and `run` refuse an `api` evaluation with exit 12, the registry holds no HTTP entry, and the sealed-brief bridge denies every `api` call at the interface, so an adopter whose system under test is an AI feature or a web application cannot be evaluated.

**Approach:** the skill ships two adopter-owned templates, an HTTP environment-probe port whose every allow or deny decision is eval-quality's `evaluateTarget`, and its conformance file over a loopback stub; the registry gains an `api` entry that the runtime turns into eval-quality's `ProbeTargetPolicy` and hands, with the address, auth and transport configuration, to the adopter's port for each call; every leg, qualification arm, trial, gameability arm and bridge call of an `api` interface goes through that port, and what comes back is recorded in eval-quality's sealed shape (path, query, header and body in, status, headers and body out).

## Boundaries & Constraints

**Always:** eval-quality decides every allow or deny (AD-1): the port template calls `evaluateTarget` once per request and once per redirect hop, and no TeA file or template holds address classification; the port is adopter code under the evaluation folder's `adapter/`, imported by the runtime, and it alone imports eval-quality there; `engine.js` stays the one runtime file that loads eval-quality; every run-directory write goes through `run-directory.js`; every temp directory a trial makes is on the pipeline's scratch list; a denial carries eval-quality's `reason`, which the runtime records and never parses from prose; environment values the call carries (a launched server's keys, an auth header's value) are scrubbed from every observation and cause.

**Never:** an HTTP client or network policy in `cli/` beyond launching and reaching a server the registry names; a shared HTTP port in TeA's runtime (AD-4 rejects it); a new dependency; `captured`, `matcher` or `principal` bindings (Stories 1.18, 1.30); a network sandbox (Story 1.31 covers the file system only); a deployment-routed historical probe (Story 1.32).

**Decisions (build agent, owner-delegated):**

- A registry entry with `kind: "api"` is an `ApiRegistryEntry`: `interfaceId`, eval-quality's HTTP authorization fields (`scheme`, `host`, `addresses`, `methods`, `safeMethods`, `maxRedirects`, `maxElapsedMs`, `maxRequestBytes`, `maxResponseBytes`), and exactly one of `port` (a deployed target) or `server` (a target the runtime starts from the workspace for each call: `target`, `targetArgs`, `environmentKeys`, `portEnvironmentKey`, `readyTimeoutMs`, optional `maxOutputBytes`), plus an optional `auth` (`header`, `environmentKey`, optional `prefix`).
- A launched server starts once per call, as a command and a tool server do, so a mutation the workspace carries is the code that answers: the runtime takes a free loopback port, starts the server through eval-quality's own `nodeCommandMechanism` (its process group, its lifeline) with that port in `portEnvironmentKey`, waits until the port accepts a connection, lets the adopter's port send, and ends the group. The server starts only once the port's policy has allowed the call: the port's transport runs a `prepare` step after its first allowed decision, where the runtime starts the server, so a denied call starts nothing.
- The adopter's port lives at `<evaluation folder>/adapter/http-probe-port.mjs`, default-exports the factory and exports `nodeTransport`; the runtime starts it as a Node process of its own for each call, and its last lines hand the port to TeA's host (`cli/lib/evaluate/http-port-host.js`), since eval-quality's `dependency-direction` gate refuses a computed `import()` under `cli/`.
- A gameability probe's degenerate response answers an `api` step with `{ status, headers?, body? }` (the body as text), which goes through the adopter's port with a transport that sends nothing, so the plan and the bridge on a gameability arm read it exactly as a real answer.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Clean and seeded | the fixture's clean control and M-001 probe | conformance 19 of 19, preflight exit 0, `passed-clean-control` and `caught` | N/A |
| Unlisted address | the entry's `addresses` omit the server's | preflight exit 10, the fault's `address-not-authorized` | no server starts, no request is sent |
| Sealed-brief agent | an authorized call and an unlisted address through the bridge | authorized: recorded `evaluator-chosen` with its operation; unlisted: denied `address-not-authorized` | no server starts on denial |
| Server fault | a server that exits before it listens, or hangs mid-call | exit 12, the cause kept scrubbed, or `budget-exhausted` | every process ended |

</frozen-after-approval>

## Code Map

- `src/workflows/testarch/bmad-testarch-evaluate/assets/http-probe-port.mjs`, `http-probe-port.conformance.mjs`, `README.md` -- the templates.
- `cli/lib/evaluate/schemas/evaluation.schema.json` -- `ApiRegistryEntry` beside `RegistryEntry` and `McpRegistryEntry`, chosen by `kind`.
- `cli/lib/evaluate/http-target.js` (new) -- the adopter's port as its own process, the HTTP policy, the per-call server launch, the api port; `cli/lib/evaluate/http-port-host.js` (new) -- TeA's host inside the port's process.
- `cli/lib/evaluate/registry.js` -- api entries kept apart from commands and tool servers; `createProbePort` hands an `api` request to `http-target.js`.
- `cli/lib/evaluate/arm.js`, `records.js` -- an `api` step's request and record; the scrub of an api call's secrets.
- `cli/lib/evaluate/preflight.js`, `run.js` -- `api` driven; ceilings, inventory and `run.json`'s runner for it.
- `cli/lib/evaluate/sealed-brief-agent.js` -- `handleApi` through the trial's port; the gameability api answer.
- `cli/lib/evaluate/gameability.js`, `schemas/degenerate-response.schema.json`, `check.js` -- the api answer and the `registry`, `adapter` and `gameability` rules.
- `node_modules/eval-quality/dist/core/probe/target-policy.js` (`evaluateTarget`, `DENIAL_REASONS`), `dist/testing/probe-conformance.js` (`runEnvironmentProbePortConformance`, nineteen outcomes), `dist/ports/environment-probe-port.d.ts` (the port's four rules), `dist/adapters/command-line-adapter.js` (`nodeCommandMechanism`).

## Tasks & Acceptance

**Execution:**

- [x] templates, schema, `http-target.js`, `http-port-host.js`, registry, arm, records, pipeline, bridge, gameability, check.
- [x] `test/fixtures/evaluate-api/`, `test/test-evaluate-api.js`, package.json chain, shard weight, the `asset-import` rule and the `evaluate-templates` layer, port-totality ledger.
- [x] reference, assets README, CHANGELOG, README count, planning amendments, sprint-status.

**Acceptance Criteria:** epics.md Story 1.11; each revert check in test-design-epic-1.md's Story 1.11 table is exercised once and recorded below.

## Implementation Notes

- **Implemented directly**, as Stories 1.8 to 1.10 and 1.17 were: this build runs as a subagent of the coordinator, with the planning context loaded first. The two templates were added to the skill through `/bmad-workflow-builder` Edit, run headless to completion (`{"status":"complete","intent":"edit"}`), which copied them byte for byte from the tested drafts and wrote the assets README bullets; the lint fixes that followed were made in place and copied to the fixture.
- **The port runs as its own process.** eval-quality's `dependency-direction` gate refuses a computed `import()` anywhere under `cli/` (`dist/gates/dependency-direction.js:419`, no exemption for a dynamic import), so the in-process loader first built failed `test:direction` (`cli/lib/evaluate/http-target.js:75 "url": dynamic import() argument must be a string literal`). The runtime therefore starts `adapter/http-probe-port.mjs` with Node for each call; the template's last lines, run only under `TEA_EVALUATE_HTTP_PORT_HOST=1`, import TeA's host (`cli/lib/evaluate/http-port-host.js`) by the package's name and hand it the factory and `nodeTransport`; the host answers one newline-delimited JSON message (`hello`, or `call` with `send`/`ready`/`not-ready` for a started server, then `answer` or `fault`). The runtime holds the port file to the digest taken when it answered `hello`, caps the process's standard output and error, asks eval-quality's `evaluateTarget` itself about the target a `send` names before it starts a server, holds an answer to an `api` observation of the request, and records a fault code eval-quality does not define as `port-failure`. The protocol ships with TeA, so the adopter's file holds only the port; a port in its own process is ended at its ceiling and never shares the run's state. `preflight` and `run` ask the port for its protocol before any workspace is made and exit 10 on a port that does not start TeA's host.
- **Templates** (`assets/http-probe-port.mjs`, `assets/http-probe-port.conformance.mjs`). The factory takes `policy`, `targets`, `auth`, `transport` (`resolve`, `prepare`, `send`, `tls`) and `evaluateTarget` (defaulting to eval-quality's import); every request and every redirect hop resolves its host once (first address; a host that resolves to nothing is still denied by the policy when its scheme, host or port is not allowed), asks `evaluateTarget`, runs `prepare` once after the first allowed hop and only then starts its elapsed cap, refuses a `.` or `..` path segment, records a redirect whose Location reads as no URL as the answer, sends to the allowed address with the host in the Host header and the credentials only to the configured origin, caps elapsed time, request and response bytes and redirects (`budget-exhausted`), throws `forbidden-target` with the decision's `reason`, and validates its answer with eval-quality's `probeParsers` (`port-contract-violation`). The conformance file starts a stub per scenario and passes 19 of 19.
- **Registry** (`evaluation.schema.json`, `registry.js`, `http-target.js`). `ApiRegistryEntry` (`kind: "api"`): the authorization's fields, one of `port` or `server`, optional `auth`. `createProbePort` hands an `api` request to `createApiPort` when the registry declares HTTP targets, and to the command-line adapter (which denies it) otherwise. For a `server` entry each call takes a free port, builds the policy and targets at it, and starts the server through eval-quality's `nodeCommandMechanism` when the port's `prepare` asks (`send`, with the target eval-quality allowed, where the runtime waits for the server's connection); the server ends with the call, and an answer that arrives after it ended other than with exit code 0 is refused. `preflight` and `run` exit 10 when an `auth` key has no host value, and the port's process inherits `NODE_EXTRA_CA_CERTS`. `apiSecrets`, `toolInventory` (`<interfaceId>/<method>`), `ceilingMs` (the call's ceiling plus the ready timeout), `targetProblems` (a server's target), `degenerateHttpPort`, `sharedInterfaces` (a second HTTP entry for one interface).
- **Arms, records, bridge, gameability.** `runArm` sends an `api` step with its literal `path`, `query`, `header` (strings only) and `body` (one JSON object) and records `callInputs` and the answer's `responseStatus`, `responseHeaders` and `responseBody`. `hostEnvironmentPort` scrubs a started server's environment and the auth value. The bridge's `handleApi` matches an operation by method and a path template the path fits, passes the query string as `query`, refuses unsent a body that is not an object and a `__proto__` body or query key, and sends through the trial's port; a gameability arm answers through the port with a transport that sends nothing. The degenerate response's HTTP answer is `{ status, headers?, body? }`.
- **check.** The `adapter` rule; `registry` refuses a second HTTP entry and an HTTP entry on an interface of another kind; the `gameability` kind rule covers three kinds.
- **Boundaries.** `test:evaluate-boundaries` scans `cli/` alone and leaves `assets/` to its own `dependency-direction` layer (`evaluate-templates`: eval-quality, its conformance subpath, TeA's host by name, Node's network builtins), since the templates are adopter code whose eval-quality import resolves against the evaluation folder's install (AD-20); its new `asset-import` rule refuses a load under `cli/` that reaches `assets/`, relatively or by the package's name, so the runtime never loads a template.
- **Gaps closed on the way.** The port-totality ledger's `api` member and `environment-probe` arm, and `docs/explanation/eval-quality-roadmap.md`, said TEA authorizes no HTTP target; the arm now names `test/test-evaluate-api.js`. `registry.js`'s header said every entry has the one `RegistryEntry` shape. `preflight.js`'s interface refusal became unreachable (the schema admits `cli`, `api` and `mcp` only) and is gone; `test:evaluate-preflight`'s api case now asserts an api evaluation with no HTTP target runs with no port. `test:evaluate-evaluators`' bridge case numbers the api call as a sent call.
- **Fixture.** `test/fixtures/evaluate-api/`: `server/grader.js`, a plain Node HTTP service on `PORT`, `GET /grade?answer=` and `GET /policy`, logging each start and request to `GRADER_LOG`, requiring the auth header when `GRADER_TOKEN` is set, echoing `GRADER_SECRET` and the token for the scrub cases, and `start: fail`, `hang: <path>` and `verdict: accept` policy lines; `evals/grader/`, a `copy` workspace with a clean control and M-001's seeded probe, and the rendered adapter. The test links the copied evaluation folder's `node_modules` to eval-quality and this package, standing in for its own install.

## Spec Change Log

- 2026-09-25: the frozen block's decisions on how the runtime reaches the port and when a server starts were rewritten by the build agent, which holds those decisions: the in-process loader first written failed `test:direction`, and the round 1 review moved the server's start to the port's `prepare` step.
- 2026-09-25: epics.md Story 1.11's first criterion amended: the runtime starts the port file as its own process for each call and TeA's host serves the call, since eval-quality's `dependency-direction` gate refuses a computed `import()` under `cli/`; `preflight` and `run` exit 10 on a port that does not start the host. The `/bmad-workflow-builder` Edit clause stands: the builder ran headless to completion.
- 2026-09-25: epics.md Story 1.11's grep criterion amended, with its test-design row: the conformance file's four denied-class samples are the only range literals either template holds, each of the class eval-quality's `classifyAddress` gives it, since eval-quality's conformance subject needs one request per denied class.
- 2026-09-25: epics.md Story 1.11 gains an added criterion for the HTTP registry entry, the per-call server, the record projection, gameability over an HTTP step, the `check` rules and the scrub, with a test-design row and its revert checks; the bridge row's test is amended (an agent names a path, never an address, so the unlisted address is a router over an entry whose addresses omit the service's).
- 2026-09-25: epics.md Story 1.33 and its test-design row amended: Story 1.11 delivers the `api` kind's reason in a qualification, a leg, a trial and a bridge call; the reference section stays Story 1.33's.
- 2026-09-25: ARCHITECTURE-SPINE.md AD-4 and AD-21 gain a Story 1.11 amendment: the HTTP entry, the port as its own process, the per-call server, the record projection, the bridge's `api` routing.
- 2026-09-25: Story 1.36 (hold an HTTP entry to eval-quality's own target-policy parser) appended to Epic 1 from the gap this build found, with a test-design section, an Epic Dependencies row, the overview's and the Epic List's counts, and a `backlog` row in sprint-status.yaml.
- 2026-09-25, build review round 1: Story 1.37 (know a started HTTP server by the port it bound itself) appended to Epic 1 from findings C4 and A5, with a test-design section, an Epic Dependencies row, the counts and a `backlog` row; the added criterion of Story 1.11 names the round's fixes (the runtime's own `evaluateTarget` before a server starts, the cap after the server accepts a connection, the answer after an abnormal end refused, the auth value required, the bridge body and the dot segments).

## Review Triage Log

### Build review round 1 (code review C, test review T, adversarial A; all opus, on the uncommitted tree over eval-quality 4.2.0)

Every row was verified against the code before its verdict.

| ID | Verdict | Finding | Resolution |
| --- | --- | --- | --- |
| C1 | high, fixed | a bridge body that is not an object is sent and recorded, and eval-quality's `callInputs.body` admits only an object, so the run's sealing failed with exit 12 | `handleApi` refuses a body that is not a plain object unsent, and the bridge's `api` call shape declares `body` an object; router case (`takes body as an object`) |
| C2, A2 | medium, fixed | a started server's start was charged against `maxElapsedMs`, since the template armed its cap before the transport's send waited for the server | the template's transport gains `prepare`, run once the policy allowed the first hop and before the cap starts; the host starts the server there; units (a prepare slower than the cap, a denied call preparing nothing) and a pipeline case over a service that starts in 1.2 s under an 800 ms cap |
| C3 | low, fixed | an auth key with no host value sent every call unauthenticated, and the 401s read as the target's behavior | `preflight` and `run` exit 10 naming the key (`missingCredentials`); case `auth-unset` |
| C4, A5 | medium, fixed in part, later story | the free port is released before the server binds, so another process can take it and answer | an answer that arrives after the call's server ended other than with exit code 0 is refused (`port-failure`), a unit whose mechanism's port is taken by another listener; the window before the server's end is reported stays, and Story 1.37 (the server binds port 0 and reports it) is appended; the reference states the window |
| C5 | low, fixed | the cause of a server that died mid-call said it exited "before it accepted a connection", and a crash not yet reported left the socket's error as the cause | the account names whether the server had accepted a connection, and a failed call waits up to 250 ms for the server's end; case `crash-mid-call` |
| C6 | low, fixed | a port process that could not start or answer in time was exit 10 | `HttpPortError` carries exit 12 for a spawn error or a timeout, exit 10 for a port that answers outside the protocol |
| C7, A9 | low, fixed | an https target behind a private authority could not be reached: the port's process received `PATH` alone | the port's process inherits `NODE_EXTRA_CA_CERTS`; the reference says so. A proxy stays unsupported: the port sends to the address eval-quality allowed, which a proxy would replace |
| A1 | medium, fixed | a path value of `.` or `..` (or `%2e%2e` through the bridge) made the URL resolve another path than the one recorded | the template refuses a `.` or `..` segment (`%2e` counting as a dot) with `schema-parse-failure`; unit and router case |
| A3 | medium, fixed in part | a redirect's host is resolved before the policy decides, so an unresolvable host the policy does not name read as `port-failure` | a resolve failure asks `evaluateTarget` over the target with no address, and its denial is recorded when it is not the address's, so an unlisted host is `forbidden-target`; the lookup itself stays, since the target can resolve any name itself and the port runs no sandbox; units for both hosts |
| A4 | medium, fixed | a malformed `Location` escaped as `ERR_INVALID_URL`, recorded as the fault's code | a redirect whose Location reads as no URL is the target's answer, recorded; a fault code eval-quality does not define is recorded as `port-failure`; unit and case `port-throws` |
| A6 | low-medium, fixed | the runtime trusted the port process to name an allowed target before starting a server, and to answer with an observation of the request | the runtime asks eval-quality's `evaluateTarget` itself before it starts a server, and holds an answer to an `api` observation correlated with the request (`port-contract-violation` otherwise); case `port-lies` |
| A7 | low, fixed | the port process's standard output was unbounded | six bytes per answer byte plus 1 MiB, `PortProcessError` past it; case `port-flood` |
| A8 | low, fixed | each call started the live port file while `run.json` recorded the digest taken once | each call holds the file to that digest and stops the call (`port-failure`) on a change; unit |
| A10 | low, fixed in part | a status past 599 was reported to the agent as a call that could not be sent | the bridge says the answer cannot be recorded; a target that hangs or redirects past its cap stays a cap (exit 12), which eval-quality's port rules make a thrown `budget-exhausted`, as for a command and a tool server |
| A11 | low, fixed in part | `check` does not hold a started server's address to loopback, and its message named a conformance file it does not check | the message names the port alone; the address is skipped: a remote address fails loudly at readiness (exit 12), and naming loopback would copy eval-quality's address classes into `check` |
| T1 | high, fixed | nothing failed when a call left its server running, since the lifeline ends it when `tea-evaluate` exits | an in-process call asserts one server start and no server or port process left once it answered |
| T2 | medium, fixed | the sealed-brief and gameability checks counted requests alone, so a server started for a denied call went unseen | server starts are counted too |
| T3 | medium, fixed | only the query channel was ever recorded non-null | a `runArm` unit binds path, header and body; a router case matches a path parameter and a repeated query key |
| T4 | medium, fixed | a hanging or misbehaving port process had no case | cases for a port whose call never settles (exit 12, no port process left), one handing no factory, one writing outside the protocol, one flooding its output, one throwing an undefined code; `PORT_START_ALLOWANCE_MS` lowered from 30 s to 15 s |
| T5 | medium, fixed | a deployed entry never went through a call | a unit sends through `createProbePort` to a deployed entry: its auth header arrives and nothing starts |
| T6 | low, fixed | the conformance template's range literals were checked as dotted quads alone | with the sample lines removed, `RANGE_LITERAL` must match nothing |
| T7 | low, fixed | record loops had no length guard | each asserts `TRIALS` records |
| T8 | low, fixed | neither `port` nor `server`, and a linked port file, had no `check` case | two `check` rows |
| T9 | low, fixed in part | (a) the free-port race: C4; (b) `livingSessions` reads EPERM as alive; (c) the hang ceiling had to cover the server's start | (b) skipped: the pids are the fixture's own and are checked seconds after they start, as the MCP test does; (c) moot once the cap starts after `prepare` |
| T10 | low, fixed | the secret scan left out `score`'s output | `scoreRun` returns it and the pipeline and sealed-brief runs scan it |

### Build review round 2 (bounded to the round 1 fixes and material defects; opus)

Every round 1 fix was checked against the code; the sound ones hold (C1, C3, C5 under 2x CPU oversubscription 25 of 25, C7, A1, A3, A4, A7, A8, A10, T1 to T10, no process or workspace left after a failed preflight, a genuine answer followed by exit 1 recorded 20 of 20).

| ID | Verdict | Finding | Resolution |
| --- | --- | --- | --- |
| R2-1 | medium, fixed | the squatter was recorded in 10 of 10 runs: readiness passed against a process holding the port before the server even started, and the reference overclaimed | the call's server is refused when the port already accepts a connection before it starts (`another process listens on ...`), a `callServer` unit; the reference names the window left after that check, which Story 1.37 closes |
| R2-2 | medium, skipped with reason | a port that answered `hello` and breaks the protocol during a call exits 12 | AD-10 classes an evaluation-layer process that emits output outside its contract as exit 12, which is this case: the port is the evaluation's code, running as its own process; the reference and CHANGELOG now say so |
| R2-3 | low, fixed | `prepare` ran before the request-size cap, so a server started for a request never sent | the cap is checked before `prepare`; the prepare unit asserts an oversize body prepares nothing |
| R2-4 | low, fixed | the runtime's own decision took the method, scheme, host and port from the port's `send` | it takes the configured target and the request's method, the address alone from the port; a unit over a port that allows everything and names `GET` for a `DELETE` |
| R2-5 | low, fixed | the reference and CHANGELOG named exit 10 alone for the port's `hello` | both name exit 12 for a process that cannot start or answer in time |

Reverts: the held-port check dropped, "a port another process holds gave a started server"; the size cap moved after `prepare`, the prepare unit recording a second preparation; the port-named method used, "a DELETE a permissive port allowed gave undefined" (the call answered).

### Builder Analyze (skill gate)

`/bmad-workflow-builder` Analyze ran headless on `src/workflows/testarch/bmad-testarch-evaluate/` after the templates were added: zero critical and zero high findings, six medium and nine low; its report and memlog, gitignored, were removed after reading, since `lint:md` scans the report.
Its pre-pass raised three high flags, each dropped by the architecture lens against the files: the `**Goal:**`/`**Role:**` header all ten testarch skills use, the gitignored `.memlog.md`, which `test/test-installation-components.js` holds out of the package, and `SKILL.md`'s definition of `{project-root}`, which must name `_bmad/`.
The one medium on this story's content (the README did not say where the port's imports resolve from) is fixed; the other five mediums and nine lows are on `SKILL.md`'s placeholder stages, which Stories 1.12 to 1.14 write.

### Revert checks exercised

Each change was undone once in a scratch worktree (`git worktree add --detach`, `npm ci`, the story's files copied in, a script patching one file and restoring it from the checkout, `cmp` clean after), the named test run, and the failure observed.
The test-design table's checks first, then those the added criterion and the build review add.

- Port template calls `evaluateTarget`: a port deciding locally (the first authorization of the interface taken as allowed), 25 failures, among them "one request made 0 decision(s) and 1 send(s)" and "a request redirected three times made 0 decision(s) and 4 send(s); expected 4 of each".
- Grep for copied classification: a range list pasted into the port template, "the port template holds range literals of its own: [\"10.0.0.0\",\"192.168.\"]" and the CIDR pattern named.
- Conformance over a loopback stub: the stub's target pointed at `https://example.com:443`, "the conformance file ran to exit 1; expected 19 passing outcomes".
- Loopback fixture pipeline: a server started from the registry root in place of the call's workspace, "the service ran outside its workspace ...: [{\"event\":\"listen\",...\"workspace\":\"qualify-P-002\",\"scriptWorkspace\":\"pristine\"...".
- The bridge through the adopter's port: the bridge's `api` call sent through a command-line adapter over no authorization, "a sealed-brief run over the HTTP fixture exited 12; expected 0" and the gameability router answering "interface-not-authorized".
- The added criterion: the auth header dropped, 8 failures, among them the configuration's `auth: {}` and "preflight over the HTTP fixture exited 11; expected 0"; the server started before the policy decides, "a denied request started the service: [{\"event\":\"listen\"..." in the qualification, a leg, a trial and the bridge; an HTTP answer left unscrubbed, 17 failures, among them the secret in P-001's records; the query recorded as null, 22 failures; the `adapter` rule dropped, "a folder with no HTTP port: check exited 0"; the `asset-import` rule dropped, "the scanner missed a runtime module importing the skill's HTTP port template".
- Build review round 1: a body that is not an object sent, the router case recording it; the cap started before `prepare`, "a prepare step slower than the cap gave budget-exhausted" and "a service slower to start than the request's cap: preflight exited 12; expected 0"; dot segments sent, "a path value of .. gave {...\"status\":200...}"; a resolve failure read as `port-failure` alone, "a redirect to an unlisted, unresolvable host gave port-failure/undefined"; a malformed Location followed, "gave \"Invalid URL\""; the runtime starting what the port names, the `port-lies` case's server started; an answer after the server ended taken, "an answer from another process on the call's port gave 200"; a changed port file served, "a port file changed during the run gave undefined"; the standard output ceiling dropped, "port-flood ... expected 10 naming \"wrote past its standard output ceiling\""; a missing auth value let through, "preflight exited 0; expected 10"; the server's account always "before it accepted a connection", the squatter unit and "a service exiting mid-call" failing; an undefined fault code kept, "the fault {...\"code\":\"ERR_BOOM\"..."; the call's `server.stop()` removed, "an allowed in-process call answered 200 and left [7788] running".

## Verification

**Commands:**

- `npm run test:evaluate-api` -- expected: every case passes over real eval-quality 4.2.0.
- `npm test` -- expected: green.

**Results:**

- the Build Rules engine check -- exit 0 at the start and at the end on eval-quality 4.2.0; `git diff -- package.json package-lock.json` names no `file:` or `.tgz` spec (neither file's dependencies changed)
- `npm run test:evaluate-api` -- 170 checks over the real eval-quality 4.2.0, about 60 s (about 66 s under c8 locally; shard weight 82, about 1.25 times that)
- `test:evaluate-check` 586, `-boundaries` 306, `-preflight` 232, `-mutation` 423, `-run` 389, `-arms` 272, `-evaluators` 510, `-mcp` 154 checks, `test:evaluate-guidance`, `test:port-totality`, `test:install` -- exit 0
- `npm run test:direction`, `test:doc-claims`, `test:doc-counts`, `test:boundary`, `test:ci-coverage` (eighty-eight chained steps), `test:shards`, `test:release-metadata`, `lint`, `lint:md`, `format:check`, `docs:validate-links` -- exit 0
- `npm run docs:build` -- exit 0; `llms-full.txt` measures 500,879 characters against the 600,000 cap (the reference stays out of it)
- skill gates -- `/bmad-workflow-builder` Edit headless to completion, Analyze headless with 0 critical and 0 high; no registration change, so no Validate Module
- `npm run eval:preflight` -- exit 2, 0 legs run and 190 answered from the cache, with the six test-design moves Story 1.27 owns (P-008 to P-010 pass where the baseline records `seeded-fault-fired`; P-012 to P-014 fail `seeded-faults-scoped`), as Stories 1.10 and 1.17 recorded
- `npm test` -- the whole chain runs in this commit's pre-commit hook
