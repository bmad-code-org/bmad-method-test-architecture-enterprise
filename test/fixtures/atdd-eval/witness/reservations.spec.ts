import { test, expect } from '@playwright/test';

// The scaffold a correct generation run produces when pointed at the
// witness-only story instead of the corpus's own story: this file exists
// only so the atdd contract's sensitivity witness can show the command reads
// {story_file} from its prompt, by asserting the two legs' scaffolds name
// different criteria. It is never staged by test/eval-atdd.js and never
// scored as a replay case.
test.describe('Witness-only (ATDD)', () => {
  test.skip('[P0] AC-9 a witness endpoint exists', async ({ request }) => {
    const response = await request.get('/witness');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.witness).toBe(true);
  });
});
