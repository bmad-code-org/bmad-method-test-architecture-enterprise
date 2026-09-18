import { test, expect } from '@playwright/test';

// The page is reachable, then the first browser interaction fails before the
// criterion-defining assertion. The scorer must report a non-assertion exit.
test.describe('Reservations E2E (ATDD)', () => {
  test.skip('[P0] AC-1 reserving a free locker creates it', async ({ page }) => {
    await page.goto('/lockers/L-104');
    await page.getByRole('button', { name: 'Reserve locker' }).click({ timeout: 100 });
    await expect(page.getByText('Reservation created')).toBeVisible();
  });
});
