import { test, expect } from '@playwright/test';

import { redemptionRequest } from '../support/voucher-redemption-data';

test.describe('Voucher redemption API', () => {
  test('[P0] 6.6-API-001 rejects a voucher one day after expiry', async ({ request }) => {
    const response = await request.post('/redeem', {
      data: redemptionRequest({
        code: 'EXPIRED10',
        cartTotal: 10,
        redeemedOn: '2000-01-02',
      }),
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      accepted: false,
      reason: 'expired',
    });
  });

  test('[P0] 6.6-API-002 accepts a voucher on the exact expiry date', async ({ request }) => {
    const response = await request.post('/redeem', {
      data: redemptionRequest({
        code: 'EXPIRED10',
        cartTotal: 10,
        redeemedOn: '2000-01-01',
      }),
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      accepted: true,
      discount: 1,
    });
  });

  test('[P0] 6.6-API-003 accepts the exact inclusive minimum spend', async ({ request }) => {
    const response = await request.post('/redeem', {
      data: redemptionRequest({
        code: 'SAVE10',
        cartTotal: 50,
        redeemedOn: '2098-12-31',
      }),
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      accepted: true,
      discount: 5,
    });
  });

  test('[P0] 6.6-API-004 rejects a cart strictly below minimum spend', async ({ request }) => {
    const response = await request.post('/redeem', {
      data: redemptionRequest({
        code: 'SAVE10',
        cartTotal: 49.99,
        redeemedOn: '2098-12-31',
      }),
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      accepted: false,
      reason: 'below-minimum-spend',
    });
  });

  test('[P0] 6.6-API-005 calculates a percentage discount below its cap', async ({ request }) => {
    const response = await request.post('/redeem', {
      data: redemptionRequest({
        code: 'SAVE10',
        cartTotal: 100,
        redeemedOn: '2098-12-31',
      }),
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      accepted: true,
      discount: 10,
    });
  });

  test('[P0] 6.6-API-006 preserves the discount at the exact cap boundary', async ({ request }) => {
    const response = await request.post('/redeem', {
      data: redemptionRequest({
        code: 'SAVE10',
        cartTotal: 200,
        redeemedOn: '2098-12-31',
      }),
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      accepted: true,
      discount: 20,
    });
  });

  test('[P0] 6.6-API-007 enforces the percentage maximum above the cap boundary', async ({ request }) => {
    const response = await request.post('/redeem', {
      data: redemptionRequest({
        code: 'SAVE10',
        cartTotal: 250,
        redeemedOn: '2098-12-31',
      }),
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      accepted: true,
      discount: 20,
    });
  });

  test('[P0] 6.6-API-008 applies the fixed discount through the public service', async ({ request }) => {
    const response = await request.post('/redeem', {
      data: redemptionRequest({
        code: 'FLAT5',
        cartTotal: 20,
        redeemedOn: '2098-12-31',
      }),
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      accepted: true,
      discount: 5,
    });
  });
});
