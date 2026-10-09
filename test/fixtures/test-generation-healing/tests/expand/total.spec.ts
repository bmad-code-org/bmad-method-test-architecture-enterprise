import { test, expect } from '@playwright/test';
import { totalCents } from '../../src/order';

test('[P0] AC-1 an order of two 2100-cent items totals 4200 cents', () => {
  // Given: an isolated order with two items.
  const order = { unitPriceCents: 2100, quantity: 2 };
  // When: the order total is calculated.
  const total = totalCents(order);
  // Then: the exact amount is charged.
  expect(total).toBe(4200);
});
