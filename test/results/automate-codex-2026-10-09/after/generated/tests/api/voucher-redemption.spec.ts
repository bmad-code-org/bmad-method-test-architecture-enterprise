import { test, expect } from '@playwright/test';

type VoucherCode = 'SAVE10' | 'FLAT5' | 'EXPIRED10';

type RedemptionRequest = {
  code: VoucherCode;
  cartTotal: number;
  redeemedOn: string;
};

type AcceptedRedemption = {
  accepted: true;
  discount: number;
};

type RejectedRedemption = {
  accepted: false;
  reason: 'expired' | 'below-minimum-spend';
};

type RedemptionResponse = AcceptedRedemption | RejectedRedemption;

const createRedemptionRequest = (overrides: Partial<RedemptionRequest> = {}): RedemptionRequest => ({
  code: 'SAVE10',
  cartTotal: 50,
  redeemedOn: '2098-12-31',
  ...overrides,
});

/*
 * Provider scrutiny evidence:
 * Handler: src/server.js implements POST /redeem and returns JSON for every outcome.
 * Rule implementation: src/vouchers.js evaluates expiry, minimum spend, discount type, then percentage cap.
 * Request fields: code is a catalog key, cartTotal is a number, and redeemedOn is a string.
 * Success status: 200 with either { accepted: true, discount: number } or { accepted: false, reason }.
 * Authentication: the service has no authentication requirement.
 */
test.describe('Voucher redemption API', () => {
  test('[P0] 6.6-API-001 rejects an expired voucher one day after expiry', async ({ request }) => {
    const response = await request.post('/redeem', {
      data: createRedemptionRequest({
        code: 'EXPIRED10',
        cartTotal: 10,
        redeemedOn: '2000-01-02',
      }),
    });

    expect(response.status()).toBe(200);
    const body = (await response.json()) as RedemptionResponse;
    expect(body).toEqual({ accepted: false, reason: 'expired' });
  });

  test('[P1] 6.6-API-002 accepts a percentage voucher on its exact expiry date', async ({ request }) => {
    const response = await request.post('/redeem', {
      data: createRedemptionRequest({
        cartTotal: 100,
        redeemedOn: '2099-01-01',
      }),
    });

    expect(response.status()).toBe(200);
    const body = (await response.json()) as RedemptionResponse;
    expect(body).toEqual({ accepted: true, discount: 10 });
  });

  test('[P0] 6.6-API-003 accepts a cart at the inclusive minimum spend', async ({ request }) => {
    const response = await request.post('/redeem', {
      data: createRedemptionRequest({ cartTotal: 50 }),
    });

    expect(response.status()).toBe(200);
    const body = (await response.json()) as RedemptionResponse;
    expect(body).toEqual({ accepted: true, discount: 5 });
  });

  test('[P0] 6.6-API-004 rejects a cart one cent below the minimum spend', async ({ request }) => {
    const response = await request.post('/redeem', {
      data: createRedemptionRequest({ cartTotal: 49.99 }),
    });

    expect(response.status()).toBe(200);
    const body = (await response.json()) as RedemptionResponse;
    expect(body).toEqual({ accepted: false, reason: 'below-minimum-spend' });
  });

  test('[P0] 6.6-API-005 calculates an uncapped percentage discount', async ({ request }) => {
    const response = await request.post('/redeem', {
      data: createRedemptionRequest({ cartTotal: 100 }),
    });

    expect(response.status()).toBe(200);
    const body = (await response.json()) as RedemptionResponse;
    expect(body).toEqual({ accepted: true, discount: 10 });
  });

  test('[P0] 6.6-API-006 calculates a fixed discount for an eligible cart', async ({ request }) => {
    const response = await request.post('/redeem', {
      data: createRedemptionRequest({
        code: 'FLAT5',
        cartTotal: 20,
      }),
    });

    expect(response.status()).toBe(200);
    const body = (await response.json()) as RedemptionResponse;
    expect(body).toEqual({ accepted: true, discount: 5 });
  });

  test('[P0] 6.6-API-007 caps a percentage discount at maxDiscount', async ({ request }) => {
    const response = await request.post('/redeem', {
      data: createRedemptionRequest({ cartTotal: 250 }),
    });

    expect(response.status()).toBe(200);
    const body = (await response.json()) as RedemptionResponse;
    expect(body).toEqual({ accepted: true, discount: 20 });
  });
});
