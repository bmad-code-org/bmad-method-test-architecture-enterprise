import { test, expect } from '@playwright/test';
import { reservationPayload } from '../support/factories/reservation';

const FREE_LOCKER = 'L-104';
const SECOND_LOCKER = 'L-217';
const SMALL_LOCKER = 'L-330';
const MAX_DURATION_MINUTES = 1440;

test.describe('Story 4.2 Reserve a locker API (ATDD)', () => {
  test.skip('[P0] AC-1 reserves a free locker', async ({ request }) => {
    const payload = reservationPayload({ durationMinutes: 30 });
    const response = await request.post(`/lockers/${FREE_LOCKER}/reservations`, { data: payload });

    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.reservationId).toEqual(expect.any(String));
    expect(body.reservationId.length).toBeGreaterThan(0);
    expect(body.lockerId).toBe(FREE_LOCKER);
    expect(body.parcelId).toBe(payload.parcelId);
    expect(body.expiresAt).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(body.expiresAt))).toBe(false);
  });

  test.skip('[P0] AC-2 rejects a second reservation for an actively reserved locker', async ({ request }) => {
    await request.post(`/lockers/${SECOND_LOCKER}/reservations`, { data: reservationPayload() });
    const response = await request.post(`/lockers/${SECOND_LOCKER}/reservations`, {
      data: reservationPayload(),
    });

    expect(response.status()).toBe(409);
    expect(await response.json()).toEqual({ error: 'locker-reserved' });
  });

  test.skip('[P0] AC-3 rejects a duration above the allowed maximum', async ({ request }) => {
    const response = await request.post(`/lockers/${SMALL_LOCKER}/reservations`, {
      data: reservationPayload({ durationMinutes: MAX_DURATION_MINUTES + 1 }),
    });

    expect(response.status()).toBe(422);
    expect(await response.json()).toEqual({ error: 'invalid-duration' });
  });

  test.skip('[P0] AC-4 releases an existing reservation', async ({ request }) => {
    // Bind this known ID to a reserved locker fixture before activating the scaffold.
    const knownReservationId = 'reservation-for-L-104';
    const response = await request.delete(
      `/lockers/${FREE_LOCKER}/reservations/${knownReservationId}`,
    );

    expect(response.status()).toBe(204);
    expect(await response.body()).toHaveLength(0);
  });

  test.skip('[P1] AC-5 reports an actively reserved locker as reserved', async ({ request }) => {
    // Arrange SMALL_LOCKER as reserved before activating the scaffold.
    const response = await request.get(`/lockers/${SMALL_LOCKER}`);
    const body = await response.json();

    expect(body.reserved).toBe(true);
    expect(body).toMatchObject({
      id: SMALL_LOCKER,
      location: 'Ferry hall, wall 3',
      size: 'small',
    });
  });
});
