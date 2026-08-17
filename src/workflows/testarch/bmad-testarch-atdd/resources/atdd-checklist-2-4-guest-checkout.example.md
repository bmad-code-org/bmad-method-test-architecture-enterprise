---
stepsCompleted:
  [
    'step-01-preflight-and-context',
    'step-02-generation-mode',
    'step-03-test-strategy',
    'step-04-generate-tests',
    'step-04c-aggregate',
    'step-05-validate-and-complete',
  ]
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-08-17'
workflowType: 'testarch-atdd'
storyId: '2.4'
storyKey: '2-4-guest-checkout'
storyFile: 'docs/stories/2-4-guest-checkout.md'
atddChecklistPath: 'docs/test-artifacts/atdd-checklist-2-4-guest-checkout.md'
generatedTestFiles:
  - 'tests/api/guest-checkout.spec.ts'
  - 'tests/e2e/guest-checkout.spec.ts'
inputDocuments:
  - 'docs/stories/2-4-guest-checkout.md'
  - 'docs/qa/test-design-2-4-guest-checkout.md'
  - '_bmad/config.yaml'
---

# ATDD Checklist: Epic 2, Story 4: Guest Checkout

**Date:** 2026-08-17
**Author:** Jordan Silva
**Primary Test Level:** E2E

---

## Story Summary

Shoppers currently must create an account before they can pay, and cart abandonment data points at that step as the biggest drop-off in the funnel. This story lets a shopper complete a purchase with only an email address and shipping details, while still offering an easy upgrade to a full account right after the order is placed.

**As a** returning shopper without an account
**I want** to complete checkout using only my email and shipping details
**So that** I can finish my purchase without the friction of registering first

---

## Acceptance Criteria

1. A shopper with at least one item in the cart can reach checkout and complete payment without signing in or creating an account.
2. The checkout form requires a valid, syntactically well-formed email address before the "Place Order" button is enabled.
3. On successful payment, the shopper sees a confirmation screen showing the order number and an optional "Create an account" prompt pre-filled with the checkout email.
4. If the email entered at checkout matches an existing registered account, the shopper sees a "sign in instead" prompt and guest checkout is blocked until they sign in or use a different email.
5. If payment is declined, the shopper sees an inline error on the payment step and their cart and shipping details are preserved for retry.

---

## Story Integration Metadata

- **Story ID:** `2.4`
- **Story Key:** `2-4-guest-checkout`
- **Story File:** `docs/stories/2-4-guest-checkout.md`
- **Checklist Path:** `docs/test-artifacts/atdd-checklist-2-4-guest-checkout.md`
- **Generated Test Files:** `tests/e2e/guest-checkout.spec.ts`, `tests/api/guest-checkout.spec.ts`

If this story came from BMM `create-story`, mirror these artifact paths into the story's `Dev Notes` so `dev-story` can discover and activate the red-phase scaffolds.

---

## Red-Phase Test Scaffolds Created

### E2E Tests (6 tests)

**File:** `tests/e2e/guest-checkout.spec.ts` (278 lines)

- ✅ **Test:** [P0] should complete guest checkout with a new email and reach the confirmation screen
  - **Status:** RED: `/checkout/guest` renders only the existing shell; `POST /api/checkout/guest` returns 404
  - **Verifies:** A shopper with items in cart can submit shipping and payment details without an account and land on a confirmation screen showing the order number (AC1, AC3)
- ✅ **Test:** [P1] should offer account creation pre-filled with the guest email after purchase
  - **Status:** RED: the confirmation page and account-creation prompt do not exist yet
  - **Verifies:** The post-purchase prompt is optional and carries the exact checkout email into account creation (AC3)
- ✅ **Test:** [P1] should prompt sign-in instead of allowing guest checkout for an email tied to an existing account
  - **Status:** RED: the checkout form does not yet call the email-lookup endpoint, so no sign-in banner renders
  - **Verifies:** Guest checkout is blocked and a "sign in instead" prompt appears when the checkout email matches a registered account (AC4)
- ✅ **Test:** [P1] should preserve cart and shipping details when the payment step is declined
  - **Status:** RED: the payment step does not exist yet, so there is nothing to submit against the declined-card stub
  - **Verifies:** On a declined payment, the shopper sees an inline error and the cart and shipping form retain their values for retry (AC5)
- ✅ **Test:** [P1] should keep "Place Order" disabled while the email is malformed
  - **Status:** RED: the guest checkout form does not exist yet
  - **Verifies:** The primary action cannot be submitted until the email has valid syntax (AC2)
- ✅ **Test:** [P2] should show an inline validation message after leaving a malformed email
  - **Status:** RED: the guest checkout form does not exist yet
  - **Verifies:** A malformed email produces an actionable field-level validation message (AC2)

### API Tests (3 tests)

**File:** `tests/api/guest-checkout.spec.ts` (168 lines)

- ✅ **Test:** [P0] should create a guest order and return an order number when payment succeeds
  - **Status:** RED: `POST /api/checkout/guest` returns 404 (route not implemented)
  - **Verifies:** A guest order can be created from a cart, email, shipping address, and payment token in a single request (AC1, AC3)
- ✅ **Test:** [P0] should return 409 when the checkout email belongs to a registered account
  - **Status:** RED: same 404; no email-lookup branch exists
  - **Verifies:** The guest checkout endpoint rejects with 409 and an actionable message when the email is already registered (AC4)
- ✅ **Test:** [P1] should return 402 with a retryable flag when the payment gateway declines the charge
  - **Status:** RED: same 404
  - **Verifies:** A declined charge surfaces as 402 with `retryable: true` rather than a generic 500 (AC5)

---

## Data Factories Created

### CartItem Factory

**File:** `tests/support/factories/cart-item.factory.ts`

**Exports:**

- `createCartItem(overrides?)`: Create a single line item with a random SKU, price, and quantity
- `createCartItems(count)`: Create an array of line items

**Example Usage:**

```typescript
import { faker } from '@faker-js/faker';

type CartItem = {
  sku: string;
  name: string;
  unitPrice: number;
  quantity: number;
};

export const createCartItem = (overrides: Partial<CartItem> = {}): CartItem => ({
  sku: faker.string.alphanumeric(8).toUpperCase(),
  name: faker.commerce.productName(),
  unitPrice: parseFloat(faker.commerce.price({ min: 5, max: 200 })),
  quantity: faker.number.int({ min: 1, max: 3 }),
  ...overrides,
});

export const createCartItems = (count: number): CartItem[] => Array.from({ length: count }, () => createCartItem());

// Usage in a test:
const items = createCartItems(2);
```

### GuestCheckoutPayload Factory

**File:** `tests/support/factories/guest-checkout.factory.ts`

**Exports:**

- `createGuestCheckoutPayload(overrides?)`: Create a complete guest checkout request body
- `createDeclinedPaymentToken()`: Return a payment token the sandbox gateway is configured to always decline

**Example Usage:**

```typescript
const payload = createGuestCheckoutPayload({ email: 'shopper@example.com' });
const declinedPayload = createGuestCheckoutPayload({ paymentToken: createDeclinedPaymentToken() });
```

---

## Fixtures Created

### Guest Checkout Fixtures

**File:** `tests/support/fixtures/guest-checkout.fixture.ts`

**Fixtures:**

- `guestCart`: Seeds a cart with two random line items before the test runs
  - **Setup:** Builds two `createCartItem()` records and POSTs them to `/api/cart` under a fresh session id
  - **Provides:** `{ cartId, items }` to the test
  - **Cleanup:** `DELETE /api/cart/{cartId}` after the test, regardless of pass or fail
- `registeredShopper`: Seeds one registered account so the "existing account" scenario has a real email to collide with
  - **Setup:** POSTs a generated account to `/api/users`
  - **Provides:** `{ email }` of the seeded account to the test
  - **Cleanup:** `DELETE /api/users/{id}` after the test

**Example Usage:**

```typescript
import { test } from '../support/merged-fixtures';

test('should prompt sign-in for an existing account email', async ({ page, guestCart, registeredShopper, interceptNetworkCall }) => {
  // guestCart and registeredShopper are seeded and cleaned up automatically
});
```

---

## Mock Requirements

### Payment Gateway Mock

**Endpoint:** `POST /v1/payments/charge`

**Success Response:**

```json
{
  "status": "succeeded",
  "chargeId": "ch_9f2a1c",
  "amount": 4999,
  "currency": "usd"
}
```

**Failure Response:**

```json
{
  "status": "declined",
  "declineCode": "card_declined",
  "retryable": true
}
```

**Notes:** The application server calls this gateway; the browser does not. Configure the server-side payment adapter to use the stub URL before the test starts. In E2E tests, declare `interceptNetworkCall` for the browser's `POST /api/checkout/guest` request before submitting the form, then await that application response. Never try to intercept `/v1/payments/charge` from the browser. The declined-charge scenario uses `createDeclinedPaymentToken()` against the server-side stub.

---

## Required data-testid Attributes

### Guest Checkout Page

- `guest-checkout-email-input`: Email field on the checkout form
- `guest-checkout-existing-account-banner`: Banner shown when the email matches a registered account
- `guest-checkout-place-order-button`: Primary submit button, disabled until the form is valid
- `guest-checkout-email-error`: Field-level message shown after leaving a malformed email
- `guest-checkout-payment-error`: Inline error region for a declined charge

### Order Confirmation Page

- `order-confirmation-number`: Displays the generated order number
- `create-account-prompt`: Optional post-purchase account creation prompt, pre-filled with the checkout email
- `create-account-email-input`: Email input inside the account-creation prompt

**Implementation Example:**

```tsx
<input data-testid="guest-checkout-email-input" type="email" />
<div data-testid="guest-checkout-email-error">{emailError}</div>
<div data-testid="guest-checkout-existing-account-banner">{existingAccountMessage}</div>
<button data-testid="guest-checkout-place-order-button" disabled={!isValid}>
  Place Order
</button>
<div data-testid="guest-checkout-payment-error">{paymentError}</div>
<span data-testid="order-confirmation-number">{orderNumber}</span>
<section data-testid="create-account-prompt">
  <input data-testid="create-account-email-input" value={email} readOnly />
</section>
```

---

## Implementation Checklist

### Test: [P0] should complete guest checkout with a new email and reach the confirmation screen

**File:** `tests/e2e/guest-checkout.spec.ts`

**Tasks to make this test pass:**

- [ ] Add the `/checkout/guest` route and render the checkout form without requiring a session
- [ ] Implement `POST /api/checkout/guest` to create an order from cart, email, shipping address, and payment token
- [ ] Wire the confirmation screen to show the returned order number
- [ ] Add required data-testid attributes: `guest-checkout-email-input`, `guest-checkout-place-order-button`, `order-confirmation-number`
- [ ] Run test: `npx playwright test tests/e2e/guest-checkout.spec.ts -g "should complete guest checkout"`
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 6 hours

---

### Test: [P1] should offer account creation pre-filled with the guest email after purchase

**File:** `tests/e2e/guest-checkout.spec.ts`

**Tasks to make this test pass:**

- [ ] Render an optional account-creation prompt after a successful guest order
- [ ] Pre-fill its email input from the completed checkout without asking the shopper to retype it
- [ ] Add required data-testid attributes: `create-account-prompt`, `create-account-email-input`
- [ ] Run test: `npx playwright test tests/e2e/guest-checkout.spec.ts -g "should offer account creation"`
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 2 hours

---

### Test: [P1] should prompt sign-in instead of allowing guest checkout for an email tied to an existing account

**File:** `tests/e2e/guest-checkout.spec.ts`

**Tasks to make this test pass:**

- [ ] Add an email-lookup call on blur that checks whether the email belongs to a registered account
- [ ] Render the "sign in instead" banner and disable "Place Order" while it is showing
- [ ] Clear the banner when the shopper edits the email field
- [ ] Add required data-testid attributes: `guest-checkout-existing-account-banner`
- [ ] Run test: `npx playwright test tests/e2e/guest-checkout.spec.ts -g "should prompt sign-in instead"`
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 3 hours

---

### Test: [P1] should preserve cart and shipping details when the payment step is declined

**File:** `tests/e2e/guest-checkout.spec.ts`

**Tasks to make this test pass:**

- [ ] Keep the cart and shipping form state in memory across a failed payment submission
- [ ] Render the inline decline error without navigating away from the payment step
- [ ] Allow resubmission with a different payment token without re-entering shipping details
- [ ] Add required data-testid attributes: `guest-checkout-payment-error`
- [ ] Run test: `npx playwright test tests/e2e/guest-checkout.spec.ts -g "should preserve cart and shipping"`
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 4 hours

---

### Test: [P0] should create a guest order and return an order number when payment succeeds

**File:** `tests/api/guest-checkout.spec.ts`

**Tasks to make this test pass:**

- [ ] Implement `POST /api/checkout/guest` request validation (cart, email, shipping address, payment token)
- [ ] Call the payment gateway and, on success, persist the order and generate an order number
- [ ] Return 201 with the order number and confirmation payload
- [ ] Run test: `npx playwright test tests/api/guest-checkout.spec.ts -g "should create a guest order"`
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 5 hours

---

### Test: [P0] should return 409 when the checkout email belongs to a registered account

**File:** `tests/api/guest-checkout.spec.ts`

**Tasks to make this test pass:**

- [ ] Add an account lookup by email before order creation
- [ ] Return 409 with a message that names the conflict and points at sign-in
- [ ] Ensure no order or payment charge is created on this path
- [ ] Run test: `npx playwright test tests/api/guest-checkout.spec.ts -g "should return 409"`
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 2 hours

---

### Test: [P1] should return 402 with a retryable flag when the payment gateway declines the charge

**File:** `tests/api/guest-checkout.spec.ts`

**Tasks to make this test pass:**

- [ ] Map a `declined` gateway response to a 402 API response
- [ ] Include `retryable: true` in the response body so the client can offer retry
- [ ] Ensure the cart is not cleared when the charge is declined
- [ ] Run test: `npx playwright test tests/api/guest-checkout.spec.ts -g "should return 402"`
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 2 hours

---

### Test: [P1] should keep "Place Order" disabled while the email is malformed

**File:** `tests/e2e/guest-checkout.spec.ts`

**Tasks to make this test pass:**

- [ ] Build the guest checkout form with an email field and a "Place Order" button
- [ ] Wire client-side email validation to the button's disabled state
- [ ] Add required data-testid attributes: `guest-checkout-email-input`, `guest-checkout-place-order-button`
- [ ] Run test: `npx playwright test tests/e2e/guest-checkout.spec.ts -g "should keep Place Order disabled"`
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 2 hours

---

### Test: [P2] should show an inline validation message after leaving a malformed email

**File:** `tests/e2e/guest-checkout.spec.ts`

**Tasks to make this test pass:**

- [ ] Add inline validation copy for a malformed email
- [ ] Render the message next to the email field on blur, not on every keystroke
- [ ] Add required data-testid attribute: `guest-checkout-email-error`
- [ ] Run test: `npx playwright test tests/e2e/guest-checkout.spec.ts -g "should show an inline"`
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 1 hour

---

## Running Tests

```bash
# Run all activated tests for this story
npx playwright test tests/e2e/guest-checkout.spec.ts tests/api/guest-checkout.spec.ts

# Run specific test file
npx playwright test tests/e2e/guest-checkout.spec.ts

# Run tests in headed mode (see browser)
npx playwright test tests/e2e/guest-checkout.spec.ts --headed

# Debug specific test
npx playwright test tests/e2e/guest-checkout.spec.ts --debug -g "should complete guest checkout"

# Run tests with coverage
npx c8 --reporter=text npx playwright test tests/api/guest-checkout.spec.ts
```

---

## Red-Green-Refactor Workflow

### RED Phase (Complete) ✅

**TEA Agent Responsibilities:**

- ✅ All tests written as red-phase scaffolds with `test.skip()`
- ✅ Fixtures and factories created with auto-cleanup
- ✅ Mock requirements documented
- ✅ data-testid requirements listed
- ✅ Implementation checklist created

**Verification:**

- All generated tests are present and marked with `test.skip()`
- Activation guidance is clear and actionable
- Any activated test fails due to missing implementation, not test bugs

---

### GREEN Phase: DEV Team Next Steps

**DEV Agent Responsibilities:**

1. **Pick one scaffolded test** from implementation checklist (start with highest priority)
2. **Remove `test.skip()`** for that test and confirm it fails first
3. **Read the test** to understand expected behavior
4. **Implement minimal code** to make that specific test pass
5. **Run the test** to verify it now passes (green)
6. **Check off the task** in implementation checklist
7. **Move to next test** and repeat

**Key Principles:**

- One test at a time (don't try to fix all at once)
- Minimal implementation (don't over-engineer)
- Run tests frequently (immediate feedback)
- Use implementation checklist as roadmap

**Progress Tracking:**

- Check off tasks as you complete them
- Share progress in daily standup

---

### REFACTOR Phase: DEV Team After All Tests Pass

**DEV Agent Responsibilities:**

1. **Verify all tests pass** (green phase complete)
2. **Review code for quality** (readability, maintainability, performance)
3. **Extract duplications** (DRY principle)
4. **Optimize performance** (if needed)
5. **Ensure tests still pass** after each refactor
6. **Update documentation** (if API contracts change)

**Key Principles:**

- Tests provide safety net (refactor with confidence)
- Make small refactors (easier to debug if tests fail)
- Run tests after each change
- Don't change test behavior (only implementation)

**Completion:**

- All tests pass
- Code quality meets team standards
- No duplications or code smells
- Ready for code review and story approval

---

## Next Steps

1. **Link this checklist and generated tests** into the story file `Dev Notes` / `ATDD Artifacts` section when a writable story file is available
2. **If the story file cannot be updated automatically**, share this checklist and generated tests with the dev workflow as a manual handoff
3. **Review this checklist** with team in standup or planning
4. **Begin implementation** using implementation checklist as guide
5. **Activate one scaffold at a time** by removing `test.skip()` for the current task, then confirm it fails before implementing
6. **Work one activated test at a time** (red → green for each)
7. **Share progress** in daily standup
8. **When all activated tests pass**, refactor code for quality
9. **When refactoring complete**, manually update story status to 'done' in sprint-status.yaml

---

## Knowledge Base References Applied

This ATDD workflow consulted the following knowledge fragments:

- **[fixture-architecture.md](./knowledge/fixture-architecture.md)**: Test fixture patterns with setup/teardown and auto-cleanup using Playwright's `test.extend()`
- **[data-factories.md](./knowledge/data-factories.md)**: Factory patterns using `@faker-js/faker` for random test data generation with overrides support
- **[network-first.md](./knowledge/network-first.md)**: Route observation declared before the browser action that triggers it
- **[test-quality.md](./knowledge/test-quality.md)**: Test design principles covering Given-When-Then, atomicity, determinism, and isolation
- **[test-levels-framework.md](./knowledge/test-levels-framework.md)**: Test level selection for E2E and API coverage

See [tea-index.csv](./tea-index.csv) for complete knowledge fragment mapping.

---

## Test Execution Evidence

### Initial Scaffold Review / RED Verification

**Command:** `npx playwright test tests/e2e/guest-checkout.spec.ts tests/api/guest-checkout.spec.ts`

**Results:**

```
Running 9 tests using 2 workers

  -  [chromium] › guest-checkout.spec.ts › Guest Checkout E2E User Journey (ATDD) › [P0] should complete guest checkout with a new email and reach the confirmation screen
  -  [chromium] › guest-checkout.spec.ts › Guest Checkout E2E User Journey (ATDD) › [P1] should offer account creation pre-filled with the guest email after purchase
  -  [chromium] › guest-checkout.spec.ts › Guest Checkout E2E User Journey (ATDD) › [P1] should prompt sign-in instead of allowing guest checkout for an email tied to an existing account
  -  [chromium] › guest-checkout.spec.ts › Guest Checkout E2E User Journey (ATDD) › [P1] should preserve cart and shipping details when the payment step is declined
  -  [chromium] › guest-checkout.spec.ts › Guest Checkout E2E User Journey (ATDD) › [P1] should keep "Place Order" disabled while the email is malformed
  -  [chromium] › guest-checkout.spec.ts › Guest Checkout E2E User Journey (ATDD) › [P2] should show an inline validation message after leaving a malformed email
  -  guest-checkout.spec.ts › Guest Checkout API Tests (ATDD) › [P0] should create a guest order and return an order number when payment succeeds
  -  guest-checkout.spec.ts › Guest Checkout API Tests (ATDD) › [P0] should return 409 when the checkout email belongs to a registered account
  -  guest-checkout.spec.ts › Guest Checkout API Tests (ATDD) › [P1] should return 402 with a retryable flag when the payment gateway declines the charge

  9 skipped

To open last HTML report run:
  npx playwright show-report
```

**Summary:**

- Total tests: 9
- Skipped: 9 (expected before activation)
- Activated RED tests: 0 (expected after activation, before implementation)
- Passing: 0 before implementation (expected for activated tests)
- Status: ✅ Red-phase scaffolds verified

**Expected Failure Messages:**
Once a test is activated (its `test.skip()` removed) and run before implementation, expect:

- Guest checkout completion: `page.goto('/checkout/guest')` resolves but `POST /api/checkout/guest` returns 404, so the confirmation assertion times out
- Account-creation prompt: the confirmation page is absent, so `create-account-prompt` and its pre-filled email input cannot be found
- Existing-account sign-in prompt: the email-lookup call 404s, so `guest-checkout-existing-account-banner` never renders and the visibility assertion times out
- Declined-payment retry: the payment step markup does not exist, so the locator for `guest-checkout-payment-error` cannot be found
- Email validation tests: the guest checkout form is absent, so neither the disabled-state nor inline-message assertion can resolve its locator
- Guest order creation / 409 / 402 API tests: `POST /api/checkout/guest` returns 404 instead of the expected status code

---

## Notes

- Guest checkout intentionally excludes loyalty-points calculation, which is scoped to story 2-5. Do not fold that logic into this story's tests.
- The real payment gateway sandbox occasionally returns a slow `succeeded` response under load. CI uses the server-side stub instead. The browser test waits on the application's `/api/checkout/guest` response and uses `recurse` only for an asynchronous order state, never a fixed timeout.
- `registeredShopper` reuses the same accounts API as the existing signup suite. If that suite's cleanup helper changes, re-check this fixture's teardown for drift.

---

## Contact

**Questions or Issues?**

- Ask in team standup
- Tag @tea-guild in Slack/Discord
- Refer to the [ATDD workflow documentation](https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/how-to/workflows/run-atdd/)
- Consult the local [knowledge index](./tea-index.csv) for testing best practices

---

**Generated by BMad TEA Agent:** 2026-08-17
