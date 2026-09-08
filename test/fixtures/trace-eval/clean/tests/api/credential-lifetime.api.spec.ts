// EVAL FIXTURE. Part of the bmad-testarch-trace behavioral eval corpus.
// Ground truth lives in test/fixtures/trace-eval/ground-truth.json. Do not repair,
// extend, rename, or reformat anything here: the harness measures a trace run against
// these exact files, so an edit silently moves the benchmark.
import { expect, request, test } from '@playwright/test';

const API = 'https://tidewater.test/api/v1';
const ADMIN_TOKEN = 'seed-token-admin';
const TENANT = 'blue-harbor';
const LAPSED = '2020-03-04T00:00:00Z';

const contextFor = (token: string) => request.newContext({ baseURL: API, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });

test.describe('Credential lifetime', () => {
  test('a request made after the credential lifetime has run out is rejected with 401', async () => {
    const admin = await contextFor(ADMIN_TOKEN);

    const created = await admin.post(`/tenants/${TENANT}/tokens`, { data: { name: 'nightly-report', expiresAt: LAPSED } });
    const { secret } = await created.json();
    const integrator = await contextFor(secret);

    const response = await integrator.get('/tickets?limit=1');
    expect(response.status()).toBe(401);

    await integrator.dispose();
    await admin.dispose();
  });

  test('the console listing reports a lapsed credential in the expired state', async () => {
    const admin = await contextFor(ADMIN_TOKEN);

    const created = await admin.post(`/tenants/${TENANT}/tokens`, { data: { name: 'nightly-report', expiresAt: LAPSED } });
    const { id } = await created.json();

    const listed = await admin.get(`/tenants/${TENANT}/tokens`);
    const tokens = await listed.json();
    const listedToken = tokens.find((token: { id: string }) => token.id === id);
    expect(listedToken.state).toBe('expired');
    expect(listedToken.expiresAt).toBe(LAPSED);

    await admin.dispose();
  });
});
