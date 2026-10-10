import { test, expect } from '@playwright/test';

import { createVoucherRedemptionRequest } from '../fixtures/data-factories';

test.describe('Voucher redemption API', () => {
  test('[6.6-API-001] [P0] accepts EXPIRED10 on its exact expiry date at its exact minimum spend', async ({ request }) => {
    const response = await request.post('/redeem', {
      data: createVoucherRedemptionRequest({
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

  test('[6.6-API-002] [P0] rejects EXPIRED10 one day after expiry', async ({ request }) => {
    const response = await request.post('/redeem', {
      data: createVoucherRedemptionRequest({
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

  test('[6.6-API-003] [P1] evaluates expiry before minimum spend', async ({ request }) => {
    const response = await request.post('/redeem', {
      data: createVoucherRedemptionRequest({
        code: 'EXPIRED10',
        cartTotal: 9,
        redeemedOn: '2000-01-02',
      }),
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      accepted: false,
      reason: 'expired',
    });
  });

  test('[6.6-API-004] [P0] accepts SAVE10 at its exact minimum spend', async ({ request }) => {
    const response = await request.post('/redeem', {
      data: createVoucherRedemptionRequest({
        code: 'SAVE10',
        cartTotal: 50,
        redeemedOn: '2099-01-01',
      }),
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      accepted: true,
      discount: 5,
    });
  });

  test('[6.6-API-005] [P0] rejects SAVE10 one cent below minimum spend', async ({ request }) => {
    const response = await request.post('/redeem', {
      data: createVoucherRedemptionRequest({
        code: 'SAVE10',
        cartTotal: 49.99,
        redeemedOn: '2099-01-01',
      }),
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      accepted: false,
      reason: 'below-minimum-spend',
    });
  });

  test('[6.6-API-006] [P0] grants SAVE10 percentage discount below the cap threshold', async ({ request }) => {
    const response = await request.post('/redeem', {
      data: createVoucherRedemptionRequest({
        code: 'SAVE10',
        cartTotal: 100,
        redeemedOn: '2099-01-01',
      }),
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      accepted: true,
      discount: 10,
    });
  });

  test('[6.6-API-007] [P0] grants SAVE10 maximum discount at the exact cap threshold', async ({ request }) => {
    const response = await request.post('/redeem', {
      data: createVoucherRedemptionRequest({
        code: 'SAVE10',
        cartTotal: 200,
        redeemedOn: '2099-01-01',
      }),
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      accepted: true,
      discount: 20,
    });
  });

  test('[6.6-API-008] [P0] caps SAVE10 discount beyond the cap threshold', async ({ request }) => {
    const response = await request.post('/redeem', {
      data: createVoucherRedemptionRequest({
        code: 'SAVE10',
        cartTotal: 300,
        redeemedOn: '2099-01-01',
      }),
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      accepted: true,
      discount: 20,
    });
  });

  test('[6.6-API-009] [P0] grants FLAT5 fixed discount at its exact minimum spend', async ({ request }) => {
    const response = await request.post('/redeem', {
      data: createVoucherRedemptionRequest({
        code: 'FLAT5',
        cartTotal: 20,
        redeemedOn: '2099-01-01',
      }),
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      accepted: true,
      discount: 5,
    });
  });
});
