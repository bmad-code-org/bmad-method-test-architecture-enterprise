---
title: 'Story 1.113: Run a subscription-authenticated agent target confined'
type: 'feature'
created: '2026-10-04'
status: 'review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'e1d5bb7d4c8193eb3c198382a5c3e70b3537fcb2'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 1.113; Stories 1.59 and 1.46)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.113 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-7, AD-8)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.59.md (the private home this story grants a login into)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.112.md (the record format)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** A confined target runs with a private, empty `HOME` (Story 1.59), so the Claude Code CLI behind `tea-skill-runner --agent claude` finds no login and every call exits 4.
Story 1.46's live preflight hit this, its evaluation of Evaluate's own skill declares `"confinement": false` for it, and the CLI reference tells such an operator to pass an API key variable, which the relay's rule for live runs forbids.

**Premise (Claude Code's documented login storage, recorded as given):** on macOS the subscription login is the login Keychain item `Claude Code-credentials`; on Linux and Windows it is the file `.credentials.json` in `~/.claude`, or in `CLAUDE_CONFIG_DIR` when that is set; a long-lived token from `claude setup-token` arrives as `CLAUDE_CODE_OAUTH_TOKEN` in the environment and needs no file.
The build starts no real CLI and inspects no credential location of the owner's.

**Approach:** a registry command entry declares `"login": "claude"` (`evaluation.schema.json`).
For a confined run the runtime then hands the entry's processes exactly the logins Claude Code documents: the variable `CLAUDE_CODE_OAUTH_TOKEN` when the host sets it, and the host's credentials file as a link at `.claude/.credentials.json` in each private home, which the target reads and cannot write and the audit does not list.
Every other credential variable and every other file under the real home stay withheld, so a second file a target reads is an observed mount.
`run.json` records each grant under `logins` (the variable's name, the file's path), the isolation manifest names the file read-only in `allowedMounts` and both sources in its forbidden-input note, and no record holds the value or a string of the file.
A login in the macOS Keychain has no grant: no Seatbelt rule scopes the keychain to one item and the CLI finds it through the `HOME` a confined target holds privately.
A confined run on a host with neither source exits 12 before any target starts, naming the token route (`claude setup-token`, then `CLAUDE_CODE_OAUTH_TOKEN`) and the opt-out, and the CLI reference documents both.
The dogfood evaluation keeps its opt-out, since its owner's host holds the login in the Keychain.

## Boundaries & Constraints

**Always:** A confined run without `login` behaves as it did: a private empty home, no credential variable, no link.
The variable is the one environment variable a login adds; `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` and the rest of the host's environment stay withheld unless the entry's `environmentKeys` names them.
The file grant is read-only: a write to it is refused, and neither the read nor the refused write is an observed mount.
A second file under the real home, in `.claude` or beside it, is an observed mount and `score` exits 3.
No recorded file holds the token's value or a string of eight characters or more from the file, an agent's echo of either included.
An opted-out run passes the variable, makes no home, takes no file and records the variable by name.
Linux cases run on the ubuntu CI job.
The engine check runs at start and end.
No eval-quality change.
No skill file changes: `references/ci.md`, `SKILL.md`, `assets/evaluation-ci-plan.template.json` and every `capture-record.json` stay as they are.

**Never:** a grant of the macOS Keychain, a read of the keychain by the runtime to hand its content to a target, a credential variable beyond `CLAUDE_CODE_OAUTH_TOKEN`, a copy of the credentials file, a login adapter beyond `claude`, a new dependency, a real CLI process, a live run.

**Decisions (build worker, owner-delegated):** the Decisions list below carries each choice with its reason.

## I/O & Edge-Case Matrix

| Scenario                    | Input / State                                                                              | Expected Output / Behavior                                                                                                                              | Error Handling |
| --------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| File login under `HOME`     | host `~/.claude/.credentials.json`, entry declares `login`                                 | the stub CLI reads the file through the link and exits 0; the write is refused; no observed mount; `run.json` `logins` names the file                   | n/a            |
| File login under config dir | `CLAUDE_CONFIG_DIR` holds the file as a link to another path                               | `logins[0].file` is the real path the link names; the call authenticates; no observed mount                                                             | n/a            |
| Second file                 | the target also reads `.claude/settings.json`, or `notes.txt` beside `.claude`             | the file is in `observedMounts`; `score` exits 3 with `mount outside allowlist`                                                                         | exit 3         |
| Token                       | `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` set on the host        | the stub holds the token alone; its echo is `[redacted]`; `logins[0].variable` names it; no file of the run holds the value                             | n/a            |
| No declaration              | a login on the host, no `login` on the entry                                               | the stub finds none, exits 4; the run exits 12                                                                                                          | exit 12        |
| Keychain only               | a fake `Library/Keychains/login.keychain-db`, no file, no token                            | `run` and `preflight` exit 12 before any target starts, naming `CLAUDE_CODE_OAUTH_TOKEN`, `claude setup-token`, the Keychain and `"confinement": false` | exit 12        |
| Keychain stand-in           | a target that reads the host's keychain file and writes its `-shm` sidecar                 | both paths are observed mounts, the write is refused, `score` exits 3                                                                                   | exit 3         |
| Opt-out                     | `"confinement": false`, `login` declared, token set                                        | the target receives the variable; `confinement: opt-out`; `logins` names the variable and no file                                                       | n/a            |
| Runner and adapter          | the real `tea-skill-runner --agent claude --agent-cmd ./claude.js` confined, file or token | the preflight passes (exit 0) with `login: file` or `login: token` in every observation                                                                 | n/a            |
| Reference                   | `docs/reference/tea-evaluate-cli.md`, `#### A subscription login under confinement`        | names the declaration, each source, the keychain's absence and why, the token route and the opt-out                                                     | n/a            |

</frozen-after-approval>

The frozen block was written for this build from the story's acceptance criteria as amended in `epics.md` on 2026-10-04.

## Code Map

- `cli/lib/evaluate/confinement.js`: `LOGIN_ADAPTERS`, `loginsOf`, `selectConfinement` (the `logins` it carries, the refusal for a host with no source, the unsafe-path refusal), `makeTargetHome(scratch, links)`, `targetSandbox`'s `linked` (read roots, the Linux trace grants, the Seatbelt quiet rule), `forbiddenInputNote`'s third argument.
- `cli/lib/evaluate/confinement-audit.js`: `traceDecision` reads a path in the home that resolves to a linked file as the exception it is.
- `cli/lib/evaluate/registry.js`: the entry's login variable among its permitted environment keys (an empty value is not handed over), `loginLinksOf` into every private home, `registry.logins`, `registry.loginSecrets` (the run-long union of every string read, `tornStrings` for a file that does not parse, the file named by `scrubFile` for an opted-out run).
- `cli/lib/evaluate/arm.js`: `hostEnvironmentPort` scrubs the strings of a granted login (the file's, minus its public fields, and the variable's host value) from every request kind as it scrubs an injected value, with the set read before the call and again after it settles, on the success path and in the fault path.
- `cli/lib/evaluate/preflight.js`, `run.js`: `run.json`'s `logins` (without `scrubFile`), the trial's read-only login mount, the manifest note's third argument.
- `cli/lib/evaluate/schemas/evaluation.schema.json`: the entry's `login`.
- `test/test-evaluate-run.js`: `checkSubscriptionLogin`, `checkSubscriptionLoginUnits`, `checkLoginScrubbedFromEveryKind`, `checkLoginScrubbedAfterRotation`, `checkSubscriptionLoginReference`, and the pinned sentence of `checkConfinementReference`.
- `test/test-evaluate-preflight.js`: `checkSubscriptionLogin` over the real runner and adapter, and `checkSupervisorTraceRetries`.
- `cli/lib/agent-supervisor.js`: the trace writer's bounded retry (Decision 24).
- `test/fixtures/evaluate/mutation/bin/verdict.js`: the acts `claude-login` and `claude-keychain`; `test/fixtures/evaluate/stub-agent/claude.js`: the stub CLI.
- `docs/reference/tea-evaluate-cli.md` (the registry bullet, the home sentence, `#### A subscription login under confinement`), `CHANGELOG.md`, `epics.md`, `test-design-epic-1.md`, `ARCHITECTURE-SPINE.md` (AD-7), `sprint-status.yaml`.
- Not changed: the dogfood evaluation (`evaluation.json`, `requirements.md`, `contract.json`, digests), the target and layer profiles, the isolation golden, the skill's guides, `references/ci.md`, `SKILL.md`, the CI plan template, every `capture-record.json`.

## Tasks & Acceptance

- [x] Reproduce through the real CLI on the unchanged code: the confined preflight of the real runner over a stub CLI with a fake login on the host.
- [x] `evaluation.schema.json`, `registry.js`, `confinement.js`, `confinement-audit.js`, `preflight.js`, `run.js`: the declaration and its grants.
- [x] `test-evaluate-run.js`, `test-evaluate-preflight.js`, `verdict.js`, `claude.js`: the cases, each with its revert check below.
- [x] The reference, `CHANGELOG.md`, `epics.md`, `test-design-epic-1.md`, `ARCHITECTURE-SPINE.md`, `sprint-status.yaml`, this record.

**Acceptance Criteria:** as in `epics.md` Story 1.113, with the amendment dated 2026-10-04 there.

## Reproduction

Run first on the unchanged code (`e1d5bb7d`, extracted with `git archive` to a scratch directory under the scratchpad, the new cases and stubs copied in), through the real CLI: the confined preflight of the real `tea-skill-runner --agent claude --agent-cmd ./claude.js` over the stub CLI, with a fake login file in the host's `~/.claude` and a fake token, on this macOS host (Seatbelt).
10 of 344 preflight checks failed, and every one is a case that declares the login.
The control that declares nothing passed its own check: the confined call finds no login under the private home, the stub CLI exits 1 and the runner 4 for every leg, which is the Story 1.46 symptom.
The cases that declare `"login": "claude"` exit 10, since `evaluation.json` has no such field (`/registry/0 must NOT have additional properties ("login")`), so no entry on the unchanged code can grant the login, and the host-with-no-source refusal and the records are absent.
The run cases failed the same way: 3 of 4 checks, with the declaring run exiting 10.
The audit evidence the epic asks for comes from the confined run's own audit over the stubs: a target that reads a host file outside its grants lists the real path in `observedMounts` and `score` exits 3 (the second-file cases), a refused write outside the grants is listed too (which the first run of the file case showed for the credentials file the stub tried to append to, Decision 6), and a read of a host keychain file with its `-shm` sidecar write is listed and refused (the keychain stand-in).

## Decisions

1. **Both branches hold, one per login source.**
   The epic offered a grant or a recorded reason with the opt-out.
   Claude Code keeps the login in three places, and the file and the token can reach a confined target while the Keychain cannot, so the story grants the first two and records the third.
   `epics.md` carries the rewritten criteria and the reason.
2. **The declaration is a registry entry field, `"login": "claude"`.**
   The runtime cannot read which agent a `tea-skill-runner` call runs from its arguments (they sit in the contract's plan), and a grant is a decision the evaluation's author takes, as `systemPaths` and `egress` are.
   `claude` is the one adapter, since nobody evaluates through another CLI's login yet (the rule to leave out what nobody needs).
3. **Rejected: `systemPaths` or `environmentKeys` alone.**
   `systemPaths` exempts the real path from the audit but the CLI looks under `HOME`, which is private, so it cannot find the file; `CLAUDE_CONFIG_DIR` pointed at the real `~/.claude` would expose its history and settings (every read an observed mount) and let the CLI write there.
   `environmentKeys` already passes the token variable, and `login` adds it so one declaration covers both sources.
4. **The file grant is a link in the private home, not a copy.**
   The CLI finds the file where it looks, the real file stays the only copy of the credential, the grant names a path the manifest records, and a write is refused.
   Rejected: a copy, which puts the credential's bytes into a directory the target writes and makes the "read-only grant of exactly that file" a second secret at rest.
   The consequence is that a CLI which refreshes an expired access token inside a call cannot persist the new one; the token route has no such write.
5. **Rejected: pointing `CLAUDE_CONFIG_DIR` at a private directory that holds the link.**
   The link at `HOME/.claude/.credentials.json` is the location the CLI uses by default, and a variable the target's environment must carry would be a second grant.
6. **A refused write to the linked file is not an observed mount.**
   Seatbelt reports a refused write outside the grants, so the CLI's attempt to write its credentials (a refresh) would have made every authenticated run Invalid; the first run of the case showed it (the stub's append was listed).
   The profile adds a `(deny file-write*)` for the file with no token, which the audit's existing `quiet` rule already does for git's own entries; the refusal stays, and a read of any other file is still listed.
   Under Bubblewrap a write through the link names a path inside the home, which the trace already treats as granted.
7. **The grant belongs to the run's private home, not to one target.**
   The home is one directory per sandbox, shared by every target of the run, so the link is in reach of every process the run starts; the audit's exemption is per sandbox for the same reason.
   Rejected: an exemption per target, which a shared link cannot honor.
8. **Linux needs the trace decision to know the link.**
   A read of the link is a path inside the withheld private root whose real path is outside it, which `traceDecision` lists; `grants.linked` names the real files a home links to, and the decision lets a read through the home to one of them pass.
   A link to any other file is still listed.
   `checkSubscriptionLoginUnits` reads the decision as a function on any host, and the end-to-end cases run it under Bubblewrap on the ubuntu CI job.
9. **A host with neither source is refused at selection.**
   Without a source every call exits 4, which reads as the target's transport failure after the first leg (Story 1.46 lost twelve minutes to it).
   The refusal names the entry, the file looked for (the directory `CLAUDE_CONFIG_DIR` names when set), the token route, the Keychain's absence and the opt-out, and exits 12 before any workspace is made.
   A run that opted out is accepted without a login source: its target keeps the host's own home.
10. **The macOS Keychain has no grant, decided from the profile and the stub audit.**
    The target profile is `(allow default)` with writes denied, so it allows every Mach lookup and every read outside the withheld paths: the keychain's service answers by the requesting program's access list, a decision no Seatbelt rule scopes below the whole keychain.
    The CLI's own lookup depends on `HOME`, which a confined target holds privately, and giving it the real home would expose every file the audit lists and let it write (refused) the state it keeps.
    The keychain stand-in shows the profile's side: a read of the host's keychain file is an observed mount and the sidecar write a keychain database needs is refused.
    Rejected: a grant of the keychain directory (the whole keychain, with a write the target profile denies), the real `HOME` for the keychain with a private `CLAUDE_CONFIG_DIR` (a home full of listed reads), and a runtime that reads the keychain item and hands its content to the target (the owner's tools deny that read, and an access token expires within hours where a `setup-token` token does not).
11. **The dogfood evaluation keeps `"confinement": false` and its sentence.**
    The brief drops the opt-out only when a proved path authenticates the live legs on the owner's host, and no live run was made; the owner's host is macOS, whose login is in the Keychain.
    No digest of the evaluation changes, so `contract.json`'s `sourceSpecDigest`, the requirements digest and the corpus index stand.
12. **No skill guide changes.**
    The harness guide stays as it is; `references/ci.md`, `SKILL.md` and the CI plan template are not touched, so no capture record is pinned to a changed byte.
    The declaration is documented in the CLI reference, where `systemPaths` and `egress` are.
13. **The cases use fake logins and stub CLIs.**
    A random token, a random credentials file in a temp home and a fake keychain file stand in for the owner's login, and the CLI is `claude-login` in the verdict fixture (under `run`, where the audit lists mounts) and `claude.js` behind the real runner and adapter (under `preflight`).
    No real credential location is read and no live run is made.
14. **`makeProject`'s act runs in the first clean trial.**
    The act's trial set is P-001's, so the mounts of the act are read from P-001 and P-002 is asserted empty.
15. **The cases run on the host's own mechanism, with no skip.**
    No case names a mechanism, so Seatbelt carries them here and Bubblewrap carries them in CI; the Linux run is therefore CI's, and no container ran in this build.

16. **A record holds no string of the credentials file.**
    The token's value is scrubbed because it is an injected environment value; the file's strings join that set (`registry.loginSecrets`: every string of a JSON file except the public fields of Decision 23, the whole text of any other), so an agent that prints its login file, or a CLI that dumps it on a debug flag, leaves `[redacted]` in the record.
    The guarantee covers strings of eight characters or more, the length the scrub already uses for injected values, and the reference, the manifest's note and the criteria say so.
    A file that does not parse contributes its whole trimmed text, each whitespace-separated token and each quoted string (Decision 26).
    The file case echoes the file through the stub and sweeps the whole evaluation folder.
17. **Two entries that declare one login share one link.**
    `loginLinksOf` keeps one link for each distinct file and location, since a second `symlink` to the same name throws, and the trial's read-only mount is listed once.
18. **A credentials file no profile can carry yields to the token.**
    A path with a quote or a control character cannot enter a Seatbelt profile or a Bubblewrap argument; the run drops the file and grants the token when the host sets it, and is refused when it does not.
19. **An empty login variable is no login.**
    `loginsOf` records none for an empty value, so the target is handed none either (`hostEnvironment`), where the CLI might prefer an empty variable to the file; a variable the entry's own `environmentKeys` names still passes as written.
20. **The read-only link has a consequence the reference states.**
    A CLI that refreshes an expired access token during a call cannot save the new one through the link, so a run that outlasts the access token uses the token route, whose token from `claude setup-token` is long-lived.
    The reference says so, and the home-reset sentence of the reference names the link as the one thing a new home holds for an entry that declares a login.
21. **A hard link to the credentials file is refused.**
    Creating a link to a file requires write privilege on the source (the Seatbelt audit's parser names it `forbidden-link-priv`, and a read-only mount refuses it under Bubblewrap), so the grant stays read-only through a second name.

22. **The scrub covers every request kind, and the host's token value is in the set.**
    The private home with the linked file is shared by every target the sandbox starts (Decision 7), so a tool server or an HTTP server that prints the file leaves its strings in a record as a command target would.
    `hostEnvironmentPort` scrubs `registry.loginSecrets()` from every observation and fault, and the set holds the host's value of each granted login's variable, since a command target can write the token into the shared home for a server target to print.
23. **The adapter declares its public fields.**
    Claude Code's file holds non-secret strings of eight characters or more (`scopes`, `subscriptionType`, `rateLimitTier`), and scrubbing them rewrote an answer's own words before the verdict was computed (a target that printed `Enterprise test review verdict: PASS` was recorded as `[redacted] test review verdict: PASS`).
    `LOGIN_ADAPTERS.claude.publicFields` names them, and `loginSecrets` skips the values under those keys.
    A field the list does not name, a future token field included, is scrubbed.
24. **The supervisor's trace writer retries a refused append.**
    `trace()` in `agent-supervisor.js` appends to one file from four processes, and a Windows sharing violation under load dropped a line silently, which failed the "setup race" case of `test:evaluate-preflight` on the `windows-agent-supervision` job although the agent had started.
    In trace mode the writer retries `EBUSY`, `EPERM`, `EACCES` and `EMFILE` up to 50 times with a 5 ms synchronous wait, and the last error is still swallowed, since a diagnostic never affects supervision.
    The module exports `trace` and runs a role only when it is the process's entry (`require.main === module`), which is the seam the unit case uses.
    The test's assertion is unchanged.
25. **The scrub set is the union of every string the file has held, read again when each call settles.**
    The host's own Claude Code can refresh `.credentials.json` while a call runs, and an agent call lasts minutes, so the target reads the new `accessToken` and `refreshToken` through the link and prints them while a set read before the call holds neither.
    `registry.loginSecrets` keeps a run-long `Set` of every string it has read from each granted file and from each granted variable, and returns the union, so a value rotated out of the file still scrubs in a later call.
    `hostEnvironmentPort` calls it before `port.probe` and again once the call settles, on the success path and in the fault path, and scrubs with both.
    The values under the adapter's public fields join a second run-long set that a torn read consults, so a word such as `enterprise` is not scrubbed because a rewrite caught the file mid-write.
26. **A file that does not parse yields the strings a torn write still carries.**
    A refresh that writes in place can be read half written, `JSON.parse` fails and the whole trimmed text was the one "secret", which no printed token equals.
    `tornStrings` returns the whole trimmed text, each whitespace-separated token and each quoted string that is a value (a quoted key is no secret; an unterminated last string counts), so the token strings of eight characters or more still scrub.
    A plain text login file gains the same tokens, which is the cost of one rule for every file that does not parse.
27. **An opted-out run scrubs the host's credentials file.**
    An opted-out target keeps the host's `HOME` (the dogfood evaluation passes it in `environmentKeys`) and reads the file there, so a print of it would land in a record while the reference, the changelog and the record say no record holds a string of the file.
    `loginsOf` resolves the file for every mode into `scrubFile`, which only `loginSecrets` reads; `file` stays `null` for an opted-out run, no link is made, and `run.json` drops `scrubFile`, so its `logins` are what they were.
28. **The token route's statements are pinned as whole sentences.**
    The reference states the route in the bullet and again in the instruction, so loose substring checks held while either statement was deleted.
    `checkSubscriptionLoginReference` asserts each statement as a whole line of its own (the token bullet, the sentence that closes the other credential variables, the instruction, and the two sentences of this round), and deleting any one fails the case.

## Implementation Notes

- `loginsOf(evaluation, env, { file })` makes one record per command entry that declares a login: `{ interfaceId, executable, login, variable, file, scrubFile }`.
  `variable` is the name when the host sets a non-empty value and null otherwise (the value is read where a request is made and is in no record); `file` is the real path of a regular file (a link is followed) or null for a run that opted out; `scrubFile` is the same real path for every mode and is read only to scrub.
- `selectConfinement` carries `logins` for a confined run and, for an opt-out, the same list with `file: null` and the host's file in `scrubFile`.
- `createRegistry` adds the login variable to the entry's permitted keys, `registry.logins` carries the list, and `createProbePort` plants the links (`loginLinks`) in every home it makes, a reset's new home included.
- The trial's `mounts` add `read-only login <path>` for each file, and the note of every forbidden input names the sources.
- The reference's older sentence, "give such an agent its API key variable instead", is replaced.

## Revert observations

The first two tables ran on the final tree of review round 1, and the third table ran on the final tree of review round 2 (the tree this commit holds).
Every row ran once, applied to a scratch copy under the scratchpad directory with `.git` removed, the named case run there, the failed-check count recorded and the changed file copied back from the working tree.
The run cases are `--only="a confined target's subscription login"` (the case, 84 checks on the final tree), `--only="the subscription login's units"` (the units, 54) and `--only="the subscription login reference"` (the reference, 12), each under `node test/test-evaluate-run.js --group=confinement`; the preflight rows run the whole `node test/test-evaluate-preflight.js` (353 checks).
A case that stops at a missing run directory ends at that check, so its total is the checks run before it; a case that loses a kernel report reruns itself, which the `widen` rows show (two reruns).

| Revert (the one edit)                                                                      | Case run                 | Observed                                                                                                                     |
| ------------------------------------------------------------------------------------------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| No link in the private home (`loginLinks` empty in `registry.js`)                          | the case, then preflight | 8 of 13 fail: the stub finds no login, exits 4 and the run exits 12; 4 of 353 fail: the real runner's preflight exits 3      |
| The login variable left out of the entry's permitted keys                                  | the case, then preflight | 10 of 85 fail: the token run's stub finds no login and the runs after it stop; 3 of 353 fail: the token preflight finds none |
| Every credential variable passes (`ANTHROPIC_API_KEY` and `OPENAI_API_KEY` join the token) | the case                 | 1 of 84 fails: the stub holds three credential variables where the token alone is expected                                   |
| The grant widened to the configuration directory (`linked` names its directory)            | the case                 | 2 of 102 fail: the second file in `.claude` is not an observed mount and `score` does not exit 3                             |
| The grant widened to the home                                                              | the case                 | 4 of 102 fail: neither second file is an observed mount and `score` does not exit 3 for either                               |
| A refused write to the linked file listed (the Seatbelt `quiet` rule without `linked`)     | the case, then the units | 4 of 84 fail: the credentials file is an observed mount of an authenticated run and `score` exits 3; 1 of 54 fails           |
| A host with no source not refused (`selectConfinement`)                                    | the case, then preflight | 9 of 85 fail: the keychain-only host's `run` and `preflight` do not exit 12 and name no way out; 5 of 353 fail               |
| The manifest's note without the logins (`forbiddenInputNote`)                              | the case                 | 2 of 84 fail: the note names neither the file nor the variable                                                               |
| The trial's read-only login mount dropped (`run.js`)                                       | the case                 | 2 of 84 fail: `allowedMounts` does not name the login file                                                                   |
| `loginsOf` records the token's value in place of its name                                  | the case, then the units | 5 of 84 fail (the record, the note and the content sweep name the value); 4 of 54 fail                                       |
| A copy of the file in the private home in place of the link                                | the case, then the units | 4 of 84 fail (the target's write and second name for its login are allowed); 1 of 54 fails (the home's login is no link)     |
| The trace decision without `grants.linked`                                                 | the units                | 1 of 54 fails: a read through the link in the home is listed                                                                 |
| `login` removed from the schema                                                            | the units, then the case | 2 of 15 fail (the entry with `login` is refused); 3 of 4 fail (the declaring run exits 10)                                   |
| The token route and opt-out sentence deleted from the reference                            | the reference            | 1 of 12 fails                                                                                                                |
| The Keychain sentence deleted from the reference                                           | the reference            | 2 of 12 fail                                                                                                                 |

The review rounds' additions were reverted the same way: this table's rows on the final tree of round 1 (the trace row among them), the next table's on the final tree of round 2.

| Revert (the one edit)                                               | Case run                 | Observed                                                                                                            |
| ------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| No login strings in the scrub set (`arm.js`)                        | the case, then preflight | 3 of 84 fail: the echoed file is recorded whole and the content sweep finds a string of it; 2 of 353 fail           |
| `loginLinksOf` without its dedupe                                   | the units                | 2 of 22 fail: two entries over one login give two links, and the home made for them throws                          |
| An empty login variable handed to the target (`hostEnvironment`)    | the units                | 1 of 54 fails                                                                                                       |
| An unsafe credentials path refused when the token is set            | the units                | 1 of 54 fails                                                                                                       |
| The read roots without `linked`                                     | the units                | 2 of 54 fail: the Bubblewrap grants omit the file as read and the Seatbelt profile does not exempt it               |
| The trace grants without the `linked` key                           | the units                | 1 of 54 fails                                                                                                       |
| The scrub gated on a registered command request again (`arm.js`)    | the units                | 4 of 54 fail: the tool call's and the HTTP call's observation and fault keep a string of the file and the token     |
| The host's value of the login variable left out of `loginSecrets`   | the units                | 6 of 54 fail: the secrets lack the value, and the tool call's and the HTTP call's answers and faults keep the token |
| `publicFields` empty                                                | the units, then the case | 5 of 54 fail (the secrets hold `enterprise` and the scopes; the answers lose them); 1 of 84 fails                   |
| The trace writer attempts one append (`TRACE_APPEND_ATTEMPTS` is 1) | preflight                | 4 of 353 fail: the line after three refused appends is dropped for each of the four codes                           |

Round 2's rows, on the final tree of round 2, in the same scratch copy.
The case is 86 checks, the units 71 and the reference 17 on this tree.

| Revert (the one edit)                                                                     | Case run                 | Observed                                                                                                                   |
| ----------------------------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `loginSecrets` returns the strings of one read (no run-long set)                          | the units                | 4 of 71 fail: a later call's observation and fault print the rotated-out tokens, for the whole and the torn rewrite        |
| `hostEnvironmentPort` scrubs with the pre-call set alone (no read after the call settles) | the units                | 4 of 71 fail: the rotating call's observation and fault hold the new tokens, for the whole and the torn rewrite            |
| `tornStrings` replaced by the whole trimmed text                                          | the units                | 8 of 71 fail: the plain file's secrets lack its tokens, and the torn rewrite's tokens are recorded                         |
| `loginSecrets` reads `file` alone (`scrubFile` ignored)                                   | the case, then the units | 2 of 86 fail: the opted-out target's echo of the host file is recorded whole and the sweep finds its strings; 9 of 71 fail |
| The token bullet's first sentence deleted from the reference                              | the reference            | 1 of 17 fails                                                                                                              |
| The sentence "No other credential variable passes, ..." deleted from the reference        | the reference            | 1 of 17 fails                                                                                                              |
| The instruction sentence "Run `claude setup-token` once ..." deleted from the reference   | the reference            | 2 of 17 fail (the sentence, and the section no longer names `"confinement": false`)                                        |
| The opt-out scrub sentence deleted from the reference                                     | the reference            | 1 of 17 fails                                                                                                              |
| The rotation sentence deleted from the reference                                          | the reference            | 1 of 17 fails                                                                                                              |

The first build of the rotation case compared the tokens through a spread that kept only the new pair, so the revert of the run-long set passed; the revert row caught it and the list now holds all four tokens.

The hard link row has no revert, since refusing a second name for the file is the mechanism's behavior (Decision 21); the file case holds it and fails on a host where the link succeeds.

The first build of the file case showed the sixth row's defect before the quiet rule existed: the stub's append to its credentials file was a refused write, listed as an observed mount, and `score` exited 3 over an authenticated run.

## Gates

Run one host-heavy gate at a time, on a machine shared with the other lanes.
No full local `npm test`: the hook and CI carry the chain.

Local, macOS (Seatbelt), on the final tree:

- Engine check (`evaluateTarget` is a function) at the start and at the end: exit 0.
- Round 2, on the final tree: `test:evaluate-confinement` ran once in full, 1,718 checks, green, with the login case at 86 checks, the units at 71 and the login reference at 17.
  `test:evaluate-preflight` 353, `test:evaluate-run` 592, `test:evaluate-agents` 500, `test:evaluate-guidance`, `test:isolation-primitives`, `test:doc-counts`, `test:doc-claims`, `test:shards` 183, `test:ci-coverage`, `test:changelog`: green.
  `npm run docs:validate-links`, `npm run lint`, `npm run lint:md`, `npm run format:check`: green.
  `npm run docs:build` did not run in this round; CI carries it.
- Round 1, on the final tree: `test:evaluate-confinement` ran once in full, 1,653 checks, green, with the login case at 84 checks, the units at 54, the login reference at 12 and no rerun of a lost report.
- `test:evaluate-preflight` 353, `test:evaluate-run` 592, `test:evaluate-agents` 500, `test:evaluate-evaluators` 800, `test:evaluate-check` 1,232, `test:evaluate-boundaries` 500, `test:evaluate-mcp` 227, `test:evaluate-api` 4,465, `test:cli`, `test:evaluate-guidance`, `test:isolation-primitives`: green.
  `test-windows-job-owner-probe.js`, the other reader of `agent-supervisor.js`, skips outside Windows; the Windows run is the `windows-agent-supervision` job's.
- `test:doc-counts`, `test:doc-claims`, `test:shards` 183, `test:ci-coverage`, `test:changelog`, `test:release-metadata`: green.
- `npm run docs:validate-links`, `npm run lint`, `npm run lint:md`, `npm run format:check`: green.
- `npm run docs:build`: green on the final tree.
- Round 0's gates, for the tree before this round: `test:evaluate-confinement` 1,633 checks with 2 failures that round fixed (a keychain read the kernel's log lost on a saturated host, and the reference's network-claim scan, which asked for the three new sentences to be backed by a case, held now by `checkBridgeReference`'s claim list).
- Linux: no container ran in this build.
  The ubuntu CI job runs the file, second-file, token, record, refusal and keychain stand-in cases and the real-runner preflight under Bubblewrap and `strace`.
  `checkSubscriptionLoginUnits` reads the Linux trace decision for a read through the link and the sandbox's grants as functions on this host.
- No real Claude Code CLI was started, no credential location was inspected and no live run of the dogfood evaluation was made.
- `git diff -- package.json package-lock.json` is empty.

## Build review

Round 0: one subagent reviewed the uncommitted change in three lenses (correctness and security, test quality, compliance), read only, in place of `/bmad-code-review`.
Every finding was checked against the code before it was acted on.

| Finding                                                                                                                                                                                                                                                | Verdict    | Route                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Medium (correctness): two entries that both declare `login` made `makeTargetHome` plant the same link twice, which throws, on every run and every home reset                                                                                           | valid      | Fixed: `loginLinksOf` keeps one link per distinct file and location, and the trial's mount is listed once (Decision 17); the units case holds it                                                                        |
| Medium (correctness): "no record holds the file's content" had no enforcement, since only the token's value joined the scrub set                                                                                                                       | valid      | Fixed: `registry.loginSecrets` joins the file's strings to the scrub set, the claim says "a string of eight characters or more", and the file case echoes the file and sweeps the whole evaluation folder (Decision 16) |
| Medium (correctness): the read-only link cannot save a refreshed access token, and nothing user-facing said so                                                                                                                                         | valid      | Fixed: the reference says a run that outlasts the access token uses the token route (Decision 20)                                                                                                                       |
| Low (correctness): an unsafe credentials path refused the run even with the token set                                                                                                                                                                  | valid      | Fixed: the file is dropped and the token is granted (Decision 18)                                                                                                                                                       |
| Low (correctness): an empty token variable was handed to the target while the record named no variable                                                                                                                                                 | valid      | Fixed: `hostEnvironment` omits it (Decision 19)                                                                                                                                                                         |
| Low (correctness): a hard link to the credentials file could re-open the write                                                                                                                                                                         | checked    | No change: link creation needs write privilege on the source, and the file case asserts the refusal (Decision 21)                                                                                                       |
| Medium (tests): no unit held `targetSandbox`'s plumbing of `linked` into the trace grants or the Seatbelt profile                                                                                                                                      | valid      | Fixed: the units case builds both sandboxes with stub executables and reads the grants and the profile text                                                                                                             |
| Low (tests): `.every` over possibly empty lists in the preflight case, `score` asserted only `!== 3`, a dead `STUB-TRY-READ` marker                                                                                                                    | valid      | Fixed: length guards, `score` asserted below 3, the marker removed                                                                                                                                                      |
| Low (tests): no case for two entries, an unsafe path with the token, an empty token                                                                                                                                                                    | valid      | Fixed: units cases for each                                                                                                                                                                                             |
| Low (compliance): several multi-sentence lines in the `epics.md` and `ARCHITECTURE-SPINE.md` amendments, "until a live run proves" deferral wording, the home-reset sentence of the reference without the link exception, the unfilled record sections | valid      | Fixed in this commit                                                                                                                                                                                                    |
| Low (tests): `checkSubscriptionLogin` is long for one shard                                                                                                                                                                                            | considered | No change: the run's confinement group is one script, and a host that loses a kernel report reruns the case up to twice, which the group's `lossy` marker already does                                                  |

Round 0 left no finding open.

Round 1: the coordinator's Opus review of PR #339 (code lens and tests lens), every finding reproduced before it was fixed.

| Finding                                                                                                                                                                                                                               | Verdict | Route                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High (both lenses): login-file strings were scrubbed only from registered command requests, while the private home is shared by every target; a `cli` observation came back `[redacted]` and an `mcp` observation held the token      | valid   | Fixed: `hostEnvironmentPort` scrubs every request kind, `loginSecrets` adds the host's value of each granted variable, and the units drive a command, a tool server and an HTTP server (Decision 22)                 |
| Medium (code lens): `loginSecrets` collected the non-secret strings (`scopes`, `subscriptionType`, `rateLimitTier`), so `Enterprise test review verdict: PASS` was recorded `[redacted] test review verdict: PASS` before the verdict | valid   | Fixed: `LOGIN_ADAPTERS.claude.publicFields`, skipped by `loginSecrets`; the file case echoes the documented shape and asserts `enterprise` and `user:inference` survive while both tokens are redacted (Decision 23) |
| Low (tests lens): the test design said removing the link or the variable makes the preflight exit 12, and both exit 3                                                                                                                 | valid   | Fixed: the cell says exit 3, as `ungranted.status === 3` asserts                                                                                                                                                     |
| Low (tests lens): this record's counts and a case name did not match the final tree, and its revert table ran on no stated tree                                                                                                       | valid   | Fixed: every revert row reran on the final tree of this round and the record states which tree each table ran on; the three new reference sentences are held by `checkBridgeReference`                               |
| Low (writing rule): multi-sentence lines in the test design, this record and the added comments                                                                                                                                       | valid   | Fixed: one sentence per line across the PR's added markdown and comments                                                                                                                                             |
| Flake (not in this PR's files): the "setup race" case failed on `windows-agent-supervision` because `trace()` dropped a line when a refused append was swallowed                                                                      | valid   | Fixed at the writer with a bounded retry, and a unit case that stubs the refusals (Decision 24); the case's assertion is unchanged                                                                                   |

Round 2: the coordinator's Opus review of PR #339 (code lens and tests lens), every finding reproduced before it was fixed.

| Finding                                                                                                                                                                                                                                  | Verdict | Route                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Medium (code lens): the file's strings were read once before `port.probe`, so a refresh by the host's own Claude Code during a call left the new tokens out of the set, and a read caught mid-write made the whole text the one "secret" | valid   | Fixed: a run-long union in `loginSecrets`, a second read after the call settles on the success and the fault path, and `tornStrings` for a file that does not parse (Decisions 25 and 26); `checkLoginScrubbedAfterRotation` holds each, with a revert row |
| Medium (tests lens): an opted-out run that declares a login left the file's strings unscrubbed, since `loginsOf` gave `file: null` and a target reading the host's file through its own `HOME` printed it into the record                | valid   | Fixed: `scrubFile` resolves the host's file for every mode and only `loginSecrets` reads it, `run.json` keeps `file: null` and drops `scrubFile` (Decision 27); the opt-out case passes `HOME`, reads the fake file and sweeps for its strings             |
| Low (tests lens): `checkSubscriptionLoginReference` matched `claude setup-token` and `CLAUDE_CODE_OAUTH_TOKEN` as loose substrings, so deleting either statement of the route left every check green                                     | valid   | Fixed: each statement is a whole-line assertion (Decision 28), and each deletion fails the case                                                                                                                                                            |
| Low (wording): splitting sentences in round 1 left mid-sentence breaks in the comments of `confinement.js`, `confinement-audit.js`, `registry.js`, the verdict fixture and the stub CLI                                                  | valid   | Fixed: each sentence of a comment this PR added or changed sits on one line                                                                                                                                                                                |

Round 2 left no finding open.
