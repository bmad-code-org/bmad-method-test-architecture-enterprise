---
title: 'Story 1.10: Evaluate a stdio MCP tool server'
type: 'feature'
created: '2026-09-25'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'c8f7b9c7691b1702da0b669d818d6475d56825bb'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Stories 1.10, 1.11, 1.17, 1.31, 1.33)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.10 section, the Story 1.17 rows naming 1.10)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-1, AD-4, AD-6, AD-7, AD-8, AD-10, AD-21)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.17.md (the bridge, the evaluator layer rule)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** `tea-evaluate` drives command targets only: its registry builds `CommandTargetAuthorization`s, its arm executor refuses a non-command step, and the sealed-brief bridge sends every `mcp` call to eval-quality's MCP adapter over no authorization, so an adopter whose system under test is a stdio MCP tool server cannot be evaluated.

**Approach:** the registry gains an MCP entry shape that the runtime turns into eval-quality's `McpTargetPolicy` for each workspace, validated through `parseMcpTargetPolicy` and run through `createMcpAdapter`; every leg, qualification arm, trial, gameability arm and bridge call of an `mcp` interface goes through that one port, and what comes back is recorded in eval-quality's own sealed shape (arguments in, structured result as `response-body`, the error flag as `response-status`).

## Boundaries & Constraints

**Always:** eval-quality decides every allow or deny (AD-1): no TeA file compares a tool name with a list; `engine.js` stays the one file that loads eval-quality; every run-directory write goes through `run-directory.js`; every temp directory a trial makes is on the pipeline's scratch list; a denial is recorded with eval-quality's `reason` where the fault carries one, for every kind alike, and no TeA file parses the detail text.

**Never:** an `api` registry entry or HTTP port (Story 1.11); `captured`, `matcher` or `principal` bindings (Stories 1.18, 1.30); a file-system sandbox (Story 1.31); an MCP transport other than stdio; an MCP SDK or any new dependency.

**Decisions (build agent, owner-delegated):**

- A registry entry with `kind: "mcp"` is an `McpRegistryEntry` (`interfaceId`, `target`, `targetArgs`, `tools`, `environmentKeys`, `maxElapsedMs`, optional `maxOutputBytes`); an entry with no `kind`, or `kind: "cli"`, is the command entry it always was. `cwd` is the workspace the leg or trial runs in, and `serverEnvironment` is the host's values for `environmentKeys`, scrubbed from every observation as a command entry's are.
- One interface is one kind: `check` refuses two MCP entries for one interface, a command and an MCP entry sharing one, an entry whose kind differs from the kind the contract declares for its interface, and an MCP entry `parseMcpTargetPolicy` refuses (all under `registry`).
- A gameability probe over an `mcp` step commits `{ isError, structuredResult }` for it; the bridge answers a gameability arm's tool call through `createMcpAdapter` over the same authorizations with a mechanism that starts nothing.
- The fixture server is a plain Node script speaking newline-delimited JSON-RPC, with no SDK.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Clean and seeded | the fixture's clean control and M-001 probe | preflight exit 0, `passed-clean-control` and `caught` | N/A |
| Tool removed | the plan's tool dropped from the entry's `tools` | preflight exit 10, the leg's fault carries `tool-not-authorized` | no server starts |
| Sealed-brief agent | a listed, an unlisted and an undeclared tool through the bridge | listed and declared: recorded `evaluator-chosen`; listed, undeclared: answered, unrecorded; unlisted: denied with its reason | no launch on denial |
| Server fault | a server that cannot start or refuses the handshake | exit 12, the fault recorded | N/A |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/schemas/evaluation.schema.json` -- `RegistryEntry` (command) and the new `McpRegistryEntry`, chosen by `kind`.
- `cli/lib/evaluate/registry.js` -- `createRegistry`: `commandTargetPolicy` over command entries only, new `mcpTargetPolicy`, `createProbePort` dispatching by request kind, `targetProblems` and the host environment for both kinds, `registryProblems` holding one kind per interface.
- `cli/lib/evaluate/arm.js` -- `runArm` sends an `mcp` step; `hostEnvironmentPort` scrubs a server's environment; a shared fault record keeps `reason`.
- `cli/lib/evaluate/records.js` -- `recordObservation` takes `responseBody` and `responseStatus`.
- `cli/lib/evaluate/preflight.js` -- admits `interface: "mcp"`; `recordingPort` and the leg outcome keep `reason`.
- `cli/lib/evaluate/run.js` -- tool inventory, observed calls, step ceilings and `run.json`'s runner for both kinds; trial faults keep `reason`.
- `cli/lib/evaluate/sealed-brief-agent.js` -- `handleMcp` through the trial's port, the gameability MCP port, the result text.
- `cli/lib/evaluate/gameability.js`, `schemas/degenerate-response.schema.json`, `check.js` -- an `mcp` step's degenerate response, and the `registry` rules.
- `node_modules/eval-quality/dist/adapters/mcp-adapter.js`, `mcp-target-policy.js`, `core/schemas/port-messages.js` -- the adapter, the policy, `McpProbeRequest` and `McpProbeObservation` (`isError` carried as `responseStatus` 1 or 0).

## Tasks & Acceptance

**Execution:**

- [x] `cli/lib/evaluate/schemas/*`, `registry.js`, `arm.js`, `records.js` -- the MCP entry, the policy and the port.
- [x] `preflight.js`, `run.js`, `gameability.js`, `sealed-brief-agent.js`, `check.js`, `historical.js` -- every leg, arm, trial and bridge call over `mcp`, and the denial reason.
- [x] `test/fixtures/evaluate-mcp/`, `test/test-evaluate-mcp.js`, package.json chain, shard weight.
- [x] `docs/reference/tea-evaluate-cli.md`, CHANGELOG, README count, planning amendments (Story 1.33), sprint-status.

**Acceptance Criteria:** epics.md Story 1.10; each revert check in test-design-epic-1.md's Story 1.10 table is exercised once and recorded below.

## Implementation Notes

- **Implemented directly**, as Stories 1.8, 1.9 and 1.17 were: this build runs as a subagent of the coordinator, with the planning context loaded first.
- **Registry** (`registry.js`, `evaluation.schema.json`). `registry` items choose their definition by `kind` (`if`/`then`/`else`): `McpRegistryEntry` for `kind: "mcp"`, `RegistryEntry` (which now admits an optional `kind: "cli"`) otherwise, so every existing folder validates unchanged. `createRegistry` keeps command and tool-server entries apart: `commandTargetPolicy`, `targetFor`, `hostEnvironment` and `permittedEnvironmentKeys` read command entries only (a tool server's missing `executable` no longer matches an `undefined` one), `mcpTargetPolicy` builds the `McpTargetAuthorization`s for a workspace (`cwd`, the target joined to the workspace root, `serverEnvironment` from the host's values for the entry's keys, 8 MiB output default), and `createProbePort` hands an `mcp` request to `createMcpAdapter` over `parseMcpTargetPolicy`'s copy and anything else to `createCommandLineAdapter`, each denying what its policy does not grant. `toolInventory` and `ceilingMs` give `run.js` both kinds. `sharedInterfaces` and the async `mcpRegistryProblems` (the entries through `parseMcpTargetPolicy` with a placeholder `cwd`) feed `check`'s `registry` rule.
- **Arms and records** (`arm.js`, `records.js`). `runArm` sends an `mcp` step as `{ kind: 'mcp', toolName, channels: { arguments } }` from its literal `arguments` bindings, and records it as eval-quality's `McpProbeObservation` names the projection: `callInputs.arguments`, `responseBody` from the structured result (`bodyValue`), `responseStatus` 1 or 0 from `isError`, no stream, exit code or artifact. A port answering in another member than the request's is an `ArmError` (exit 12). `hostEnvironmentPort` scrubs a server's environment values from what comes back, as it scrubs a command's injected ones; `persistableRequest` leaves a tool call's request as it is, since it carries no environment channel.
- **Denial reason.** `faultRecord` records `{ code, reason?, message }` for every fault, the `reason` read from eval-quality's `RuntimeFault` and never from its message, and `reasonNote` names it in the exit-10 messages of a leg, a qualification arm (clean, mutated, historical) and a trial; the bridge records `{ code, reason, detail }`. Nothing excludes a kind.
- **Pipeline** (`preflight.js`, `run.js`, `historical.js`, `mutation.js`). `preflight` and `run` drive `cli` and `mcp` evaluations and still refuse `api` (exit 12) until Story 1.11. The isolation manifest's allow list and observed calls name a tool call `<interfaceId>/<tool>` (`callLabel`), the step ceilings read the server's `maxElapsedMs`, and `run.json`'s `runner` names a tool server's `target`, `targetArgs` and `tools`.
- **Bridge** (`sealed-brief-agent.js`). An `mcp` call goes through the trial's port, so the registry's authorization for the arm's copy decides it; the operation it matches is the one declaring its tool name, a listed tool no operation declares is answered unrecorded, and its result shows what was sent and the tool's `isError` and structured result. The command and tool-call paths share `send`, which classifies a denial, a stop, a call that cannot be sent and an infrastructure fault once. On a gameability arm `degeneratePort` builds eval-quality's command-line or MCP adapter over the registry's authorizations with a mechanism that starts nothing; when the degenerate response answers no call of the kind, the mechanism throws `UnansweredCall` after the policy has decided, so an unlisted tool is still denied as on a real arm.
- **Gameability** (`gameability.js`, `degenerate-response.schema.json`, `check.js`). A step's response is a command's `{ stdout, stderr, exitCode }` or a tool call's `{ isError, structuredResult? }` (`oneOf`); the synthetic port answers by the request's kind and refuses a response of the other kind, and `check` refuses it under `gameability`.
- **Fixture.** `test/fixtures/evaluate-mcp/`: `server/grader.js`, a stdio MCP server in plain Node (no SDK) publishing `grade_answer`, `describe_policy` and `reset_ledger`, logging every handshake and call to `GRADER_LOG`, and reading `rules/policy.txt` from its working directory; `evals/grader/`, a `copy` workspace with a clean control and M-001's seeded probe. The MCP stub agent lives beside Story 1.17's at `test/fixtures/evaluate/evaluators/stub-mcp-agent.js`, outside the evaluated project.
- **Gaps closed on the way.** The port-totality ledger's `mcp` member and `mcp-probe` arm reasons said TEA authorizes no tool server, and `docs/explanation/eval-quality-roadmap.md` repeated it; both now say TEA's own contracts measure none and `tea-evaluate` hands an adopter's server to `createMcpAdapter` unwrapped, whose use `test:evaluate-mcp` holds (the arm would certify the package's own adapter). `eval-quality.config.json`'s doc-claims `foreign` list gains `createMcpAdapter`, `parseMcpTargetPolicy` and `McpTargetAuthorization`. The README's chain count moved to eighty-seven. `test:evaluate-preflight`'s refused-interface case moved from `mcp` to `api`, and it now asserts a `cli` leg's `interface-not-authorized`; `test:evaluate-evaluators` asserts `executable-not-authorized` and each bridge denial's reason.

### Revert checks exercised

Each change was undone once in a scratch worktree (`git worktree add --detach`, `npm ci`, the story's files copied in), `node test/test-evaluate-mcp.js` run, the failure observed, and the file restored byte for byte from the checkout.
The test-design table's checks first, then the ones review added.

- `McpTargetAuthorization` built and preflight passes: the combined port reverted to the command adapter alone, "preflight over the MCP fixture exited 10; expected 0", every leg denied "this adapter runs cli requests only"; a server logging no handshake (the fixture's `initialize` line removed, as a command shim would), "the server logged 0 handshake(s) for 8 call(s)".
- Clean `passed-clean-control`, mutated `caught`: the record projection's `responseBody` dropped, "preflight over the MCP fixture exited 11; expected 0" (the clean baseline is not attempted), and the sealed-brief and gameability runs exit 11 with it.
- Tool removed yields `tool-not-authorized`: an authorization that grants the plan's tool whatever the entry lists, "preflight with the tool removed exited 0; expected 10"; `faultRecord` without `reason` (on 4.2.0), "the removed tool's qualification fault is {...\"code\":\"forbidden-target\",\"message\":...}" and each leg's fault the same.
- The bridge through the arm's authorization: `handleMcp` left on `createMcpAdapter({ authorizations: [] })`, "a sealed-brief run over the MCP fixture exited 12; expected 0" (the stub's recorded call became a denial and the agent could cite nothing); the bridge's denial without `reason`, "the agent was told {...tool \"reset_ledger\" is not among the authorized tools...}" and the calls list reading `denied:forbidden-target:undefined`.
- Gameability over a tool call: the synthetic port's tool-call branch removed, "the synthetic port answered {...\"kind\":\"cli\"...}" and "a gameability run over the MCP fixture exited 12; expected 0"; the gameability router built on the command adapter alone, "the gameability router answered [{\"text\":\"denied by the evaluation's target policy: ... this adapter runs cli requests only..."; the server's environment left unscrubbed, "a tool server's environment reached the observation" and every record carrying the secret.
- `check` rules: `sharedInterfaces` dropped, "a command sharing the tool server's interface: check exited 10; expected 10 under registry naming \"names interface \\\"grader\\\" as cli\"" (the parser still refused the policy, so only the named finding moved); `checkRegistryKinds` dropped, "a command entry for an mcp interface: check exited 0"; `mcpRegistryProblems` dropped, "a tool name eval-quality refuses: check exited 0"; the degenerate response's kind rule dropped, the case's named finding gone; the `interface` rule dropped, "an interface kind the contract does not declare: check exited 0"; the `targetArgs` pattern dropped, both argument cases "check exited 0".
- A trial's server resolved against the registry root in place of the workspace (`projectRoot` omitted in `runTrial`), "a session of the server ran outside its workspace: [{...\"workspace\":\"trial-clean-1\",\"scriptWorkspace\":\"pristine\"...".
- Review fixes: keys left unscrubbed, "...\"grader-secret-value-0123\":\"as a key\"..."; the fault's cause not kept, "a server refusing its handshake is recorded as {...\"code\":\"port-failure\",\"message\":\"...the underlying mechanism threw or rejected\"}"; the `__proto__` refusal removed, `a call carrying a __proto__ key was answered {...recorded":true...} and recorded 2 observation(s)`.

## Spec Change Log

- 2026-09-25: epics.md Story 1.10 gains a criterion (added in Story 1.10) for the tool-server registry entry, the record projection, gameability over a tool call, the `check` rules, the key scrub, the fault's cause and the `__proto__` refusal, so the plan names what the story built beyond its four criteria.
- 2026-09-25: epics.md Story 1.33 amended (Engine consumption and its first criterion): eval-quality 4.2.0 carries the reason and Story 1.10 raised the floor to it and records the reason for every kind in the bridge, legs, qualifications and trials, with the cases that assert it; Story 1.33 keeps the `api` kind through Story 1.11's port and the reference section naming every code.
- 2026-09-25: epics.md Story 1.4's peer floor, test-design-epic-1.md's Story 1.4 row, ARCHITECTURE-SPINE.md AD-5 and the Stack table, and eval-quality-facts.md move to `>=4.2.0`, dated in place.
- 2026-09-25: ARCHITECTURE-SPINE.md AD-4 and AD-21 gain a Story 1.10 amendment: the tool-server registry entry and its authorization, the record projection, the bridge's `mcp` routing and the recorded reason.
- 2026-09-25: test-design-epic-1.md's Story 1.10 table gains a row for the added criterion and its revert checks; its Story 1.33 row says what Story 1.10 delivered.
- 2026-09-25, final review round 1: Story 1.35 (judge a tool server that crashes mid-call) appended to Epic 1, with a test-design section, an Epic Dependencies row, a `backlog` row in sprint-status.yaml and the overview's story count (forty); the reference states the `mcp` limit it closes (S12).
- 2026-09-25, final review round 1: epics.md Story 1.10's added criterion names the scrub of numbers, JSON-escaped values and a cut cause; the Story 1.33 amendment and its test-design row name the trial `test:evaluate-mcp` now asserts (S10); the Story 1.10 test-design row gains the new cases and revert checks.
- 2026-09-25, final review round 1: ARCHITECTURE-SPINE.md AD-13's Rule, epics.md Story H.1's engine status and epic-1-context.md name the `>=4.2.0` floor (S11).

## Review Triage Log

### Build review round 1 (code review C, test review T, adversarial A; all opus, on the uncommitted tree over eval-quality 4.1.4)

Every row was verified against the code before its verdict.

| ID | Verdict | Finding | Resolution |
| --- | --- | --- | --- |
| C1 | medium, fixed | `sharedInterfaces` refused two tool servers for one interface, a copy of `McpTargetPolicy`'s own rule (AD-1), so `check` reported it twice | the branch is gone; eval-quality's `parseMcpTargetPolicy` refuses it at `check` and in `createProbePort`, and the unit asserts `registryProblems` leaves it alone while the port throws `schema-parse-failure`; the schema's description credits eval-quality |
| C2, A2 | medium-high, fixed | `scrub` rewrote strings and left object keys, and a tool's structured result is an object, so a secret as a key reached 22 run files | keys are scrubbed as strings are, a collision keeping both fields with a number; unit with a secret as a key and inside a key; the reference states the limits (values of eight characters or more, a value the server splits is not caught) |
| C3 | low, fixed | a fault kept only eval-quality's generic `port-failure` message, the same for every way a server fails | `hostEnvironmentPort` keeps the fault's cause scrubbed (`scrubbedCause`), `faultRecord` records it as `cause`, and the exit-12 messages name it; the handshake case asserts the cause in the fault and the output |
| C4 | low, fixed | the schema said a caller may lower a server's ceilings per run, and `mcpTargetPolicy` takes no override | the sentence is gone from both descriptions; no runtime path passes an override |
| C5 | low, fixed | reference passages and a comment still described commands alone (the corpus line, the runner, the legs' adapter, the environment, the isolation manifest) | each corrected |
| A1 | high, fixed | the Story 1.33 amendment said the floor rose to 4.2.0 while package.json held 4.1.4 | eval-quality 4.2.0 was published during the build; the devDependency, the peer floor, the lockfile, `guard-publish`, `test:release-metadata`, `test:guard-publish`, the engine hint, the doc-claims pin and the docs moved to 4.2.0 |
| A3 | medium-high, fixed | `targetArgs` could name the adopter's live file (`node /abs/grader.js`), so a mutation of server code never ran and the digest described bytes that did not run | the schema refuses an absolute argument, one after `=`, and a `..` segment; two `check` cases; the reference says why |
| A4 | medium, fixed | an agent's arguments with an own `__proto__` key were recorded while eval-quality's parser dropped it before sending | `handleMcp` refuses such a call unsent, at any depth; router case |
| A5 | medium, skipped | the registry can grant a tool no operation declares, and an agent's call of it runs unrecorded | AD-21's design for every kind (a command the contract does not declare runs the same way): the call is in the trial's evidence, which each record's `actionsArtifact` digests, and in the isolation manifest's observed calls |
| A6 | low, fixed | `evaluation.json`'s `interface` was no longer held to the contract | `check` refuses an `interface` no contract interface declares (`reference`); `test:evaluate-preflight` now drives its api refusal over a contract that declares an api interface, and asserts the new refusal |
| A7 | low, skipped | a result nested about 3000 levels overflows `scrub`'s stack, exit 12 | eval-quality admits values 1024 levels deep at most (`MAX_NESTING_DEPTH`), so such a result can never be sealed and exit 12 is the outcome either way |
| A8 | info, fixed in docs | a text-only tool result is recorded with an absent body | eval-quality's `mcp` kind describes a structured result; the reference says so |
| A9 | later story | a server's detached child writes into the project after `preflight` exits | Story 1.31's criterion confines every process the target starts, those still running after it exits included |
| T1 | medium, fixed | the handshake case could not tell a refusal from a server that never started | it asserts the server logged the `2025-06-18` handshake and no call |
| T2 | medium, fixed | nothing failed when `createProbePort` skipped `parseMcpTargetPolicy` | a unit whose refused tool name makes `createProbePort` throw `schema-parse-failure` |
| T3 | low, fixed | resolving the server into the workspace was guarded by a unit alone | the fixture logs the workspace its script started from, and the pipeline asserts it is the session's own; revert observed |
| T4 | low, fixed | the gameability router's no-launch assertion could not fail | `GRADER_LOG` is set in the test process around the router calls |
| T5 | low, fixed | the fixture's `verdict: accept` line was dead | a case where the server accepts every answer exits 11 (the mutated arm holds) |
| T6 | low, fixed | the fixture needs `node` on the host PATH | the fixture's header says so; the handshake case now shows a server that never started |
| T7 | info, fixed | a comment miscounted the trials' server starts | per-tool counts asserted (`grade_answer` 12, `describe_policy` 6) |
| T8 | info | `test:evaluate-preflight` also failed on `reason` under 4.1.4 | expected; green on 4.2.0 |

### Build review round 2 (bounded to the round 1 fixes and material defects; opus, on the tree over eval-quality 4.2.0)

Every round 1 fix was checked against the code; the sound ones hold (the key scrub keeps an own `__proto__` key as an own key, legitimate arguments such as `-y`, `@scope/pkg`, `--port=3000`, `./server.js` and `x..y` pass the `targetArgs` pattern, the `reference` rule fires on no existing fixture, the reasons reach every exit-10 message and bridge record).

| ID | Verdict | Finding | Resolution |
| --- | --- | --- | --- |
| R2-1 | medium, fixed | a sealed-brief bridge call's fault kept no cause, so the CHANGELOG, reference and plan claims did not hold there | the bridge fault records `cause` and the run's stop names it; a router case over a server that refuses its handshake. Revert (the cause dropped): "a bridge call to a server refusing its handshake recorded [...\"fault\":{\"code\":\"port-failure\",...}]" |
| R2-2 | low, fixed | the `targetArgs` pattern is a deny list and the CHANGELOG said every file the server runs is the workspace's copy; a `file:` URL passed | the pattern also refuses a `file:` URL, and the CHANGELOG, reference and plan name the refused forms and no more; a `check` case. Revert: "a tool server argument naming a file URL: check exited 0" |
| R2-3 | low, fixed | a plan step's literal carrying an own `__proto__` key was recorded while eval-quality's parser dropped it, and a top-level one set the prototype | `literalValues` stops the arm (exit 12) on a `__proto__` key at any depth, for every channel; `carriesPrototypeKey` moved to `arm.js` and serves the bridge too. Revert: `a plan literal carrying a __proto__ key gave null` |
| R2-4 | low, fixed | a numbered collision could rename a key the scrub never touched | keys the scrub leaves alone are reserved first, and only a rewritten key is numbered; unit. Revert (no reservation): the untouched field lost, "gave {\"[redacted]\":\"untouched\"}" |

No finding of the build rounds is left open for a later story: A5 is AD-21's design, A7 is bounded by eval-quality's own nesting limit, A8 is eval-quality's `mcp` kind, and A9 is already Story 1.31's criterion.

### Final review round 1 (PR #242 at 8a9589e: compliance, adversarial, edge-case and test-quality lenses, plus CodeRabbit)

Every row was verified against the code at 8a9589e before its verdict.
Each revert was applied in the checkout, `node test/test-evaluate-mcp.js` run, the failure observed, and the file restored byte for byte from a copy (`cmp` clean).

| ID | Verdict | Finding | Resolution |
| --- | --- | --- | --- |
| S1 | medium, fixed | a secret reached a fault's cause when eval-quality quoted it JSON-escaped (the handshake refusal is `JSON.stringify(refusal)`), and the leading part of one survived where the "not a JSON-RPC message" cause cuts the line at 200 characters | `secretForms` scrubs each secret's raw and JSON-escaped body, and `scrubCutText` redacts a trailing prefix of four characters or more in the cause; the fixture's refusal carries `GRADER_SECRET` in its error's data, and the handshake case runs `run` with a secret holding `"` and a backslash and walks the project (a node walk) and the output for any four-character fragment; the bridge case asserts the same of its `fault.cause`; units for the escaped form and the cut prefix. Reverts: the escaped form dropped, 7 failures, among them "a server refusing its handshake is recorded as {...`"cause":"the server refused the initialize handshake: {...\"token\":\"Qv\\\"7\\\\tk-Zp9#wY\"}}"`}"; `scrub` in place of `scrubCutText`, "a cause cut through a secret kept" a cause ending `{"token":"Qv\"7\` |
| S2 | low, fixed | a secret the server returned as a JSON number was not scrubbed | `scrub` replaces a finite number whose text is a secret with `"[redacted]"`; unit; the reference names numbers. Revert: "a secret the server answered as a number gave `{"n":9007199254740,"s":"x[redacted]x","other":90071992}`" |
| S3 | low, fixed | `McpRegistryEntry.targetArgs`'s description said every file the server runs is the workspace's copy, which the pattern does not hold | the description names the refused forms only; the reference, CHANGELOG, epics and AD-4 already claimed no more (each says the refused forms would run the live tree) |
| S4 | medium, fixed | the pattern's "absolute path after `=`" alternative had no case | a `check` case `targetArgs: ["--script=/abs/grader.js"]` expecting `schema` at `targetArgs/0`. Revert (the alternative deleted): "a tool server argument carrying an absolute path after =: check exited 0" |
| S5 | medium, fixed | the `isError` projection was unguarded on the bridge's real arm and on the gameability `degeneratePort` | the stub agent makes a fourth call, `grade_answer {answer: 42}`, which the server answers with `isError` (`maxToolCalls` 4), and the case asserts it recorded with `responseStatus` 1; a gameability router over a degenerate step with `isError: true` asserts `responseStatus` 1. Reverts: `responseStatus: 0` in `handleMcp`, "P-001 trial 1 recorded the call the server refused as {...`"responseStatus":0`...}" and 6 more; `isError: false` in `degeneratePort`, "a degenerate response with its error flag set was answered {...`"isError":false`...}" |
| S6 | low, fixed | an entry's `targetArgs` and `maxOutputBytes` reached no assertion | the fixture server reads its policy from `--policy=<path>` and exits 2 without it, and the fixture passes `--policy=rules/policy.txt`; a unit with `maxOutputBytes: 4096` asserts it in the policy and eval-quality's parsed copy. Reverts: `targetArgs: []` in `mcpTargetPolicy`, "preflight over the MCP fixture exited 12; expected 0 ... the server exited during initialize" and 17 more; the default in place of the entry's value, "an entry's maxOutputBytes of 4096 reached the authorization as {...`"maxOutputBytes":8388608`}" |
| S7 | low, fixed | the scrub assertions read `run.json` and the records alone | the sealed-brief run sets `GRADER_SECRET` and asserts no occurrence across the whole project, the agent's capture and the output; the pipeline walks the whole project (its run directories included) and both outputs. Revert (the observation left unscrubbed): 18 failures, among them "the server's secret reached .../evaluator/clean/trial-1.json, ... in a sealed-brief run" |
| S8 | low, fixed | no case covered a hanging server | a `hang: <tool>` policy line; a case over `hang: grade_answer` with a 3000 ms ceiling asserts exit 12, the qualification fault's `budget-exhausted`, every logged pid ended (`process.kill(pid, 0)` throws `ESRCH`) and an empty TMPDIR. Revert (a ceiling read as a denial in preflight's `runArmFor`): "a server hanging mid-call: preflight exited 10; expected 12" |
| S9 | low, fixed | the shard weight 19 was a local figure | measured under c8 locally at about 29 s after these changes; the weight is 36, about 1.25 times that |
| S10 | low, fixed | nothing covered a trial step's denial reason, which the Story 1.33 amendment moved out of 1.33 | `runTrial` is exported for its unit, which drives one trial with the plan's tool left out of the registry and asserts the fault's `reason` and the exit-10 message; the amendment and its test-design row name the trial. Reverts: the fault as `{ code, message }`, "a denied trial step recorded `{"code":"forbidden-target","message":...}`"; `reasonNote` dropped, "... and stopped with 10: trial-clean-1 was denied by the registry: forbidden-target in ProbeRequest: ..." |
| S11 | low, fixed | stale floor claims | AD-13's Rule says `>=4.2.0` (amended 2026-09-25 in Story 1.10), Story H.1's engine status adds Story 1.10's raise, and `epic-1-context.md`'s present-tense `>=4.1.4` moved too; every other `4.1.4` is history |
| S12 | medium, fixed in docs, later story | a server that crashes, exits or writes non-JSON-RPC mid-call is exit 12 (eval-quality's `port-failure`, and its MCP observation has no field for an ended session), so a crash mutation is never caught on `mcp`, while the reference named only three causes and said a crashing step is an observation | the reference states the `mcp` limit and scopes the crash sentence to command steps; the CHANGELOG says so; Story 1.35 (judge a tool server that crashes mid-call) is appended with its engine consumption and revert checks |
| S13 | low, fixed | the agent's own failure was checked before `router.infrastructure()`, hiding a bridge call's cause behind "Agent ... exited with code 1" | `runSealedBriefAgent` names the infrastructure fault first; the stub agent reads `describe_policy`'s result and exits 1 when it is not JSON, and a case with `hang: describe_policy` asserts the exit names "the evaluator's call trial-1-call-2 could not run: budget-exhausted". Revert (the old order): "a bridge call to a hanging server: run exited 12; expected 12 naming the call's budget-exhausted fault", the output reading "the sealed-brief evaluator could not answer: Agent ... exited with code 1" |
| S14 | minor, skipped | CodeRabbit: `structuredResult` is unconstrained, outside MCP's `structuredContent` object contract | eval-quality 4.2.0's `McpProbeObservation.result` is `ProbeObservedBody`, whose `json` arm holds any `JsonValue`, and its adapter's `resultOf` passes `structuredContent` (and a JSON-RPC error object) through unchecked, so a degenerate response limited to objects would refuse a result the real port records |

**Added after review, and why.** `epic-1-context.md`'s stale floor (found by the S11 sweep) and the reference's bridge sentence naming a call's fault over the agent's exit (S13) were fixed in the same pass, since both were concrete defects in files this round touched.

### Final review round 2 (PR #242 at ad73a3d: regressions and adversarial lenses)

Every row was verified against the code at ad73a3d before its verdict; the regressions lens passed.
Each revert was applied in the checkout, `node test/test-evaluate-mcp.js` run, the failure observed, and the file restored byte for byte from a copy (`cmp` clean).

| ID | Verdict | Finding | Resolution |
| --- | --- | --- | --- |
| R2-A1 | medium, fixed | `secretForms` covered one level of `JSON.stringify` alone: a refusal whose `data` is a JSON string holding a JSON object, a raw line carrying another serializer's escapes (Python's `ensure_ascii`, PHP's `\/`, Go's `<`), and the same double-escaped text in an answer's string kept the secret | `escapingsOf` gives each way one level of JSON escaping writes a text: `JSON.stringify`'s body, with `/` as `\/` or not, and with non-ASCII units, `<`, `>` and `&`, or both as `\uXXXX` in lower- or upper-case hex, or none; `secretForms` adds each secret raw, each one-level form and each second level over those, deduplicated and longest first, and decodes nothing; a unit per form (one level, PHP, Python, upper-case hex, Go, a JSON string holding JSON, a second level over Python's) over a cause and an answer; the reference and CHANGELOG list exactly those forms and name what stays unscrubbed. Reverts: no second level, "a secret written as a JSON string holding a JSON object survived" and "... a second level over Python's survived"; no `\/`, "a secret written as PHP (\/ and non-ASCII escaped) survived"; no `\uXXXX`, 5 failures, among them "... Python's ensure_ascii survived"; lower-case hex only, "... upper-case hex survived"; no `<`, `>` and `&` pattern, "... Go's <, > and & escapes survived" |
| R2-A2 | low, fixed | the number scrub compared exact text, so `123456789012345678` recorded as `123456789012345680`, `12345678` inside `912345678` and `1234567.50` recorded as `1234567.5` survived | `numberHoldsSecret` replaces a finite number whose text holds a secret or that a secret read as a number equals (a blank secret never matches); a unit per case; the reference's number sentence says so. Revert (exact text): "a secret 123456789012345678 the server answered as the number 123456789012345680 gave `{"n":123456789012345680,"other":42}`" and the other two |
| R2-A3 | low, fixed | a bridge call's fault replaced the agent's own failure in the exit message | the message names the call's fault, then "; the agent then failed: " and the agent's failure; the hung-call case asserts both, and the reference says so. Revert (the fault alone): "a bridge call to a hanging server: run exited 12; expected 12 naming the call's budget-exhausted fault", the output ending "... during tools/call and was torn down" |
| R2-R1 | note, skipped | the hang case cannot tell eval-quality's process-group kill from the fixture exiting on stdin EOF | the kill is eval-quality's behavior, which TeA does not test (the vendor owns it); TeA's claim, the `budget-exhausted` ceiling path with exit 12, is asserted |

### Final review round 3 (PR #242 at 8988720: bounded to round 2's fixes and material defects; opus, plus the coordinator)

Round 2's scrub, number and failure-message fixes hold; performance measured at 99 forms and 6 ms for a 2,000-character secret, 178 ms for a record with a 1 MB string and 10,000 rows.

| ID | Verdict | Finding | Resolution |
| --- | --- | --- | --- |
| R3-1 | medium, fixed (coordinator) | `numberHoldsSecret`'s equality branch let a secret of eight characters that reads as a short number (`00000000`, `1.000000`, `0x000001`) redact every 0 or 1 in a structured result, so a placeholder credential could fail a clean control | the equality applies only to a number whose text has at least `MIN_SCRUBBED_VALUE_LENGTH` characters; round 2's three cases still redact; the reference's number sentence says so. Test: three secrets each leave an ordinary number unchanged. Revert (the length guard removed): "a secret 00000000 redacted the ordinary number 0: {\"n\":\"[redacted]\",\"other\":42}" and the same for `1.000000` and `0x000001` |

## Verification

**Commands:**

- `npm run test:evaluate-mcp` -- expected: every case passes over real eval-quality 4.2.0.
- `npm test` -- expected: green.

**Results:**

- the Build Rules engine check -- exit 0 at the start on eval-quality 4.1.4 and at the end on 4.2.0; `git diff -- package.json package-lock.json` names no `file:` or `.tgz` spec
- `npm run test:evaluate-mcp` -- 115 checks over the real eval-quality 4.2.0, about 17 s (about 19 s under c8 locally, its shard weight); before 4.2.0 was published, the 12 reason assertions failed and every other check passed; after final review round 1, 141 checks, about 25 s (about 29 s under c8 locally, shard weight 36); after final review round 2, 151 checks
- `test:evaluate-check` 586, `-boundaries` 302, `-preflight` 232, `-mutation` 423, `-run` 389, `-arms` 272, `-evaluators` 510 checks -- exit 0 on 4.2.0
- `npm run test:release-metadata`, `test:guard-publish`, `test:ci-coverage` (eighty-seven chained steps), `test:shards`, `test:doc-claims`, `test:doc-claim-sources`, `test:port-totality`, `test:probe-conformance`, `test:probe-targets`, `lint`, `lint:md`, `format:check`, `docs:validate-links` -- exit 0
- `npm run docs:build` -- exit 0; `llms-full.txt` measures 499,446 characters against the 600,000 cap
- `npm run eval:preflight` -- exit 2, 0 legs run and 190 answered from the cache, with the six test-design moves Story 1.27 owns (P-008 to P-010 pass where the baseline records `seeded-fault-fired`; P-012 to P-014 fail `seeded-faults-scoped`), as Story 1.17 recorded
- `npm test` -- the whole chain runs in this commit's pre-commit hook
