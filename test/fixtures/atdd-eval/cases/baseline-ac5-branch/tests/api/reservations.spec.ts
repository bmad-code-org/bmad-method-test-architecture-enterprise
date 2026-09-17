import { test, expect } from '@playwright/test';

// AC-5 describes both sides of a state transition. This scaffold selects the
// unchanged baseline side, so it misses the transition-bearing example used
// to prove the new reservation behavior in the red phase.
test.describe('Reservations (ATDD)', () => {
  test.skip('[P0] AC-1 reserving a free locker creates it', async ({ request }) => {
    const response = await request.post('/lockers/L-104/reservations', {
      data: { parcelId: 'PARCEL-1', durationMinutes: 30 },
    });
    expect(response.status()).toBe(201);
  });

  test.skip('[P1] AC-2 a reserved locker cannot be reserved again', async ({ request }) => {
    await request.post('/lockers/L-104/reservations', { data: { parcelId: 'PARCEL-1', durationMinutes: 30 } });
    const second = await request.post('/lockers/L-104/reservations', { data: { parcelId: 'PARCEL-2', durationMinutes: 30 } });
    expect(second.status()).toBe(409);
  });

  test.skip('[P1] AC-3 an out-of-range duration is rejected', async ({ request }) => {
    const response = await request.post('/lockers/L-104/reservations', {
      data: { parcelId: 'PARCEL-1', durationMinutes: 5000 },
    });
    expect(response.status()).toBe(422);
  });

  test.skip('[P2] AC-4 releasing a reservation frees the locker', async ({ request }) => {
    const response = await request.delete('/lockers/L-104/reservations/some-reservation-id');
    expect(response.status()).toBe(204);
  });

  test.skip('[P1] AC-5 the locker reports it is not reserved', async ({ request }) => {
    const response = await request.get('/lockers/L-104');
    const body = await response.json();
    expect(body.reserved).toBe(false);
  });
});
