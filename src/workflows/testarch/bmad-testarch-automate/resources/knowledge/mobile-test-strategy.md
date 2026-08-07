# Mobile Test Strategy

## Principle

Mobile applies the same level discipline as any other stack: push verification to the cheapest level that can carry it, and reserve device-level flows for what genuinely requires a device. The mobile-specific part is that the expensive level is **much** more expensive (emulator boot, app install, real network) and the risk surface includes conditions web apps do not have: permissions, backgrounding, offline, deep links, and OS version fragmentation.

## Rationale

**The Problem**: Mobile suites tend to collapse into one level. Teams write end-to-end device flows for everything because that is the only tool they set up, then watch a 40-flow suite take 50 minutes and fail for reasons unrelated to the change. The opposite failure is equally common: unit-testing every reducer and shipping an app nobody ever launched in CI.

**The Solution**: Split by what actually needs the device. Business logic, formatting, state reduction, and API clients are unit and integration concerns and do not need a simulator. Component or screen tests cover rendering and interaction without a full app launch. Device flows exist for the journeys where the integration of app, OS, and backend is itself the risk.

**Why This Matters**:

- Suite runtime stays inside a PR-gate budget
- Failures point at the layer that broke
- Device capacity is spent on the risks only a device can prove
- The same P0-P3 prioritization used elsewhere in TEA transfers unchanged

## The Mobile Test Level Framework

| Level                     | Runs on                    | Covers                                                                  | Typical share (indicative) |
| ------------------------- | -------------------------- | ----------------------------------------------------------------------- | -------------------------- |
| **Unit**                  | Node / JVM / Swift runtime | Pure logic, reducers, formatters, validation, mappers                   | 60-70%                     |
| **Component / screen**    | Test renderer, no device   | Rendering, props, interaction handlers, conditional UI                  | 20-25%                     |
| **Contract**              | No device                  | The app's HTTP boundary against its backend (Pact or schema validation) | small, high value          |
| **Device flow (Maestro)** | Simulator/emulator/device  | Cross-screen journeys, permissions, deep links, background/foreground   | 5-15%                      |
| **Manual / exploratory**  | Real device                | Gestures, haptics, biometrics, accessibility, real-network degradation  | remainder                  |

**Duplicate coverage guard** (same rule as every other stack): before adding a device flow, check whether a component test or a contract test already proves the behavior. A device flow that only verifies a label renders is a unit test wearing a 90-second costume.

## What Belongs in a Device Flow

Promote to a Maestro flow when the risk is in the **integration**, not the logic:

- P0 revenue or access journeys end to end (sign in, purchase, submit claim)
- OS permission grants and denials, including the denied path
- Deep link and universal link entry into a specific screen
- Background, foreground, and process-death restoration
- Offline and reconnect behavior
- Push notification tap-through
- App upgrade with existing local data (explicit exception to clearState isolation: seeds previous-build state, installs the new build without clearState, asserts migration, and cleans up in teardown)

Keep out of device flows:

- Field-level input validation (component level)
- Every variant of a list cell (component level)
- Error message copy (component level)
- API error mapping (contract or unit level)

## Mobile Risk Categories

Extends the standard TEA risk categories with the conditions unique to the platform. Score each with the usual probability × impact 1-9 scale.

| Category             | Example risk                                         | Typical level             |
| -------------------- | ---------------------------------------------------- | ------------------------- |
| **Permissions**      | Camera denied leaves the user on a dead screen       | Device flow               |
| **Lifecycle**        | State lost when the OS kills a backgrounded app      | Device flow               |
| **Connectivity**     | Offline write is silently discarded on reconnect     | Device flow + unit        |
| **Fragmentation**    | Layout breaks on a small screen or an older OS       | Device matrix             |
| **Upgrade**          | Local database migration corrupts existing user data | Device flow               |
| **Store compliance** | Missing privacy declaration blocks release           | Release checklist         |
| **Performance**      | Cold start over budget, frame drops on scroll        | Instrumented, not Maestro |
| **Binary size**      | Growth pushes past a cellular download threshold     | CI metric                 |

Cold start, frame rate, memory, and binary size are NFR evidence. Collect them with platform instrumentation and audit them in the NFR workflow; do not try to assert them from a Maestro flow.

## Device Matrix

Pick the matrix from risk, not from availability. A defensible minimum:

- **Primary**: newest OS on the highest-usage device for each platform
- **Floor**: the oldest OS version the app still supports
- **Form factor**: one small screen, and a tablet only if the app ships a tablet layout

Run the full matrix nightly and on release candidates. Run the primary target only on PRs, because a PR gate that boots six emulators stops being a gate people wait for.

## CI Shape

- **PR gate**: unit + component + contract on every push. P0-tagged Maestro flows on the primary target only.
- **Nightly**: full Maestro suite across the device matrix.
- **Release candidate**: full suite plus the upgrade-path flow from the previous production build.
- **Artifacts**: Maestro writes a video, a screenshot, and a hierarchy dump per failed flow. Upload all three; the hierarchy dump is what identifies a selector break, and it is the one people forget.
- **Burn-in**: applies to mobile the same way it applies to browser E2E. New or changed flows run repeatedly before merge, because device flows are the most flake-prone level in the suite.
- **Sharding**: shard by flow file across parallel emulators. Emulator boot dominates a short run, so keep shard count low enough that boot time does not exceed test time.

## Anti-Patterns

| Anti-pattern                                     | Why it fails                                                   | Fix                                                                       |
| ------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Every acceptance criterion becomes a device flow | Suite runtime explodes; failures are slow to diagnose          | Apply the level framework and the duplicate-coverage guard                |
| Full device matrix on every PR                   | Gate becomes too slow to block on, so people bypass it         | Primary target on PRs, matrix nightly                                     |
| Performance asserted inside a Maestro flow       | Measures the harness, not the app                              | Platform instrumentation as NFR evidence                                  |
| Flows depend on a shared logged-in account       | Parallel runs collide; failures are not reproducible           | Per-run accounts/data or explicit backend reset when server state changes |
| No offline or permission-denied coverage         | The paths users actually hit in the wild are the untested ones | Score them as risks; they are usually P0 or P1                            |
| Testing against a production backend             | Non-deterministic data, and a test order can mutate real state | Dedicated environment or a stubbed backend                                |

## Mobile Strategy Checklist

- [ ] **Levels assigned**: each acceptance criterion mapped to unit, component, contract, or device flow
- [ ] **Duplicate coverage checked**: no device flow proving something a cheaper level already proves
- [ ] **Mobile risk categories scored**: permissions, lifecycle, connectivity, fragmentation, upgrade
- [ ] **Device matrix justified**: primary, floor, and form factor chosen from usage data
- [ ] **PR gate bounded**: P0 flows on the primary target only
- [ ] **NFR evidence separated**: cold start, frame rate, memory, binary size instrumented rather than asserted in flows
- [ ] **Artifacts uploaded**: video, screenshot, and hierarchy dump on failure
- [ ] **Burn-in enabled** for new and changed flows

## Integration Points

- **Used in workflows**: `*test-design` (risk and level assignment for mobile), `*framework` (scaffold the suite), `*automate` (generate flows at the right level), `*ci` (device pipeline shape), `*nfr-assess` (mobile NFR evidence), `*trace` (map criteria to flows)
- **Related fragments**: `maestro-flows.md` (flow syntax and quality), `test-levels-framework.md` (the general level model this specializes), `probability-impact.md` (the scoring scale), `test-priorities-matrix.md` (P0-P3), `ci-burn-in.md` (burn-in and sharding mechanics)
- **Tools**: `maestro test`, `maestro studio`, platform instrumentation (Xcode Instruments, Android Profiler, Firebase Performance)

_Source: TEA test-levels framework applied to mobile constraints, Maestro CI practice, mobile risk categories from permissions/lifecycle/connectivity/fragmentation failure modes_
