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

**Rule**: the prebuilt shell is the wrong artifact for E2E. It cannot load your native modules, so for any flow touching notifications, OAuth, maps, in-app purchases, or any feature that hands an API key to native code, **a pass in the shell does not prove the native implementation ran**. It proves that whatever the app did in the shell's absence of that module did not throw. Where the module has a fallback path, the flow is exercising the fallback, and the native behavior stays unverified no matter how green the run is. Require evidence that the native path itself was exercised before counting such a flow as coverage, which in practice means running it against a real build.

**Be precise about which part is unreachable, because the coarse version of this rule is wrong and gets flows abandoned that would pass.** Deep links are the case worth stating carefully. A shell cannot register the app's custom scheme, so a `myapp://` URL fails there. It can still route its own URL form into the app with the path and query intact, so the app's link parsing, routing, and resulting state changes are all testable. Only the OS-level handoff is out of reach: a cold start from a real widget or notification tap. One suite recorded a deep-link flow as impossible under the shell for exactly this reason, and the flow passed on the first attempt once the URL was built the shell's way. "Untestable here" is a claim that needs the same evidence as any other.

**"Absent" is not always the shape it takes, and the other shape is worse.** Some SDKs detect the shell and degrade instead of failing. One in-app-purchase SDK logs `Expo Go app detected. Using RevenueCat in Browser Mode.` and keeps working through a different code path. Nothing errors, the flow proceeds, and what the suite proves is that the fallback path works in a container users never run. A hard `undefined` at least announces itself; a silent degradation gives you a green flow covering the wrong implementation. When a flow touches a native module in a shell, check the device log for what the module decided to do rather than assuming it did nothing.

Expo's own CI tutorial builds a dedicated EAS profile for this (`e2e-test`, with `withoutCredentials: true`, Android `buildType: "apk"`, and iOS `simulator: true`) and runs Maestro against those builds. It never runs the flows through Expo Go. See <https://docs.expo.dev/tutorial/cicd/e2e-tests/> and <https://expo.dev/blog/expo-go-vs-development-builds>.

The cost of getting this wrong is measurable in flow source. In one audit, about 120 of 195 lines in a single launch subflow existed solely to fight the development shell (dev-server readiness, manifest retries, a third-party app's own UI), and most of the defects fixed that week would not have existed against a compiled build. Workarounds for a wrong artifact do not stay in the harness; they migrate into the flows and become the suite.

### "Development Build" Is Not Automatically the Fix

A development build is the usual proposal once the shell is ruled out, and on Android it frequently changes nothing. In EAS, `developmentClient: true` sets the Gradle task to `:app:assembleDebug`, and a **debug variant does not embed the JS bundle**. The app still needs a live packager and a manifest exchange at launch, which is the same CI-only network surface the shell had. Only a **release** variant embeds the bundle. SDK 54's `debugOptimized` is the near miss worth naming: it optimizes the C++ layer and remains a debug variant, so the bundle is still served rather than embedded.

Getting to a release-variant APK without an account or a build service:

- **`eas build --local` composes badly with CI caching.** Expo documents "Caching is not supported" for local builds, and they still require `eas login` or an `EXPO_TOKEN`. `npx expo prebuild` followed by `./gradlew :app:assembleRelease` is the path that caches. See <https://docs.expo.dev/build-reference/local-builds/>.
- **A locally prebuilt release APK is debug-signed.** The generated `android/app/build.gradle` sets `release { signingConfig signingConfigs.debug }`, so the artifact installs on an emulator with no credentials, which is exactly what a device lab needs and not something to "fix".
- **`__DEV__` is `false` in a release build.** Any E2E affordance gated behind it silently disappears in the one build the suite is meant to run against. Move the switch to an `EXPO_PUBLIC_`-prefixed variable, which is inlined into the bundle at build time. Expo documents these as "visible in plain-text in your compiled application", so whatever the switch gates must be safe to ship: a throwaway credential against a disposable environment, never a real one.
- **Custom-scheme deep links need a different URL in the shell, and that is a constraint rather than a hole.** `scheme` is documented as "a build-time configuration, it has no effect in Expo Go", so the shell never registers the app's own scheme and a `myapp://` link fails there with `Activity not started, unable to resolve Intent`. What works is the shell's routed form, `exp://<host>/--/<path>?<query>`, which delivers the path and query string into the app. The parsing, routing, and application logic behind a deep link is therefore fully reachable in a shell. What is not reachable is anything that needs the production scheme registered with the OS: a cold start from a real widget or notification tap, or another app handing the link over. Build the URL from one helper used by every flow, so no single platform branch quietly hardcodes the unregistered scheme.

  Universal Links and Android App Links are a different mechanism and get no such reprieve. They are HTTPS links resolved through a domain association (`apple-app-site-association`, `assetlinks.json`) that the OS fetches and verifies, so the shell's routed form exercises the in-app routing and says nothing about whether the handoff would have happened. Verify the association against a real build, and treat routing coverage and handoff coverage as two separate claims.

## If the Suite Must Run Against a Dev Server

Sometimes the compiled build is not ready yet and the dev-server path has to work for one release. Treat it as a temporary configuration with these constraints:

- **Reach the host over the debug bridge, not the guest NIC.** `adb reverse tcp:8081 tcp:8081` tunnels over the adb transport, so it survives emulator network breakage that would kill a `10.0.2.2` route. Pin the device with `adb -s <serial>` when more than one is attached.
- **Do not verify the forward by connecting to it from the device.** A reverse mapping gives the device a local listener on that port unconditionally, so the connect succeeds whether or not anything on the host is behind it. That probe measures that the mapping exists and reports that the server is reachable. Prove it from the host process instead: accept a socket and assert that the accept happened.
- **Do not assume the toolchain set it up.** Expo CLI issues `adb reverse` from the path where the CLI itself opens the app. Start the server without that flag and the forward silently never happens.
- **The shell may be asking for a SIGNED manifest, and signing needs an account.** Expo Go sends `expo-expect-signature` with `keyid="expo-root"`. When the app config carries `extra.eas.projectId`, `@expo/cli` answers by fetching a development code-signing certificate from Expo's API and caching it under `~/.expo/codesigning/<projectId>`. That fetch resolves the current user, and with no session it prompts; under `EXPO_NO_INTERACTIVE=1` the prompt cannot be answered and the request dies with `CommandError: Input is required, but 'npx expo' is in non-interactive mode.` A developer machine never sees this, because `~/.expo/state.json` holds a session and the certificate is already cached. A fresh runner has neither, which is why the failure is CI-only and survives every emulator, image, and network change tried against it. **The trigger is `extra.eas.projectId`, not `owner`**; removing `owner` changes nothing. Two fixes work: an `EXPO_TOKEN` secret (Expo's documented CI authentication), or starting the server `--offline`, which skips the network requests behind the signing path and serves an unsigned manifest, which the shell accepts. Apply whichever you choose on every path, local and CI, so the two do not diverge on the one axis that only breaks in CI.
- **Health-check the manifest the way the client asks for it.** A bare `GET /` with no headers returns `200` and a browser interstitial, so a harness can log "dev server reachable" while every client request fails. Send **every** header the client sends (the platform header, `accept: multipart/mixed`, and the signature-expectation header above), and log the response body: the CLI serializes manifest-path errors as a JSON `error` payload with status `500`. One harness omitted only the signature header and reported "manifest served, HTTP 200, multipart/mixed" through five consecutive red runs, because that one header selects a different branch through the middleware than the app under test takes. See `evidence-integrity.md`: a probe must issue the request it stands in for.
- **Read the discriminating log line.** `Remote update request not successful` is emitted at exactly one place in `expo-updates`, guarded by the HTTP client's 200-299 check. If it appears, an HTTP response arrived with an error status, which makes it a manifest or HTTP problem and rules out connectivity. The surrounding generic lines (`Failed to download remote update`, `Failed to launch embedded or launchable update`) appear for any failure including connection-refused, so only the specific line carries information. Source: `packages/expo-updates/android/src/main/java/expo/modules/updates/loader/FileDownloader.kt` in <https://github.com/expo/expo>.
- **Expect the app config to be evaluated per request.** The manifest handler re-reads the project config on every manifest request, so config plugins run per request. Anything environment-sensitive in that config is a live macOS-versus-Linux divergence axis.
- **Do not build on undocumented packager host variables.** They carry a "drop the undocumented env variables" note upstream, and setting one can break a working `adb reverse` plus loopback setup by advertising a different host back to the client.

## Local and CI Run the Same Device Profile

Pin one device profile and use it on both sides. A different profile is a different layout, and a different layout is a class of failure that reproduces nowhere but CI.

Measured: CI booted a `pixel_3a` (1080x2220 at 440dpi, roughly 807dp tall) while every local run used a `medium_phone` (1080x2400 at 420dpi, roughly 914dp). A screen about 12% shorter pushes more of each scrolling section below the fold, and four unrelated flows failed on the runner with "not visible" while staying green on every developer machine. Each one read like a product defect. None was.

The height that matters is **density-independent pixels**, not the pixel resolution, because the layout is laid out in dp. Two profiles with the same `1080x` resolution and different densities are different screens, and comparing the resolutions alone will tell you they match.

- Name the profile in the harness, not in a person's local setup, so both sides read the same value.
- When the matrix genuinely needs more than one profile, keep the PR-gate profile identical to the local one and let the extra profiles run nightly, where a difference is information rather than noise.
- A suite running two profiles cannot distinguish a real regression from a screen-height artifact, and the artifact is far more common. That ambiguity costs more than the coverage the second profile adds at the gate.

## Local Emulators Need Repair After Creation

`avdmanager create avd` does not hand back a device a UI driver can use. Three defects, all measured on an Apple Silicon host, all needing a post-creation edit:

- **`target=android-0` in the AVD's `.ini` pointer file.** `avdmanager` cannot parse a dotted API level, so a system image such as `system-images;android-36.1;google_apis;arm64-v8a` writes `target=android-0`. The emulator cannot resolve the platform, silently drops hardware acceleration (`hvf is not enabled on this aarch64 host`, then `qemu_mprotect__osdep: mprotect failed: Permission denied`) and software-emulates ARM64 on an ARM64 host. The device never leaves `offline` in `adb devices`, with nothing in the log naming the cause. The same parse failure leaves `avd.id` and `avd.name` as the literal string `<build>`. Correcting `target` makes the identical AVD boot with no acceleration warnings.
- **`hw.gpu.enabled=no`**, which leaves gfxstream logging `Failed to make display surface context current` and boot never completing.
- **`hw.keyboard=no`**, wrong for any suite that types through `adb`.

Two launch flags worth pinning while you are there:

- **`-gpu auto`, not `-gpu swiftshader_indirect`.** Software rendering is fine for a single emulator and does not survive several at once on the same host.
- **`-no-snapshot-save`, not `-no-snapshot`.** The latter also refuses to LOAD a snapshot, which makes every boot cold and quietly undoes the caching work below.

**Read the values back and fail on a mismatch.** A creation script that writes the right lines and never checks them produces exactly the failure this section describes: an AVD that looks configured, boots to `offline`, and costs a full run to diagnose.

## Android Emulator on Hosted Runners

Using `reactivecircus/android-emulator-runner`:

- **The `script:` input is not a shell script.** It is trimmed, split on newlines, and each surviving line is executed as its own `sh -c` invocation. `set -euo pipefail` therefore dies on line one under `dash` and, more importantly, applies to nothing after it. Variables, `cd`, functions, multi-line `if`/`for`, and heredocs do not survive between lines. The working pattern is a single line: `script: bash ./scripts/ci-e2e.sh`.
- **Snapshot caching is a four-step recipe.** Restore the cache, run the action once with a no-op `script:` to create the AVD and save a boot snapshot, save the cache, then run the real test step with `-no-snapshot-save`. Use the split `actions/cache/restore` plus `actions/cache/save` form: a combined `actions/cache` step saves in a post-step gated on success, so a red run never saves what it just built.
- **Pass hardware inputs on the creation step only.** The action appends `hw.ramSize`, `disk.dataPartition.size`, `hw.cpu.ncore`, and friends to `config.ini` with `>>` on **every** invocation, outside the guard that decides whether to create the AVD. The emulator normalizes those values when it writes the snapshot, so a re-appended literal no longer matches what the snapshot recorded and the snapshot is rejected at boot with `cannot load snapshot: default_boot` and `Reason: different AVD configuration`. Passing identical inputs to both steps does not fix it, because the mismatch is normalized-versus-literal, not step-versus-step. Verified effect of the fix: snapshot restore in single-digit seconds against a roughly 40-second cold boot.
- **Put an image version component in the cache key.** Key on API level, target, arch, and the system-image or runner-image version. Without it a runner-image bump invalidates the snapshot while the key still hits, producing permanent cold boots with no signal that anything changed.
- **Leave hardware acceleration on.** The KVM udev rule plus `disable-linux-hw-accel: auto` is the single largest lever on boot time (seconds versus minutes). Check it before optimizing anything else.
- **Do not use ATD images for UI-driver suites.** The automated-test-device variants strip SystemUI, the launcher, and the IME, and disable hardware rendering. A UI driver needs exactly those. The gain is roughly a fifth of runtime and it is not worth a suite that cannot see the system UI.
- **Treat a known-bad base image as a hypothesis to falsify, never as a diagnosis.** Specific API levels do go bad on hosted runners for months at a time, with open reports of no network connectivity or a system-UI ANR that holds window focus, so the tracker is worth reading before pinning an older level. It is not worth believing on a symptom match. One investigation adopted a reported no-network defect as its root cause on the strength of a false-negative probe, bumped the API level on that basis, and reproduced the identical failure on the new level. Changing the image is a test of the hypothesis, and a green run is the only thing that confirms it.

## Per-Device Identity for Sharded Runs

When flows create and delete data for the signed-in user, each parallel device needs its own fixture account, and the app has to know which account is its own. The usual mechanism is a device-name-to-credential map in the bundle, with the app selecting its entry by reading its own device name.

On iOS the simulator name is a device property, so the app reads it. **On Android there is nothing to read.** `expo-device`'s `deviceName` resolves `Settings.Global.DEVICE_NAME` on API 32 and above, and the `bluetooth_name` secure setting below that; on an emulator both default to the product model. Measured: an AVD named `Medium_Phone_API_36.1` reports `sdk_gphone64_arm64`. **Four differently-named AVDs produce four identical map keys.** Every shard then signs in as the same user, the shards delete each other's data mid-flow, and every flow still passes. This is the most expensive shape of hollow green in this fragment, because the green is stable and what it hides is a data race.

The identity has to be **written** per device before the run, then proven:

```bash
# The API level picks the namespace. Writing the wrong one succeeds and changes
# nothing the app can read, which is a silent version of the same defect.
api=$(adb -s "$serial" shell getprop ro.build.version.sdk | tr -d '\r')
if [ "$api" -ge 32 ]; then
  adb -s "$serial" shell settings put global device_name "$name"
  read_back=$(adb -s "$serial" shell settings get global device_name | tr -d '\r')
else
  adb -s "$serial" shell settings put secure bluetooth_name "$name"
  read_back=$(adb -s "$serial" shell settings get secure bluetooth_name | tr -d '\r')
fi
[ "$read_back" = "$name" ] || { echo "FAIL: $serial reports '$read_back'"; exit 1; }
```

Then reconcile across the booted set: **a duplicate key is a hard error, never a warning.** A warning here becomes a shared account, and a shared account becomes a suite that cannot fail for the right reason.

## Version Drift and Artifact Layout

- **Pin the runner and assert what resolved.** Package-manager and `curl | bash` installers both float. Set an explicit version variable, and assert the reported version in CI. Checking that the binary exists does not catch drift; one project ran eight releases apart between local and CI without noticing.
- **Do not hardcode the artifact layout.** Older Maestro versions wrote a flat run directory: `commands-(Flow Name).json` and `screenshot-<status>-<epoch>-(Flow Name).png` side by side. Newer versions write a directory per flow: `<timestamp>/<Flow Name>/commands.json`, plus `screen-hierarchy/step-NNN-<command>-<target>.json`, `screenshots/`, and `logs/`. The change landed somewhere between those, so pin nothing to a version and glob nothing flat. Resolve the newest run directory and walk it.
- **The per-step hierarchy files are the upgrade worth having.** `screen-hierarchy/step-NNN-*.json` makes each step's view tree separately addressable, which is a strictly better diagnostic surface than one blob per flow: you can read what was on screen at the step before the failure, not only at the failure.
- **Or take the layout out of the equation.** `maestro test --test-output-dir <dir>` writes `manifest.json`, `commands.json`, and `logs/` directly into a directory you name, and `--flatten-debug-output` writes without per-run subfolders or timestamps. Both are in `maestro test --help` on 2.8.0. Naming the directory beats globbing for the newest one, and it survives the next layout change.
- **Upload the hierarchy dump, always.** It is the artifact people forget and the one that identifies a selector break.

## Diagnosing a Failed Run

Read, in this order:

1. **`commands.json`** for the run: each step carries its own status, so it names the exact step that failed rather than the flow.
2. **The hierarchy dump captured at failure** (`screen-hierarchy/`, and the error's embedded hierarchy root): this is what was actually on screen, which is the single highest-value artifact in the run.
3. **Device logs** for the app's own errors.
4. **The screenshot, last and with suspicion.** It is captured after teardown, so it frequently shows the launcher rather than the failing screen. Diagnosing from it produces confident wrong answers.

**Check present-but-off-screen before anything else.** When a step fails on "not visible", find the id in that step's `screen-hierarchy` entry. Present with bounds outside the screen is a scroll problem in the flow; absent is a defect in the app. This one lookup separates the two most common causes of a red run and costs seconds. Skipping it is how an investigation spends hours building plausible mechanisms for a feature that was working the whole time.

**Count root causes, not red flows.** One serial run failed with `Maestro Android driver did not start up in time`, and three further flows then failed in one to two seconds each with no artifacts written. Four red flows, one defect. A flow that failed in seconds and wrote nothing did not run; treat it as could-not-measure and diagnose the first failure, because a defect count inflated by a cascade sends the investigation at four subsystems instead of one.

## Parallelism

- `--shard-split N` divides the suite across N already-booted devices. `--shard-all N` runs the whole suite on each. Boot the devices first; neither flag provisions them.
- `--udid` (aliased `--device`) takes a comma-separated list on **both** platforms, so a single `--shard-split` invocation drives Android emulator serials and iOS simulator UDIDs through the same code path. One sharding implementation covers both.
- **Run one Maestro process per machine.** Two concurrent single-shard processes on one host have been observed to collide on the driver connection, failing with `Failed to connect to /127.0.0.1:7001` and `only one gesture can be performed at a time`. Drive every attached device from a single process with `--shard-split`. **There is no per-process driver port to escape with**: `--driver-host-port` is absent from both `maestro --help` and `maestro test --help` on 2.8.0. A handover note claiming an earlier release added it did not survive the check, which is `evidence-integrity.md`'s verify-the-property rule applied to a flag someone else told you about.
- **Choose the shard count on measured wall clock, not on per-flow duration.** Same suite, same 14-core / 48 GB host, same day: **four emulators finished in 21.1 minutes, two in 27.3.** Four does oversubscribe the host, with load average around 20 and per-flow times stretching from roughly 40 seconds to several minutes, and the total is still shorter. Wall clock is what gates a pull request, so the per-flow number tempts you to the wrong conclusion. Serial for comparison was roughly 1.5 to 2 hours.

## Anti-Patterns

| Anti-pattern                                                       | Why it fails                                                                                                                           | Fix                                                                                   |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| E2E against a prebuilt development shell                           | Native modules absent; adds a CI-only launch path; flows fill with workarounds                                                         | Build a release-shaped artifact and install it                                        |
| Development build adopted as the fix for the dev-server dependency | `developmentClient: true` builds a debug variant, which does not embed the JS bundle, so a packager is still required                  | Build a release variant; only it embeds the bundle                                    |
| E2E affordance gated behind `__DEV__`                              | `__DEV__` is false in a release build, so the affordance is absent from the build under test                                           | Gate on an `EXPO_PUBLIC_` variable and keep what it gates safe to ship in plain text  |
| Signed-manifest path left intact in CI                             | The certificate fetch needs an account session; non-interactive CI cannot answer the prompt                                            | Supply `EXPO_TOKEN`, or serve the manifest `--offline`, on every path                 |
| Local and CI on different device profiles                          | A shorter screen pushes content below the fold, producing "not visible" failures that reproduce only in CI and read as product defects | Pin one profile for both; extra profiles run nightly, not at the gate                 |
| Native module assumed absent in a development shell                | Some SDKs detect the shell and degrade silently, so the flow covers a fallback path users never run                                    | Read the device log for what the module decided; prefer a real build                  |
| "Not visible" diagnosed before the hierarchy is read               | Present-but-off-screen and genuinely-absent are different bugs behind the same message                                                 | Look for the id and its bounds in that step's `screen-hierarchy` first                |
| AVD used as the creation tool produced it                          | `target=android-0`, GPU off, keyboard off: acceleration silently drops or boot never completes                                         | Repair the `.ini` and `config.ini`, then read the values back                         |
| Android device identity read rather than written                   | Every emulator reports the product model, so parallel shards share one map key and one account                                         | Write `device_name` / `bluetooth_name` per device and hard-fail duplicates            |
| Shard count chosen from per-flow duration                          | Oversubscription stretches each flow while still shortening the run                                                                    | Choose on measured wall clock, which is what gates the PR                             |
| Every red flow counted as its own defect                           | A driver timeout cascades into fast, artifact-less failures                                                                            | Diagnose the first failure; artifact-less seconds-long failures are could-not-measure |
| Multi-line `script:` in the emulator action                        | Each line is a separate `sh -c`; `set -e` and every variable are lost                                                                  | One line invoking a real script file                                                  |
| Hardware inputs on both the create and the test step               | `config.ini` is re-appended every run; the snapshot is rejected at boot                                                                | Pass them on the creation step only, or not at all                                    |
| Cache key without an image version component                       | Runner-image bump silently invalidates the snapshot; permanent cold boots                                                              | Key on API level, target, arch, and image version                                     |
| Combined cache step for the AVD                                    | Saves only on success, so the run that built the snapshot never stores it                                                              | Split `cache/restore` and `cache/save`                                                |
| ATD image under a UI driver                                        | SystemUI, launcher, and IME are stripped; hardware rendering is off                                                                    | Use a standard system image                                                           |
| Floating runner install                                            | Local and CI drift apart silently; behavior differs with no version in the logs                                                        | Pin the version and assert the resolved version                                       |
| Flat artifact glob                                                 | Breaks on the run-directory layout change                                                                                              | Resolve the newest run directory and walk it                                          |
| Diagnosing from the failure screenshot                             | Taken after teardown; usually shows the launcher                                                                                       | Read the per-step status and the hierarchy dump                                       |
| Host-side reachability check standing in for the device            | Different network namespace; proves nothing about the guest                                                                            | Prove it from the device, or forward the port over the debug bridge                   |
| Device-side connect used to verify an `adb reverse` forward        | The mapping itself answers, so the check passes with nothing behind it                                                                 | Accept a socket in the host process and assert the accept happened                    |
| Retries added over a configuration defect                          | Converts a reproducible failure into an intermittent one                                                                               | Fix the configuration; keep retries for genuinely nondeterministic steps              |

## Device Lab Checklist

- [ ] **Artifact decided first**: flows run against a release-shaped or development build, never a prebuilt development shell
- [ ] **Release variant confirmed**: the installed artifact embeds the JS bundle and launches with no packager running
- [ ] **No `__DEV__`-gated test affordance**: E2E switches ride an `EXPO_PUBLIC_` variable and gate nothing that must stay secret
- [ ] **Runner version pinned and asserted**: CI fails if the resolved version is not the pinned one
- [ ] **Emulator script is one line**: any real logic lives in a checked-in script file
- [ ] **Snapshot restore proven**: boot time recorded, and a rejected snapshot fails the job rather than passing slowly
- [ ] **Hardware inputs on the creation step only**
- [ ] **Cache key carries an image version component**
- [ ] **Hardware acceleration verified on**, not left to chance
- [ ] **Standard system image**, not an ATD variant
- [ ] **One device profile across local and CI**, compared on density-independent height rather than pixel resolution
- [ ] **Locally created AVDs asserted after creation**: `target`, GPU, and keyboard read back rather than assumed written
- [ ] **Per-device identity written and proven unique** before any sharded run, with a duplicate failing the job
- [ ] **Artifacts uploaded**: per-step statuses, hierarchy dumps, screenshots, and device logs, resolved by run directory or written to a named output directory
- [ ] **Dev-server path, if used, is explicitly temporary**: port forwarded over the debug bridge, manifest health-checked with every header the client sends, signing resolved for a non-interactive session, and error bodies logged
- [ ] **Sharding matches the booted device count**, driven by one runner process per machine
- [ ] **Shard count justified by measured wall clock**, not by per-flow duration

## Integration Points

- **Used in workflows**: `*ci` (pipeline shape, caching, artifacts), `*framework` (scaffolding the device suite and its scripts), `*automate` (flows must not encode harness workarounds), `*nfr-assess` (boot and run duration as evidence)
- **Related fragments**: `mobile-test-strategy.md` (what belongs on a device at all), `maestro-flows.md` (flow-level quality and command semantics), `evidence-integrity.md` (three-state diagnostics and hollow green, which is where most of these defects hide), `ci-burn-in.md` (burn-in and sharding mechanics)
- **Tools**: `maestro test`, `adb`, `avdmanager`, `emulator`, `reactivecircus/android-emulator-runner`, EAS or the platform build toolchain

_Source: Maestro 2.8.0 CLI help and documentation; Expo app-config, local-build, and environment-variable documentation; `@expo/cli` code-signing source; `reactivecircus/android-emulator-runner` source and issue tracker; defects, measurements, and timings from live Maestro device-lab investigations on hosted runners and an Apple Silicon host_
