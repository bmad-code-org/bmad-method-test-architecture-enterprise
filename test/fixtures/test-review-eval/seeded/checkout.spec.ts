// EVAL FIXTURE — every defect below is planted on purpose.
// Ground truth lives in checkout.spec.expected.json. Do not "fix" this file:
// the harness measures whether the reviewer finds these, so a repair here is a
// silent change to the benchmark. See test/eval-test-review.js.
import { expect, test } from '@playwright/test'

// H4: module-level mutable state written inside a test, never reset, so the
// outcome depends on which test ran first.
let lastOrderId = ''

test.describe('Checkout', () => {
  test('places an order and records the id', async ({ page }) => {
    await page.goto('/checkout')

    // H1: a bare timer used to order steps.
    await page.waitForTimeout(3000)

    // L1: located by CSS id where a role or label locator is available.
    await page.locator('#submit-order-btn').click()

    const banner = page.getByRole('status')
    lastOrderId = (await banner.textContent()) ?? ''
    await expect(banner).toContainText('Order placed')
  })

  test('shows the order in history', async ({ page }) => {
    await page.goto('/orders')

    // H3: control flow decides whether anything is asserted at all. When
    // lastOrderId is empty this test passes having checked nothing.
    if (lastOrderId) {
      await expect(page.getByText(lastOrderId)).toBeVisible()
    }
  })

  // C1: the traversal-rejection case is the one that matters here, and it is
  // skipped with no reason recorded.
  test.skip('rejects an order that leaves the tenant boundary', async ({ page }) => {
    await page.goto('/checkout?tenant=../other')
    await expect(page.getByRole('alert')).toContainText('Invalid tenant')
  })
})
