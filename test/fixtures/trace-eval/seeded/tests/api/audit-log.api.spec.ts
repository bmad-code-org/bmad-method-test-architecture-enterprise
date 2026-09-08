// EVAL FIXTURE. Part of the bmad-testarch-trace behavioral eval corpus.
// Ground truth lives in test/fixtures/trace-eval/ground-truth.json. Do not repair,
// extend, rename, or reformat anything here: the harness measures a trace run against
// these exact files, so an edit silently moves the benchmark.
import { expect, request, test } from '@playwright/test';

const API = 'https://tidewater.test/api/v1';
const ADMIN_TOKEN = 'seed-token-admin';
const TENANT = 'blue-harbor';

const contextFor = (token: string) => request.newContext({ baseURL: API, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });

test.describe('Admin audit log', () => {
  test('AC-8 an export request is written to the audit log against the requesting user', async () => {
    const admin = await contextFor(ADMIN_TOKEN);

    await admin.post(`/tenants/${TENANT}/exports`, { data: { scope: 'full' } });

    const log = await admin.get(`/tenants/${TENANT}/audit-log?action=export.requested&limit=1`);
    const [entry] = await log.json();
    expect(entry.action).toBe('export.requested');
    expect(entry.actor.email).toBe('admin@blue-harbor.test');

    await admin.dispose();
  });
});
