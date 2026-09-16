import { test, expect } from '@playwright/test';

// The duplicate-coverage trap: two tests with the same input and the same assertion.
// The second earns nothing beyond the first; both pass, and only one of them is
// coverage.
test.describe('voucher redemption (automate-eval duplicate)', () => {
  test('SAVE10 at cartTotal 120 is accepted with a 12 discount', async ({ request }) => {
    const response = await request.post('/redeem', {
      data: { code: 'SAVE10', cartTotal: 120, redeemedOn: '2026-01-01' },
    });
    const body = await response.json();
    expect(body).toEqual({ accepted: true, discount: 12 });
  });

  test('SAVE10 at cartTotal 120 is accepted with a 12 discount (again)', async ({ request }) => {
    const response = await request.post('/redeem', {
      data: { code: 'SAVE10', cartTotal: 120, redeemedOn: '2026-01-01' },
    });
    const body = await response.json();
    expect(body).toEqual({ accepted: true, discount: 12 });
  });
});
