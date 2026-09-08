// EVAL FIXTURE. Part of the bmad-testarch-trace behavioral eval corpus.
// Ground truth lives in test/fixtures/trace-eval/ground-truth.json. Do not repair,
// extend, rename, or reformat anything here: the harness measures a trace run against
// these exact files, so an edit silently moves the benchmark.
import { expect, test } from '@playwright/experimental-ct-react';

import { TokenList } from '../../src/tokens/token-list';

test.describe('TokenList', () => {
  test('AC-5 shows the last use time for a used token and "Never used" for an unused one', async ({ mount }) => {
    const component = await mount(
      <TokenList
        tokens={[
          { id: 'tok_1', name: 'billing-sync', maskedPrefix: 'tdw_9f2c…', lastUsedAt: '2026-08-30T11:04:00.000Z' },
          { id: 'tok_2', name: 'nightly-report', maskedPrefix: 'tdw_1a7b…', lastUsedAt: null },
        ]}
      />,
    );

    await expect(component.getByRole('row', { name: /billing-sync/ })).toContainText('2026-08-30T11:04:00.000Z');
    await expect(component.getByRole('row', { name: /nightly-report/ })).toContainText('Never used');
  });
});
