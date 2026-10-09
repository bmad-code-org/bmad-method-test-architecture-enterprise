import { test, expect } from '@playwright/test';
import { confirmOrder } from '../../src/orders';

test.skip('[P0] AC-3 confirming an order changes its status to confirmed', () => {
  // Given: an order eligible for confirmation.
  // When: the owner confirms the order.
  const order = confirmOrder();
  // Then: its newly promised state is observable.
  expect(order.status).toBe('confirmed');
});
