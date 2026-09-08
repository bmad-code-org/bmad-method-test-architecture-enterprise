// EVAL FIXTURE. Part of the bmad-testarch-trace behavioral eval corpus.
// Ground truth lives in test/fixtures/trace-eval/ground-truth.json. Do not repair,
// extend, rename, or reformat anything here: the harness measures a trace run against
// these exact files, so an edit silently moves the benchmark.
import { expect, test } from '@playwright/test';

const TENANT = 'blue-harbor';

test.describe('Tenant data export console', () => {
  test('AC-1 an admin starts an export and the download link becomes available', async ({ page }) => {
    await page.goto(`/tenants/${TENANT}/data`);

    await page.getByRole('button', { name: 'Request full export' }).click();

    const download = page.getByRole('link', { name: 'Download archive' });
    await expect(download).toBeVisible();
    await expect(download).toHaveAttribute('href', /[?&]signature=/);
  });

  test('AC-9 the progress percentage reaches 100 before the download is offered', async ({ page }) => {
    await page.goto(`/tenants/${TENANT}/data`);

    await page.getByRole('button', { name: 'Request full export' }).click();

    const progress = page.getByRole('progressbar', { name: 'Export progress' });
    await expect(progress).toHaveAttribute('aria-valuenow', '0');
    await expect(page.getByRole('link', { name: 'Download archive' })).toBeHidden();

    await expect(progress).toHaveAttribute('aria-valuenow', '100');
    await expect(page.getByRole('link', { name: 'Download archive' })).toBeVisible();
  });

  test('AC-4 the erasure confirm control stays disabled until the slug matches exactly', async ({ page }) => {
    await page.goto(`/tenants/${TENANT}/data`);

    await page.getByRole('button', { name: 'Erase tenant' }).click();
    const confirmField = page.getByRole('textbox', { name: 'Type the tenant slug to confirm' });
    const confirmButton = page.getByRole('button', { name: 'Erase permanently' });

    await confirmField.fill('blue-harbour');
    await expect(confirmButton).toBeDisabled();

    await confirmField.fill(TENANT);
    await expect(confirmButton).toBeEnabled();
  });
});
