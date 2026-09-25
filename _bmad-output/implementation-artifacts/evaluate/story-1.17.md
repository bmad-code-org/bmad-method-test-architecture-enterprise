---
title: 'Story 1.17: Drive any evaluation layer through one import contract'
type: 'feature'
created: '2026-09-25'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '2ccdd15d18199e5b1e16dd4b72e4e73c905e74eb'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Stories 1.17, 1.10, 1.11, 1.19, 1.20, 1.21, 1.23)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.17 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-1, AD-5, AD-7, AD-9, AD-10, AD-21)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.9.md (Implementation Notes: judge nonce, run directory)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** `tea-evaluate run` judges every trial with its own deterministic evaluator, so an adopter whose evaluation is an agent reading the sealed brief, a harness of their own, custom code or an evaluation framework cannot reach `eval-quality score` through TeA.

**Approach:** `evaluation.json` gains `evaluator` with four kinds behind one import contract (AD-21): `deterministic` (the default, unchanged), `command` (an adopter executable that reads `{ sealedBrief, observations }` and prints judgment rows), `sealed-brief-agent` (an agent through TeA's adapters that acts on the target only through a vendor-neutral stdio MCP bridge and answers in judgment rows), and `records` (an adopter harness's own sealed records, validated and passed through).
Rows convert into `SealedRunRecord` findings, dispositions and judge results through `evaluator/mapping.json` alone, and the runtime re-checks nothing eval-quality's ingest checks.

## Boundaries & Constraints

**Always:** every verdict comes from the eval-quality CLI over persisted, schema-validated files; every run-directory write goes through `run-directory.js`; an evaluator that cannot answer inside the import contract yields no record and exit 12 with its streams persisted under `runs/<invocationId>/evaluator/`; vendor knowledge stays in `cli/lib/agent-adapters.js`; `engine.js` stays the one file that loads eval-quality; no framework name or import under `cli/`; the deterministic kind's records and evidence stay as Story 1.9 left them apart from `decodingParameters["tea.evaluatorKind"]`.

**Never:** judge calibration or held-out partitions (Story 1.21); a framework fixture or devDependency (Stories 1.19, 1.20); the skill's evaluator guide or templates (Story 1.23); interpretation (Story 1.22); mcp or api registry entries (Stories 1.10, 1.11); a new subcommand.

**Decisions (build agent, owner-delegated):**

- `evaluator.command` names an executable file under `evaluator/`; it runs under `cli/lib/agent-supervisor.js` (its own process group, the wall clock `evaluator.timeoutMs`) in an empty temporary directory with the base environment plus `evaluator.environmentKeys`.
- `evaluator/mapping.json` binds each key to `{ oracleId, behaviorId }` or `{ rubricId, criterionId, levels }`; it is required for `command` and `sealed-brief-agent`, and every rubric criterion must be bound under those kinds.
- A trial's stdout is one JSON object `{ rows, recommendation? }`; the per-evaluation row schema adds the mapped-key enum and an at-most-once rule per key to the runtime-owned `judgment-rows.schema.json`.
- A `fail` row files a finding only against a probe whose behaviors include the mapped behavior, as `judgeTrial` does; its disposition is `violated` either way. A mapped rubric criterion with no row becomes `score: null` with a note.
- The sealed-brief agent answers inside a `<judge-answer nonce>`-style block with a fresh nonce (Story 1.9's pattern); the runtime drives the interaction plan first as `baseline` observations, which the agent never sees; the bridge counts the agent's calls against `budgets.maxToolCalls`.
- The bridge is a relay: the agent's MCP server process forwards stdio to a socket the runtime serves, so the contract, the registry and the recording stay in the runtime process.
- `records`: `run` qualifies and preflights as usual, then copies `<records>/evaluator-configuration.json` and `<records>/<probeId>/*.json` byte for byte after schema validation (exit 10); `score` holds them to run.json's digests and leaves agreement to eval-quality.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Command rows | stub evaluator per row shape over the verdict fixture | clean `passed-clean-control`, mutated `caught`, every record schema-valid | N/A |
| Unwitnessed quote | `fail` row quoting text absent from its observation | record reaches `score` unchanged, eval-quality Invalid (exit 3) | N/A |
| Bad evaluator | crash, non-zero exit, invalid output, unmapped or repeated key, zero rows, hang | no record, exit 12, streams under `evaluator/` | hang: process group killed at `timeoutMs` |
| Sealed-brief agent | stub agent through the `custom` adapter and the bridge | prompt holds the brief and none of the contract's checks, literals, step or operation IDs; calls recorded `evaluator-chosen` | denied call recorded with eval-quality's reason, no launch |
| Records | adopter records directory | copied unchanged, scored through | invalid record: exit 10, no `score` call |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/run.js` -- `runTrial` (:315) and `concludeTrial` (:432) gain the evaluator kinds; `runTrialSets` (:501) builds the configuration (:617-632), the records (:688-717) and `run.json`'s `evaluator` (:777); `setRecommendation` (:492) stays the deterministic kind's.
- `cli/lib/evaluate/evaluator.js` -- the deterministic evaluator, unchanged; `channelText` is the model for quoting.
- `cli/lib/evaluate/judge.js` -- `answerBlocks`, `unfenced`, `answerNonce` are the nonce pattern to reuse (export them).
- `cli/lib/run-agent.js` -- `runAgent` is synchronous (spawnSync), which would block the bridge's socket; an asynchronous twin over the same supervisor.
- `cli/lib/agent-adapters.js` -- per-adapter bridge argv (claude verified live, custom documented), refused for the rest.
- `cli/lib/evaluate/check.js` -- new `evaluator` rule; `checkJudge` (:972) narrowed to the deterministic kind.
- `cli/lib/evaluate/score.js` -- `inputFindings` (:176) skips the TeA-derived record checks for a `records` run.
- `cli/lib/evaluate/schemas/` -- `evaluation.schema.json` (`evaluator`), new `evaluator-mapping.schema.json` and `judgment-rows.schema.json`, `evaluator-conditions.schema.json` (optional `evaluator.modelSnapshot`).
- `node_modules/eval-quality/dist/core/schemas/sealed-run-record.js` -- `Finding`, `QuotedEvidence` (artifact arm and channel arm), `JudgeResult`; `dist/adapters/command-line-adapter.js:359` -- a denial is `forbidden-target` with the policy's detail text.
- `test/test-evaluate-arms.js` -- the project builder and run helpers to follow; `test/fixtures/evaluate/mutation/` the verdict fixture.

## Tasks & Acceptance

**Execution:**

- [x] `cli/lib/evaluate/schemas/*`, `cli/lib/evaluate/judgment-rows.js` -- mapping, row schema and conversion.
- [x] `cli/lib/run-agent.js`, `cli/lib/agent-adapters.js` -- the asynchronous supervised run and the bridge argv.
- [x] `cli/lib/evaluate/command-evaluator.js`, `sealed-brief-agent.js`, `bridge.js`, `records-evaluator.js`, `run.js`, `score.js`, `check.js` -- the kinds end to end.
- [x] `test/test-evaluate-evaluators.js`, fixtures under `test/fixtures/evaluate/evaluators/`, `test/test-evaluate-check.js` cases, `test/test-evaluate-boundaries.js` name scan, package.json chain, shard weight.
- [x] `docs/reference/tea-evaluate-cli.md`, CHANGELOG, planning amendments, sprint-status.

**Acceptance Criteria:** epics.md Story 1.17; each revert check in test-design-epic-1.md's Story 1.17 table is exercised once and recorded below.

## Implementation Notes

- **Implemented directly**, as Stories 1.8 and 1.9 were: this build runs as a subagent of the coordinator.
- **Kinds** (`evaluators.js`). `evaluatorOf` reads `evaluation.json`'s `evaluator`, `deterministic` when absent; `readEvaluatorLayer` runs in `run`'s `prepare` (now awaited by `preflight.js`'s pipeline), before any workspace, and reads the mapping, its row validator, the `evaluator/` tree digest and a command's executable digest; a command runs from the evaluation folder at each trial, so an edit to it during a run is caught by the adopter-tree read after every trial, not by the snapshot. `configurationFields` gives each kind its identity, model, prompt digest and `decodingParameters`, the `evaluation.json` wiring included (`tea.evaluatorWiring`); the deterministic kind's configuration gains only `tea.evaluatorKind`, which moves every deterministic configuration digest once.
- **Import contract** (`judgment-rows.js`, `judgment-rows.schema.json`, `evaluator-mapping.schema.json`). The per-evaluation schema adds a `key` enum and a `contains`/`maxContains: 1` clause per key, so an unmapped or repeated key is a schema failure. `judgmentFromRows` mints `F-NNN` per record and files a finding only for a probe that discharges the bound behavior (the deterministic evaluator's rule, which Story 1.8 found eval-quality needs for a two-behavior arm); a score row on an oracle key, a pass or fail row on a rubric key and a score off its levels are `EvaluatorError` (exit 12). A probe's implied recommendation follows its own findings (build review round 1: a fail row on another behavior stamped FAIL on a clean control). Nothing checks a quote or a citation: the unwitnessed-quote case reaches `score` unchanged and eval-quality reports it.
- **Command evaluator** (`command-evaluator.js`). It runs under `cli/lib/agent-supervisor.js` through the new `runSupervised` (asynchronous, `cli/lib/run-agent.js`), so a timeout stops its process group with `SIGTERM` and `SIGKILL` after the 2 s grace, and every process left in its group dies with it; the hang case checks the evaluator and its child are both gone.
- **Asynchronous agent runs** (`run-agent.js`). `runAgent` blocks the event loop (`spawnSync`), which would starve the bridge's socket, so preparation (`agentInvocation`) and the reading of the supervisor's report (`agentAnswer`) are shared by `runAgent` and the new `runAgentAsync`; `runAgent`'s behavior is unchanged (`test:cli` and every runner's suite pass).
- **Bridge** (`bridge.js`, `sealed-brief-agent.js`). The runtime serves MCP (initialize, ping, tools/list, tools/call; notifications answered with nothing) over a socket in a private temp directory (`/tmp` when the temp path is too long for a socket, a named pipe on Windows), admitting one connection, the first to present the bridge's random token, which the relay reads from its environment (review round 1 found it on argv, where any process listing showed it); `bridge.js` run as a program is the relay the agent starts from a private configuration file. Calls are answered one at a time, and once the agent ends a running call is aborted and none starts. The router reads a `cli` call's words (`--name=value`, `--name` taking the next word only when an operation of that command declares the option with a non-boolean type, `--` ending the options, positionals named by the matched operation's declared keys), refuses an option given twice, matches the one operation whose declared keys admit the call, echoes what was sent in the result, and routes it through the trial workspace's `hostEnvironmentPort`; `mcp` and `api` calls get eval-quality's own interface denial over no authorization. Unmatched authorized calls stay out of the record and are answered with no observation ID; every call counts against the contract's `budgets.maxToolCalls`.
- **Sealed-brief agent.** The plan runs first as `baseline`; the agent's matched calls follow as `evaluator-chosen`, numbered after them, their IDs `trial-<n>-call-<k>` minted clear of the plan's. The prompt is `EVALUATOR_INSTRUCTIONS`, the answer line with the call's nonce, and `{ sealedBrief, keys }`; the answer is read with `judge.js`'s `answerBlocks` and `unfenced`, now exported. `claude`'s bridged argv was verified live (see Live measurement): `--safe-mode` drops `--mcp-config` servers, so it is left out and `--setting-sources ""` keeps user and project settings and CLAUDE.md out instead; `--no-session-persistence` keeps the prompt, nonce included, off disk while the target runs (the first live run left one transcript per trial in `~/.claude/projects/`, the second none); passthrough flags that would reopen any of it are refused by `check` and by `agentInvocation`. The configuration's `systemPromptDigest` covers the evaluator template (instructions, answer line, heading, and the tools' descriptions and call shapes).
- **Records** (`records-evaluator.js`). Every file is validated before any is copied, so a refused directory leaves no partial copy; the directory must resolve inside the folder through no link, and the configuration's and records' brief digest, and each set's `runId` and arm, are held to the run; the index's `isolationManifest` path names the absent file when the harness wrote none, which `score` passes on as absent. `score` skips the derived `runId`, the record-to-run digest agreement and the reference checks for a `records` run (read from `run.json`'s `evaluator.kind`) and holds the index to exactly the records the run copied.
- **Check** (`check.js`). The `evaluator` rule and the narrowed `judge` rule; `check` reuses `evaluatorTree` to refuse links under `evaluator/` and `mappingContractProblems` for the bindings, so `run` and `check` hold one rule.
- **Boundaries.** `test:evaluate-boundaries` gains `framework-name`, a raw-text scan of every file under `cli/`, with three plants; `test:evaluate-evaluators` plants `require('some-evaluation-framework')` under a copy of `cli/` and observes `eval-quality-gates dependency-direction` exit 1 naming it (exit 0 on the clean copy).
- **Gaps closed on the way.** README's chain count moved to eighty-six. The `evaluator.command` schema pattern's `..` lookahead sat after `evaluator/`, so `evaluator/../contract.json` matched; a new check case found it, and the lookaheads now open the pattern.
- **eval-quality gap reported, not worked around.** eval-quality's command and MCP adapters throw `forbidden-target` with the policy decision's detail and drop its reason code (`node_modules/eval-quality/dist/adapters/command-line-adapter.js` `if (!decision.allowed) throw forbidden(decision.detail);`, and the same in `mcp-adapter.js`), and `evaluateCommandTarget` and `evaluateMcpTarget` are not exported; the bridge records `{ code, detail }` for those kinds, and Story 1.33 records the reason once eval-quality carries it.

### Revert checks exercised

Each change was undone once in a scratch worktree (`git worktree add --detach`, `npm ci`, the tree's changed files copied in), the named suite run, the failure observed, and the file restored byte for byte. The test-design table's checks first, then the ones the review rounds added.

- `check` rules (`test:evaluate-check`): the mapping-to-contract rule removed turns eighteen checks red ("a mapping key bound to an oracle the contract does not declare: check exited 0; expected 10"); the records-directory rule removed, and later its link test alone, each turn the records case to exit 0; the `judge` rule kept for every kind makes "a rubric a command evaluator scores, with no judge" exit 10; the passthrough rule removed makes the `--tools` case exit 0.
- The conversion dropping `findingType`, or `evidenceArtifacts`, fails the published schema before `score`: "pass and fail rows: run exited 12; expected 0", ten checks each.
- A runtime that pre-filters quotes: "an unwitnessed quote: the records quote []" and "score exited 2; expected 3".
- The row schema not enforced: fifteen checks, "invalid: run exited 12; expected 12 saying \"judgment-rows schema\"" (the answer reaches the published schema instead).
- A repeated key accepted (`maxContains` removed): the duplicate-key case runs to exit 0.
- The evaluator's streams swapped when persisted: eighteen checks, "crash: the persisted stderr is \"\"".
- The contract added to the agent's prompt: the scan finds the check pointers, `judge-run`, `Judge the request.`, `judge-request` and the test data, in every prompt; an operation ID named in the tool descriptions: seven checks, "a tool description names an operation or a plan step".
- A bridge that forwards every command call (the executable replaced by the registry's first): the unlisted call launches, and the launch count and the call outcomes fail.
- An unmatched call recorded as an observation: "the authorized unmatched call was answered {\"observationId\":\"trial-1-call-4\",\"recorded\":true,...".
- The tree digest omitted from the configuration: the tree-digest assertions and the configuration-digest case fail.
- The records import's schema validation removed: the record off its schema runs to exit 0; the brief, arm and `runId` checks removed each turn their case to exit 0.
- TeA's judge called under every kind: the command run crashes on the absent judge wiring and exits non-zero.
- The evaluator timeout ignored: the hung-evaluator run reaches the 180 s harness timeout ("did not finish: spawnSync ... ETIMEDOUT") and leaves its workspaces in the project's temp directory, which a second check reports.
- The token check removed from the bridge: "a second connection with the token was answered {\"closed\":false,..." and the same for a wrong token.
- Calls still run after the agent ended: "a call after the agent ended was answered {\"observationId\":\"trial-1-call-3\",...".
- A probe's recommendation taken from any fail row: "the trial recommendation is wrong" and "P-001 recommends FAIL; expected PASS".
- The wiring left out of the configuration: the configuration unit and the sealed-brief configuration check fail.
- claude's bridged argv without `--tools ""`: "claude's bridged argv is [...]" names the argv.
- One operation matching a call its keys do not admit: "a call outside its operation's shape reads as {...\"operationId\":\"judge-request\"...".
- Calls refused past the budget counted as used: "a run past its budget reports 9 tool calls used against a ceiling of 6".
- The dependency-direction plant is itself the check for the framework-neutrality criterion: the gate exits 0 on the clean copy of `cli/` and 1, naming `some-evaluation-framework`, with the import planted; the `framework-name` plants in `test:evaluate-boundaries` are each reported at their file.

### Live measurement

Two live runs of a sealed-brief agent on the verdict fixture through `claude` (`--model haiku`, claude 2.1.282), three trials per arm, through the local CLI on the owner's subscription.

- Run 1 (build, before review): 3 minutes 4 seconds. The agent chose its own command lines (`verdict judge request` with empty stdin, `verdict` with stdin `strict` or `accept`, and on one trial `judge request`, which the registry denied as an unlisted executable twice before it called `verdict`) and answered in the nonce block every time; `score` resolved P-001 `passed-clean-control` and P-002 `caught` in all three trials.
- Run 2 (after review round 1: token in the environment, configuration file, `--no-session-persistence`): 2 minutes. The agent again answered in the block every time and P-001 resolved `passed-clean-control` in all three trials, but its mutated-arm calls sent no standard input, so the defect signature's selector (the `prompt` stdin key) matched none of the observations its findings cited, and eval-quality read P-002 as Invalid (`unwitnessed detection claim`, `infrastructure-error` per trial). The runtime recorded what was sent (stdin absent); the engine's reading is right. Nothing in the brief tells the agent a behavior reads standard input, by design, so a sealed-brief verdict depends on the calls the agent happens to make: Story 1.34 qualifies the agent against the probes before a run's trials count.

## Spec Change Log

- 2026-09-25: epics.md Story 1.17's criteria amended (dated, in place): the `evaluator` and `judge` rules' full refusal list; the command evaluator's file, supervisor, working directory and answer shape; a finding and an implied recommendation only for a probe that discharges the bound behavior; unscored criteria and answers outside the contract; the persisted streams; the bridge's `api` and `mcp` routing until Stories 1.10 and 1.11, the denial record, the budget, the stop after the agent ends and the gameability answers; the prompt scan, the rubric key material, the nonce answer, the adapters with a bridged run and the token; the configuration's wiring, models and template digest; the records import.
- 2026-09-25: epics.md Stories 1.10 and 1.11 each gain a bridge criterion (an unlisted tool and an unlisted address denied through the bridge) and depend on 1.17; the Epic Dependencies table matches.
- 2026-09-25: Stories 1.33 (eval-quality's denial reason for every denied call) and 1.34 (qualify a sealed-brief agent before its verdicts count) appended to Epic 1, with test-design sections, dependency rows and `backlog` rows; the overview counts thirty-nine stories.
- 2026-09-25: ARCHITECTURE-SPINE.md AD-21 amended with the import contract's shapes, the bridge's two halves, the adapters with a bridged run, the fixed conditions and the records import.
- 2026-09-25: test-design-epic-1.md's Story 1.17 table gains the row for the bridge's `api` and `mcp` denials, the gameability router and the added `check` refusals.

## Review Triage Log

### Build review round 1 (step 4 and the brief's layers: blind hunter B, edge-case hunter E, verification gap V, test review T, adversarial A; all opus, on the uncommitted tree)

Every row was verified against the code before its verdict; fixed rows were fixed in the tree reviewed in round 2.

| ID | Verdict | Finding | Resolution |
| --- | --- | --- | --- |
| A1 | high | the bridge's token rode on the relay's and claude's argv, so any process could read it and drive the bridge | fixed: the relay reads it from its environment, the configuration goes to the adapter as a private file, and the bridge admits one connection; a same-user target that reads the environment before the agent connects stays possible until Story 1.31 sandboxes it, as the reference says |
| A2, B3 | high | the configuration left out `evaluation.json`'s wiring (arguments, model, timeout), and a command evaluator's model could not be recorded | fixed: `tea.evaluatorWiring` for both row-converting kinds, `tea.evaluatorModel` for an agent, `tea.evaluatorModelSnapshot` from the conditions for a command; `check` admits the conditions' `evaluator` block for a command; `judgeConfiguration` stays null for a command, since its strict shape needs a system prompt digest the runtime cannot know for adopter code |
| A3, V1, T7 | high | claude's bridged argv was pinned by no test, passthrough flags could reopen tools, and `custom` was called verified | fixed: a unit case pins the argv; `bridgeLockedFlags` and `bridgedArgsRefused` in the adapter table, refused by `check` and by `agentInvocation`; the wording says custom's sealing is the runner's contract |
| A4 | medium | queued calls ran after the agent was gone and could land in the record | fixed: `router.stop()` after the agent ends aborts a running call and refuses the rest; unit case |
| A5, B4, E7, E9 | medium | the output cap kept buffering past the limit, and an agent failure lost its streams | fixed: nothing is kept past the cap (a faithful prefix), and `agentAnswer` carries the streams on every failure; unit case floods 70 MiB |
| A6, B8, E2 | medium | the bridge rewrote the agent's command line: repeated options collapsed, an undeclared option swallowed a path, `--` was ignored | fixed: `--name` takes a value only when an operation declares the option non-boolean, `--` ends the options, a repeated option is refused, and the result echoes what was sent; short options stay positional words, sent as written, since eval-quality sends positionals verbatim |
| A7 | medium | claude saves `-p` sessions, so the nonce sat on disk while the target ran | fixed: `--no-session-persistence`; the second live run left no transcript |
| A8 | medium | the agent receives rubric criterion text and anchors, which the AC's "nothing else" excludes | amended: the judgment-rows instructions carry each key's binding, a rubric key's criterion and levels included, since the brief carries no rubric and an agent cannot score without them; epics and AD-21 say so |
| A9 | medium | an agent repeating the plan's call makes eval-quality read selector ambiguity | skipped: eval-quality's rule over faithfully recorded observations; the reference tells adopters to declare cardinality `any` on a step an agent may repeat, and refusing `exactly-one` would forbid contracts whose agents never repeat the plan's bindings (neither live run did); Story 1.34's qualification catches an agent whose runs turn Invalid |
| A10, E15 | medium | one trial's FAIL stamped every probe on the arm, a clean control included | fixed: a probe's implied recommendation follows its own findings; unit case; amendment |
| A11 | low | a records directory reached through a linked parent was accepted | fixed: `run` and `check` require the real path inside the folder; check case |
| A12, B5, E16 | medium | the configuration's brief digest, the set's `runId` and its arm went unchecked on a records run | fixed: each is held to the run; three run cases; the reference states records are not tied to the target's state |
| A13 | low | an agent call that exhausts the target's elapsed cap ends the run with 12 | skipped: every plan step and leg treats that fault as infrastructure (AD-10), and the agent's calls keep that rule |
| A14, E1 | low | two operations on one command matched the first | fixed: the one whose declared keys admit the call matches, several or none leave it unmatched; unit case; a plan with two steps of one operation answers a gameability call from the first step's response, stated in the code |
| A15 | low | `check` refused a non-executable command and `run` did not | fixed: `readEvaluatorLayer` refuses it too |
| B1 | medium | an unmatched call returned an observation ID no record holds | fixed: `recorded: false` and no ID; the instructions say so |
| B2 | medium | `systemPromptDigest` covered only the instructions | fixed: `evaluatorTemplateDigest` over the instructions, answer line, heading and call shapes |
| B6 | low | no doc said where a harness gets the brief | fixed: the reference points to `eval-quality seal` or any run's `sealed-evaluator-brief.json` |
| B7 | medium | a sealed-brief agent could receive no credential variable | fixed: `environmentKeys` on the sealed-brief kind, passed as `envPass` |
| B9 | low | the budget counted every call and the manifest only launches | fixed: tool-call use counts every call, as the budget does; the observed tool list stays the launched commands |
| B10 | low | the reference's isolation-manifest text predated the bridge | fixed |
| B11 | low | the relay could exit before writing the last response | fixed: exits in stdout's write callback |
| B12, V5, T5 | medium | several `evaluator` refusals had no case | fixed: fourteen more check cases and one more clean case; one of them found the `evaluator.command` pattern hole |
| B13 | medium | e2e gaps: a sealed-brief rubric, a bridged infrastructure exit, the target-model keys, run-time exit 10 | fixed for the first three (the sealed-brief run scores R-101, a router unit case exits 3, the run names a target model); skipped for the last, reachable only by a race between `check` and `prepare` in one invocation |
| B14, E11, E12, E13 | low | `evaluatorOf` passed a string through to a spurious judge finding, the conditions were read twice, a stale JSDoc, an unused `trialCount`, a crash on a contract off its schema, an inherited adapter name | fixed |
| E3 | high | passthrough reopening tools | fixed with A3 |
| E4, E5, E6 | medium | a bridge that fails to open escaped as a raw error, a failed listen leaked its directory, an unadmitted client could grow the buffer | fixed: the bridge opens inside the agent's `try`, a listen failure removes its directory, 4 KiB before the token closes the connection |
| E8 | low | a synchronous spawn failure rejected past `EvaluatorError` | fixed: reported as a supervisor that could not start |
| E10 | low | the command evaluator read `process.env` and not the run's `env` | fixed: `env` travels through the pipeline's context |
| E14 | low | `toolInventory` could list a bridge tool of an unsupported kind | fixed: built from `bridgeTools` |
| E17, E18 | low | the snapshot claim and "unchanged" deterministic claim overstated | fixed in code comments, the reference and CHANGELOG |
| V2 | medium | the token admission had no case | fixed: a second connection and a wrong token each closed unanswered |
| V3, T6 | medium | the records run's own checks had no case | fixed: brief, `runId`, arm and index cases |
| V4 | low | the manifests' ceilings were unasserted | fixed for the sealed-brief tool calls and the command wall clock |
| V6 | medium | parts of `configurationFields` were unasserted | fixed: unit and run assertions |
| V7, T2 | medium | the stub's own recommendation equalled the derived one | fixed: the stub recommends CONCERNS on the mutated arm and the records carry it |
| V8 | low | the overflow path had no case | fixed: unit case with `runSupervised` |
| T1 | medium | the command evaluator's stdin, working directory and environment were unasserted | fixed: `--log` case |
| T3, T4 | medium | score-on-oracle, pass-on-rubric, an unscored criterion and findingId uniqueness were untested | fixed: two run cases and two unit cases |
| T8 | low | the scan covered contract strings only, and the persisted prompt and a wrong-nonce block were unasserted | fixed for probe and mutation strings and the persisted prompt; the nonce block reader is `judge.js`'s, whose forged and wrong-nonce cases run in `test:evaluate-arms` |
| T9 | low | two launch assertions could not fail | fixed: the denied-call case counts trial launches, the gameability router gets a trap port |
| T10 | low | the test design called the `mcp` denial `interface-not-authorized` | fixed: the row names the adapter's fault and detail |
| T11 | low | row-schema branches had no case, the hang case skipped stderr, `exited 1` matched `exited 12` | fixed: seven schema units, the stderr assertion, `exited 1, so` |
| T12, T13 | low | the hang case could flake and the MCP client could hang the file | fixed: 5 s timeout, polled reaping, request timeouts and drained stderr |
| T14 | low | the behaviors a probe discharges reach the conversion only in a unit | skipped: the fixture has one behavior, and `concludeWithRows` passes the list `concludeTrial` passes `judgeTrial` |
| T15 | low | stub header drift, a misnamed variable, an overridden expectation, a missing guard | fixed |

### Build review round 2 (bounded to the round 1 fixes and material defects; opus, on the tree after round 1)

Every material round 1 fix was checked and holds (token and one-connection admission, `stop`, the output cap, the configuration fields, the per-probe recommendation, the records checks, the locked flags).

| ID | Verdict | Finding | Resolution |
| --- | --- | --- | --- |
| R2-1 | medium | a call refused past the budget still counted, so a run past its budget reported use above the manifest's ceiling | fixed: the router counts only the calls its budget admitted (`counted`), and the over-budget case asserts use equals, and stays within, the ceiling |
| R2-2 | medium | a command with one operation matched every call on its path, one its declared keys do not admit included | fixed: the admitting test applies to one operation as to several; unit case (`verdict --help a b` is unmatched) |
| R2-3 | medium | the judgment-rows schema still described the old recommendation rule | fixed |
| R2-4 | medium | `--plugin-url`, `--from-pr`, `--teleport`, `--chrome`, `--ide`, `--agent` and `--cloud` passed the locked list | fixed: added to `bridgeLockedFlags` |
| R2-5 | medium | on a gameability arm, a call outside the plan's operations was refused with text that told the agent which arm it was on | fixed: every call is answered from the degenerate response, an unmatched one from the plan's first step, unrecorded; the router unit case asserts it |
| R2-6 | low | the template digest left out the tools' descriptions | fixed: the digest covers each kind's tool as the bridge lists it; the result texts stay out, since they carry run data |
| R2-7 | low | a queued call could record between an abnormal agent end and `stop()` | skipped: an abnormal end yields no record |

## Verification

**Commands:**

- `npm run test:evaluate-evaluators` -- expected: every case passes over real eval-quality 4.1.4.
- `npm test` -- expected: green.

**Results:**

- the Build Rules engine check -- exit 0 at the start and at the end on eval-quality 4.1.4; `git diff -- package.json package-lock.json` names no `file:` or `.tgz` spec
- `npm run test:evaluate-evaluators` -- 408 checks over the real eval-quality 4.1.4, about 90 s (130 s under c8 locally, where `test:evaluate-arms` takes 113 s against its CI weight of 109, so the new weight is 125)
- `npm run test:evaluate-check` -- 583 checks; `test:evaluate-boundaries` 302; `test:evaluate-run` 389; `test:evaluate-arms` 272; `test:cli` passes after the `run-agent.js` refactor
- `npm test` -- exit 0 in the pre-commit hook of this story's commit (eighty-six chained scripts)
- `npm run test:release-metadata`, `npm run test:ci-coverage`, `npm run test:shards`, `npm run lint`, `npm run lint:md`, `npm run format:check`, `npm run docs:validate-links` -- exit 0
- `npm run docs:build` -- exit 0; `llms-full.txt` measures 598,755 characters against the 600,000 cap (the tea-evaluate reference's new section was condensed to fit; the build's overflow message now names the count)
- `npm run eval:preflight` -- exit 2, 0 legs run and 190 answered from the cache, with the six test-design moves Story 1.27 owns (P-008 to P-010 pass where the baseline records `seeded-fault-fired`; P-012 to P-014 fail `seeded-faults-scoped`); an earlier run in this story ran two routing legs live through `claude` and moved nothing else
- live sealed-brief runs through `claude` -- see Live measurement
