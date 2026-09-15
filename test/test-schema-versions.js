/**
 * Every `schemaVersion` TEA writes is the one the installed `eval-quality` reads.
 *
 * WHY THIS FILE EXISTS
 *
 * TEA stamps six kinds of artifact: three it builds in memory for the scoring
 * half (`test/lib/eval-quality-inputs.js`), two it generates to disk
 * (`tools/generate-probes.js`, `tools/generate-contracts.js`) and one it
 * hand-authors (`test/probes/scoring-policy.json`). Each stamp used to be a
 * literal beside the code that wrote it, and nothing compared any of them with
 * the constants the package exports, so an upstream bump passed `npm test` until
 * a `schema-version-mismatch` fault surfaced inside a pipeline stage, naming the
 * stage.
 *
 * So the question this file answers: if the package moves a version, or someone
 * puts a literal back, what fails first and what does it say?
 *
 * The answer is this file, and it names the artifact kind, the stamp it found and
 * the stamp the installed package reads, in the words the package's own fault
 * uses. It reads each constant from `require('eval-quality')` itself and holds
 * TEA's table to that reading first, so every stamp held to the table below is
 * held to the package.
 *
 * WHAT IS CHECKED
 *
 * - Each of the six constants the package exports for a kind TEA writes is a
 *   positive integer. A renamed export reads `undefined` on both sides of a
 *   comparison and would agree with itself.
 * - `SCHEMA_VERSIONS` carries exactly those six kinds, each value the package's
 *   constant.
 * - Each of the three builders stamps the version its kind's constant reads, and
 *   each generator's exported constant is the package's. A failure names the
 *   builder or the generator.
 * - Every probe in every `*.probes.json` under `test/probes`, every
 *   `*.contract.json` under `test/contracts` and the scoring policy carry the
 *   stamp the package reads, through `schemaVersionProblems`, which is the reader
 *   a caller gets. A tree with no corpus or no contract fails: a walk over
 *   nothing holds nothing.
 * - No literal integer `schemaVersion` remains under `test/lib/` or `tools/`. A
 *   revert to a literal that agrees with the package today passes every value
 *   comparison above and drifts on the next bump, so the source is scanned too.
 * - `artifact-reference`, the one published kind recorded as carrying no stamp
 *   by design, still carries none in the published schema, so the exemption
 *   cannot outlive the reason for it.
 * - The helpers' other paths, exercised without waiting for a live bump: a stamp
 *   that disagrees is reported with both numbers, an absent stamp is reported as
 *   absent, a kind with no stamp by design throws with the reason, and a kind
 *   TEA does not write throws naming it.
 *
 * Usage: node test/test-schema-versions.js
 *
 * Exit codes:
 *   0  every stamp agrees with the installed package
 *   1  a constant, a table entry, a builder, a generator, a committed file, a
 *      source literal or a helper path disagrees; each problem is printed
 *   2  `eval-quality` could not be loaded, so nothing was compared. There is no
 *      skip: an absent package is an environment that cannot measure.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.join(__dirname, '..');
const PROBE_ROOT = path.join(PROJECT_ROOT, 'test', 'probes');
const CONTRACT_ROOT = path.join(PROJECT_ROOT, 'test', 'contracts');
const POLICY_PATH = path.join(PROBE_ROOT, 'scoring-policy.json');
const SCHEMA_ROOT = path.join(PROJECT_ROOT, 'node_modules', 'eval-quality', 'schemas');
/** Where TEA stamps from, and so where a literal would be put back. */
const SCANNED_ROOTS = ['test/lib', 'tools'];

/**
 * The constant each kind reads, by the name the package exports it under.
 *
 * A second table beside `SCHEMA_VERSIONS` on purpose: this one is the
 * independent reading the other is held to, so an entry there pointing at the
 * wrong constant fails here by name.
 */
const CONSTANT_OF = {
  'sealed-run-record': 'SEALED_RUN_RECORD_SCHEMA_VERSION',
  'isolation-manifest': 'ISOLATION_MANIFEST_SCHEMA_VERSION',
  'evaluator-configuration': 'EVALUATOR_CONFIGURATION_SCHEMA_VERSION',
  probe: 'PROBE_SCHEMA_VERSION',
  'eval-contract': 'EVAL_CONTRACT_SCHEMA_VERSION',
  'scoring-policy': 'SCORING_POLICY_SCHEMA_VERSION',
};

/** The one published kind TEA records as carrying no stamp by design. */
const UNSTAMPED_KIND = 'artifact-reference';

const colors = { reset: '[0m', red: '[31m', green: '[32m', dim: '[2m' };

const problems = [];
let heldCount = 0;

function held(name) {
  heldCount += 1;
  console.log(`  ${colors.green}✓${colors.reset} ${name}`);
}

function problem(message) {
  problems.push(message);
  console.error(`  ${colors.red}✗ ${message}${colors.reset}`);
}

function hold(condition, name, detail) {
  if (condition) held(name);
  else problem(detail);
}

function relative(file) {
  return path.relative(PROJECT_ROOT, file).split(path.sep).join('/');
}

/** Every file under `root` whose name ends in `suffix`, sorted, so the output is stable across platforms. */
function filesUnder(root, suffix) {
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { recursive: true })
    .map((entry) => path.join(root, entry))
    .filter((file) => file.endsWith(suffix) && fs.statSync(file).isFile())
    .sort();
}

/** One file's lines against `literalStamp`, skipping comment lines the way the clock-port scan does. */
function literalStampsIn(file, literalStamp) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  return lines
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => !/^\s*(?:\/\/|\*|\/\*)/.test(line) && literalStamp.test(line))
    .map(({ line, lineNumber }) => `${relative(file)}:${lineNumber} states a literal schemaVersion: ${line.trim()}`);
}

/** Whether a JSON Schema, at any depth, declares a property named `schemaVersion`. */
function declaresSchemaVersion(node) {
  if (node === null || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some((element) => declaresSchemaVersion(element));
  if (node.properties !== null && typeof node.properties === 'object' && Object.hasOwn(node.properties, 'schemaVersion')) return true;
  return Object.values(node).some((value) => declaresSchemaVersion(value));
}

/** The message a helper throws for `kind`, or null when it returned. */
function thrownBy(fn) {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function main() {
  let evalQuality;
  try {
    evalQuality = require('eval-quality');
  } catch (error) {
    console.error(`${colors.red}eval-quality could not be loaded, so no stamp was compared: ${error.message}${colors.reset}`);
    console.error(`${colors.dim}Run npm ci. This check does not skip on an absent package.${colors.reset}`);
    return 2;
  }

  console.log(`${colors.dim}every schemaVersion TEA writes is the one eval-quality ${evalQuality.VERSION} reads${colors.reset}\n`);

  // The independent reading. Everything below is held to `expected`, which is
  // read from the package here and nowhere else in this file.
  const expected = {};
  for (const [kind, name] of Object.entries(CONSTANT_OF)) {
    const value = evalQuality[name];
    if (Number.isInteger(value) && value > 0) {
      expected[kind] = value;
      held(`eval-quality exports ${name} = ${value} for ${kind}`);
    } else {
      problem(`eval-quality exports no positive integer ${name} for ${kind}; read ${JSON.stringify(value)}`);
    }
  }
  if (problems.length > 0) return finish('a constant this check reads is missing, so nothing else was compared');

  const inputs = require('./lib/eval-quality-inputs');
  const { SCHEMA_VERSIONS, expectedSchemaVersion, schemaVersionProblems } = inputs;

  // The table, held to the independent reading: exactly the kinds TEA writes,
  // and the package's number for each.
  const tableKinds = Object.keys(SCHEMA_VERSIONS).sort();
  const expectedKinds = Object.keys(CONSTANT_OF).sort();
  hold(
    JSON.stringify(tableKinds) === JSON.stringify(expectedKinds),
    `SCHEMA_VERSIONS covers exactly the ${expectedKinds.length} kinds TEA writes`,
    `SCHEMA_VERSIONS covers ${tableKinds.join(', ')}; TEA writes ${expectedKinds.join(', ')}`,
  );
  for (const kind of expectedKinds) {
    hold(
      SCHEMA_VERSIONS[kind] === expected[kind],
      `SCHEMA_VERSIONS reads ${expected[kind]} for ${kind}`,
      `SCHEMA_VERSIONS carries ${JSON.stringify(SCHEMA_VERSIONS[kind])} for ${kind} where this build reads ${expected[kind]}`,
    );
  }

  // The builders, each named. Only the stamp is read, so the arguments can be
  // empty: every builder fills every key and none validates its input.
  for (const [builder, kind] of [
    ['evaluatorConfiguration', 'evaluator-configuration'],
    ['isolationManifest', 'isolation-manifest'],
    ['sealedRunRecord', 'sealed-run-record'],
  ]) {
    const stamped = inputs[builder]({}).schemaVersion;
    hold(
      stamped === expected[kind],
      `${builder} in test/lib/eval-quality-inputs.js stamps ${kind} with ${expected[kind]}`,
      `${builder} in test/lib/eval-quality-inputs.js stamps ${kind} with ${JSON.stringify(stamped)} where this build reads ${expected[kind]}`,
    );
  }

  // The generators, each named. Their constants are the numbers that land in
  // committed bytes, so a generator reading a literal fails here before its
  // `--check` reports the bytes as changed.
  for (const [file, exportName, kind] of [
    ['tools/generate-probes.js', 'PROBE_SCHEMA_VERSION', 'probe'],
    ['tools/generate-contracts.js', 'EVAL_CONTRACT_SCHEMA_VERSION', 'eval-contract'],
  ]) {
    const exported = require(path.join(PROJECT_ROOT, file))[exportName];
    hold(
      exported === expected[kind],
      `${file} writes ${kind} with ${expected[kind]}`,
      `${file} exports ${exportName} = ${JSON.stringify(exported)} where this build reads ${expected[kind]}`,
    );
  }

  // Every committed probe. A corpus file is a top-level array of probes, and a
  // file that is anything else is reported as such: a shape nothing walks holds
  // no stamp.
  const probeFiles = filesUnder(PROBE_ROOT, '.probes.json');
  hold(
    probeFiles.length > 0,
    `${probeFiles.length} probe corpus file(s) under test/probes`,
    `no *.probes.json under ${relative(PROBE_ROOT)}; the corpus this check holds is gone`,
  );
  for (const file of probeFiles) {
    const rel = relative(file);
    const probes = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(probes) || probes.length === 0) {
      problem(`${rel} is not a non-empty array of probes, so no stamp in it was held`);
      continue;
    }
    const found = probes.flatMap((probe, index) =>
      schemaVersionProblems('probe', probe).map((message) => `${rel} ${probe?.probeId ?? `[${index}]`}: ${message}`),
    );
    for (const message of found) problem(message);
    if (found.length === 0) held(`${rel}: ${probes.length} probe(s) carry schemaVersion ${expected.probe}`);
  }

  // Every committed contract.
  const contractFiles = filesUnder(CONTRACT_ROOT, '.contract.json');
  hold(
    contractFiles.length > 0,
    `${contractFiles.length} contract file(s) under test/contracts`,
    `no *.contract.json under ${relative(CONTRACT_ROOT)}; the contracts this check holds are gone`,
  );
  for (const file of contractFiles) {
    const rel = relative(file);
    const found = schemaVersionProblems('eval-contract', JSON.parse(fs.readFileSync(file, 'utf8')));
    for (const message of found) problem(`${rel}: ${message}`);
    if (found.length === 0) held(`${rel} carries schemaVersion ${expected['eval-contract']}`);
  }

  // The scoring policy, the one hand-authored stamp.
  {
    const rel = relative(POLICY_PATH);
    const found = schemaVersionProblems('scoring-policy', inputs.scoringPolicy());
    for (const message of found) problem(`${rel}: ${message}`);
    if (found.length === 0) held(`${rel} carries schemaVersion ${expected['scoring-policy']}`);
  }

  // The source scan. A literal that agrees with the package today is invisible
  // to every value comparison above, and it is exactly the literal that drifts
  // on the next bump, so the places TEA stamps from are read for one. Comment
  // lines are skipped the way the clock-port scan skips them; a number in prose
  // stamps nothing.
  const literalStamp = /schemaVersion['"]?\s*:\s*\d|\w*SCHEMA_VERSION\w*\s*=\s*\d/;
  const scannedFiles = SCANNED_ROOTS.flatMap((root) => filesUnder(path.join(PROJECT_ROOT, root), '.js'));
  const literals = scannedFiles.flatMap((file) => literalStampsIn(file, literalStamp));
  for (const message of literals) problem(message);
  if (literals.length === 0) held(`no literal schemaVersion under ${SCANNED_ROOTS.join(' or ')} (${scannedFiles.length} files scanned)`);

  // The exemption, held to the schema the package publishes. The day the package
  // gives `artifact-reference` a stamp, TEA's reason for asking it for none is
  // stale, and this says so.
  const referenceSchema = path.join(SCHEMA_ROOT, `${UNSTAMPED_KIND}.schema.json`);
  hold(
    fs.existsSync(referenceSchema) && !declaresSchemaVersion(JSON.parse(fs.readFileSync(referenceSchema, 'utf8'))),
    `${UNSTAMPED_KIND}.schema.json declares no schemaVersion, so the exemption stands`,
    `${UNSTAMPED_KIND}.schema.json ${fs.existsSync(referenceSchema) ? 'now declares a schemaVersion property' : 'is not published'}; the exemption in test/lib/eval-quality-inputs.js is stale`,
  );

  // The helpers' other paths, driven here so the mismatch message is seen
  // before a live bump ever produces one.
  const kind = 'sealed-run-record';
  const agree = schemaVersionProblems(kind, { schemaVersion: expected[kind] });
  hold(
    agree.length === 0,
    `schemaVersionProblems reports nothing for a ${kind} stamped ${expected[kind]}`,
    `reported ${JSON.stringify(agree)} for a stamp that agrees`,
  );

  const wrong = expected[kind] + 1;
  const disagree = schemaVersionProblems(kind, { schemaVersion: wrong });
  hold(
    disagree.length === 1 &&
      disagree[0].includes(kind) &&
      disagree[0].includes(`"schemaVersion" ${wrong}`) &&
      disagree[0].includes(`reads ${expected[kind]}`),
    `schemaVersionProblems names ${kind}, found ${wrong} and expected ${expected[kind]} for a stamp that disagrees`,
    `reported ${JSON.stringify(disagree)} for ${kind} stamped ${wrong} against ${expected[kind]}`,
  );

  const absent = schemaVersionProblems(kind, {});
  hold(
    absent.length === 1 &&
      absent[0].includes(kind) &&
      absent[0].includes('no "schemaVersion"') &&
      absent[0].includes(`reads ${expected[kind]}`),
    `schemaVersionProblems names ${kind} and reports no stamp for an artifact without one`,
    `reported ${JSON.stringify(absent)} for ${kind} with no stamp`,
  );

  const exempt = thrownBy(() => expectedSchemaVersion(UNSTAMPED_KIND));
  hold(
    exempt !== null && exempt.includes(UNSTAMPED_KIND) && exempt.includes('by design'),
    `expectedSchemaVersion throws for ${UNSTAMPED_KIND}, naming the kind and the reason it carries no stamp`,
    exempt === null
      ? `expectedSchemaVersion returned for ${UNSTAMPED_KIND}, which carries no stamp by design`
      : `threw "${exempt}", which does not name the kind and the reason`,
  );

  const unknown = thrownBy(() => expectedSchemaVersion('no-such-kind'));
  hold(
    unknown !== null && unknown.includes('no-such-kind'),
    'expectedSchemaVersion throws for a kind TEA does not write, naming it',
    unknown === null ? 'expectedSchemaVersion returned for no-such-kind' : `threw "${unknown}", which does not name no-such-kind`,
  );

  const unknownProblems = thrownBy(() => schemaVersionProblems('no-such-kind', {}));
  hold(
    unknownProblems !== null && unknownProblems.includes('no-such-kind'),
    'schemaVersionProblems throws for a kind TEA does not write, since that is a caller bug',
    unknownProblems === null
      ? 'schemaVersionProblems returned for no-such-kind; a kind TEA does not write is a caller bug and has to throw'
      : `threw "${unknownProblems}", which does not name no-such-kind`,
  );

  return finish();
}

function finish(stoppedEarly) {
  if (stoppedEarly) console.error(`\n${colors.red}${stoppedEarly}${colors.reset}`);
  if (problems.length > 0) {
    console.error(`\n${colors.red}${problems.length} problem(s) with the schemaVersions TEA writes:${colors.reset}`);
    for (const message of problems) console.error(`  - ${message}`);
    console.error(
      `\n${colors.dim}Every version TEA writes is read from the constant eval-quality exports. Regenerate committed artifacts with node tools/generate-probes.js and node tools/generate-contracts.js, and re-author test/probes/scoring-policy.json by hand.${colors.reset}`,
    );
  }
  console.log(`\n${problems.length === 0 ? colors.green : colors.red}${heldCount} held, ${problems.length} problem(s)${colors.reset}\n`);
  return problems.length === 0 ? 0 : 1;
}

process.exit(main());
