// EVAL FIXTURE — deliberately clean. Every violation reported against this file
// is a false positive, and the harness counts it as one. Do not add defects here,
// and do not "improve" it either: a change to this file moves the precision
// baseline. See test/eval-test-review.js.
import { expect, test } from '@playwright/test'

const PROFILE_ROUTE = '**/api/profile'

const buildProfile = (overrides: Partial<{ displayName: string; locale: string }> = {}) => ({
  displayName: 'Ada Lovelace',
  locale: 'en-US',
  ...overrides,
})

test.describe('Profile', () => {
  test('[P1] shows the display name the API returned', async ({ page }) => {
    const profile = buildProfile()
    // Network-first: the intercept is registered before the navigation that
    // triggers it, so the assertion cannot race the data load.
    const profileResponse = page.waitForResponse(PROFILE_ROUTE)
    await page.route(PROFILE_ROUTE, (route) => route.fulfill({ json: profile }))

    await page.goto('/profile')
    await profileResponse

    await expect(page.getByRole('heading', { level: 1, name: profile.displayName })).toBeVisible()
  })

  test('[P2] surfaces a validation error for an empty display name', async ({ page }) => {
    await page.route(PROFILE_ROUTE, (route) => route.fulfill({ json: buildProfile({ displayName: '' }) }))

    await page.goto('/profile')

    await expect(page.getByRole('alert')).toHaveText('Display name is required')
  })
})
