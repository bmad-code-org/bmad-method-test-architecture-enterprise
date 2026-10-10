export type VoucherRedemptionRequest = {
  code: 'SAVE10' | 'FLAT5' | 'EXPIRED10';
  cartTotal: number;
  redeemedOn: string;
};

export const redemptionRequest = (
  overrides: Partial<VoucherRedemptionRequest> = {},
): VoucherRedemptionRequest => ({
  code: 'SAVE10',
  cartTotal: 50,
  redeemedOn: '2098-12-31',
  ...overrides,
});
