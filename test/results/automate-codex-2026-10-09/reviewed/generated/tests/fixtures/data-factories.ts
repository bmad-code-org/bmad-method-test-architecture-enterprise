export type VoucherRedemptionRequest = {
  code: string;
  cartTotal: number;
  redeemedOn: string;
};

export function createVoucherRedemptionRequest(
  overrides: Partial<VoucherRedemptionRequest> = {},
): VoucherRedemptionRequest {
  return {
    code: 'SAVE10',
    cartTotal: 50,
    redeemedOn: '2099-01-01',
    ...overrides,
  };
}
