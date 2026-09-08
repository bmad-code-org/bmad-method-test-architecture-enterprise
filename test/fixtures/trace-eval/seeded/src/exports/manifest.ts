// EVAL FIXTURE. Production source for the seeded trace corpus. It exists so the unit
// test under tests/unit has a real module to import. Do not extend it.

export type ManifestCounts = {
  contacts: number;
  invoices: number;
  auditEntries: number;
};

export type Manifest = {
  sections: { name: string; recordCount: number }[];
};

export const buildManifest = (counts: ManifestCounts): Manifest => ({
  sections: [
    { name: 'contacts', recordCount: counts.contacts },
    { name: 'invoices', recordCount: counts.invoices },
    { name: 'audit-entries', recordCount: counts.auditEntries },
  ],
});
