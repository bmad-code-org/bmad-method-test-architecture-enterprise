/**
 * `tools/generate-lockfile-age-cache.js`'s `fetchTimeMap` reads the same
 * publication-time contract `eval-quality`'s own gate does, independently
 * rather than by importing the gate's unexported `fetchTimeMap` (see that
 * file's own header for why the reach-in was replaced).
 *
 * WHAT THIS PROVES, AND WHAT IT DOES NOT
 *
 * A byte-identical cache today says the two implementations agree today; it
 * says nothing about tomorrow. What can actually be checked here, without
 * reaching into the unpublished module this story's own gate exists to keep
 * TEA out of, is that TEA's copy still reads what it has always read: the npm
 * registry's own `time` map, the one field both implementations are simple
 * wrappers over (`eval-quality`'s reads `meta.time ?? {}`, confirmed from its
 * installed source; this file's own `fetchTimeMap` does the same). `wrappy`
 * 1.0.2 is real, tiny, and already locked in package-lock.json; a publish
 * timestamp is immutable once set, so its recorded value is a fixed constant
 * this test can assert against forever, not a fixture that can drift on its
 * own.
 *
 * This does not detect `eval-quality` redefining "publication time" away from
 * the registry's own `time` map (reading a different field, a different
 * source entirely). No test in this repository can see that without an
 * export upstream, since the function that would need comparing against is
 * exactly the one that is not published; that residual is named here rather
 * than left implicit. What it does catch is TEA's own half breaking: a wrong
 * URL, a wrong field path, a scoped-name encoding regression, or a response
 * shape TEA stops handling the way the registry actually returns it - the
 * realistic way this copy goes wrong, since it lives in this repository and
 * nothing else guards it.
 *
 * Skips rather than fails when the network is unreachable, so a disconnected
 * laptop cannot turn this into a false CI signal for a defect nowhere in this
 * repository.
 *
 * Usage: node test/test-generate-lockfile-age-cache.js
 */

'use strict';

const { fetchTimeMap, registryUrlForName } = require('../tools/generate-lockfile-age-cache');

const colors = { reset: '[0m', red: '[31m', green: '[32m', yellow: '[33m' };

let passed = 0;
let failed = 0;

function check(condition, label, detail) {
  if (condition) {
    passed += 1;
    console.log(`${colors.green}ok${colors.reset}    ${label}`);
    return;
  }
  failed += 1;
  console.log(`${colors.red}FAIL${colors.reset}  ${label}`);
  if (detail) console.log(`      ${detail}`);
}

function checkUrlEncoding() {
  check(registryUrlForName('wrappy') === 'https://registry.npmjs.org/wrappy', 'an unscoped name is not percent-encoded unnecessarily');
  check(
    registryUrlForName('@img/sharp-wasm32') === 'https://registry.npmjs.org/@img/sharp-wasm32',
    'a scoped name keeps its scope segment literal and encodes only the package segment',
  );
}

/** wrappy@1.0.2's real, immutable publish timestamp, read from the registry once and pinned here. */
const WRAPPY_VERSION = '1.0.2';
const WRAPPY_PUBLISHED_AT = '2016-05-17T23:30:52.415Z';

async function checkAgainstRealRegistry() {
  let timeMap;
  try {
    timeMap = await fetchTimeMap('wrappy');
  } catch (error) {
    console.log(`${colors.yellow}skip${colors.reset}  live registry check: ${error.message}`);
    return;
  }
  check(
    timeMap[WRAPPY_VERSION] === WRAPPY_PUBLISHED_AT,
    `fetchTimeMap reads wrappy@${WRAPPY_VERSION}'s real, immutable publish time`,
    `expected ${WRAPPY_PUBLISHED_AT}, got ${JSON.stringify(timeMap[WRAPPY_VERSION] ?? null)}`,
  );
}

async function main() {
  checkUrlEncoding();
  await checkAgainstRealRegistry();
  if (failed > 0) {
    console.error(`${colors.red}${failed} of ${passed + failed} check(s) failed${colors.reset}`);
    return 1;
  }
  console.log(`${colors.green}${passed} check(s) passed${colors.reset}`);
  return 0;
}

if (require.main === module) main().then((code) => (process.exitCode = code));
