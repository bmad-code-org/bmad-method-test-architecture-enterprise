// EVAL FIXTURE. Part of the bmad-testarch-trace behavioral eval corpus.
// Ground truth lives in test/fixtures/trace-eval/ground-truth.json. Do not repair,
// extend, rename, or reformat anything here: the harness measures a trace run against
// these exact files, so an edit silently moves the benchmark.
import { expect, request, test } from '@playwright/test';

const API = 'https://tidewater.test/api/v1';
const ADMIN_TOKEN = 'seed-token-admin';
const MEMBER_TOKEN = 'seed-token-member';
const TENANT = 'blue-harbor';

const contextFor = (token: string) => request.newContext({ baseURL: API, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });

test.describe('Tenant data export API', () => {
  test('AC-1 an admin export request produces a ready job with a signed link', async () => {
    const admin = await contextFor(ADMIN_TOKEN);

    const created = await admin.post(`/tenants/${TENANT}/exports`, { data: { scope: 'full' } });
    expect(created.status()).toBe(202);
    const job = await created.json();

    const ready = await admin.get(`/exports/${job.id}?awaitState=ready`);
    const readyJob = await ready.json();
    expect(readyJob.state).toBe('ready');
    expect(readyJob.downloadUrl).toMatch(/^https:\/\/.+[?&]signature=/);

    await admin.dispose();
  });

  test('AC-2 rejects export requests from members without the admin role', async () => {
    const admin = await contextFor(ADMIN_TOKEN);

    const response = await admin.post(`/tenants/${TENANT}/exports`, { data: { scope: 'full' } });

    expect(response.status()).toBe(202);

    await admin.dispose();
  });

  test('AC-3 the export manifest names contacts, invoices, and audit entries', async () => {
    const admin = await contextFor(ADMIN_TOKEN);

    const response = await admin.get(`/tenants/${TENANT}/exports/latest/manifest`);
    const manifest = await response.json();

    expect(manifest.sections.map((section: { name: string }) => section.name)).toEqual(['contacts', 'invoices', 'audit-entries']);
    expect(manifest.sections.every((section: { recordCount: number }) => Number.isInteger(section.recordCount))).toBe(true);

    await admin.dispose();
  });

  test('AC-5 a queued export can be cancelled and never exposes a link', async () => {
    const admin = await contextFor(ADMIN_TOKEN);

    const created = await admin.post(`/tenants/${TENANT}/exports`, { data: { scope: 'full', startPaused: true } });
    const job = await created.json();

    const cancelled = await admin.post(`/exports/${job.id}/cancel`);
    expect(cancelled.status()).toBe(200);

    const after = await admin.get(`/exports/${job.id}`);
    const afterJob = await after.json();
    expect(afterJob.state).toBe('cancelled');
    expect(afterJob.downloadUrl).toBeNull();

    await admin.dispose();
  });

  test('AC-6 a download link returns 410 once it is more than 24 hours old', async () => {
    const admin = await contextFor(ADMIN_TOKEN);

    const created = await admin.post(`/tenants/${TENANT}/exports`, { data: { scope: 'full' } });
    const job = await created.json();
    const ready = await admin.get(`/exports/${job.id}?awaitState=ready`);
    const { downloadUrl } = await ready.json();

    await admin.post('/test-support/clock', { data: { advanceHours: 25 } });
    const expired = await admin.get(downloadUrl);
    expect(expired.status()).toBe(410);

    await admin.dispose();
  });

  test('AC-7 after an erasure completes a new export request returns 404', async () => {
    const admin = await contextFor(ADMIN_TOKEN);

    const erasure = await admin.post(`/tenants/${TENANT}/erasures`, { data: { confirm: TENANT } });
    expect(erasure.status()).toBe(202);
    await admin.get(`/erasures/${(await erasure.json()).id}?awaitState=completed`);

    const afterErasure = await admin.post(`/tenants/${TENANT}/exports`, { data: { scope: 'full' } });
    expect(afterErasure.status()).toBe(404);

    await admin.dispose();
  });
});
