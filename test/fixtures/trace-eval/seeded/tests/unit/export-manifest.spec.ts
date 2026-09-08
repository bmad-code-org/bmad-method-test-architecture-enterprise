// EVAL FIXTURE. Part of the bmad-testarch-trace behavioral eval corpus.
// Ground truth lives in test/fixtures/trace-eval/ground-truth.json. Do not repair,
// extend, rename, or reformat anything here: the harness measures a trace run against
// these exact files, so an edit silently moves the benchmark.
import { describe, expect, it } from 'vitest';

import { buildManifest } from '../../src/exports/manifest';

describe('buildManifest', () => {
  it('AC-3 emits the contacts, invoices, and audit-entries sections with record counts', () => {
    const manifest = buildManifest({ contacts: 12, invoices: 3, auditEntries: 480 });

    expect(manifest.sections).toEqual([
      { name: 'contacts', recordCount: 12 },
      { name: 'invoices', recordCount: 3 },
      { name: 'audit-entries', recordCount: 480 },
    ]);
  });
});
