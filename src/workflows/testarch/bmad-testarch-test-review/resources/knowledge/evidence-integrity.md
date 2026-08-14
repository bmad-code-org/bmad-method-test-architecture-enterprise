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

**Context**: Four shapes found live in one suite that reported success on every run.

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

**Key points**:

- Name the input that would turn each check red. If none exists, the check is decoration.
- `optional: true`, `continue-on-error`, a partial manifest, and a soft assertion are the four common ways a result stops being falsifiable.
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

| Axis          | Local                                      | CI                                 |
| ------------- | ------------------------------------------ | ---------------------------------- |
| OS / arch     | macOS, arm64                               | Linux, x86_64                      |
| Platform ver. | newest API level                           | two levels older                   |
| Image variant | vendor image with store services signed in | plain AOSP-style image, no account |
| Acceleration  | native hypervisor                          | KVM, may be unavailable            |
| Provisioning  | long-lived machine                         | fresh runner every job             |

A local pass proves the application path. It proves nothing about acceleration, snapshot restore, `PATH` handling, or an image variant the local machine never runs. Naming the axes converts "it works on my machine" from an argument into a scoped fact.

### Example 6: Resolve Environment-Dependent Values Before Anything Derives From Them

**Context**: A harness that probed which host address the device could reach, and ran the probe after that address had already been baked into the built artifact.

The probe would have reported the right answer and changed nothing, and the app would have loaded over one route while its API calls went over another. Order of operations is part of correctness in a harness: resolve every environment-dependent value first, then derive. If a value is discovered after its consumers are built, the discovery is telemetry rather than configuration.

## Anti-Patterns

| Anti-pattern                                            | Why it fails                                                                 | Fix                                                                     |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Assertion with a soft or optional modifier as default   | Cannot go red; reports coverage that does not exist                          | Reserve softness for genuinely optional UI, and assert the outcome hard |
| `continue-on-error` on the test step                    | The suite cannot fail the build                                              | Put it on artifact collection only; use `if: always()` for uploads      |
| Runner manifest listing a subset of the suite           | Files silently never run; the count is the only clue                         | Include by pattern; assert the executed count against the file count    |
| Missing tool reported as a failed condition             | Sends the investigation at the wrong subsystem                               | Three-state probes; distinct exit code for could-not-measure            |
| Probe observing a proxy that correlates with the target | Passes for a reason unrelated to the claim, and a green is never re-examined | Ask what else could make this pass; observe the thing itself            |
| Verdict emitted by the side that cannot observe it      | Proves the wrong namespace                                                   | Move the assertion to the party whose route or state is in question     |
| Comment asserting a mechanism with no source read       | Propagates into other files and into other people's reasoning                | Cite the doc or source line, or omit the mechanism                      |
| Local result used as a CI argument, asymmetry unstated  | Hides the axes that actually differ                                          | Tabulate the differing axes with the claim                              |
| Environment probe running after its consumers           | The answer arrives too late to configure anything                            | Resolve environment-dependent values first, then derive                 |
| Reverting a newly-red check as a regression             | Restores the hollow green and loses the finding                              | Treat the red as the pre-existing defect it exposed                     |

## Evidence Integrity Checklist

- [ ] **Every check is falsifiable**: for each assertion, the input that turns it red is nameable
- [ ] **No soft assertion by default**: optional modifiers only on genuinely optional UI, with a comment
- [ ] **No `continue-on-error` on a test step**: only on artifact collection
- [ ] **Executed count reconciled**: the number of tests that ran matches the number of test files discovered
- [ ] **Platform-divergent assertions split**: no single assertion whose meaning depends on how a platform composes its view tree
- [ ] **Probes are three-state**: pass, fail, and could-not-measure, with distinct exit codes
- [ ] **Probes observe their own claim**: no proxy that merely correlates with the condition being reported
- [ ] **Instruments verified before readings**: the probe confirms its tool exists before interpreting its result
- [ ] **Framework properties verified**: every key, flag, and command confirmed against the pinned version's docs or artifact
- [ ] **Mechanism comments cited**: any comment claiming why something works names its source
- [ ] **Verdicts emitted by the proving party**: cross-boundary claims asserted on the side that can observe them
- [ ] **Environment asymmetry stated**: local-versus-CI arguments list the differing axes
- [ ] **Resolution precedes derivation**: environment-dependent values resolved before any consumer is built

## Integration Points

- **Used in workflows**: `*test-review` (the CRITICAL rows exist to catch checks that cannot fail), `*ci` (gate wiring and artifact steps), `*nfr-assess` (a measurement that could not be taken is CONCERNS, never PASS), `*trace` (coverage claims), `*automate` and `*atdd` (generated checks must be falsifiable)
- **Related fragments**: `confidence-gate.md` (do not fabricate the artifact in the first place), `test-quality.md` (determinism and isolation), `risk-governance.md` (what a gate decision may rest on), `mobile-ci-device-lab.md` (where these failures concentrate on mobile)
- **Tools**: any CI summary, the runner's own executed-test count, exit codes

_Source: TEA quality-gate standards; hollow-green and false-negative diagnostic patterns observed in a live mobile CI investigation_
