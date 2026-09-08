// EVAL FIXTURE. Part of the bmad-testarch-trace behavioral eval corpus.
// Ground truth lives in test/fixtures/trace-eval/ground-truth.json. Do not repair,
// extend, rename, or reformat anything here: the harness measures a trace run against
// these exact files, so an edit silently moves the benchmark.
import { expect, request, test } from '@playwright/test';

const API = 'https://tidewater.test/api/v1';
const ADMIN_TOKEN = 'seed-token-admin';
const TENANT = 'blue-harbor';

const contextFor = (token: string) => request.newContext({ baseURL: API, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });

test.describe('API token revocation', () => {
  test('AC-1 the request after a revocation is rejected with 401', async () => {
    const admin = await contextFor(ADMIN_TOKEN);

    const created = await admin.post(`/tenants/${TENANT}/tokens`, { data: { name: 'billing-sync', expiresAt: '2027-01-01T00:00:00Z' } });
    const { id, secret } = await created.json();
    const integrator = await contextFor(secret);

    const beforeRevoke = await integrator.get('/tickets?limit=1');
    expect(beforeRevoke.status()).toBe(200);

    await admin.delete(`/tenants/${TENANT}/tokens/${id}`);
    const afterRevoke = await integrator.get('/tickets?limit=1');
    expect(afterRevoke.status()).toBe(401);

    await integrator.dispose();
    await admin.dispose();
  });

  test('AC-2 the secret is present at creation and absent from every later read', async () => {
    const admin = await contextFor(ADMIN_TOKEN);

    const created = await admin.post(`/tenants/${TENANT}/tokens`, { data: { name: 'billing-sync', expiresAt: '2027-01-01T00:00:00Z' } });
    const createdBody = await created.json();
    expect(createdBody.secret).toMatch(/^tdw_[\dA-Za-z]{32}$/);

    const read = await admin.get(`/tenants/${TENANT}/tokens/${createdBody.id}`);
    const readBody = await read.json();
    expect(readBody).not.toHaveProperty('secret');

    const listed = await admin.get(`/tenants/${TENANT}/tokens`);
    const listBody = await listed.json();
    expect(listBody.every((token: Record<string, unknown>) => !('secret' in token))).toBe(true);

    await admin.dispose();
  });
});
