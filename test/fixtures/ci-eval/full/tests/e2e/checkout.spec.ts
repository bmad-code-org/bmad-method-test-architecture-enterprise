import { expect, test } from '@playwright/test';

test.describe('checkout', () => {
  test('a shopper sees the cart total before paying', async ({ page }) => {
    await page.goto('/cart');
    await page.getByRole('button', { name: 'Add sample item' }).click();
    await expect(page.getByTestId('cart-total')).toHaveText('£12.50');
    await page.getByRole('link', { name: 'Checkout' }).click();
    await expect(page.getByRole('heading', { name: 'Review your order' })).toBeVisible();
  });
});
