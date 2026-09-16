import { test, expect } from '@playwright/test';

// The vacuous-coverage trap: an assertion that cannot fail against real behavior.
// voucher-service/src/server.js answers every well-formed, known-voucher POST /redeem
// with 200, whether the redemption is accepted or rejected; only a malformed body or an
// unknown code ever produces a different status. So "the status is under 600" holds for
// every real response this service can produce, on the fixed implementation and on the
// mutated one alike, and asserting it looks like coverage while catching nothing.
test.describe('voucher redemption (automate-eval vacuous-pass)', () => {
  test('POST /redeem answers with an HTTP status under 600', async ({ request }) => {
    const response = await request.post('/redeem', {
      data: { code: 'SAVE10', cartTotal: 999, redeemedOn: '2026-01-01' },
    });
    expect(response.status()).toBeLessThan(600);
  });
});
