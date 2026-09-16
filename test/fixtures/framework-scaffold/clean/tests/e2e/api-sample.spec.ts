import { expect, log, test } from '../support/merged-fixtures';

// Reference sample: imports `test`/`expect`/`log` from the merged fixture index, never
// from `@playwright/test` directly. Uses `apiRequest` for setup and teardown, `authToken`
// from the auth fixture rather than a login form, and `log.step` for milestones.
test.describe('API: locker reservation', () => {
  test('[P0] reserving a free locker creates it', async ({ apiRequest, authToken }) => {
    // Given a valid auth token and a free locker
    await log.step('create reservation');
    const created = await apiRequest({
      method: 'POST',
      path: '/api/reservations',
      headers: { Authorization: `Bearer ${authToken}` },
      body: { item: 'locker-42' },
    });

    // When the reservation is created
    expect(created.status).toBe(201);

    // Then it can be read back
    const fetched = await apiRequest({
      method: 'GET',
      path: `/api/reservations/${created.body.id}`,
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(fetched.status).toBe(200);
    expect(fetched.body.item).toBe('locker-42');

    // Cleanup
    await log.step('cleanup reservation');
    await apiRequest({
      method: 'DELETE',
      path: `/api/reservations/${created.body.id}`,
      headers: { Authorization: `Bearer ${authToken}` },
    });
  });
});
