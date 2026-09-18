import { test, expect } from '@playwright/test';

// The criterion ids are present only on this parent title. Playwright reports
// each executable leaf by its own title, so none of these scaffolds maps to an
// acceptance criterion even though a reader can see all five ids in the file.
test.describe('Reservations (ATDD): AC-1, AC-2, AC-3, AC-4, AC-5', () => {
  test.skip('[P0] reserving a free locker creates it', async ({ request }) => {
    const response = await request.post('/lockers/L-104/reservations', {
      data: { parcelId: 'PARCEL-1', durationMinutes: 30 },
    });
    expect(response.status()).toBe(201);
  });

  test.skip('[P1] a reserved locker cannot be reserved again', async ({ request }) => {
    await request.post('/lockers/L-104/reservations', { data: { parcelId: 'PARCEL-1', durationMinutes: 30 } });
    const second = await request.post('/lockers/L-104/reservations', { data: { parcelId: 'PARCEL-2', durationMinutes: 30 } });
    expect(second.status()).toBe(409);
  });

  test.skip('[P1] an out-of-range duration is rejected', async ({ request }) => {
    const response = await request.post('/lockers/L-104/reservations', {
      data: { parcelId: 'PARCEL-1', durationMinutes: 5000 },
    });
    expect(response.status()).toBe(422);
  });

  test.skip('[P2] releasing a reservation frees the locker', async ({ request }) => {
    const response = await request.delete('/lockers/L-104/reservations/some-reservation-id');
    expect(response.status()).toBe(204);
  });

  test.skip('[P1] the locker reports it is reserved', async ({ request }) => {
    const response = await request.get('/lockers/L-104');
    const body = await response.json();
    expect(body.reserved).toBe(true);
  });
});
