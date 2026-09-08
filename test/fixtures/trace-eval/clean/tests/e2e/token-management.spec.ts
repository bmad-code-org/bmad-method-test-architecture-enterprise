// EVAL FIXTURE. Part of the bmad-testarch-trace behavioral eval corpus.
// Ground truth lives in test/fixtures/trace-eval/ground-truth.json. Do not repair,
// extend, rename, or reformat anything here: the harness measures a trace run against
// these exact files, so an edit silently moves the benchmark.
import { expect, test } from '@playwright/test';

const TENANT = 'blue-harbor';

test.describe('API token console', () => {
  test('AC-3 an admin creates a named token with an expiry and sees it listed with a masked prefix', async ({ page }) => {
    await page.goto(`/tenants/${TENANT}/tokens`);

    await page.getByRole('button', { name: 'New token' }).click();
    await page.getByRole('textbox', { name: 'Token name' }).fill('billing-sync');
    await page.getByRole('textbox', { name: 'Expires on' }).fill('2027-01-01');
    await page.getByRole('button', { name: 'Create token' }).click();

    const row = page.getByRole('row', { name: /billing-sync/ });
    await expect(row).toBeVisible();
    await expect(row.getByRole('cell', { name: /^tdw_[\dA-Za-z]{4}…$/ })).toBeVisible();
    await expect(row.getByRole('cell', { name: '2027-01-01' })).toBeVisible();
  });
});
