import { test, expect } from '@playwright/test';

// Boundary-value assertions covering all four rules docs/stories/6-6-voucher-redemption.md
// states: expiry, the inclusive minimum-spend boundary, both discount types, and the
// discount cap. The first test is the one that catches the seeded regression: it
// redeems SAVE10 at a cart total exactly equal to its minimumSpend, which is the exact
// value test-automate-eval-fixture.js's mutation cycle flips from accepted to rejected.
test.describe('voucher redemption (automate-eval correct-run)', () => {
  test('SAVE10 redeemed exactly at its minimum spend is accepted with its full discount', async ({ request }) => {
    const response = await request.post('/redeem', {
      data: { code: 'SAVE10', cartTotal: 50, redeemedOn: '2026-01-01' },
    });
    const body = await response.json();
    expect(body).toEqual({ accepted: true, discount: 5 });
  });

  test('EXPIRED10 redeemed after its expiry date is rejected as expired', async ({ request }) => {
    const response = await request.post('/redeem', {
      data: { code: 'EXPIRED10', cartTotal: 20, redeemedOn: '2026-01-01' },
    });
    const body = await response.json();
    expect(body).toEqual({ accepted: false, reason: 'expired' });
  });

  test('SAVE10 well above its minimum spend is accepted with a percentage discount', async ({ request }) => {
    const response = await request.post('/redeem', {
      data: { code: 'SAVE10', cartTotal: 100, redeemedOn: '2026-01-01' },
    });
    const body = await response.json();
    expect(body).toEqual({ accepted: true, discount: 10 });
  });

  test('FLAT5 above its minimum spend is accepted with its fixed discount', async ({ request }) => {
    const response = await request.post('/redeem', {
      data: { code: 'FLAT5', cartTotal: 30, redeemedOn: '2026-01-01' },
    });
    const body = await response.json();
    expect(body).toEqual({ accepted: true, discount: 5 });
  });

  test('SAVE10 far above its minimum spend has its discount capped', async ({ request }) => {
    const response = await request.post('/redeem', {
      data: { code: 'SAVE10', cartTotal: 300, redeemedOn: '2026-01-01' },
    });
    const body = await response.json();
    expect(body).toEqual({ accepted: true, discount: 20 });
  });
});
