# Evidence Integrity

## Principle

A suite lies in two ways. A test that **cannot fail** reports coverage it does not have, and a diagnostic that **could not measure** reports a verdict it did not earn. Both produce green that means nothing, and the second one is worse, because a false negative sends the investigation somewhere wrong and every conclusion downstream inherits the error. Every check needs a way to fail. Every probe needs three states (pass, fail, and could-not-measure) and has to observe the thing it reports on rather than a proxy that correlates with it.

## Rationale

**The Problem**: Suites are scored by their result, so pressure runs one direction. An assertion that never fires, a step marked `continue-on-error`, a runner manifest that names three of eighteen files, a probe that reports "unreachable" when the tool it needed was missing: each converts an unknown into a green. Nothing in a CI summary distinguishes a passing check from a check that had no way to fail, and nothing distinguishes "the device could not reach the host" from "the command I used to ask was not installed."

**The Solution**: Treat falsifiability as a property to verify, the same as any other. For every check, name the input that would turn it red; if you cannot, the check is decoration. For every diagnostic, separate the measurement from the verdict, make the absence of a measurement its own reported state rather than a silent fail verdict, and name what else could have made it pass.

**Why This Matters**:

- Green means the behavior works instead of meaning the harness ran
- A failing diagnostic points at the real fault instead of at whichever tool was missing
- Root-cause work stops compounding on unearned verdicts
- Gate decisions (PASS / CONCERNS / FAIL) rest on evidence that would have shown the defect

## Pattern Examples

### Example 1: The Check That Cannot Fail

**Context**: Five shapes found live in one suite that reported success on every run.

**Implementation**:

```yaml
# ❌ Shape 1: an optional assertion downstream of a command that is a no-op here.
# `back` is Android and Web only; on iOS it does nothing and still reports COMPLETED.
# The assertion then cannot fail either, because `optional: true` swallows the miss.
# Neither half can go red, and this pair asserted a Home-screen label from a screen
# the flow never visits.
- back
- assertVisible:
    text: 'Home'
    optional: true

# ✅ Falsifiable: branch the platform, then assert without an escape hatch
- runFlow:
    when:
      platform: Android
    commands:
      - back
- runFlow:
    when:
      platform: iOS
    commands:
      - tapOn:
          id: 'nav_back_button'
- assertVisible:
    id: 'home_screen_root'
```

```yaml
# ❌ Shape 2: the job that runs the tests cannot turn the build red
- name: E2E flows
  continue-on-error: true
  run: maestro test maestro/

# ✅ continue-on-error belongs on artifact collection, never on the test step
- name: E2E flows
  run: maestro test maestro/
- name: Upload artifacts
  if: always()
  uses: actions/upload-artifact@v4
```

```yaml
# ❌ Shape 3: the manifest names 3 of the 18 flows in the directory.
# The suite is green because fifteen files never ran.
flows:
  - login.yaml
  - checkout.yaml
  - profile.yaml

# ✅ Include by pattern, exclude by exception, and assert the executed count
flows:
  - '*.yaml'
```

**Shape 4** has no snippet, because the step looks correct: an assertion passes on iOS because the element is still in the hierarchy behind a presented modal, and fails on Android where the modal replaces the hierarchy. Same assertion, different meaning per platform. Any assertion whose truth depends on how a platform composes its view tree needs its own per-platform expectation, not one shared line.

**Shape 5: the assertion is about something that was already true before the action.** A flow opened a deep link and then asserted that a container belonging to the screen it was already on was visible. The container predated the link, so the check held whether or not the link did anything, and on one platform it did nothing. The suite reported all flows green with this one included, and the green was stable rather than intermittent.

Two tells for it, both cheap:

- **The name promises an effect the assertions never mention.** "Widget Deep Link Hydration" asserted the presence of a container, not that anything had hydrated. Read the flow's name as a claim and check that some assertion carries it. A name is the only place many suites record what a test was for, which makes disagreement between name and assertion a reliable smell.
- **The result differs across environments for reasons unrelated to what it asserts.** The identical vacuous flow was green in CI and red locally, because on one API level the unresolvable link errored and on another it resolved somewhere and the open step completed. When a flow's outcome tracks an environment difference that its assertions never mention, suspect that the assertions are not what is deciding the result.

The fix generalizes past this shape: **assert the transition rather than the state.** Where only a single state is available, choose an input whose expected value differs from the application's default, so agreement with the default cannot carry the pass. Asserting "the morning option is selected" after an action that selects morning proves nothing in an app that starts on morning; asserting that a second action **moved** the selection, and that the first option is no longer selected, cannot pass without the action working.

**Key points**:

- Name the input that would turn each check red. If none exists, the check is decoration.
- `optional: true`, `continue-on-error`, a partial manifest, and a soft assertion are four common ways a result stops being falsifiable.
- A fifth, and the hardest to see in review: the assertion is true before the action runs. Nothing about the step looks wrong, and the green is stable.
- **When you make a hollow check falsifiable and it goes red, the red is the finding.** It is a defect that was always there and is now visible. Reporting it as a regression you introduced is the wrong read and usually gets the fix reverted.

### Example 2: Diagnostics Need a Could-Not-Measure State

**Context**: A probe checking whether a device can reach a host. The tool it invokes is not installed on that device.

**Implementation**:

```bash
# ❌ Two states only. A missing binary is indistinguishable from a real failure,
# and this reported "device cannot reach the network" three times in one session
# while the network was fine.
if adb shell "wget -q -O - http://10.0.2.2:8081/status"; then
  echo "PASS: device reached the dev server"
else
  echo "FAIL: device cannot reach the dev server"
fi

# ✅ Three states. Establish the instrument before trusting the reading.
if ! adb shell 'command -v curl >/dev/null 2>&1'; then
  echo "COULD-NOT-MEASURE: no HTTP client on the device; reachability unknown"
  exit 77
fi
if adb shell "curl -fsS http://127.0.0.1:8081/status >/dev/null 2>&1"; then
  echo "PASS: device reached the dev server"
else
  echo "FAIL: device reached the network stack and the request did not succeed"
fi
```

**A probe fails in two directions, and both produce a confident wrong answer.** The block above is the strict failure: a missing instrument read as a false condition. The permissive failure is subtler and harder to catch, because it produces a green. The same investigation later probed reachability by having the device open a TCP connection to a port that `adb reverse` had mapped. With a reverse mapping in place the device always has a local listener on that port, so the connect succeeds whether or not anything on the host is behind it. The probe measured that a mapping existed and reported that a service was reachable.

**Rule**: a probe must observe the thing it claims to observe, never a proxy that merely correlates with it. Ask what else could make this check pass. Here the fix is the same as Example 4: open a throwaway listener inside the test process and assert that the process itself accepted a socket.

**A probe must also send the same request the real client sends.** A harness health-checked its development server's manifest endpoint and reported "manifest served, HTTP 200, multipart/mixed" through five consecutive red runs. It omitted one request header the app under test always sends, and that header selects a different branch through the server's middleware. Both results were correct at the same time: the endpoint the probe asked for was healthy, and the endpoint the app asked for was failing. Copy the client's method, headers, and body shape into the probe, or derive the probe from the client's own code path, and log which request was actually sent so the next reader can check the correspondence instead of assuming it.

**Key points**:

- A non-zero exit means "the command failed," which is not the same claim as "the condition is false"
- A zero exit means "the command succeeded," which is not the same claim as "the condition is true"
- Reserve a distinct exit code and a distinct log word for could-not-measure so it never reads as a fail
- Apply this to every derived verdict, including the ones a harness prints as a convenience line. A convenience line is quoted later as evidence.

### Example 3: Verify the Property Exists, Then Verify It Behaves

**Context**: Two separate failures, one about existence and one about behavior.

- **Existence**: a config key was invented from a plausible name and committed. The runner rejected the file on a parse error and 18 flows never executed. Nothing in the suite name suggested the cause.
- **Behavior**: a comment claimed a command was "a left-edge swipe on iOS." The implementation is an empty method that reports success. The comment propagated into other files and into a second session's reasoning before anyone opened the source.

**Rule**: before using a framework property, confirm it exists in the version you pin, from the docs or the shipped artifact. Before writing a comment that asserts **why** something works, confirm the mechanism from the docs or the source. A comment stating a mechanism is a claim with the same evidentiary standing as an assertion, and it is more dangerous, because nothing tests it.

Corollary for reviewers: "X is not supported / is platform-specific / only works on Y" needs a citation. One session asserted a flag was GNU-only when the platform's own manual documents it.

### Example 4: Take the Verdict on the Side That Can Prove It

**Context**: A host-side reachability check used to argue that a device could reach a service.

The host and the device are different network namespaces. A host that resolves and connects proves the host's route and nothing about the guest's. Move the assertion to the side whose route is in question: open a throwaway listener on the host, have the device connect to it, and let the verdict be "this process observed the socket." Structure every environment claim so the proving party is the one that emits the result.

### Example 5: State the Environment Asymmetry Before Arguing From Local to CI

**Context**: A local pass used as evidence about a CI failure.

Write the asymmetry down whenever a local result enters a CI argument:

| Axis            | Local                                      | CI                                 |
| --------------- | ------------------------------------------ | ---------------------------------- |
| OS / arch       | macOS, arm64                               | Linux, x86_64                      |
| Platform ver.   | newest API level                           | two levels older                   |
| Image variant   | vendor image with store services signed in | plain AOSP-style image, no account |
| Acceleration    | native hypervisor                          | KVM, may be unavailable            |
| Provisioning    | long-lived machine                         | fresh runner every job             |
| Screen geometry | 914dp tall (1080x2400 at 420dpi)           | 807dp tall (1080x2220 at 440dpi)   |
| Credentials     | a developer session already on disk        | whatever the secret store supplies |

A local pass proves the application path. It proves nothing about acceleration, snapshot restore, `PATH` handling, or an image variant the local machine never runs. Naming the axes converts "it works on my machine" from an argument into a scoped fact.

Two of those axes are worth calling out because they read as trivia and are not:

- **Screen geometry decides what is on screen, and "visible" usually means on screen.** The row above is a real pair: a 12% shorter viewport pushed content below the fold and failed four unrelated UI assertions on the runner while every developer machine stayed green. Compare the density-independent height, not the pixel resolution; the two profiles in that row share `1080x` and are different screens.
- **A developer machine accumulates credentials that a fresh runner has never had.** A cached session file or a fetched certificate sitting in a home directory makes a whole code path invisible locally. When a failure exists only in CI and nothing about the code explains it, ask what the local machine has lying around that the runner does not.

### Example 6: Resolve Environment-Dependent Values Before Anything Derives From Them

**Context**: A harness that probed which host address the device could reach, and ran the probe after that address had already been baked into the built artifact.

The probe would have reported the right answer and changed nothing, and the app would have loaded over one route while its API calls went over another. Order of operations is part of correctness in a harness: resolve every environment-dependent value first, then derive. If a value is discovered after its consumers are built, the discovery is telemetry rather than configuration.

### Example 7: Verifying the Act Is Not Verifying the Outcome

**Context**: A setting written to a running device, read back, and reported as being in effect.

A harness set `hide_error_dialogs=1` on an emulator, read the value back, confirmed it matched, and logged "system crash dialogs suppressed". The write had happened. The dialog appeared anyway: that setting is latched into the framework at boot and on configuration change, so writing it to an already-running device does not necessarily take effect. Reading a value back proves the write, and the write was never the claim.

**Rule**: name the observable the claim is about, and check that one. For a suppressed dialog it is the absence of the dialog in the view hierarchy, not the presence of the flag in the settings store. This is the same substitution as a proxy probe, moved one step earlier: the act stands in for the outcome instead of a correlate standing in for the condition. Configuration that a platform reads once, at a moment you do not control, is where it hides.

### Example 8: Record What a Change Did, Not What It Was For

**Context**: A fix introduced for one failure and kept after it turned out not to fix it.

One investigation removed a live feature-flag service from an end-to-end run, so a per-user flag that had been evaluated remotely fell back to a seeded database row. **It did not fix the flow it was introduced for.** It was kept anyway, because removing a remote dependency from an E2E run is correct on its own terms, and the write-up says all three things: what it was for, that it did not do that, and why it stayed.

A change described by its intent after its effect is known is a landmine for the next investigation, because the next reader takes the commit message as evidence that the cause was found and stops looking. State the outcome separately from the intent. "Kept for a different reason, and labelled as such" costs one sentence and saves someone a re-derivation.

### Example 9: Order Hypotheses by the Cost of the Measurement That Kills Them

**Context**: A UI assertion failing on "not visible". Three plausible mechanisms, all wrong.

One investigation built three separate explanations for the same failure, each with a real code path behind it: a remote flag service answering false, an unresolved dynamic import leaving state null, and a stuck initialization call. Each was written up with its reasoning. Two measurements ended all three at once: a device log line showing the module had loaded, and a direct API query showing the flag was true. The actual cause was that the element sat below the fold, which one lookup in the captured view hierarchy would have shown at the start.

**Rule**: before elaborating a mechanism, list the measurements available and what each would eliminate, then take the cheapest one that kills a whole class of hypothesis. A plausible mechanism is not evidence, and producing more of them feels like progress while the discriminating observation goes untaken. The tell is a session holding several explanations and no new measurements.

The corollary for a suite: that cheap discriminating measurement should already be sitting in the artifacts. This is why capturing state at failure earns its storage cost, and why "the artifacts could not tell us" is a finding about the harness rather than an inconvenience.

## Anti-Patterns

| Anti-pattern                                                            | Why it fails                                                                          | Fix                                                                                   |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Assertion with a soft or optional modifier as default                   | Cannot go red; reports coverage that does not exist                                   | Reserve softness for genuinely optional UI, and assert the outcome hard               |
| Assertion that was already true before the action                       | Cannot distinguish the action working from the action doing nothing                   | Assert the transition, or an input whose expected state differs from the default      |
| Flow name promising an effect no assertion mentions                     | The name records the intent and nothing checks it                                     | Read the name as a claim; make some assertion carry it                                |
| Outcome tracking an environment difference the assertions never mention | Something other than the assertions is deciding the result                            | Suspect a vacuous check before investigating the environment                          |
| A surface declared untestable without a test of the claim               | Coverage is dropped on an assumption, and the assumption is often wrong               | Try it; then name precisely which part is out of reach and why                        |
| `continue-on-error` on the test step                                    | The suite cannot fail the build                                                       | Put it on artifact collection only; use `if: always()` for uploads                    |
| Runner manifest listing a subset of the suite                           | Files silently never run; the count is the only clue                                  | Include by pattern; assert the executed count against the file count                  |
| Missing tool reported as a failed condition                             | Sends the investigation at the wrong subsystem                                        | Three-state probes; distinct exit code for could-not-measure                          |
| Probe observing a proxy that correlates with the target                 | Passes for a reason unrelated to the claim, and a green is never re-examined          | Ask what else could make this pass; observe the thing itself                          |
| Probe sending a different request than the client                       | Takes a different branch through the server: healthy probe, failing app, both correct | Copy the client's method, headers, and body into the probe, and log what was sent     |
| Written setting read back and reported as effect                        | Proves the write; some configuration latches at boot and never applies live           | Assert the observable the claim is about, not the act that was supposed to produce it |
| Change described by its intent once its effect is known                 | Reads as a found root cause and stops the next investigation looking                  | Record what it actually did, and why it was kept                                      |
| Mechanisms elaborated while the cheap measurement goes untaken          | Plausibility feels like progress; several explanations, no new evidence               | Rank hypotheses by the cost of the observation that would kill them                   |
| Verdict emitted by the side that cannot observe it                      | Proves the wrong namespace                                                            | Move the assertion to the party whose route or state is in question                   |
| Comment asserting a mechanism with no source read                       | Propagates into other files and into other people's reasoning                         | Cite the doc or source line, or omit the mechanism                                    |
| Local result used as a CI argument, asymmetry unstated                  | Hides the axes that actually differ                                                   | Tabulate the differing axes with the claim                                            |
| Environment probe running after its consumers                           | The answer arrives too late to configure anything                                     | Resolve environment-dependent values first, then derive                               |
| Reverting a newly-red check as a regression                             | Restores the hollow green and loses the finding                                       | Treat the red as the pre-existing defect it exposed                                   |

## Evidence Integrity Checklist

- [ ] **Every check is falsifiable**: for each assertion, the input that turns it red is nameable
- [ ] **No soft assertion by default**: optional modifiers only on genuinely optional UI, with a comment
- [ ] **The assertion carrying the outcome post-dates its action**: a precondition assertion is allowed when it is labelled as one, and nothing already true before the step is presented as proof of it
- [ ] **Names reconciled with assertions**: what a test is called is carried by something that can fail
- [ ] **Untestable claims tested**: a surface is dropped from coverage only after the claim itself has been checked
- [ ] **No `continue-on-error` on a test step**: only on artifact collection
- [ ] **Executed count reconciled**: the number of tests that ran matches the number of test files discovered
- [ ] **Platform-divergent assertions split**: no single assertion whose meaning depends on how a platform composes its view tree
- [ ] **Probes are three-state**: pass, fail, and could-not-measure, with distinct exit codes
- [ ] **Probes observe their own claim**: no proxy that merely correlates with the condition being reported
- [ ] **Probes issue the client's request**: same method, headers, and body shape as the code path they stand in for
- [ ] **Outcomes verified, not acts**: a write, a set flag, or a dispatched action is not evidence that behavior changed
- [ ] **Instruments verified before readings**: the probe confirms its tool exists before interpreting its result
- [ ] **Framework properties verified**: every key, flag, and command confirmed against the pinned version's docs or artifact
- [ ] **Mechanism comments cited**: any comment claiming why something works names its source
- [ ] **Verdicts emitted by the proving party**: cross-boundary claims asserted on the side that can observe them
- [ ] **Environment asymmetry stated**: local-versus-CI arguments list the differing axes
- [ ] **Resolution precedes derivation**: environment-dependent values resolved before any consumer is built
- [ ] **Effects recorded separately from intent**: a change kept for a reason other than the one it was made for says so
- [ ] **Cheapest discriminating measurement taken first**: no mechanism elaborated while an available observation would eliminate a class of hypothesis

## Integration Points

- **Used in workflows**: `*test-review` (the CRITICAL rows exist to catch checks that cannot fail), `*ci` (gate wiring and artifact steps), `*nfr-assess` (a measurement that could not be taken is CONCERNS, never PASS), `*trace` (coverage claims), `*automate` and `*atdd` (generated checks must be falsifiable)
- **Related fragments**: `confidence-gate.md` (do not fabricate the artifact in the first place), `test-quality.md` (determinism and isolation), `risk-governance.md` (what a gate decision may rest on), `mobile-ci-device-lab.md` (where these failures concentrate on mobile)
- **Tools**: any CI summary, the runner's own executed-test count, exit codes

_Source: TEA quality-gate standards; hollow-green and false-negative diagnostic patterns observed in a live mobile CI investigation_
