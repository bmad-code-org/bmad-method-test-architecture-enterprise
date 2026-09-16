import { test, expect } from '@playwright/test';

// A scaffold used only by test/test-contract-oracles.js, to exercise the atdd
// contract's oracles on the false side of every claim they make: it is never
// staged by test/eval-atdd.js and never scored as a replay case. Every test
// below is active rather than deferred, and none names a criterion the
// corpus's own story states. (Deliberately avoiding the exact tokens this
// file's own oracles search for, in this comment, is the point.)
test.describe('Oracle check (ATDD)', () => {
  test('reserving a free locker creates it', async ({ request }) => {
    const response = await request.post('/lockers/L-104/reservations', {
      data: { parcelId: 'PARCEL-1', durationMinutes: 30 },
    });
    expect(response.status()).toBe(201);
  });
});
