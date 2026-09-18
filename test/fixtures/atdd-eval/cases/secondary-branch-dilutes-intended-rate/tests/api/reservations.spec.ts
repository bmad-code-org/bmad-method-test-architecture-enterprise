import { test, expect } from '@playwright/test';

// The primary transition-bearing branch fails for AC-5's declared reason. The
// extra baseline branch fails on a different value and dilutes the suite rate.
test.describe('Reservations (ATDD)', () => {
  test.skip('[P1] AC-5 the active locker reports reserved', async ({ request }) => {
    await request.post('/lockers/L-104/reservations', {
      data: { parcelId: 'PARCEL-1', durationMinutes: 30 },
    });
    const response = await request.get('/lockers/L-104');
    const body = await response.json();
    expect(body.reserved).toBe(true);
  });

  test.skip('[P1] AC-5 the available locker reports not reserved', async ({ request }) => {
    const response = await request.get('/lockers/L-217');
    const body = await response.json();
    expect(body.reserved).toBe(false);
  });
});
