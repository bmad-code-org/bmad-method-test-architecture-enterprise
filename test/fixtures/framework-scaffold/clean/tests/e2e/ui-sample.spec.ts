import { expect, log, test } from '../support/merged-fixtures';

// Reference sample: imports `test`/`expect`/`log` from the merged fixture index, never
// from `@playwright/test` directly. Declares `interceptNetworkCall` before `page.goto`
// and awaits it after, uses data-testid selectors, and takes `authToken` from the auth
// fixture (used here to verify the reservation through the API) rather than driving a
// login form.
test.describe('UI: locker reservation', () => {
  test('[P0] reserving a free locker shows it as occupied', async ({ page, apiRequest, authToken, interceptNetworkCall }) => {
    // Given the reservations list is intercepted before navigation
    const reservations = interceptNetworkCall({ url: '**/api/reservations' });
    await page.goto('/lockers');
    await reservations;

    // When the user reserves a free locker
    await log.step('reserve locker-42');
    await page.getByTestId('locker-42-reserve').click();

    // Then it shows as occupied, in the UI and through the API
    await expect(page.getByTestId('locker-42-status')).toHaveText('occupied');
    const fetched = await apiRequest({
      method: 'GET',
      path: '/api/reservations/locker-42',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(fetched.status).toBe(200);
  });
});
