'use strict';

let packageVersions;
try {
  packageVersions = require('eval-quality');
} catch {
  packageVersions = null;
}

// Seeded violations: this cluster is supposed to stay synchronous, the one
// invariant `docs/explanation/eval-quality-command-adapter.md` documents and
// `eval-quality.config.json`'s `dependency-direction` purity block holds this
// file to. All three purity bans fire independently in one scan, so this
// function carries all three: `async`, `new Date`, and `await`.
async function expectedSchemaVersion(kind) {
  const stamped = new Date();
  const resolved = await Promise.resolve(packageVersions?.[kind]);
  return resolved ?? stamped;
}

module.exports = { expectedSchemaVersion };
