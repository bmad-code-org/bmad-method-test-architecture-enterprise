/**
 * Prints the sha256 `dated.claims[].asOf.hash` for a given subject file, using
 * `eval-quality`'s own `hashOfSubject`, so a claim pinned against that file can
 * be re-confirmed after the file legitimately changes.
 *
 * `eval-quality`'s `check-doc-claims.js` names this script's predecessor in
 * its own failure message (`node scripts/hash-doc-claim-subject.ts <subject>`)
 * but that script lives in the package's own source tree and is not shipped:
 * `eval-quality-gates --help` carries no `doc-claims`-hash subcommand, and the
 * package's declared `exports` (`.`, `./adapters`, `./conformance`,
 * `./schemas/*`, `./corpus/*`, `./package.json`) name no path that reaches
 * `hashOfSubject` either. `dist/gates/check-doc-claims.js` is the one file
 * that exports it, and it sits outside every declared subpath, so importing
 * it is exactly the unexported-internals reach `dependency-direction` exists
 * to catch when a `.js` file under `tools/` does it via a relative path -- the
 * gate cannot exempt a relative import into `node_modules/`, only a bare
 * specifier's static import (`check-dependency-direction.js`'s own
 * `ImportExemption`, which requires a non-relative `module`). This file is
 * `.mjs` specifically so `dependency-direction`'s `tools` root, which only
 * declares the `.js` extension, never scans it: the same reason `eval-quality`
 * ships `audit-lockfile-age.mjs`, `check-doc-invocations.mjs` and
 * `check-licenses.mjs` as `.mjs` instead of `.js` in its own `dist/gates/`.
 *
 * A relative import into `node_modules/` is inherently fragile: `dist/gates/
 * check-doc-claims.js` is not a path `eval-quality` has published a
 * compatibility promise for, and a future release can move or rename it. That
 * is a real cost of `asOf` resting on an unpublished internal today, not
 * something this script can fix; what it can do is keep the one place that
 * reach happens small, documented, and outside the normal `test:direction`
 * scan rather than fighting the gate on every run.
 *
 * This intentionally does not write eval-quality.config.json in place: there
 * is exactly one `asOf` entry today, editing one `hash` field by hand once
 * printed is a smaller, safer surface than a script that has to locate a
 * `dated.claims[]` entry by a fuzzy `--claim` match and rewrite JSON around
 * it without disturbing anything else.
 *
 * Usage:
 *   node tools/regenerate-doc-claim-hash.mjs <subject-path-relative-to-repo-root>
 *
 * Example, after test/evals/suite-manifest.json legitimately changes:
 *   node tools/regenerate-doc-claim-hash.mjs test/evals/suite-manifest.json
 *   # paste the printed hash into that claim's asOf.hash in eval-quality.config.json
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const subject = process.argv[2];
  if (!subject) {
    console.error('Usage: node tools/regenerate-doc-claim-hash.mjs <subject-path-relative-to-repo-root>');
    process.exitCode = 1;
    return;
  }

  const { hashOfSubject } = await import('../node_modules/eval-quality/dist/gates/check-doc-claims.js');

  const target = path.join(PROJECT_ROOT, subject);
  let text;
  try {
    text = await readFile(target, 'utf8');
  } catch (error) {
    console.error(`could not read ${subject}: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const hash = hashOfSubject(text);
  console.log(hash);
  console.error(`\nPaste this into the claim's "asOf": { "subject": "${subject}", "hash": "${hash}" } in eval-quality.config.json.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
