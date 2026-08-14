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

**Waiting, precisely**:

- Assertions carry a **default timeout of about 7 seconds**. `extendedWaitUntil` is the sanctioned way to ask for longer, and it names the condition while doing so.
- **There is no "wait until the app is ready" command.** The documented idiom is to wait on the first piece of the app's own chrome that paints. A flow that waits on a launch marker the app never renders will wait for the full timeout and then fail somewhere unrelated.
- `waitForAnimationToEnd` defaults to a 15-second cap and **succeeds when that cap is reached**, so a bare use of it cannot fail the flow. That makes it safe as a settle step and useless as an assertion.
- Wrapping a large part of a flow in `retry` is an anti-pattern in the documentation's own words, and the retry count is capped at a small number. Retry a genuinely nondeterministic step, never a journey.

**Key points**:

- Before relying on a command across platforms, check its documented platform support; "runs without error" is not the same claim as "did something"
- A command that reports COMPLETED while doing nothing turns every assertion downstream of it into decoration
- Prefer commands whose failure is observable over commands whose success is unconditional

## Anti-Patterns

| Anti-pattern                                               | Why it fails                                                                            | Fix                                                                     |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Flow with no `assertVisible`/`assertTrue`                  | Passes as long as taps land; proves nothing about behavior                              | Assert the destination state of every flow                              |
| `sleep` used as synchronization                            | Flaky under load, slow when not                                                         | `extendedWaitUntil` on the real condition                               |
| `tapOn: index:` on a list                                  | Breaks when the list reorders or the backend returns a different order                  | Scope by `text` with `below`/`containsChild`                            |
| `tapOn: point:` coordinates                                | Breaks on a different screen size or density                                            | Address the element by `id`                                             |
| No `clearState`                                            | Flow depends on whatever ran before it; unreproducible in isolation                     | `clearState` before `launchApp`                                         |
| Hardcoded credential or PII                                | Leaks in the repo and in CI logs                                                        | `${ENV_VAR}` sourced from the CI secret store                           |
| One flow covering six user journeys                        | A failure names the flow, not the behavior; slow to diagnose                            | One journey per flow, composed from subflows                            |
| Required assertion inside `when:`                          | Turns a real failure into a silent pass                                                 | Guard only genuinely optional UI (permission dialogs, upsells)          |
| `back` used as a cross-platform step                       | Documented for Android and Web only; on iOS it does nothing and reports COMPLETED       | Split with `runFlow: when: platform:`; tap the app's own control on iOS |
| `hideKeyboard` with a modal open                           | The Android implementation is the system back key, which dismisses a React Native modal | Tap a non-interactive element to drop the keyboard                      |
| `optional: true` on the assertion that carries the outcome | The step cannot fail, so the flow reports coverage it does not have                     | Assert hard; reserve `optional` for genuinely optional UI               |
| `waitForAnimationToEnd` used as a wait-for-content         | It succeeds when its cap is reached, so it cannot fail                                  | `extendedWaitUntil` on the content that must appear                     |

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

## Integration Points

- **Used in workflows**: `*framework` (scaffold a Maestro suite), `*automate` (generate flows), `*atdd` (red-phase mobile acceptance flows), `*test-review` (score flow quality), `*ci` (device pipeline)
- **Related fragments**: `mobile-test-strategy.md` (what belongs in a flow at all), `mobile-ci-device-lab.md` (the build artifact the flows run against, and the CI mechanics around them), `evidence-integrity.md` (why a step that cannot fail is the most expensive defect in a suite), `test-priorities-matrix.md` (P0-P3 tagging), `test-quality.md` (determinism and isolation standards), `selector-resilience.md` (the browser analogue of the selector hierarchy)
- **Tools**: `maestro test`, `maestro studio` (interactive flow authoring and element inspection), `maestro record`

_Source: Maestro flow syntax and command reference, mobile test-isolation practice, TEA test-quality standards applied to declarative flows_
