/**
 * TEA's branches over `eval-quality`'s port vocabularies are total, held against
 * the vocabularies the installed package declares.
 *
 * Three closed sets decide how a consumer reads this package: `ProbeRequest`
 * and `ProbeObservation` are unions tagged by `kind`, and the conformance
 * surface publishes one arm per port. TEA writes `kind: 'cli'` everywhere and
 * reads `exitCode`, `stdout` and `artifacts`, which are the `cli` member's
 * fields, so a member TEA does not handle reads as a run that exited nowhere
 * rather than as a port answering in a shape TEA never authorized.
 *
 * TEA is CommonJS consuming an ESM package and runs no typechecker, so no
 * compiler will notice the day a fourth member arrives. Review will not notice
 * either: the whole failure mode is code that keeps working on the members it
 * knows. This check is the assertion, executed against the package's own
 * exported parsers and registry rather than against a list transcribed from
 * them.
 *
 * WHAT IT HOLDS
 *
 * - Every member of `ProbeRequest` and `ProbeObservation` is either one TEA
 *   handles or one TEA declines, with the reason recorded here. A member in
 *   neither fails, naming it.
 * - A declined member raises a named error rather than returning a default. The
 *   narrowing function is called with one and the throw is observed, so the
 *   guarantee is executed rather than described.
 * - Every request TEA builds and every observation TEA mints carries a `kind`
 *   TEA handles, and parses against the package's own parser for it.
 * - Every conformance arm `CONFORMANCE_OUTCOME_COUNTS` names is either run by a
 *   TEA check that reads its expected count from that registry, or recorded
 *   here as not yet run, with the reason. An arm in neither fails, naming it.
 *
 * Usage: node test/test-port-totality.js
 *
 * Exit codes:
 *   0  every vocabulary is covered
 *   1  a member or an arm is handled by nothing and declined by nothing
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { probeObservation } = require('./lib/eval-quality-inputs');
const { cliObservation, probeRequest } = require('./lib/probe-targets');

const { expectedOutcomeCount } = require('./lib/conformance-counts');

const PROJECT_ROOT = path.join(__dirname, '..');

const colors = {
  reset: '[0m',
  red: '[31m',
  green: '[32m',
  dim: '[2m',
};

/**
 * The one member TEA handles, and why the other two are declined.
 *
 * Every contract under `test/contracts/` declares the `cli` interface kind, and
 * `test/test-probe-targets.js` asserts that for each of them, so the other two
 * members describe a system under test TEA does not measure. Declining is not
 * deferral: adopting one would mean TEA had a contract naming an HTTP service or
 * a tool server, and it has none.
 */
const PROBE_KINDS = {
  cli: { handled: true, reason: 'every TEA contract declares the cli interface kind, and TEA reads this member' },
  api: { handled: false, reason: 'TEA measures no system under test that speaks HTTP' },
  mcp: { handled: false, reason: 'TEA measures no tool server; its commands are spawned processes' },
};

/**
 * Which TEA check runs each published conformance arm.
 *
 * `file` is the check that runs it. `reason` is why an arm has no check yet, and
 * every one of those is adoption work TEA has planned rather than a capability
 * it declines: the arms were already available on the release TEA ran before
 * this upgrade, so nothing about them waits on a package change.
 */
const CONFORMANCE_ARMS = {
  'command-probe': { file: 'test/test-probe-conformance.js' },
  // Not deferral. This is the `api` arm, over HTTP: the package names the three
  // arms `api`, `cli` and `mcp` in dist/testing/probe-conformance.d.ts, its
  // subject wants denied address classes, a method, a scheme and a redirect
  // chain, and eval-quality ships no HTTP adapter to run it against. TEA
  // authorizes no HTTP target, so the arm has no subject, the same way
  // `mcp-probe` below has none. FR21 is withdrawn in the requirements inventory
  // with the evidence.
  'environment-probe': { reason: 'TEA authorizes no HTTP target, so the api arm has no subject to run against' },
  corpus: { reason: 'TEA digests its corpora by hand and has not moved to the shipped corpus adapter' },
  clock: { reason: 'TEA measures elapsed time by hand and has not moved to the shipped clock adapter' },
  'file-system': { reason: 'TEA reads and writes files directly and has not moved to the shipped file-system adapter' },
  'mcp-probe': { reason: 'TEA authorizes no tool server, so this arm has no subject to run against' },
};

/**
 * The tagged members of one published union parser, read off the parser itself.
 *
 * Every option has to decode. An option whose `kind` tag this cannot read is
 * thrown on rather than skipped, because skipping it is the exact failure this
 * file exists to prevent: a member added upstream in a shape this extraction
 * does not understand would otherwise read as no new member at all, and the
 * check would pass while TEA handled none of it.
 *
 * The extraction reaches into the parser's internals because the package
 * publishes the parsers and no member registry beside them. That gap is
 * recorded upstream rather than papered over here, and until it closes the
 * throw below is what keeps this check honest: a parser shape this cannot read
 * fails loudly instead of answering with a shorter list.
 */
function unionMembers(parser) {
  const options = parser?._def?.options ?? parser?.def?.options;
  if (!Array.isArray(options)) throw new Error('the published parser is not a union, so its members cannot be read');
  const members = options.map((option) => {
    const shape = option.shape ?? option._def?.shape?.() ?? option.def?.shape;
    const literal = shape?.kind?._def?.values ?? shape?.kind?.def?.values ?? [shape?.kind?.value];
    return literal?.[0];
  });
  const undecodable = members.map((member, index) => (typeof member === 'string' ? null : index)).filter((index) => index !== null);
  if (undecodable.length > 0) {
    throw new Error(
      `${undecodable.length} of ${options.length} union option(s) carry a kind tag this check cannot read, at index ${undecodable.join(', ')}; ` +
        'a member read as nothing is a member TEA handles by accident, so this fails rather than reporting a shorter list',
    );
  }
  return [...members].sort();
}

let failures = 0;

function assert(condition, label, detail = '') {
  if (condition) {
    console.log(`${colors.green}✓${colors.reset} ${label}`);
    return;
  }
  failures += 1;
  console.log(`${colors.red}✗ ${label}${colors.reset}`);
  if (detail) console.log(`  ${colors.dim}${detail}${colors.reset}`);
}

/** Every member of one union is handled or declined, and a declined one throws by name. */
function checkUnion(name, members) {
  for (const member of members) {
    const entry = PROBE_KINDS[member];
    assert(
      entry !== undefined,
      `${name}'s "${member}" member is handled or declined`,
      `the package declares a member this check has no entry for; handle it in test/lib/probe-targets.js or decline it here with the reason`,
    );
    // The reason is the value of the ledger. An entry carrying none records
    // that somebody noticed the member, which is not the same as deciding it.
    if (entry === undefined) continue;
    assert(
      typeof entry.reason === 'string' && entry.reason.length > 0,
      `${name}'s "${member}" member records why`,
      'an entry with no reason is a member nobody decided about',
    );
  }
  for (const declared of Object.keys(PROBE_KINDS)) {
    assert(
      members.includes(declared),
      `${name} still declares the "${declared}" member this repository has an entry for`,
      'a member the package removed leaves a stale entry, which reads as coverage of something that no longer exists',
    );
  }
}

async function main() {
  let probeParsers;
  let CONFORMANCE_OUTCOME_COUNTS;
  try {
    ({ probeParsers, CONFORMANCE_OUTCOME_COUNTS } = await import('eval-quality/conformance'));
  } catch (error) {
    // Exit 2, the class every sibling check uses: a package that cannot be
    // imported measured nothing, and reporting that as "TEA's branches are not
    // total" files an environment fault as a quality failure.
    console.error(`${colors.red}eval-quality/conformance could not be imported: ${error.message}${colors.reset}`);
    console.error(`${colors.dim}Run npm ci. Nothing about TEA's branches was measured.${colors.reset}`);
    return 2;
  }

  const requestMembers = unionMembers(probeParsers.request);
  const observationMembers = unionMembers(probeParsers.response);

  console.log('ProbeRequest and ProbeObservation are covered member by member');
  assert(
    requestMembers.length === 3 && observationMembers.length === 3,
    'both unions carry the three members TEA is written against',
    `request ${JSON.stringify(requestMembers)}, observation ${JSON.stringify(observationMembers)}`,
  );
  checkUnion('ProbeRequest', requestMembers);
  checkUnion('ProbeObservation', observationMembers);

  console.log('\na member TEA declines raises a named error');
  for (const [member, entry] of Object.entries(PROBE_KINDS)) {
    if (entry.handled) continue;
    let thrown;
    try {
      cliObservation({ kind: member, probeId: 'totality', interfaceId: 'tea-test-review', operationId: 'review-test-files' });
    } catch (error) {
      thrown = error;
    }
    assert(
      thrown !== undefined && thrown.message.includes(member),
      `a "${member}" observation throws an error naming the member`,
      thrown === undefined ? 'the narrowing returned a value' : thrown.message,
    );
  }
  const handled = Object.entries(PROBE_KINDS).find(([, entry]) => entry.handled)?.[0];
  assert(
    cliObservation({ kind: handled }).kind === handled,
    `a "${handled}" observation passes the narrowing unchanged`,
    'the member TEA handles must survive the check that refuses the others',
  );

  console.log('\nevery request TEA builds is a member TEA handles');
  const built = probeRequest({ probeId: 'totality', interfaceId: 'tea-test-review', operationId: 'review-test-files' });
  assert(PROBE_KINDS[built.kind]?.handled === true, `probeRequest builds the "${built.kind}" member`, JSON.stringify(built.kind));
  const parsed = probeParsers.request.safeParse({ ...built, executable: 'tea-test-review' });
  assert(
    parsed.success,
    'the request TEA builds parses against the published ProbeRequest parser',
    JSON.stringify(parsed.error?.issues ?? []),
  );

  // The observation half. `probeObservation` hand-mints the shape
  // `preflightFromObservations` reduces over, for a caller that probed by some
  // other means, so nothing else in this repository holds it against the
  // package's own parser.
  const minted = probeObservation({
    legId: 'totality',
    interfaceId: 'tea-test-review',
    operationId: 'review-test-files',
    exitCode: 0,
    stdout: { kind: 'text', value: '' },
  });
  assert(PROBE_KINDS[minted.kind]?.handled === true, `probeObservation mints the "${minted.kind}" member`, JSON.stringify(minted.kind));
  const parsedObservation = probeParsers.response.safeParse(minted);
  assert(
    parsedObservation.success,
    'the observation TEA mints parses against the published ProbeObservation parser',
    JSON.stringify(parsedObservation.error?.issues ?? []),
  );

  console.log('\nevery published conformance arm is run or recorded as not run');
  const arms = Object.keys(CONFORMANCE_OUTCOME_COUNTS).sort();
  for (const arm of arms) {
    const entry = CONFORMANCE_ARMS[arm];
    assert(
      entry !== undefined,
      `the "${arm}" arm is run or recorded`,
      'the package publishes an arm this repository says nothing about; run it, or record here why it is not run',
    );
    if (entry === undefined) continue;
    assert(
      typeof entry.file === 'string' || (typeof entry.reason === 'string' && entry.reason.length > 0),
      `the "${arm}" arm names the check that runs it or records why none does`,
      'an entry that is neither is an arm nobody decided about',
    );
    if (entry.file === undefined) continue;
    // Live source only. A commented-out read would otherwise satisfy this while
    // the count beside it was a transcribed literal.
    //
    // Two shapes count, and both read the package rather than a literal. The
    // subscript is the direct one. The accessor in test/lib/conformance-counts.js
    // is the one every arm should use, because it is what turns an arm the
    // package stopped publishing into a failure naming that arm; it takes the
    // registry and the arm name, so the arm is still on the line and this check
    // still reads as the arm's own.
    const quoted = String.raw`['"` + '`' + String.raw`]${arm}['"` + '`' + String.raw`]`;
    const readsCount = new RegExp(String.raw`CONFORMANCE_OUTCOME_COUNTS\[` + quoted + String.raw`\]`);
    const readsThroughAccessor = new RegExp(String.raw`expectedOutcomeCount\(\s*CONFORMANCE_OUTCOME_COUNTS\s*,\s*` + quoted);
    const reads = fs
      .readFileSync(path.join(PROJECT_ROOT, entry.file), 'utf8')
      .split('\n')
      .filter((line) => !/^\s*(?:\/\/|\*|\/\*)/.test(line))
      .some((line) => readsCount.test(line) || readsThroughAccessor.test(line));
    assert(
      reads,
      `${entry.file} reads the "${arm}" expected count from the package`,
      'an arm whose expected count is transcribed rather than read drifts the first time the package adds an assertion',
    );
  }
  // The accessor's own failure path, driven rather than described. A gate nobody
  // has seen fire is a gate nobody has tested, and this one exists precisely for
  // the day the package stops publishing an arm TEA runs, which is a day nobody
  // will be looking for it.
  const absent = 'no-such-arm';
  let named = null;
  try {
    expectedOutcomeCount(CONFORMANCE_OUTCOME_COUNTS, absent);
  } catch (error) {
    named = error.message;
  }
  assert(
    named !== null && named.includes(`"${absent}"`) && arms.every((arm) => named.includes(arm)),
    'a conformance count the package does not publish fails with the arm named and the published arms listed',
    named === null ? 'it returned instead of throwing' : named,
  );
  for (const arm of arms) {
    assert(
      expectedOutcomeCount(CONFORMANCE_OUTCOME_COUNTS, arm) === CONFORMANCE_OUTCOME_COUNTS[arm],
      `the accessor returns the published count for the "${arm}" arm`,
      String(CONFORMANCE_OUTCOME_COUNTS[arm]),
    );
  }

  for (const declared of Object.keys(CONFORMANCE_ARMS)) {
    assert(
      arms.includes(declared),
      `the package still publishes the "${declared}" arm this repository has an entry for`,
      'an arm the package removed leaves a stale entry here',
    );
  }

  if (failures > 0) {
    console.error(`\n${colors.red}${failures} totality check(s) failed.${colors.reset}`);
    return 1;
  }
  console.log(
    `\n${colors.green}every member of both probe unions and all ${arms.length} published conformance arm(s) are accounted for.${colors.reset}`,
  );
  return 0;
}

if (require.main === module) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(`${colors.red}${error?.stack ?? error}${colors.reset}`);
      process.exit(1);
    },
  );
}

module.exports = { CONFORMANCE_ARMS, PROBE_KINDS, unionMembers };
