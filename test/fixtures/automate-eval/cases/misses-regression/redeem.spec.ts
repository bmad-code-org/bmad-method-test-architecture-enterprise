import { test, expect } from '@playwright/test';

// Same four rules as the correct-run case, asserted only with interior values: every
// minimum-spend input here sits well clear of the boundary, never exactly at it. That
// is the defect this case exists to stand in for: coverage that reads as thorough and
// detects nothing, because `cartTotal >= voucher.minimumSpend` and
// `cartTotal > voucher.minimumSpend` agree everywhere except at the boundary itself.
test.describe('voucher redemption (automate-eval misses-regression)', () => {
  test('SAVE10 comfortably above its minimum spend is accepted', async ({ request }) => {
    const response = await request.post('/redeem', {
      data: { code: 'SAVE10', cartTotal: 120, redeemedOn: '2026-01-01' },
    });
    const body = await response.json();
    expect(body).toEqual({ accepted: true, discount: 12 });
  });

  test('SAVE10 well below its minimum spend is rejected', async ({ request }) => {
    const response = await request.post('/redeem', {
      data: { code: 'SAVE10', cartTotal: 10, redeemedOn: '2026-01-01' },
    });
    const body = await response.json();
    expect(body).toEqual({ accepted: false, reason: 'below-minimum-spend' });
  });

  test('FLAT5 comfortably above its minimum spend is accepted', async ({ request }) => {
    const response = await request.post('/redeem', {
      data: { code: 'FLAT5', cartTotal: 25, redeemedOn: '2026-01-01' },
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

  test('SAVE10 far above its minimum spend has its discount capped', async ({ request }) => {
    const response = await request.post('/redeem', {
      data: { code: 'SAVE10', cartTotal: 400, redeemedOn: '2026-01-01' },
    });
    const body = await response.json();
    expect(body).toEqual({ accepted: true, discount: 20 });
  });
});
