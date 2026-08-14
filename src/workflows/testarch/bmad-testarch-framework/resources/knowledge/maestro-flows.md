# Maestro Flow Patterns

## Principle

A Maestro flow is a declarative YAML sequence run against a real app on a simulator, emulator, or device. Flows must be **self-contained** (each starts from a known app state via `clearState`), **selector-resilient** (accessibility identifiers before visible text, visible text before index), and **assertion-bearing** (a flow that only taps and never asserts proves nothing).

## Rationale

**The Problem**: Mobile UI automation fails differently from browser automation. There is no DOM to query, no network layer to intercept from inside the test, and no single "page loaded" event. The common failure modes are index-based taps that break when a list reorders, hardcoded sleeps standing in for real synchronization, and flows that navigate through five screens without asserting anything, so they pass while the feature is broken.

**The Solution**: Maestro already retries and waits on element lookup, so explicit sleeps are almost always a workaround for a missing assertion. Anchor every step on a stable identifier, assert the state you navigated to reach, and reset app state at the start of each flow rather than relying on the flow that ran before it.

**Why This Matters**:

- Flows survive UI reordering and copy changes (identifier-first selection)
- Flows fail for the real reason instead of timing out three screens later
- Flows can run in any order and in parallel (state isolation)
- A green run means the behavior works, not that the taps landed somewhere

## Pattern Examples

### Example 1: Flow Structure and State Isolation

**Context**: Every flow declares its app and resets state before the first interaction.

**Implementation**:

```yaml
# maestro/login-success.yaml
appId: com.example.app
name: Login with valid credentials
tags:
  - P0
  - auth
---
- clearState # isolation: no leftover session from a prior flow
- clearKeychain
- launchApp

- assertVisible:
    id: 'login_screen_title'

- tapOn:
    id: 'email_input'
- inputText: 'user@example.com'

- tapOn:
    id: 'password_input'
- inputText: '${MAESTRO_TEST_PASSWORD}' # never hardcode a credential

- tapOn:
    id: 'login_submit_button'

# assert the outcome, not just that the tap happened
- assertVisible:
    id: 'home_dashboard'
- assertVisible:
    text: 'Welcome back'
```

**Key points**:

- `clearState` before `launchApp` makes the flow independent of execution order
- `id` refers to the accessibility identifier (`testID` in React Native, `accessibilityIdentifier` on iOS, `resource-id` on Android)
- The flow ends on an assertion about the destination state

### Example 2: Selector Hierarchy

**Context**: Choosing the most resilient way to address an element.

**Implementation**:

```yaml
# ✅ Level 1: accessibility identifier (survives copy and layout changes)
- tapOn:
    id: 'checkout_submit_button'

# ✅ Level 2: visible text, when no identifier exists and the copy is stable
- tapOn:
    text: 'Place order'

# ✅ Level 3: text with a scoping container, for repeated labels
- tapOn:
    text: 'Remove'
    below:
      text: 'Blue running shoes'

# ⚠️ Level 4: regex, for dynamic content
- assertVisible:
    text: 'Order #\d+ confirmed'

# ❌ Avoid: positional index breaks the moment the list reorders
- tapOn:
    index: 2
    text: 'Item'

# ❌ Avoid: absolute coordinates break on every other screen size
- tapOn:
    point: '50%,73%'
```

**Rule**: `id` > `text` > scoped `text` (`below`/`above`/`leftOf`/`rightOf`/`containsChild`) > regex. Index and point coordinates are last resorts and must carry a comment explaining why nothing better exists.

### Example 3: Synchronization Without Sleeps

**Context**: Waiting for an async result (network call, animation, background job).

**Implementation**:

```yaml
# ❌ Wrong: a fixed sleep is either flaky or slow, and usually both
- tapOn:
    id: 'sync_button'
- sleep: 5000
- assertVisible:
    id: 'sync_complete_badge'

# ✅ Right: wait for the condition that actually matters
- tapOn:
    id: 'sync_button'
- extendedWaitUntil:
    visible:
      id: 'sync_complete_badge'
    timeout: 30000

# ✅ Right: assert the negative case explicitly
- extendedWaitUntil:
    notVisible:
      id: 'loading_spinner'
    timeout: 10000
- assertVisible:
    id: 'results_list'
```

**Key points**:

- `extendedWaitUntil` with an explicit `timeout` states the real service-level expectation
- Maestro's default element lookup already retries; a bare `sleep` on top of that hides the actual wait condition
- A long timeout on a specific condition is honest. A long `sleep` is not.

### Example 4: Composition and Reuse

**Context**: Login is a precondition for a dozen flows and must not be copy-pasted.

**Implementation**:

```yaml
# maestro/subflows/login.yaml
appId: com.example.app
---
- tapOn:
    id: 'email_input'
- inputText: ${EMAIL}
- tapOn:
    id: 'password_input'
- inputText: ${PASSWORD}
- tapOn:
    id: 'login_submit_button'
- assertVisible:
    id: 'home_dashboard'
```

```yaml
# maestro/checkout-happy-path.yaml
appId: com.example.app
name: Checkout with a saved card
tags:
  - P0
  - checkout
---
- clearState
- launchApp
- runFlow:
    file: subflows/login.yaml
    env:
      EMAIL: 'user@example.com'
      PASSWORD: ${MAESTRO_TEST_PASSWORD}

- tapOn:
    id: 'product_card_0'
- tapOn:
    id: 'add_to_cart_button'
- assertVisible:
    text: 'Added to cart'
```

**Key points**:

- Subflows are the mobile equivalent of a fixture: one owner, many consumers
- Pass data through `env` rather than baking values into the subflow
- Keep subflows in a dedicated directory so a flow-count metric does not treat them as tests

### Example 5: Conditional and Platform-Specific Steps

**Context**: A permission dialog appears on a first run, and only on one platform.

**Implementation**:

```yaml
- launchApp

# Handle an optional dialog without failing when it is absent
- runFlow:
    when:
      visible:
        id: 'com.android.permissioncontroller:id/permission_allow_button'
    commands:
      - tapOn:
          id: 'com.android.permissioncontroller:id/permission_allow_button'

# Platform-specific branch
- runFlow:
    when:
      platform: iOS
    commands:
      - tapOn: 'Allow While Using App'
```

**Key points**:

- `runFlow: when:` is the supported way to express "only if present"
- Do not wrap a genuinely required assertion in a `when:` guard; that converts a real failure into a silent skip

### Example 6: Commands Whose Behavior Is Not What the Name Suggests

**Context**: Four commands that read as cross-platform and are not, each of which has produced a flow that passed while proving nothing.

**Implementation**:

```yaml
# ❌ `back` is documented for Android and Web only. The iOS driver's back
# implementation is an empty method: it does nothing and still reports COMPLETED,
# so a flow that pops a screen this way silently no-ops on one platform.
- back
- assertVisible:
    id: 'previous_screen_root'

# ✅ Split it. Android gets the system gesture; iOS gets the app's own control.
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
    id: 'previous_screen_root'
```

```yaml
# ❌ On Android `hideKeyboard` is documented as identical to `back`, implemented
# as the system back key event. In React Native that also fires a Modal's
# onRequestClose, so this closes the dialog the flow is trying to fill in.
- inputText: 'user@example.com'
- hideKeyboard
- tapOn:
    id: 'dialog_submit_button' # gone; the modal was dismissed

# ✅ The documented workaround, and it happens to be cross-platform: dismiss the
# keyboard by tapping something that does not respond to taps.
- inputText: 'user@example.com'
- tapOn:
    id: 'dialog_title' # non-interactive element
- tapOn:
    id: 'dialog_submit_button'
```

```yaml
# ❌ `index` counts CURRENTLY-RENDERED matches, not items in the underlying list.
# Under React Native list virtualization the mapping drifts with scroll position
# and viewport, so this taps a different row on a different device.
- tapOn:
    text: 'Order .*'
    index: 3

# ✅ Address the item by what makes it that item
- tapOn:
    id: 'order_row_${ORDER_ID}'
# or scope relationally when no id exists
- tapOn:
    text: 'View'
    below:
      text: 'Order #10432'
```

```yaml
# `point` is a sanctioned escape hatch for an element that is genuinely not in the
# accessibility tree (a canvas, a map overlay, a video surface). The docs warn it
# is device-dependent, and percentage coordinates rot as soon as the device
# profile changes. Use it only with the reason written down.
- tapOn:
    point: '50%,73%' # map canvas: no accessibility node exists for the pin
```

```yaml
# `scrollUntilVisible` travels in ONE direction (default `DOWN`, 20s timeout, and a
# 100% visibility threshold) and stops where it stopped. A later search for an
# element ABOVE the current position keeps scrolling down and times out, which
# reads as "element missing" rather than "wrong direction".
- scrollUntilVisible:
    element:
      id: 'garment_row_9'
- scrollUntilVisible:
    element:
      id: 'garment_row_1' # already scrolled past; this fails as if the row were gone

# ✅ Name the direction, or return to a known position before searching again
- scrollUntilVisible:
    element:
      id: 'garment_row_1'
    direction: UP
```

**Waiting, precisely**:

- Assertions carry a **default timeout of about 7 seconds**. `extendedWaitUntil` is the sanctioned way to ask for longer, and it names the condition while doing so.
- **There is no "wait until the app is ready" command.** The documented idiom is to wait on the first piece of the app's own chrome that paints. A flow that waits on a launch marker the app never renders will wait for the full timeout and then fail somewhere unrelated.
- `waitForAnimationToEnd` defaults to a 15-second cap and **succeeds when that cap is reached**, so a bare use of it cannot fail the flow. That makes it safe as a settle step and useless as an assertion.
- Wrapping a large part of a flow in `retry` is an anti-pattern in the documentation's own words, and the retry count is capped at a small number. Retry a genuinely nondeterministic step, never a journey.

**Key points**:

- Before relying on a command across platforms, check its documented platform support; "runs without error" is not the same claim as "did something"
- A command that reports COMPLETED while doing nothing turns every assertion downstream of it into decoration
- Prefer commands whose failure is observable over commands whose success is unconditional

### Example 7: `text:` Selectors Are Regular Expressions

**Context**: An assertion that reads exactly like the label on screen and could never have matched it.

**Implementation**:

```yaml
# ❌ Every `text:` value is a regex, and it must match the element's ENTIRE text.
# The parentheses here are a capture group, so this pattern demands the literal
# string `Garments 2 of <anything> selected`, while the label on screen reads
# `Garments (2 of 10 selected)`. It could not have matched at any selection count.
- assertVisible:
    text: 'Garments (2 of .* selected)'

# ✅ Escape the characters that are literal
- assertVisible:
    text: 'Garments \(2 of .* selected\)'

# ✅ Or match on the stable part, padded to cover the whole element
- assertVisible:
    text: '.*2 of 10 selected.*'
```

**Key points**:

- `(`, `)`, `[`, `]`, `.`, `*`, `+`, `?`, `|`, `{`, `}`, `^`, `$` are all pattern syntax inside a `text:` value. Any label containing one needs escaping.
- Matching is against the **entire** element text, so a substring that is plainly on screen still fails without `.*` on both sides.
- The defect is invisible in review, because the YAML reads as the sentence a human sees on screen. Add the pattern to whatever lint the repository can host, because human review is demonstrably not the control that catches it.
- **Which direction it breaks depends on the command.** In `assertVisible` the impossible pattern fails after the default timeout and reads as a missing element, sending the diagnosis at the app rather than at the selector. In `assertNotVisible` it passes unconditionally, which is a check that cannot fail: see `evidence-integrity.md`.

### Example 8: A COMPLETED Tap Is Not a Handled Tap

**Context**: A checkbox in a virtualized list. Maestro reported the tap COMPLETED and the app never saw it.

Measured in isolation: the tap completed in 2.4 seconds, the target was present at `[45,1807][1035,1924]` with `clickable=true`, nothing sat above it in the hierarchy at the point tapped, and the count label still read `0 of 10` ten seconds later. `tapOn` reports COMPLETED once it has resolved the element and dispatched a touch, so its status describes the driver's action and not the app's response. One passing run recorded five taps for two selections, which makes the loss frequent rather than exotic.

**The mechanism is not established.** Those measurements rule out a missing element and an occluding overlay; they do not say where between the driver and the app's handler the touch went. Gesture-responder interaction with a list that has visually stopped moving is a plausible candidate and has not been tested. Treat that as an open question rather than a cause, and treat the pattern below as what it is: a countermeasure that keeps the flow honest while the cause is unknown, per the `evidence-integrity.md` rule that a stated mechanism is a claim needing a source.

**Implementation**:

```yaml
# ❌ The tap's status is not evidence that the state changed, and a single
# assertion at the end cannot say WHICH tap was lost.
- tapOn:
    id: 'garment_checkbox_0'
- tapOn:
    id: 'garment_checkbox_1'
- assertVisible:
    text: '.*2 of 10 selected.*'

# ✅ Pair each tap with the assertion that proves it landed, inside a small retry.
# The assertion is a real one, so a genuinely broken selection still fails.
- retry:
    maxRetries: 3
    commands:
      - tapOn:
          id: 'garment_checkbox_0'
      - assertVisible:
          text: '.*1 of 10 selected.*'
- retry:
    maxRetries: 3
    commands:
      - tapOn:
          id: 'garment_checkbox_1'
      - assertVisible:
          text: '.*2 of 10 selected.*'
```

**Key points**:

- `retry` takes `maxRetries` between `0` and `3`, defaulting to `1`. Retrying one nondeterministic step is the sanctioned use; the documentation calls wrapping a large part of a flow an anti-pattern, and wrapping the entire flow explicitly unpredictable.
- **Assert per action, not once at the end.** An end-of-sequence assertion cannot name which tap was lost, and that ambiguity is what produces a confident wrong first hypothesis.
- The retry does not weaken the check. The assertion inside it has to pass on its own, so what the retry absorbs is a lost touch, which is a property of the driver rather than of the app.
- If a step routinely needs its retry to land, that is a finding about the driver or the list, not an ordinary step. Record it rather than letting the retry hide it.

### Example 9: Visible Means Inside the Viewport, Not Present in the Hierarchy

**Context**: An element that is rendered, correct, and below the fold. `assertVisible` fails on it.

`assertVisible` and `extendedWaitUntil: visible` require the element to be **on screen**, not merely present in the view tree. An element in a scrolling section that has not been scrolled to is present, correct, and not visible, and the failure reads as "the feature is broken" rather than "the flow never scrolled".

**Implementation**:

```yaml
# ❌ Latent screen-height dependency: passes on a tall device, fails on a short one
- extendedWaitUntil:
    visible:
      id: 'premium_unavailable'
    timeout: 20000

# ✅ Scroll to what you assert on
- scrollUntilVisible:
    element:
      id: 'premium_unavailable'
- assertVisible:
    id: 'premium_unavailable'
```

**Key points**:

- **The diagnostic tell is cheap and decisive.** Dump the failing step's `screen-hierarchy` entry and look for the id. Present with bounds outside the screen is a scroll problem; absent is a different bug entirely. Checking this first is worth more than any hypothesis about the feature, and one investigation built three separate plausible mechanisms for such a failure (a remote flag answer, an unresolved dynamic import, a stuck initialization call) before two measurements killed all three and left the viewport.
- **Any `assertVisible` on an element inside a scrolling section is a screen-height dependency** until the flow scrolls to it. It will pass wherever it was written and fail on the first shorter device.
- This is the failure mode most likely to reproduce only in CI, because the runner's device profile is rarely the one the flow was written against. `mobile-ci-device-lab.md` carries the profile-parity rule.

### Example 10: Assert the Change, Not a State That May Already Hold

**Context**: A deep-link flow named "Widget Deep Link Hydration" that opened a link and asserted the home screen's own container was visible. The container was there before the link, so the assertion held whether or not the link did anything. On one platform it did nothing, and the suite reported 18 of 18.

Two shapes are stacked here, and the second one catches people who have already fixed the first.

**Shape one: the assertion targets something that predates the action.** A container, a screen root, or a nav bar that was on screen before the step cannot be evidence that the step worked. The tell is that the flow's name describes an effect the assertions never mention.

**Shape two: the assertion targets the right thing, in a state the app might already be in.** Asserting "morning is selected" after a link that selects morning passes whenever morning is the default. The check is about the action but still cannot fail.

**Implementation**:

```yaml
# ❌ Both shapes. The container predates the link, and even a corrected
# assertion on the default scenario would pass without the link doing anything.
- openLink: ${WIDGET_URL_AM}
- assertVisible:
    id: 'scenario-toggles' # already on screen before the link

# ✅ Assert the transition. State the precondition, act, then assert both that
# the new state holds and that the old one no longer does. Every link in the
# flow has to earn its own pass this way, including the first.
- assertVisible:
    id: 'scenario-toggle-morning'
    selected: true # PRECONDITION, not the outcome: names the state moved FROM

- openLink: ${WIDGET_URL_EVENING}
- assertVisible:
    id: 'scenario-toggle-evening'
    selected: true
- assertNotVisible:
    id: 'scenario-toggle-morning'
    selected: true # the move is what proves this link was applied

- openLink: ${WIDGET_URL_AM}
- assertVisible:
    id: 'scenario-toggle-morning'
    selected: true
- assertNotVisible:
    id: 'scenario-toggle-evening'
    selected: true # and the second link proves itself the same way
```

**Key points**:

- **Prefer asserting a change over asserting a state.** Where a single state is all you have, pick an input whose expected result differs from the app's default, so agreement with the default cannot carry the pass.
- **A precondition assertion is legitimate, and it is not the outcome.** Naming the state being moved from is what makes the following change meaningful, so mark it as a precondition and never let it stand in for proof that the action worked. Ordering the links so the first one also moves the selection is what stops the first step passing on the default, which is the trap the corrected block above is arranged to avoid.
- **Choose a deterministic input.** The same flow had link variants resolving from the current time and the day's forecast, which cannot be asserted without freezing the clock. Two other variants mapped fixed values straight through the same parse-route-apply path. Reach for the deterministic input rather than reaching for a clock stub: it exercises the identical code path and needs no test-only seam.
- `selected`, `checked`, `enabled`, and `focused` are documented state selectors and compose with `id` and `text` on `tapOn`, `assertVisible`, and `assertNotVisible`. `assertNotVisible` with a state selector is how "no longer selected" is expressed.
- **Check the syntax before the run.** `maestro check-syntax` validates flow files without a device, which is the cheap way to confirm a selector or field exists on the version you pin rather than discovering it in a red run.

## Anti-Patterns

| Anti-pattern                                                             | Why it fails                                                                              | Fix                                                                                   |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Flow with no `assertVisible`/`assertTrue`                                | Passes as long as taps land; proves nothing about behavior                                | Assert the destination state of every flow                                            |
| `sleep` used as synchronization                                          | Flaky under load, slow when not                                                           | `extendedWaitUntil` on the real condition                                             |
| `tapOn: index:` on a list                                                | Breaks when the list reorders or the backend returns a different order                    | Scope by `text` with `below`/`containsChild`                                          |
| `tapOn: point:` coordinates                                              | Breaks on a different screen size or density                                              | Address the element by `id`                                                           |
| No `clearState`                                                          | Flow depends on whatever ran before it; unreproducible in isolation                       | `clearState` before `launchApp`                                                       |
| Hardcoded credential or PII                                              | Leaks in the repo and in CI logs                                                          | `${ENV_VAR}` sourced from the CI secret store                                         |
| One flow covering six user journeys                                      | A failure names the flow, not the behavior; slow to diagnose                              | One journey per flow, composed from subflows                                          |
| Required assertion inside `when:`                                        | Turns a real failure into a silent pass                                                   | Guard only genuinely optional UI (permission dialogs, upsells)                        |
| `back` used as a cross-platform step                                     | Documented for Android and Web only; on iOS it does nothing and reports COMPLETED         | Split with `runFlow: when: platform:`; tap the app's own control on iOS               |
| `hideKeyboard` with a modal open                                         | The Android implementation is the system back key, which dismisses a React Native modal   | Tap a non-interactive element to drop the keyboard                                    |
| `optional: true` on the assertion that carries the outcome               | The step cannot fail, so the flow reports coverage it does not have                       | Assert hard; reserve `optional` for genuinely optional UI                             |
| `waitForAnimationToEnd` used as a wait-for-content                       | It succeeds when its cap is reached, so it cannot fail                                    | `extendedWaitUntil` on the content that must appear                                   |
| Unescaped regex characters in a `text:` selector                         | The value is a regex matched against the element's entire text, so it can never pass      | Escape literal `(`, `)`, `[`, `]`, `.`; pad partial matches with `.*`                 |
| Tap status treated as proof the app handled the tap                      | `tapOn` reports COMPLETED once the touch is dispatched, and touches do get lost           | Pair each state-changing tap with its own assertion inside a `retry`                  |
| One assertion at the end of a tap sequence                               | Cannot name which tap was lost, so the first hypothesis is a guess                        | Assert after every action that changes state                                          |
| `scrollUntilVisible` reused after an earlier search moved the list       | It travels only in the direction given, so the second search scrolls away from the target | Name the opposite `direction`, or return to a known position first                    |
| `assertVisible` on an element inside a scrolling section, with no scroll | Visible means inside the viewport; the element is present, correct, and below the fold    | `scrollUntilVisible` first, then assert                                               |
| Assertion targets a container that predates the action                   | It was on screen before the step, so it cannot be evidence the step worked                | Assert the action's own effect; the flow's name should name what it asserts           |
| Assertion on a state the app may already be in                           | Passes whenever the expected value is the default, so the action is not under test        | Assert the transition, or pick an input whose expected state differs from the default |
| Time- or forecast-dependent input in a flow assertion                    | The expected value cannot be stated without freezing the clock                            | Pick a deterministic input through the same code path                                 |

## Maestro Flow Checklist

Before merging a flow:

- [ ] **Isolated**: starts with `clearState` (or documents why it must not)
- [ ] **Asserts an outcome**: at least one `assertVisible`/`assertNotVisible`/`assertTrue` about the destination state
- [ ] **Identifier-first selectors**: `id` used wherever an accessibility identifier exists
- [ ] **No positional selection**: no bare `index:` or `point:` without a comment justifying it
- [ ] **No `sleep` as synchronization**: waits are `extendedWaitUntil` on a named condition with an explicit timeout
- [ ] **No secrets in the file**: credentials and tokens come from `${ENV}`
- [ ] **Single journey**: one user-visible outcome per flow, shared setup extracted to a subflow
- [ ] **Tagged by priority**: `P0`-`P3` tag present so CI can run the risk-appropriate subset
- [ ] **Runs on both target platforms**, or declares its platform branch explicitly
- [ ] **Cross-platform commands verified**: every command used on both platforms is documented for both, or split by `runFlow: when: platform:`
- [ ] **Every assertion can fail**: no `optional: true` on the assertion that carries the flow's outcome, and no assertion sitting downstream of a command that no-ops on that platform
- [ ] **`text:` selectors read as regex**: literal `(`, `)`, `[`, `]`, `.` escaped, and whole-element matching accounted for
- [ ] **Every state-changing tap has its own assertion**, rather than one assertion covering a sequence
- [ ] **`retry` scoped to a single step**, with `maxRetries` inside the documented 0-3 range
- [ ] **Nothing asserted below the fold**: every assertion on an element inside a scrolling section is preceded by a scroll to it
- [ ] **The assertion carrying the outcome post-dates its action**: a precondition assertion is allowed when it is labelled as one, and nothing already true before the step is presented as proof of it
- [ ] **Transitions asserted where possible**: a single-state assertion is justified only when the expected value differs from the default
- [ ] **Syntax checked**: `maestro check-syntax` run against the pinned version before the flow reaches a device

## Integration Points

- **Used in workflows**: `*framework` (scaffold a Maestro suite), `*automate` (generate flows), `*atdd` (red-phase mobile acceptance flows), `*test-review` (score flow quality), `*ci` (device pipeline)
- **Related fragments**: `mobile-test-strategy.md` (what belongs in a flow at all), `mobile-ci-device-lab.md` (the build artifact the flows run against, and the CI mechanics around them), `evidence-integrity.md` (why a step that cannot fail is the most expensive defect in a suite), `test-priorities-matrix.md` (P0-P3 tagging), `test-quality.md` (determinism and isolation standards), `selector-resilience.md` (the browser analogue of the selector hierarchy)
- **Tools**: `maestro test`, `maestro studio` (interactive flow authoring and element inspection), `maestro record`

_Source: Maestro 2.8.0 flow syntax and command reference (selectors, `retry`, `scrollUntilVisible`), mobile test-isolation practice, TEA test-quality standards applied to declarative flows, and defects measured in a live Maestro suite_
