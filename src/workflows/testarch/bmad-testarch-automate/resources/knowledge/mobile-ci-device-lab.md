# Mobile Device Lab in CI

## Principle

Before a single flow is written, decide **which artifact the flows run against**. That one decision fixes the failure surface of the whole suite: a compiled build is a file the runner installs, while a development-client shell served by a live dev server adds a metro process, a manifest HTTP exchange, and a bundle download to every launch. Everything else in a device lab (emulator snapshots, version pinning, artifact layout, sharding) is mechanical once the artifact is right, and unfixable while it is wrong.

## Rationale

**The Problem**: Mobile CI failures are usually attributed to "flaky emulators." Most of them are not. They are a launch path that only exists in CI, a snapshot that silently never restores, a runner version eight releases from local, or a diagnosis read off the wrong artifact. Teams then add retries, which converts a reproducible configuration defect into an intermittent one.

**The Solution**: Ship the app as a build artifact so the launch path in CI is the launch path users get. Make the emulator boot from a cached snapshot and prove that it did. Pin the runner version and assert the resolved version. Read the failure out of the hierarchy dump instead of the screenshot.

**Why This Matters**:

- Flows exercise the shipped app instead of a development shell
- Emulator boot drops from tens of seconds to a few, and the saving is verifiable
- Failures name the step that broke and what was on screen when it broke
- CI-only failure modes stop being written into flow files as workarounds

## The Build Artifact Decision

| Artifact                                               | What it proves                                       | What it costs                                                                     | Use for                        |
| ------------------------------------------------------ | ---------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------ |
| **Release-shaped build** (unsigned APK, simulator IPA) | The binary users get, including all native modules   | A build step per change, or a cached build keyed on native inputs                 | The default for every CI suite |
| **Development build / dev client**                     | The app with dev tooling, all native modules present | A build step, plus a dev server when the JS bundle is served rather than embedded | Local iteration, debug flows   |
| **Prebuilt development shell (for example Expo Go)**   | That the JS runs inside someone else's container     | A live dev server, a manifest exchange, and a launch through a third-party app    | Manual smoke work only         |

**Rule**: the prebuilt shell is the wrong artifact for E2E. It cannot load your native modules, so any flow touching notifications, OAuth, deep or universal links, maps, in-app purchases, or any feature that hands an API key to native code can only assert the feature is **absent**. Deep linking is how most device flows enter a screen, which makes the hole load-bearing rather than marginal.

Expo's own CI tutorial builds a dedicated EAS profile for this (`e2e-test`, with `withoutCredentials: true`, Android `buildType: "apk"`, and iOS `simulator: true`) and runs Maestro against those builds. It never runs the flows through Expo Go. See <https://docs.expo.dev/tutorial/cicd/e2e-tests/> and <https://expo.dev/blog/expo-go-vs-development-builds>.

The cost of getting this wrong is measurable in flow source. In one audit, about 120 of 195 lines in a single launch subflow existed solely to fight the development shell (dev-server readiness, manifest retries, a third-party app's own UI), and most of the defects fixed that week would not have existed against a compiled build. Workarounds for a wrong artifact do not stay in the harness; they migrate into the flows and become the suite.

## If the Suite Must Run Against a Dev Server

Sometimes the compiled build is not ready yet and the dev-server path has to work for one release. Treat it as a temporary configuration with these constraints:

- **Reach the host over the debug bridge, not the guest NIC.** `adb reverse tcp:8081 tcp:8081` tunnels over the adb transport, so it survives emulator network breakage that would kill a `10.0.2.2` route. Pin the device with `adb -s <serial>` when more than one is attached.
- **Do not verify the forward by connecting to it from the device.** A reverse mapping gives the device a local listener on that port unconditionally, so the connect succeeds whether or not anything on the host is behind it. That probe measures that the mapping exists and reports that the server is reachable. Prove it from the host process instead: accept a socket and assert that the accept happened.
- **Do not assume the toolchain set it up.** Expo CLI issues `adb reverse` from the path where the CLI itself opens the app. Start the server without that flag and the forward silently never happens.
- **Health-check the manifest the way the client asks for it.** A bare `GET /` with no headers returns `200` and a browser interstitial, so a harness can log "dev server reachable" while every client request fails. Send the headers the client sends (the platform header plus `accept: multipart/mixed`), and log the response body: the CLI serializes manifest-path errors as a JSON `error` payload with status `500`.
- **Read the discriminating log line.** `Remote update request not successful` is emitted at exactly one place in `expo-updates`, guarded by the HTTP client's 200-299 check. If it appears, an HTTP response arrived with an error status, which makes it a manifest or HTTP problem and rules out connectivity. The surrounding generic lines (`Failed to download remote update`, `Failed to launch embedded or launchable update`) appear for any failure including connection-refused, so only the specific line carries information. Source: `packages/expo-updates/android/src/main/java/expo/modules/updates/loader/FileDownloader.kt` in <https://github.com/expo/expo>.
- **Expect the app config to be evaluated per request.** The manifest handler re-reads the project config on every manifest request, so config plugins run per request. Anything environment-sensitive in that config is a live macOS-versus-Linux divergence axis.
- **Do not build on undocumented packager host variables.** They carry a "drop the undocumented env variables" note upstream, and setting one can break a working `adb reverse` plus loopback setup by advertising a different host back to the client.

## Android Emulator on Hosted Runners

Using `reactivecircus/android-emulator-runner`:

- **The `script:` input is not a shell script.** It is trimmed, split on newlines, and each surviving line is executed as its own `sh -c` invocation. `set -euo pipefail` therefore dies on line one under `dash` and, more importantly, applies to nothing after it. Variables, `cd`, functions, multi-line `if`/`for`, and heredocs do not survive between lines. The working pattern is a single line: `script: bash ./scripts/ci-e2e.sh`.
- **Snapshot caching is a four-step recipe.** Restore the cache, run the action once with a no-op `script:` to create the AVD and save a boot snapshot, save the cache, then run the real test step with `-no-snapshot-save`. Use the split `actions/cache/restore` plus `actions/cache/save` form: a combined `actions/cache` step saves in a post-step gated on success, so a red run never saves what it just built.
- **Pass hardware inputs on the creation step only.** The action appends `hw.ramSize`, `disk.dataPartition.size`, `hw.cpu.ncore`, and friends to `config.ini` with `>>` on **every** invocation, outside the guard that decides whether to create the AVD. The emulator normalizes those values when it writes the snapshot, so a re-appended literal no longer matches what the snapshot recorded and the snapshot is rejected at boot with `cannot load snapshot: default_boot` and `Reason: different AVD configuration`. Passing identical inputs to both steps does not fix it, because the mismatch is normalized-versus-literal, not step-versus-step. Verified effect of the fix: snapshot restore in single-digit seconds against a roughly 40-second cold boot.
- **Put an image version component in the cache key.** Key on API level, target, arch, and the system-image or runner-image version. Without it a runner-image bump invalidates the snapshot while the key still hits, producing permanent cold boots with no signal that anything changed.
- **Leave hardware acceleration on.** The KVM udev rule plus `disable-linux-hw-accel: auto` is the single largest lever on boot time (seconds versus minutes). Check it before optimizing anything else.
- **Do not use ATD images for UI-driver suites.** The automated-test-device variants strip SystemUI, the launcher, and the IME, and disable hardware rendering. A UI driver needs exactly those. The gain is roughly a fifth of runtime and it is not worth a suite that cannot see the system UI.
- **Treat a known-bad base image as a hypothesis to falsify, never as a diagnosis.** Specific API levels do go bad on hosted runners for months at a time, with open reports of no network connectivity or a system-UI ANR that holds window focus, so the tracker is worth reading before pinning an older level. It is not worth believing on a symptom match. One investigation adopted a reported no-network defect as its root cause on the strength of a false-negative probe, bumped the API level on that basis, and reproduced the identical failure on the new level. Changing the image is a test of the hypothesis, and a green run is the only thing that confirms it.

## Version Drift and Artifact Layout

- **Pin the runner and assert what resolved.** Package-manager and `curl | bash` installers both float. Set an explicit version variable, and assert the reported version in CI. Checking that the binary exists does not catch drift; one project ran eight releases apart between local and CI without noticing.
- **Do not hardcode the artifact layout.** Older Maestro versions wrote a flat run directory: `commands-(Flow Name).json` and `screenshot-<status>-<epoch>-(Flow Name).png` side by side. Newer versions write a directory per flow: `<timestamp>/<Flow Name>/commands.json`, plus `screen-hierarchy/step-NNN-<command>-<target>.json`, `screenshots/`, and `logs/`. The change landed somewhere between those, so pin nothing to a version and glob nothing flat. Resolve the newest run directory and walk it.
- **The per-step hierarchy files are the upgrade worth having.** `screen-hierarchy/step-NNN-*.json` makes each step's view tree separately addressable, which is a strictly better diagnostic surface than one blob per flow: you can read what was on screen at the step before the failure, not only at the failure.
- **Upload the hierarchy dump, always.** It is the artifact people forget and the one that identifies a selector break.

## Diagnosing a Failed Run

Read, in this order:

1. **`commands.json`** for the run: each step carries its own status, so it names the exact step that failed rather than the flow.
2. **The hierarchy dump captured at failure** (`screen-hierarchy/`, and the error's embedded hierarchy root): this is what was actually on screen, which is the single highest-value artifact in the run.
3. **Device logs** for the app's own errors.
4. **The screenshot, last and with suspicion.** It is captured after teardown, so it frequently shows the launcher rather than the failing screen. Diagnosing from it produces confident wrong answers.

## Parallelism

- `--shard-split N` divides the suite across N already-booted devices. `--shard-all N` runs the whole suite on each. Boot the devices first; neither flag provisions them.
- **Run one Maestro process per machine.** Two concurrent single-shard processes on one host have been observed to collide on the driver connection, failing with `Failed to connect to /127.0.0.1:7001` and `only one gesture can be performed at a time`. Drive every attached device from a single process with `--shard-split`. Newer versions expose `--driver-host-port`, which is the escape hatch if separate processes are genuinely required; verify it against the version you pin before relying on it.

## Anti-Patterns

| Anti-pattern                                                | Why it fails                                                                    | Fix                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| E2E against a prebuilt development shell                    | Native modules absent; adds a CI-only launch path; flows fill with workarounds  | Build a release-shaped artifact and install it                           |
| Multi-line `script:` in the emulator action                 | Each line is a separate `sh -c`; `set -e` and every variable are lost           | One line invoking a real script file                                     |
| Hardware inputs on both the create and the test step        | `config.ini` is re-appended every run; the snapshot is rejected at boot         | Pass them on the creation step only, or not at all                       |
| Cache key without an image version component                | Runner-image bump silently invalidates the snapshot; permanent cold boots       | Key on API level, target, arch, and image version                        |
| Combined cache step for the AVD                             | Saves only on success, so the run that built the snapshot never stores it       | Split `cache/restore` and `cache/save`                                   |
| ATD image under a UI driver                                 | SystemUI, launcher, and IME are stripped; hardware rendering is off             | Use a standard system image                                              |
| Floating runner install                                     | Local and CI drift apart silently; behavior differs with no version in the logs | Pin the version and assert the resolved version                          |
| Flat artifact glob                                          | Breaks on the run-directory layout change                                       | Resolve the newest run directory and walk it                             |
| Diagnosing from the failure screenshot                      | Taken after teardown; usually shows the launcher                                | Read the per-step status and the hierarchy dump                          |
| Host-side reachability check standing in for the device     | Different network namespace; proves nothing about the guest                     | Prove it from the device, or forward the port over the debug bridge      |
| Device-side connect used to verify an `adb reverse` forward | The mapping itself answers, so the check passes with nothing behind it          | Accept a socket in the host process and assert the accept happened       |
| Retries added over a configuration defect                   | Converts a reproducible failure into an intermittent one                        | Fix the configuration; keep retries for genuinely nondeterministic steps |

## Device Lab Checklist

- [ ] **Artifact decided first**: flows run against a release-shaped or development build, never a prebuilt development shell
- [ ] **Runner version pinned and asserted**: CI fails if the resolved version is not the pinned one
- [ ] **Emulator script is one line**: any real logic lives in a checked-in script file
- [ ] **Snapshot restore proven**: boot time recorded, and a rejected snapshot fails the job rather than passing slowly
- [ ] **Hardware inputs on the creation step only**
- [ ] **Cache key carries an image version component**
- [ ] **Hardware acceleration verified on**, not left to chance
- [ ] **Standard system image**, not an ATD variant
- [ ] **Artifacts uploaded**: per-step statuses, hierarchy dumps, screenshots, and device logs, resolved by run directory
- [ ] **Dev-server path, if used, is explicitly temporary**: port forwarded over the debug bridge, manifest health-checked with the client's own headers, and error bodies logged
- [ ] **Sharding matches the booted device count**, with one runner process per machine unless the version supports per-process driver ports

## Integration Points

- **Used in workflows**: `*ci` (pipeline shape, caching, artifacts), `*framework` (scaffolding the device suite and its scripts), `*automate` (flows must not encode harness workarounds), `*nfr-assess` (boot and run duration as evidence)
- **Related fragments**: `mobile-test-strategy.md` (what belongs on a device at all), `maestro-flows.md` (flow-level quality and command semantics), `evidence-integrity.md` (three-state diagnostics and hollow green, which is where most of these defects hide), `ci-burn-in.md` (burn-in and sharding mechanics)
- **Tools**: `maestro test`, `adb`, `avdmanager`, `reactivecircus/android-emulator-runner`, EAS or the platform build toolchain

_Source: Maestro CLI documentation and release notes; Expo CI and development-build documentation; `reactivecircus/android-emulator-runner` source and issue tracker; defects found and fixed in a live Maestro device-lab investigation_
