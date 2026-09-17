import { test, expect } from '@playwright/test';

// The broad object comparison fails on the missing reserved property before a
// direct scalar assertion can identify the exact criterion-defining mismatch.
test.describe('Reservations (ATDD)', () => {
  test.skip('[P1] AC-5 the locker reports it is reserved', async ({ request }) => {
    const response = await request.get('/lockers/L-104');
    const body = await response.json();

    expect(body).toEqual({
      id: 'L-104',
      location: 'Pier 4, bay 1',
      size: 'medium',
      reserved: true,
    });
    expect(body.reserved).toBe(true);
  });
});
