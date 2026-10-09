import { test, expect } from '@playwright/test';
import { refundCents } from '../../src/orders';

test('[P0] AC-2 a full refund returns all 4200 cents', () => {
  // Given: an isolated order paid in full.
  const order = { unitPriceCents: 2100, quantity: 2 };
  // When: the full amount is refunded.
  const refund = refundCents(order);
  // Then: every cent is returned.
  expect(refund).toBe(4200);
});
